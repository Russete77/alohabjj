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


class ImageProvider:
    name: str = "base"

    def available(self) -> bool:
        raise NotImplementedError

    def generate(self, prompt: str, ratio: str) -> bytes:
        """Retorna os bytes PNG da imagem."""
        raise NotImplementedError


class GeminiImageProvider(ImageProvider):
    """Google Gemini / Imagen. SDK: google-genai (pip install google-genai)."""

    name = "gemini"
    # nano-banana = família de imagem do Gemini; confirmar id exato ao plugar a chave
    model = os.getenv("GEMINI_IMAGE_MODEL", "imagen-4.0-generate-001")

    def available(self) -> bool:
        return bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))

    def generate(self, prompt: str, ratio: str) -> bytes:
        from google import genai  # lazy import
        from google.genai import types

        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
        resp = client.models.generate_images(
            model=self.model,
            prompt=prompt,
            config=types.GenerateImagesConfig(number_of_images=1, aspect_ratio=ratio),
        )
        return resp.generated_images[0].image.image_bytes


class OpenAIImageProvider(ImageProvider):
    """OpenAI gpt-image. SDK: openai (pip install openai)."""

    name = "openai"
    model = os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-1")
    # gpt-image usa tamanhos, não ratios; mapeia os mais comuns
    _sizes = {"3:4": "1024x1536", "4:5": "1024x1536", "1:1": "1024x1024", "16:9": "1536x1024"}

    def available(self) -> bool:
        return bool(os.getenv("OPENAI_API_KEY"))

    def generate(self, prompt: str, ratio: str) -> bytes:
        from openai import OpenAI  # lazy import

        client = OpenAI()
        resp = client.images.generate(
            model=self.model, prompt=prompt, size=self._sizes.get(ratio, "1024x1536"), n=1,
        )
        return base64.b64decode(resp.data[0].b64_json)


class RunwayImageProvider(ImageProvider):
    """Runway (gen-4). SDK: runwayml (pip install runwayml). Hospeda também vídeo (short-form)."""

    name = "runway"
    model = os.getenv("RUNWAY_IMAGE_MODEL", "gen4_image")

    def available(self) -> bool:
        return bool(os.getenv("RUNWAYML_API_SECRET") or os.getenv("RUNWAY_API_KEY"))

    def generate(self, prompt: str, ratio: str) -> bytes:
        import requests
        from runwayml import RunwayML  # lazy import

        client = RunwayML(api_key=os.getenv("RUNWAYML_API_SECRET") or os.getenv("RUNWAY_API_KEY"))
        # ratio -> proporção em pixels aceita pela gen-4
        px = {"3:4": "1080:1440", "4:5": "1080:1350", "1:1": "1024:1024", "16:9": "1920:1080"}
        task = client.text_to_image.create(
            model=self.model, prompt_text=prompt, ratio=px.get(ratio, "1080:1440"),
        ).wait_for_task_output()
        return requests.get(task.output[0], timeout=60).content


PROVIDERS = {
    "gemini": GeminiImageProvider(),
    "openai": OpenAIImageProvider(),
    "runway": RunwayImageProvider(),
}


def select_provider() -> ImageProvider | None:
    order = [p.strip() for p in os.getenv("IMAGE_PROVIDER_ORDER", "gemini,openai,runway").split(",")]
    for name in order:
        prov = PROVIDERS.get(name)
        if prov and prov.available():
            return prov
    return None


def generate_image(prompt: str, out_path: str | Path, *, ratio: str = "3:4",
                   log: JobLog | None = None, key: str = "img") -> Path:
    """
    Gera uma imagem complexa e salva em out_path. Escolhe o provedor disponível.
    Levanta RuntimeError se nenhum provedor tiver chave.
    """
    log = log or JobLog(prefix="imagegen")
    prov = select_provider()
    if prov is None:
        raise RuntimeError(
            "Nenhum provedor de imagem disponível. Configure GEMINI_API_KEY ou OPENAI_API_KEY no .env."
        )
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    try:
        data = prov.generate(prompt, ratio)
    except Exception as e:  # noqa: BLE001
        log.record("imagegen", "errored", key=key, model=prov.name, t0=t0, t1=time.time(), error=str(e))
        raise
    out.write_bytes(data)
    log.record("imagegen", "succeeded", key=key, model=prov.name, t0=t0, t1=time.time(),
               note=f"bytes={len(data)} ratio={ratio}")
    return out


def which() -> str:
    prov = select_provider()
    return prov.name if prov else "nenhum (sem chave)"


if __name__ == "__main__":
    print(f"[imagegen] provedor disponível: {which()}")
