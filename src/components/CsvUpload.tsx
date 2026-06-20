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
        MUI ButtonBase adds role="button" to any non-button component, which overrides
        the native label semantics and breaks the label→input association. Wrapping a
        plain HTML <label> around a Button component="span" avoids this — the outer
        <label> is not touched by ButtonBase so the browser honours its native behaviour.
      */}
      <label style={{ display: 'inline-block' }}>
        <Button variant="contained" component="span" tabIndex={-1}>
          Upload CSV
        </Button>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </label>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        First row should be column headers.
      </Typography>
    </Box>
  );
}
