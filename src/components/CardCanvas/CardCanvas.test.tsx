import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CardCanvas from './CardCanvas';
import type { Template, CardRecord, TextElement, ImageElement, LabelElement, BackgroundConfig, WatermarkConfig } from '../../types';

const SAFE_PNG = 'data:image/png;base64,AAAA';
const UNSAFE_SVG = 'data:image/svg+xml;base64,AAAA';

function template(overrides: Partial<Template> = {}): Template {
  return { id: 't1', name: 'T', elements: [], background: null, watermark: null, ...overrides };
}

function textEl(overrides: Partial<TextElement> = {}): TextElement {
  return { id: 'e1', type: 'text', x: 10, y: 10, width: 40, height: 20, binding: 'name', ...overrides };
}
function imageEl(overrides: Partial<ImageElement> = {}): ImageElement {
  return { id: 'e2', type: 'image', x: 0, y: 0, width: 50, height: 50, binding: 'photo', ...overrides };
}
function labelEl(overrides: Partial<LabelElement> = {}): LabelElement {
  return { id: 'e3', type: 'label', x: 0, y: 0, width: 50, height: 20, value: 'Static', ...overrides };
}

// Fixed bounds so drag/resize percent math is deterministic (jsdom returns all-zero rects by default).
const FIXED_RECT = { width: 400, height: 200, left: 0, top: 0, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => {} };

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(FIXED_RECT);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('CardCanvas — isSafeImageSrc gate', () => {
  // The component's <img> tags all use alt="" (decorative), which removes them from the
  // accessibility tree (role becomes "presentation", not "img") — query by tag instead.
  it('renders a safe data:image/png as an <img>', () => {
    const record: CardRecord = { id: 'r1', data: { photo: SAFE_PNG }, overrides: {} };
    const { container } = render(<CardCanvas template={template({ elements: [imageEl()] })} record={record} />);
    expect(container.querySelector('img')).toHaveAttribute('src', SAFE_PNG);
  });

  it('renders a safe https:// URL as an <img>', () => {
    const record: CardRecord = { id: 'r1', data: { photo: 'https://example.com/a.png' }, overrides: {} };
    const { container } = render(<CardCanvas template={template({ elements: [imageEl()] })} record={record} />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/a.png');
  });

  it('blocks data:image/svg (XSS risk) and shows the placeholder instead', () => {
    const record: CardRecord = { id: 'r1', data: { photo: UNSAFE_SVG }, overrides: {} };
    render(<CardCanvas template={template({ elements: [imageEl()] })} record={record} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Photo')).toBeInTheDocument();
  });

  it('blocks a relative path and shows the placeholder', () => {
    const record: CardRecord = { id: 'r1', data: { photo: '/local/path.png' }, overrides: {} };
    render(<CardCanvas template={template({ elements: [imageEl()] })} record={record} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('uses a custom placeholder when provided', () => {
    render(<CardCanvas template={template({ elements: [imageEl({ placeholder: 'Headshot' })] })} />);
    expect(screen.getByText('Headshot')).toBeInTheDocument();
  });
});

describe('CardCanvas — background rendering', () => {
  function renderBg(background: BackgroundConfig | null) {
    const { container } = render(<CardCanvas template={template({ background })} />);
    return container.querySelector('div[style*="position: absolute"]')!;
  }

  it('defaults to a plain gray background when null', () => {
    const bg = renderBg(null);
    expect(bg).toHaveStyle({ backgroundColor: 'rgb(245, 245, 245)' });
  });

  it('renders a solid color background', () => {
    const bg = renderBg({ type: 'solid', value: '#123456' });
    expect(bg).toHaveStyle({ backgroundColor: '#123456' });
  });

  it('renders a gradient with an allowed direction', () => {
    const bg = renderBg({ type: 'gradient', value: '#111', gradientColor2: '#222', gradientDirection: 'to right' });
    expect(bg.getAttribute('style')).toContain('linear-gradient(to right, #111, #222)');
  });

  it('falls back to "to bottom" for a disallowed gradient direction', () => {
    const bg = renderBg({ type: 'gradient', value: '#111', gradientColor2: '#222', gradientDirection: 'to bottom-left' as never });
    expect(bg.getAttribute('style')).toContain('linear-gradient(to bottom, #111, #222)');
  });

  it('renders a safe image background as an <img>, not CSS background-image (html2canvas scale constraint)', () => {
    const { container } = render(<CardCanvas template={template({ background: { type: 'image', value: SAFE_PNG } })} />);
    const img = container.querySelector('img');
    expect(img?.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', SAFE_PNG);
  });

  it('falls through to a plain div for an unsafe image background value', () => {
    const { container } = render(<CardCanvas template={template({ background: { type: 'image', value: UNSAFE_SVG } })} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('div[style*="position: absolute"]')).toBeInTheDocument();
  });
});

describe('CardCanvas — watermark (static, non-edit-mode)', () => {
  it('renders nothing when there is no watermark', () => {
    const { container } = render(<CardCanvas template={template({ watermark: null })} />);
    expect(container.querySelectorAll('img, [style*="white-space: nowrap"]')).toHaveLength(0);
  });

  it('renders text watermark content', () => {
    const watermark: WatermarkConfig = { type: 'text', value: 'CONFIDENTIAL', opacity: 0.3, position: 'center' };
    render(<CardCanvas template={template({ watermark })} />);
    expect(screen.getByText('CONFIDENTIAL')).toBeInTheDocument();
  });

  it('renders a safe image watermark as an <img>', () => {
    const watermark: WatermarkConfig = { type: 'image', value: SAFE_PNG, opacity: 0.3, position: 'center' };
    const { container } = render(<CardCanvas template={template({ watermark })} />);
    expect(container.querySelector('img')).toHaveAttribute('src', SAFE_PNG);
  });

  it('renders nothing for an unsafe image watermark value', () => {
    const watermark: WatermarkConfig = { type: 'image', value: UNSAFE_SVG, opacity: 0.3, position: 'center' };
    render(<CardCanvas template={template({ watermark })} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('CardCanvas — text/label content and field binding', () => {
  it('renders a label element\'s static value regardless of record data', () => {
    const record: CardRecord = { id: 'r1', data: { name: 'ignored' }, overrides: {} };
    render(<CardCanvas template={template({ elements: [labelEl({ value: 'Employee' })] })} record={record} />);
    expect(screen.getByText('Employee')).toBeInTheDocument();
  });

  it('renders bound field data for a text element in export mode', () => {
    const record: CardRecord = { id: 'r1', data: { name: 'Alice' }, overrides: {} };
    render(<CardCanvas template={template({ elements: [textEl()] })} record={record} designMode={false} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('prefers overrides over data for a bound field', () => {
    const record: CardRecord = { id: 'r1', data: { name: 'Alice' }, overrides: { name: 'Override Name' } };
    render(<CardCanvas template={template({ elements: [textEl()] })} record={record} designMode={false} />);
    expect(screen.getByText('Override Name')).toBeInTheDocument();
  });

  it('falls back to the placeholder when the bound field has no value', () => {
    const record: CardRecord = { id: 'r1', data: {}, overrides: {} };
    render(<CardCanvas template={template({ elements: [textEl({ placeholder: 'Full name' })] })} record={record} designMode={false} />);
    expect(screen.getByText('Full name')).toBeInTheDocument();
  });

  it('shows the placeholder (not record data) in design mode', () => {
    const record: CardRecord = { id: 'r1', data: { name: 'Alice' }, overrides: {} };
    render(<CardCanvas template={template({ elements: [textEl({ placeholder: 'Full name' })] })} record={record} designMode />);
    expect(screen.getByText('Full name')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  it('bypasses FitText (renders a plain span with explicit fontSize) when fontSizeAuto is false', () => {
    const record: CardRecord = { id: 'r1', data: { name: 'Alice' }, overrides: {} };
    const { container } = render(
      <CardCanvas template={template({ elements: [textEl({ fontSizeAuto: false, fontSize: 22 })] })} record={record} designMode={false} />,
    );
    const span = Array.from(container.querySelectorAll('span')).find((s) => s.textContent === 'Alice');
    expect(span).toHaveStyle({ fontSize: '22px' });
  });

  it('bypasses FitText when a per-record fontSizeOverride is set for the binding', () => {
    const record: CardRecord = { id: 'r1', data: { name: 'Alice' }, overrides: {}, fontSizeOverrides: { name: 30 } };
    const { container } = render(
      <CardCanvas template={template({ elements: [textEl({ fontSizeAuto: true })] })} record={record} designMode={false} />,
    );
    const span = Array.from(container.querySelectorAll('span')).find((s) => s.textContent === 'Alice');
    expect(span).toHaveStyle({ fontSize: '30px' });
  });
});

describe('CardCanvas — design-mode selection', () => {
  it('elements have role="button" only in design mode', () => {
    const { rerender } = render(<CardCanvas template={template({ elements: [textEl()] })} designMode />);
    expect(screen.getByRole('button')).toBeInTheDocument();
    rerender(<CardCanvas template={template({ elements: [textEl()] })} designMode={false} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('mousedown on an element fires onElementClick with addToSelection=false for a plain click', () => {
    const onElementClick = vi.fn();
    render(
      <CardCanvas
        template={template({ elements: [textEl()] })}
        designMode
        onElementClick={onElementClick}
        onElementUpdate={vi.fn()}
      />,
    );
    fireEvent.mouseDown(screen.getByRole('button'));
    expect(onElementClick).toHaveBeenCalledWith('e1', false);
  });

  it('Ctrl/Cmd+mousedown fires onElementClick with addToSelection=true and does not start a drag', () => {
    const onElementClick = vi.fn();
    const onElementUpdate = vi.fn();
    render(
      <CardCanvas
        template={template({ elements: [textEl()] })}
        designMode
        onElementClick={onElementClick}
        onElementUpdate={onElementUpdate}
      />,
    );
    fireEvent.mouseDown(screen.getByRole('button'), { ctrlKey: true });
    expect(onElementClick).toHaveBeenCalledWith('e1', true);
    fireEvent.mouseMove(document, { clientX: 100, clientY: 100 });
    expect(onElementUpdate).not.toHaveBeenCalled();
  });

  it('does not fire onElementClick when watermarkEditMode is true (elements not editable)', () => {
    const onElementClick = vi.fn();
    render(
      <CardCanvas
        template={template({ elements: [textEl()] })}
        designMode
        watermarkEditMode
        onElementClick={onElementClick}
        onElementUpdate={vi.fn()}
      />,
    );
    // role="button" is gated only on designMode (still present here) — what actually
    // changes is elementsEditable (designMode && !watermarkEditMode) gating whether an
    // onMouseDown handler is attached at all, so firing mousedown is a no-op.
    fireEvent.mouseDown(screen.getByRole('button'));
    expect(onElementClick).not.toHaveBeenCalled();
  });
});

describe('CardCanvas — drag to move an element', () => {
  it('dragging moves the element by the mouse delta converted to percent, clamped to [0, 100-size]', () => {
    const onElementUpdate = vi.fn();
    render(
      <CardCanvas
        template={template({ elements: [textEl({ x: 10, y: 10, width: 40, height: 20 })] })}
        designMode
        onElementClick={vi.fn()}
        onElementUpdate={onElementUpdate}
      />,
    );
    fireEvent.mouseDown(screen.getByRole('button'), { clientX: 0, clientY: 0 });
    // Bounds are 400x200; moving 40px right / 20px down = 10% / 10% delta.
    fireEvent.mouseMove(document, { clientX: 40, clientY: 20 });
    expect(onElementUpdate).toHaveBeenCalledWith('e1', { x: 20, y: 20 });
    fireEvent.mouseUp(document);
  });

  it('clamps drag so the element cannot move past the right/bottom edge', () => {
    const onElementUpdate = vi.fn();
    render(
      <CardCanvas
        template={template({ elements: [textEl({ x: 10, y: 10, width: 40, height: 20 })] })}
        designMode
        onElementClick={vi.fn()}
        onElementUpdate={onElementUpdate}
      />,
    );
    fireEvent.mouseDown(screen.getByRole('button'), { clientX: 0, clientY: 0 });
    // A huge rightward/downward drag should clamp x to 100-40=60 and y to 100-20=80.
    fireEvent.mouseMove(document, { clientX: 4000, clientY: 4000 });
    expect(onElementUpdate).toHaveBeenCalledWith('e1', { x: 60, y: 80 });
  });

  it('does not start a drag when onElementUpdate is not provided', () => {
    const onElementClick = vi.fn();
    render(
      <CardCanvas template={template({ elements: [textEl()] })} designMode onElementClick={onElementClick} />,
    );
    fireEvent.mouseDown(screen.getByRole('button'));
    // No onElementUpdate means handleElementMouseDown bails before calling onElementClick at all.
    expect(onElementClick).not.toHaveBeenCalled();
  });
});

describe('CardCanvas — resize handles', () => {
  it('shows resize handles only when exactly one element is selected', () => {
    const { container, rerender } = render(
      <CardCanvas
        template={template({ elements: [textEl()] })}
        designMode
        selectedElementIds={[]}
        onElementUpdate={vi.fn()}
      />,
    );
    expect(container.querySelectorAll('[style*="cursor: nwse-resize"]')).toHaveLength(0);

    rerender(
      <CardCanvas
        template={template({ elements: [textEl()] })}
        designMode
        selectedElementIds={['e1']}
        onElementUpdate={vi.fn()}
      />,
    );
    expect(container.querySelectorAll('[style*="cursor: nwse-resize"]').length).toBeGreaterThan(0);
  });

  it('dragging the se handle grows width/height by the delta, clamped to a 5% minimum', () => {
    const onElementUpdate = vi.fn();
    const { container } = render(
      <CardCanvas
        template={template({ elements: [textEl({ x: 10, y: 10, width: 40, height: 20 })] })}
        designMode
        selectedElementIds={['e1']}
        onElementUpdate={onElementUpdate}
      />,
    );
    const seHandle = container.querySelector('[style*="cursor: nwse-resize"][style*="right: -4px"]')!;
    fireEvent.mouseDown(seHandle, { clientX: 0, clientY: 0 });
    // 40px/20px delta over 400x200 bounds = 10%/10%.
    fireEvent.mouseMove(document, { clientX: 40, clientY: 20 });
    expect(onElementUpdate).toHaveBeenCalledWith('e1', { x: 10, y: 10, width: 50, height: 30 });
  });
});

describe('CardCanvas — marquee selection', () => {
  it('mousedown+mousemove+mouseup on the canvas background selects overlapping elements', () => {
    const onSelectionChange = vi.fn();
    const { container } = render(
      <CardCanvas
        template={template({
          elements: [
            textEl({ id: 'inside', x: 10, y: 10, width: 10, height: 10 }),
            textEl({ id: 'outside', x: 90, y: 90, width: 5, height: 5 }),
          ],
        })}
        designMode
        onSelectionChange={onSelectionChange}
      />,
    );
    // The elements-layer background div (not an individual element) starts the marquee.
    const background = container.querySelector('[style*="pointer-events: auto"]')!;
    fireEvent.mouseDown(background, { clientX: 0, clientY: 0, target: background });
    fireEvent.mouseMove(document, { clientX: 200, clientY: 100 }); // 50%/50% of the 400x200 bounds
    fireEvent.mouseUp(document);

    expect(onSelectionChange).toHaveBeenCalledWith(['inside']);
  });

  it('does not start a marquee when watermarkEditMode is true', () => {
    const onSelectionChange = vi.fn();
    const { container } = render(
      <CardCanvas template={template({ elements: [textEl()] })} designMode watermarkEditMode onSelectionChange={onSelectionChange} />,
    );
    const background = container.querySelector('[style*="pointer-events: none"]');
    if (background) fireEvent.mouseDown(background, { clientX: 0, clientY: 0, target: background });
    fireEvent.mouseMove(document, { clientX: 200, clientY: 100 });
    fireEvent.mouseUp(document);
    expect(onSelectionChange).not.toHaveBeenCalled();
  });
});

describe('CardCanvas — watermark edit mode', () => {
  it('dragging the watermark box updates its position via onWatermarkChange', () => {
    const watermark: WatermarkConfig = { type: 'text', value: 'WM', opacity: 0.3, position: 'center' };
    const onWatermarkChange = vi.fn();
    render(
      <CardCanvas
        template={template({ watermark })}
        designMode
        watermarkEditMode
        onWatermarkChange={onWatermarkChange}
      />,
    );
    fireEvent.mouseDown(screen.getByRole('presentation'), { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 40, clientY: 20 }); // 10%/10% of 400x200
    expect(onWatermarkChange).toHaveBeenCalled();
    const call = onWatermarkChange.mock.calls[0][0];
    expect(call.type).toBe('text');
    expect(call.width).toBeCloseTo(30); // DEFAULT_WM_SIZE unchanged by a drag
  });
});
