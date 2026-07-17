"""
lib/imagegen.py — Geração de imagem COMPLEXA (arte/hero) com fallback de provedor.

Regra de divisão (decidida com o usuário):
- Slides padrão do carrossel = render HTML/CSS -> PNG (Playwright), feito por código
  com os tokens da marca. Consistente, barato, on-brand. NÃO passa por aqui.
- Imagem complexa (arte atmosférica, hero elaborado) = este módulo, via IA externa.

Interface única + "quem estiver disponível faz": escolhe o primeiro provedor com
chave configurada, na ordem de IMAGE_PROVIDER_ORDER (default: gemini, openai).

Compliance (§11/§22 do PRD): gerar ARTE/fundo, nunca "foto" de atleta real
(likeness). Prompts devem evitar rosto/pessoa identificável; foto de atleta = asset
próprio/licenciado.

Custo/log por chamada em jobs/ (§9.3). Requer a chave do provedor escolhido.
"""
from __future__ import annotations

import base64
import os
import time
from pathlib import Path

from dotenv import load_dotenv

from lib.jobs import JobLog

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def _data_uri(path: str | Path) -> str:
    p = Path(path)
    mt = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp"}.get(
        p.suffix.lower().lstrip("."), "image/jpeg")
    return f"data:{mt};base64," + base64.b64encode(p.read_bytes()).decode()


class ImageProvider:
    name: str = "base"

    def available(self) -> bool:
        raise NotImplementedError

    def generate(self, prompt: str, ratio: str, references: list[str] | None = None) -> bytes:
        """Retorna os bytes da imagem. `references` = fotos (caminhos/URLs) pra preservar
        a semelhança do protagonista (recontextualização likeness-preserving)."""
        raise NotImplementedError


class GeminiImageProvider(ImageProvider):
    """Google Gemini / Imagen. SDK: google-genai (pip install google-genai)."""

    name = "gemini"
    # nano-banana = família de imagem do Gemini; confirmar id exato ao plugar a chave
    model = os.getenv("GEMINI_IMAGE_MODEL", "imagen-4.0-generate-001")

    def available(self) -> bool:
        return bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))

    def generate(self, prompt: str, ratio: str, references: list[str] | None = None) -> bytes:
        from google import genai  # lazy import
        from google.genai import types

        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
        model = os.getenv("GEMINI_IMAGE_MODEL", "gemini-3-pro-image")  # usa generateContent
        # generate_content unificado: com referência recontextualiza (preserva o sujeito),
        # sem referência é texto->imagem. (Modelos gemini-*-image usam generateContent, não predict.)
        contents: list = [prompt]
        for r in (references or []):
            if Path(r).exists():
                contents.append(types.Part.from_bytes(data=Path(r).read_bytes(), mime_type="image/jpeg"))
        try:
            cfg = types.GenerateContentConfig(response_modalities=["IMAGE"],
                                              image_config=types.ImageConfig(aspect_ratio=ratio))
        except Exception:  # noqa: BLE001 — SDK sem ImageConfig
            cfg = types.GenerateContentConfig(response_modalities=["IMAGE"])
        resp = client.models.generate_content(model=model, contents=contents, config=cfg)
        for part in resp.candidates[0].content.parts:
            if getattr(part, "inline_data", None) and part.inline_data.data:
                return part.inline_data.data
        raise RuntimeError("gemini: resposta sem imagem")


class OpenAIImageProvider(ImageProvider):
    """OpenAI gpt-image. SDK: openai (pip install openai)."""

    name = "openai"
    model = os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-1")
    # gpt-image usa tamanhos, não ratios; mapeia os mais comuns
    _sizes = {"3:4": "1024x1536", "4:5": "1024x1536", "1:1": "1024x1024", "16:9": "1536x1024"}

    def available(self) -> bool:
        return bool(os.getenv("OPENAI_API_KEY"))

    def generate(self, prompt: str, ratio: str, references: list[str] | None = None) -> bytes:
        from openai import OpenAI  # lazy import

        client = OpenAI()
        size = self._sizes.get(ratio, "1024x1536")
        if references:  # edição com referência: preserva o sujeito, recontextualiza
            imgs = [open(r, "rb") for r in references if Path(r).exists()]
            try:
                resp = client.images.edit(model=self.model, image=imgs, prompt=prompt, size=size, n=1)
            finally:
                for f in imgs:
                    f.close()
        else:
            resp = client.images.generate(model=self.model, prompt=prompt, size=size, n=1)
        return base64.b64decode(resp.data[0].b64_json)


