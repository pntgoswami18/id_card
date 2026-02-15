// Template element types
export type ElementType = 'text' | 'image' | 'label';

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number; // percentage 0-100
  y: number;
  width: number; // percentage 0-100
  height: number; // percentage 0-100
  binding?: string; // CSV column key, e.g. 'name', 'photo' (not used for label)
}

export interface TextElement extends BaseElement {
  type: 'text';
  placeholder?: string;
  fontSize?: number;
  /** When true, font size is computed at render time to fit the text within the element box. */
  fontSizeAuto?: boolean;
  fontWeight?: 'normal' | 'bold';
  color?: string;
  /** Font family (e.g. system font name). Uses card default if not set. */
  fontFamily?: string;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  placeholder?: string; // e.g. 'Photo'
}

/** Static text label; not bound to CSV data. */
export interface LabelElement extends BaseElement {
  type: 'label';
  /** Static text shown on the card. */
  value: string;
  fontSize?: number;
  /** When true, font size is computed at render time to fit the text within the element box. */
  fontSizeAuto?: boolean;
  fontWeight?: 'normal' | 'bold';
  color?: string;
  /** Font family (e.g. system font name). Uses card default if not set. */
  fontFamily?: string;
}

export type TemplateElement = TextElement | ImageElement | LabelElement;

// Background
export type BackgroundType = 'solid' | 'gradient' | 'image';

export interface BackgroundConfig {
  type: BackgroundType;
  value: string; // color, gradient css, or image URL/data URL
  /** When value is from file upload, display name shown in the URL field. */
  imageFileName?: string;
  gradientDirection?: string; // e.g. 'to bottom', 'to right'
  gradientColor2?: string;
}

// Watermark
export type WatermarkType = 'text' | 'image';

export interface WatermarkConfig {
  type: WatermarkType;
  value: string; // text content or image URL/data URL
  /** When value is from file upload, display name shown in the URL field. */
  imageFileName?: string;
  opacity: number; // 0-1
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** When in watermark edit mode: position/size by drag. Percent of card (0–100). Overrides position when set. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number; // degrees
  fontSize?: number;
}

// Template (full card design)
export interface Template {
  id: string;
  name: string;
  elements: TemplateElement[];
  background?: BackgroundConfig | null;
  watermark?: WatermarkConfig | null;
}

// Record = one row from CSV (after mapping)
export interface RecordData {
  [key: string]: string | null; // column key -> value
}

export interface CardOverrides {
  [key: string]: string | null; // field key -> overridden value (e.g. photo data URL)
}

export interface CardRecord {
  id: string;
  data: RecordData;
  overrides: CardOverrides;
}

// Column mapping: template binding key -> CSV column name
export type ColumnMapping = Record<string, string>;

// Print
export interface PrintPreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  orientation: 'portrait' | 'landscape';
}

export interface PrintSettings {
  widthMm: number;
  heightMm: number;
  orientation: 'portrait' | 'landscape';
}

// Built-in template id
export type BuiltInTemplateId = string;

// User-saved template (stored in localStorage)
export interface UserTemplateMeta {
  id: string;
  name: string;
  savedAt: string; // ISO date
}
