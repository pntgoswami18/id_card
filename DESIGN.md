---
name: ID Card Generator
description: A dense, repeat-use tool for designing ID card templates, mapping CSV data, and printing cards
colors:
  primary: "#6750A4"
  primary-light: "#E8DEF8"
  primary-dark: "#381E72"
  secondary: "#625B71"
  secondary-light: "#E8E0EC"
  secondary-dark: "#1D192B"
  error: "#B3261E"
  surface: "#FFFBFE"
  neutral-bg: "#FEF7FF"
typography:
  body:
    fontFamily: "Roboto, Helvetica, Arial, sans-serif"
    fontWeight: 400
  heading:
    fontFamily: "Roboto, Helvetica, Arial, sans-serif"
    fontWeight: 400
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  button: "20px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.button}"
    padding: "6px 16px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
---

# Design System: ID Card Generator

## 1. Overview

**Creative North Star: "The Purple Workbench"**

A soft MD3 violet identity wrapped around a dense, repeat-use production tool. The palette is friendly and calm — muted violet, off-white surfaces — but its job is to stay out of the way of someone running Design → Data → Preview → Print for the tenth time this week, not to make a first impression. Color is a wayfinding signal (active state, primary action), not a decoration.

The system explicitly rejects the generic-AI-SaaS look: no purple-to-blue gradients, no hero-metric cards, no nested cards, no tiny uppercase eyebrows, no bloated onboarding. It also rejects visual flourish that would slow down a frequent user — this is workbench tooling, not a showcase.

**Key Characteristics:**
- Muted violet primary, used sparingly as a signal, not a wash
- Off-white, low-chroma neutral surfaces (`#FEF7FF` background, `#FFFBFE` cards/panels)
- Regular-weight (400) headings throughout — quiet hierarchy, not shouting
- Soft, calm corner radii (8–20px) rather than sharp or aggressively rounded
- Flat by default; two intentional elevation levels reserved for control feedback and floating card previews (see Elevation)

## 2. Colors

The palette is a single muted violet family over neutral off-white surfaces — restrained, not full-palette.

### Primary
- **Muted Violet** (`#6750A4`): primary actions, active nav/step state, focus signals. Used sparingly — most of the UI stays neutral so a dense screen doesn't feel busy.
- **Violet Light** (`#E8DEF8`): selected/active background tint (e.g. current step indicator).
- **Violet Dark** (`#381E72`): pressed/emphasis state for primary-colored text or icons.

### Secondary
- **Muted Plum** (`#625B71`): secondary actions, less prominent controls.
- **Plum Light** (`#E8E0EC`) / **Plum Dark** (`#1D192B`): tint/emphasis variants, same role as the primary ramp.

### Neutral
- **Paper White** (`#FFFBFE`): card/panel/dialog surface.
- **Warm Off-White** (`#FEF7FF`): page background, one step below surface.
- **Error Red** (`#B3261E`): validation and destructive-state signal only.

### Named Rules
**The Sparing Violet Rule.** Primary violet marks the one active action or state on a screen — it is not a background wash or a decorative accent repeated across the layout.

## 3. Typography

**Body Font:** Roboto (fallback: Helvetica, Arial, sans-serif)
**Heading Font:** Roboto (same stack — no separate display face)

**Character:** A single quiet sans-serif family used at regular weight (400) even in headings. No bold, shouting display type — hierarchy comes from size and spacing, not weight or color.

### Hierarchy
- **Headline** (weight 400, MUI `h1`–`h3` scale): section/step titles.
- **Title** (weight 400, MUI `h4`–`h6` scale): panel and dialog titles.
- **Body** (weight 400, MUI default body scale): form labels, field values, table content.
- **Label** (MUI button/caption scale, no uppercase transform): buttons and chips — MD3 default of no forced uppercase is intentional here.

### Named Rules
**The No-Shout Rule.** Headings stay at regular weight (400) and buttons are never uppercase-transformed (`textTransform: 'none'`). Emphasis comes from size and placement, not boldness or all-caps.

## 4. Elevation

`MuiCard` defaults to `elevation: 0` (flat). Two intentional elevation levels are used on top of that, both drawn from MUI's numeric `theme.shadows` scale (no hand-written `boxShadow` values remain):

- **Control feedback** (`boxShadow: 1`–`2`): hover/active state on interactive chrome — `App.tsx` step indicators, `PrintStep`/`CombinePdfDialog` alerts. `1` = hover, `2` = active/selected.
- **Floating card preview** (`boxShadow: 3`): the "live card thumbnail floating above a surface" pattern — used identically in `CardEditDialog` and `PreviewGrid`. Reuse `3` for any future floating card-canvas preview rather than inventing a new value.

Reserve a shadow for genuine floating/overlay context (dialogs, dragged elements, floating previews); everything else stays flat. Don't introduce a third ad hoc value — extend one of the two above.

## 5. Components

### Buttons
- **Shape:** Rounded (20px / `rounded.button`), softer than the base MD3 shape default.
- **Primary:** Muted violet background, white text, no uppercase transform.
- **Hover / Focus:** MUI default state-layer behavior (no custom override).
- **Secondary / Ghost:** MUI outlined/text variants, same radius and no-transform rule.

### Cards / Containers
- **Corner Style:** 12px (`rounded.md`) at the theme level; individual panels/canvases often use smaller ad hoc radii (8–16px via `sx`).
- **Background:** Paper white (`#FFFBFE`).
- **Shadow Strategy:** Flat by default (`elevation: 0`); floating card previews use `boxShadow: 3` (see Elevation).
- **Internal Padding:** Standard MUI spacing scale (`sm`/`md`/`lg` = 8/16/24px).

### Inputs / Fields
- **Style:** Standard MUI outlined `TextField`/`Autocomplete`, no custom border or radius override observed.
- **Focus:** MUI default focus ring/border-color shift.

### Navigation
- **Style:** Step-based flow (Design → Data → Preview → Print) rendered as a horizontal stepper in `App.tsx`, using violet-light background tint for the active step and small border radii (`borderRadius: 2`) per step chip.

## 6. Do's and Don'ts

### Do:
- **Do** keep headings at regular weight (400) — no bold display type.
- **Do** keep primary violet (`#6750A4`) reserved for the one active action or state per screen.
- **Do** default new surfaces to flat (`elevation: 0`) and reserve shadows for genuine overlay/floating context.
- **Do** keep buttons non-uppercase (`textTransform: 'none'`) and rounded at ~20px.

### Don't:
- **Don't** use purple-to-blue gradients, hero-metric cards, or nested cards — this system explicitly rejects the generic-AI-SaaS look.
- **Don't** add tiny uppercase tracked eyebrows or numbered section scaffolding (`01 / 02 / 03`) — this is a workflow tool, not a landing page.
- **Don't** add visual flourish, decorative motion, or onboarding chrome that slows down a user running the same flow repeatedly.
- **Don't** introduce a new one-off `boxShadow` value — reuse `1`/`2` (control feedback) or `3` (floating card preview) from the Elevation section.
