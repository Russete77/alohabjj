import { listCursos } from "@/lib/cursos";
import CursoManager from "./CursoManager";

export const dynamic = "force-dynamic";

export default function Cursos() {
  const cursos = listCursos().map((c) => ({
    slug: c.slug, titulo: c.titulo, subtitulo: c.subtitulo, descricao: c.descricao,
    gratis: c.gratis, badge: c.badge, capa: c.capa, modulos: c.modulos, recomendados: c.recomendados,
  }));
  return (
    <>
      <div className="a-top">
        <div>
          <h1>Cursos</h1>
          <p className="sub">Edite o curso sem mexer em código: cole o vídeo e o texto de cada aula. Salva direto na página /curso.</p>
        </div>
      </div>
      {cursos.length === 0 ? (
        <div className="empty">Nenhum curso ainda. Crie um abaixo, ou rode <code>python -m orchestrator.build_course --tema &quot;...&quot;</code>.</div>
      ) : null}
      <CursoManager cursos={cursos} />
    </>
  );
}
