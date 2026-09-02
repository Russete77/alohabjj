"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { despublicarDossie, publicarDossie } from "../actions";

/**
 * O botão NÃO guarda o estado publicado em useState.
 *
 * Guardava, e por isso a tela mentia: depois de arquivar ou corrigir o dossiê,
 * a lista era recarregada mas o botão continuava exibindo o estado do primeiro
 * render. Agora a prop é a verdade e o refresh do servidor é quem atualiza.
 */
export default function PublishButton({
  slug, publicado, aviso,
}: { slug: string; publicado: boolean; aviso: string | null }) {
  const router = useRouter();
  const [pendente, transicao] = useTransition();
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  function publicar(confirmado: boolean) {
    setErro("");
    transicao(async () => {
      const r = await publicarDossie(slug, confirmado);
      if (r.precisaConfirmar) return setConfirmar(r.precisaConfirmar);
      if (!r.ok) return setErro(r.erro ?? "falhou");
      setConfirmar(null);
      router.refresh();
    });
  }

  function despublicar() {
    setErro("");
    transicao(async () => {
      const r = await despublicarDossie(slug);
      if (!r.ok) return setErro(r.erro ?? "falhou");
      router.refresh();
    });
  }

  if (confirmar) {
    return (
      <div className="pub-confirm">
        <b>Este dossiê foi reprovado na apuração.</b>
        <span>Motivo: {confirmar}</span>
        {aviso && <em>“{aviso}”</em>}
        <div className="pub-acoes">
          <button type="button" onClick={() => setConfirmar(null)}>Cancelar</button>
          <button type="button" className="danger" disabled={pendente} onClick={() => publicar(true)}>
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
        className={publicado ? "" : "primary"}
        disabled={pendente}
        onClick={() => (publicado ? despublicar() : publicar(false))}
      >
        {pendente ? "…" : publicado ? "Despublicar" : "Publicar"}
      </button>
      {erro && <span className="pub-erro">{erro}</span>}
    </div>
  );
}
