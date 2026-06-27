# Components Directory

## Step components (rendered by App.tsx via StepErrorBoundary)

- **DesignStep.tsx** — Step 1: card canvas (`CardCanvas` in `designMode=true`) + toolbar (add elements, template picker, background/watermark panel, save template menu).
- **DataStep.tsx** — Step 2: CSV file upload + column→binding mapping; dispatches `SET_CSV_DATA`, `SET_COLUMN_MAPPING`, and `SET_RECORDS`.
- **PreviewStep.tsx** — Step 3: paginated, searchable grid of rendered cards with per-card edit, webcam photo capture, image crop, and bulk photo assignment from a folder. The "Bulk add photos" button (hidden when no image binding exists on the template) opens a folder picker via a hidden `<input webkitdirectory>`; images are read in parallel with `Promise.all`/`FileReader` and handed to `BulkPhotoModal`.
- **PrintStep.tsx** — Step 4: print settings, live print preview, and image export (PNG/PDF). Imports `computeLayout` and `computeEffectivePaperDims` from `PrintSettings.tsx`.

## Sub-components

- **WorkspaceSwitcher.tsx** — Workspace management menu (create, rename, delete, duplicate, save/open `.idcard` files). Rendered in the app header, not inside any step.
- **TemplatePicker.tsx** — "Start From Template" modal, user-template-only list. Opened from DesignStep toolbar.
- **BackgroundWatermarkPanel.tsx** — Sidebar panel (shown inside DesignStep) for background color/image and watermark config; toggled by the "Background / Watermark" button.
- **CardEditDialog.tsx** — Per-card field override dialog opened from PreviewStep; accepts `overrides` and `fontSizeOverrides` keyed by binding.
- **ColumnMapping.tsx** — Pure UI: maps CSV headers to template element bindings via dropdowns; used inside DataStep.
- **CsvUpload.tsx** — File input wrapper that parses CSV and calls `onParsed`; used inside DataStep.
- **ImageCropDialog.tsx** — Custom drag-handle crop dialog (no third-party library); used in PreviewStep after webcam capture or image upload.
- **BulkPhotoModal.tsx** — Modal for assigning photos to cards in bulk. Receives an already-read `photos` array (`{ name, dataUrl }[]`), shows them in a sortable (A→Z / Z→A toggle) and drag-reorderable list, then calls `onConfirm(orderedPhotos)`. Drag reordering clears the active sort direction (`sortDir → null`) so sort buttons are unselected after a manual drag, enabling them to fire `onChange` again. Uses HTML5 native drag API — no DnD library.
- **PreviewGrid.tsx** — Responsive grid of `CardCanvas` previews with checkboxes for selection; receives `recordGlobalIndices` when rendering a filtered subset so selection indices stay correct.
- **PrintSettings.tsx** — Print settings form (paper size, margins, orientation, presets). Also exports `computeLayout` and `computeEffectivePaperDims` — import these from here, not from a utils file.
- **PrintView.tsx** — Stateless print layout: renders pages of cards using `computeLayout`; consumed by PrintStep for the print dialog and image export.
- **WebcamCapture.tsx** — Modal webcam capture; starts/stops the media stream on `open` toggle.

## Critical gotchas

### Step remount
`App.tsx` wraps each step in `<StepErrorBoundary key={activeStep}>`. **Every step unmounts and remounts on navigation.** Any local state (e.g., `selectedElementIds` in DesignStep, pagination/search in PreviewStep) is intentionally discarded. State that must survive step changes — template, records, csvData, columnMapping, printSettings, etc. — must be in AppState and dispatched via `useAppDispatch`.

### Card orientation dimension swap
Both DesignStep and PrintStep swap `widthMm`/`heightMm` for portrait orientation:
```
wMm = orientation === 'portrait' ? heightMm : widthMm   // card width
hMm = orientation === 'portrait' ? widthMm  : heightMm  // card height
```
Apply this same swap anywhere you compute card pixel dimensions. `PreviewGrid` and `PrintView` do it internally; do not pre-swap when calling them.

### WorkspaceSwitcher — template sync on `.idcard` import
`LOAD_WORKSPACE_STATE` (the dispatch action) does **not** sync user templates embedded in a workspace file into `id-card-user-templates`. `restoreWorkspaceFile()` handles this explicitly: it calls `saveUserTemplate()` for every workspace/child whose `currentTemplateSource.type === 'user'` if the template id is not already present in localStorage. If you add new import paths, replicate this sync.

### WorkspaceSwitcher — Save writes back to opened file
`handleSaveWorkspace` checks `fileHandleRef.current` before showing the OS save picker. If a handle exists (set when a `.idcard` file was opened or previously saved via FSA), it calls `writeWorkspaceToHandle` directly — no picker is shown. The picker only appears when there is no handle yet (fresh workspace). This means "Save" and autosave both target the same file once a workspace is opened from disk.

### WorkspaceSwitcher — mandatory file picker on new workspace creation
`handleNewWorkspaceConfirm` is **async**. After closing the name dialog (`setNewOpen(false)`) it calls `saveWorkspaceWithPicker` before touching localStorage. `setNewName`/`setNewLogo` are cleared **after** the picker resolves (not before) so a cancellation on FSA browsers leaves the form in a retry-able state. On FSA browsers, if the user cancels (`handle === null && hasSaveFilePicker()`), the function returns early and the workspace is not created. On non-FSA browsers the fallback download fires and the workspace is created regardless. The acquired handle is stored in `fileHandleRef` so subsequent saves and autosave target the same file without showing the picker again.

### WorkspaceSwitcher — first-launch setup modal
`WorkspaceSwitcher` accepts `needsSetup?: boolean` and `onSetupDone?: () => void` props. When `needsSetup` is true a blocking `Dialog` (no `onClose`, `disableEscapeKeyDown`) renders over the app with two options: **Create New Workspace** (enters `setupStep='naming'` → name input → calls `handleNewWorkspaceConfirm`) and **Open Existing Workspace** (calls `handleOpenWorkspace`). Both success paths call `onSetupDone?.()` — create via the end of `handleNewWorkspaceConfirm`, open via the end of `restoreWorkspaceFile`. `App.tsx` initialises `needsSetup` with `localStorage.getItem(LIST_KEY) === null` so the modal only appears on the very first load (no workspace list ever written).

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
