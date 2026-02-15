import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Autocomplete from '@mui/material/Autocomplete';
import type { TemplateElement, TextElement, ImageElement, LabelElement } from '../../types';

const FONT_SIZE_OPTIONS: (string | number)[] = [
  'Dynamic',
  8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72,
];

/** Common system fonts typically available on Windows, macOS, and Linux. */
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

function parseFontSizeValue(value: string | number | null): { dynamic: boolean; size: number } {
  if (value === null || value === undefined) return { dynamic: false, size: 12 };
  if (value === 'Dynamic' || (typeof value === 'string' && value.trim().toLowerCase() === 'dynamic')) {
    return { dynamic: true, size: 12 };
  }
  const n = typeof value === 'number' ? value : parseFloat(String(value).trim());
  const size = Number.isFinite(n) ? Math.max(1, Math.min(999, n)) : 12;
  return { dynamic: false, size };
}

interface ElementPropertiesPanelProps {
  element: TemplateElement | null;
  selectedCount?: number;
  availableBindings: string[];
  onUpdate: (updates: Partial<TemplateElement>) => void;
  onDelete: () => void;
  onDuplicate?: () => void;
}

export default function ElementPropertiesPanel({
  element,
  selectedCount = 0,
  availableBindings,
  onUpdate,
  onDelete,
  onDuplicate,
}: ElementPropertiesPanelProps) {
  const multiSelect = selectedCount > 1;
  if (!element && selectedCount === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="text.secondary" variant="body2">
          Select an element to edit, or drag to select multiple
        </Typography>
      </Box>
    );
  }
  if (multiSelect) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          {selectedCount} elements selected
        </Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
          Use Duplicate or Delete for all selected. Click a single element to edit its properties.
        </Typography>
        {onDuplicate && (
          <Button fullWidth variant="outlined" size="small" sx={{ mt: 1 }} onClick={onDuplicate}>
            Duplicate ({selectedCount})
          </Button>
        )}
        <Button fullWidth color="error" size="small" sx={{ mt: 2 }} onClick={onDelete}>
          Delete ({selectedCount})
        </Button>
      </Box>
    );
  }
  if (!element) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="text.secondary" variant="body2">
          Select an element to edit
        </Typography>
      </Box>
    );
  }

  const commonFields = (
    <>
      <TextField
        fullWidth
        size="small"
        label="X (%)"
        type="number"
        value={element.x}
        onChange={(e) => onUpdate({ x: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
        sx={{ mb: 1 }}
        inputProps={{ min: 0, max: 100, step: 1 }}
      />
      <TextField
        fullWidth
        size="small"
        label="Y (%)"
        type="number"
        value={element.y}
        onChange={(e) => onUpdate({ y: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
        sx={{ mb: 1 }}
        inputProps={{ min: 0, max: 100, step: 1 }}
      />
      <TextField
        fullWidth
        size="small"
        label="Width (%)"
        type="number"
        value={element.width}
        onChange={(e) => onUpdate({ width: Math.max(1, Math.min(100, parseFloat(e.target.value) || 1)) })}
        sx={{ mb: 1 }}
        inputProps={{ min: 1, max: 100, step: 1 }}
      />
      <TextField
        fullWidth
        size="small"
        label="Height (%)"
        type="number"
        value={element.height}
        onChange={(e) => onUpdate({ height: Math.max(1, Math.min(100, parseFloat(e.target.value) || 1)) })}
        sx={{ mb: 1 }}
        inputProps={{ min: 1, max: 100, step: 1 }}
      />
      {element.type !== 'label' && (
        <Autocomplete
          freeSolo
          size="small"
          fullWidth
          options={availableBindings}
          value={element.binding ?? ''}
          onChange={(_, value) =>
            onUpdate({ binding: (typeof value === 'string' ? value.trim() : value) || undefined })
          }
          renderInput={(params) => (
            <TextField
              {...params}
              label="CSV Binding"
              placeholder="Select or type your own field name"
            />
          )}
          sx={{ mb: 1 }}
        />
      )}
    </>
  );

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        {element.type === 'text' ? 'Text element' : element.type === 'label' ? 'Label element' : 'Image element'}
      </Typography>
      {commonFields}
      {element.type === 'label' && (
        <TextField
          fullWidth
          size="small"
          label="Label text"
          value={(element as LabelElement).value ?? ''}
          onChange={(e) => onUpdate({ value: e.target.value })}
          placeholder="Static text"
          sx={{ mb: 1 }}
        />
      )}
      {(element.type === 'text' || element.type === 'label') && (
        <>
          {element.type === 'text' && (
            <TextField
              fullWidth
              size="small"
              label="Placeholder"
              value={(element as TextElement).placeholder ?? ''}
              onChange={(e) => onUpdate({ placeholder: e.target.value })}
              sx={{ mb: 1 }}
            />
          )}
          <Autocomplete
            freeSolo
            size="small"
            options={FONT_SIZE_OPTIONS}
            value={(element as TextElement | LabelElement).fontSizeAuto ? 'Dynamic' : ((element as TextElement | LabelElement).fontSize ?? 12)}
            getOptionLabel={(opt) =>
              opt === 'Dynamic' ? 'Dynamic (fit to field)' : String(opt)
            }
            isOptionEqualToValue={(opt, val) =>
              opt === val || (opt === 'Dynamic' && val === 'Dynamic') || (typeof opt === 'number' && typeof val === 'number' && opt === val)
            }
            onChange={(_, value) => {
              const { dynamic, size } = parseFontSizeValue(value);
              onUpdate({
                fontSizeAuto: dynamic,
                fontSize: size,
              } as Partial<TemplateElement>);
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
            sx={{ mb: 1 }}
          />
          <FormControl fullWidth size="small" sx={{ mb: 1 }}>
            <InputLabel>Font weight</InputLabel>
            <Select
              value={(element as TextElement | LabelElement).fontWeight ?? 'normal'}
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
            value={(element as TextElement | LabelElement).fontFamily ?? ''}
            onChange={(_, value) =>
              onUpdate({ fontFamily: typeof value === 'string' ? (value.trim() || undefined) : undefined })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Font"
                placeholder="Choose or type a font name"
              />
            )}
            sx={{ mb: 1 }}
          />
          <TextField
            fullWidth
            size="small"
            label="Color"
            type="color"
            value={(element as TextElement | LabelElement).color ?? '#000000'}
            onChange={(e) => onUpdate({ color: e.target.value })}
            sx={{ '& input': { height: 40 } }}
          />
        </>
      )}
      {element.type === 'image' && (
        <TextField
          fullWidth
          size="small"
          label="Placeholder text"
          value={(element as ImageElement).placeholder ?? 'Photo'}
          onChange={(e) => onUpdate({ placeholder: e.target.value })}
          sx={{ mb: 1 }}
        />
      )}
      {onDuplicate && (
        <Button fullWidth variant="outlined" size="small" sx={{ mt: 2 }} onClick={onDuplicate}>
          Duplicate
        </Button>
      )}
      <Button fullWidth color="error" size="small" sx={{ mt: 2 }} onClick={onDelete}>
        Delete Element
      </Button>
    </Box>
  );
}
