# @directorai/config

Centralized, type-safe configuration loader. Reads `.env` + process env, validates via Zod.

## Usage

```ts
import { loadConfig } from '@directorai/config';
const cfg = loadConfig();
console.log(cfg.server.port); // 7777
```

## Layer

Layer 1 (Infrastructure).
