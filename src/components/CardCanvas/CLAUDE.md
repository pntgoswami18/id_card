# CardCanvas Module

React component that renders an ID card template. Used in two distinct modes: interactive design editing and static export.

## Files

- `CardCanvas.tsx` — main component and all sub-components (`FitText`, `renderBackground`, `renderWatermarkStatic`)
- `index.ts` — re-exports `CardCanvas` as default

## Props

| Prop | Purpose |
|---|---|
| `template` | Card template (elements, background, watermark) |
| `record` | Data record for field binding; `null`/`undefined` in design mode |
| `widthMm` / `heightMm` | Card dimensions in mm (defaults: 85.6 × 53.98) |
| `designMode` | Enables drag/resize/select interaction |
| `selectedElementIds` | Controlled selection (array of element IDs) |
| `onElementClick(id, addToSelection)` | Called on element mousedown in design mode |
| `onSelectionChange(ids)` | Called on marquee selection complete |
| `onElementUpdate(id, updates)` | Called during drag/resize with updated x/y/width/height (percent) |
| `containerRefProp` | Optional external ref for bounds measurement; falls back to internal ref |
| `watermarkEditMode` | When `true`: watermark is draggable/resizable, card elements get `pointerEvents: none` |
| `onWatermarkChange(wm)` | Called during watermark drag and on resize end with updated `WatermarkConfig` |

## Render Modes

### designMode=true
- Elements show dashed borders, are draggable and resizable.
- Single-selected element shows four corner resize handles (se/sw/ne/nw).
- Mousedown on canvas background starts marquee selection.
- `onElementClick` fires before drag starts. If `addToSelection` (Ctrl/Cmd held), drag is skipped.
- `watermarkEditMode` and `designMode` are mutually exclusive at the interaction level: `elementsEditable = designMode && !watermarkEditMode`.

### designMode=false (export/static)
- No handles, no interaction.
- Used by `exportImages.ts` via html2canvas.
- `record` data is rendered into bound fields; `placeholder` shown when no value.

## html2canvas Constraint — DO NOT Regress

**html2canvas 1.4.1 ignores the `scale` parameter for CSS `background-image`.** It samples background images at layout-pixel resolution then upscales, producing blurry exports.

**Fix in place:** `renderBackground()` renders image backgrounds as `<img>` elements (not CSS `background-image`). html2canvas processes `<img>` via `drawImage()` and correctly applies the scale multiplier.

- Solid color → `backgroundColor` CSS (safe)
- Gradient → `background: linear-gradient(...)` CSS (safe)
- Image → `<img style={{ objectFit: 'cover' }}>` (required)

**Do not convert image backgrounds back to CSS `background-image`.** This will silently produce pixelated card exports.

## isSafeImageSrc

Gates all image rendering in the component (backgrounds, watermarks, photo elements):

```ts
const isSafeImageSrc = (v) =>
  !!v && (
    (v.startsWith('data:image/') && !v.startsWith('data:image/svg')) ||
    /^https?:\/\//i.test(v)
  );
```

Allowed: `data:image/png`, `data:image/jpeg`, `https://...`, `http://...`
Blocked: `data:image/svg...` (XSS risk), relative paths, blob URLs, anything else.

If `isSafeImageSrc` returns false, the element renders a placeholder div instead.

## Coordinates and Scaling

All element positions and sizes are stored as **percentages** of card dimensions (0–100). The card container uses `width: Xmm; height: Ymm` in CSS — the browser handles mm→px. Drag/resize deltas are converted to percent using `containerRef.current.getBoundingClientRect()`.

`containerRefProp` exists so a scaled wrapper (e.g. a CSS-transformed parent) can provide its own bounds for correct delta math. Without it the component uses its own `internalRef`.

## FitText Component

Auto-sizes text to fill its container. Algorithm:
1. Binary search between `MIN_FONT_SIZE=6` and `MAX_FONT_SIZE=72`.
2. Measures longest word width (no word-break constraint) and wrapped text height via a hidden off-screen `div` appended to `document.body`.
3. Two-pass refinement: after setting font size, if the rendered span is noticeably smaller than its wrapper, re-measures using the span's actual bounds (avoids oversizing when the element is smaller than its percentage box suggests).

