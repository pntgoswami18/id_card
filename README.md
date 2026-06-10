# ID Card Generator

A web app to design ID card templates, import data from CSV, capture or upload photos, and print individual, selected, or all cards. Built with React, Vite, TypeScript, and Material UI.

**[GitHub](https://github.com/pntgoswami18/id_card)**

## Features

- **Design**: Create card templates with text, label, and image elements. Map fields to CSV columns. Add solid/gradient backgrounds and watermarks. Start from built-in templates (Employee, Student, Visitor, Event Pass, Minimal) or save your own. Image elements support **cover / contain / fill** fit modes and default to passport-size aspect ratio (35×45 mm).
- **Data**: Upload a CSV file (first row as headers); map columns to template fields; generate one card per row. The uploaded CSV is remembered if you navigate away and return to the Data step.
- **Preview**: View all generated cards. Edit individual cards — override field values, take a photo via webcam, or upload a photo from your device. Both webcam capture and file upload go through an interactive **crop step** before saving.
- **Print**: Set card size (mm) and orientation; save/load print presets; print selected cards or all cards.
- **Workspaces**: Switch between multiple independent projects, each with its own template, data, and logo.
- **Save & Open Workspace**: Save all workspace data (template, records, images) to a `.idcard` file via the OS save dialog. Re-open any saved workspace with the OS file picker. **Autosave** writes to the same file on every change (enabled by default, Chrome/Edge only).

## Quick Start

```bash
git clone https://github.com/pntgoswami18/id_card.git
cd id_card
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

## Save & Open Workspace

All data is stored in the browser's `localStorage`. You can also save to a portable `.idcard` file:

1. **Save Workspace**: Click the workspace name (top right) → **Save Workspace**. An OS save dialog opens — choose a location. The file includes all template config, records, and images.
2. **Open Workspace**: Workspace menu → **Open Workspace** → select a `.idcard` file. This replaces the current workspace state.
3. **Autosave**: After using Save Workspace, a toggle in the workspace menu keeps autosave enabled — every change writes silently to the same file without prompting.

> **Note**: The OS save/open dialog (File System Access API) is only available in Chrome and Edge. In other browsers, Save Workspace downloads the file and Open Workspace uses a standard file picker — autosave is not available.

## Scripts

| Script            | Description                 |
| ----------------- | --------------------------- |
| `npm run dev`     | Start dev server (Vite)     |
| `npm run build`   | Build for production        |
| `npm run preview` | Preview production build    |
| `npm run lint`    | Run ESLint                  |

## Build

```bash
npm run build
npm run preview
```

## Tech Stack

- React 19, Vite 7, TypeScript
- MUI (Material UI) v7 with MD3-inspired theme
- PapaParse for CSV parsing
- No backend; data stored in `localStorage`

## Browser Notes

- **Webcam**: Requires HTTPS or `localhost` for `getUserMedia`.
- **Save/Open Workspace**: OS-native file dialogs require Chrome or Edge (File System Access API). Firefox and Safari fall back to download/upload.
- **Print**: Use Chrome or Edge for best print layout; "Save as PDF" works for PDF export.
