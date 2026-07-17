import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import LinearProgress from '@mui/material/LinearProgress';
import DownloadIcon from '@mui/icons-material/Download';
import { useAppState, useAppDispatch } from '../store/AppStateContext';
import PrintSettings, { computeLayout, computeEffectivePaperDims } from './PrintSettings';
import PrintView from './PrintView';
import { exportCardsAsImages, type ExportFormat } from '../utils/exportImages';

export default function PrintStep() {
  const { template, records, printSettings, printPresets, selectedCardIndices, workspaceList, currentWorkspaceId } = useAppState();
  const dispatch = useAppDispatch();

  const [exportFormat, setExportFormat] = useState<ExportFormat>('png');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportTotal, setExportTotal] = useState(0);

  const workspaceName = workspaceList.find((w) => w.id === currentWorkspaceId)?.name ?? 'cards';

  // Card dimensions — same swap convention as DesignStep:
  // portrait: heightMm becomes the card width (card is taller than wide)
  // landscape: widthMm becomes the card width (card is wider than tall)
  const cardW = printSettings.orientation === 'portrait'
    ? printSettings.heightMm
    : printSettings.widthMm;
  const cardH = printSettings.orientation === 'portrait'
    ? printSettings.widthMm
    : printSettings.heightMm;
  const safeCardW = Number.isFinite(cardW) ? cardW : 53.98;
  const safeCardH = Number.isFinite(cardH) ? cardH : 85.6;

  const rawPaperW = printSettings.paperWidthMm  ?? 210;
  const rawPaperH = printSettings.paperHeightMm ?? 297;
  const margin    = printSettings.pageMarginMm  ?? 5;
  const gap       = printSettings.cardGapMm     ?? 0;
  const paperOrientation = printSettings.paperOrientation ?? 'auto';

  const { w: paperW, h: paperH } = computeEffectivePaperDims(
    rawPaperW, rawPaperH, paperOrientation, safeCardW, safeCardH, margin, gap,
  );

  const printIndices =
    selectedCardIndices.length > 0 ? selectedCardIndices : records.map((_, i) => i);

  const layout = computeLayout(paperW, paperH, safeCardW, safeCardH, margin, gap);
  const totalCards  = printIndices.length;
  const totalSheets = totalCards > 0 ? Math.ceil(totalCards / layout.perPage) : 0;

  const handleExport = async () => {
    if (records.length === 0 || isExporting) return;
    setIsExporting(true);
    setExportProgress(0);
    setExportTotal(printIndices.length);
    try {
      await exportCardsAsImages(
        template,
        records,
        printIndices,
        safeCardW,
        safeCardH,
        workspaceName,
        {
          format: exportFormat,
          onProgress: (done, total) => {
            setExportProgress(done);
            setExportTotal(total);
          },
        },
      );
    } finally {
      setIsExporting(false);
      setExportProgress(0);
      setExportTotal(0);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto' }}>
      <Box
        id="print-view"
        sx={{ position: 'absolute', left: -9999, top: 0, overflow: 'hidden' }}
      >
        <PrintView
          template={template}
          records={records}
          indices={printIndices}
          cardWidthMm={safeCardW}
          cardHeightMm={safeCardH}
          paperWidthMm={paperW}
          paperHeightMm={paperH}
          pageMarginMm={margin}
          cardGapMm={gap}
        />
      </Box>

      <style>{`
        @media print {
          .no-print, .no-print * { display: none !important; }
          body * { visibility: hidden; }
          #print-view, #print-view * { visibility: visible; }
          #print-view { position: absolute !important; left: 0 !important; top: 0 !important; }
          @page { size: ${paperW}mm ${paperH}mm; margin: 0; }
          body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <Paper sx={{ p: 2, mb: 2 }} className="no-print">
        <Typography variant="subtitle2" gutterBottom>Print settings</Typography>
        <PrintSettings
          settings={printSettings}
          presets={printPresets}
          onSettingsChange={(s) => dispatch({ type: 'SET_PRINT_SETTINGS', payload: s })}
          onPresetsChange={(p) => dispatch({ type: 'SET_PRINT_PRESETS', payload: p })}
          showOrientation={false}
          cardWidthMm={safeCardW}
          cardHeightMm={safeCardH}
        />
      </Paper>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 2 }} className="no-print">
        <Button
          variant="contained"
          disabled={records.length === 0}
          onClick={() => window.print()}
        >
          {selectedCardIndices.length > 0
            ? `Print Selected (${selectedCardIndices.length})`
            : 'Print All'}
        </Button>
        {totalCards > 0 && (
          <Typography variant="body2" color="text.secondary">
            {layout.perPage} card{layout.perPage !== 1 ? 's' : ''} per sheet
            {' · '}{totalSheets} sheet{totalSheets !== 1 ? 's' : ''} total
          </Typography>
        )}
      </Box>

      {/* ── Export as images ── */}
      <Paper sx={{ p: 2 }} className="no-print">
        <Typography variant="subtitle2" gutterBottom>Export as images</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Each {selectedCardIndices.length > 0 ? 'selected' : ''} card is exported as a separate image file inside a ZIP archive.
        </Typography>

        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={exportFormat}
            onChange={(_, v) => { if (v) setExportFormat(v as ExportFormat); }}
            disabled={isExporting}
          >
            <ToggleButton value="png">PNG</ToggleButton>
            <ToggleButton value="jpeg">JPG</ToggleButton>
          </ToggleButtonGroup>

          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            disabled={records.length === 0 || isExporting}
            onClick={handleExport}
          >
            {isExporting
              ? `Exporting… ${exportProgress} / ${exportTotal}`
              : selectedCardIndices.length > 0
                ? `Export Selected (${selectedCardIndices.length})`
                : 'Export All'}
          </Button>
        </Box>

        {isExporting && (
          <LinearProgress
            variant="determinate"
            value={exportTotal > 0 ? (exportProgress / exportTotal) * 100 : 0}
            sx={{ mt: 1.5, borderRadius: 1 }}
          />
        )}
      </Paper>

      {records.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 2 }} className="no-print">
          No cards to print. Generate cards in the Data step first.
        </Typography>
      )}
    </Box>
  );
}
