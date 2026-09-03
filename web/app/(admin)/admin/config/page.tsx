import { estadoDasChaves, listarAjustes } from "@/lib/config-store";
import ConfigEditor from "./ConfigEditor";


export const dynamic = "force-dynamic";
export const metadata = { title: "Configuração" };

// Onde cada chave se cadastra. Desde a fase 6 as chaves de PROVEDOR podem ser
// coladas aqui mesmo (campo de escrita, nunca devolvido) — o texto antigo ainda
// mandava o operador na Vercel, ou seja, mandava fazer à mão o que o painel já faz.
//
// As de INFRAESTRUTURA continuam só no ambiente, e por um motivo que não é
// preferência: são elas que dão acesso ao banco onde as outras ficariam
// guardadas. Guardá-las lá dentro seria trancar a chave dentro do cofre.
const ONDE: Record<string, string> = {
  SUPABASE_URL: "Vercel e GitHub — é o alicerce, não dá pra guardar no próprio banco",
  SUPABASE_SERVICE_ROLE_KEY: "Vercel e GitHub · NUNCA com prefixo NEXT_PUBLIC_",
  NEXT_PUBLIC_SUPABASE_URL: "Vercel",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "Vercel",
  ADMIN_PASSWORD: "Vercel — é a senha desta tela",
  ADMIN_SESSION_SECRET: "Vercel — sem ela o app recusa subir em produção",
};

export default async function Config() {
  const ajustes = await listarAjustes();
  const chaves = estadoDasChaves();
  const faltando = chaves.filter((c) => !c.setada);

  return (
    <>
      <div className="a-top">
        <div>
          <h1>Configuração</h1>
          <p className="sub">
            O que muda o comportamento do sistema fica aqui. Chave de provedor mora no ambiente.
          </p>
        </div>
      </div>

      {faltando.length > 0 && (
        <div className="draft-banner">
          <b>{faltando.length} chave(s) de provedor não configuradas:</b>{" "}
          {faltando.map((c) => c.key).join(", ")}. Sem elas as etapas que dependem
          delas não rodam — veja onde cadastrar na segunda seção.
        </div>
      )}

      <div className="sec-h">
        <h2>Ajustes e chaves de IA</h2>
        <span className="c">valem no próximo run</span>
      </div>
      <p className="chint">
        Ficam no banco, então valem no ar e na sua máquina — mudam sem deploy. As chaves
        de provedor são <b>campos de escrita</b>: você cola, elas gravam, e a tela nunca
        mais devolve o valor. Entrar aqui não significa levar a chave embora.
      </p>
      <ConfigEditor ajustes={ajustes} />

      <div className="sec-h" style={{ marginTop: 34 }}>
        <h2>Chaves de provedor</h2>
        <span className="c">somente leitura</span>
      </div>
      <p className="chint">
        Estas seis são o <b>alicerce</b>: dão acesso ao banco e ao próprio painel.
        Guardá-las no banco seria trancar a chave dentro do cofre — por isso só o
        ambiente. As chaves de <b>provedor de IA</b> (Anthropic, Gemini, OpenAI, Runway)
        não estão aqui: você as cola na seção de cima, e elas nunca voltam pra tela.
      </p>
      <div className="ctable">
        {chaves.map((c) => (
          <div className="crow" key={c.key}>
            <div className="cinfo">
              <b className="mono">{c.key}</b>
              <div className="cmeta">{ONDE[c.key] ?? "ambiente do servidor"}</div>
            </div>
            <span className={`chip ${c.setada ? "ok" : "nao"}`}>
              {c.setada ? "configurada" : "faltando"}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
