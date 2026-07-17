"""
lib/affiliates.py — Busca de produto campeão + link de afiliado (Amazon / Mercado Livre / Shopee).

Regra (decidida com o Lucas): usar APIs OFICIAIS de afiliado, nunca scraping
(Amazon/ML/Shopee proíbem raspagem no ToS e quebra a toda hora).

Fluxo: o Supervisor escolhe a CATEGORIA do produto (ex.: rashguard-nogi) e uma
query de busca; este módulo procura o campeão de vendas que casa e devolve o
link de afiliado pronto. Sem credenciais → retorna None (o brief fica `precisa_link`).

Cada provedor precisa das credenciais do SEU programa de afiliado no .env:
  Amazon:        AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY, AMAZON_PARTNER_TAG, AMAZON_COUNTRY(=BR)
  Mercado Livre: ML_AFFILIATE_TAG (+ ML_ACCESS_TOKEN opcional p/ busca autenticada)
  Shopee:        SHOPEE_APP_ID, SHOPEE_APP_SECRET
Ordem de tentativa: AFFILIATE_ORDER (default: amazon,mercadolivre,shopee).
"""
from __future__ import annotations

import os
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass, asdict
from pathlib import Path

from dotenv import load_dotenv

from lib.jobs import JobLog

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
UA = "Mozilla/5.0 (compatible; AlohaBJJBot/1.0)"


@dataclass
class Produto:
    titulo: str
    url: str                 # link final (já de afiliado quando possível)
    fonte: str               # amazon | mercadolivre | shopee
    preco: str = ""
    imagem: str = ""
    afiliado: bool = True


class AffiliateProvider:
    name = "base"

    def available(self) -> bool:
        raise NotImplementedError

    def search(self, query: str, limit: int = 5) -> list[Produto]:
        """Busca produtos campeões e devolve com link de afiliado."""
        raise NotImplementedError


class AmazonProvider(AffiliateProvider):
    """Amazon Product Advertising API 5.0 (SDK: python-amazon-paapi)."""
    name = "amazon"

    def available(self) -> bool:
        return all(os.getenv(k) for k in ("AMAZON_ACCESS_KEY", "AMAZON_SECRET_KEY", "AMAZON_PARTNER_TAG"))

    def search(self, query: str, limit: int = 5) -> list[Produto]:
        from amazon_paapi import AmazonApi  # lazy import
        api = AmazonApi(os.getenv("AMAZON_ACCESS_KEY"), os.getenv("AMAZON_SECRET_KEY"),
                        os.getenv("AMAZON_PARTNER_TAG"), os.getenv("AMAZON_COUNTRY", "BR"))
        res = api.search_items(keywords=query, item_count=min(limit, 10),
                               sort_by="AvgCustomerReviews")  # proxy de "campeão"
        out = []
        for it in getattr(res, "items", []) or []:
            # a PA-API já devolve DetailPageURL com a PartnerTag embutida
            out.append(Produto(
                titulo=getattr(getattr(it.item_info, "title", None), "display_value", "") or query,
                url=it.detail_page_url, fonte="amazon",
                preco=str(getattr(getattr(it, "offers", None), "listings", [{}])[0].price.display_amount
                         if getattr(it, "offers", None) else ""),
                imagem=getattr(getattr(getattr(it, "images", None), "primary", None), "large", ""),
            ))
        return out


class MercadoLivreProvider(AffiliateProvider):
    """Busca pública do Mercado Livre + tag do programa de Afiliados."""
    name = "mercadolivre"
    SITE = os.getenv("ML_SITE", "MLB")  # MLB = Brasil

    def available(self) -> bool:
        return bool(os.getenv("ML_AFFILIATE_TAG"))

    def _affiliate(self, permalink: str) -> str:
        tag = os.getenv("ML_AFFILIATE_TAG", "")
        if not tag:
            return permalink
        sep = "&" if "?" in permalink else "?"
        return f"{permalink}{sep}{tag}"  # cola os parâmetros do link de afiliado do ML

    def search(self, query: str, limit: int = 5) -> list[Produto]:
        url = f"https://api.mercadolibre.com/sites/{self.SITE}/search?q={urllib.parse.quote(query)}&limit={limit}"
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        import json as _json
        with urllib.request.urlopen(req, timeout=15) as r:
            data = _json.loads(r.read().decode("utf-8", "ignore"))
        out = []
        for it in data.get("results", [])[:limit]:
            out.append(Produto(
                titulo=it.get("title", query), url=self._affiliate(it.get("permalink", "")),
                fonte="mercadolivre", preco=f"R$ {it.get('price', '')}",
                imagem=it.get("thumbnail", ""),
            ))
        return out


class ShopeeProvider(AffiliateProvider):
    """Shopee Affiliate Open API (GraphQL assinado). Requer app aprovado."""
    name = "shopee"

    def available(self) -> bool:
        return all(os.getenv(k) for k in ("SHOPEE_APP_ID", "SHOPEE_APP_SECRET"))

    def search(self, query: str, limit: int = 5) -> list[Produto]:
        # A Shopee Affiliate usa GraphQL com assinatura SHA256(app_id+timestamp+payload+secret).
        # Integração fica pronta pra plugar quando o app for aprovado; sem app, não roda.
        raise RuntimeError("Shopee Affiliate: implementar chamada GraphQL assinada com app aprovado.")


PROVIDERS = {"amazon": AmazonProvider(), "mercadolivre": MercadoLivreProvider(), "shopee": ShopeeProvider()}


def _order() -> list[str]:
    return [p.strip() for p in os.getenv("AFFILIATE_ORDER", "amazon,mercadolivre,shopee").split(",")]


def which() -> list[str]:
    return [n for n in _order() if PROVIDERS.get(n) and PROVIDERS[n].available()]


def best_product(query: str, log: JobLog | None = None, key: str = "afiliado") -> dict | None:
    """Procura o produto campeão nos provedores disponíveis (na ordem). None se nenhum tem chave."""
    log = log or JobLog(prefix="afiliados")
    for name in _order():
        prov = PROVIDERS.get(name)
        if not prov or not prov.available():
            continue
        t0 = time.time()
        try:
            hits = prov.search(query)
        except Exception as e:  # noqa: BLE001
            log.record("afiliados", "errored", key=key, model=name, t0=t0, t1=time.time(), error=str(e))
            continue
        if hits:
            log.record("afiliados", "succeeded", key=key, model=name, t0=t0, t1=time.time(),
                       note=f"query={query!r} -> {hits[0].titulo[:50]}")
            return asdict(hits[0])
    return None


if __name__ == "__main__":
    print(f"[afiliados] provedores disponíveis: {which() or 'nenhum (sem credenciais)'}")
