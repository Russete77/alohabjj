import { listCandidates } from "@/lib/candidates";
import CandidatesManager from "./CandidatesManager";

export const dynamic = "force-dynamic";

export default function Produtos() {
  const candidates = listCandidates();
  const pend = candidates.filter((c) => c.status === "proposto").length;
  return (
    <>
      <div className="a-top">
        <div>
          <h1>Produtos — candidatos</h1>
          <p className="sub">O Product Scout caça campeões nos marketplaces, classifica e escreve a copy. Você aprova → vira produto na Loja.</p>
        </div>
      </div>
      <div className="draft-banner">
        <b>{pend}</b> candidato(s) esperando sua decisão. Aprovar cria o produto no catálogo (a Loja e o Supervisor já usam).
        Se faltar o link de afiliado, você cola em <b>/admin/catalogo</b>.
      </div>
      <CandidatesManager candidates={candidates} />
    </>
  );
}
