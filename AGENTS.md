# Repository Guidelines

## Project Structure & Module Organization
- `src/main.ts`: main 3D scene entry and route rendering.
- `src/editor/`: 2D map editor implementation (`main.ts`, `canvas2d.ts`, `store.ts`, `form.ts`) plus tests.
- `src/data/`: canonical data model and source JSON (`campusData.ts`, `campusData.json`).
- `tools/`: Node utility layer for campus-data validation and save/load (`campus-store.ts`) with tests.
- `index.html` and `editor.html`: app and editor entry pages.
- `vite.config.ts` and `vite-plugin-campus-api.ts`: dev-time wiring for `/api/campus`.
- `dist/`: build artifacts; regenerate rather than hand-edit.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run dev`: start Vite dev server for both app pages (`/` and `/editor.html`).
- `npm run build`: run `tsc` then `vite build`; output goes to `dist/`.
- `npm run preview`: local preview of production bundle.
- `npm test`: run all Vitest tests (`.test.ts`).
- `npx vitest run src/editor/geometry.test.ts`: run a focused test file.

## Coding Style & Naming Conventions
- Use TypeScript with 2-space indentation and the repo’s semicolon-free style.
- Use explicit, descriptive names; prefer `camelCase` for variables/functions and `PascalCase` for types/classes.
- Keep file names and identifiers consistent with modules (`canvas2d.ts`, `geometry.ts`, `campus-store.ts`).
- Keep exports small and typed; use `interface`/`type` aliases where shared domain shapes are reused.
- No dedicated lint/format script is defined; follow existing style patterns and keep code TypeScript-strict-friendly.

## Testing Guidelines
- Framework: Vitest (DOM tests use `happy-dom`).
- Test files should be colocated with implementation and end with `.test.ts`.
- Test behavior, not implementation details; include mutation, undo/redo, and serialization paths when touching editor/data-store logic.
- Run full suite with `npm test` before PRs; add targeted runs when changes are narrowly scoped.

## Security & Data-Safety Tips
- The project is intended for static GitHub Pages deploy (`base: './'` in `vite.config.ts`).
- Keep `src/data/campusData.json` schema-valid; saves are expected to pass `validateCampusData` logic in `tools/campus-store.ts`.
- Local editor saves go through `/api/campus` in dev only; avoid shipping server-only assumptions into runtime logic.

## Commit & Pull Request Guidelines
- Existing history follows conventional prefixes (`feat`, `chore`, `docs`).
- Use imperative, scoped commit summaries, e.g. `feat: refine editor road drag behavior`.
- PR description should include changed files/modules, test/build commands executed, and manual QA steps.
- For UI/editor changes, include before/after screenshots and note any data migration or backup impact.
