# Porteiro e Segurança — Plano de Implementação (Fases 1 e 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o AlohaBJJ poder ir ao ar na Vercel sem publicar conteúdo que a própria máquina reprovou, e sem deixar o `/admin` exposto com sessão que nunca expira.

**Architecture:** A publicação deixa de ser automática e vira ato humano. O pipeline continua gravando dossiê como `validated`; só o operador promove para `published`. A regra de quem pode ir ao ar vira lógica pura, duplicada de propósito em Python (`lib/porteiro.py`, usada pelo snapshot) e TypeScript (`web/lib/porteiro.ts`, usada pelo portal) — as duas metades são testadas, porque testar só uma deixa a outra livre para vazar. A tabela `dossiers` está provavelmente vazia (as credenciais do Supabase entraram depois do backfill), então um importador idempotente popula o índice antes de o portão fechar.

**Tech Stack:** Python 3.13 · Next.js 15.1.6 · React 19 · TypeScript 5.6 · Node 22 · Supabase (PostgREST) · pytest · node:test

**Spec:** [`docs/superpowers/specs/2026-09-02-pronto-para-producao-design.md`](../specs/2026-09-02-pronto-para-producao-design.md)

## Global Constraints

- **Falhar fechado.** Todo caminho de erro no porteiro resulta em **menos** conteúdo público, nunca mais. Banco fora do ar → o portal mostra menos, não tudo.
- **DDL é manual.** O MCP Supabase do ambiente não alcança o projeto `bjj` (`hrgfbwkjjtiymmnediwq`). Todo SQL sai como arquivo em `db/migrations/`, idempotente, para o operador colar no SQL Editor. Tarefas que dependem de DDL dizem isso explicitamente.
- **`SUPABASE_SERVICE_ROLE_KEY` nunca recebe prefixo `NEXT_PUBLIC_`.** Só é lida em código de servidor.
- **Nenhuma dependência nova no `web/`.** O teste usa `node:test`, embutido no Node 22, com type stripping nativo (verificado nesta máquina: `node --experimental-strip-types` funciona).
- **`SPEND_CAP_USD` vale por run.** Tarefas que chamam a API real (Task 11) respeitam o teto existente; nenhuma tarefa deste plano gasta mais que ~US$ 0,10.
- **Mensagem de commit em português**, terminando com a linha de co-autoria:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **O pipeline nunca publica.** Nenhuma tarefa pode fazer código Python gravar `status = 'published'`.

## Mapa de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `db/migrations/2026-09-02-fase1-porteiro.sql` | Colunas editoriais + política anon restrita | 1 |
| `lib/porteiro.py` | Regra pura: normalizar tag, decidir bloqueio | 2 |
| `tests/test_porteiro.py` | Teste da regra pura | 2 |
| `lib/dossier_index.py` | Leitura normalizada de `knowledge/` (fim da duplicação com `sync_to_cloud`) | 3 |
| `tests/test_dossier_index.py` | Teste da leitura | 3 |
| `orchestrator/import_index.py` | Popula `dossiers` a partir do disco, idempotente | 4 |
| `orchestrator/sync_to_cloud.py` | Passa a filtrar publicados | 5 |
| `tests/test_sync_gate.py` | Teste de que não-publicado não entra no snapshot | 5 |
| `web/lib/porteiro.ts` | Espelho TS da regra pura | 6 |
| `web/lib/__tests__/porteiro.test.ts` | Teste do espelho | 6 |
| `web/lib/server-db.ts` | Acesso PostgREST server-side com service key | 7 |
| `web/lib/dossiers.ts` | Split `listPublic` / `listAll` | 8 |
| `web/app/(admin)/admin/actions.ts` | Ações publicar / despublicar | 9 |
| `agents/trend_qc/system.md` | Prompt do QC de nicho | 10 |
| `orchestrator/scout_trends.py` | Integra o QC | 11 |
| `db/migrations/2026-09-02-fase2-seguranca.sql` | RLS + `login_attempts` | 12 |
| `web/lib/auth.ts` | Sessão com expiração, secret obrigatório | 13 |
| `web/middleware.ts` | Valida expiração | 13 |

---

# FASE 1 — O PORTEIRO

---

### Task 1: Migração do porteiro (DDL manual)

**Files:**
- Create: `db/migrations/2026-09-02-fase1-porteiro.sql`

**Interfaces:**
- Consumes: nada.
- Produces: colunas `dossiers.destaque` (boolean), `dossiers.ordem` (int), `dossiers.arquivado` (boolean); política anon em `dossiers` restrita a `status = 'published'`.

- [ ] **Step 1: Escrever a migração**

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 1 · O PORTEIRO
-- Rode no SQL Editor do projeto bjj (hrgfbwkjjtiymmnediwq). Idempotente.
--
-- A migração de 19/07 afrouxou a leitura pública para ('validated','published')
-- pra o deploy mostrar conteúdo. Como o pipeline grava tudo como 'validated',
-- isso tornou público 9 dossiês que a própria apuração reprovou. Aqui a trava
-- volta ao desenho original: só o que um humano promoveu vai ao ar.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Colunas de controle editorial ──────────────────────────────────────────
alter table dossiers add column if not exists destaque  boolean default false;
alter table dossiers add column if not exists ordem     int;
alter table dossiers add column if not exists arquivado boolean default false;

-- home: destaque primeiro, depois ordem manual, depois data
create index if not exists idx_dossiers_vitrine
  on dossiers (destaque desc, ordem asc nulls last, data desc)
  where status = 'published' and arquivado = false;

-- 2) A trava volta ──────────────────────────────────────────────────────────
drop policy if exists pub_read_dossiers on dossiers;
drop policy if exists "public read dossiers publicados" on dossiers;
create policy pub_read_dossiers on dossiers
  for select to anon
  using (status = 'published' and arquivado = false);

-- pieces e platform_packages NAO precisam de mudanca: as policies de anon ja
-- exigem estado='publicado' / status='published'. Foi so a de dossiers que a
-- migracao de julho afrouxou. Conferido, nao esquecido.

-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência (deve devolver 0 nas duas primeiras e a policy na terceira):
--   select count(*) from dossiers where status = 'published';        -- 0 hoje
--   select count(*) from dossiers where arquivado is null;           -- 0
--   select polname, pg_get_expr(polqual, polrelid) from pg_policy
--     where polrelid = 'dossiers'::regclass and polname = 'pub_read_dossiers';
-- ═══════════════════════════════════════════════════════════════════════════
```

- [ ] **Step 2: Operador roda no SQL Editor**

Esta tarefa **bloqueia** nas mãos do operador — o MCP não alcança o projeto. Cole o arquivo inteiro no SQL Editor do Supabase e rode. Rode também as três consultas de conferência do rodapé e guarde a saída.

Esperado: `0`, `0`, e uma linha mostrando `(status = 'published'::dossier_status AND arquivado = false)`.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/2026-09-02-fase1-porteiro.sql
git commit -m "$(cat <<'EOF'
db(fase1): trava de publicacao volta ao desenho original

A migracao de 19/07 afrouxou a leitura anon pra ('validated','published') e o
pipeline grava tudo como validated — 9 dossies reprovados na apuracao ficaram
publicos. Volta pra status='published' e adiciona as colunas de controle
editorial (destaque, ordem, arquivado).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: A regra pura, em Python

**Files:**
- Create: `lib/porteiro.py`
- Create: `tests/test_porteiro.py`
- Create: `requirements-dev.txt`

**Interfaces:**
- Consumes: nada (lógica pura, sem I/O).
- Produces:
  - `TAGS_BLOQUEIO: set[str]`
  - `normaliza_tag(tag: str) -> str`
  - `motivo_bloqueio(meta: dict) -> str | None`

- [ ] **Step 1: Criar `requirements-dev.txt`**

```
# Dependências só de desenvolvimento (não vão pro runtime).
pytest>=8.0
```

Instale com: `pip install -r requirements-dev.txt`

- [ ] **Step 2: Escrever o teste que falha**

Crie `tests/test_porteiro.py`:

```python
"""
Testa a regra de bloqueio do porteiro. É lógica pura — sem banco, sem disco.

O caso que motivou o teste: o Analista grava tags em texto livre e acentuado.
O dossiê do André Galvão traz literalmente "tema sensível", com espaço e acento.
Comparar cru contra "tema-sensivel" deixaria a trava passar batido.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.porteiro import motivo_bloqueio, normaliza_tag


def test_normaliza_tira_acento_e_espaco():
    assert normaliza_tag("tema sensível") == "tema-sensivel"


def test_normaliza_troca_underscore_por_hifen():
    assert normaliza_tag("nao_confirmado") == "nao-confirmado"


def test_normaliza_e_idempotente():
    assert normaliza_tag("apuracao-incompleta") == "apuracao-incompleta"


def test_confianca_baixa_bloqueia():
    assert motivo_bloqueio({"confianca": "baixa", "tags": []}) == "confiança baixa"


def test_tag_acentuada_bloqueia():
    # o caso real do dossiê do André Galvão
    meta = {"confianca": "media", "tags": ["notícia", "André Galvão", "tema sensível"]}
    assert motivo_bloqueio(meta) == "tag de bloqueio: tema sensível"


def test_tag_de_apuracao_bloqueia():
    # o caso real do dossiê da Mariana Bucher
    meta = {"confianca": "media", "tags": ["nao-verificado", "apuracao-incompleta"]}
    assert motivo_bloqueio(meta) is not None


def test_dossie_limpo_nao_bloqueia():
    meta = {"confianca": "media", "tags": ["gi", "IBJJF", "faixa-preta"]}
    assert motivo_bloqueio(meta) is None


def test_metadata_vazio_nao_explode():
    assert motivo_bloqueio({}) is None


def test_confianca_ausente_com_tag_limpa_passa():
    assert motivo_bloqueio({"tags": ["no-gi"]}) is None
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `python -m pytest tests/test_porteiro.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'lib.porteiro'`

- [ ] **Step 4: Escrever a implementação mínima**

Crie `lib/porteiro.py`:

```python
"""
lib/porteiro.py — a regra de quem pode ir ao ar.

Lógica PURA, sem I/O: recebe o metadata de um dossiê e diz se publicar exige
confirmação extra do operador. Consumida pelo sync_to_cloud (snapshot) e
espelhada em web/lib/porteiro.ts (portal). As duas metades existem de
propósito e as duas são testadas — testar só uma deixa a outra livre pra vazar.

