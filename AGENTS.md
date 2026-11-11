# Repository Guidelines

## Project Structure & Module Organization

This repository is a Vite + TypeScript + Three.js project site for a 3D campus navigation system. The repo root hosts four HTML entries: `index.html` is the project landing page (positioning, capabilities, roadmap) and uses `src/landing/main.ts` with `src/landing/landing.css`; `plan.html` is the innovation-project plan report sharing the same landing styles; `demo.html` is the interactive 3D map built by `src/main.ts`; `editor.html` mounts the map editor from `src/editor/main.ts`. Shared map types and the default campus dataset live in `src/data/campusData.ts`; this is the main place to edit buildings, zones, roads, POIs, routes, and labels. `dist/` contains built static output for preview or deployment, and `.github/workflows/deploy.yml` contains deployment automation.

## Build, Test, and Development Commands

Install dependencies with:

```bash
npm install
```

Run the local Vite dev server:

```bash
npm run dev
```

Type-check and build production assets into `dist/`:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Coding Style & Naming Conventions

Use TypeScript ES modules and keep imports explicit. Follow the existing two-space indentation, single-quoted strings in TypeScript, and semicolon-free style. Use `PascalCase` for exported interfaces and type aliases such as `CampusData`, `Building`, and `RouteDefinition`; use `camelCase` for variables and functions such as `createDefaultCampusData`. Data IDs should stay stable, lowercase, and hyphenated, for example `central-core` or `place-02`.

`tsconfig.json` enforces `noUnusedLocals`, `noUnusedParameters`, and `noFallthroughCasesInSwitch`; run `npm run build` before submitting changes.

## Testing Guidelines

Pure logic has Vitest coverage: run `npm test`. Treat `npm test` plus `npm run build` as the required verification step. For UI or rendering changes, also run `npm run dev` or `npm run preview` and manually verify camera controls, building selection, route rendering, labels, responsive layout, and the landing page in both light and dark themes. Place new tests near the code they cover or under a dedicated `src/**/__tests__/` directory, and document any new command in `package.json`.

## Commit & Pull Request Guidelines

Recent history uses short imperative messages and occasional Conventional Commit prefixes, for example `feat: add in-demo map editor` and `Refactor main.ts: Simplify UI...`. Prefer `feat:`, `fix:`, `refactor:`, or a concise imperative subject.

Pull requests should include a brief description, verification commands run, and screenshots or screen recordings for visual changes. Link related issues when available. For data edits in `src/data/campusData.ts`, summarize the affected campus areas, landmarks, or route changes.

## Security & Configuration Tips

Keep `vite.config.ts` using relative `base: './'` unless deployment requirements change; this supports GitHub Pages project paths. Do not commit secrets or local environment files. Large generated artifacts should be justified, especially changes under `dist/`.
