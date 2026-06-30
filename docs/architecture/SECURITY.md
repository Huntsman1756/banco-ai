# Security

## Sensitive data

- IBAN
- DNI/NIE
- email
- phone
- uploaded PDF content
- financial personal details
- session tokens
- API keys

## Logging

- All logs must use `src/shared/logger.ts`.
- No raw `console.log` in application code.
- Log redaction rules in `src/shared/redaction.ts` are required for all user-bound logs.

## Uploads

- PDFs must be stored outside public paths.
- Uploads expire after 30 days.
- PDF text must not be logged raw.
- Store source document path and extracted structured JSON only.

## Secrets

- Secrets are environment variables only.
- Never commit `.env`.
- Secrets may not be interpolated into logs.

## Web security

- httpOnly cookies for session data
- secure cookies in production
- SameSite Strict
- CSRF protection on POST
- password hashing with bcrypt
- rate limiting and request tracing

## Active channels

Only the web channel is active. Do not add bot-specific authentication or
runtime secrets without a new architecture decision.
