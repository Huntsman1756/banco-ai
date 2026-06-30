# Hermes Skill: Draft Banking Articles

Use this skill when generating article drafts from Banco AI documentation and
approved product data.

## Article Grounding

- Draft articles from internal docs, approved product data, and source metadata.
- Do not invent rates, requirements, fees, or rankings.
- If product data is still pending, write about the workflow or concepts rather
  than naming those products as public comparisons.
- Include internal source file references in each draft.
- Keep drafts informational, not promotional.

## Allowed Language

- comparativa informativa
- ranking por criterios introducidos
- estimacion
- simulacion
- producto destacado segun criterios

## Forbidden Language

- te recomiendo contratar
- debes contratar
- la mejor opcion para ti
- asesoramiento personalizado
- recomendacion de inversion

## Draft Output

For each draft provide:

- slug
- title
- summary
- outline
- source_files

Prefer fewer, higher-quality drafts when the catalog is not publication-ready.
