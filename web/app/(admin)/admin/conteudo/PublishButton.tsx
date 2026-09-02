"use client";

import { useState } from "react";
import { despublicarDossie, publicarDossie } from "../actions";

export default function PublishButton({
  slug, publicado, aviso,
}: { slug: string; publicado: boolean; aviso: string | null }) {
  const [estado, setEstado] = useState(publicado);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function publicar(confirmado: boolean) {
    setOcupado(true); setErro("");
    const r = await publicarDossie(slug, confirmado);
    setOcupado(false);
    if (r.precisaConfirmar) return setConfirmar(r.precisaConfirmar);
    if (!r.ok) return setErro(r.erro ?? "falhou");
    setConfirmar(null); setEstado(true);
  }

  async function despublicar() {
    setOcupado(true); setErro("");
    const r = await despublicarDossie(slug);
    setOcupado(false);
    if (!r.ok) return setErro(r.erro ?? "falhou");
    setEstado(false);
  }

  if (confirmar) {
    return (
      <div className="pub-confirm">
        <b>Este dossiê foi reprovado na apuração.</b>
        <span>Motivo: {confirmar}</span>
        {aviso && <em>“{aviso}”</em>}
        <div className="pub-acoes">
          <button type="button" onClick={() => setConfirmar(null)}>Cancelar</button>
          <button type="button" className="danger" disabled={ocupado} onClick={() => publicar(true)}>
            Publicar mesmo assim
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pub">
      <button
        type="button"
        className={estado ? "" : "primary"}
        disabled={ocupado}
        onClick={() => (estado ? despublicar() : publicar(false))}
      >
        {ocupado ? "…" : estado ? "Despublicar" : "Publicar"}
      </button>
      {erro && <span className="pub-erro">{erro}</span>}
    </div>
  );
}
