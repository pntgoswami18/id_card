import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useAppState, useAppDispatch } from '../store/AppStateContext';
import PrintSettings from './PrintSettings';
import PrintView from './PrintView';

export default function PrintStep() {
  const { template, records, printSettings, printPresets, selectedCardIndices } = useAppState();
  const dispatch = useAppDispatch();

  const wMm = printSettings.orientation === 'portrait' ? printSettings.heightMm : printSettings.widthMm;
  const hMm = printSettings.orientation === 'portrait' ? printSettings.widthMm : printSettings.heightMm;

  const printIndices =
    selectedCardIndices.length > 0 ? selectedCardIndices : records.map((_, i) => i);

  const handlePrint = () => {
    window.print();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto' }}>
      <Box
        id="print-view"
        sx={{
          position: 'absolute',
          left: -9999,
          top: 0,
          overflow: 'hidden',
        }}
      >
        <PrintView
          template={template}
          records={records}
          indices={printIndices}
          widthMm={wMm}
          heightMm={hMm}
        />
      </Box>

      <style>{`
        @media print {
          .no-print, .no-print * { display: none !important; }
          body * { visibility: hidden; }
          #print-view, #print-view * { visibility: visible; }
          #print-view {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
          }
          @page { size: ${wMm}mm ${hMm}mm; margin: 0; }
          body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <Paper sx={{ p: 2, mb: 2 }} className="no-print">
        <Typography variant="subtitle2" gutterBottom>
          Print settings
        </Typography>
        <PrintSettings
          settings={printSettings}
          presets={printPresets}
          onSettingsChange={(s) => dispatch({ type: 'SET_PRINT_SETTINGS', payload: s })}
          onPresetsChange={(p) => dispatch({ type: 'SET_PRINT_PRESETS', payload: p })}
          showOrientation={false}
        />
      </Paper>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }} className="no-print">
        <Button
          variant="contained"
          disabled={records.length === 0}
          onClick={handlePrint}
        >
          {selectedCardIndices.length > 0
            ? `Print Selected (${selectedCardIndices.length})`
            : 'Print All'}
        </Button>
      </Box>

      {records.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 2 }} className="no-print">
          No cards to print. Generate cards in the Data step first.
        </Typography>
      )}
    </Box>
  );
}
