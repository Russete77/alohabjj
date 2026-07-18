import { listStoreProducts, KIND_LABEL, type StoreKind, type StoreProduct } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Loja · AlohaBJJ" };

const ORDER: StoreKind[] = ["curso", "impressao_3d", "afiliado"];

function preco(p: StoreProduct): string {
  if (p.gratis) return "Grátis";
  if (p.preco != null) return `R$ ${p.preco.toFixed(2).replace(".", ",")}`;
  return "";
}
function cta(p: StoreProduct): string {
  if (p.gratis) return "Pegar grátis";
  if (p.tipo === "curso") return "Comprar curso";
  if (p.tipo === "impressao_3d") return "Ver / encomendar";
  return "Ver oferta";
}

export default async function Loja() {
  const { items, fonte } = await listStoreProducts();
  const grupos = ORDER.map((k) => ({ k, produtos: items.filter((p) => p.tipo === k) }))
    .filter((g) => g.produtos.length > 0);

  return (
    <main className="loja">
      <header className="loja-hero">
        <h1>Loja AlohaBJJ</h1>
        <p>Cursos digitais, produtos 3D exclusivos e o equipamento que os campeões usam — curados pra quem leva o Jiu-Jitsu a sério.</p>
      </header>

      {grupos.map(({ k, produtos }) => (
        <section key={k} className="loja-sec">
          <h2>{KIND_LABEL[k]}</h2>
          <div className="loja-grid">
            {produtos.map((p) => (
              <article key={p.id} className={`loja-card ${p.destaque ? "hot" : ""}`}>
                <div className="loja-img" style={p.imagem_url ? { backgroundImage: `url("${p.imagem_url}")` } : undefined}>
                  {!p.imagem_url && <span className="loja-ph">{KIND_LABEL[k]}</span>}
                  {p.desconto && <span className="loja-badge">{p.desconto}</span>}
                </div>
                <div className="loja-body">
                  <h3>{p.nome}</h3>
                  {p.descricao && <p className="loja-desc">{p.descricao}</p>}
                  <div className="loja-foot">
                    <span className="loja-preco">{preco(p)}</span>
                    {p.url_base && p.url_base.startsWith("/") ? (
                      <a className="loja-btn" href={p.url_base}>{cta(p)}</a>
                    ) : (
                      <a className="loja-btn" href={`/p/${p.id}`} target="_blank" rel="noreferrer">{cta(p)}</a>
                    )}
                  </div>
                  {p.cupom && <div className="loja-cupom">cupom <b>{p.cupom}</b></div>}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <p className="loja-nota">
        Alguns links são de parceria (#publi). {fonte === "catalogo" && "Catálogo base — o banco entra quando você liga o Supabase."}
      </p>
    </main>
  );
}
