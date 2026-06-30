# Hermes Skill: Read Runtime And Secrets

Use this skill when reviewing NaN Cloud, NAN API, local opencode configuration,
or runtime logs.

## Secret Handling

- Never print API keys, provider URLs, bearer tokens, `.env` values, or
  `opencode.json` contents.
- Report only whether required configuration exists.
- Logs may include model name, queue stats, estimated token counts, and hashed
  request fingerprints.
- Logs must not include raw prompts, raw PDF text, copied bank text, personal
  data, or provider endpoint URLs.

## Runtime Limits

Respect the configured NAN budgets:

- max 60 requests per minute per API key
- max 3 concurrent calls
- max 1.5M tokens per minute per model
- bounded queue and timeout

## Review Rules

Return `CHANGES_REQUIRED` if:

- A direct NAN `fetch` bypasses `src/infrastructure/llm/client.ts`.
- More than one replica/worker shares one API key without distributed limiting.
- Any output includes secret material or raw uploaded document content.
- `opencode.json` is committed or copied into Docker context.
