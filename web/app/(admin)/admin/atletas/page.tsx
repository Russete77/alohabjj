import { listAtletas, getPerfil } from "@/lib/atletas";
import AtletasManager from "./AtletasManager";

export const dynamic = "force-dynamic";

export default function Atletas() {
  const atletas = listAtletas();
  const perfis: Record<string, string> = {};
  for (const a of atletas) if (a.temPerfil) perfis[a.slug] = getPerfil(a.slug) || "";
  const comX = atletas.filter((a) => a.x).length;
  const comPerfil = atletas.filter((a) => a.temPerfil).length;

  return (
    <>
      <div className="a-top">
        <div>
          <h1>Atletas</h1>
          <p className="sub">Cadastro de atletas + perfil enriquecido (cartel, preparação, notícias e X). O agente busca; você edita.</p>
        </div>
      </div>
      <div className="draft-banner">
        <b>{atletas.length}</b> atletas · <b>{comX}</b> com @X · <b>{comPerfil}</b> com perfil.
        Preencha o <b>@ do X</b> pra o agente puxar os posts do atleta; rode <code>enrich_athlete</code> pra gerar os perfis.
      </div>
      <AtletasManager atletas={atletas} perfis={perfis} />
    </>
  );
}
