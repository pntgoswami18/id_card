# DesignEditor — ElementPropertiesPanel

## What it does

Renders the right-hand properties panel when a card element is selected in design mode. It is stateless — all state lives in the parent. Every field calls `onUpdate` with a partial `TemplateElement` immediately on change.

## Props

```ts
type ElementPropertiesPanelProps = {
  element: TemplateElement | null;   // currently selected element; null = nothing selected
  selectedCount?: number;            // how many elements are selected (default 0)
  availableBindings: string[];       // CSV column names to populate the binding Autocomplete
  onUpdate: (updates: Partial<TemplateElement>) => void;
  onDelete: () => void;
  onDuplicate?: () => void;          // optional; hides the Duplicate button when absent
};
```

## Render states

Three mutually exclusive render paths — checked in this order:

1. `!element && selectedCount === 0` → "Select an element" empty state.
2. `selectedCount > 1` (multiSelect) → shows count, Duplicate (if provided), Delete only. **No field editing in multi-select mode.** Click a single element to edit properties.
3. Single element selected → full property form.

Note: the guard `if (!element && selectedCount === 0)` runs first, then `if (multiSelect)`, then `if (!element)`. The third guard handles the edge case where `selectedCount === 1` but `element` is still null (timing gap while parent resolves selection).

## Element types and which fields render

### Common to all types (always rendered in single-select mode)
- X (%), Y (%), Width (%), Height (%) — clamped: X/Y to [0, 100], Width/Height to [1, 100].
- **CSV Binding Autocomplete** — freeSolo, lists `availableBindings`. **Skipped for `label` type** (labels have a static `value` field instead).

### `label` only
- Label text (`value` field) — static text rendered directly on the card, not bound to CSV.
- No binding field (intentional — labels are never data-driven).
- Font fields below still apply.

### `text` only
- Placeholder — shown in the editor when no CSV data is available.

### `text` and `label` (both)
- Font size Autocomplete (freeSolo, see below)
- Font weight Select (`'normal'` | `'bold'`)
- Vertical align ToggleButtonGroup (`'top'` | `'center'` | `'bottom'`)
- Font family Autocomplete (freeSolo, see below)
- Color picker (`type="color"` TextField)

### `image` only
- Placeholder text — label shown in editor where the image will appear.
- Object fit Select: `'cover'` | `'contain'` | `'fill'`.
- No font fields.

## MUI freeSolo Autocomplete — onBlur is required

There are three freeSolo Autocompletes: CSV Binding, Font size, Font family.

`onChange` fires only when the user picks from the dropdown or presses Enter. If the user types a custom value and clicks away, `onChange` does **not** fire. Each Autocomplete adds `onBlur` to the inner `TextField` inside `renderInput` to capture the typed value on blur:

```tsx
renderInput={(params) => (
  <TextField
    {...params}
    label="..."
    onBlur={(e) => {
      const v = e.target.value.trim();
      onUpdate({ binding: v || undefined });
    }}
  />
)}
```

Do not remove or move `onBlur` — without it, typed-but-not-confirmed values are silently lost.

## Font size: dual-mode field (`fontSizeAuto` + `fontSize`)

Font size has two states stored separately on the element:

| User picks | `fontSizeAuto` | `fontSize` |
|---|---|---|
| A numeric value | `false` | that number |
| `'Dynamic'` | `true` | `12` (reset to default) |

`parseFontSizeValue` handles the conversion from any Autocomplete input (string, number, or `null`) to `{ dynamic, size }`. It clamps numeric values to [1, 999] and falls back to `12` on invalid input.

The Autocomplete `value` is derived at render time:
```tsx
value={element.fontSizeAuto ? 'Dynamic' : (element.fontSize ?? 12)}
```

Both `onChange` and `onBlur` call `parseFontSizeValue` and update both `fontSizeAuto` and `fontSize` together. Never update one without the other.

## Binding field: `undefined` vs empty string

Binding is stored as `undefined` (absent) when cleared, not as `''`. Both `onChange` and `onBlur` normalize:
```ts
onUpdate({ binding: v || undefined })
```
If you add new binding logic, follow the same pattern — passing `binding: ''` will leave a blank entry in the template that breaks CSV lookup.

## `verticalAlign` ToggleButtonGroup gotcha

`ToggleButtonGroup` with `exclusive` will pass `null` to `onChange` if the user clicks the already-selected button (deselect). The handler guards against this:
```tsx
onChange={(_, value) => { if (value) onUpdate(...) }}
```
Do not remove the `if (value)` guard or the field will be cleared to `null` on re-click.

## Type casting

The component receives `element: TemplateElement` (a union type). Fields specific to a subtype are accessed with casts: `(element as TextElement).placeholder`, `(element as LabelElement).value`, etc. This is intentional — the render is already gated by `element.type` checks, so the casts are safe. Do not widen fields onto the base `TemplateElement` type to avoid the casts.

## `onDuplicate` is optional

The Duplicate button renders only when `onDuplicate` is defined — both in single-select mode (at the bottom of the form) and in multi-select mode. Do not assume it is always present.