class RunwayImageProvider(ImageProvider):
    """Runway (gen-4). SDK: runwayml (pip install runwayml). Hospeda também vídeo (short-form)."""

    name = "runway"
    model = os.getenv("RUNWAY_IMAGE_MODEL", "gen4_image")

    def available(self) -> bool:
        return bool(os.getenv("RUNWAYML_API_SECRET") or os.getenv("RUNWAY_API_KEY"))

    def generate(self, prompt: str, ratio: str, references: list[str] | None = None) -> bytes:
        import requests
        from runwayml import RunwayML  # lazy import

        client = RunwayML(api_key=os.getenv("RUNWAYML_API_SECRET") or os.getenv("RUNWAY_API_KEY"))
        # ratio -> proporção em pixels aceita pela gen-4
        px = {"3:4": "1080:1440", "4:5": "1080:1350", "1:1": "1024:1024", "16:9": "1920:1080"}
        kwargs: dict = {"model": self.model, "prompt_text": prompt, "ratio": px.get(ratio, "1080:1440")}
        if references:  # referências (data URIs) → preserva o sujeito e recontextualiza
            kwargs["reference_images"] = [
                {"uri": r if r.startswith(("http", "data:")) else _data_uri(r), "tag": f"ref{i}"}
                for i, r in enumerate(references)
            ]
        task = client.text_to_image.create(**kwargs).wait_for_task_output()
        return requests.get(task.output[0], timeout=60).content


PROVIDERS = {
    "gemini": GeminiImageProvider(),
    "openai": OpenAIImageProvider(),
    "runway": RunwayImageProvider(),
}

# Estimativa de custo por imagem (USD) — pro teto de gasto enxergar (P0-2 da auditoria).
# Ajuste fino conforme a fatura real do provedor.
COST_PER_IMAGE = {"gemini": 0.04, "openai": 0.04, "runway": 0.06}


def select_provider() -> ImageProvider | None:
    order = [p.strip() for p in os.getenv("IMAGE_PROVIDER_ORDER", "gemini,openai,runway").split(",")]
    for name in order:
        prov = PROVIDERS.get(name)
        if prov and prov.available():
            return prov
    return None


def generate_image(prompt: str, out_path: str | Path, *, ratio: str = "3:4",
                   references: list[str] | None = None,
                   log: JobLog | None = None, key: str = "img", step: str = "imagegen") -> Path:
    """
    Gera uma imagem complexa e salva em out_path. Escolhe o provedor disponível.
    `references` = fotos do protagonista (recontextualização likeness-preserving).
    Loga `cost_est` (estimativa por provedor) pro teto de gasto enxergar.
    Levanta RuntimeError se nenhum provedor tiver chave.
    """
    log = log or JobLog(prefix="imagegen")
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    errs: list[str] = []
    # tenta os provedores na ordem; se um falha (429/sem crédito), CAI pro próximo
    for name in [p.strip() for p in os.getenv("IMAGE_PROVIDER_ORDER", "gemini,openai,runway").split(",")]:
        prov = PROVIDERS.get(name)
        if not prov or not prov.available():
            continue
        t0 = time.time()
        try:
            data = prov.generate(prompt, ratio, references=references)
        except Exception as e:  # noqa: BLE001
            errs.append(f"{name}: {str(e)[:100]}")
            log.record(step, "errored", key=key, model=name, t0=t0, t1=time.time(), error=str(e)[:200])
            continue
        out.write_bytes(data)
        cost = COST_PER_IMAGE.get(name, 0.04)
        log.record(step, "succeeded", key=key, model=name, cost_est=cost, t0=t0, t1=time.time(),
                   note=f"bytes={len(data)} ratio={ratio}")
        return out
    raise RuntimeError("nenhum provedor gerou imagem — " + (" | ".join(errs) if errs else "sem chave/crédito"))


def which() -> str:
    prov = select_provider()
    return prov.name if prov else "nenhum (sem chave)"


if __name__ == "__main__":
    print(f"[imagegen] provedor disponível: {which()}")
