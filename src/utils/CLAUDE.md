# Utils Layer

## File responsibilities

- **workspaceStorage.ts** — localStorage CRUD for the workspace list and per-workspace project data; defines `WorkspaceMeta`, `WorkspaceData`, `WorkspaceListState`.
- **assetStore.ts** — content-addressed IndexedDB store (db `id_card_assets`) for large data URLs. `externalizeWorkspaceAssets` (sync) swaps template background/watermark images and card photo overrides above 8KB for `asset:<hash>` refs at persistence time; `resolveWorkspaceAssets` (async) swaps them back at load time. See "Asset store" section below.
- **workspaceFile.ts** — File System Access API save/open for `.idcard` workspace files and `.idtemplate` template files; also owns FSA type declarations and autosave-pref helpers.
- **fileHandleStore.ts** — IndexedDB wrapper (`setStoredHandle`, `getStoredHandle`, `getAllStoredHandles`, `deleteStoredHandle`) that persists `WorkspaceFileHandle` objects keyed by root workspace id, so a workspace's `.idcard` file link survives a page reload. Every function resolves to a safe default (`null` / `void` / empty `Map`) instead of throwing — private browsing / IndexedDB-disabled degrades silently to the pre-existing in-memory-only behavior.
- **userTemplates.ts** — localStorage CRUD for user-saved templates (list of `{ meta, template }` entries). Stored templates hold `asset:` refs for large images (externalized on save); `loadUserTemplates` returns them unresolved (fine for list rendering), `loadResolvedUserTemplates` / `resolveTemplateAssets` resolve back to data URLs. `saveUserTemplate` and `restoreUserTemplates` return `boolean` — `false` on quota failure; callers must surface it.
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

`csvData` is written to localStorage with each workspace save so column-mapping survives page reload. It is stripped from `.idcard` file exports (`buildFileContent` destructures it out) and from workspace duplicates (`duplicateWorkspace` strips it).

`saveWorkspaceData` side-effects: if `data.logo` is set, it calls `updateWorkspaceMeta` to keep the list entry's logo in sync.

## Copy-on-write template inheritance (`templateLinkedToParent`)

Sub-workspaces are created with `templateLinkedToParent: true` in their `WorkspaceData`: their stored `template` is only a fallback snapshot, and the *effective* template is the parent's current one. **Load stored data through `getEffectiveWorkspaceData(id)`, not `getWorkspaceData(id)`,** whenever the data feeds app state or rendering (workspace switch, hydration, delete-then-load, Combine-PDF). It overlays the parent's template when linked, and self-heals to a detached copy if the parent record is missing. Detachment happens in the reducer: any template mutation clears the flag in `AppState`, and the next save persists the workspace's own snapshot. `duplicateWorkspace` duplicates from *effective* data and strips the flag (a duplicate under a different parent must not adopt that parent's design). The flag round-trips through `.idcard` files and backups (`buildFileContent` keeps it). Raw `getWorkspaceData` remains correct for save-to-file paths, which intentionally write the snapshot + flag.

## Asset store — large data URLs never go to localStorage

localStorage's ~5MB quota is the reason this layer exists: a template background image is a multi-MB base64 data URL, and every sub-workspace/duplicate used to get a full copy, silently exhausting the quota (workspaces then lost their template on reload — the original bug).

