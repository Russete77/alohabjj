"""
lib/claude.py — Cliente Anthropic com roteamento de modelo, spend cap e custo.

Guardrails de produção (PRD §4, §16, §17):
- Roteamento Haiku/Sonnet/Opus por constante (IDs e preços verificados via skill claude-api).
- Spend cap: aborta se o custo acumulado do run passar SPEND_CAP_USD.
- Custo por chamada calculado e logado em jobs/ (§9.3).

Regras da API (Opus 4.8 / Sonnet 5 — família 4.8):
- adaptive thinking; NÃO enviar budget_tokens nem temperature/top_p/top_k (dão 400).
- profundidade controlada por output_config.effort (low|medium|high|xhigh|max).
- saída estruturada via output_config.format (json_schema).
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path

import anthropic
from dotenv import load_dotenv

from lib.jobs import JobLog

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


@dataclass(frozen=True)
class Model:
    id: str
    in_per_mtok: float   # USD / 1M tokens de input (padrão, sem batch)
    out_per_mtok: float  # USD / 1M tokens de output
    adaptive: bool = True  # suporta adaptive thinking + output_config.effort?


# Roteamento (§4 e §10 do PRD). IDs e preços conferidos com a skill claude-api.
# Haiku 4.5 NÃO suporta adaptive thinking nem effort (dá 400) — por isso adaptive=False.
HAIKU = Model("claude-haiku-4-5", 1.00, 5.00, adaptive=False)  # relevância/dedupe/quality gate
SONNET = Model("claude-sonnet-5", 3.00, 15.00)    # geração (intro $2/$10 até 31/ago/26)
OPUS = Model("claude-opus-4-8", 5.00, 25.00)      # Analista / síntese de dossiê

CACHE_READ_FACTOR = 0.10   # cache-hit ≈ 10% do input


class SpendCapExceeded(RuntimeError):
    pass


def _cost(model: Model, in_tok: int, out_tok: int, cache_read_tok: int = 0) -> float:
    billed_in = max(in_tok - cache_read_tok, 0)
    dollars = (
        billed_in / 1e6 * model.in_per_mtok
        + cache_read_tok / 1e6 * model.in_per_mtok * CACHE_READ_FACTOR
        + out_tok / 1e6 * model.out_per_mtok
    )
    return round(dollars, 6)


class Claude:
    """Wrapper fino do SDK Anthropic com custo/spend cap por run."""

    def __init__(self, log: JobLog | None = None, spend_cap_usd: float | None = None):
        if not os.getenv("ANTHROPIC_API_KEY"):
            raise RuntimeError(
                "ANTHROPIC_API_KEY ausente. Preencha o .env antes de rodar etapas pagas."
            )
        self.client = anthropic.Anthropic()  # lê ANTHROPIC_API_KEY do ambiente
        self.log = log or JobLog(prefix="claude")
        self.spend_cap = spend_cap_usd if spend_cap_usd is not None else float(
            os.getenv("SPEND_CAP_USD", "10")
        )

    def call(
        self,
        *,
        model: Model,
        system: str,
        user: str,
        step: str,
        key: str,
        max_tokens: int = 8000,
        effort: str = "high",
        json_schema: dict | None = None,
    ) -> tuple[str, dict]:
        """
        Uma chamada ao modelo. Retorna (texto, usage_dict).
        Se json_schema for dado, força saída JSON válida (output_config.format).
        Loga custo em jobs/; respeita o spend cap ANTES de gastar.
        """
        spent = self.log.total_cost()
        if spent >= self.spend_cap:
            raise SpendCapExceeded(
                f"spend cap atingido: ${spent:.4f} >= ${self.spend_cap:.2f} (run {self.log.run_id})"
            )

        params: dict = {
            "model": model.id,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }
        oc: dict = {}
        if model.adaptive:  # Opus/Sonnet suportam; Haiku 4.5 não (daria 400)
            params["thinking"] = {"type": "adaptive"}
            oc["effort"] = effort
        if json_schema is not None:
            oc["format"] = {"type": "json_schema", "schema": json_schema}
        if oc:
            params["output_config"] = oc

        t0 = time.time()
        self.log.record(step, "running", key=key, model=model.id, t0=t0)  # ao vivo (ponte)
        try:
            # streaming só quando max_tokens é grande (evita timeout HTTP do SDK)
            if max_tokens > 16000:
                with self.client.messages.stream(**params) as stream:
                    msg = stream.get_final_message()
            else:
                msg = self.client.messages.create(**params)
        except anthropic.APIStatusError as e:
            self.log.record(step, "errored", key=key, model=model.id,
                            t0=t0, t1=time.time(), error=f"{e.status_code}: {e.message}")
            raise

        if msg.stop_reason == "refusal":
            self.log.record(step, "refused", key=key, model=model.id, t0=t0, t1=time.time())
            raise RuntimeError(f"recusa do modelo em {key}")

        text = next((b.text for b in msg.content if b.type == "text"), "")
        u = msg.usage
        cache_read = getattr(u, "cache_read_input_tokens", 0) or 0
        cost = _cost(model, u.input_tokens, u.output_tokens, cache_read)
        self.log.record(step, "succeeded", key=key, model=model.id,
                        in_tok=u.input_tokens, out_tok=u.output_tokens,
                        cost_est=cost, t0=t0, t1=time.time())
        return text, {"in_tok": u.input_tokens, "out_tok": u.output_tokens, "cost": cost}

    def research(self, *, model: Model, system: str, user: str, step: str, key: str,
                 max_uses: int = 5, max_tokens: int = 8000) -> tuple[str, dict]:
        """
        Chamada com WebSearch server-side (Pesquisador, §5). Só fontes da web abertas;
        o loop de busca roda no servidor. Trata pause_turn reenviando o histórico.
        """
        if self.log.total_cost() >= self.spend_cap:
            raise SpendCapExceeded(f"spend cap atingido no run {self.log.run_id}")
        tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": max_uses}]
        messages: list = [{"role": "user", "content": user}]
        t0 = time.time()
        self.log.record(step, "running", key=key, model=model.id, t0=t0)  # ao vivo (ponte)
        in_tok = out_tok = 0
        extra = {"thinking": {"type": "adaptive"}, "output_config": {"effort": "high"}} if model.adaptive else {}
        for _ in range(6):  # limite de retomadas de pause_turn
            msg = self.client.messages.create(
                model=model.id, max_tokens=max_tokens, system=system,
                messages=messages, tools=tools, **extra,
            )
            in_tok += msg.usage.input_tokens
            out_tok += msg.usage.output_tokens
            if msg.stop_reason == "pause_turn":
                messages = [{"role": "user", "content": user},
                            {"role": "assistant", "content": msg.content}]
                continue
            break
        text = "".join(b.text for b in msg.content if b.type == "text")
        cost = _cost(model, in_tok, out_tok)
        self.log.record(step, "succeeded", key=key, model=model.id,
                        in_tok=in_tok, out_tok=out_tok, cost_est=cost, t0=t0, t1=time.time())
        return text, {"in_tok": in_tok, "out_tok": out_tok, "cost": cost}
