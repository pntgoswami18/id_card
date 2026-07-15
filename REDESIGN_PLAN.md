# Redesign Implementation Plan

Source: UX audit of the ID Card Generator (React 19 + TypeScript + Vite + MUI v7,
no-backend, IndexedDB-backed). This plan covers four suggestions. It does not
change any code — it is a planning document for follow-up implementation work.

Design constraints throughout (from `DESIGN.md` / `PRODUCT.md`, "Purple Workbench"):
- **Sparing violet** — `#6750A4` marks the one active action/state per screen, not a wash.
- **No-shout headings** — regular weight 400 everywhere, no uppercase button text.
- **Flat by default** — `elevation: 0`; reuse `boxShadow: 1`–`2` (control feedback) or
  `3` (floating card preview) rather than inventing new shadow values.
- **Print-fidelity is non-negotiable** — any on-screen representation of the printed
  sheet must reflect true layout/scale, not a decorative approximation.
- **Dense, repeat-use tool** — favor compact chrome over spacious first-run UX; no
  onboarding flourish, no numbered-scaffolding, no hero-metric cards.

---

## 1. Persistent card-count/context bar

### Current state
- The only "N total" display lives in `src/components/PreviewStep.tsx` (toolbar row,
  ~line 298-300): `Page {currentPage} of {pageCount} ({filteredResults.length} total)`,
  computed from `records` (via `useAppState()`) and a locally memoized `filteredResults`.
  There's also a `{selectedCardIndices.length} selected` label in the same row.
- No persistent/global equivalent exists in `DataStep`, `PrintStep`, or `App.tsx`.
- `App.tsx`'s `AppContent()` already renders, inside one flat `Paper` (line ~287-401):
  a header `Box` (title + `WorkspaceSwitcher`, `mb: 2`, `flexShrink: 0`), then
  `<Stepper activeStep={activeStep}>` (`flexShrink: 0`), then the step-content `Box`
  wrapping `<StepErrorBoundary key={activeStep}>`.
- `records` is already destructured in `AppContent` (line ~61) — no new prop threading
  needed for a raw count.
- Workspace name is **not** a stored field — it's derived via
  `workspaceList.find(w => w.id === currentWorkspaceId)?.name`, done independently in
  both `App.tsx` (line ~153) and `PrintStep.tsx` (line ~26).
- Template name: `AppState.template` holds the full `Template` object (has `.name`);
  `currentTemplateSource` distinguishes built-in vs user template.

### Proposed approach
Add a slim, single-line strip between the header `Box` and the `Stepper` (or between
the `Stepper` and step content — either slot already has `flexShrink: 0` siblings, so
the pattern is established). Content: `{workspaceName} · {records.length} record{s} ·
{template.name}`, MUI `body2`, `text.secondary`, no card/border/background — literally
one `Typography` (or a `Box` with `·` separators) sitting flush in the existing `Paper`.
No violet, no icon shouting, no elevation — this is context, not a call to action, so it
must read as quieter than the Stepper above it. Truncate workspace/template name with
`text-overflow: ellipsis` on narrow viewports rather than wrapping (keeps it one line,
consistent with "no decorative flourish / stays out of the way" principle).

Do **not** duplicate the "N total"/"N selected" language from `PreviewStep` verbatim —
this bar's job is orientation ("what am I looking at"), not the Preview toolbar's job
(pagination/selection state), so keep it strictly to workspace/record-count/template.

### State changes
None required for the minimal version — `workspaceName` (derived), `records.length`,
and `template.name` are all already available in `AppContent` where `App.tsx` renders
the header/Stepper, so this is a pure presentational addition, not a new `AppState`
field or `AppAction`. (If a future iteration wants to show mapping/validation status
too, that would need new derived state, but the audit's ask — name · count · template —
needs nothing new.)

### Effort
**S** — no store changes, one new element in an already-identified insertion point in
`App.tsx`, reuses existing derived values.

### Dependencies / sequencing
None — fully independent of items 2–4. Safe to do first as a low-risk warm-up.

