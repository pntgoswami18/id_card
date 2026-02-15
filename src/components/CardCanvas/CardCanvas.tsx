import { useRef, useState, useCallback, useLayoutEffect } from 'react';
import type { Template, TemplateElement, TextElement, LabelElement, BackgroundConfig, WatermarkConfig, CardRecord } from '../../types';

interface CardCanvasProps {
  template: Template;
  record?: CardRecord | null;
  widthMm?: number;
  heightMm?: number;
  designMode?: boolean;
  selectedElementIds?: string[];
  onElementClick?: (id: string, addToSelection: boolean) => void;
  onSelectionChange?: (ids: string[]) => void;
  onElementUpdate?: (id: string, updates: Partial<Pick<TemplateElement, 'x' | 'y' | 'width' | 'height'>>) => void;
  /** Optional ref for bounds calculation (e.g. scaled wrapper). Uses internal ref if not provided. */
  containerRefProp?: React.RefObject<HTMLDivElement | null>;
  /** When true, watermark is draggable/resizable and card elements are not editable. */
  watermarkEditMode?: boolean;
  /** Callback when watermark position/size is updated (drag or resize). */
  onWatermarkChange?: (wm: WatermarkConfig) => void;
}

type Rect = { left: number; top: number; width: number; height: number };
type MarqueeState = { startX: number; startY: number; currentX: number; currentY: number; rect: Rect };

function getFieldValue(record: CardRecord | null | undefined, binding: string | undefined): string | null {
  if (!binding || !record) return null;
  const overridden = record.overrides[binding];
  if (overridden != null) return overridden;
  return record.data[binding] ?? null;
}

function renderBackground(background: BackgroundConfig | null | undefined, baseStyle: React.CSSProperties) {
  if (!background) return <div style={{ ...baseStyle, backgroundColor: '#f5f5f5' }} />;
  const base: React.CSSProperties = { ...baseStyle };
  if (background.type === 'solid') {
    base.backgroundColor = background.value;
  } else if (background.type === 'gradient') {
    const dir = background.gradientDirection || 'to bottom';
    const c2 = background.gradientColor2 || background.value;
    base.background = `linear-gradient(${dir}, ${background.value}, ${c2})`;
  } else if (background.type === 'image' && background.value) {
    base.backgroundImage = `url("${background.value.replace(/"/g, '%22')}")`;
    base.backgroundSize = 'cover';
    base.backgroundPosition = 'center';
  }
  return <div style={base} />;
}

const DEFAULT_WM_SIZE = 30;

/** Returns effective watermark box in percent (x, y, width, height). Uses x,y,width,height if set, else position preset. */
function getWatermarkBox(wm: WatermarkConfig): { x: number; y: number; width: number; height: number } {
  if (
    wm.x != null && wm.y != null && wm.width != null && wm.height != null &&
    wm.width > 0 && wm.height > 0
  ) {
    return { x: wm.x, y: wm.y, width: wm.width, height: wm.height };
  }
  const posToBox: Record<string, { x: number; y: number }> = {
    center: { x: 50 - DEFAULT_WM_SIZE / 2, y: 50 - DEFAULT_WM_SIZE / 2 },
    'top-left': { x: 5, y: 5 },
    'top-right': { x: 100 - 5 - DEFAULT_WM_SIZE, y: 5 },
    'bottom-left': { x: 5, y: 100 - 5 - DEFAULT_WM_SIZE },
    'bottom-right': { x: 100 - 5 - DEFAULT_WM_SIZE, y: 100 - 5 - DEFAULT_WM_SIZE },
  };
  const { x, y } = posToBox[wm.position] || posToBox.center;
  return { x, y, width: DEFAULT_WM_SIZE, height: DEFAULT_WM_SIZE };
}

