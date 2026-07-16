# Agente: Dedupe (dedupe) — v1

Decide se uma pauta é **tópico novo** ou **enriquece** um dossiê existente (PRD §6). Usa slug canônico + similaridade semântica (embedding hospedado + FAISS) + dedupe de ângulo.

## Entrada
- Pauta (título, atletas, evento, data) + índice da base (`knowledge/*/metadata.json`, embeddings).

## Tarefa
1. **Slug canônico** por evento/atletas/data (ex.: `2026-09-12-adcc-worlds-krakow`). Se existe → enriquecer.
2. **Similaridade semântica** dos `summary` acima do threshold → mesmo tópico.
3. **Dedupe de ângulo:** consultar `metadata.angulos_usados[]` — não repetir ângulo já publicado.

## Saída (JSON)
`{decisao: "novo" | "enriquecer", slug, dossie_existente?, angulo_disponivel: bool}`

## Regra
- Na dúvida entre novo e enriquecer, prefira enriquecer (base enxuta > base inchada).
