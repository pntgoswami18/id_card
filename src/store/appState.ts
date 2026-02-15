import type {
  Template,
  CardRecord,
  ColumnMapping,
  PrintPreset,
  PrintSettings,
  TemplateElement,
  BackgroundConfig,
  WatermarkConfig,
} from '../types';
import type { WorkspaceMeta, WorkspaceData } from '../utils/workspaceStorage';

export interface AppState {
  activeStep: number;
  template: Template;
  records: CardRecord[];
  columnMapping: ColumnMapping;
  printPresets: PrintPreset[];
  printSettings: PrintSettings;
  selectedCardIndices: number[];
  currentTemplateSource: { type: 'built-in'; id: string } | { type: 'user'; id: string } | null;
  /** When true, canvas is in watermark edit mode: watermark is draggable/resizable, card elements are not editable. */
  watermarkEditMode: boolean;
  /** Workspaces: current id and list for switcher. */
  currentWorkspaceId: string;
  workspaceList: WorkspaceMeta[];
  /** Logo (data URL or image URL) for the current workspace. */
  currentWorkspaceLogo?: string;
}

export type AppAction =
  | { type: 'SET_ACTIVE_STEP'; payload: number }
  | { type: 'SET_TEMPLATE'; payload: Template }
  | { type: 'UPDATE_TEMPLATE_ELEMENTS'; payload: TemplateElement[] }
  | { type: 'UPDATE_TEMPLATE_ELEMENT'; payload: { id: string; updates: Partial<TemplateElement> } }
  | { type: 'UPDATE_TEMPLATE_BACKGROUND'; payload: BackgroundConfig | null }
  | { type: 'UPDATE_TEMPLATE_WATERMARK'; payload: WatermarkConfig | null }
  | { type: 'SET_RECORDS'; payload: CardRecord[] }
  | { type: 'UPDATE_RECORD_OVERRIDES'; payload: { index: number; overrides: CardRecord['overrides'] } }
  | { type: 'SET_COLUMN_MAPPING'; payload: ColumnMapping }
  | { type: 'SET_PRINT_PRESETS'; payload: PrintPreset[] }
  | { type: 'SET_PRINT_SETTINGS'; payload: Partial<PrintSettings> }
  | { type: 'SET_SELECTED_CARD_INDICES'; payload: number[] }
  | { type: 'TOGGLE_CARD_SELECTION'; payload: number }
  | { type: 'SELECT_ALL_CARDS' }
  | { type: 'DESELECT_ALL_CARDS' }
  | { type: 'SET_CURRENT_TEMPLATE_SOURCE'; payload: AppState['currentTemplateSource'] }
  | { type: 'SET_WATERMARK_EDIT_MODE'; payload: boolean }
  | { type: 'LOAD_WORKSPACE_STATE'; payload: Partial<WorkspaceData> }
  | { type: 'SET_CURRENT_WORKSPACE'; payload: string }
  | { type: 'SET_WORKSPACE_LIST'; payload: WorkspaceMeta[] }
  | { type: 'SET_WORKSPACE_LOGO'; payload: string | undefined };

const defaultPrintSettings: PrintSettings = {
  widthMm: 85.6,
  heightMm: 53.98,
  orientation: 'portrait',
};

const emptyTemplate: Template = {
  id: 'blank',
  name: 'Blank',
  elements: [],
  background: null,
  watermark: null,
};

export const initialState: AppState = {
  activeStep: 0,
  template: emptyTemplate,
  records: [],
  columnMapping: {},
  printPresets: [],
  printSettings: defaultPrintSettings,
  selectedCardIndices: [],
  currentTemplateSource: null,
  watermarkEditMode: false,
  currentWorkspaceId: '',
  workspaceList: [],
  currentWorkspaceLogo: undefined,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_ACTIVE_STEP':
      return { ...state, activeStep: action.payload };
    case 'SET_TEMPLATE':
      return { ...state, template: action.payload };
    case 'UPDATE_TEMPLATE_ELEMENTS':
      return { ...state, template: { ...state.template, elements: action.payload } };
    case 'UPDATE_TEMPLATE_ELEMENT': {
      const { id, updates } = action.payload;
      const elements = state.template.elements.map((el) =>
        el.id === id ? { ...el, ...updates } as TemplateElement : el
      );
      return { ...state, template: { ...state.template, elements } };
    }
    case 'UPDATE_TEMPLATE_BACKGROUND':
      return { ...state, template: { ...state.template, background: action.payload } };
    case 'UPDATE_TEMPLATE_WATERMARK':
      return { ...state, template: { ...state.template, watermark: action.payload } };
    case 'SET_RECORDS':
      return { ...state, records: action.payload, selectedCardIndices: [] };
    case 'UPDATE_RECORD_OVERRIDES': {
      const { index, overrides } = action.payload;
      const records = [...state.records];
      if (records[index]) {
        records[index] = { ...records[index], overrides: { ...records[index].overrides, ...overrides } };
      }
      return { ...state, records };
    }
    case 'SET_COLUMN_MAPPING':
      return { ...state, columnMapping: action.payload };
    case 'SET_PRINT_PRESETS':
      return { ...state, printPresets: action.payload };
    case 'SET_PRINT_SETTINGS':
      return { ...state, printSettings: { ...state.printSettings, ...action.payload } };
    case 'SET_SELECTED_CARD_INDICES':
      return { ...state, selectedCardIndices: action.payload };
    case 'TOGGLE_CARD_SELECTION': {
      const idx = action.payload;
      const set = new Set(state.selectedCardIndices);
      if (set.has(idx)) set.delete(idx);
      else set.add(idx);
      return { ...state, selectedCardIndices: Array.from(set) };
    }
    case 'SELECT_ALL_CARDS':
      return { ...state, selectedCardIndices: state.records.map((_, i) => i) };
    case 'DESELECT_ALL_CARDS':
      return { ...state, selectedCardIndices: [] };
    case 'SET_CURRENT_TEMPLATE_SOURCE':
      return { ...state, currentTemplateSource: action.payload };
    case 'SET_WATERMARK_EDIT_MODE':
      return { ...state, watermarkEditMode: action.payload };
    case 'LOAD_WORKSPACE_STATE': {
      const p = action.payload;
      return {
        ...state,
        ...(p.template != null && { template: p.template }),
        ...(p.records != null && { records: p.records }),
        ...(p.columnMapping != null && { columnMapping: p.columnMapping }),
        ...(p.printPresets != null && { printPresets: p.printPresets }),
        ...(p.printSettings != null && { printSettings: p.printSettings }),
        ...(p.selectedCardIndices != null && { selectedCardIndices: p.selectedCardIndices }),
        ...(p.currentTemplateSource !== undefined && { currentTemplateSource: p.currentTemplateSource }),
        ...('logo' in p ? { currentWorkspaceLogo: p.logo } : {}),
      };
    }
    case 'SET_CURRENT_WORKSPACE':
      return { ...state, currentWorkspaceId: action.payload };
    case 'SET_WORKSPACE_LIST':
      return { ...state, workspaceList: action.payload };
    case 'SET_WORKSPACE_LOGO':
      return { ...state, currentWorkspaceLogo: action.payload };
    default:
      return state;
  }
}
