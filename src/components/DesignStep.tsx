import { useState, useRef, useCallback, useEffect } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Divider from '@mui/material/Divider';
import Menu from '@mui/material/Menu';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { useAppState, useAppDispatch } from '../store/AppStateContext';
import CardCanvas from './CardCanvas';
import TemplatePicker from './TemplatePicker';
import BackgroundWatermarkPanel from './BackgroundWatermarkPanel';
import { ElementPropertiesPanel } from './DesignEditor';
import { saveUserTemplate } from '../utils/userTemplates';
import type { Template, TemplateElement } from '../types';

const COMMON_BINDINGS = ['name', 'id', 'photo', 'department', 'company', 'course', 'date'];

function generateId(): string {
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const OFFSET_PASTE = 5;

export default function DesignStep() {
  const { activeStep, template, printSettings, watermarkEditMode, currentTemplateSource } = useAppState();
  const dispatch = useAppDispatch();
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [saveMenuAnchor, setSaveMenuAnchor] = useState<null | HTMLElement>(null);
  const [showBgWmPanel, setShowBgWmPanel] = useState(false);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const copiedElementsRef = useRef<TemplateElement[] | null>(null);

  const selectedElements = template.elements.filter((e) => selectedElementIds.includes(e.id));
  const selectedElement = selectedElements.length === 1 ? selectedElements[0] : selectedElements[0] ?? null;
  const bindingsFromElements = template.elements.map((e) => e.binding).filter((b): b is string => !!b);
  const availableBindings = [...new Set([...COMMON_BINDINGS, ...bindingsFromElements])];

  const handleSelectTemplate = (t: Template, source: { type: 'built-in'; id: string } | { type: 'user'; id: string }) => {
    dispatch({ type: 'SET_TEMPLATE', payload: { ...t, elements: t.elements.map((e) => ({ ...e, id: generateId() })) } });
    dispatch({ type: 'SET_CURRENT_TEMPLATE_SOURCE', payload: source });
    setSelectedElementIds([]);
  };

  const handleAddText = () => {
    const newEl: TemplateElement = {
      id: generateId(),
      type: 'text',
      x: 10,
      y: 10,
      width: 40,
      height: 15,
      placeholder: 'Text',
      binding: 'name',
      fontSize: 12,
      fontSizeAuto: true,
      fontWeight: 'normal',
      color: '#000',
    };
    dispatch({
      type: 'UPDATE_TEMPLATE_ELEMENTS',
      payload: [...template.elements, newEl],
    });
    setSelectedElementIds([newEl.id]);
  };

  const handleAddImage = () => {
    const newEl: TemplateElement = {
      id: generateId(),
      type: 'image',
      x: 10,
      y: 10,
      width: 35,
      height: 45,
      placeholder: 'Photo',
      binding: 'photo',
    };
    dispatch({
      type: 'UPDATE_TEMPLATE_ELEMENTS',
      payload: [...template.elements, newEl],
    });
    setSelectedElementIds([newEl.id]);
  };

  const handleAddLabel = () => {
    const newEl: TemplateElement = {
      id: generateId(),
      type: 'label',
      x: 10,
      y: 10,
      width: 40,
      height: 12,
      value: 'Label',
      fontSize: 12,
      fontSizeAuto: true,
      fontWeight: 'normal',
      color: '#000',
    };
    dispatch({
      type: 'UPDATE_TEMPLATE_ELEMENTS',
      payload: [...template.elements, newEl],
    });
    setSelectedElementIds([newEl.id]);
  };

  const handleUpdateElement = (updates: Partial<TemplateElement>) => {
    if (selectedElementIds.length !== 1) return;
    dispatch({ type: 'UPDATE_TEMPLATE_ELEMENT', payload: { id: selectedElementIds[0], updates } });
  };

  const handleDeleteElement = () => {
    if (selectedElementIds.length === 0) return;
    const toRemove = new Set(selectedElementIds);
    dispatch({
      type: 'UPDATE_TEMPLATE_ELEMENTS',
      payload: template.elements.filter((e) => !toRemove.has(e.id)),
    });
    setSelectedElementIds([]);
  };

  const handleCopyElement = useCallback(() => {
    if (selectedElementIds.length === 0) return;
    const els = template.elements.filter((e) => selectedElementIds.includes(e.id));
    if (els.length) copiedElementsRef.current = els;
  }, [selectedElementIds, template.elements]);

  const handlePasteElements = useCallback(() => {
    const copied = copiedElementsRef.current;
    if (!copied?.length) return;
    const cloned = copied.map((el) => ({
      ...el,
      id: generateId(),
      x: Math.min(95, el.x + OFFSET_PASTE),
      y: Math.min(95, el.y + OFFSET_PASTE),
    }));
    dispatch({
      type: 'UPDATE_TEMPLATE_ELEMENTS',
      payload: [...template.elements, ...cloned],
    });
    setSelectedElementIds(cloned.map((c) => c.id));
  }, [template.elements, dispatch]);

  const handleDuplicateElement = useCallback(() => {
    if (selectedElementIds.length === 0) return;
    const els = template.elements.filter((e) => selectedElementIds.includes(e.id));
    if (!els.length) return;
    copiedElementsRef.current = els;
    handlePasteElements();
  }, [selectedElementIds, template.elements, handlePasteElements]);

  const handleElementClick = useCallback((id: string, addToSelection: boolean) => {
    setSelectedElementIds((prev) => {
      if (addToSelection) {
        const set = new Set(prev);
        if (set.has(id)) set.delete(id);
        else set.add(id);
        return [...set];
      }
      return [id];
    });
  }, []);

  const handleSelectionChange = useCallback((ids: string[]) => {
    setSelectedElementIds(ids);
  }, []);

  useEffect(() => {
    if (activeStep !== 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as Node;
      const isEditable =
        target &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          (target instanceof HTMLElement && target.isContentEditable));
      if (isEditable) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key === 'c') {
        e.preventDefault();
        handleCopyElement();
      } else if (mod && e.key === 'v') {
        e.preventDefault();
        handlePasteElements();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeStep, handleCopyElement, handlePasteElements]);

  const canSaveOverwrite = currentTemplateSource?.type === 'user';

  const handleSave = () => {
    if (!canSaveOverwrite) return;
    const toSave: Template = { ...template, id: template.id, name: template.name };
    saveUserTemplate(toSave);
  };

  const handleSaveTemplate = () => {
    const name = saveTemplateName.trim() || 'My Template';
    const id = `user-${Date.now()}`;
    const toSave: Template = { ...template, id, name };
    saveUserTemplate(toSave);
    dispatch({ type: 'SET_CURRENT_TEMPLATE_SOURCE', payload: { type: 'user', id } });
    setSaveDialogOpen(false);
    setSaveTemplateName('');
  };

  const wMm = printSettings.orientation === 'portrait' ? printSettings.heightMm : printSettings.widthMm;
  const hMm = printSettings.orientation === 'portrait' ? printSettings.widthMm : printSettings.heightMm;

  // Preview viewport: fit card in both orientations (mm → ~3.78px at 96dpi)
  const MM_TO_PX = 3.78;
  const PREVIEW_MAX_WIDTH = 420;
  const PREVIEW_MAX_HEIGHT = 420;
  const cardWpx = wMm * MM_TO_PX;
  const cardHpx = hMm * MM_TO_PX;
  const scaleToFit = Math.min(
    PREVIEW_MAX_WIDTH / cardWpx,
    PREVIEW_MAX_HEIGHT / cardHpx,
    2
  );

  const getStartedText =
    'Get started: Choose a template above, or add text and image elements to design your card from scratch. When you\'re done, click "Continue to Data" below.';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 2, flexShrink: 0 }}>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Orientation</InputLabel>
          <Select
            value={printSettings.orientation}
            label="Orientation"
            onChange={(e) =>
              dispatch({
                type: 'SET_PRINT_SETTINGS',
                payload: { ...printSettings, orientation: e.target.value as 'portrait' | 'landscape' },
              })
            }
          >
            <MenuItem value="portrait">Portrait</MenuItem>
            <MenuItem value="landscape">Landscape</MenuItem>
          </Select>
        </FormControl>
        <Divider orientation="vertical" flexItem />
        <Button variant="outlined" size="small" onClick={() => setTemplatePickerOpen(true)}>
          Start From Template
        </Button>
        <Tooltip title={getStartedText} placement="bottom" enterDelay={300}>
          <IconButton size="small" color="info" aria-label="Get started help">
            <InfoOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
        <Divider orientation="vertical" flexItem />
        <Button
          variant={showBgWmPanel ? 'contained' : 'outlined'}
          size="small"
          onClick={() => {
            if (showBgWmPanel) dispatch({ type: 'SET_WATERMARK_EDIT_MODE', payload: false });
            setShowBgWmPanel(!showBgWmPanel);
          }}
        >
          Background / Watermark
        </Button>
        <Divider orientation="vertical" flexItem />
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button variant="contained" size="small" onClick={handleAddLabel}>
            Add Label
          </Button>
          <Button variant="contained" size="small" onClick={handleAddText}>
            Add Text
          </Button>
          <Button variant="contained" size="small" onClick={handleAddImage}>
            Add Image
          </Button>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', ml: 0.5 }}>
          {typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
            ? '⌘C / ⌘V'
            : 'Ctrl+C / Ctrl+V'}{' '}
          to copy and paste elements
        </Typography>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          gap: 2,
          flexDirection: { xs: 'column', md: 'row' },
          overflow: 'hidden',
        }}
      >
        <Paper
          sx={{
            flex: 1,
            minHeight: { xs: 320, md: 0 },
            p: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 0,
            overflow: 'auto',
          }}
        >
          <Box
            ref={canvasWrapperRef}
            sx={{
              transform: `scale(${scaleToFit})`,
              transformOrigin: 'center',
              display: 'inline-block',
            }}
          >
            <CardCanvas
              template={template}
              widthMm={wMm}
              heightMm={hMm}
              designMode
              selectedElementIds={selectedElementIds}
              onElementClick={handleElementClick}
              onSelectionChange={handleSelectionChange}
              onElementUpdate={(id, updates) => dispatch({ type: 'UPDATE_TEMPLATE_ELEMENT', payload: { id, updates } })}
              containerRefProp={canvasWrapperRef}
              watermarkEditMode={watermarkEditMode}
              onWatermarkChange={(wm) => dispatch({ type: 'UPDATE_TEMPLATE_WATERMARK', payload: wm })}
            />
          </Box>
        </Paper>

        <Paper
          sx={{
            width: { xs: '100%', md: 280 },
            flexShrink: 0,
            minHeight: { xs: 200, md: 0 },
            maxHeight: { md: '100%' },
            overflowY: 'auto',
          }}
        >
          {showBgWmPanel ? (
            <BackgroundWatermarkPanel
              background={template.background ?? null}
              watermark={template.watermark ?? null}
              onBackgroundChange={(bg) => dispatch({ type: 'UPDATE_TEMPLATE_BACKGROUND', payload: bg })}
              onWatermarkChange={(wm) => dispatch({ type: 'UPDATE_TEMPLATE_WATERMARK', payload: wm })}
              onDone={() => {
                dispatch({ type: 'SET_WATERMARK_EDIT_MODE', payload: false });
                setShowBgWmPanel(false);
              }}
              onWatermarkModeEnter={() => dispatch({ type: 'SET_WATERMARK_EDIT_MODE', payload: true })}
            />
          ) : (
            <ElementPropertiesPanel
              element={selectedElement}
              selectedCount={selectedElementIds.length}
              availableBindings={availableBindings}
              onUpdate={handleUpdateElement}
              onDelete={handleDeleteElement}
              onDuplicate={handleDuplicateElement}
            />
          )}
        </Paper>
      </Box>

      <Box sx={{ mt: 2, pt: 2, flexShrink: 0, display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Button
          id="save-template-options-button"
          variant="outlined"
          size="small"
          onClick={(e) => setSaveMenuAnchor(e.currentTarget)}
          aria-controls={saveMenuAnchor ? 'save-template-options-menu' : undefined}
          aria-haspopup="true"
          aria-expanded={saveMenuAnchor ? 'true' : undefined}
          endIcon={
            <KeyboardArrowDown
              sx={{
                transform: saveMenuAnchor ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            />
          }
        >
          Save Template Options
        </Button>
        <Menu
          id="save-template-options-menu"
          anchorEl={saveMenuAnchor}
          open={Boolean(saveMenuAnchor)}
          onClose={() => setSaveMenuAnchor(null)}
          MenuListProps={{ 'aria-labelledby': 'save-template-options-button' }}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          {canSaveOverwrite && (
            <MenuItem
              onClick={() => {
                handleSave();
                setSaveMenuAnchor(null);
              }}
            >
              Save
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              setSaveMenuAnchor(null);
              setSaveDialogOpen(true);
            }}
          >
            Save As Template
          </MenuItem>
        </Menu>
        <Button
          variant="contained"
          onClick={() => dispatch({ type: 'SET_ACTIVE_STEP', payload: 1 })}
          aria-label="Continue to Data step"
        >
          Continue To Data
        </Button>
      </Box>

      <TemplatePicker
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        onSelect={handleSelectTemplate}
        onAfterDelete={(deletedId) => {
          if (currentTemplateSource?.type === 'user' && currentTemplateSource.id === deletedId) {
            dispatch({ type: 'SET_CURRENT_TEMPLATE_SOURCE', payload: null });
          }
        }}
      />

      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)}>
        <DialogTitle>Save As Template</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Template Name"
            value={saveTemplateName}
            onChange={(e) => setSaveTemplateName(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveTemplate}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
