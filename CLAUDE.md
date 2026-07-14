# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

React 19 + TypeScript + Vite 7 + MUI v7. No backend — structural app data (workspaces, user templates, print presets) lives in IndexedDB (`id_card_store`); large images live in a separate IndexedDB database (`id_card_assets`); a couple of small UI preferences remain in plain localStorage. See `src/utils/CLAUDE.md` § "Persisted storage" for the full picture. PapaParse for CSV.

## Commands

```bash
npm run dev      # dev server on http://localhost:5173 (also on LAN via 0.0.0.0)
npm run build    # tsc -b && vite build
npm run lint     # ESLint
npm run preview  # preview production build
npm run test     # vitest run (storage layer, appState reducer, pure-logic utils, and a growing set of component tests)
```

**`launch-app.bat`** (Windows) — one-click launcher that checks for Node.js, npm, and git (errors with install instructions if missing), pulls latest from `origin/main`, runs `npm install`, then starts the dev server and opens the app in the default browser automatically.

Test coverage spans the IndexedDB/FSA storage layer (`src/utils/*.test.ts`, run via Vitest + fake-indexeddb — includes `assetStore`, `fileHandleStore`, `workspaceFile` with mocked File System Access API, and `exportImages` with mocked `html2canvas`), the `appState` reducer (`src/store/appState.test.ts`), pure-logic utils (`csv.ts`, `id.ts`, `file.ts`, `saveFile.ts`, `aggregatePdf.ts`, `importImages.ts`, and `PrintSettings.tsx`'s `computeLayout`/`computeEffectivePaperDims`), and a first component test (`WebcamCapture.test.tsx`, via `@testing-library/react`). `src/setupTests.ts` polyfills several jsdom gaps every test that touches files/canvas/fonts will otherwise hit — see its comments (`Blob.text`/`arrayBuffer`, `URL.createObjectURL`/`revokeObjectURL`, `document.fonts`, `ResizeObserver`). Note: `vitest.config.ts`'s `setupFiles` uses an explicit relative path for `fake-indexeddb/auto` rather than the bare specifier — the bare specifier can resolve to the wrong project's `node_modules` in a nested git-worktree checkout.

## Architecture

- **State**: React Context + useReducer in `src/store/appState.ts` + `src/store/AppStateContext.tsx`. All shared state lives in `AppState`.
- **Steps**: `App.tsx` renders a `StepErrorBoundary` keyed by `activeStep`, which causes full remount when switching steps. Any local state that must survive step navigation must be lifted into `AppState`.
- **Workspaces**: `src/utils/workspaceStorage.ts` handles async IndexedDB CRUD (every function returns a `Promise`) for the workspace list and per-workspace data. `src/utils/workspaceFile.ts` handles File System Access API for `.idcard` save/open. A one-time migration (`src/utils/storageMigration.ts`) copies pre-upgrade localStorage data into IndexedDB on first boot after upgrade — see `src/utils/CLAUDE.md`.

## Key gotchas

**`StepErrorBoundary key={activeStep}` causes full remount on every step change.** Any state local to a step component is lost. Lift to `AppState` if it must survive.

**MUI freeSolo `Autocomplete` only fires `onChange` on selection or Enter.** When users type and click away, you must add an `onBlur` to the inner `TextField` inside `renderInput` to capture the value.

**`handleSaveCurrent` uses the "useEvent" ref pattern — do not add deps back.** Two refs (`currentWorkspaceIdRef`, `currentWorkspaceDataRef`) are synced on every render of `AppContent`, and `handleSaveCurrent` is a stable empty-dep `useCallback` that reads from them. This prevents stale closures in React 18 concurrent mode where the old `useCallback([currentWorkspaceId, currentWorkspaceData])` could capture pre-template state when called across async boundaries (e.g. after `await` in `handleNewWorkspaceConfirm`), causing the selected template to be lost on workspace switch.

**File System Access API types are not in standard `lib.dom`.** Local type declarations live in `src/utils/workspaceFile.ts` (interfaces `WorkspaceFileHandle`, `WindowWithFSA`). Do not add `@types/wicg-file-system-access` — use the local types.

**FSA only works in Chrome/Edge.** `hasSaveFilePicker()` / `hasOpenFilePicker()` guard all FSA calls. Always provide the fallback path (hidden `<input type="file">` for open, `downloadWorkspaceFile` for save).

**CSV data is persisted as part of `WorkspaceData`** (`csvData` in `AppState`, written to IndexedDB via `saveWorkspaceData`) so column-mapping survives a page reload or workspace switch. It is stripped from `.idcard` file exports (`buildFileContent` destructures it out) and from workspace duplicates (`duplicateWorkspace` strips it). Opening a `.idcard` file clears csvData because it is absent from the file payload.

**Large images are stored in a separate IndexedDB database, not inline in workspace data.** `saveWorkspaceData` swaps data URLs > 8KB (template background/watermark, card photo overrides) for `asset:<hash>` refs backed by the `id_card_assets` IndexedDB database, and returns `false` on failure. Stored data from `getWorkspaceData` may therefore contain refs — always `await resolveWorkspaceAssets(data)` (from `src/utils/assetStore.ts`) before dispatching it into app state or writing a self-contained file (.idcard / backup). See `src/utils/CLAUDE.md` § "Asset store".

**All storage reads/writes are async.** `workspaceStorage.ts`, `userTemplates.ts`, and `printPresets.ts` are IndexedDB-backed (`id_card_store` database) and every exported function returns a `Promise` — there is no synchronous fallback. A one-time migration (`storageMigration.ts`) must complete before the first read; `App.tsx`'s boot effect awaits it before reading the workspace list, and gates the UI behind a `bootResolved` spinner until it settles. If IndexedDB is unavailable, the boot effect degrades to `storageMigration.ts`'s synchronous read-only `readLegacyWorkspaceList`/`readLegacyWorkspaceData` fallbacks (the legacy localStorage keys are still present) rather than showing a blank app. See `src/utils/CLAUDE.md` § "Persisted storage".

## Code style

- TypeScript strict mode. Prefer `type` over `interface` for object shapes.
- MUI sx prop for inline styles; avoid adding separate CSS files.
- No comments unless the WHY is non-obvious.

## Design Context

`PRODUCT.md` (register, users, brand personality: "Purple Workbench" — MD3 violet identity for a dense, repeat-use tool) and `DESIGN.md` (color/typography/component tokens, current elevation inconsistencies) describe the app's design system for the `impeccable` skill. Read them before any UI/design-affecting change.
