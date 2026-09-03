import { notFound } from "next/navigation";
import { getDossierAdmin, lerDoArquivo, listAllComEstado } from "@/lib/dossiers";
import { paragrafosParaTexto, vocabularioDeTags } from "@/lib/cms";
import { motivoBloqueio, podeIrAoAr } from "@/lib/porteiro";
import EditorConteudo from "./EditorConteudo";


export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await getDossierAdmin(slug);
  return { title: d ? `Editar · ${d.titulo}` : "Editar" };
}

export default async function EditarConteudo({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const d = await getDossierAdmin(slug);
  if (!d) notFound();

  // O original do arquivo fica visível como referência: sem ele, desfazer uma
  // correção seria adivinhar o que a IA tinha escrito.
  const doArquivo = lerDoArquivo(slug);
  const { list } = await listAllComEstado();

  const motivo = motivoBloqueio({ confianca: d.confianca, tags: d.tags });

  return (
    <>
      <div className="a-top">
        <div>
          <div className="ed-crumb">
            <a href="/admin/conteudo">← Conteúdo</a>
          </div>
          <h1>{d.titulo}</h1>
          <p className="sub">
            O arquivo guarda o que a IA escreveu. O que você corrigir aqui vence na hora
            de publicar — e regerar o dossiê não apaga a correção.
          </p>
        </div>
      </div>

      {motivo && (
        <div className="draft-banner">
          <b>Este dossiê foi reprovado na apuração.</b> Motivo: {motivo}. Editar não muda
          isso — publicar vai continuar pedindo confirmação extra.
        </div>
      )}

      <EditorConteudo
        slug={slug}
        publicado={podeIrAoAr(d)}
        corpoOriginal={paragrafosParaTexto(doArquivo?.resumoParas ?? d.resumoParas)}
        corpoAtual={paragrafosParaTexto(d.resumoParas)}
        imagemOriginal={doArquivo?.imagem ?? null}
        imagemAtual={d.imagem}
        tags={d.tags}
        vocabulario={vocabularioDeTags(list)}
      />
    </>
  );
}
