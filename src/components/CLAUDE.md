# Components Directory

## Step components (rendered by App.tsx via StepErrorBoundary)

- **DesignStep.tsx** — Step 1: card canvas (`CardCanvas` in `designMode=true`) + toolbar (add elements, template picker, background/watermark panel, save template menu).
- **DataStep.tsx** — Step 2: CSV file upload + column→binding mapping; dispatches `SET_CSV_DATA`, `SET_COLUMN_MAPPING`, and `SET_RECORDS`.
- **PreviewStep.tsx** — Step 3: paginated, searchable grid of rendered cards with per-card edit, webcam photo capture, image crop, and bulk photo assignment from a folder. The "Bulk add photos" button (hidden when no image binding exists on the template) opens a folder picker via a hidden `<input webkitdirectory>`; images are read in parallel with `Promise.all`/`FileReader` and handed to `BulkPhotoModal`.
- **PrintStep.tsx** — Step 4: print settings, live print preview, image export (PNG/JPG ZIP), and "Combine into one PDF" (opens `CombinePdfDialog`). Imports `computeLayout` and `computeEffectivePaperDims` from `PrintSettings.tsx`.

## Sub-components

- **WorkspaceSwitcher.tsx** — Workspace management menu (create, rename, delete, duplicate, save/open `.idcard` files). Rendered in the app header, not inside any step.
- **TemplatePicker.tsx** — "Start From Template" modal, user-template-only list. Opened from DesignStep toolbar.
- **BackgroundWatermarkPanel.tsx** — Sidebar panel (shown inside DesignStep) for background color/image and watermark config; toggled by the "Background / Watermark" button.
- **CardEditDialog.tsx** — Per-card field override dialog opened from PreviewStep; accepts `overrides` and `fontSizeOverrides` keyed by binding. Also requires `template: Template` and `printSettings` props to render a live `CardCanvas` preview alongside the edit fields. The preview uses the same scale/clip pattern as `PreviewGrid` (render at full px size, then CSS `transform: scale()`). `previewRecord` is built via `useMemo` from the current edit state so the preview updates as the user types.
- **ColumnMapping.tsx** — Pure UI: maps CSV headers to template element bindings via dropdowns; used inside DataStep. Accepts an `onUploadDifferent` callback that DataStep passes in — the "Upload Different File" button renders inline next to "Generate Cards" inside this component (not in DataStep). Dropdowns use `repeat(auto-fit, minmax(220px, 220px))` — `auto-fit` (not `auto-fill`) so empty tracks collapse and the grid shrinks to its content; fixed `220px` column width prevents individual dropdowns from stretching wide. The Generate/Upload button row uses `alignItems: 'center'` to vertically align the mismatched-height buttons (contained medium vs outlined small).
- **CsvUpload.tsx** — File input wrapper that parses CSV and calls `onParsed`; used inside DataStep.
- **ImageCropDialog.tsx** — Custom drag-handle crop dialog (no third-party library); used in PreviewStep after webcam capture or image upload.
- **BulkPhotoModal.tsx** — Modal for assigning photos to cards in bulk. Receives an already-read `photos` array (`{ name, dataUrl }[]`), shows them in a sortable (A→Z / Z→A toggle) and drag-reorderable list, then calls `onConfirm(orderedPhotos)`. Drag reordering clears the active sort direction (`sortDir → null`) so sort buttons are unselected after a manual drag, enabling them to fire `onChange` again. Uses HTML5 native drag API — no DnD library.
- **PreviewGrid.tsx** — Responsive grid of `CardCanvas` previews with checkboxes for selection; receives `recordGlobalIndices` when rendering a filtered subset so selection indices stay correct.
- **PrintSettings.tsx** — Print settings form (paper size, margins, orientation, presets). Also exports `computeLayout` and `computeEffectivePaperDims` — import these from here, not from a utils file. Layout is a `maxWidth: 620` flex-column: Units+Paper size share row 1 (`auto 1fr` grid), orientation row 2, margin/gap/summary row 3 (fixed `width: 160` inputs in a flex row), card size row 4 (same fixed-width pattern), presets row 5. Do not revert to full-width or stretch inputs — fields must stay compact.
- **PrintView.tsx** — Stateless print layout: renders pages of cards using `computeLayout`; consumed by PrintStep for the print dialog and image export.
- **WebcamCapture.tsx** — Modal webcam capture; starts/stops the media stream on `open` toggle.
- **CombinePdfDialog.tsx** — Dialog driving the aggregate-PDF feature. Two tabs: "From workspaces" (reads each selected workspace's data from localStorage and renders its cards to JPEG via `renderCardsToImages`) and "From exported images" (`importCardsFromFiles` for ZIPs/loose images, with a manual card-size field for unsized images). Both feed `aggregateCardsToPdf`. Shared paper-size/margin/gap controls; defaults seeded from the active workspace's print settings.

## Critical gotchas

### Step remount
`App.tsx` wraps each step in `<StepErrorBoundary key={activeStep}>`. **Every step unmounts and remounts on navigation.** Any local state (e.g., `selectedElementIds` in DesignStep, pagination/search in PreviewStep) is intentionally discarded. State that must survive step changes — template, records, csvData, columnMapping, printSettings, etc. — must be in AppState and dispatched via `useAppDispatch`.

### PreviewStep — pagination is derived, not effect-driven
`page` state is intentionally not clamped via a `useEffect`. `currentPage = Math.min(page, pageCount)` is computed inline every render and used everywhere `page` used to be (`paginatedItems`, the "Page X of Y" text, the `<Pagination>` prop) — this replaces an old `useEffect(() => { if (page > pageCount) setPage(1) }, [page, pageCount])` that tripped the `react-hooks/set-state-in-effect` lint rule. Resetting to page 1 when `searchQuery` changes uses React's documented "adjust state during render" pattern instead (`prevSearchQuery` state compared inline, `setPage(1)` called conditionally in the render body, not inside an effect). Do not reintroduce either as a `useEffect` — both were removed specifically to fix the lint warning without adding an extra render pass.

### Card orientation dimension swap
Both DesignStep and PrintStep swap `widthMm`/`heightMm` for portrait orientation:
```
wMm = orientation === 'portrait' ? heightMm : widthMm   // card width
hMm = orientation === 'portrait' ? widthMm  : heightMm  // card height
```
Apply this same swap anywhere you compute card pixel dimensions. `PreviewGrid` and `PrintView` do it internally; do not pre-swap when calling them.

### WorkspaceSwitcher — template sync on `.idcard` import
`LOAD_WORKSPACE_STATE` (the dispatch action) does **not** sync user templates embedded in a workspace file into `id-card-user-templates`. `restoreWorkspaceFile()` handles this explicitly: it calls `saveUserTemplate()` for every workspace/child whose `currentTemplateSource.type === 'user'` if the template id is not already present in localStorage. If you add new import paths, replicate this sync.

### WorkspaceSwitcher — per-workspace file handles
`fileHandleRef` in `App.tsx` is a `Map<rootId, WorkspaceFileHandle>` (not a single nullable). Each workspace tree (root + its sub-workspaces) stores its own handle keyed by the root workspace id. `setHandleForRoot` / `clearHandleForRoot` helpers in `WorkspaceSwitcher` update the map and keep the local `hasFileHandle` / `savedFileName` state in sync.

### WorkspaceSwitcher — Save writes back to opened file
`handleSaveWorkspace` checks `fileHandleRef.current.get(rootId)` before showing the OS save picker. If a handle exists, it calls `writeWorkspaceToHandle` directly — no picker is shown. The picker only appears when there is no handle yet (fresh workspace). `handleSaveWorkspace` now returns `Promise<boolean>` — `true` when the file was written or a download was triggered, `false` when the FSA picker was cancelled. Callers that need to chain an action (e.g. `handleUnsavedSaveAndSwitch`) must check this return value before proceeding.

### WorkspaceSwitcher — unsaved workspace guard dialog
When switching to a different workspace tree on FSA browsers (`hasSaveFilePicker()`) while the current tree has no file handle (`!hasFileHandle`), a blocking dialog is shown instead of switching immediately. The user can choose "Switch without saving" (calls `doSwitch` directly) or "Save & switch" (calls `handleSaveWorkspace`, then `doSwitch` only if the save returned `true`). `pendingSwitchId` state holds the target id while the dialog is open.

### WorkspaceSwitcher — mandatory file picker on new workspace creation
`handleNewWorkspaceConfirm` is **async**. After closing the name dialog (`setNewOpen(false)`) it calls `saveWorkspaceWithPicker` before touching localStorage. `setNewName`/`setNewLogo` are cleared **after** the picker resolves (not before) so a cancellation on FSA browsers leaves the form in a retry-able state. On FSA browsers, if the user cancels (`handle === null && hasSaveFilePicker()`), the function returns early and the workspace is not created. On non-FSA browsers the fallback download fires and the workspace is created regardless. The acquired handle is stored via `setHandleForRoot(meta.id, handle)` so subsequent saves and autosave target the same file without showing the picker again.

Note: `WorkspaceSwitcher` does **not** accept a `currentWorkspaceData` prop — it reads workspace data directly from `getWorkspaceData()` (localStorage) when needed (e.g. in `handleSaveWorkspace`). Do not add this prop back.

### WorkspaceSwitcher — first-launch setup modal
`WorkspaceSwitcher` accepts `needsSetup?: boolean` and `onSetupDone?: () => void` props. When `needsSetup` is true a blocking `Dialog` (no `onClose`, `disableEscapeKeyDown`) renders over the app with two options: **Create New Workspace** (enters `setupStep='naming'` → name input → calls `handleNewWorkspaceConfirm`) and **Open Existing Workspace** (calls `handleOpenWorkspace`). Both success paths call `onSetupDone?.()` — create via the end of `handleNewWorkspaceConfirm`, open via the end of `restoreWorkspaceFile`. `App.tsx` initialises `needsSetup` with `localStorage.getItem(LIST_KEY) === null` so the modal only appears on the very first load (no workspace list ever written).

### WorkspaceSwitcher — dialog autoFocus racing the closing Menu
Menu item handlers that open a dialog (e.g. `handleNewSubWorkspace`) call `setXOpen(true)` then `handleClose()` (closes the workspace Menu) in the same tick. The Menu's own focus-trap teardown races the newly-mounted Dialog's `autoFocus`, and focus can land on the Dialog's container div instead of the field. Fixed for the "New Sub-workspace" dialog: the `Menu` has `disableRestoreFocus` (stops it from returning focus to the anchor button on close), and the Name `TextField` uses `inputRef={newSubNameInputRef}` with a `useEffect` that calls `.focus()` via `requestAnimationFrame` when `newSubOpen` becomes true, instead of relying on `autoFocus`. Apply the same pattern to any other Menu-launched dialog that needs reliable initial focus — plain `autoFocus` is not reliable in this component.

### TemplatePicker patterns
- **"Import from file" button**: uses `<Button component="label">` wrapping a hidden `<input type="file">`. This is the MUI `component="label"` pattern — do not replace with a `Box component="label"` or a separate click handler.
- **`importAndSelect()`**: always assigns a fresh id (`user-${Date.now()}`), saves to localStorage via `saveUserTemplate`, reloads local state, calls `onSelect`, then calls `onClose`. Do not skip the id reassignment — it prevents silently overwriting an existing template with the same id.
- **Template list refresh**: the dialog reloads from localStorage on every open via `useEffect(() => { if (open) setUserTemplates(loadUserTemplates()); }, [open])`. Do not add an in-memory cache that would bypass this.
- **No built-in templates**: the modal only shows user-saved templates. Do not add built-in templates back — they were intentionally removed.

### DesignStep — handleSelectTemplate
Dispatches both `SET_TEMPLATE` (with freshly generated element ids) and `SET_CURRENT_TEMPLATE_SOURCE`. Both dispatches are required. Missing `SET_CURRENT_TEMPLATE_SOURCE` breaks the "Save" (overwrite) vs. "Save As" distinction in the save menu.

### MUI freeSolo Autocomplete
`ElementPropertiesPanel` (in `DesignEditor.tsx`) uses freeSolo Autocomplete for the binding field. MUI freeSolo only fires `onChange` on option selection or Enter. Add `onBlur` to capture typed values that were never confirmed with Enter.

### File System Access API
FSA is Chrome/Edge only. Always check `hasSaveFilePicker()` / `hasOpenFilePicker()` before using FSA paths, and provide a download/`<input type="file">` fallback. FSA types are not in standard `lib.dom` — do not rely on them in type signatures without the existing workarounds in `workspaceFile.ts`.