Regra da casa: falhar FECHADO. Na dúvida, bloqueia.
"""
from __future__ import annotations

import unicodedata

# Tags que o Analista usa quando a apuração não fechou. Comparadas JÁ normalizadas.
TAGS_BLOQUEIO = {
    "nao-verificado",
    "apuracao-incompleta",
    "pendente",
    "nao-confirmado",
    "tema-sensivel",
    "rumor",
}


def normaliza_tag(tag: str) -> str:
    """'tema sensível' -> 'tema-sensivel'.

    Minúscula, sem acento, espaço e underscore viram hífen. As tags vêm do
    modelo em texto livre; sem isso a comparação não casa.
    """
    sem_acento = "".join(
        c for c in unicodedata.normalize("NFD", str(tag))
        if unicodedata.category(c) != "Mn"
    )
    return "-".join(sem_acento.lower().split()).replace("_", "-")


def motivo_bloqueio(meta: dict) -> str | None:
    """Por que publicar este dossiê exige confirmação extra — ou None se está limpo.

    A string devolvida vai pra tela do operador, então cita a tag ORIGINAL
    (acentuada), não a normalizada.
    """
    if str((meta or {}).get("confianca", "")).lower() == "baixa":
        return "confiança baixa"
    for tag in (meta or {}).get("tags") or []:
        if normaliza_tag(tag) in TAGS_BLOQUEIO:
            return f"tag de bloqueio: {tag}"
    return None
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `python -m pytest tests/test_porteiro.py -v`
Expected: PASS — 9 passed

- [ ] **Step 6: Commit**

```bash
git add lib/porteiro.py tests/test_porteiro.py requirements-dev.txt
git commit -m "$(cat <<'EOF'
feat(porteiro): regra de bloqueio com normalizacao de tag + primeiro teste

Primeiro teste do repositorio. A normalizacao nao e detalhe: o Analista grava
tag em texto livre e acentuado ("tema sensivel"), entao comparar cru contra a
lista de bloqueio deixaria a trava passar batido. Os dois casos reais da base
— Mariana Bucher e Andre Galvao — estao cobertos.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Leitura normalizada de `knowledge/`

Hoje a inferência de categoria e a leitura do dossiê existem duplicadas em `orchestrator/sync_to_cloud.py` (Python) e `web/lib/dossiers.ts` (TypeScript), e vão ser precisas de novo no importador da Task 4. Esta tarefa extrai a metade Python para um módulo só.

**Files:**
- Create: `lib/dossier_index.py`
- Create: `tests/test_dossier_index.py`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `infer_categoria(wp_cats: list[str], atletas: list[str]) -> str` — devolve `superlutas|noticias|analises|tecnica`
  - `LABEL: dict[str, str]`
  - `read_dossier(slug: str, root: Path | None = None) -> dict | None` — devolve `{slug, titulo, categoria, categoriaLabel, atletas, evento, data, resumoParas, imagem, fonteUrl, confianca, tags}` ou `None` quando falta `metadata.json` ou `summary.md`
  - `read_all(root: Path | None = None) -> list[dict]`

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/test_dossier_index.py`:

```python
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
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `python -m pytest tests/test_dossier_index.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'lib.dossier_index'`

- [ ] **Step 3: Escrever a implementação**

Crie `lib/dossier_index.py`:

```python
"""
lib/dossier_index.py — leitura normalizada da base em knowledge/.

Um lugar só pra transformar knowledge/<slug>/ num dicionário. Antes isso existia
duplicado no sync_to_cloud e no web/lib/dossiers.ts; o importador da Task 4
precisaria de uma terceira cópia. Sem I/O de rede — só disco.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

DEFAULT_ROOT = Path(__file__).resolve().parent.parent
SERVICO = {"_backfill", "atletas", "sources", "trends"}

LABEL = {
    "superlutas": "Superlutas",
    "noticias": "Notícias",
    "analises": "Análises",
    "tecnica": "Técnica",
}


def infer_categoria(wp_cats: list[str], atletas: list[str]) -> str:
    """Sugestão inicial de editoria a partir da categoria do WordPress.

    ATENÇÃO: é SUGESTÃO, não verdade. A partir da Fase 3 a coluna `categoria`
    do banco vence isto — é justamente este `if` que hoje empilha tudo em
    superlutas sempre que há atleta e o WordPress não deu categoria útil.
    """
    c = [str(x).lower() for x in (wp_cats or [])]
    if any("superluta" in x for x in c):
        return "superlutas"
    if any("news" in x or "not" in x for x in c):
        return "noticias"
    if any("anál" in x or "anal" in x for x in c):
        return "analises"
    return "tecnica" if not atletas else "superlutas"


