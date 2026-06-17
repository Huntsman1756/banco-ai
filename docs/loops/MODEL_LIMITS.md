# Internal Model Limits

Provider limits are interpreted into safe operating limits:

- Builder (`qwen3.6`):
  - max concurrent calls: 2
  - max input tokens per task: 80k
  - max diff before review: 800 lines
  - max changed files before review: 12
  - max concurrent calls overall: 3
- Reviewer (`gemma4`):
  - max concurrent calls: 1
  - max review packet size: 40k tokens
  - review scope: changed files + relevant spec snippets only
  - no whole-repo review by default
- Embeddings (`qwen3-embedding`):
  - batch size: 32
  - max 1 indexing job at a time
  - cache by file hash

The loop engine must enforce these limits before calling external APIs.
