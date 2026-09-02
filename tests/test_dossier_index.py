import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.dossier_index import infer_categoria, read_all, read_dossier


def _monta(tmp_path: Path, slug: str, meta: dict, summary: str, back: dict | None = None) -> Path:
    d = tmp_path / "knowledge" / slug
    d.mkdir(parents=True)
    (d / "metadata.json").write_text(json.dumps(meta), encoding="utf-8")
    (d / "summary.md").write_text(summary, encoding="utf-8")
    if back is not None:
        b = tmp_path / "knowledge" / "_backfill"
        b.mkdir(parents=True, exist_ok=True)
        (b / f"{slug}.json").write_text(json.dumps(back), encoding="utf-8")
    return tmp_path


def test_categoria_sem_atleta_e_tecnica():
    assert infer_categoria([], []) == "tecnica"


def test_categoria_com_atleta_cai_em_superlutas():
    # é o if que hoje empilha tudo em superlutas — preservado como SUGESTÃO
    assert infer_categoria([], ["Gordon Ryan"]) == "superlutas"


def test_categoria_do_wordpress_vence():
    assert infer_categoria(["Notícias"], ["Gordon Ryan"]) == "noticias"


def test_read_dossier_monta_o_shape(tmp_path):
    root = _monta(
        tmp_path, "luta-x",
        {"tags": ["gi"], "atletas": ["A", "B"], "evento": "Mundial",
         "data": "2026-05-01", "confianca": "media", "source_url": "https://x"},
        "# Luta X\n\nPrimeiro parágrafo.\n\nSegundo parágrafo.\n",
    )
    d = read_dossier("luta-x", root=root)
    assert d is not None
    assert d["slug"] == "luta-x"
    assert d["titulo"] == "Luta X"
    assert d["resumoParas"] == ["Primeiro parágrafo.", "Segundo parágrafo."]
    assert d["data"] == "2026-05-01"
    assert d["confianca"] == "media"


def test_titulo_do_backfill_vence_o_do_summary(tmp_path):
    root = _monta(
        tmp_path, "luta-y", {"atletas": []}, "# Titulo do summary\n\nCorpo.\n",
        back={"title": "Título do WordPress", "categories": ["Análises"]},
    )
    d = read_dossier("luta-y", root=root)
    assert d["titulo"] == "Título do WordPress"
    assert d["categoria"] == "analises"


def test_sem_summary_devolve_none(tmp_path):
    d = tmp_path / "knowledge" / "quebrado"
    d.mkdir(parents=True)
    (d / "metadata.json").write_text("{}", encoding="utf-8")
    assert read_dossier("quebrado", root=tmp_path) is None


def test_read_all_ignora_pastas_de_servico(tmp_path):
    _monta(tmp_path, "luta-z", {"atletas": []}, "# Z\n\nCorpo.\n")
    for servico in ("_backfill", "atletas", "sources", "trends"):
        (tmp_path / "knowledge" / servico).mkdir(parents=True, exist_ok=True)
    assert [d["slug"] for d in read_all(root=tmp_path)] == ["luta-z"]