`FitText` is bypassed when `fontSizeAuto === false` or `fontSizeOverrides[binding]` is set on the record — those use a plain `<span>` with an explicit `fontSize`.

## Watermark

`WatermarkConfig` stores either a `position` preset (`center`, `top-left`, `top-right`, `bottom-left`, `bottom-right`) or explicit `x/y/width/height` percentages. `getWatermarkBox()` normalizes both forms to `{ x, y, width, height }`.

Default watermark size when using position preset: `DEFAULT_WM_SIZE = 30` (percent).

In `watermarkEditMode`, the watermark gets `pointerEvents: auto` with drag and four resize handles. `onWatermarkChange` is called during drag (continuous) and at resize end. Always passes the full updated `WatermarkConfig` object.

## Event Handling Pattern

Drag/resize handlers use a **ref + state dual pattern**:
- State (`dragState`, `resizeState`, etc.) triggers `useLayoutEffect` to attach/detach global `mousemove`/`mouseup` listeners on `document` (capture phase).
- Refs (`dragStateRef`, `resizeStateRef`, etc.) are read inside those global handlers to avoid stale closures.
- Same pattern applies to callbacks: `onElementUpdateRef`, `onSelectionChangeRef`, `onWatermarkChangeRef`, `templateRef`.

Do not remove the ref mirrors when refactoring — the global handlers depend on them.

## Marquee Selection

Initiated by mousedown on the canvas background element (not on any element). Tracks start/current mouse positions and renders a dashed overlay. On mouseup, computes which elements overlap the marquee rect and calls `onSelectionChange`. Disabled when `watermarkEditMode=true`.

## Tests

`CardCanvas.test.tsx` covers, without needing real pointer/drag simulation beyond `fireEvent.mouseDown`/`mouseMove`(on `document`)/`mouseUp` — the component's own document-level listeners (see "Event Handling Pattern" above) respond to these the same as real mouse events:
- The `isSafeImageSrc` XSS gate (security-relevant — blocks `data:image/svg`, relative paths; allows `data:image/png|jpeg`, `https://`) for photo elements, backgrounds, and watermarks alike.
- Background rendering for all three types (solid/gradient/image), including the gradient-direction allowlist falling back to `'to bottom'` for a disallowed value, and the image-background-as-`<img>`-not-CSS constraint.
- Static (non-edit-mode) watermark rendering: text vs. image, and the same `isSafeImageSrc` gate.
- Field binding resolution (overrides-over-data, placeholder fallback) and the FitText-bypass conditions (`fontSizeAuto === false`, or a per-record `fontSizeOverrides` entry for the binding).
- Design-mode selection (mousedown fires `onElementClick` before any drag; Ctrl/Cmd+mousedown selects without dragging), drag-to-move with percent-space clamping to `[0, 100-size]`, resize-handle dragging (only rendered for a single selection), marquee selection, and watermark-edit-mode dragging.

**Test-writing gotchas found while adding these:**
- Every `<img>` in this component uses `alt=""` (decorative) — per ARIA, an empty `alt` removes the image from the accessibility tree, so `getByRole('img')` never matches. Use `container.querySelector('img')` instead.
- `role={designMode ? 'button' : undefined}` is gated only on `designMode`, **not** `watermarkEditMode` — an element still has `role="button"` while `watermarkEditMode` is true. What actually changes is `elementsEditable` (`designMode && !watermarkEditMode`), which gates whether `onMouseDown` is attached at all (plus the elements-layer wrapper getting `pointerEvents: 'none'`). Test the *effect* (handler doesn't fire) rather than asserting the role disappears.
- jsdom returns an all-zero `getBoundingClientRect()` by default, which breaks every percent-space delta calculation (drag, resize, marquee, watermark drag all divide by `bounds.width`/`bounds.height`). Stub `Element.prototype.getBoundingClientRect` to a fixed non-zero rect (e.g. 400×200) for any test exercising these interactions.