def _read_json(p: Path) -> dict:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def _paragrafos(md: str) -> list[str]:
    body = re.sub(r"^#[^\n]*\n+", "", md)
    return [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n{2,}", body) if p.strip()]


def read_dossier(slug: str, root: Path | None = None) -> dict | None:
    """Um dossiê do disco, normalizado. None quando falta metadata ou summary."""
    base = (root or DEFAULT_ROOT) / "knowledge"
    d = base / slug
    meta = _read_json(d / "metadata.json")
    summ = d / "summary.md"
    if not meta and not summ.exists():
        return None
    if not summ.exists():
        return None

    back = _read_json(base / "_backfill" / f"{slug}.json")
    summary = summ.read_text(encoding="utf-8")
    m = re.match(r"^#\s*(.+)", summary)
    titulo = back.get("title") or (m.group(1).strip() if m else slug.replace("-", " "))
    atletas = meta.get("atletas") or []
    categoria = infer_categoria(back.get("categories") or [], atletas)

    return {
        "slug": slug,
        "titulo": titulo,
        "categoria": categoria,
        "categoriaLabel": LABEL[categoria],
        "atletas": atletas,
        "evento": meta.get("evento") or "",
        "data": (meta.get("data") or back.get("date") or "")[:10],
        "resumoParas": _paragrafos(summary),
        "imagem": meta.get("imagem") or back.get("featured_image"),
        "fonteUrl": meta.get("source_url") or back.get("link"),
        "confianca": meta.get("confianca") or "media",
        "tags": meta.get("tags") or [],
    }


def read_all(root: Path | None = None) -> list[dict]:
    """Todos os dossiês do disco, ordenados por data (mais recente primeiro)."""
    base = (root or DEFAULT_ROOT) / "knowledge"
    if not base.exists():
        return []
    out: list[dict] = []
    for d in sorted(base.iterdir()):
        if not d.is_dir() or d.name in SERVICO:
            continue
        item = read_dossier(d.name, root=root)
        if item:
            out.append(item)
    out.sort(key=lambda x: x["data"], reverse=True)
    return out
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `python -m pytest tests/test_dossier_index.py -v`
Expected: PASS — 7 passed

- [ ] **Step 5: Conferir contra a base real**

Run: `python -c "from lib.dossier_index import read_all; d=read_all(); print(len(d), d[0]['slug'], d[0]['categoria'])"`
Expected: `52` seguido de um slug e uma categoria válida.

- [ ] **Step 6: Commit**

```bash
git add lib/dossier_index.py tests/test_dossier_index.py
git commit -m "$(cat <<'EOF'
refactor(index): leitura de knowledge/ num modulo so

A inferencia de categoria e a leitura do dossie estavam duplicadas entre
sync_to_cloud.py e web/lib/dossiers.ts, e o importador da proxima tarefa
precisaria de uma terceira copia. Extrai a metade Python.

O if que empilha tudo em superlutas fica, mas documentado como SUGESTAO —
na Fase 3 a coluna do banco passa a vencer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Importador do índice

A tabela `dossiers` está quase certamente vazia: as credenciais do Supabase entraram no `.env` em 19/07 e os 52 dossiês foram construídos em 16–17/07, quando `db.enabled()` devolvia `False`. Se o portão fechar antes de o índice existir, o portal fica vazio e parece quebrado. Esta tarefa vem antes de qualquer filtro.

**Files:**
- Create: `orchestrator/import_index.py`

**Interfaces:**
- Consumes: `lib.dossier_index.read_all`, `lib.db.upsert_dossier`
- Produces: comando `python -m orchestrator.import_index [--dry-run]`

- [ ] **Step 1: Conferir o estado real da tabela**

Run:
```bash
python -c "import os,json,urllib.request;from dotenv import load_dotenv;load_dotenv('.env');u=os.getenv('SUPABASE_URL').rstrip('/');k=os.getenv('SUPABASE_SERVICE_ROLE_KEY');r=urllib.request.Request(f'{u}/rest/v1/dossiers?select=slug,status',headers={'apikey':k,'Authorization':f'Bearer {k}'});print(json.loads(urllib.request.urlopen(r,timeout=20).read())[:5])"
```
Expected: provavelmente `[]`. Anote quantas linhas vieram — é o número que a Task 4 vai mudar.

- [ ] **Step 2: Escrever o importador**

Crie `orchestrator/import_index.py`:

```python
"""
orchestrator/import_index.py — popula o índice `dossiers` a partir do disco.

Idempotente (upsert por slug). Existe porque os 52 dossiês foram construídos
ANTES de o Supabase estar configurado, então a tabela nasceu vazia e o portal
passou a servir direto do disco/snapshot, sem porteiro.

NUNCA grava status='published'. Publicar é ato humano, no /admin.

Uso:
    python -m orchestrator.import_index --dry-run
    python -m orchestrator.import_index
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib import db  # noqa: E402
from lib.dossier_index import read_all  # noqa: E402
from lib.porteiro import motivo_bloqueio  # noqa: E402


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    dossies = read_all()
    bloqueados = [d for d in dossies if motivo_bloqueio(d)]
    print(f"[import] {len(dossies)} dossiê(s) no disco · {len(bloqueados)} exigem confirmação ao publicar")
    for d in bloqueados:
        print(f"   ⚠ {d['slug'][:58]} — {motivo_bloqueio(d)}")

    if args.dry_run:
        print("[import] --dry-run: nada gravado.")
        return 0
    if not db.enabled():
        print("[import] Supabase desabilitado (faltam SUPABASE_URL/SERVICE_ROLE_KEY).")
        return 1

    for d in dossies:
        db.upsert_dossier({
            "slug": d["slug"],
            "titulo": d["titulo"],
            "categoria": d["categoria"],
            "evento": d["evento"] or None,
            "data": d["data"] or None,
            "confianca": d["confianca"],
            "status": "validated",   # NUNCA published — quem promove é o operador
            "source_url": d["fonteUrl"],
            "source": "import_index",
            "resumo": " ".join(d["resumoParas"])[:2000] or None,
            "imagem": d["imagem"],
            "artifact_path": f"knowledge/{d['slug']}/",
        })
    print(f"[import] {len(dossies)} enfileirado(s) como 'validated'. Publicar é no /admin.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 3: Rodar em dry-run**

Run: `python -m orchestrator.import_index --dry-run`
Expected: `[import] 52 dossiê(s) no disco · 9 exigem confirmação ao publicar`, seguido das 9 linhas com ⚠ — entre elas `mariana-bucher-...` e `andre-galvao-...`.

Se o número de bloqueados não for 9, **pare** e investigue antes de gravar: a regra da Task 2 não está casando com a base real.

- [ ] **Step 4: Rodar de verdade**

Run: `python -m orchestrator.import_index`
Expected: `[import] 52 enfileirado(s) como 'validated'.`

- [ ] **Step 5: Conferir no banco**

Run: repita o comando do Step 1.
Expected: 52 linhas, **todas** com `"status": "validated"`. Se aparecer qualquer `published`, algo gravou errado — corrija antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add orchestrator/import_index.py
git commit -m "$(cat <<'EOF'
feat(import): popula o indice de dossies a partir do disco

A tabela dossiers nasceu vazia: os 52 dossies foram construidos em 16-17/07 e
as credenciais do Supabase so entraram em 19/07, entao db.enabled() era False
durante todo o backfill. Sem isso, fechar o porteiro deixaria o portal vazio.

Idempotente por slug. Grava sempre 'validated' — publicar e ato humano.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: O snapshot só leva publicado

**Files:**
- Modify: `orchestrator/sync_to_cloud.py` (substitui `_map_categoria`, `_parse_summary`, `_read_json` e o corpo de `build_dossiers`)
- Create: `tests/test_sync_gate.py`

**Interfaces:**
- Consumes: `lib.dossier_index.read_all`, `lib.db`
- Produces: `publicados(slugs: list[str]) -> set[str]` em `sync_to_cloud`; `build_dossiers` passa a receber o conjunto de publicados

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/test_sync_gate.py`:

```python
"""
O snapshot é o que o portal serve quando não há disco (deploy). Se ele levar
não-publicado, o porteiro do lado web não adianta — o conteúdo chega por baixo.

Regra que este teste protege: FALHAR FECHADO. Banco fora do ar => snapshot
vazio, nunca snapshot completo.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from orchestrator import sync_to_cloud


def test_filtra_para_apenas_publicados():
    todos = [
        {"slug": "a", "titulo": "A", "categoria": "noticias", "categoriaLabel": "Notícias",
         "atletas": [], "evento": "", "data": "2026-01-01", "resumoParas": [],
         "imagem": None, "fonteUrl": None, "confianca": "media", "tags": []},
        {"slug": "b", "titulo": "B", "categoria": "noticias", "categoriaLabel": "Notícias",
         "atletas": [], "evento": "", "data": "2026-01-02", "resumoParas": [],
         "imagem": None, "fonteUrl": None, "confianca": "baixa", "tags": ["nao-verificado"]},
    ]
    saida = sync_to_cloud.filtrar_publicados(todos, publicados={"a"})
    assert list(saida.keys()) == ["a"]


def test_banco_sem_resposta_gera_snapshot_vazio():
    """Falhar fechado: publicados=set() => nada vai ao ar."""
    todos = [
        {"slug": "a", "titulo": "A", "categoria": "noticias", "categoriaLabel": "Notícias",
         "atletas": [], "evento": "", "data": "2026-01-01", "resumoParas": [],
         "imagem": None, "fonteUrl": None, "confianca": "alta", "tags": []},
    ]
    assert sync_to_cloud.filtrar_publicados(todos, publicados=set()) == {}


def test_publicados_none_tambem_fecha():
    """None (erro de rede) não pode ser confundido com 'libera tudo'."""
    todos = [
        {"slug": "a", "titulo": "A", "categoria": "noticias", "categoriaLabel": "Notícias",
         "atletas": [], "evento": "", "data": "2026-01-01", "resumoParas": [],
         "imagem": None, "fonteUrl": None, "confianca": "alta", "tags": []},
    ]
    assert sync_to_cloud.filtrar_publicados(todos, publicados=None) == {}
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `python -m pytest tests/test_sync_gate.py -v`
Expected: FAIL — `AttributeError: module 'orchestrator.sync_to_cloud' has no attribute 'filtrar_publicados'`

- [ ] **Step 3: Adicionar as funções ao `sync_to_cloud.py`**

No topo, junto aos outros imports, adicione:

```python
from lib.dossier_index import read_all  # noqa: E402
```

E acrescente estas duas funções logo depois de `_read_json`:

```python
def publicados_do_banco() -> set[str] | None:
    """Slugs com status='published'. None quando o banco não responde.

    None e set() são tratados igual lá na frente (nada vai ao ar) — a distinção
    existe só pra mensagem de log ser honesta sobre o motivo.
    """
    import os
    import urllib.request
    url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not (url and key):
        return None
    req = urllib.request.Request(
        f"{url}/rest/v1/dossiers?select=slug&status=eq.published&arquivado=is.false",
        headers={"apikey": key, "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return {row["slug"] for row in json.loads(r.read())}
    except Exception:  # noqa: BLE001
        return None


def filtrar_publicados(todos: list[dict], publicados: set[str] | None) -> dict:
    """Só o que o operador promoveu entra no snapshot. Falha FECHADO."""
    if not publicados:
        return {}
    return {d["slug"]: d for d in todos if d["slug"] in publicados}
```

- [ ] **Step 4: Reescrever `build_dossiers` para usar as duas**

Substitua o corpo inteiro de `build_dossiers` por:

```python
def build_dossiers(dry: bool, only: str | None) -> dict:
    """{slug: dossier} — só os publicados, com o hero já no Storage."""
    pub = publicados_do_banco()
    if pub is None:
        print("[sync] AVISO: banco não respondeu — snapshot sai VAZIO (falha fechada).")
    todos = read_all()
    if only:
        todos = [d for d in todos if d["slug"] == only]
    out = filtrar_publicados(todos, pub)
    print(f"[sync] {len(todos)} no disco · {len(out)} publicado(s) vão ao ar")

    for slug, d in out.items():
        hero_file = HERO / f"{slug}.jpg"
        if hero_file.exists() and not dry:
            u = storage.upload(BUCKET, f"hero/{slug}.jpg", hero_file)
            if u:
                d["imagem"] = u
    return out
```

Remova as funções agora mortas: `_map_categoria`, `_parse_summary`, e a constante `LABEL` (veio pro `dossier_index`). Mantenha `_read_json` — `build_pieces` ainda usa.

**Conhecido e adiado de propósito:** `build_pieces` continua percorrendo `outputs/` inteiro, então o `pieces.json` do snapshot leva peça de dossiê não publicado. Não é vazamento de portal — a página de artigo só renderiza peça de dossiê que passou pelo `listPublic` —, e o `pieces.json` é o que o `/admin` lê no deploy, onde ver tudo é o comportamento certo. Fica assim até a Fase 4, que move o estado de peça pro banco.

- [ ] **Step 5: Rodar os testes e ver passar**

Run: `python -m pytest tests/ -v`
Expected: PASS — 19 passed (9 + 7 + 3)

- [ ] **Step 6: Conferir o comportamento real**

Run: `python -m orchestrator.sync_to_cloud --dry-run`
Expected: `[sync] 52 no disco · 0 publicado(s) vão ao ar` — porque ninguém publicou nada ainda. É o resultado correto.

- [ ] **Step 7: Commit**

```bash
git add orchestrator/sync_to_cloud.py tests/test_sync_gate.py
git commit -m "$(cat <<'EOF'
feat(sync): snapshot so leva o que foi publicado

O snapshot e o que o portal serve quando nao ha disco. Se ele levar
nao-publicado, o porteiro do lado web nao adianta — o conteudo entra por baixo.

Falha FECHADO: banco sem resposta gera snapshot vazio, nunca snapshot completo.
None e set() dao no mesmo resultado; a distincao so existe pro log ser honesto.

Reaproveita lib/dossier_index e apaga a duplicacao de categoria/summary.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: A regra pura, em TypeScript

**Files:**
- Create: `web/lib/porteiro.ts`
- Create: `web/lib/__tests__/porteiro.test.ts`
- Modify: `web/tsconfig.json` (excluir a pasta de teste do build)
- Modify: `web/package.json` (script `test`)

**Interfaces:**
- Consumes: nada (lógica pura, sem imports).
- Produces:
  - `normalizaTag(tag: string): string`
  - `motivoBloqueio(meta: { confianca?: string; tags?: string[] }): string | null`
  - `podeIrAoAr(d: { status?: string; arquivado?: boolean }): boolean`

- [ ] **Step 1: Escrever o teste que falha**

Crie `web/lib/__tests__/porteiro.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoBloqueio, normalizaTag, podeIrAoAr } from "../porteiro.ts";

test("normaliza tira acento e espaço", () => {
  assert.equal(normalizaTag("tema sensível"), "tema-sensivel");
});

test("normaliza troca underscore por hífen", () => {
  assert.equal(normalizaTag("nao_confirmado"), "nao-confirmado");
});

test("tag acentuada bloqueia", () => {
  assert.equal(
    motivoBloqueio({ confianca: "media", tags: ["notícia", "tema sensível"] }),
    "tag de bloqueio: tema sensível",
  );
});

test("confiança baixa bloqueia", () => {
  assert.equal(motivoBloqueio({ confianca: "baixa", tags: [] }), "confiança baixa");
});

test("dossiê limpo não bloqueia", () => {
  assert.equal(motivoBloqueio({ confianca: "media", tags: ["gi"] }), null);
});

test("só published vai ao ar", () => {
  assert.equal(podeIrAoAr({ status: "published", arquivado: false }), true);
  assert.equal(podeIrAoAr({ status: "validated", arquivado: false }), false);
});

test("arquivado nunca vai ao ar, mesmo publicado", () => {
  assert.equal(podeIrAoAr({ status: "published", arquivado: true }), false);
});

