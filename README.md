# ID Card Generator

A web app to design ID cards, import data from CSV, capture photos via webcam, and print individual, selected, or all cards. Built with React, Vite, TypeScript, and Material UI.

## Features

- **Design**: Create card templates with text, labels, and image elements; map fields to CSV columns; add solid/gradient backgrounds and watermarks; start from built-in templates (Employee, Student, Visitor, Event Pass, Minimal) or save your own. New image elements default to passport-size aspect ratio (35×45 mm).
- **Data**: Upload CSV (first row as headers); map columns to template fields; generate one card per row.
- **Preview**: View all cards; edit individual cards (override fields, take photo via webcam); select cards for bulk print.
- **Print**: Set card size (mm) and orientation; save/load print presets; print selected cards or all cards.
- **Workspaces**: Switch between multiple projects; each workspace has its own template, data, and logo.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Windows

```bash
# Install dependencies and build
install-and-build.bat

# Run dev server
launch-app.bat
```

## Scripts

| Script            | Description               |
| ----------------- | ------------------------- |
| `npm run dev`     | Start dev server (Vite)    |
| `npm run build`   | Build for production       |
| `npm run preview` | Preview production build   |
| `npm run lint`  | Run ESLint                  |

## Build

```bash
npm run build
npm run preview
```

## Tech Stack

- React 19, Vite 7, TypeScript
- MUI (Material UI) with MD3-inspired theme
- PapaParse for CSV parsing
- No backend; data stored in `localStorage`

## Browser Notes

- **Webcam**: Requires HTTPS or `localhost` for `getUserMedia`.
- **Print**: Use Chrome or Edge for best print layout; "Save as PDF" works for export.