### Open questions / risks
- Placement choice (above vs. below Stepper) is a visual-hierarchy call — the Stepper
  is currently the primary "where am I" signal; the bar should not visually compete
  with it. Recommend below the Stepper, immediately above step content, so it reads as
  "current record context for whatever step you're in" rather than a second nav bar.
- Not affected by the `StepErrorBoundary key={activeStep}` remount gotcha since it lives
  in `App.tsx`, outside `stepContent[activeStep]`.
- Need a decision on behavior when `records.length === 0` (pre-CSV-import state) —
  likely hide the bar entirely or show a muted "no data loaded yet" variant, to avoid
  showing "0 records" as a false-negative signal before Data step is reached.

---

## 2. Collapse WorkspaceSwitcher's two save-related states

### Current state
File: `src/components/WorkspaceSwitcher.tsx` (~1323 lines), rendered from `App.tsx`
(not step-scoped). Two separate, stacked controls inside the workspace `Menu`:

- **"Save Workspace"** `MenuItem` (~line 825-837) — a button-affordance item calling
  `handleSaveWorkspace` (local async fn, ~line 453). Behavior branches three ways via
  its `secondary` text: `'Downloads as .idcard file'` (no FSA support),
  `savedFileName ?? 'Overwrite saved file'` (FSA handle exists), or
  `'Choose save location'` (FSA supported, no handle yet).
- **"Autosave"** `MenuItem` (~line 844-887) — a switch-affordance item, only rendered
  `{hasSaveFilePicker() && (...)}`. Wraps a `Switch` bound to `autoSaveToFile` (prop
  from `App.tsx`, persisted via `getAutoSavePref`/`setAutoSavePref` in
  `workspaceFile.ts`, plain localStorage), gated on `hasFileHandle` and
  `permissionState === 'granted'`. When `permissionState === 'needs-reconnect'`, the
  switch is replaced inline by a "Reconnect" `Button` calling `handleReconnect()`.
- Distinct from both: `App.tsx`'s `handleSaveCurrent` (the "useEvent ref pattern" —
  `currentWorkspaceIdRef`/`currentWorkspaceDataRef`, stable empty-dep `useCallback`) is
  passed in as `onSaveCurrent` — this is the IndexedDB workspace-data save path, not
  the FSA `.idcard` file save path (`handleSaveWorkspace`). **These are two genuinely
  different save mechanisms already**, which is part of why the audit finds the UI
  confusing — the plan needs to keep that distinction correct, not paper over it.

### Proposed approach
Collapse the two `MenuItem`s into a single **save-status row** at the top of the menu
(non-interactive status text, e.g. `"Saved to badges.idcard · autosave on"` or, when
autosave is off, `"badges.idcard · autosave off"`, or the no-FSA-support case,
`"Not linked to a file · Save downloads a copy"`), followed by **one** `MenuItem` with
a trailing chevron/dropdown that expands the existing three actions (Save Workspace
now / Toggle autosave / Reconnect) as a submenu or nested `Menu`. This turns "two
things to look at and decide between" into "one status line + one action point,"
per the audit's framing, without removing any existing capability.

