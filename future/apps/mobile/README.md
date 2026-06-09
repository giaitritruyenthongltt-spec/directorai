# apps/mobile — DirectorAI companion

Platform-neutral logic for the iOS + Android companion app. The RN
shell (Expo bare workflow) is **owner-completed** because it needs
Apple Developer / Play Console accounts + signing certs (Track C
C.13).

## What's in this package today

- `src/api.ts` — talks to the DirectorAI server via `fetch`. login,
  getProjectSnapshot, editStyle, previewStyle.
- `src/__tests__/api.test.ts` — 6 unit tests with stub fetcher.

## How the shell wraps it (post-Track-C)

```sh
npx create-expo-app directorai-mobile --template default
cd directorai-mobile
pnpm add ../../apps/mobile  # or publish + install
```

Screens import from `@directorai/mobile`:

```tsx
import { login, getProjectSnapshot } from '@directorai/mobile';
const ctx = await login(serverUrl, token);
const snap = await getProjectSnapshot(ctx);
```

## Why split shell from logic?

- The shell needs Xcode / Android Studio / signing certs — owner
  setup.
- The logic is pure TypeScript + `fetch` — testable in CI today.
- When the shell lands, it picks the logic up unchanged.

## Roadmap

- P5.08a — RN shell + login screen + workspace picker.
- P5.08b — Read-only project view (this package's
  getProjectSnapshot).
- P5.08c — Style YAML editor + dry-run preview (this package's
  editStyle + previewStyle).
