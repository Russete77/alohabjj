import "../../globals.css";
import "./preview.css";


// Layout PRÓPRIO, fora do grupo (admin), de propósito: a prévia precisa parecer
// o PORTAL, e dentro de (admin) ela herdava a barra lateral do painel — que é
// justamente o que ela não pode mostrar.
//
// A rota continua protegida: o matcher do middleware cobre "/preview/:path*".
export const metadata = { title: "Prévia", robots: { index: false } };

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return <div className="prev-wrap">{children}</div>;
}
