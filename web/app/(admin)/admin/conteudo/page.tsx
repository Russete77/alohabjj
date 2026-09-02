import { listAllComEstado, temDiscoLocal, type Dossier } from "@/lib/dossiers";
import { motivoBloqueio, podeIrAoAr } from "@/lib/porteiro";
import { CATEGORIAS, LABEL_CATEGORIA, MAX_DESTAQUES, contaDestaques, ehCategoria } from "@/lib/editorial";
import LinhaConteudo from "./LinhaConteudo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conteúdo" };

// As abas são links, não estado de cliente: dá pra abrir "arquivados" numa
// segunda janela, mandar o link pra alguém e voltar pelo botão do navegador.
const ABAS = [
  { id: "ativos", rotulo: "Tudo em uso" },
  { id: "no-ar", rotulo: "No ar" },
  { id: "rascunho", rotulo: "Rascunho" },
  { id: "arquivados", rotulo: "Arquivados" },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

function filtraAba(d: Dossier, aba: AbaId): boolean {
  const arquivado = d.arquivado === true;
  if (aba === "arquivados") return arquivado;
  if (arquivado) return false; // arquivado só aparece na aba dele
  if (aba === "no-ar") return podeIrAoAr(d);
  if (aba === "rascunho") return !podeIrAoAr(d);
  return true;
}

function link(aba: string, ed: string): string {
  const p = new URLSearchParams();
  if (aba !== "ativos") p.set("aba", aba);
  if (ed) p.set("ed", ed);
  const q = p.toString();
  return q ? `/admin/conteudo?${q}` : "/admin/conteudo";
}

export default async function Conteudo({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; ed?: string }>;
}) {
  const sp = await searchParams;
  const aba: AbaId = (ABAS.find((a) => a.id === sp.aba)?.id ?? "ativos") as AbaId;
  const ed = ehCategoria(sp.ed) ? sp.ed : "";

  const { list, bancoOk } = await listAllComEstado();
  const temDisco = temDiscoLocal();

  const noAr = list.filter((d) => podeIrAoAr(d));
  const arquivados = list.filter((d) => d.arquivado === true);
  const destaques = contaDestaques(noAr);
  const bloqueados = list.filter((d) => motivoBloqueio({ confianca: d.confianca, tags: d.tags }));

  const visiveis = list.filter((d) => filtraAba(d, aba) && (!ed || d.categoria === ed));

  return (
    <>
      <div className="a-top">
        <div>
          <h1>Conteúdo</h1>
          <p className="sub">Nada vai ao ar sem você publicar aqui</p>
        </div>
      </div>

      {/* Sem o estado do banco a tela mostra tudo como não publicado. Dizer
          isso evita o susto de achar que o portal foi despublicado sozinho. */}
      {!bancoOk && (
        <div className="draft-banner">
          O banco não respondeu. A lista abaixo é o que está no disco — o estado de
          publicação mostrado <b>não é confiável</b> e gravar vai falhar. Confira
          SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de mexer.
        </div>
      )}

      <div className="kpis">
        <div className="kpi"><div className="lab">Na base</div><div className="num">{list.length}</div></div>
        <div className="kpi"><div className="lab">No ar</div><div className="num">{noAr.length}</div></div>
        <div className="kpi">
          <div className="lab">Em destaque</div>
          <div className={`num ${destaques > MAX_DESTAQUES ? "excesso" : ""}`}>{destaques}</div>
        </div>
        <div className="kpi"><div className="lab">Arquivados</div><div className="num">{arquivados.length}</div></div>
      </div>

      {/* O layout da home tem lugar pra ~3 cards grandes. Mais que isso não
          quebra nada no banco, quebra na tela — por isso avisa, não impede. */}
      {destaques > MAX_DESTAQUES && (
        <div className="draft-banner">
          {destaques} dossiês em destaque. A home foi desenhada para no máximo {MAX_DESTAQUES} —
          acima disso o card grande vira uma pilha e o destaque deixa de destacar.
        </div>
      )}

      <div className="cfiltros">
        <div className="cabas" role="tablist" aria-label="Estado do conteúdo">
          {ABAS.map((a) => {
            const n =
              a.id === "arquivados" ? arquivados.length
              : a.id === "no-ar" ? noAr.length
              : a.id === "rascunho" ? list.filter((d) => filtraAba(d, "rascunho")).length
              : list.filter((d) => filtraAba(d, "ativos")).length;
            return (
              <a
                key={a.id}
                href={link(a.id, ed)}
                className={`ptab ${aba === a.id ? "on" : ""}`}
                aria-current={aba === a.id ? "page" : undefined}
              >
                {a.rotulo} <span className="ctab-n">{n}</span>
              </a>
            );
          })}
        </div>

        <div className="cabas" aria-label="Editoria">
          <a href={link(aba, "")} className={`ptab ${ed === "" ? "on" : ""}`}>Todas</a>
          {CATEGORIAS.map((c) => (
            <a key={c} href={link(aba, c)} className={`ptab ${ed === c ? "on" : ""}`}>
              {LABEL_CATEGORIA[c]}{" "}
              <span className="ctab-n">{list.filter((d) => d.categoria === c).length}</span>
            </a>
          ))}
        </div>
      </div>

      {bloqueados.length > 0 && aba !== "arquivados" && (
        <p className="chint">
          {bloqueados.length} dossiês foram reprovados na apuração (confiança baixa ou tag de
          bloqueio). Publicar qualquer um deles pede confirmação extra.
        </p>
      )}

      <div className="ctable">
        {visiveis.length === 0 && <div className="empty">Nada aqui com estes filtros.</div>}
        {visiveis.map((d) => {
          const motivo = motivoBloqueio({ confianca: d.confianca, tags: d.tags });
          return (
            <LinhaConteudo
              key={d.slug}
              slug={d.slug}
              titulo={d.titulo}
              categoria={d.categoria}
              data={d.data}
              publicado={d.status === "published"}
              arquivado={d.arquivado === true}
              destaque={d.destaque === true}
              ordem={d.ordem ?? null}
              motivo={motivo}
              aviso={motivo ? (d.resumoParas[0] ?? "").slice(0, 180) : null}
              temDisco={temDisco}
            />
          );
        })}
      </div>
    </>
  );
}
