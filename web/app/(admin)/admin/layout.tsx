import type { Metadata } from "next";
import "./admin.css";
import { logout } from "./actions";
import { authEnabled } from "@/lib/auth";

export const metadata: Metadata = { title: "Painel", robots: { index: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin">
      <aside className="aside">
        <a href="/admin" className="a-brand">
          Aloha<span>BJJ</span> <em>painel</em>
        </a>
        <nav className="a-nav">
          <div className="a-group">Conteúdo</div>
          <a href="/admin"><span className="a-ic">📥</span>Fila de aprovação</a>
          <a href="/admin/conhecimento"><span className="a-ic">🧠</span>Base de conhecimento</a>
          <a href="/admin/fontes"><span className="a-ic">📡</span>Fontes do Radar</a>

          <div className="a-group">Loja & vendas</div>
          <a href="/admin/conversao"><span className="a-ic">📊</span>Conversão</a>
          <a href="/admin/produtos"><span className="a-ic">🛒</span>Produtos (scout)</a>
          <a href="/admin/catalogo"><span className="a-ic">🔗</span>Catálogo & afiliados</a>

          <div className="a-group">Agentes de IA</div>
          <a href="/admin/agentes"><span className="a-ic">🥋</span>Agentes (academia)</a>
          <a href="/admin/prompts"><span className="a-ic">✍️</span>Prompts dos agentes</a>

          <div className="a-group">Config</div>
          <a href="/admin/config"><span className="a-ic">🔑</span>Chaves & config</a>
          <a href="/" className="a-back">← Ver o portal público</a>
        </nav>
        <div className="a-foot">
          <span className="pdot" /> Loop diário ativo · 06:00
          {authEnabled() && (
            <form action={logout} className="a-logout">
              <button type="submit">Sair</button>
            </form>
          )}
        </div>
      </aside>
      <main className="a-main">{children}</main>
    </div>
  );
}
