import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import type { TemplateElement, TextElement, ImageElement, LabelElement } from '../../types';

const FONT_SIZE_OPTIONS: (string | number)[] = [
  'Dynamic',
  8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72,
];

function parseFontSizeValue(value: string | number | null): { dynamic: boolean; size: number } {
  if (value === null || value === undefined) return { dynamic: false, size: 12 };
  if (value === 'Dynamic' || (typeof value === 'string' && value.trim().toLowerCase() === 'dynamic')) {
    return { dynamic: true, size: 12 };
  }
  const n = typeof value === 'number' ? value : parseFloat(String(value).trim());
  const size = Number.isFinite(n) ? Math.max(1, Math.min(999, n)) : 12;
  return { dynamic: false, size };
}

interface ElementPropertyPanelProps {
  element: TemplateElement | null;
  bindingOptions: string[]; // suggested bindings: name, id, photo, department, etc.
  onUpdate: (updates: Partial<TemplateElement>) => void;
  onDelete: () => void;
}

const BINDING_OPTIONS = ['name', 'id', 'photo', 'department', 'company', 'course', 'event', 'date'];

const SYSTEM_FONTS = [
  'Arial',
  'Arial Black',
  'Calibri',
  'Cambria',
  'Comic Sans MS',
  'Consolas',
  'Courier New',
  'Georgia',
  'Helvetica',
  'Impact',
  'Lucida Console',
  'Lucida Sans Unicode',
  'Palatino Linotype',
  'Segoe UI',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
  'system-ui',
  'sans-serif',
  'serif',
  'monospace',
];

export default function ElementPropertyPanel({
  element,
  bindingOptions,
  onUpdate,
  onDelete,
}: ElementPropertyPanelProps) {
  if (!element) {
    return (
      <Typography variant="body2" color="text.secondary">
        Select an element to edit
      </Typography>
    );
  }

  const isText = element.type === 'text';
  const isLabel = element.type === 'label';
  const textEl = element as TextElement;
  const labelEl = element as LabelElement;
  const imgEl = element as ImageElement;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="subtitle2">Position & size (%)</Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          size="small"
          label="X"
          type="number"
          value={element.x}
          onChange={(e) => onUpdate({ x: Number(e.target.value) || 0 })}
          inputProps={{ min: 0, max: 100 }}
          sx={{ width: 70 }}
        />
        <TextField
          size="small"
          label="Y"
          type="number"
          value={element.y}
          onChange={(e) => onUpdate({ y: Number(e.target.value) || 0 })}
          inputProps={{ min: 0, max: 100 }}
          sx={{ width: 70 }}
        />
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          size="small"
          label="W"
          type="number"
          value={element.width}
          onChange={(e) => onUpdate({ width: Number(e.target.value) || 10 })}
          inputProps={{ min: 1, max: 100 }}
          sx={{ width: 70 }}
        />
        <TextField
          size="small"
          label="H"
          type="number"
          value={element.height}
          onChange={(e) => onUpdate({ height: Number(e.target.value) || 10 })}
          inputProps={{ min: 1, max: 100 }}
          sx={{ width: 70 }}
        />
      </Box>
      {!isLabel && (
        <Autocomplete
          freeSolo
          size="small"
          fullWidth
          options={[...new Set([...BINDING_OPTIONS, ...bindingOptions])]}
          value={element.binding ?? ''}
          onChange={(_, value) =>
            onUpdate({ binding: (typeof value === 'string' ? value.trim() : value) || undefined })
          }
          renderInput={(params) => (
            <TextField
              {...params}
              label="Binding (CSV column)"
              placeholder="Select or type your own field name"
            />
          )}
        />
      )}
      {isLabel && (
        <TextField
          size="small"
          label="Label text"
          value={labelEl.value ?? ''}
          onChange={(e) => onUpdate({ value: e.target.value })}
          placeholder="Static text"
          fullWidth
        />
      )}
      {(isText || isLabel) && (
        <>
          {isText && (
            <TextField
              size="small"
              label="Placeholder"
              value={textEl.placeholder ?? ''}
              onChange={(e) => onUpdate({ placeholder: e.target.value })}
              fullWidth
            />
          )}
          <Autocomplete
            freeSolo
            size="small"
            fullWidth
            options={FONT_SIZE_OPTIONS}
            value={(isLabel ? labelEl : textEl).fontSizeAuto ? 'Dynamic' : ((isLabel ? labelEl : textEl).fontSize ?? 12)}
            getOptionLabel={(opt) =>
              opt === 'Dynamic' ? 'Dynamic (fit to field)' : String(opt)
            }
            isOptionEqualToValue={(opt, val) =>
              opt === val || (opt === 'Dynamic' && val === 'Dynamic') || (typeof opt === 'number' && typeof val === 'number' && opt === val)
            }
            onChange={(_, value) => {
              const { dynamic, size } = parseFontSizeValue(value);
              onUpdate({ fontSizeAuto: dynamic, fontSize: size });
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Font size"
                placeholder="e.g. 12 or 10.5 or Dynamic"
                inputProps={{
                  ...params.inputProps,
                  type: 'text',
                  inputMode: 'decimal',
                }}
              />
            )}
          />
          <FormControl size="small" fullWidth>
            <InputLabel>Font weight</InputLabel>
            <Select
              value={(isLabel ? labelEl : textEl).fontWeight ?? 'normal'}
              label="Font weight"
              onChange={(e) => onUpdate({ fontWeight: e.target.value as 'normal' | 'bold' })}
            >
              <MenuItem value="normal">Normal</MenuItem>
              <MenuItem value="bold">Bold</MenuItem>
            </Select>
          </FormControl>
          <Autocomplete
            freeSolo
            size="small"
            fullWidth
            options={SYSTEM_FONTS}
            value={(isLabel ? labelEl : textEl).fontFamily ?? ''}
            onChange={(_, value) =>
              onUpdate({ fontFamily: typeof value === 'string' ? (value.trim() || undefined) : undefined })
            }
            renderInput={(params) => (
              <TextField {...params} label="Font" placeholder="Choose or type a font name" />
            )}
          />
          <TextField
            size="small"
            label="Color"
            type="color"
            value={(isLabel ? labelEl : textEl).color ?? '#000000'}
            onChange={(e) => onUpdate({ color: e.target.value })}
            fullWidth
          />
        </>
      )}
      {element.type === 'image' && (
        <TextField
          size="small"
          label="Placeholder label"
          value={imgEl.placeholder ?? ''}
          onChange={(e) => onUpdate({ placeholder: e.target.value })}
          fullWidth
        />
      )}
      <Button variant="outlined" color="error" size="small" onClick={onDelete}>
        Delete Element
      </Button>
    </Box>
  );
}
