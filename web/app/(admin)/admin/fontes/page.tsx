import { readRawConfig } from "@/lib/config";
import FontesEditor from "./FontesEditor";

export const dynamic = "force-dynamic";

export default function Fontes() {
  const initial = readRawConfig("fontes.yaml");
  return (
    <>
      <div className="a-top">
        <div>
          <h1>Fontes do Radar</h1>
          <p className="sub">De onde o sistema puxa as notícias (RSS/web/YouTube). O YAML é validado antes de salvar.</p>
        </div>
      </div>
      <FontesEditor initial={initial} />
    </>
  );
}