test("falha fechado: sem status, não vai ao ar", () => {
  assert.equal(podeIrAoAr({}), false);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd web && node --test lib/__tests__/porteiro.test.ts`
Expected: FAIL — não consegue resolver `../porteiro.ts`

- [ ] **Step 3: Escrever a implementação**

Crie `web/lib/porteiro.ts`:

```ts
// Espelho TypeScript de lib/porteiro.py. As duas metades existem de propósito:
// o Python decide o que entra no snapshot, o TS decide o que o portal serve.
// Testar só uma deixa a outra livre pra vazar. Sem imports — lógica pura.
//
// Regra da casa: falhar FECHADO. Na dúvida, não vai ao ar.

export const TAGS_BLOQUEIO = new Set([
  "nao-verificado",
  "apuracao-incompleta",
  "pendente",
  "nao-confirmado",
  "tema-sensivel",
  "rumor",
]);

/** "tema sensível" -> "tema-sensivel" */
export function normalizaTag(tag: string): string {
  return String(tag)
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .join("-")
    .replace(/_/g, "-");
}

/** Por que publicar exige confirmação extra — ou null se está limpo. */
export function motivoBloqueio(
  meta: { confianca?: string; tags?: string[] } | null | undefined,
): string | null {
  if (!meta) return null;
  if (String(meta.confianca ?? "").toLowerCase() === "baixa") return "confiança baixa";
  for (const tag of meta.tags ?? []) {
    if (TAGS_BLOQUEIO.has(normalizaTag(tag))) return `tag de bloqueio: ${tag}`;
  }
  return null;
}

/** O portal só serve o que o operador promoveu e não arquivou. */
export function podeIrAoAr(d: { status?: string; arquivado?: boolean } | null | undefined): boolean {
  if (!d) return false;
  return d.status === "published" && d.arquivado !== true;
}
```

- [ ] **Step 4: Excluir a pasta de teste do build do Next**

Em `web/tsconfig.json`, troque a linha do `exclude` por:

```json
  "exclude": ["node_modules", "lib/__tests__"]
```

O teste importa com extensão `.ts` explícita (exigência do runner do Node); o `tsconfig` do Next não aceita isso sem `allowImportingTsExtensions`. Excluir a pasta evita a flag e mantém o build limpo.

- [ ] **Step 5: Adicionar o script de teste**

Em `web/package.json`, dentro de `"scripts"`, acrescente:

```json
    "test": "node --test lib/__tests__/",
```

- [ ] **Step 6: Rodar o teste e ver passar**

Run: `cd web && npm test`
Expected: PASS — `# pass 8`

- [ ] **Step 7: Conferir que o build continua limpo**

Run: `cd web && npx tsc --noEmit`
Expected: sem saída, exit 0.

- [ ] **Step 8: Commit**

```bash
git add web/lib/porteiro.ts web/lib/__tests__/porteiro.test.ts web/tsconfig.json web/package.json
git commit -m "$(cat <<'EOF'
feat(porteiro): espelho TS da regra + primeiro teste do web

O porteiro tem duas metades em linguagens diferentes: o Python decide o que
entra no snapshot, o TS decide o que o portal serve. Testar so uma deixa a
outra livre pra vazar.

Usa node:test com type stripping nativo do Node 22 — nenhuma dependencia nova.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Acesso ao banco pelo servidor

**Files:**
- Create: `web/lib/server-db.ts`

**Interfaces:**
- Consumes: `process.env.SUPABASE_URL`, `process.env.SUPABASE_SERVICE_ROLE_KEY`
- Produces:
  - `dbEnabled(): boolean`
  - `dbSelect<T>(query: string): Promise<T[] | null>` — `null` significa erro, **não** "vazio"
  - `dbPatch(query: string, body: Record<string, unknown>): Promise<boolean>`
  - `dbUpsert(table: string, body: Record<string, unknown>): Promise<boolean>` — POST com merge-duplicates

- [ ] **Step 1: Escrever o módulo**

Crie `web/lib/server-db.ts`:

```ts
// Acesso PostgREST com a SERVICE KEY. SÓ código de servidor (Server Components,
// Server Actions, Route Handlers). A variável não tem prefixo NEXT_PUBLIC_, então
// o Next não a injeta em bundle de cliente — num componente client ela vem
// undefined e dbEnabled() devolve false.
//
// Contrato importante: dbSelect devolve null em ERRO e [] quando a consulta
// não achou nada. Quem consome NÃO pode tratar os dois igual — null tem que
// levar ao caminho restritivo.

const URL_BASE = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function dbEnabled(): boolean {
  return Boolean(URL_BASE && KEY);
}

function headers(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/** GET no PostgREST. `query` é o trecho depois de /rest/v1/ — ex.: "dossiers?select=*". */
export async function dbSelect<T>(query: string): Promise<T[] | null> {
  if (!dbEnabled()) return null;
  try {
    const r = await fetch(`${URL_BASE}/rest/v1/${query}`, {
      headers: headers(),
      cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json()) as T[];
  } catch {
    return null;
  }
}

/** PATCH no PostgREST. Devolve true só quando o banco confirmou. */
export async function dbPatch(query: string, body: Record<string, unknown>): Promise<boolean> {
  if (!dbEnabled()) return false;
  try {
    const r = await fetch(`${URL_BASE}/rest/v1/${query}`, {
      method: "PATCH",
      headers: headers({ Prefer: "return=minimal" }),
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** POST com merge-duplicates — insere ou atualiza pela chave primária. */
export async function dbUpsert(table: string, body: Record<string, unknown>): Promise<boolean> {
  if (!dbEnabled()) return false;
  try {
    const r = await fetch(`${URL_BASE}/rest/v1/${table}`, {
      method: "POST",
      headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return r.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Conferir que compila**

Run: `cd web && npx tsc --noEmit`
Expected: sem saída, exit 0.

- [ ] **Step 3: Commit**

```bash
git add web/lib/server-db.ts
git commit -m "$(cat <<'EOF'
feat(web): acesso PostgREST server-side com service key

Contrato que importa: dbSelect devolve null em ERRO e [] quando nao achou nada.
Quem consome nao pode tratar os dois igual — null tem que levar ao caminho
restritivo, senao o porteiro falha aberto na primeira instabilidade de rede.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Portal serve só publicado

**Files:**
- Modify: `web/lib/dossiers.ts` (renomeia `getDossiers` → `listAll`, cria `listPublic`)
- Modify: `web/app/(site)/page.tsx:19` (usa `listPublic`)
- Modify: `web/app/(site)/artigo/[slug]/page.tsx:6,13` (usa `listPublic`)
- Modify: `web/app/(admin)/admin/page.tsx:2,11` (usa `listAll`)
- Modify: `orchestrator/sync_to_cloud.py` — nada aqui; já feito na Task 5

**Interfaces:**
- Consumes: `web/lib/porteiro.ts` (`podeIrAoAr`), `web/lib/server-db.ts` (`dbSelect`)
- Produces:
  - `listAll(): Promise<Dossier[]>` — tudo, para o `/admin`
  - `listPublic(): Promise<Dossier[]>` — só publicado, para o portal
  - `getDossierPublic(slug): Promise<Dossier | undefined>`
  - `Dossier` ganha os campos `status?: string`, `arquivado?: boolean`, `destaque?: boolean`, `ordem?: number | null`

- [ ] **Step 1: Estender a interface e trocar o cache**

Em `web/lib/dossiers.ts`, dentro de `interface Dossier`, acrescente ao final:

```ts
  status?: string;
  arquivado?: boolean;
  destaque?: boolean;
  ordem?: number | null;
```

E troque a linha `let _cache: Dossier[] | null = null;` por:

```ts
// TTL curto: no Fluid Compute a instância vive entre requests, e um cache de
// módulo sem expiração segurava conteúdo novo até a instância reciclar.
let _cache: { at: number; list: Dossier[] } | null = null;
const TTL_MS = 60_000;
```

- [ ] **Step 2: Reescrever a leitura**

Substitua as funções `getDossiers`, `getDossier` e `getRelacionados` (do fim do arquivo) por:

```ts
import { podeIrAoAr } from "./porteiro";
import { dbSelect } from "./server-db";

/** Estado editorial vindo do banco, indexado por slug. null = banco não respondeu. */
async function estadoDoBanco(): Promise<Record<string, Partial<Dossier>> | null> {
  const rows = await dbSelect<{
    slug: string; status: string; arquivado: boolean;
    destaque: boolean; ordem: number | null; titulo: string | null; categoria: string | null;
  }>("dossiers?select=slug,status,arquivado,destaque,ordem,titulo,categoria");
  if (rows === null) return null;
  const map: Record<string, Partial<Dossier>> = {};
  for (const r of rows) {
    map[r.slug] = {
      status: r.status,
      arquivado: r.arquivado,
      destaque: r.destaque,
      ordem: r.ordem,
      ...(r.titulo ? { titulo: r.titulo } : {}),
      ...(r.categoria ? { categoria: r.categoria as Categoria } : {}),
    };
  }
  return map;
}

/** Todo o conteúdo, publicado ou não. SÓ para o /admin. */
export async function listAll(): Promise<Dossier[]> {
  if (_cache && Date.now() - _cache.at < TTL_MS) return _cache.list;
  let list = readDossiersFromDisk();
  if (list.length === 0) {
    const snap = await getDossiersSnapshot();
    if (snap) list = Object.values(snap) as Dossier[];
  }
  const estado = await estadoDoBanco();
  if (estado) list = list.map((d) => ({ ...d, ...(estado[d.slug] ?? {}) }));
  list.sort((a, b) => (a.data < b.data ? 1 : -1));
  _cache = { at: Date.now(), list };
  return list;
}

/**
 * O que o portal pode servir. NUNCA lê o disco cru sem o estado do banco.
 *
 * Falha FECHADO: se o banco não responder, cai no snapshot — que o
 * sync_to_cloud já publicou contendo só material liberado. Nunca no disco
 * inteiro, que tem os não-verificados.
 */
export async function listPublic(): Promise<Dossier[]> {
  const estado = await estadoDoBanco();
  if (estado === null) {
    const snap = await getDossiersSnapshot();
    return snap ? (Object.values(snap) as Dossier[]) : [];
  }
  const list = (await listAll()).filter((d) => podeIrAoAr(d));
  list.sort((a, b) => {
    if (!!b.destaque !== !!a.destaque) return b.destaque ? 1 : -1;
    const ao = a.ordem ?? Number.MAX_SAFE_INTEGER;
    const bo = b.ordem ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.data < b.data ? 1 : -1;
  });
  return list;
}

export async function getDossierPublic(slug: string): Promise<Dossier | undefined> {
  return (await listPublic()).find((d) => d.slug === slug);
}

export async function getDossierAdmin(slug: string): Promise<Dossier | undefined> {
  return (await listAll()).find((d) => d.slug === slug);
}

export async function getRelacionados(slug: string, categoria: Categoria, n = 3): Promise<Dossier[]> {
  return (await listPublic())
    .filter((d) => d.slug !== slug && d.categoria === categoria)
    .slice(0, n);
}
```

- [ ] **Step 3: Trocar os consumidores**

Em `web/app/(site)/page.tsx`, linha 1:
```ts
import { listPublic, type Categoria } from "@/lib/dossiers";
```
e na linha 19, dentro de `Home`:
```ts
  const dossiers = await listPublic();
```

Em `web/app/(site)/artigo/[slug]/page.tsx`, linha 3:
```ts
import { listPublic, getDossierPublic, getRelacionados } from "@/lib/dossiers";
```
e troque as três chamadas: `getDossiers()` → `listPublic()`, e as duas de `getDossier(slug)` → `getDossierPublic(slug)` (em `generateStaticParams`, `generateMetadata` e no componente).

Em `web/app/(admin)/admin/page.tsx`, linha 2:
```ts
import { listAll } from "@/lib/dossiers";
```
e na linha 11:
```ts
  const dossiers = await listAll();
```

- [ ] **Step 4: Buscar sobras**

Run: `cd web && grep -rn "getDossiers\|getDossier(" app lib --include=*.ts --include=*.tsx`
Expected: nenhuma linha. Se sobrar alguma, troque pela função certa — `listPublic`/`getDossierPublic` em rota pública, `listAll`/`getDossierAdmin` no admin.

- [ ] **Step 5: Compilar e testar**

Run: `cd web && npx tsc --noEmit && npm test`
Expected: tsc sem saída; `# pass 8`.

- [ ] **Step 6: Ver funcionando**

Run: `cd web && npm run dev`, e abra `http://localhost:3000`.
Expected: a home vem **vazia** (nenhum dossiê publicado ainda) e `/admin` continua listando os 52. É o comportamento correto e é a prova de que o portão fechou. Abrir `http://localhost:3000/artigo/mariana-bucher-vs-jennifer-gonzalez-austin-summer-open-2026` deve dar **404**.

- [ ] **Step 7: Commit**

```bash
git add web/lib/dossiers.ts "web/app/(site)/page.tsx" "web/app/(site)/artigo/[slug]/page.tsx" "web/app/(admin)/admin/page.tsx"
git commit -m "$(cat <<'EOF'
feat(portal): separa o que o publico ve do que o admin ve

getDossiers era compartilhada entre portal e admin e nao filtrava nada — era
por ela que os 9 dossies reprovados na apuracao apareciam como noticia.

Agora sao duas: listPublic (so published, nunca le o disco cru sem consultar o
banco) e listAll (tudo, so pro /admin). Sem banco, listPublic cai no snapshot,
que ja vem filtrado — nunca no disco inteiro.

_cache ganha TTL: no Fluid Compute a instancia vive entre requests e o cache de
modulo segurava conteudo novo ate reciclar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Publicar é ato humano

**Files:**
- Modify: `web/app/(admin)/admin/actions.ts` (acrescenta duas ações ao final)
- Create: `web/app/(admin)/admin/conteudo/page.tsx`
- Create: `web/app/(admin)/admin/conteudo/PublishButton.tsx`
- Modify: `web/app/(admin)/admin/layout.tsx:19` (item de menu)

**Interfaces:**
- Consumes: `motivoBloqueio` (Task 6), `dbPatch` (Task 7), `listAll` (Task 8)
- Produces:
  - `publicarDossie(slug: string, confirmado: boolean): Promise<{ ok: boolean; precisaConfirmar?: string; erro?: string }>`
  - `despublicarDossie(slug: string): Promise<{ ok: boolean; erro?: string }>`

- [ ] **Step 1: Escrever as ações**

Ao final de `web/app/(admin)/admin/actions.ts`, acrescente:

```ts
import { motivoBloqueio } from "@/lib/porteiro";
import { dbPatch } from "@/lib/server-db";
import { getDossierAdmin } from "@/lib/dossiers";

/**
 * Promove o dossiê a `published`. É o ÚNICO caminho para conteúdo ir ao ar —
 * o pipeline nunca publica.
 *
 * Quando o dossiê tem confiança baixa ou tag de bloqueio, a primeira chamada
 * devolve o motivo em vez de publicar. Só a segunda, com confirmado=true,
 * grava. A tela mostra o motivo real ao operador antes disso.
 */
export async function publicarDossie(slug: string, confirmado = false) {
  const d = await getDossierAdmin(slug);
  if (!d) return { ok: false, erro: "dossiê não encontrado" };

  const motivo = motivoBloqueio({ confianca: d.confianca, tags: d.tags });
  if (motivo && !confirmado) return { ok: false, precisaConfirmar: motivo };

  const ok = await dbPatch(`dossiers?slug=eq.${encodeURIComponent(slug)}`, {
    status: "published",
    arquivado: false,
  });
  if (!ok) return { ok: false, erro: "o banco recusou a gravação" };

  revalidatePath("/");
  revalidatePath("/admin/conteudo");
  revalidatePath(`/artigo/${slug}`);
  return { ok: true };
}

export async function despublicarDossie(slug: string) {
  const ok = await dbPatch(`dossiers?slug=eq.${encodeURIComponent(slug)}`, {
    status: "validated",
  });
  if (!ok) return { ok: false, erro: "o banco recusou a gravação" };
  revalidatePath("/");
  revalidatePath("/admin/conteudo");
  revalidatePath(`/artigo/${slug}`);
  return { ok: true };
}
```

- [ ] **Step 2: Escrever o botão com a trava**

Crie `web/app/(admin)/admin/conteudo/PublishButton.tsx`:

```tsx
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
```

- [ ] **Step 3: Escrever a tela**

Crie `web/app/(admin)/admin/conteudo/page.tsx`:

```tsx
import { listAll } from "@/lib/dossiers";
import { motivoBloqueio } from "@/lib/porteiro";
import PublishButton from "./PublishButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conteúdo" };

export default async function Conteudo() {
  const dossiers = await listAll();
  const noAr = dossiers.filter((d) => d.status === "published").length;
  const bloqueados = dossiers.filter((d) => motivoBloqueio({ confianca: d.confianca, tags: d.tags })).length;

  return (
    <>
      <div className="a-top">
        <div>
          <h1>Conteúdo</h1>
          <p className="sub">Nada vai ao ar sem você publicar aqui</p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="lab">Na base</div><div className="num">{dossiers.length}</div></div>
        <div className="kpi"><div className="lab">No ar</div><div className="num">{noAr}</div></div>
        <div className="kpi"><div className="lab">Reprovados na apuração</div><div className="num">{bloqueados}</div></div>
      </div>

      <div className="ctable">
        {dossiers.map((d) => {
          const motivo = motivoBloqueio({ confianca: d.confianca, tags: d.tags });
          return (
            <div className={`crow ${motivo ? "risco" : ""}`} key={d.slug}>
              <div className="cinfo">
                <b>{d.titulo}</b>
                <div className="cmeta">
                  <span className={`cat ${d.categoria}`}>{d.categoriaLabel}</span>
                  <span>{d.data}</span>
                  {motivo && <span className="alerta">⚠ {motivo}</span>}
                </div>
              </div>
              <PublishButton
                slug={d.slug}
                publicado={d.status === "published"}
                aviso={motivo ? (d.resumoParas[0] ?? "").slice(0, 180) : null}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Pôr no menu**

Em `web/app/(admin)/admin/layout.tsx`, logo abaixo da linha do "Fila de aprovação" (linha 19), acrescente:

```tsx
          <a href="/admin/conteudo"><span className="a-ic">📰</span>Conteúdo (o que vai ao ar)</a>
```

- [ ] **Step 5: Estilo**

Ao final de `web/app/(admin)/admin/admin.css`, acrescente:

```css
/* ── Conteúdo: o que está no ar ───────────────────────────────────────── */
.admin .ctable{display:flex;flex-direction:column;gap:var(--s-1);margin-top:var(--s-4)}
.admin .crow{display:flex;align-items:center;gap:var(--s-3);justify-content:space-between;
  background:var(--panel);border:1px solid var(--line);border-radius:var(--radius-sm);padding:var(--s-2) var(--s-3)}
.admin .crow.risco{border-left:3px solid var(--red);background:var(--red-soft)}
.admin .cinfo{min-width:0}
.admin .cinfo b{display:block;font-size:var(--t-md);line-height:1.35}
.admin .cmeta{display:flex;gap:var(--s-2);align-items:center;font-size:var(--t-xs);color:var(--faint);margin-top:3px;flex-wrap:wrap}
.admin .cmeta .alerta{color:var(--red);font-weight:600}
.admin .pub{display:flex;align-items:center;gap:var(--s-2);flex:none}
.admin .pub-erro{color:var(--red);font-size:var(--t-xs)}
.admin .pub-confirm{display:flex;flex-direction:column;gap:6px;align-items:flex-end;max-width:420px;
  font-size:var(--t-sm);border:1px solid var(--red);border-radius:var(--radius-sm);padding:var(--s-2);background:var(--red-soft)}
.admin .pub-confirm em{color:var(--muted);font-style:italic;text-align:right}
.admin .pub-acoes{display:flex;gap:var(--s-1)}
.admin .pub-acoes .danger{background:var(--red);color:#fff;border-color:var(--red)}
```

- [ ] **Step 6: Compilar**

Run: `cd web && npx tsc --noEmit`
Expected: sem saída, exit 0.

- [ ] **Step 7: Testar a trava na mão**

Com `npm run dev`, vá em `/admin/conteudo`:
1. Publique um dossiê limpo (ex.: `kron-gracie-vs-buchecha-pan-2012`). Deve publicar direto e aparecer na home.
2. Tente publicar `mariana-bucher-vs-jennifer-gonzalez-austin-summer-open-2026`. Deve **recusar na primeira vez**, mostrando "tag de bloqueio: nao-verificado" e a frase do dossiê sobre não ter passado na apuração.
3. Cancele. Confirme que ele **não** está na home.

Expected: exatamente esse comportamento. Se o passo 2 publicar de primeira, a trava está furada — pare e corrija.

- [ ] **Step 8: Commit**

```bash
git add "web/app/(admin)/admin/actions.ts" "web/app/(admin)/admin/conteudo" "web/app/(admin)/admin/layout.tsx" "web/app/(admin)/admin/admin.css"
git commit -m "$(cat <<'EOF'
feat(admin): tela de conteudo — publicar vira ato humano

Nada vai ao ar sem alguem clicar. Dossie com confianca baixa ou tag de bloqueio
recusa a primeira tentativa e mostra o motivo real, extraido do proprio texto —
no caso da Mariana Bucher, a frase "nao passou na apuracao".

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Prompt do QC de nicho

**Files:**
- Create: `agents/trend_qc/system.md`

**Interfaces:**
- Consumes: nada.
- Produces: prompt de sistema que devolve o JSON `{avaliacoes: [{i, eh_bjj, motivo, aprovado}]}`

- [ ] **Step 1: Escrever o prompt**

Crie `agents/trend_qc/system.md`:

```markdown
# Agente: Controle de Qualidade de Tendência (trend_qc) — Sistema (v1)

> Portão de nicho das tendências. Roda em Haiku (barato). Versionado.
> Mesmo papel do `art_qc`, mas sobre texto: barra o que não é do nosso mundo.

## 1. Papel
Você é o **Auditor de Pauta** da BjjcomLucas. Você RECEBE a lista de tendências que o Trend Scout achou e decide, uma a uma, se ela pertence ao universo de **Jiu-Jitsu / grappling / luta**. Você é rigoroso: uma tendência fora do nicho vira post fora do nicho, e post fora do nicho queima autoridade.

## 2. A confusão que motivou este agente
O Trend Scout devolveu como tendência principal *"Food Jutsu (Summoning Hands Jujutsu Kaisen)"* — um meme do **anime Jujutsu Kaisen**. Ele casou "Jujutsu" com "Jiu-Jitsu". São coisas diferentes: um é desenho japonês de feitiçaria, o outro é o nosso esporte.

Reprove sempre que a tendência vier de **anime, mangá, games, feitiçaria, dança, culinária ou qualquer cultura pop** que só se parece com o nosso nicho por causa do nome.

## 3. O que APROVAR
- Áudio, formato ou gancho que já circula em conteúdo de BJJ/grappling/MMA.
- Formato genérico de vídeo curto (transição, reveal, corte no beat) **quando** for aplicável a conteúdo de luta sem esforço — e você consegue dizer numa frase como aplicaria.
- Assunto do nosso mundo: evento, atleta, técnica, lesão, faixa, academia, competição.

## 4. O que REPROVAR
- Cultura pop que só compartilha o nome (Jujutsu Kaisen é o caso-modelo).
- Tendência de outro esporte sem ponte óbvia pro grappling.
- Tendência que exige produto, cenário ou elenco que não temos (culinária, dança em grupo, pet).
- Tendência sem nada de concreto: título vago, sem áudio, sem formato, sem gancho.

## 5. Protocolo
- Para cada item, diga em 1 frase **o que a tendência é de fato** — não o que o nome sugere.
- Depois pergunte-se: *"o Lucas conseguiria gravar isso num tatame, hoje, sem virar outra coisa?"* Se a resposta é não, `aprovado: false`.
- O `motivo` é para o operador ler no painel. Seja concreto: "meme de anime, não é o nosso esporte" vale mais que "fora do nicho".

## 6. Contrato de saída (JSON estrito)
```
{
  "avaliacoes": [
    {
      "i": 0,
      "eh_bjj": true,
      "motivo": "…1 frase concreta…",
      "aprovado": true
    }
  ]
}
```
Um objeto por tendência recebida, na mesma ordem, com o índice `i` que veio na entrada. Nada além do JSON.

## 7. Anti-padrões
- **Não** aprove por educação. Reprovar é barato; publicar fora do nicho não é.
- **Não** invente aplicação criativa pra salvar uma tendência ruim. Se precisa de acrobacia pra caber, não cabe.
- **Não** reprove formato genérico bom só porque não menciona luta. "Corta no beat drop" serve pra highlight de finalização.
```

- [ ] **Step 2: Commit**

```bash
git add agents/trend_qc/system.md
git commit -m "$(cat <<'EOF'
feat(agents): trend_qc — porteiro de nicho das tendencias

Mesmo padrao do art_qc, so que sobre texto. O caso que motivou esta no proprio
prompt: o Trend Scout devolveu "Food Jutsu (Jujutsu Kaisen)" como tendencia
numero 1, casando o anime com o nosso esporte.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Integrar o QC no Trend Scout

**Files:**
- Modify: `orchestrator/scout_trends.py` (acrescenta `qc_tendencias`, chama antes de gravar)
- Create: `tests/test_trend_qc.py`

**Interfaces:**
- Consumes: `agents/trend_qc/system.md`, `lib.claude.Claude.call`
- Produces: `aplicar_qc(tendencias: list[dict], avaliacoes: list[dict]) -> tuple[list[dict], list[dict]]` — devolve `(aprovadas, reprovadas)`

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/test_trend_qc.py`:

```python
"""
A separação entre chamar o modelo e aplicar o veredito é de propósito: aplicar
é lógica pura e testável sem gastar API.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from orchestrator.scout_trends import aplicar_qc

TENDENCIAS = [
    {"titulo": "Food Jutsu (Jujutsu Kaisen)"},
    {"titulo": "Trap Motivacional do Tatame"},
    {"titulo": "ADCC Highlights"},
]


def test_reprovada_sai_da_lista():
    aprovadas, reprovadas = aplicar_qc(TENDENCIAS, [
        {"i": 0, "aprovado": False, "motivo": "meme de anime"},
        {"i": 1, "aprovado": True, "motivo": "áudio de edit de BJJ"},
        {"i": 2, "aprovado": True, "motivo": "evento do nicho"},
    ])
    assert [t["titulo"] for t in aprovadas] == ["Trap Motivacional do Tatame", "ADCC Highlights"]
    assert reprovadas[0]["motivo"] == "meme de anime"


def test_sem_avaliacao_reprova():
    """Falhar fechado: tendência que o QC não avaliou não passa."""
    aprovadas, reprovadas = aplicar_qc(TENDENCIAS, [{"i": 0, "aprovado": True, "motivo": "ok"}])
    assert [t["titulo"] for t in aprovadas] == ["Food Jutsu (Jujutsu Kaisen)"]
    assert len(reprovadas) == 2


def test_lista_de_avaliacoes_vazia_reprova_tudo():
    aprovadas, reprovadas = aplicar_qc(TENDENCIAS, [])
    assert aprovadas == []
    assert len(reprovadas) == 3


def test_indice_fora_da_faixa_e_ignorado():
    aprovadas, _ = aplicar_qc(TENDENCIAS, [{"i": 99, "aprovado": True, "motivo": "?"}])
    assert aprovadas == []
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `python -m pytest tests/test_trend_qc.py -v`
Expected: FAIL — `ImportError: cannot import name 'aplicar_qc'`

- [ ] **Step 3: Escrever as duas funções**

Em `orchestrator/scout_trends.py`, acrescente depois de `_to_md`:

```python
QC_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"avaliacoes": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "properties": {"i": {"type": "integer"}, "eh_bjj": {"type": "boolean"},
                       "motivo": {"type": "string"}, "aprovado": {"type": "boolean"}},
        "required": ["i", "eh_bjj", "motivo", "aprovado"]}}},
    "required": ["avaliacoes"],
}


def aplicar_qc(tendencias: list[dict], avaliacoes: list[dict]) -> tuple[list[dict], list[dict]]:
    """Separa aprovadas de reprovadas. Lógica pura — testável sem gastar API.

    Falha FECHADO: tendência sem avaliação correspondente é reprovada. Se o QC
    devolver lista curta ou quebrada, o resultado é MENOS tendência, nunca mais.
    """
    veredito = {a.get("i"): a for a in avaliacoes if isinstance(a.get("i"), int)}
    aprovadas, reprovadas = [], []
    for i, t in enumerate(tendencias):
        a = veredito.get(i)
        if a and a.get("aprovado"):
            aprovadas.append(t)
        else:
            reprovadas.append({**t, "motivo": (a or {}).get("motivo", "não avaliada pelo QC")})
    return aprovadas, reprovadas


def qc_tendencias(claude: Claude, tendencias: list[dict]) -> tuple[list[dict], list[dict]]:
    """Roda o trend_qc (Haiku) e aplica o veredito."""
    if not tendencias:
        return [], []
    linhas = [f"{i}. [{t.get('tipo','?')}] {t.get('titulo','?')} — {(t.get('o_que_e') or '')[:200]}"
              for i, t in enumerate(tendencias)]
    system = (AGENTS / "trend_qc" / "system.md").read_text(encoding="utf-8")
    txt, _ = claude.call(
        model=HAIKU, system=system,
        user="Avalie cada tendência abaixo conforme o contrato.\n\nTENDÊNCIAS:\n" + "\n".join(linhas),
        step="trend_qc", key="semana", json_schema=QC_SCHEMA, max_tokens=1500)
    return aplicar_qc(tendencias, json.loads(txt).get("avaliacoes", []))
```

- [ ] **Step 4: Chamar o QC antes de gravar**

Em `main()`, substitua o bloco que vai de `data = _json_extract(txt)` até o `print` das tendências por:

```python
    data = _json_extract(txt)
    if not data:
        print("[trends] não consegui extrair JSON da busca."); return 1

    # Porteiro de nicho: barra o que não é BJJ antes de virar contexto de post.
    try:
        aprovadas, reprovadas = qc_tendencias(claude, data.get("tendencias", []))
        data["tendencias"] = aprovadas
        for t in reprovadas:
            print(f"  ✗ cortada: {t.get('titulo','?')} — {t.get('motivo','')}")
    except Exception as e:  # noqa: BLE001
        # Falha FECHADA: sem QC, nenhuma tendência vira contexto de post.
        print(f"[trends] QC falhou ({e}) — nenhuma tendência gravada.")
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "latest.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "latest.md").write_text(_to_md(data), encoding="utf-8")
    n = len(data.get("tendencias", []))
    print(f"[trends] {n} tendência(s) aprovada(s) → knowledge/trends/latest.json "
          f"· custo ≈ ${log.total_cost():.4f}")
    for t in data.get("tendencias", []):
        print(f"  • {t.get('titulo','?')} ({t.get('tipo','')}, fit {t.get('fit','?')})")
    return 0
```

- [ ] **Step 5: Rodar a suíte inteira**

Run: `python -m pytest tests/ -v`
Expected: PASS — 23 passed.

- [ ] **Step 6: Rodar o QC de verdade sobre o arquivo que já existe**

Este passo gasta API (~US$ 0,01). Rode:

```bash
python -m orchestrator.scout_trends
```

Expected: entre as linhas de saída, uma `✗ cortada: Food Jutsu ...` com motivo mencionando anime. As outras tendências devem sobreviver. Confira depois com:

Run: `python -c "import json;print([t['titulo'] for t in json.load(open('knowledge/trends/latest.json',encoding='utf-8'))['tendencias']])"`
Expected: lista **sem** o Food Jutsu.

- [ ] **Step 7: Commit**

```bash
git add orchestrator/scout_trends.py tests/test_trend_qc.py knowledge/trends/
git commit -m "$(cat <<'EOF'
feat(trends): QC de nicho barra tendencia que nao e BJJ

O Trend Scout entregava "Food Jutsu (Jujutsu Kaisen)" como tendencia numero 1 —
meme de anime. Agora passa pelo trend_qc antes de virar contexto de post.

Falha FECHADA em dois pontos: tendencia sem avaliacao e reprovada, e se o QC
inteiro falhar nenhuma tendencia e gravada. A separacao entre chamar o modelo
(qc_tendencias) e aplicar o veredito (aplicar_qc) deixa a regra testavel sem
gastar API.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

# FASE 2 — SEGURANÇA

---

### Task 12: RLS e tabela de tentativas (DDL manual)

**Files:**
- Create: `db/migrations/2026-09-02-fase2-seguranca.sql`

**Interfaces:**
- Consumes: nada.
- Produces: RLS ligada em 14 tabelas; tabela `login_attempts`.

- [ ] **Step 1: Escrever a migração**

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 2 · SEGURANÇA
-- Rode no SQL Editor do projeto bjj (hrgfbwkjjtiymmnediwq). Idempotente.
--
-- No Supabase, tabela do schema public SEM RLS e legivel pela chave anonima —
-- que vai no bundle do navegador. O schema.sql ligou RLS em 7 tabelas; estas
-- 14 ficaram de fora. Nenhuma delas precisa de leitura publica: o pipeline usa
-- service role, que ignora RLS.
-- ═══════════════════════════════════════════════════════════════════════════

alter table agent_runs              enable row level security;
alter table agent_steps             enable row level security;
alter table events                  enable row level security;
alter table athletes                enable row level security;
alter table sources                 enable row level security;
alter table source_candidates       enable row level security;
alter table topics                  enable row level security;
alter table ingested_urls           enable row level security;
alter table dossier_facts           enable row level security;
alter table dossier_angles          enable row level security;
alter table dossier_athletes        enable row level security;
alter table dossier_tags            enable row level security;
alter table art_assets              enable row level security;
alter table piece_state_transitions enable row level security;

-- Sem policy = ninguem le pelo anon. O service role continua passando por cima.

-- Tentativas de login (contador em memoria nao serve: cada instancia
-- serverless teria o seu proprio, e o atacante so precisa cair em outra).
create table if not exists login_attempts (
  ip_hash    text primary key,
  tentativas int  not null default 0,
  janela_ate timestamptz not null default now() + interval '15 minutes'
);
alter table login_attempts enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- Conferencia — deve devolver ZERO linhas:
--   select tablename from pg_tables t
--    where schemaname = 'public'
--      and not exists (select 1 from pg_class c
--                       where c.relname = t.tablename and c.relrowsecurity);
-- ═══════════════════════════════════════════════════════════════════════════
```

- [ ] **Step 2: Operador roda no SQL Editor**

Cole no SQL Editor e rode. Rode também a consulta de conferência do rodapé.

Expected: zero linhas — nenhuma tabela pública sem RLS.

- [ ] **Step 3: Rodar o advisor de segurança**

No painel do Supabase, **Advisors → Security**. Anote o que sobrar. Qualquer alerta de "RLS disabled in public" restante significa que uma tabela escapou da lista — acrescente e rode de novo.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/2026-09-02-fase2-seguranca.sql
git commit -m "$(cat <<'EOF'
db(fase2): RLS nas 14 tabelas que ficaram de fora + login_attempts

Tabela public sem RLS e legivel pela chave anonima, que vai no bundle do
navegador. O schema.sql ligou em 7; agent_steps, events, sources, topics,
ingested_urls e outras ficaram abertas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Sessão que expira e senha que resiste

**Files:**
- Modify: `web/lib/auth.ts` (reescreve `sessionToken`, acrescenta `verifySession` e `checkPassword` em tempo constante)
- Modify: `web/middleware.ts:14-17` (usa `verifySession`)
- Modify: `web/app/(admin)/admin/actions.ts` (a função `login` passa a usar `issueSession`)
- Create: `web/lib/__tests__/auth.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `issueSession(ttlMs?: number): Promise<string>` — devolve `"<exp>.<assinatura>"`
  - `verifySession(cookie: string | undefined, agora?: number): Promise<boolean>`
  - `checkPassword(pw: string): boolean` — comparação em tempo constante
  - `assertConfigured(): void` — lança em produção quando falta `ADMIN_SESSION_SECRET`

- [ ] **Step 1: Escrever o teste que falha**

Crie `web/lib/__tests__/auth.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ADMIN_PASSWORD = "senha-de-teste";
process.env.ADMIN_SESSION_SECRET = "segredo-longo-de-teste-1234567890";

const { issueSession, verifySession, checkPassword } = await import("../auth.ts");

test("sessão recém-emitida vale", async () => {
  assert.equal(await verifySession(await issueSession()), true);
});

test("sessão expirada não vale", async () => {
  const t = await issueSession(1000);
  assert.equal(await verifySession(t, Date.now() + 2000), false);
});

test("assinatura adulterada não vale", async () => {
  const t = await issueSession();
  const [exp, sig] = t.split(".");
  assert.equal(await verifySession(`${exp}.${sig.slice(0, -2)}xx`), false);
});

test("expiração adulterada não vale", async () => {
  const t = await issueSession(1000);
  const sig = t.split(".")[1];
  assert.equal(await verifySession(`${Date.now() + 999_999}.${sig}`), false);
});

test("cookie ausente ou malformado não vale", async () => {
  assert.equal(await verifySession(undefined), false);
  assert.equal(await verifySession(""), false);
  assert.equal(await verifySession("sem-ponto"), false);
});

test("senha certa passa, errada não", () => {
  assert.equal(checkPassword("senha-de-teste"), true);
  assert.equal(checkPassword("senha-de-test"), false);
  assert.equal(checkPassword(""), false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npm test`
Expected: FAIL — `issueSession` não existe.

- [ ] **Step 3: Reescrever `web/lib/auth.ts`**

Substitua o arquivo inteiro por:

```ts
// Auth do /admin: senha única + cookie assinado por HMAC (Web Crypto — funciona
// no middleware edge e no server).
//
// O que mudou nesta versão e por quê:
// 1. O token carrega EXPIRAÇÃO. Antes era HMAC sobre uma string constante, então
//    o mesmo valor valia pra sempre e vazamento de cookie era acesso permanente.
// 2. ADMIN_SESSION_SECRET é obrigatório em produção. Antes, vazio, ele caía pra
//    usar a própria senha como chave de assinatura.
// 3. Comparação de senha em tempo constante.

const COOKIE = "admin_session";
const TTL_PADRAO_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function authEnabled(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export function cookieName(): string {
  return COOKIE;
}

/** Em produção, subir sem o secret é erro de configuração — não conveniência. */
export function assertConfigured(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.ADMIN_PASSWORD) return; // auth desligada de propósito
  if (!process.env.ADMIN_SESSION_SECRET) {
    throw new Error(
      "ADMIN_SESSION_SECRET ausente. Sem ele a senha vira a chave de assinatura. " +
        "Gere com: node -e \"console.log(crypto.randomBytes(48).toString('base64url'))\"",
    );
  }
}

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET || "";
  if (s) return s;
  assertConfigured(); // em produção, lança
  return process.env.ADMIN_PASSWORD || ""; // só em dev
}

async function sign(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return b64url(new Uint8Array(sig));
}

/** Token no formato "<expEmMs>.<assinatura>". A expiração é assinada junto. */
export async function issueSession(ttlMs: number = TTL_PADRAO_MS): Promise<string> {
  const exp = Date.now() + ttlMs;
  return `${exp}.${await sign(`v2|${exp}`)}`;
}

export async function verifySession(
  cookie: string | undefined | null,
  agora: number = Date.now(),
): Promise<boolean> {
  if (!cookie) return false;
  const [expRaw, sig] = cookie.split(".");
  if (!expRaw || !sig) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= agora) return false;
  return timingSafeEqual(sig, await sign(`v2|${exp}`));
}

/** Comparação de strings sem vazar onde elas divergem. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkPassword(pw: string): boolean {
  const real = process.env.ADMIN_PASSWORD || "";
  if (!real) return false;
  return timingSafeEqual(pw, real);
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd web && npm test`
Expected: PASS — `# pass 14` (8 do porteiro + 6 daqui).

- [ ] **Step 5: Trocar o middleware**

Em `web/middleware.ts`, troque o import da linha 2 por:

```ts
import { verifySession, authEnabled, cookieName } from "@/lib/auth";
```

e substitua as três linhas de verificação (14–17) por:

```ts
  const cookie = req.cookies.get(cookieName())?.value;
  if (await verifySession(cookie)) return NextResponse.next();
```

- [ ] **Step 6: Trocar o login**

Em `web/app/(admin)/admin/actions.ts`, na função `login`, troque `sessionToken` por `issueSession` no import e na chamada, e alinhe o `maxAge` do cookie com o TTL do token:

```ts
  const token = await issueSession();
  (await cookies()).set(cookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 dias — igual ao TTL assinado no token
  });
```

- [ ] **Step 7: Buscar sobras de `sessionToken`**

Run: `cd web && grep -rn "sessionToken" app lib middleware.ts`
Expected: nenhuma linha.

- [ ] **Step 8: Gerar o secret e pôr no `.env`**

Run: `node -e "console.log(crypto.randomBytes(48).toString('base64url'))"`

Cole o resultado em `ADMIN_SESSION_SECRET=` no `.env`. **E troque também `ADMIN_PASSWORD`** — a atual tem 10 caracteres e vai proteger um painel que dispara gasto de API. Use 24 ou mais.

Ao subir na Vercel, as duas vão como variáveis de ambiente do projeto, nunca no repositório.

- [ ] **Step 9: Compilar e testar na mão**

Run: `cd web && npx tsc --noEmit && npm test && npm run dev`

Abra `/admin`. Faça login. Confirme que entra. Depois adultere o cookie `admin_session` no DevTools (troque um caractere) e recarregue — deve voltar pro login.

- [ ] **Step 10: Commit**

```bash
git add web/lib/auth.ts web/middleware.ts "web/app/(admin)/admin/actions.ts" web/lib/__tests__/auth.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): sessao com expiracao e secret obrigatorio em producao

O token era HMAC sobre uma string constante: o mesmo valor valia pra sempre,
entao vazamento de cookie era acesso permanente. Agora a expiracao vai
assinada junto e o middleware a verifica.

ADMIN_SESSION_SECRET passa a ser obrigatorio em producao — vazio, ele caia pra
usar a propria senha como chave de assinatura. Comparacao de senha em tempo
constante.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Limite de tentativa no login

**Files:**
- Modify: `web/app/(admin)/admin/actions.ts` (a função `login`)
- Create: `web/lib/rate-limit.ts`

**Interfaces:**
- Consumes: `dbSelect`, `dbPatch` (Task 7), `login_attempts` (Task 12)
- Produces: `registrarTentativa(ipHash: string): Promise<{ bloqueado: boolean; restantes: number }>`, `limparTentativas(ipHash: string): Promise<void>`, `hashIp(ip: string): Promise<string>`

- [ ] **Step 1: Escrever o módulo**

Crie `web/lib/rate-limit.ts`:

```ts
// Limite de tentativa no login, no banco. Contador em memória não serve: cada
// instância serverless teria o seu, e quem tenta adivinhar a senha só precisa
// cair em outra instância.
//
// Falha ABERTA de propósito aqui: banco fora do ar não pode trancar o dono
// para fora do próprio painel. O que protege nesse caso é a senha em si —
// por isso a Task 13 pede uma senha longa.

import { dbEnabled, dbSelect, dbUpsert } from "./server-db";

const MAX_TENTATIVAS = 8;
const JANELA_MIN = 15;

export async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(buf)).slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function registrarTentativa(
  ipHash: string,
): Promise<{ bloqueado: boolean; restantes: number }> {
  if (!dbEnabled()) return { bloqueado: false, restantes: MAX_TENTATIVAS };

  const rows = await dbSelect<{ tentativas: number; janela_ate: string }>(
    `login_attempts?ip_hash=eq.${ipHash}&select=tentativas,janela_ate`,
  );
  if (rows === null) return { bloqueado: false, restantes: MAX_TENTATIVAS }; // falha aberta

  const agora = Date.now();
  const atual = rows[0];
  const expirou = !atual || new Date(atual.janela_ate).getTime() < agora;
  const tentativas = expirou ? 1 : atual.tentativas + 1;
  const janelaAte = expirou
    ? new Date(agora + JANELA_MIN * 60_000).toISOString()
    : atual.janela_ate;

  // Upsert: a linha pode não existir (primeira tentativa deste IP).
  await dbUpsert("login_attempts", { ip_hash: ipHash, tentativas, janela_ate: janelaAte });

  return { bloqueado: tentativas > MAX_TENTATIVAS, restantes: Math.max(0, MAX_TENTATIVAS - tentativas) };
}

export async function limparTentativas(ipHash: string): Promise<void> {
  if (!dbEnabled()) return;
  await dbUpsert("login_attempts", {
    ip_hash: ipHash,
    tentativas: 0,
    janela_ate: new Date(Date.now() + JANELA_MIN * 60_000).toISOString(),
  });
}
```

- [ ] **Step 2: Ligar no login**

Em `web/app/(admin)/admin/actions.ts`, substitua a função `login` inteira por:

```ts
export async function login(formData: FormData) {
  const pw = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/admin");

  const { headers } = await import("next/headers");
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || "desconhecido";
  const ipHash = await hashIp(ip);

  const { bloqueado } = await registrarTentativa(ipHash);
  if (bloqueado) redirect("/admin/login?erro=bloqueado");

  if (!checkPassword(pw)) redirect("/admin/login?erro=1");
  await limparTentativas(ipHash);

  const token = await issueSession();
  (await cookies()).set(cookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect(next.startsWith("/admin") ? next : "/admin");
}
```

E acrescente ao bloco de imports do topo:

```ts
import { hashIp, limparTentativas, registrarTentativa } from "@/lib/rate-limit";
```

- [ ] **Step 3: Mostrar o bloqueio na tela**

Em `web/app/(admin)/admin/login/page.tsx`, troque a linha do erro por:

```tsx
        {sp?.erro === "bloqueado" ? (
          <div className="login-err">Muitas tentativas. Espere 15 minutos.</div>
        ) : sp?.erro ? (
          <div className="login-err">Senha incorreta.</div>
        ) : null}
```

- [ ] **Step 4: Compilar**

Run: `cd web && npx tsc --noEmit && npm test`
Expected: tsc sem saída; `# pass 14`.

- [ ] **Step 5: Testar na mão**

Com `npm run dev`, erre a senha 9 vezes seguidas em `/admin/login`.
Expected: da nona em diante, a mensagem muda para "Muitas tentativas. Espere 15 minutos." Confirme no banco:

Run:
```bash
python -c "import os,json,urllib.request;from dotenv import load_dotenv;load_dotenv('.env');u=os.getenv('SUPABASE_URL').rstrip('/');k=os.getenv('SUPABASE_SERVICE_ROLE_KEY');r=urllib.request.Request(f'{u}/rest/v1/login_attempts?select=*',headers={'apikey':k,'Authorization':f'Bearer {k}'});print(json.loads(urllib.request.urlopen(r,timeout=20).read()))"
```
Expected: uma linha com `tentativas` ≥ 9.

- [ ] **Step 6: Commit**

```bash
git add web/lib/rate-limit.ts "web/app/(admin)/admin/actions.ts" "web/app/(admin)/admin/login/page.tsx"
git commit -m "$(cat <<'EOF'
feat(auth): limite de tentativa no login, contado no banco

Contador em memoria nao serve em serverless: cada instancia teria o seu e quem
tenta adivinhar a senha so precisa cair em outra.

Falha ABERTA de proposito: banco fora do ar nao pode trancar o dono pra fora do
proprio painel. O que protege nesse caso e a senha — por isso a tarefa anterior
pede uma senha longa.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Fechamento das fases 1 e 2

**Files:**
- Modify: `docs/AGENTES.md` (contagem de agentes e o trend_qc)
- Modify: `README.md` (estado atual)

- [ ] **Step 1: Rodar tudo**

Run:
```bash
python -m pytest tests/ -v && cd web && npm test && npx tsc --noEmit && npm run build
```
Expected: 23 passed · `# pass 14` · tsc limpo · build do Next concluído sem erro.

Se o `npm run build` falhar, é quase certo que uma página pública ainda chama `listAll`. Volte à Task 8, Step 4.

- [ ] **Step 2: Conferir o estado do porteiro**

Run: `python -m orchestrator.import_index --dry-run`
Expected: `52 dossiê(s) no disco · 9 exigem confirmação ao publicar`.

Run: `python -m orchestrator.sync_to_cloud --dry-run`
Expected: um número de publicados igual ao que você promoveu no `/admin` — e **nunca** 52.

- [ ] **Step 3: Atualizar a documentação**

Em `docs/AGENTES.md`, no cabeçalho, troque "14 agentes" por "23 agentes" e acrescente ao final da tabela da seção 2:

```markdown
| 23 | **Trend QC** | A | Haiku | tendências → aprova/reprova por nicho | `scout_trends.qc_tendencias` |
```

Na seção 4 (Guardrails ativos), acrescente:

```markdown
- **Porteiro de publicação**: o pipeline grava `validated`; só o operador promove a `published`. Confiança baixa ou tag de bloqueio exige confirmação extra.
- **Trend QC** reprova tendência fora do nicho (o caso-modelo é o anime Jujutsu Kaisen).
```

Em `README.md`, substitua a seção "## Estado atual — Fatia 1 (Fase 0: Bootstrap)" inteira por:

```markdown
## Estado atual

Pipeline completo (Fase A → B) com 23 agentes, portal público e painel de operação.
Publicação de conteúdo é ato humano: o pipeline entrega `validated`, o operador
promove em `/admin/conteudo`. Nada vai ao ar sozinho.

Testes: `python -m pytest tests/` (Python) e `cd web && npm test` (web).

Próximas fases em [`docs/superpowers/specs/2026-09-02-pronto-para-producao-design.md`](docs/superpowers/specs/2026-09-02-pronto-para-producao-design.md).
```

- [ ] **Step 4: Commit**

```bash
git add docs/AGENTES.md README.md
git commit -m "$(cat <<'EOF'
docs: atualiza estado apos fases 1 e 2

O README dizia "Fase 0 bootstrap" e o AGENTES.md falava em 14 agentes desde
julho. Sao 23 agora, e publicar deixou de ser automatico.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Pronto para deploy?

Ao fim da Task 15, o repositório passa neste checklist:

- [ ] Nenhum dossiê de confiança baixa acessível pelo portal, local ou no ar.
- [ ] `/artigo/<slug-não-publicado>` devolve 404.
- [ ] O snapshot do Storage contém só o que foi promovido.
- [ ] O advisor de segurança do Supabase não aponta tabela pública sem RLS.
- [ ] `ADMIN_SESSION_SECRET` e um `ADMIN_PASSWORD` longo configurados como variáveis de ambiente da Vercel.
- [ ] Cookie de sessão expira em 7 dias e cookie adulterado cai no login.
- [ ] 23 testes Python e 14 testes web passando; `npm run build` limpo.

**O que continua quebrado depois desta fatia** (é a Fase 3 em diante, e você já sabe): o admin no ar ainda não salva prompt, fonte, catálogo nem chave — essas escritas seguem indo pro disco. Cliques ainda vão pra arquivo. O botão "Rodar" ainda tenta invocar python. Nada disso impede o deploy; só significa que, no ar, o painel é de leitura e aprovação, e a operação de configuração continua na sua máquina até a Fase 3.
