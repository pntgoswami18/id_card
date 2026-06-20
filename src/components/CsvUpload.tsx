import { useRef } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import type { ParsedCsv } from '../utils/csv';
import { parseCsv } from '../utils/csv';

interface CsvUploadProps {
  onParsed: (data: ParsedCsv) => void;
  onError?: (err: Error) => void;
  /** Expected column headers in order, from the template bindings */
  expectedColumns?: string[];
}

export default function CsvUpload({ onParsed, onError, expectedColumns = [] }: CsvUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.includes('csv') && !file.name.endsWith('.csv')) {
      onError?.(new Error('Please select a CSV file.'));
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      onError?.(new Error('CSV file must be under 50 MB.'));
      return;
    }
    try {
      const data = await parseCsv(file);
      onParsed(data);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const uniqueOrderedColumns = [...new Set(expectedColumns)];

  return (
    <Box>
      {uniqueOrderedColumns.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Expected columns (from your template, in order):
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {uniqueOrderedColumns.map((col) => (
              <Chip key={col} label={col} size="small" variant="outlined" />
            ))}
          </Box>
        </Box>
      )}
      {/*
        Use a real <button> onClick → ref.click() so the file dialog open is a direct
        synchronous user-gesture call. The label/component="label" patterns both fail in
        Chrome: MUI adds role="button" to non-button components, which causes the browser
        to treat the inner span as an interactive widget that consumes the click, preventing
        the label from triggering the file input. Using position:absolute/opacity:0 instead
        of display:none ensures Chrome treats the programmatic .click() as a trusted gesture.
      */}
      <Button variant="contained" onClick={() => inputRef.current?.click()}>
        Upload CSV
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileChange}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        First row should be column headers.
      </Typography>
    </Box>
  );
}
