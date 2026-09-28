# WebUI

This directory owns the Next.js application and all browser-facing assets:

- `src/app/`: pages and HTTP transport adapters;
- `src/components/`: browser UI components;
- `src/data/`: frontend-only sample data;
- `public/`: images, icons, themes, and QA reference assets;
- `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, and
  `eslint.config.mjs`: frontend build configuration.
- `package.json`: frontend dependencies and direct Next.js lifecycle commands.

Frontend-local modules use the `@/` alias. API adapters and browser-safe SDKs
reach root backend domains through the explicit `@backend/` alias. Browser
components must not import a domain's `server/` implementation.

Run the application from the repository root so the established commands stay
stable:

```bash
npm run dev
npm run build
npm run start
```

The Next.js configuration anchors `EIDO_ROOT_DIR` to the repository root by
default. Persistent JSON tables remain in `database/`; mutable application
assets live under `runtime/` (`workspace/`, `projects/`, and `graphs/`), local
models live under `data/models/`, and Agent skills live under
`database/agents/skills/`.
