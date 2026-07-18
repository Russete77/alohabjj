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

CACHE_READ_FACTOR = 0.10    # cache-hit ≈ 10% do input
CACHE_WRITE_FACTOR = 1.25   # gravar no cache ≈ 125% do input (TTL 5min)

# Erros transitórios da API que valem re-tentar com backoff exponencial.
# 529 = Overloaded (visto no teste ao vivo no web_search do Pesquisador).
RETRY_STATUS = {408, 409, 429, 500, 502, 503, 529}
RETRY_MAX = 5
RETRY_BASE_S = 2.0


class SpendCapExceeded(RuntimeError):
    pass


def _cost(model: Model, in_tok: int, out_tok: int,
          cache_read_tok: int = 0, cache_write_tok: int = 0) -> float:
    # input_tokens já é o NÃO-cacheado; cache_read/cache_write são separados (skill claude-api).
    dollars = (
        in_tok / 1e6 * model.in_per_mtok
        + cache_read_tok / 1e6 * model.in_per_mtok * CACHE_READ_FACTOR
        + cache_write_tok / 1e6 * model.in_per_mtok * CACHE_WRITE_FACTOR
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

    def _retry(self, fn, *, step: str, key: str, model: Model):
        """Executa fn() com backoff exponencial em erros transitórios (529 etc.)."""
        for attempt in range(RETRY_MAX + 1):
            try:
                return fn()
            except (anthropic.APIStatusError, anthropic.APIConnectionError) as e:
                code = getattr(e, "status_code", None)
                transient = code in RETRY_STATUS or isinstance(e, anthropic.APIConnectionError)
                if not (transient and attempt < RETRY_MAX):
                    raise
                wait = min(RETRY_BASE_S * (2 ** attempt), 60.0)
                self.log.record(step, "retry", key=key, model=model.id,
                                error=f"{code or 'conn'} — tentativa {attempt + 1}/{RETRY_MAX}, +{wait:.0f}s")
                time.sleep(wait)

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
        image: str | None = None,
        cache: str | None = None,
    ) -> tuple[str, dict]:
        """
        Uma chamada ao modelo. Retorna (texto, usage_dict).
        Se json_schema for dado, força saída JSON válida (output_config.format).
        Se image (caminho) for dado, envia a imagem junto (visão) — o modelo "olha".
        Se cache for dado, ele vira um bloco ESTÁVEL cacheado no INÍCIO do prompt do
        usuário (catálogo/voz que se repetem a cada peça) → leitura ≈ 10% do input nas
        próximas chamadas do run. O `user` (dossiê variável) fica FORA do cache.
        Loga custo em jobs/; respeita o spend cap ANTES de gastar.
        """
        spent = self.log.total_cost()
        if spent >= self.spend_cap:
            raise SpendCapExceeded(
                f"spend cap atingido: ${spent:.4f} >= ${self.spend_cap:.2f} (run {self.log.run_id})"
            )

        # prefixo estável (catálogo/voz) → bloco cacheável; dossiê variável fica fora.
        blocks: list = []
        if cache:
            blocks.append({"type": "text", "text": cache,
                           "cache_control": {"type": "ephemeral"}})
        if image is not None:
            import base64
            p = Path(image)
            mt = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
                  "webp": "image/webp", "gif": "image/gif"}.get(p.suffix.lower().lstrip("."), "image/jpeg")
            b64 = base64.b64encode(p.read_bytes()).decode()
            blocks.append({"type": "image", "source": {"type": "base64", "media_type": mt, "data": b64}})
        blocks.append({"type": "text", "text": user})
        content: list | str = blocks if (cache or image) else user

        # system (prompt do agente, estável no run) também entra no prefixo cacheado
        params: dict = {
            "model": model.id,
            "max_tokens": max_tokens,
            "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            "messages": [{"role": "user", "content": content}],
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

        def _do():
            # streaming só quando max_tokens é grande (evita timeout HTTP do SDK)
            if max_tokens > 16000:
                with self.client.messages.stream(**params) as stream:
                    return stream.get_final_message()
            return self.client.messages.create(**params)

        try:
            msg = self._retry(_do, step=step, key=key, model=model)
        except anthropic.APIStatusError as e:
            self.log.record(step, "errored", key=key, model=model.id,
                            t0=t0, t1=time.time(), error=f"{e.status_code}: {e.message}")
            raise

        if msg.stop_reason == "refusal":
            self.log.record(step, "refused", key=key, model=model.id, t0=t0, t1=time.time())
            raise RuntimeError(f"recusa do modelo em {key}")

        text = next((b.text for b in msg.content if b.type == "text"), "")
        # Guard: com thinking ligado, um max_tokens curto pode ser TODO consumido pelo
        # raciocínio, deixando o bloco de texto vazio. Falha claro (não um 'char 0' lá na frente).
        if json_schema is not None and not text.strip():
            self.log.record(step, "errored", key=key, model=model.id, t0=t0, t1=time.time(),
                            error=f"saída JSON vazia (stop_reason={msg.stop_reason}); "
                                  f"thinking provavelmente consumiu max_tokens={max_tokens}")
            raise RuntimeError(
                f"{step}/{key}: saída JSON vazia (stop_reason={msg.stop_reason}). "
                f"Aumente max_tokens ou baixe effort.")
        u = msg.usage
        cache_read = getattr(u, "cache_read_input_tokens", 0) or 0
        cache_write = getattr(u, "cache_creation_input_tokens", 0) or 0
        cost = _cost(model, u.input_tokens, u.output_tokens, cache_read, cache_write)
        self.log.record(step, "succeeded", key=key, model=model.id,
                        in_tok=u.input_tokens, out_tok=u.output_tokens,
                        cost_est=cost, t0=t0, t1=time.time())
        return text, {"in_tok": u.input_tokens, "out_tok": u.output_tokens, "cost": cost}

    def research(self, *, model: Model, system: str, user: str, step: str, key: str,
                 max_uses: int = 4, max_tokens: int = 6000, effort: str = "low") -> tuple[str, dict]:
        """
        Chamada com WebSearch server-side (Pesquisador, §5). Só fontes da web abertas;
        o loop de busca roda no servidor. Trata pause_turn reenviando o histórico.
        `effort` baixo por padrão: buscar na web é COLETAR, não precisa de raciocínio
        profundo — foi o que estava caro (effort high em web_search).
        """
        if self.log.total_cost() >= self.spend_cap:
            raise SpendCapExceeded(f"spend cap atingido no run {self.log.run_id}")
        tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": max_uses}]
        sys_blocks = [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
        messages: list = [{"role": "user", "content": user}]
        t0 = time.time()
        self.log.record(step, "running", key=key, model=model.id, t0=t0)  # ao vivo (ponte)
        in_tok = out_tok = c_read = c_write = 0
        extra = {"thinking": {"type": "adaptive"}, "output_config": {"effort": effort}} if model.adaptive else {}
        for _ in range(6):  # limite de retomadas de pause_turn
            msg = self._retry(
                lambda: self.client.messages.create(
                    model=model.id, max_tokens=max_tokens, system=sys_blocks,
                    messages=messages, tools=tools, **extra,
                ),
                step=step, key=key, model=model)
            in_tok += msg.usage.input_tokens
            out_tok += msg.usage.output_tokens
            c_read += getattr(msg.usage, "cache_read_input_tokens", 0) or 0
            c_write += getattr(msg.usage, "cache_creation_input_tokens", 0) or 0
            if msg.stop_reason == "pause_turn":
                messages = [{"role": "user", "content": user},
                            {"role": "assistant", "content": msg.content}]
                continue
            break
        text = "".join(b.text for b in msg.content if b.type == "text")
        cost = _cost(model, in_tok, out_tok, c_read, c_write)
        self.log.record(step, "succeeded", key=key, model=model.id,
                        in_tok=in_tok, out_tok=out_tok, cost_est=cost, t0=t0, t1=time.time())
        return text, {"in_tok": in_tok, "out_tok": out_tok, "cost": cost}
