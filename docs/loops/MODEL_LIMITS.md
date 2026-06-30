# Internal Model Limits

Provider limits are interpreted into conservative operating limits. The goal is
to avoid burning NAN GPU capacity during unattended Hermes loops.

## NAN API key limits

- max requests per API key: 60 rpm
- max concurrent requests per API key: 3
- max tokens per minute per model: 1.5M tpm
- rerank endpoint: 1000 rpm

The loop engine must enforce these limits before calling external APIs. If a
task cannot run inside these budgets, split the task or stop before the API call.

## Model inventory

### Builder: `qwen3.6`

- type: MoE, 35B total, 3B active per token
- quantization: FP8
- context: 256K tokens
- speculative decoding: MTP, roughly 2x throughput
- default sampling for free-form generation: `temperature=0.6`, `top_p=0.95`
- supports XML tool calling, reasoning mode, multimodal vision, SSE streaming
- max concurrent builder calls in Banco AI loops: 2
- max input per task: 80K tokens unless explicitly approved

### Reviewer: `gemma4`

- type: MoE, 26B total, 4B active
- quantization: FP8
- context: 256K tokens
- default sampling for free-form review: `temperature=0.6`, `top_p=0.95`
- supports XML tool calling, reasoning mode, multimodal vision, SSE streaming
- max concurrent reviewer calls in Banco AI loops: 1
- max review packet size: 40K tokens
- review scope: changed files + relevant spec snippets only
- no whole-repo review by default

### Embeddings: `qwen3-embedding`

- batch size: 32
- max 1 indexing job at a time
- cache by file hash

## Overnight Hermes rules

- Overall LLM concurrency must never exceed 3 requests across builder, reviewer,
  extraction, and embedding work.
- Builder loops must use `qwen3.6`; review loops must use `gemma4`.
- Extraction/review jobs must use bounded retries. A failed structured JSON
  validation can retry at most twice, then store a controlled error state.
- Do not enqueue whole-repo reviews or large PDF batches overnight. Use small
  manifests and checkpoint after each task.
- Prefer deterministic/structured calls at lower temperature when JSON validity
  matters, but keep provider defaults documented above as the model baseline.

## Runtime user traffic rules

- All application calls to NAN must go through `src/infrastructure/llm/client.ts`.
  Do not call `fetch` against NAN directly from routes, background workers,
  scrapers, or PDF workers.
- The shared client enforces:
  - `NAN_MAX_CONCURRENT` (default `3`)
  - `NAN_MAX_RPM` (default `60`)
  - `NAN_MODEL_MAX_TPM` (default `1500000`)
  - `NAN_MAX_QUEUE_SIZE` (default `50`)
  - `NAN_QUEUE_TIMEOUT_MS` (default `15000`)
- If the limiter rejects because the queue is full or timed out, user-facing
  routes must return a controlled 429-style response. They must not spin,
  retry indefinitely, or open extra API calls.
- PDF upload routes should queue the document for later review/processing when
  NAN is saturated. The queue must not retain raw extracted PDF text.
- The in-process limiter protects one Node.js process. If production runs more
  than one web/scheduler/worker replica with the same API key, deploy one of:
  - a single internal NAN gateway service with this limiter,
  - a distributed limiter backed by Postgres/Redis,
  - or per-service limits that sum to at most the API-key budget.
