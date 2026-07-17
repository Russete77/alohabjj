import { listProducts } from "@/lib/catalog";
import CatalogEditor from "./CatalogEditor";

export const dynamic = "force-dynamic";

export default function Catalogo() {
  const produtos = listProducts();
  const portal = (process.env.PORTAL_URL || "https://alohabjjnews.com").replace(/\/$/, "");
  const semLink = produtos.filter((p) => !p.url_base).length;

  return (
    <>
      <div className="a-top">
        <div>
          <h1>Catálogo de produtos</h1>
          <p className="sub">Produtos, links de afiliado e palavras ManyChat. O Supervisor associa a pauta ao produto; o link vira venda.</p>
        </div>
      </div>
      <div className="draft-banner">
        <b>É aqui que o dinheiro entra.</b> Cole o <b>link de afiliado real</b> de cada produto em <b>url_base</b>.
        {semLink > 0 && <> Hoje <b>{semLink}</b> produto(s) estão sem link — o CTA cai no portal em vez de converter.</>}
      </div>
      <CatalogEditor produtos={produtos} portal={portal} />
    </>
  );
}
