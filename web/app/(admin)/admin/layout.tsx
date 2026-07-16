import type { Metadata } from "next";
import "./admin.css";

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
          <a href="/admin#base">Base de conhecimento</a>
          <a href="/" className="a-back">← Ver o portal público</a>
        </nav>
        <div className="a-foot"><span className="pdot" /> Loop diário ativo · 06:00</div>
      </aside>
      <main className="a-main">{children}</main>
    </div>
  );
}
