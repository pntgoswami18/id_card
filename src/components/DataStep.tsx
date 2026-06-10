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
import { generateId } from '../utils/id';

export default function DataStep() {
  const { template, columnMapping, csvData } = useAppState();
  const dispatch = useAppDispatch();
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity?: 'error' | 'success' }>({
    open: false,
    message: '',
  });

  const parsed: ParsedCsv | null = csvData;

  const handleParsed = (data: ParsedCsv) => {
    dispatch({ type: 'SET_CSV_DATA', payload: data });
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
    if (parsed.rows.length === 0) {
      setSnackbar({ open: true, message: 'The CSV file has no data rows.', severity: 'error' });
      return;
    }
    const records: CardRecord[] = parsed.rows.map((row) => {
      const data: Record<string, string | null> = {};
      Object.keys(columnMapping).forEach((field) => {
        const col = columnMapping[field];
        data[field] = col && row[col] != null ? String(row[col]) : null;
      });
      return {
        id: generateId('rec'),
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
            onClick={() => {
              dispatch({ type: 'SET_CSV_DATA', payload: null });
              dispatch({ type: 'SET_COLUMN_MAPPING', payload: {} });
              dispatch({ type: 'SET_RECORDS', payload: [] });
            }}
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
