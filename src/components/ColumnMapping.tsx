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
}

export default function ColumnMappingComponent({
  headers,
  elements,
  mapping,
  onMappingChange,
  onGenerate,
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
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 400 }}>
        {uniqueBindings.map((binding) => (
          <FormControl key={binding} fullWidth size="small">
            <InputLabel>{binding}</InputLabel>
            <Select
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
      <Button variant="contained" sx={{ mt: 2 }} onClick={onGenerate}>
        Generate Cards
      </Button>
    </Box>
  );
}
