import { estadoDasChaves, listarAjustes } from "@/lib/config-store";
import ConfigEditor from "./ConfigEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuração" };

// Onde cada chave de provedor se cadastra. O painel não edita nenhuma delas —
// só diz se está lá. Mandar o operador pro lugar certo vale mais que um campo
// que ele preenche e que não sobrevive ao deploy.
const ONDE: Record<string, string> = {
  ANTHROPIC_API_KEY: "Vercel → Settings → Environment Variables · e GitHub → Secrets",
  GEMINI_API_KEY: "Vercel e GitHub (opcional — geração de imagem)",
  OPENAI_API_KEY: "Vercel e GitHub (opcional — geração de imagem)",
  RUNWAYML_API_SECRET: "Vercel e GitHub (opcional — imagem e vídeo)",
  SUPABASE_URL: "Vercel e GitHub",
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
        <h2>Ajustes</h2>
        <span className="c">valem no próximo run</span>
      </div>
      <p className="chint">
        Estes ficam no banco, então valem no ar e na sua máquina. Teto de gasto, modelo
        do scout e tag de afiliado são decisão de negócio — mudam sem deploy.
      </p>
      <ConfigEditor ajustes={ajustes} />

      <div className="sec-h" style={{ marginTop: 34 }}>
        <h2>Chaves de provedor</h2>
        <span className="c">somente leitura</span>
      </div>
      <p className="chint">
        Estas <b>não</b> são editáveis aqui, de propósito: são as que gastam dinheiro
        na conta de um provedor. Entrar neste painel não pode significar levá-las
        embora. O painel mostra só se estão configuradas.
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
