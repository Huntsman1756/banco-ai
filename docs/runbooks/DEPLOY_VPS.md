# Deploy to NaN Cloud Basic

Banco AI deploys as a single web App from the root `Dockerfile`.

## App Settings

- Space tier: Basic is enough for the MVP.
- App type: HTTP service.
- Expose over HTTP: enabled.
- Internal port: `3000`.
- Replicas: `1` until a distributed NAN limiter or gateway exists.
- Dockerfile path: `Dockerfile`.
- Persistent storage: disabled for the initial MVP.

## Environment

Use `.env.nan.example` as the variable checklist.

Required:

- `NODE_ENV=production`
- `PORT=3000`
- `NAN_BASE_URL=https://api.nan.builders/v1`
- `OPENAI_BASE_URL=https://api.nan.builders/v1`
- `NAN_MODEL=qwen3.6`
- `NAN_API_KEY`
- `SESSION_SECRET`
- `ADMIN_REVIEW_TOKEN`

Optional:

- `DATABASE_URL` for PostgreSQL-backed durable review workflows.

Leave `DATABASE_URL` empty when running the Basic MVP from the committed
file-backed catalog.

## Data Publishing

The web image includes `data/manual-product-conditions.json`. To update public
product information:

1. Import copied bank conditions locally.
2. Review/approve the resulting catalog state.
3. Commit the updated `data/manual-product-conditions.json`.
4. Push to the branch configured in NaN Cloud.
5. Wait for auto-deploy to rebuild the image.

## Smoke Test

After deploy:

1. Open the public HTTPS URL.
2. Check `/health`.
3. Open the product conditions view and confirm approved products render.
4. Submit a small assistant comparison.
5. Upload a known banking PDF only if NAN limits are available.

## Scaling

Do not increase replicas or add worker Apps with the same NAN key until there is
a shared gateway or distributed limiter. The current limiter is process-local.