Concretely:
- Status line: plain `Typography` (`body2`, `text.secondary`), not a `MenuItem` (avoid
  implying it's clickable) — small `CheckCircle`/`CloudDone`-style icon only if it
  doesn't compete with violet elsewhere in the menu (keep neutral gray, not violet,
  since it's status not an active-state signal).
- Single action entry point below it, e.g. `MenuItem` labeled "Save options" with the
  existing three behaviors as sub-items in a nested `Menu` (MUI supports nested menus
  via a controlled sub-`Menu` anchored to the parent `MenuItem`), or simplest: keep it
  as two `MenuItem`s but visually demote Autosave to a description line under the Save
  action rather than a parallel row, so there is one primary click target
  ("Save Workspace…") and autosave becomes a toggle reachable from there.
- Preserve the `needs-reconnect` inline-Reconnect-button behavior — it's a distinct,
  urgent state (FSA permission lost) and should stay a one-click action, not buried
  deeper in a submenu it's already surfaced well today.

Given MD3/no-shout constraints: no bold/violet on the status text (it's not an action);
reserve violet for the single actionable item, consistent with the Sparing Violet Rule.

### State changes
None in `AppState`/store — all relevant state (`autoSaveToFile`, `hasFileHandle`,
`permissionState`, `savedFileName`) is already local to `WorkspaceSwitcher` or passed
as props from `App.tsx`. This is a pure component-internal restructuring.

### Effort
**M** — no store/type changes, but nontrivial JSX restructuring inside a large
(1323-line) component with several conditional branches (FSA support, handle presence,
permission state, reconnect-error state) that all need to be re-derived into a single
status string without losing any of the existing conditional logic or accessibility
(keyboard nav through a nested menu needs verification).

### Dependencies / sequencing
Independent of items 1, 3, 4. Touches `WorkspaceSwitcher.tsx` only (plus possibly
`App.tsx` if the prop surface changes, though it shouldn't need to).

### Open questions / risks
- `WorkspaceSwitcher` is not step-scoped, so the `StepErrorBoundary` remount gotcha
  doesn't apply — but note it that this is a genuinely complex piece of state
  (FSA handle + permission + autosave pref + IndexedDB save, four overlapping async
  concerns) and the "collapse to one line" framing must not hide error states (e.g.
  save failure) that the current two-`MenuItem` layout can surface independently today.
- FSA is Chrome/Edge only (`hasSaveFilePicker()` gate) — the collapsed status line's
  copy needs a distinct, tested wording for the non-FSA fallback path (plain download,
  no linked filename, no autosave concept at all) so Firefox/Safari users don't see a
  status line implying a capability they don't have.
- Decide: is "Save Workspace" (IndexedDB via `handleSaveCurrent`/`onSaveCurrent`) meant
  to be part of this collapsed indicator too, or does the audit's ask only concern the
  FSA `.idcard`-file save + autosave pair? The audit item names exactly "Save
  Workspace" (button) and "Autosave" (switch) — re-reading the code, "Save Workspace"
  the *menu item* is actually the FSA file-save (`handleSaveWorkspace`), not
  `handleSaveCurrent` — so scope is correctly the two `MenuItem`s described above, not
  the separate IndexedDB autosave-on-every-change behavior. Worth confirming in review
  before implementation since the naming is easy to conflate.

---

## 3. Print step: visual sheet-layout preview

### Current state
File: `src/components/PrintStep.tsx`. The "N cards per sheet · N sheets total" text
(~line 138-143) is driven by a `layout` object computed above it (~line 28-55):

```ts
const layout = computeLayout(paperW, paperH, safeCardW, safeCardH, margin, gap);
// layout: { cols, rows, perPage }
const totalCards  = printIndices.length;
const totalSheets = totalCards > 0 ? Math.ceil(totalCards / layout.perPage) : 0;
```

`computeLayout` and `computeEffectivePaperDims` (paper-size/orientation resolution,
including `'auto'` orientation picking whichever yields more cards/page) live in
`src/components/PrintSettings.tsx` (~line 43-86) and are already the single shared
source of truth — `CombinePdfDialog.tsx` doesn't reimplement this math either; it goes
through `src/utils/aggregatePdf.ts`, which reuses the same two functions. `layout.cols`
and `layout.rows` are already computed today but **not currently rendered** — only
`perPage` is surfaced as text. This means the visual preview needs zero new geometry
calculation, only a new presentational component consuming values that already exist.

`PrintSettings.tsx` also computes a `layoutSummary` locally (~line 189-192) for its own
form — worth checking whether that already has embryonic preview-adjacent code to reuse
rather than re-deriving independently.

### Proposed approach
Add a small `SheetPreview` component (new file, e.g.
`src/components/SheetPreview.tsx`) that renders a scaled-down visual grid: outer box
representing the paper (`paperW`×`paperH`, aspect-ratio preserved via CSS, e.g.
`aspect-ratio: paperW / paperH`), with `layout.cols` × `layout.rows` inner rectangles
representing card slots, margin as outer padding, gap as inner spacing between cells —
using the exact same `margin`/`gap`/`cardW`/`cardH` values already computed in
`PrintStep.tsx`, not independently eyeballed proportions (this is the print-fidelity
constraint: the miniature must be geometrically derived from the same inputs that drive
the real PDF/print output, not a decorative approximation). Suggested visual: thin
neutral-gray (`secondary`/outline-tinted, not violet — this is a passive visual aid, not
an action) rectangle outlines for each card slot; flat, no shadow, consistent with
flat-by-default (this is inline content, not a floating card preview, so it does not
qualify for the `boxShadow: 3` floating-preview treatment reserved for
`CardEditDialog`/`PreviewGrid`).

Placement: directly beside or below the existing "N cards per sheet · N sheets total"
text in `PrintStep.tsx`, sized small (e.g. max ~120-160px wide) — this is a "sanity
check at a glance" aid per the audit, not a large hero visualization; keep it dense and
secondary to the actual print settings controls.

Reuse for `CombinePdfDialog.tsx`: since that dialog already computes an equivalent
`layout` via the same shared functions (through `aggregatePdf.ts`'s reuse of
`computeLayout`), the new `SheetPreview` component should accept plain
`{ cols, rows, paperW, paperH, margin, gap, cardW, cardH }` props (not anything
`PrintStep`-specific) so both `PrintStep.tsx` and `CombinePdfDialog.tsx` can mount it
without duplicating the geometry-to-CSS mapping logic — directly addresses the
already-duplicated `PAPER_SIZES`/`detectPaperId` pattern the audit-adjacent research
flagged between the two files (they diverged once already on paper-size constants;
don't let the preview diverge too).

### State changes
None — purely presentational, consumes props/local computed values already present in
both call sites. No `AppState` or `AppAction` changes needed.

### Effort
**M** — new component + CSS geometry mapping (aspect-ratio box, grid of card-slot
rectangles) is straightforward, but needs care to stay pixel/proportion-accurate across
both portrait/landscape and the `'auto'` paper-orientation resolution path, and should
be visually tested against actual print output (or at minimum against the PDF export)
to honor "print-fidelity is non-negotiable" — this is the one item in the plan where a
purely-code review is not sufficient; it needs a visual QA pass against real print/PDF
output.

### Dependencies / sequencing
Best done as a **shared component** from the start (used by both `PrintStep.tsx` and
`CombinePdfDialog.tsx`) — if sequenced after item 4 is irrelevant, but if a shared
`SheetPreview` is built, do the `PrintStep.tsx` integration first (simpler embedding
context) and validate visually before wiring it into `CombinePdfDialog.tsx`'s dialog
layout (which has different spacial constraints — modal width, existing paper-size
form fields).

### Open questions / risks
- `computeEffectivePaperDims`'s `'auto'` orientation mode picks portrait vs landscape
  based on card count, not user's explicit paper orientation choice — the preview must
  reflect the *effective* (resolved) paper dimensions, not the raw `paperOrientation`
  setting, or the visual could contradict the "N cards per sheet" text next to it.
- `CombinePdfDialog.tsx`'s locally-duplicated `PAPER_SIZES`/`detectPaperId` (separate
  from `PrintSettings.tsx`'s `detectPaperSizeId`) is a pre-existing inconsistency not
  in scope for this item, but building a shared `SheetPreview` component makes it more
  visible/tempting to fix opportunistically — recommend flagging as a follow-up rather
  than scope-creeping this item.
- Not affected by `StepErrorBoundary` remount since it's presentational/derived-only,
  no state to lose on remount.
- Very small card counts / very large `perPage` values (e.g. tiny badge cards yielding
  40+ per sheet) need a sensible cap on rendered grid cells (or a "N × M" numeric
  overlay instead of literally rendering 40+ DOM rectangles) to avoid layout jank.

---

## 4. TemplatePicker: thumbnail grid (3+ templates)

### Current state
File: `src/components/TemplatePicker.tsx`. Currently a bare MUI `<List dense>` of
`<ListItem><ListItemButton>` rows (~line 96-121) — `meta.name` as primary text,
formatted `meta.savedAt` as secondary text, trailing delete `IconButton`. No thumbnail
or preview image is rendered anywhere in this component today.

`UserTemplateMeta` (`src/types.ts`, ~line 146-150) has **no thumbnail field**:
```ts
export interface UserTemplateMeta {
  id: string;
  name: string;
  savedAt: string; // ISO date
}
```
`UserTemplateEntry = { meta: UserTemplateMeta; template: Template }`
(`src/utils/userTemplates.ts`) — the full `Template` (elements, background, watermark)
is available per saved template via `loadUserTemplates()`/`loadResolvedUserTemplates()`,
so a thumbnail is derivable from data already on hand, but nothing is pre-rendered or
cached today.

### Proposed approach
Two viable strategies, in order of preference given effort/fidelity tradeoffs:

**A. Live-rendered mini canvas (recommended default).** Reuse the existing
scaled-canvas technique already used elsewhere in the codebase (`PreviewGrid` /
`CardEditDialog` — full-px template render + CSS `transform: scale()`) to render each
`Template` at thumbnail size directly in the grid. No new persisted data, no storage
migration, always reflects the current template state (no stale-thumbnail risk).
Downside: needs `resolveTemplateAssets` on each entry before it can render backgrounds/
watermarks (per `src/components/CLAUDE.md`'s noted "TemplatePicker patterns" — the list
today receives *unresolved* `asset:`-ref-bearing templates and only resolves on
selection) — switching to live-rendered thumbnails means resolving assets for every
visible template up front, which is a bigger IndexedDB read/asset-store round-trip than
today's picker does. For a typical few-dozen-template library this is likely fine but
should be checked against actual template counts/image sizes in real workspaces.

**B. Persisted thumbnail bitmap generated at save time.** Add a `thumbnail?: string`
(data URL) field to `UserTemplateMeta`, generated via the same rendering engine
`src/utils/exportImages.ts` already uses (html2canvas or equivalent) at
`saveUserTemplate()` time, and externalized through `assetStore.ts`
(`externalizeTemplateAssets`-equivalent) since thumbnails will regularly exceed the 8KB
inline threshold. Faster to render in the grid (no per-item live canvas mount), but
needs a `types.ts` field addition, a `userTemplates.ts` write-path change, and a
one-time migration consideration for templates saved before this change (no thumbnail
present → fall back to a placeholder or lazily generate on first view).

Recommend **A** for the initial implementation — it avoids schema/migration surface
entirely and directly reuses an established rendering pattern already proven elsewhere
in the app, at the cost of a bit more render work per picker open. Revisit **B** only if
live-render performance proves to be a real problem with actual template libraries.

UI layout: MUI `Grid`/`ImageList`-style card grid, each cell showing the scaled template
render + name below it (small `body2`, no violet — reserve violet for the currently-
selected template's border/outline only, per Sparing Violet Rule), delete affordance
on hover (icon button, top-right corner overlay) rather than a permanently-visible
trailing icon column as today. Fall back to the existing bare list when fewer than 3
templates exist, per the audit's explicit threshold — implement as a simple
`templates.length >= 3 ? <ThumbnailGrid /> : <List />` branch inside
`TemplatePicker.tsx`, not two separate components maintained in parallel long-term (keep
the list-rendering logic factored so both share the delete/select handlers).

### State changes
- Strategy A: none in `AppState`/`types.ts` — purely a `TemplatePicker.tsx` rendering
  change plus an upfront `resolveTemplateAssets` call per visible entry (already an
  existing utility, just invoked more eagerly/broadly than today).
- Strategy B: adds `thumbnail?: string` to `UserTemplateMeta` (`src/types.ts`), a
  generation step in `saveUserTemplate()` (`src/utils/userTemplates.ts`), and
  externalize/resolve wiring through `assetStore.ts` — more surface area, no `AppState`
  changes either way (this is workspace-independent, stored template-library data).

### Effort
**M** (Strategy A) / **L** (Strategy B, due to migration + asset-store wiring +
generation-at-save-time integration with `exportImages.ts`'s render pipeline).

### Dependencies / sequencing
Independent of items 1-3. If Strategy A is chosen, no dependency on assetStore changes.
Do this last among the four if effort-sequencing by risk — it's the most open-ended
(strategy choice) and benefits from having the other three (simpler, better-scoped)
items done first to validate the general design-review cadence before tackling this
one's decision points.

### Open questions / risks
- Confirm actual typical saved-template counts across real users — if libraries are
  usually small (under ~10), Strategy A's per-open render cost is a non-issue; if some
  power users accumulate 50+, live-rendering all of them on every picker open could be
  noticeably slower than the current bare list, and lazy/virtualized rendering
  (render only visible grid cells) would need to be factored into Strategy A's effort
  estimate.
- `TemplatePicker` interacts with `StepErrorBoundary`'s remount-on-step-change behavior
  only insofar as it's presumably rendered inside the Design step — if so, switching
  steps and back forces a full remount, meaning Strategy A's live-render happens again
  from scratch each time (no caching across remounts unless memoized at a level above
  the step boundary, which isn't currently the case for step-local UI). Not a
  correctness risk, just a perf one worth profiling.
- Strategy B's migration path for pre-existing templates without a `thumbnail` field
  needs an explicit fallback decision (blank placeholder vs. generate-on-first-view
  vs. one-time batch backfill) — flag as a design decision, not an implementation
  detail, before choosing Strategy B.

---

## Suggested Implementation Order

1. **Item 1 — Persistent card-count/context bar** (S, no dependencies, no store changes)
2. **Item 3 — Print step visual sheet-layout preview** (M, no dependencies, no store
   changes, directly serves the "print-fidelity is non-negotiable" principle)
3. **Item 2 — Collapse WorkspaceSwitcher save states** (M, no dependencies, isolated to
   one large but self-contained component)
4. **Item 4 — TemplatePicker thumbnail grid** (M/L depending on strategy, no
   dependencies, but the most open-ended in scope/strategy choice)

### Rationale
None of the four items has a hard technical dependency on another — they touch disjoint
files (`App.tsx` context bar; `PrintStep.tsx`/`PrintSettings.tsx`/`CombinePdfDialog.tsx`
for the sheet preview; `WorkspaceSwitcher.tsx` for save-state collapse;
`TemplatePicker.tsx`/`userTemplates.ts`/`assetStore.ts` for thumbnails) and none requires
new `AppState` fields or `AppAction` types, so sequencing is a risk/effort/value
judgment rather than a technical necessity:

- **Item 1 first** because it's the smallest, lowest-risk change (a warm-up that
  validates the review/QA cadence for this batch of work before tackling anything with
  more surface area) and delivers immediate, always-visible value.
- **Item 3 next** because it most directly serves the app's non-negotiable
  print-fidelity principle and has zero new state/schema surface — all the geometry
  already exists and just needs a visual representation, making it high-value/
  moderate-effort with the clearest scope of the four.
- **Item 2 third** because, while self-contained, it requires the most careful
  untangling of overlapping async/permission state inside a large existing component —
  worth doing once the team has re-familiarized itself with the codebase's conventions
  via items 1 and 3, and it carries a real risk of accidentally hiding error states if
  rushed.
- **Item 4 last** because it's the only item with an open strategic decision (live-render
  vs. persisted-thumbnail) that benefits from being made with the fullest possible
  context, and its effort/risk profile (L in the worst case, with migration
  considerations) is the highest of the four — best not to front-load that uncertainty.

**Cross-cutting note:** none of the four items were found to conflict with the
`StepErrorBoundary key={activeStep}` remount gotcha in a way that requires new
`AppState` fields — all four are either outside the step-content boundary (items 1, 2)
or are purely derived/presentational with no local state to lose on remount (items 3, 4).
If any implementation later discovers a need for local UI state that must survive step
navigation (e.g. a "don't show sheet preview" collapse toggle the user wants remembered
across Print step remounts), that specific piece of state — and only that piece — would
need to be lifted into `AppState` per the project's established pattern; the plan
deliberately avoids proposing that pre-emptively since none of the four items currently
requires it.
