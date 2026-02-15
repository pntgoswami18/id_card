import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { useAppState, useAppDispatch } from '../store/AppStateContext';
import CsvUpload from './CsvUpload';
import ColumnMapping from './ColumnMapping';
import type { ParsedCsv } from '../utils/csv';
import type { CardRecord } from '../types';

function generateRecordId(): string {
  return `rec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function DataStep() {
  const { template, columnMapping } = useAppState();
  const dispatch = useAppDispatch();
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity?: 'error' | 'success' }>({
    open: false,
    message: '',
  });

  const handleParsed = (data: ParsedCsv) => {
    setParsed(data);
    const initialMapping: Record<string, string> = {};
    template.elements.forEach((e) => {
      if (e.binding && data.headers.includes(e.binding)) {
        initialMapping[e.binding] = e.binding;
      }
    });
    dispatch({ type: 'SET_COLUMN_MAPPING', payload: initialMapping });
  };

  const handleError = (err: Error) => {
    setSnackbar({ open: true, message: err.message, severity: 'error' });
  };

  const handleMappingChange = (mapping: Record<string, string>) => {
    dispatch({ type: 'SET_COLUMN_MAPPING', payload: mapping });
  };

  const handleGenerate = () => {
    if (!parsed) return;
    const records: CardRecord[] = parsed.rows.map((row) => {
      const data: Record<string, string | null> = {};
      Object.keys(columnMapping).forEach((field) => {
        const col = columnMapping[field];
        data[field] = col && row[col] != null ? String(row[col]) : null;
      });
      return {
        id: generateRecordId(),
        data,
        overrides: {},
      };
    });
    dispatch({ type: 'SET_RECORDS', payload: records });
    dispatch({ type: 'SET_ACTIVE_STEP', payload: 2 });
    setSnackbar({ open: true, message: `Generated ${records.length} cards`, severity: 'success' });
  };

  const expectedColumns = template.elements
    .map((e) => e.binding)
    .filter((b): b is string => !!b);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto' }}>
      {!parsed ? (
        <CsvUpload
          onParsed={handleParsed}
          onError={handleError}
          expectedColumns={expectedColumns}
        />
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {parsed.headers.length} columns, {parsed.rows.length} rows
          </Typography>
          <ColumnMapping
            headers={parsed.headers}
            elements={template.elements}
            mapping={columnMapping}
            onMappingChange={handleMappingChange}
            onGenerate={handleGenerate}
          />
          <Button
            variant="outlined"
            size="small"
            sx={{ mt: 2 }}
            onClick={() => setParsed(null)}
          >
            Upload Different File
          </Button>
        </>
      )}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      >
        <Alert severity={snackbar.severity ?? 'info'} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
