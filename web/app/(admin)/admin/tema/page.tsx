import { lerTema } from "@/lib/tema-store";
import EditorTema from "./EditorTema";


export const dynamic = "force-dynamic";
export const metadata = { title: "Tema" };

export default async function TemaPage() {
  const tema = await lerTema();
  return (
    <>
      <div className="a-top">
        <div>
          <h1>Tema</h1>
          <p className="sub">
            Cor, fonte e as frases fixas — um lugar só, valendo no portal e na arte.
          </p>
        </div>
      </div>
      <p className="chint">
        Espaçamento, tamanho de fonte e posição não entram aqui de propósito: são
        composição, e deixá-los soltos produz layout quebrado sem ninguém saber por quê.
      </p>
      <EditorTema inicial={tema} />
    </>
  );
}
