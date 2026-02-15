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
    if (!file) return;
    try {
      const data = await parseCsv(file);
      onParsed(data);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
    e.target.value = '';
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
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <Button variant="contained" onClick={() => inputRef.current?.click()}>
        Upload CSV
      </Button>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        First row should be column headers.
      </Typography>
    </Box>
  );
}
