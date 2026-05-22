# @directorai/premiere-adapter

Layer 3 — abstracts Adobe Premiere Pro behind a stable interface.

## Implementations

- **`MockPremiereAdapter`** — in-memory implementation for testing without Premiere
- **`UXPPremiereAdapter`** — real implementation calling UXP `require('premierepro')` (runs inside the panel only)

Use `createPremiereAdapter({ kind: 'auto' })` to auto-select.

## Why this layer exists

The UXP API is awkward (callback-heavy, no native promises everywhere) and may change as Adobe matures it. By wrapping it behind a clean async interface returning Layer 2 domain types, the rest of DirectorAI is insulated from those details.

When Adobe ships a new API surface, only this package changes.
