## Purpose

This layer is the single source of truth for all shared app state. It uses React Context + `useReducer` — no external state library. `AppStateProvider` wraps the app root; components read via `useAppState()` and write via `useAppDispatch()`.

## AppState fields

| Field | What it holds |
|---|---|
| `activeStep` | Current wizard step index (0–N). `LOAD_WORKSPACE_STATE` auto-sets this to 2 if records + mapping are present, else 0. |
| `template` | The full `Template` object (elements, background, watermark). Mutated by several actions — always replace, never mutate in-place. |
| `records` | `CardRecord[]` generated from CSV. Cleared (and `selectedCardIndices` reset) whenever `SET_RECORDS` is dispatched with an empty array. |
| `columnMapping` | Maps CSV column headers to template field keys. |
| `printPresets` | Saved print layout presets. |
| `printSettings` | Active print dimensions + orientation. Use `SET_PRINT_SETTINGS` with a partial — it merges, not replaces. |
| `selectedCardIndices` | Set of selected record indices. Reset to `[]` on `SET_RECORDS`. |
| `currentTemplateSource` | Which built-in or user template is loaded, or `null` if none. Used to highlight the active template in the picker. |
| `watermarkEditMode` | When `true`, the canvas routes drag/resize to the watermark instead of card elements. |
| `currentWorkspaceId` | ID of the active workspace. |
| `workspaceList` | `WorkspaceMeta[]` for the workspace switcher UI. |
| `currentWorkspaceLogo` | Data URL or image URL for the workspace logo. Optional. |
| `csvData` | Parsed CSV for the Data step. Persisted as part of `WorkspaceData` (IndexedDB, via `workspaceStorage.ts`); stripped from `.idcard` exports and workspace duplicates. See below. |
| `templateLinkedToParent` | Copy-on-write template inheritance: `true` while a sub-workspace tracks its parent's template. **Cleared automatically by every template mutation action** (`SET_TEMPLATE`, `UPDATE_TEMPLATE_ELEMENT(S)`, `UPDATE_TEMPLATE_BACKGROUND`, `UPDATE_TEMPLATE_WATERMARK`) — that's the detach mechanism; do not add a template mutation action without clearing it. Persisted in `WorkspaceData`; `LOAD_WORKSPACE_STATE` restores it (`?? false`). The template in state is always the *effective* one (parent's, when linked) — `getEffectiveWorkspaceData` in `workspaceStorage.ts` does the overlay at load time. |

## Actions

**Template mutations** — prefer the targeted actions over `SET_TEMPLATE` when only part of the template changes:
- `UPDATE_TEMPLATE_ELEMENT` — patch a single element by id. Strips type-incompatible fields automatically (e.g. `fontSize` on image elements).
- `UPDATE_TEMPLATE_ELEMENTS` — replace the full elements array (e.g. after drag-reorder).
- `UPDATE_TEMPLATE_BACKGROUND` / `UPDATE_TEMPLATE_WATERMARK` — replace background or watermark config.
- `SET_TEMPLATE` — replace the whole template (e.g. loading a template from the picker).

**Records**
- `SET_RECORDS` — replaces records and clears selection. Also clears `csvData` when payload is empty (workspace load path).
- `UPDATE_RECORD_OVERRIDES` — merges per-card field overrides and font size overrides. Font size overrides with `null` value are pruned (they signal "reset to auto").

**Selection**
- `SET_SELECTED_CARD_INDICES` — set exactly.
- `TOGGLE_CARD_SELECTION` — flip one index.
- `SELECT_ALL_CARDS` / `DESELECT_ALL_CARDS` — bulk.

**Print**
- `SET_PRINT_SETTINGS` — accepts `Partial<PrintSettings>`, merged into existing settings.
- `SET_PRINT_PRESETS` — replaces the full preset list.

**Workspace**
- `SET_CURRENT_WORKSPACE` — sets `currentWorkspaceId`.
- `SET_WORKSPACE_LIST` — replaces `workspaceList`.
- `SET_WORKSPACE_LOGO` — sets or clears `currentWorkspaceLogo`.
- `LOAD_WORKSPACE_STATE` — bulk restore from persisted `WorkspaceData`. See below.

**Other**
- `SET_ACTIVE_STEP` — navigate steps directly (prefer this over side effects in components).
- `SET_CURRENT_TEMPLATE_SOURCE` — update template source tracking after a template is loaded.
- `SET_WATERMARK_EDIT_MODE` — toggle watermark canvas mode.
- `SET_CSV_DATA` — store or clear the parsed CSV.

## useAppState and useAppDispatch

Split contexts — state and dispatch are separate. Use `useAppState()` when you only read; use `useAppDispatch()` when you only write. Using both is fine but requires two calls:

```ts
const { template, records } = useAppState();
const dispatch = useAppDispatch();
```

Both throw if called outside `AppStateProvider`.

## LOAD_WORKSPACE_STATE

Restores a saved workspace in one dispatch. Each field is applied only if present in the payload (`!= null` or `!== undefined` depending on the field — see reducer). Key behaviours:

- Sets `activeStep` to 2 if the loaded data has both records and a column mapping, otherwise 0.
- Restores `csvData` from the payload if present (including `null` — treated as "no CSV yet"). If the key is absent from the payload, `csvData` is set to `null` (not kept from prior state).
- Does **not** sync `currentTemplateSource` to `id-card-user-templates` or any storage key — it only sets what is explicitly in `WorkspaceData`. If the caller needs the source updated, dispatch `SET_CURRENT_TEMPLATE_SOURCE` separately after.

## csvData persistence

`csvData` is written to IndexedDB (via `saveWorkspaceData`) as part of normal workspace auto-save, so column-mapping survives a page reload or workspace switch. It is **not** included in `.idcard` file exports (stripped by `buildFileContent`) or in workspace duplicates (stripped by `duplicateWorkspace`). Opening a `.idcard` file sets `csvData` to `null` because the key is absent from the file payload.

`SET_RECORDS` with an empty payload clears `csvData` as a side effect (workspace load resets both). `SET_CSV_DATA` is the explicit setter.

## Adding a new action

Add a new action type only when none of the existing actions fit. Before adding: check whether `SET_PRINT_SETTINGS` (partial merge), `UPDATE_TEMPLATE_ELEMENT` (single-element patch), or `UPDATE_RECORD_OVERRIDES` (per-card patch) already cover the mutation. Prefer patching over replacing when the field is nested inside `template` or `records`.

## Adding a new field to AppState

1. Add the field to the `AppState` interface in `appState.ts`.
2. Add a default value in `initialState`.
3. Add a setter action to `AppAction` and handle it in the reducer.
4. If the field should **not** be persisted across workspace loads, explicitly exclude it from `LOAD_WORKSPACE_STATE` (do not spread it from the payload, and do not copy it from prior state in that branch). If it should be persisted, add it to `WorkspaceData` in `workspaceStorage.ts` and handle it in the `LOAD_WORKSPACE_STATE` case.
