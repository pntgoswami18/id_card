import { useId } from 'react';
import Box from '@mui/material/Box';
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
  // Unique id so the native <label htmlFor> association is unambiguous even if
  // more than one CsvUpload is ever mounted.
  const inputId = useId();

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

      {/* Native label/input association — no programmatic click() needed. */}
      <Box
        component="label"
        htmlFor={inputId}
        tabIndex={0}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          userSelect: 'none',
          px: 2,
          py: 0.75,
          minWidth: 64,
          borderRadius: 1,
          fontSize: '0.875rem',
          fontWeight: 500,
          lineHeight: 1.75,
          letterSpacing: '0.02857em',
          textTransform: 'uppercase',
          color: 'primary.contrastText',
          bgcolor: 'primary.main',
          boxShadow: 1,
          transition: 'background-color 0.2s, box-shadow 0.2s',
          '&:hover': { bgcolor: 'primary.dark', boxShadow: 2 },
          '&:active': { boxShadow: 0 },
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '2px' },
        }}
      >
        Upload CSV
      </Box>
      {/* Input lives outside the label — only linked via htmlFor/id.
          display:none keeps it invisible but fully activatable by the label click. */}
      <input
        id={inputId}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        First row should be column headers.
      </Typography>
    </Box>
  );
}
