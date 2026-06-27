# Utils Layer

## File responsibilities

- **workspaceStorage.ts** — localStorage CRUD for the workspace list and per-workspace project data; defines `WorkspaceMeta`, `WorkspaceData`, `WorkspaceListState`.
- **workspaceFile.ts** — File System Access API save/open for `.idcard` workspace files and `.idtemplate` template files; also owns FSA type declarations and autosave-pref helpers.
- **userTemplates.ts** — localStorage CRUD for user-saved templates (list of `{ meta, template }` entries).
- **csv.ts** — Thin PapaParse wrapper; parses a `File` into `{ headers, rows }`.
- **exportImages.ts** — Renders cards off-screen via `CardCanvas`, captures each with html2canvas. `renderCardsToImages` is the shared rendering core (returns `{ recordIndex, dataUrl, blob }[]`); `exportCardsAsImages` calls it, bundles into a ZIP (with a `manifest.json` recording card mm size + format), and saves via `saveBlob`.
- **aggregatePdf.ts** — Shared jsPDF engine. `aggregateCardsToPdf(cards, opts)` packs `CardImage[]` (data URL + mm size) densely into one PDF, grouping by exact mm size so mixed sizes each get their own page run. Reuses `computeLayout`/`computeEffectivePaperDims` from `PrintSettings.tsx`. This is what eliminates per-workspace last-page waste.
- **importImages.ts** — `importCardsFromFiles(files)` reads picked ZIPs/images into `{ sized, unsized, warnings }`. ZIPs with a `manifest.json` come back fully sized; loose images / manifest-less ZIPs come back `unsized` and the caller must supply dimensions.
- **saveFile.ts** — `saveBlob(blob, fileName, accept)` (FSA save picker with `<a download>` fallback) and `safeFileName(name)`. Used by `exportImages.ts` and `aggregatePdf.ts`.
- **backup.ts** — Full-app backup (all workspaces + user templates + print presets) to a JSON download; and restore from that JSON back to localStorage.
- **file.ts** — Single helper: `readFileAsDataUrl(file)` — reads a `File` as a base64 data URL.
- **id.ts** — `generateId(prefix?)` — monotonic unique element IDs (prefix + timestamp + counter).
- **printPresets.ts** — localStorage CRUD for user-saved print presets.

## localStorage keys

| Key | What lives there |
|-----|-----------------|
| `id_card_workspace_list` | `WorkspaceListState` — `{ currentId, workspaces: WorkspaceMeta[] }` |
| `id_card_workspace_data_{id}` | `WorkspaceData` for each workspace (template, records, columnMapping, printPresets, printSettings, selectedCardIndices, currentTemplateSource, logo) |
| `id-card-user-templates` | `{ meta: UserTemplateMeta; template: Template }[]` |
| `id-card-print-presets` | `PrintPreset[]` |
| `id_card_autosave_to_file` | `'true'` / `'false'` — autosave-to-file preference (default: on) |

`csvData` is intentionally stripped before any write to localStorage or `.idcard` files — it is in-memory only for the session. `duplicateWorkspace` also strips it.

`saveWorkspaceData` side-effects: if `data.logo` is set, it calls `updateWorkspaceMeta` to keep the list entry's logo in sync.

## FSA types — do not add @types/wicg-file-system-access

`lib.dom` does not include File System Access API types. Local declarations (`FSWritable`, `WorkspaceFileHandle`, `FSAFileHandle`, `SavePickerOpts`, `OpenPickerOpts`, `WindowWithFSA`) live at the top of `workspaceFile.ts`. Do not install `@types/wicg-file-system-access` — use the local types.

`WorkspaceFileHandle` includes a `name: string` field (the filename) so the UI can display the linked file name. When constructing a mock or stub handle, always include `name`.

`exportImages.ts` has its own inline FSA type aliases (`FSWritable`, `FSFileHandle`, `SavePickerOpts`) scoped to that function. This is intentional — they only cover `BufferSource | Blob | string` writes, not the workspace file write shape.

## FSA fallback — always provide one

FSA only works in Chrome/Edge. Every FSA call must be guarded and fall back gracefully:

- **Save workspace** — `saveWorkspaceWithPicker` falls back to `downloadWorkspaceFile` when `showSaveFilePicker` is absent.
- **Open workspace** — `openWorkspaceWithPicker` / `openWorkspaceFilePickerWithHandle` return `null` when `showOpenFilePicker` is absent; callers must use a hidden `<input type="file">` as the fallback path.
- **Save template** — `saveTemplateWithPicker` falls back to an `<a download>` click.
- **Export ZIP** — `exportCardsAsImages` falls back to `URL.createObjectURL` + `<a download>` click.

Use `hasSaveFilePicker()` / `hasOpenFilePicker()` (exported from `workspaceFile.ts`) to check availability before calling FSA functions.

## html2canvas background rule — use `<img>`, not `background-image` CSS

html2canvas ignores the `scale` parameter when rendering CSS `background-image` properties. The upscaled image will be blurry/pixelated. `CardCanvas` renders image backgrounds as `<img>` elements so html2canvas captures them correctly via `drawImage()`. Do NOT switch image backgrounds back to CSS `background-image`.

`exportImages.ts` deliberately avoids CSS transforms on the wrapper div for the same reason — all upscaling is folded into html2canvas's own `scale` parameter (`h2cScale`).

`waitForContainerReady` in `exportImages.ts` waits for `document.fonts.ready` and for all `<img>` elements in the container to load before calling html2canvas. If you add new async visual resources to `CardCanvas`, they must be awaitable here too.

## User template sync when importing .idcard files

`LOAD_WORKSPACE_STATE` (Redux action) does NOT auto-sync user templates embedded in workspace data to localStorage. When importing an `.idcard` file in `WorkspaceSwitcher.tsx` (or anywhere), user templates present in the workspace data must be explicitly written to `id-card-user-templates` by calling `saveUserTemplate` for each one. Skipping this causes the imported templates to be invisible in the template picker.

## csv.ts quirks

- `FieldMismatch` parse errors are silently filtered out — only fatal errors reject the promise.
- Column headers come from `results.meta.fields` (PapaParse's canonical source); `Object.keys(rows[0])` is only a fallback for edge cases where PapaParse doesn't populate `meta.fields`.
- CSV data is never persisted. It lives in Redux state only and is lost on page reload or workspace switch.

## Workspace hierarchy

Sub-workspaces are max one level deep (enforced in `createSubWorkspace`). `WorkspaceMeta.parentId` marks children. Use `deleteWorkspaceTree(id)` to delete a root workspace and all its children atomically; `deleteWorkspace(id)` only deletes one entry and leaves orphaned children.

## getWorkspaceList — empty fallback on first launch

`getWorkspaceList()` returns `{ currentId: '', workspaces: [] }` when `LIST_KEY` is absent from localStorage or when the stored list has no workspaces. It does **not** synthesise a ghost `{ id: 'default', name: 'Default' }` entry. All callers must handle an empty `workspaces` array. The app shows the first-launch setup modal when the list is empty; `deleteWorkspace`/`deleteWorkspaceTree` still write a `'default'` fallback when the last workspace is deleted (pre-existing behaviour, separate concern).
