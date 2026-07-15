import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import type { TemplateElement } from '../types';
import type { ColumnMapping } from '../types';

interface ColumnMappingProps {
  headers: string[];
  elements: TemplateElement[];
  mapping: ColumnMapping;
  onMappingChange: (mapping: ColumnMapping) => void;
  onGenerate: () => void;
  onUploadDifferent: () => void;
}

export default function ColumnMappingComponent({
  headers,
  elements,
  mapping,
  onMappingChange,
  onGenerate,
  onUploadDifferent,
}: ColumnMappingProps) {
  const bindings = elements
    .map((e) => e.binding)
    .filter((b): b is string => !!b);
  const uniqueBindings = [...new Set(bindings)];

  if (uniqueBindings.length === 0) {
    return (
      <Box sx={{ py: 2 }}>
        <Typography color="text.secondary">
          No template fields with bindings. Add text or image elements and set CSV bindings in the Design step.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ py: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        Map CSV columns to template fields
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 220px))', gap: 2 }}>
        {uniqueBindings.map((binding) => (
          <FormControl key={binding} fullWidth size="small">
            <InputLabel id={`col-map-label-${binding}`}>{binding}</InputLabel>
            <Select
              labelId={`col-map-label-${binding}`}
              value={mapping[binding] ?? ''}
              label={binding}
              onChange={(e) =>
                onMappingChange({
                  ...mapping,
                  [binding]: e.target.value || '',
                })
              }
            >
              <MenuItem value="">— Not Mapped —</MenuItem>
              {headers.map((h) => (
                <MenuItem key={h} value={h}>
                  {h}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mt: 2, alignItems: 'center' }}>
        <Button
          variant="contained"
          onClick={onGenerate}
          disabled={!uniqueBindings.some((b) => !!mapping[b])}
        >
          Generate Cards
        </Button>
        <Button variant="outlined" size="small" onClick={onUploadDifferent}>
          Upload Different File
        </Button>
      </Box>
    </Box>
  );
}