- **Write path**: `saveWorkspaceData` calls `externalizeWorkspaceAssets` before `setItem`. Data URLs > 8KB in `template.background.value`, `template.watermark.value`, and `record.overrides` values are replaced with `asset:<fnv1a-hash>-<len>` refs; the blobs go to IndexedDB (fire-and-forget, deduped by content hash + in-memory `persisted` set). The localStorage JSON stays small. `saveWorkspaceData` returns **`boolean`** — `false` on quota failure. Creation flows (`handleNewSubWorkspaceConfirm`) must write data first, check the result, and abort registration on failure.
- **Read path**: `getWorkspaceData` still returns raw stored data, which may contain `asset:` refs. **Every consumer that feeds data into app state or a self-contained artifact must `await resolveWorkspaceAssets(data)` first.** Current resolve sites: App.tsx hydration + autosave-to-file, WorkspaceSwitcher (`doSwitch`, sub-workspace creation, delete, save-to-file, both duplicate flows), CombinePdfDialog `generateFromWorkspaces`, backup.ts `createBackup`. In-memory `AppState` and all rendering code only ever see plain data URLs.
- **Self-contained artifacts**: `.idcard` files and backup JSON must contain real data URLs (portable across machines), so resolve before `writeWorkspaceToHandle`/`buildFileContent`; `restoreFromBackup`/`restoreWorkspaceFile` re-externalize automatically by routing through `saveWorkspaceData`.
- **Migration-free**: pre-existing stored data with inline data URLs passes through `resolveWorkspaceAssets` untouched and is externalized on its next save.
- **Missing asset** (e.g. IndexedDB cleared): `resolveWorkspaceAssets` drops the background/watermark to `null` (and clears a missing card-override photo to `null`), each with a console.warn, rather than rendering a broken `asset:` string.
- **User templates** (`id-card-user-templates`) follow the same pattern via the exported template-level helpers `externalizeTemplateAssets` / `resolveTemplateAssets`: `saveUserTemplate` externalizes on write; `TemplatePicker.handleSelectUser` resolves before `onSelect` (so `DesignStep.handleSelectTemplate` and app state only see data URLs); `saveTemplateWithPicker` resolves before writing `.idtemplate` files; backup export uses `loadResolvedUserTemplates` and restore routes through `restoreUserTemplates`.

## FSA types — do not add @types/wicg-file-system-access

`lib.dom` does not include File System Access API types. Local declarations (`FSWritable`, `WorkspaceFileHandle`, `FSAFileHandle`, `SavePickerOpts`, `OpenPickerOpts`, `WindowWithFSA`, `FSAPermissionState`) live at the top of `workspaceFile.ts`. Do not install `@types/wicg-file-system-access` — use the local types.

`WorkspaceFileHandle` includes a `name: string` field (the filename) so the UI can display the linked file name. When constructing a mock or stub handle, always include `name`.

`WorkspaceFileHandle` also declares `queryPermission?`, `requestPermission?`, and `isSameEntry?` as **optional** methods — real FSA handles always have them, but hand-built mock/stub handles or older browsers may not. Every call site must feature-detect with `typeof handle.xxx === 'function'` before calling, the same pattern as `hasSaveFilePicker()`/`hasOpenFilePicker()`. Do not make these required — that would force every mock handle in the codebase to fake them.

## IndexedDB — persisted file handles (fileHandleStore.ts)

`FileSystemFileHandle` objects are natively structured-cloneable, so `fileHandleStore.ts` stores them directly in IndexedDB (database `id_card_file_handles`, object store `handles`, keyed by root workspace id) — no serialization needed. This is what lets a workspace's `.idcard` link survive a page reload; before this, `fileHandleRef` in `App.tsx` was purely in-memory and every reload silently dropped the link. See the "WorkspaceSwitcher — file handle rehydration and reconnect" gotcha in `src/components/CLAUDE.md` for how this is wired into the UI.

Note: plain mock handle objects with function properties (e.g. in manual browser testing) are **not** structured-cloneable — only real `FileSystemFileHandle` instances have the browser's native serialization support. `setStoredHandle` catches this via the same "resolve to a safe default" contract, so a non-cloneable value fails silently rather than throwing.

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

Sub-workspaces are max one level deep (enforced in `createSubWorkspace`). `WorkspaceMeta.parentId` marks children. Always use `deleteWorkspaceTree(id)` to delete a workspace — it removes the entry and all its direct children atomically.

## getWorkspaceList — empty fallback on first launch

`getWorkspaceList()` returns `{ currentId: '', workspaces: [] }` when `LIST_KEY` is absent from localStorage or when the stored list has no workspaces. It does **not** synthesise a ghost `{ id: 'default', name: 'Default' }` entry. All callers must handle an empty `workspaces` array. The app shows the first-launch setup modal when the list is empty; `deleteWorkspaceTree` still writes a `'default'` fallback when the last workspace is deleted (pre-existing behaviour, separate concern).
