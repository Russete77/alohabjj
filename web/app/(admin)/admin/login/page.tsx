import { login } from "../actions";


export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; next?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="login-wrap">
      <form action={login} className="login-card">
        <div className="login-brand">
          Aloha<span>BJJ</span> <em>painel</em>
        </div>
        <p className="login-sub">Área restrita. Entre com a senha do painel.</p>
        {sp?.erro === "bloqueado" ? (
          <div className="login-err">Muitas tentativas. Espere 15 minutos.</div>
        ) : sp?.erro ? (
          <div className="login-err">Senha incorreta.</div>
        ) : null}
        <input type="hidden" name="next" value={sp?.next || "/admin"} />
        <input
          type="password"
          name="password"
          placeholder="Senha do painel"
          autoFocus
          autoComplete="current-password"
        />
        <button type="submit">Entrar</button>
      </form>
    </div>
  );
}
