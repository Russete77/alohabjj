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
          <a href="/admin">Fila de aprovação</a>
          <a href="/admin/conversao">Conversão</a>
          <a href="/admin/produtos">Produtos (scout)</a>
          <a href="/admin/catalogo">Catálogo & afiliados</a>
          <a href="/admin/conhecimento">Base de conhecimento</a>
          <a href="/admin/fontes">Fontes do Radar</a>
          <a href="/admin/agentes">Agentes (academia)</a>
          <a href="/admin/prompts">Prompts dos agentes</a>
          <a href="/admin/config">Chaves & config</a>
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