function renderWatermarkStatic(watermark: WatermarkConfig | null | undefined) {
  if (!watermark) return null;
  const box = getWatermarkBox(watermark);
  const rot = watermark.rotation != null ? ` rotate(${watermark.rotation}deg)` : '';
  const wStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${box.x}%`,
    top: `${box.y}%`,
    width: `${box.width}%`,
    height: `${box.height}%`,
    opacity: watermark.opacity,
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transform: rot,
  };
  if (watermark.type === 'text') {
    return (
      <div style={{ ...wStyle, whiteSpace: 'nowrap', overflow: 'hidden', fontSize: watermark.fontSize ?? 14 }}>
        {watermark.value}
      </div>
    );
  }
  return (
    <img
      src={watermark.value}
      alt=""
      style={{ ...wStyle, objectFit: 'contain', maxWidth: '100%', maxHeight: '100%' }}
    />
  );
}

type Bounds = { width: number; height: number };

const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 72;

/** Longest token (word or line) in text for "no word break" width check. */
function getLongestToken(text: string): string {
  const t = text?.trim() || '\u00A0';
  const lines = t.split(/\n/);
  let longest = '';
  for (const line of lines) {
    const tokens = line.split(/\s+/);
    for (const token of tokens) {
      if (token.length > longest.length) longest = token;
    }
    if (line.length > longest.length) longest = line;
  }
  return longest || '\u00A0';
}

/**
 * Finds the largest font size (in px) such that the text fits in the given box when wrapped.
 * Preserves newlines; does not break words (long words shrink font instead).
 * Measures actual text dimensions (longest-word width, wrapped height) instead of scroll* on a constrained div.
 */
function measureFittingFontSize(
  text: string,
  containerWidthPx: number,
  containerHeightPx: number,
  fontWeight: string,
  color: string,
  fontFamily: string
): number {
  const toMeasure = text?.trim() || '\u00A0';
  if (containerWidthPx <= 0 || containerHeightPx <= 0) return 12;

  const VERTICAL_PADDING_EM = 0.3;
  const HORIZONTAL_PADDING_EM = 0.5;
  /** Reserve space so rendered text (with rounding/font metrics) does not clip on the right/bottom. */
  const WIDTH_BUFFER_PX = 4;
  const HEIGHT_BUFFER_PX = 2;
  const longestToken = getLongestToken(toMeasure);

  const measure = document.createElement('div');
  measure.style.position = 'fixed';
  measure.style.left = '-9999px';
  measure.style.top = '0';
  measure.style.fontWeight = fontWeight;
  measure.style.color = color;
  measure.style.fontFamily = fontFamily;
  measure.style.visibility = 'hidden';
  measure.style.pointerEvents = 'none';
  measure.style.lineHeight = '1.2';
  measure.style.boxSizing = 'border-box';
  measure.style.margin = '0';
  measure.style.border = 'none';
  measure.style.overflow = 'hidden';
  document.body.appendChild(measure);

  try {
    let low = MIN_FONT_SIZE;
    let high = Math.min(MAX_FONT_SIZE, Math.floor(containerHeightPx));
    let best = low;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const verticalPaddingPx = mid * VERTICAL_PADDING_EM;
      const horizontalPaddingPx = mid * HORIZONTAL_PADDING_EM;
      const contentWidthAtMid = containerWidthPx - 2 * horizontalPaddingPx;
      const contentHeightAtMid = containerHeightPx - 2 * verticalPaddingPx;
      // Use floor so we match the smaller effective width/height the span gets after layout rounding.
      const effectiveContentWidth = Math.floor(contentWidthAtMid) - WIDTH_BUFFER_PX;
      const effectiveContentHeight = Math.floor(contentHeightAtMid) - HEIGHT_BUFFER_PX;

      measure.style.fontSize = `${mid}px`;

      // 1) Longest word must fit in content width (no word break)
      measure.style.whiteSpace = 'nowrap';
      measure.style.width = 'auto';
      measure.style.height = 'auto';
      measure.style.padding = '0';
      measure.textContent = longestToken;
      const textWidth = measure.offsetWidth;
      const fitsWidth = effectiveContentWidth >= 1 && textWidth <= effectiveContentWidth;

      // 2) Wrapped content must fit in content height (wrap at effective width so layout matches)
      measure.style.whiteSpace = 'pre-wrap';
      measure.style.wordBreak = 'normal';
      measure.style.overflowWrap = 'normal';
      measure.style.width = `${Math.max(1, effectiveContentWidth)}px`;
      measure.style.height = 'auto';
      measure.style.padding = '0';
      measure.textContent = toMeasure;
      const textHeight = measure.offsetHeight;
      const fitsHeight = textHeight <= effectiveContentHeight;

      const fits = fitsWidth && fitsHeight;
      if (fits) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return best;
  } finally {
    if (measure.parentNode) measure.parentNode.removeChild(measure);
  }
}

function FitText({
  text,
  fontWeight,
  color,
  fontFamily: fontFamilyProp,
  designMode,
  containerWidthPercent,
  containerHeightPercent,
}: {
  text: string;
  fontWeight: 'normal' | 'bold';
  color: string;
  fontFamily?: string;
  designMode?: boolean;
  containerWidthPercent?: number;
  containerHeightPercent?: number;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);
  const dimensionsOverrideRef = useRef<{ w: number; h: number } | null>(null);
  const didTwoPassRef = useRef(false);
  const [fontSize, setFontSize] = useState<number>(12);
  const textToMeasure = text?.trim() || '\u00A0';

  const runMeasure = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const override = dimensionsOverrideRef.current;
    let measureW: number;
    let measureH: number;
    if (override) {
      dimensionsOverrideRef.current = null;
      measureW = override.w;
      measureH = override.h;
    } else {
      const rect = el.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w <= 0 || h <= 0) return;
      const clientW = el.clientWidth;
      const clientH = el.clientHeight;
      measureW = clientW > 0 && clientH > 0 ? clientW : w;
      measureH = clientW > 0 && clientH > 0 ? clientH : h;
    }
    if (measureW <= 0 || measureH <= 0) return;
    const computed = getComputedStyle(el);
    const fontFamily = fontFamilyProp ?? computed.fontFamily;
    const size = measureFittingFontSize(
      textToMeasure,
      measureW,
      measureH,
      fontWeight,
      color,
      fontFamily
    );
    setFontSize(size);
  }, [textToMeasure, fontWeight, color, fontFamilyProp]);

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const scheduleMeasureAndResetTwoPass = () => {
      didTwoPassRef.current = false;
      requestAnimationFrame(() => runMeasure());
    };
    scheduleMeasureAndResetTwoPass();
    const ro = new ResizeObserver(scheduleMeasureAndResetTwoPass);
    ro.observe(el);
    return () => ro.disconnect();
  }, [runMeasure]);

  useLayoutEffect(() => {
    didTwoPassRef.current = false;
    requestAnimationFrame(() => runMeasure());
  }, [containerWidthPercent, containerHeightPercent, runMeasure]);

  useLayoutEffect(() => {
    const span = spanRef.current;
    const wrapper = wrapperRef.current;
    if (!span || !wrapper) return;
    const wr = wrapper.getBoundingClientRect();
    const sr = span.getBoundingClientRect();
    if (!didTwoPassRef.current && (sr.width < wr.width - 2 || sr.height < wr.height - 2)) {
      didTwoPassRef.current = true;
      dimensionsOverrideRef.current = { w: sr.width, h: sr.height };
      requestAnimationFrame(() => runMeasure());
    }
  }, [fontSize, runMeasure]);

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        boxSizing: 'border-box',
        ...(fontFamilyProp && { fontFamily: fontFamilyProp }),
      }}
    >
      <span
        ref={spanRef}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          fontSize: `${fontSize}px`,
          fontWeight,
          color,
          ...(fontFamilyProp && { fontFamily: fontFamilyProp }),
          lineHeight: 1.2,
          whiteSpace: 'pre-wrap',
          wordBreak: 'normal',
          overflowWrap: 'normal',
          overflow: 'hidden',
          display: 'block',
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          paddingLeft: '0.5em',
          paddingRight: '0.5em',
          paddingTop: '0.3em',
          paddingBottom: '0.3em',
          pointerEvents: designMode ? 'none' : 'auto',
        }}
      >
        {text?.trim() || '\u00A0'}
      </span>
    </div>
  );
}

type DragState = {
  elementId: string;
  startX: number;
  startY: number;
  startElX: number;
  startElY: number;
  bounds: Bounds;
};

type ResizeState = {
  elementId: string;
  handle: 'se' | 'sw' | 'ne' | 'nw';
  startX: number;
  startY: number;
  startElX: number;
  startElY: number;
  startWidth: number;
  startHeight: number;
  bounds: Bounds;
};

type WmDragState = { startX: number; startY: number; startXPercent: number; startYPercent: number; bounds: Bounds };
type WmResizeState = { handle: 'se' | 'sw' | 'ne' | 'nw'; startX: number; startY: number; startBox: { x: number; y: number; width: number; height: number }; bounds: Bounds };

export default function CardCanvas({
  template,
  record,
  widthMm = 85.6,
  heightMm = 53.98,
  designMode = false,
  selectedElementIds = [],
  onElementClick,
  onSelectionChange,
  onElementUpdate,
  containerRefProp,
  watermarkEditMode = false,
  onWatermarkChange,
}: CardCanvasProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = containerRefProp ?? internalRef;
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [wmDragState, setWmDragState] = useState<WmDragState | null>(null);
  const [wmResizeState, setWmResizeState] = useState<WmResizeState | null>(null);
  const [marqueeState, setMarqueeState] = useState<MarqueeState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const wmDragStateRef = useRef<WmDragState | null>(null);
  const wmResizeStateRef = useRef<WmResizeState | null>(null);
  const marqueeStateRef = useRef<MarqueeState | null>(null);
  const onElementUpdateRef = useRef(onElementUpdate);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const templateRef = useRef(template);

  dragStateRef.current = dragState;
  resizeStateRef.current = resizeState;
  wmDragStateRef.current = wmDragState;
  wmResizeStateRef.current = wmResizeState;
  marqueeStateRef.current = marqueeState;
  onElementUpdateRef.current = onElementUpdate;
  onSelectionChangeRef.current = onSelectionChange;
  templateRef.current = template;

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const mq = marqueeStateRef.current;
    if (mq) {
      setMarqueeState((prev) => (prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null));
      return;
    }

    const wmDrag = wmDragStateRef.current;
    const wmResize = wmResizeStateRef.current;
    const wm = templateRef.current.watermark;
    const onWmChange = onWatermarkChange;

    if (wm && onWmChange && (wmDrag || wmResize)) {
      const bounds = wmDrag?.bounds ?? wmResize?.bounds;
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
      const deltaXPercent = ((e.clientX - (wmDrag?.startX ?? wmResize!.startX)) / bounds.width) * 100;
      const deltaYPercent = ((e.clientY - (wmDrag?.startY ?? wmResize!.startY)) / bounds.height) * 100;

      if (wmDrag) {
        const box = getWatermarkBox(wm);
        const newX = Math.max(0, Math.min(100 - box.width, wmDrag.startXPercent + deltaXPercent));
        const newY = Math.max(0, Math.min(100 - box.height, wmDrag.startYPercent + deltaYPercent));
        onWmChange({ ...wm, x: newX, y: newY, width: box.width, height: box.height });
      } else if (wmResize) {
        const { handle, startBox } = wmResize;
        let x = startBox.x;
        let y = startBox.y;
        let width = startBox.width;
        let height = startBox.height;
        if (handle.includes('e')) width = Math.max(5, Math.min(100 - x, startBox.width + deltaXPercent));
        if (handle.includes('w')) {
          const w = Math.max(5, Math.min(startBox.x + startBox.width, startBox.width - deltaXPercent));
          x = startBox.x + (startBox.width - w);
          width = w;
        }
        if (handle.includes('s')) height = Math.max(5, Math.min(100 - y, startBox.height + deltaYPercent));
        if (handle.includes('n')) {
          const h = Math.max(5, Math.min(startBox.y + startBox.height, startBox.height - deltaYPercent));
          y = startBox.y + (startBox.height - h);
          height = h;
        }
        onWmChange({ ...wm, x, y, width, height });
      }
      return;
    }

    const update = onElementUpdateRef.current;
    if (!update) return;

    const ds = dragStateRef.current;
    const rs = resizeStateRef.current;
    const elements = templateRef.current.elements;

    if (ds) {
      const bounds = ds.bounds;
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const deltaXPercent = ((e.clientX - ds.startX) / bounds.width) * 100;
      const deltaYPercent = ((e.clientY - ds.startY) / bounds.height) * 100;
      const el = elements.find((elem) => elem.id === ds.elementId);
      if (!el) return;
      const newX = Math.max(0, Math.min(100 - el.width, ds.startElX + deltaXPercent));
      const newY = Math.max(0, Math.min(100 - el.height, ds.startElY + deltaYPercent));
      update(ds.elementId, { x: newX, y: newY });
    } else if (rs) {
      const bounds = rs.bounds;
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const deltaXPercent = ((e.clientX - rs.startX) / bounds.width) * 100;
      const deltaYPercent = ((e.clientY - rs.startY) / bounds.height) * 100;
      let newX = rs.startElX;
      let newY = rs.startElY;
      let newWidth = rs.startWidth;
      let newHeight = rs.startHeight;

      if (rs.handle.includes('e')) {
        newWidth = Math.max(5, Math.min(100 - rs.startElX, rs.startWidth + deltaXPercent));
      }
      if (rs.handle.includes('w')) {
        const w = Math.max(5, Math.min(rs.startElX + rs.startWidth, rs.startWidth - deltaXPercent));
        newX = rs.startElX + (rs.startWidth - w);
        newWidth = w;
      }
      if (rs.handle.includes('s')) {
        newHeight = Math.max(5, Math.min(100 - rs.startElY, rs.startHeight + deltaYPercent));
      }
      if (rs.handle.includes('n')) {
        const h = Math.max(5, Math.min(rs.startElY + rs.startHeight, rs.startHeight - deltaYPercent));
        newY = rs.startElY + (rs.startHeight - h);
        newHeight = h;
      }
      update(rs.elementId, { x: newX, y: newY, width: newWidth, height: newHeight });
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    const mq = marqueeStateRef.current;
    const onSelectionChangeCb = onSelectionChangeRef.current;
    const elements = templateRef.current.elements;
    if (mq && onSelectionChangeCb) {
      const r = mq.rect;
      const minX = (Math.min(mq.startX, mq.currentX) - r.left) / r.width * 100;
      const maxX = (Math.max(mq.startX, mq.currentX) - r.left) / r.width * 100;
      const minY = (Math.min(mq.startY, mq.currentY) - r.top) / r.height * 100;
      const maxY = (Math.max(mq.startY, mq.currentY) - r.top) / r.height * 100;
      const ids = elements.filter((el) => {
        const elRight = el.x + el.width;
        const elBottom = el.y + el.height;
        return !(elRight < minX || maxX < el.x || elBottom < minY || maxY < el.y);
      }).map((el) => el.id);
      onSelectionChangeCb(ids);
    }
    marqueeStateRef.current = null;
    setMarqueeState(null);
    dragStateRef.current = null;
    resizeStateRef.current = null;
    wmDragStateRef.current = null;
    wmResizeStateRef.current = null;
    setDragState(null);
    setResizeState(null);
    setWmDragState(null);
    setWmResizeState(null);
  }, []);

  useLayoutEffect(() => {
    if (!dragState && !resizeState && !wmDragState && !wmResizeState && !marqueeState) return;
    const prevCursor = document.body.style.cursor;
    const resizeCursor = (resizeState || wmResizeState) && (resizeState?.handle === 'sw' || resizeState?.handle === 'ne' || wmResizeState?.handle === 'sw' || wmResizeState?.handle === 'ne') ? 'nesw-resize' : 'nwse-resize';
    document.body.style.cursor = marqueeState ? 'crosshair' : (dragState || wmDragState) ? 'grabbing' : (resizeState || wmResizeState) ? resizeCursor : prevCursor;
    document.addEventListener('mousemove', handleMouseMove, { capture: true });
    document.addEventListener('mouseup', handleMouseUp, { capture: true });
    return () => {
      document.body.style.cursor = prevCursor;
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
    };
  }, [dragState, resizeState, wmDragState, wmResizeState, marqueeState, handleMouseMove, handleMouseUp]);

  const elementsEditable = designMode && !watermarkEditMode;

  const handleElementMouseDown = useCallback(
    (e: React.MouseEvent, elementId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const el = template.elements.find((elem) => elem.id === elementId);
      if (!el || !elementsEditable || !onElementUpdate) return;
      const addToSelection = e.ctrlKey || e.metaKey;
      onElementClick?.(elementId, addToSelection);
      if (addToSelection) return;
      const bounds = containerRef.current?.getBoundingClientRect();
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
      const state: DragState = {
        elementId,
        startX: e.clientX,
        startY: e.clientY,
        startElX: el.x,
        startElY: el.y,
        bounds: { width: bounds.width, height: bounds.height },
      };
      dragStateRef.current = state;
      setDragState(state);
    },
    [template.elements, elementsEditable, onElementUpdate, onElementClick]
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, elementId: string, handle: ResizeState['handle']) => {
      e.preventDefault();
      e.stopPropagation();
      const el = template.elements.find((elem) => elem.id === elementId);
      if (!el || !elementsEditable || !onElementUpdate) return;
      const bounds = containerRef.current?.getBoundingClientRect();
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
      const state: ResizeState = {
        elementId,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startElX: el.x,
        startElY: el.y,
        startWidth: el.width,
        startHeight: el.height,
        bounds: { width: bounds.width, height: bounds.height },
      };
      resizeStateRef.current = state;
      setResizeState(state);
    },
    [template.elements, elementsEditable, onElementUpdate]
  );

  const handleWmDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const wm = template.watermark;
      if (!wm || !onWatermarkChange) return;
      const bounds = containerRef.current?.getBoundingClientRect();
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
      const box = getWatermarkBox(wm);
      setWmDragState({
        startX: e.clientX,
        startY: e.clientY,
        startXPercent: box.x,
        startYPercent: box.y,
        bounds: { width: bounds.width, height: bounds.height },
      });
    },
    [template.watermark, onWatermarkChange]
  );

  const handleWmResizeStart = useCallback(
    (e: React.MouseEvent, handle: WmResizeState['handle']) => {
      e.preventDefault();
      e.stopPropagation();
      const wm = template.watermark;
      if (!wm || !onWatermarkChange) return;
      const bounds = containerRef.current?.getBoundingClientRect();
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
      setWmResizeState({
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startBox: getWatermarkBox(wm),
        bounds: { width: bounds.width, height: bounds.height },
      });
    },
    [template.watermark, onWatermarkChange]
  );

  const handleCanvasBackgroundMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget || !designMode || watermarkEditMode || !onSelectionChange) return;
      const cardEl = internalRef.current;
      if (!cardEl) return;
      const rect = cardEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      e.preventDefault();
      setMarqueeState({
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      });
    },
    [designMode, watermarkEditMode, onSelectionChange]
  );

  const containerStyle: React.CSSProperties = {
    width: `${widthMm}mm`,
    height: `${heightMm}mm`,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
    boxSizing: 'border-box',
  };

  const bgStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
  };

  const wmStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    boxSizing: 'border-box',
  };

  const elementsStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: watermarkEditMode ? 'none' : 'auto',
  };

  const marqueeOverlayStyle = (): React.CSSProperties | null => {
    if (!marqueeState) return null;
    const r = marqueeState.rect;
    const left = Math.min(marqueeState.startX, marqueeState.currentX) - r.left;
    const top = Math.min(marqueeState.startY, marqueeState.currentY) - r.top;
    const width = Math.abs(marqueeState.currentX - marqueeState.startX);
    const height = Math.abs(marqueeState.currentY - marqueeState.startY);
    return {
      position: 'absolute',
      left,
      top,
      width,
      height,
      border: '2px dashed #6750A4',
      backgroundColor: 'rgba(103, 80, 164, 0.1)',
      pointerEvents: 'none',
      boxSizing: 'border-box',
    };
  };

  const renderElement = (el: TemplateElement) => {
    const isSelected = selectedElementIds.includes(el.id);
    const isSingleSelected = selectedElementIds.length === 1 && selectedElementIds[0] === el.id;
    const style: React.CSSProperties = {
      position: 'absolute',
      left: `${el.x}%`,
      top: `${el.y}%`,
      width: `${el.width}%`,
      height: `${el.height}%`,
      boxSizing: 'border-box',
      border: elementsEditable ? (isSelected ? '2px solid #6750A4' : '1px dashed #999') : 'none',
      cursor: elementsEditable ? (dragState?.elementId === el.id ? 'grabbing' : 'grab') : 'default',
      userSelect: elementsEditable ? 'none' : 'auto',
    };

    const textContent =
      el.type === 'label'
        ? ((el as LabelElement).value ?? '')
        : designMode
          ? (el.placeholder || '\u00A0')
          : (getFieldValue(record, el.binding) ?? el.placeholder ?? '\u00A0');
    const textOrLabelEl = el.type === 'text' ? (el as TextElement) : (el as LabelElement);
    const content =
      el.type === 'text' || el.type === 'label' ? (
        textOrLabelEl.fontSizeAuto !== false ? (
          <FitText
            text={typeof textContent === 'string' ? textContent : '\u00A0'}
            fontWeight={textOrLabelEl.fontWeight ?? 'normal'}
            color={textOrLabelEl.color ?? '#000'}
            fontFamily={textOrLabelEl.fontFamily}
            designMode={designMode}
            containerWidthPercent={el.width}
            containerHeightPercent={el.height}
          />
        ) : (
          <span
            style={{
              fontSize: textOrLabelEl.fontSize ?? 12,
              fontWeight: textOrLabelEl.fontWeight ?? 'normal',
              color: textOrLabelEl.color ?? '#000',
              ...(textOrLabelEl.fontFamily && { fontFamily: textOrLabelEl.fontFamily }),
              overflow: 'hidden',
              display: 'block',
              pointerEvents: designMode ? 'none' : 'auto',
            }}
          >
            {textContent}
          </span>
        )
      ) : el.type === 'image' ? (
        getFieldValue(record, el.binding) ? (
          <img src={getFieldValue(record, el.binding)!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#e0e0e0',
              color: '#666',
              fontSize: 10,
              pointerEvents: designMode ? 'none' : 'auto',
            }}
          >
            {el.placeholder ?? 'Photo'}
          </div>
        )
      ) : null;

    const elementContent = (
      <div
        key={el.id}
        role={designMode ? 'button' : undefined}
        style={{
          ...style,
        ...((el.type === 'text' || el.type === 'label') && {
          display: 'flex',
          alignItems: 'center',
        }),
        }}
        onMouseDown={elementsEditable ? (e) => handleElementMouseDown(e, el.id) : undefined}
      >
        {content}
        {elementsEditable && isSingleSelected && onElementUpdate && (
          <>
            <div
              onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'se')}
              style={{
                position: 'absolute',
                right: -4,
                bottom: -4,
                width: 12,
                height: 12,
                cursor: 'nwse-resize',
                backgroundColor: '#6750A4',
                border: '1px solid #fff',
                borderRadius: 2,
                boxSizing: 'border-box',
              }}
            />
            <div
              onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'sw')}
              style={{
                position: 'absolute',
                left: -4,
                bottom: -4,
                width: 12,
                height: 12,
                cursor: 'nesw-resize',
                backgroundColor: '#6750A4',
                border: '1px solid #fff',
                borderRadius: 2,
                boxSizing: 'border-box',
              }}
            />
            <div
              onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'ne')}
              style={{
                position: 'absolute',
                right: -4,
                top: -4,
                width: 12,
                height: 12,
                cursor: 'nesw-resize',
                backgroundColor: '#6750A4',
                border: '1px solid #fff',
                borderRadius: 2,
                boxSizing: 'border-box',
              }}
            />
            <div
              onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'nw')}
              style={{
                position: 'absolute',
                left: -4,
                top: -4,
                width: 12,
                height: 12,
                cursor: 'nwse-resize',
                backgroundColor: '#6750A4',
                border: '1px solid #fff',
                borderRadius: 2,
                boxSizing: 'border-box',
              }}
            />
          </>
        )}
      </div>
    );

    return elementContent;
  };

  const watermark = template.watermark;
  const showEditableWatermark = watermarkEditMode && watermark && onWatermarkChange;

  return (
    <div ref={internalRef} style={containerStyle}>
      {renderBackground(template.background, bgStyle)}
      {!showEditableWatermark && (
        <div style={wmStyle}>{renderWatermarkStatic(template.watermark)}</div>
      )}
      {showEditableWatermark && watermark && (
        <div style={{ ...wmStyle, pointerEvents: 'none' }}>
          <div
            role="presentation"
            style={{
              position: 'absolute',
              left: `${getWatermarkBox(watermark).x}%`,
              top: `${getWatermarkBox(watermark).y}%`,
              width: `${getWatermarkBox(watermark).width}%`,
              height: `${getWatermarkBox(watermark).height}%`,
              opacity: watermark.opacity,
              pointerEvents: 'auto',
              cursor: wmDragState ? 'grabbing' : 'grab',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: watermark.rotation != null ? `rotate(${watermark.rotation}deg)` : undefined,
              boxSizing: 'border-box',
              border: '2px solid #6750A4',
            }}
            onMouseDown={handleWmDragStart}
          >
            {watermark.type === 'text' ? (
              <span style={{ overflow: 'hidden', fontSize: watermark.fontSize ?? 14, whiteSpace: 'nowrap' }}>
                {watermark.value}
              </span>
            ) : (
              <img src={watermark.value} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            )}
            {(['se', 'sw', 'ne', 'nw'] as const).map((handle) => (
              <div
                key={handle}
                onMouseDown={(e) => { e.stopPropagation(); handleWmResizeStart(e, handle); }}
                style={{
                  position: 'absolute',
                  left: handle.includes('w') ? -4 : undefined,
                  right: handle.includes('e') ? -4 : undefined,
                  top: handle.includes('n') ? -4 : undefined,
                  bottom: handle.includes('s') ? -4 : undefined,
                  width: 12,
                  height: 12,
                  cursor: handle === 'sw' || handle === 'ne' ? 'nesw-resize' : 'nwse-resize',
                  backgroundColor: '#6750A4',
                  border: '1px solid #fff',
                  borderRadius: 2,
                  boxSizing: 'border-box',
                }}
              />
            ))}
          </div>
        </div>
      )}
      <div
        style={elementsStyle}
        onMouseDown={handleCanvasBackgroundMouseDown}
      >
        {template.elements.map(renderElement)}
      </div>
      {marqueeState && (
        <div style={marqueeOverlayStyle()!} aria-hidden />
      )}
    </div>
  );
}
