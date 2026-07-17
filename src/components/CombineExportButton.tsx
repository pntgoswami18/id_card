import { useState } from 'react';
import Button from '@mui/material/Button';
import type { PrintSettings as PrintSettingsType } from '../types';
import CombinePdfDialog from './CombinePdfDialog';

interface CombineExportButtonProps {
  printSettings: PrintSettingsType;
}

/**
 * Rendered in App.tsx's persistent header (not inside any step), so it stays
 * reachable from the very first page — its data sources (saved workspaces via
 * IndexedDB, or previously-exported images/ZIPs) don't require the current
 * in-progress workspace to have any records yet.
 */
export default function CombineExportButton({ printSettings }: CombineExportButtonProps) {
  const [open, setOpen] = useState(false);

  const rawPaperW = printSettings.paperWidthMm ?? 210;
  const rawPaperH = printSettings.paperHeightMm ?? 297;
  const margin = printSettings.pageMarginMm ?? 5;
  const gap = printSettings.cardGapMm ?? 0;
  const paperOrientation = printSettings.paperOrientation ?? 'auto';

  return (
    <>
      <Button variant="outlined" onClick={() => setOpen(true)}>
        Combine / Export Cards…
      </Button>
      <CombinePdfDialog
        open={open}
        onClose={() => setOpen(false)}
        defaultPaper={{
          paperWidthMm: rawPaperW,
          paperHeightMm: rawPaperH,
          paperOrientation,
          pageMarginMm: margin,
          cardGapMm: gap,
        }}
      />
    </>
  );
}
