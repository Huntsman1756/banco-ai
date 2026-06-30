# Pipeline de condiciones de producto

Este flujo prepara condiciones desde documentos locales para que entren primero como `pending_review`
y luego sean aprobadas para ranking final.

## Paso 1 - Generar manifiesto de candidatos

1. Copia los TXT/PDF en:

   - `docs/Cuentas remuneradas SIN condiciones`
   - `docs/Cuentas remuneradas CON condiciones`

2. Ejecuta:

```bash
npm run import:conditions
```

Esto usa la configuración por defecto:

- origen: `docs/Cuentas remuneradas SIN condiciones`
- salida: `data/incoming-doc-candidates.json`
- los PDFs sin texto legible local no se importan; quedan registrados en `skippedDocuments`

También puedes ejecutar explícitamente:

```bash
npm run import:conditions:sin
npm run import:conditions:con
```

Y si necesitas una ruta u output distinto:

```bash
npm run import:conditions -- --source-dir "docs/Cuentas remuneradas CON condiciones" --output data/incoming-doc-candidates-con-cond.json
```

## Paso 2 - Importar manifiesto a pending_review

```bash
npm run import:conditions:pending
```

Opciones:

- `--manifest <ruta>`: usa un manifiesto distinto.
- `--only-review-required`: solo candidatos marcados para revision.
- `--min-confidence 0.70`: descartar candidatos por debajo del umbral.
- `--max-items 30`: limite de candidatos a procesar.
- `--dry-run`: validar el flujo sin persistir.

## Paso 3 - Revision manual por admin

Configura token en `.env`:

```bash
ADMIN_REVIEW_TOKEN=<valor-secreto>
```

Ruta web:

1. Abre la pestaña `Admin`.
2. Introduce `ADMIN_REVIEW_TOKEN`.
3. Carga pendientes.
4. Revisa banco, producto, TAE, comisiones, saldo, plazo, evidencias y fuente.
5. Escribe notas de revisión.
6. Pulsa `Aprobar para ranking` o `Rechazar`.

El token queda solo en `sessionStorage` del navegador.

Si no hay `DATABASE_URL` activo, el admin revisa y actualiza el catalogo local
`data/manual-product-conditions.json`. Esto permite trabajar en local, subir el
JSON revisado a GitHub y desplegarlo en la app web.

Endpoints de API alternativos:

- `GET /api/admin/conditions/pending`
- `POST /api/admin/conditions/pending/:id/approve`
- `POST /api/admin/conditions/pending/:id/reject`

Ejemplo:

```bash
curl -H "Authorization: Bearer $ADMIN_REVIEW_TOKEN" \
  http://localhost:3000/api/admin/conditions/pending

curl -X POST \
  -H "Authorization: Bearer $ADMIN_REVIEW_TOKEN" \
  -H "content-type: application/json" \
  -d '{"reviewNotes":"Aprobado tras validacion inicial"}' \
  http://localhost:3000/api/admin/conditions/pending/<versionId>/approve

curl -X POST \
  -H "Authorization: Bearer $ADMIN_REVIEW_TOKEN" \
  -H "content-type: application/json" \
  -d '{"reviewNotes":"Incompleto, requiere nuevo texto"}' \
http://localhost:3000/api/admin/conditions/pending/<versionId>/reject
```

## Paso 3.5 - Revisión Hermes y borradores editoriales

Antes de aprobar cambios grandes de catálogo o publicar contenido nuevo, ejecuta:

```bash
npm run hermes:docs
```

Hermes usa NAN a través de `src/infrastructure/llm/client.ts`, por lo que respeta
los límites de cola/concurrencia. El resultado se guarda en:

- `.agent/hermes-doc-review.json`
- `docs/articles/generated/*.md`

Hermes puede señalar bloqueos o generar borradores informativos, pero no aprueba
productos automáticamente. La aprobación sigue siendo manual mediante el flujo
admin.

Antes de revisar, Hermes carga estas skills:

- `docs/hermes/skills/read-bank-source-corpus.md`
- `docs/hermes/skills/review-product-publication.md`
- `docs/hermes/skills/draft-banking-articles.md`
- `docs/hermes/skills/read-runtime-and-secrets.md`

## Paso 4 - Cierre

Solo versiones con:

- `status = 'approved'`
- `valid_to IS NULL`

alimentan el ranking y salida de comparativa en la API de productos.

## Produccion continua

Para nuevos bancos o nuevas condiciones:

1. copiar documentos al directorio de origen,
2. regenerar manifiesto,
3. importar a `pending_review`,
4. revisar y aprobar en admin.

Para depositos, cuentas nomina u otras familias MVP, reutiliza el mismo flujo con un
directorio especifico y `--source-dir`. El importador infiere `cuenta_remunerada`,
`cuenta_nomina` o `deposito`, pero cualquier campo financiero queda siempre en
`pending_review` hasta revision.

Los PDFs que el extractor local no pueda convertir a texto no deben entrar como
producto. En produccion esos documentos deben ir a OCR/NAN o a revision manual, sin
guardar ni loguear el texto bruto del PDF.
