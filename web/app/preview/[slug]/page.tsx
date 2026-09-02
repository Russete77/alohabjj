import { notFound } from "next/navigation";
import { getDossierAdmin } from "@/lib/dossiers";
import { getPiece } from "@/lib/pieces";
import { motivoBloqueio, podeIrAoAr } from "@/lib/porteiro";
import ArtigoView from "../../(site)/artigo/[slug]/ArtigoView";

// Prévia de como o artigo fica publicado.
//
// Renderiza o MESMO componente do portal. A alternativa — reimplementar o
// layout só pra prévia — seria mais rápida e mentiria sobre o resultado final,
// que é o único jeito de uma prévia ser pior que não ter prévia.
//
// A diferença em relação ao portal é uma só, e é o motivo da tela existir: aqui
// o dossiê NÃO precisa estar publicado. É ver antes de decidir.

export const dynamic = "force-dynamic";

export default async function Preview({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const d = await getDossierAdmin(slug);
  if (!d) notFound();

  const peca = await getPiece(slug);
  const noAr = podeIrAoAr(d);
  const motivo = motivoBloqueio({ confianca: d.confianca, tags: d.tags });

  return (
    <>
      <div className={`prev-bar ${noAr ? "" : "rascunho"}`}>
        <span className="prev-tag">{noAr ? "No ar" : "Rascunho — ainda não publicado"}</span>
        {motivo && <span className="prev-alerta">⚠ {motivo}</span>}
        <span className="prev-slug">{slug}</span>
        <a className="prev-voltar" href="/admin/conteudo">← Voltar ao painel</a>
      </div>
      <main className="pwrap">
        <ArtigoView d={d} peca={peca} />
      </main>
    </>
  );
}
