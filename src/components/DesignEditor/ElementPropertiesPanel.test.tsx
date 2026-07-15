import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ElementPropertiesPanel from './ElementPropertiesPanel';
import type { TextElement, LabelElement, ImageElement } from '../../types';

function textElement(overrides: Partial<TextElement> = {}): TextElement {
  return { id: 'e1', type: 'text', x: 10, y: 10, width: 50, height: 20, binding: 'name', ...overrides };
}
function labelElement(overrides: Partial<LabelElement> = {}): LabelElement {
  return { id: 'e2', type: 'label', x: 0, y: 0, width: 50, height: 20, value: 'Static', ...overrides };
}
function imageElement(overrides: Partial<ImageElement> = {}): ImageElement {
  return { id: 'e3', type: 'image', x: 0, y: 0, width: 50, height: 20, binding: 'photo', ...overrides };
}

describe('ElementPropertiesPanel — selection states', () => {
  it('shows the empty state when nothing is selected', () => {
    render(<ElementPropertiesPanel element={null} availableBindings={[]} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Select an element to edit, or drag to select multiple')).toBeInTheDocument();
  });

  it('shows multi-select summary (no field editing) when selectedCount > 1', () => {
    render(
      <ElementPropertiesPanel element={null} selectedCount={3} availableBindings={[]} onUpdate={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByText('3 elements selected')).toBeInTheDocument();
    expect(screen.queryByLabelText('X (%)')).not.toBeInTheDocument();
  });

  it('hides Duplicate in multi-select mode when onDuplicate is not provided', () => {
    render(
      <ElementPropertiesPanel element={null} selectedCount={2} availableBindings={[]} onUpdate={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /Duplicate/ })).not.toBeInTheDocument();
  });

  it('shows Duplicate in multi-select mode when onDuplicate is provided, with the count', () => {
    render(
      <ElementPropertiesPanel element={null} selectedCount={2} availableBindings={[]} onUpdate={vi.fn()} onDelete={vi.fn()} onDuplicate={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Duplicate (2)' })).toBeInTheDocument();
  });

  it('clicking Delete in multi-select mode calls onDelete', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <ElementPropertiesPanel element={null} selectedCount={2} availableBindings={[]} onUpdate={vi.fn()} onDelete={onDelete} />,
    );
    await user.click(screen.getByRole('button', { name: 'Delete (2)' }));
    expect(onDelete).toHaveBeenCalled();
  });
});

describe('ElementPropertiesPanel — common fields', () => {
  it('clamps X/Y/Width/Height to their valid ranges', () => {
    const onUpdate = vi.fn();
    render(<ElementPropertiesPanel element={textElement()} availableBindings={[]} onUpdate={onUpdate} onDelete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('X (%)'), { target: { value: '150' } });
    expect(onUpdate).toHaveBeenCalledWith({ x: 100 });
    fireEvent.change(screen.getByLabelText('Y (%)'), { target: { value: '-10' } });
    expect(onUpdate).toHaveBeenCalledWith({ y: 0 });
    fireEvent.change(screen.getByLabelText('Width (%)'), { target: { value: '0' } });
    expect(onUpdate).toHaveBeenCalledWith({ width: 1 });
  });

  it('skips the CSV Binding field for label elements', () => {
    render(<ElementPropertiesPanel element={labelElement()} availableBindings={['name']} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByLabelText('CSV Binding')).not.toBeInTheDocument();
  });

  it('shows the CSV Binding field for text elements', () => {
    render(<ElementPropertiesPanel element={textElement()} availableBindings={['name']} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByLabelText('CSV Binding')).toBeInTheDocument();
  });

  it('captures a typed-but-not-confirmed binding value on blur', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<ElementPropertiesPanel element={textElement({ binding: '' })} availableBindings={['name']} onUpdate={onUpdate} onDelete={vi.fn()} />);
    const bindingField = screen.getByLabelText('CSV Binding');
    await user.click(bindingField);
    await user.type(bindingField, 'custom_field');
    await user.tab(); // blur without selecting an option or pressing Enter
    expect(onUpdate).toHaveBeenCalledWith({ binding: 'custom_field' });
  });

  it('normalizes an empty binding to undefined, not an empty string', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<ElementPropertiesPanel element={textElement({ binding: 'name' })} availableBindings={['name']} onUpdate={onUpdate} onDelete={vi.fn()} />);
    const bindingField = screen.getByLabelText('CSV Binding');
    await user.clear(bindingField);
    await user.tab();
    expect(onUpdate).toHaveBeenCalledWith({ binding: undefined });
  });
});

describe('ElementPropertiesPanel — label-specific fields', () => {
  it('shows and updates the Label text field', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<ElementPropertiesPanel element={labelElement()} availableBindings={[]} onUpdate={onUpdate} onDelete={vi.fn()} />);
    const field = screen.getByLabelText('Label text');
    await user.type(field, '!');
    expect(onUpdate).toHaveBeenCalledWith({ value: 'Static!' });
  });
});

describe('ElementPropertiesPanel — font size dual-mode', () => {
  it('picking "Dynamic (fit to field)" sets fontSizeAuto=true and resets fontSize to 12', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<ElementPropertiesPanel element={textElement({ fontSize: 20 })} availableBindings={[]} onUpdate={onUpdate} onDelete={vi.fn()} />);
    const field = screen.getByLabelText('Font size');
    await user.click(field);
    await user.click(await screen.findByRole('option', { name: 'Dynamic (fit to field)' }));
    expect(onUpdate).toHaveBeenCalledWith({ fontSizeAuto: true, fontSize: 12 });
  });

  it('typing a numeric size and blurring sets fontSizeAuto=false with that size', async () => {
    const onUpdate = vi.fn();
    render(<ElementPropertiesPanel element={textElement()} availableBindings={[]} onUpdate={onUpdate} onDelete={vi.fn()} />);
    const field = screen.getByLabelText('Font size');
    fireEvent.change(field, { target: { value: '18' } });
    fireEvent.blur(field);
    expect(onUpdate).toHaveBeenCalledWith({ fontSizeAuto: false, fontSize: 18 });
  });

  it('clamps an out-of-range typed size to [1, 999] on blur', () => {
    const onUpdate = vi.fn();
    render(<ElementPropertiesPanel element={textElement()} availableBindings={[]} onUpdate={onUpdate} onDelete={vi.fn()} />);
    const field = screen.getByLabelText('Font size');
    fireEvent.change(field, { target: { value: '5000' } });
    fireEvent.blur(field);
    expect(onUpdate).toHaveBeenCalledWith({ fontSizeAuto: false, fontSize: 999 });
  });

  it('falls back to size 12 for unparseable input on blur', () => {
    const onUpdate = vi.fn();
    render(<ElementPropertiesPanel element={textElement()} availableBindings={[]} onUpdate={onUpdate} onDelete={vi.fn()} />);
    const field = screen.getByLabelText('Font size');
    fireEvent.change(field, { target: { value: 'not a number' } });
    fireEvent.blur(field);
    expect(onUpdate).toHaveBeenCalledWith({ fontSizeAuto: false, fontSize: 12 });
  });
});

describe('ElementPropertiesPanel — other text/label fields', () => {
  it('changing font weight calls onUpdate', async () => {
    // MUI Select here isn't linked to its InputLabel via labelId/id (same gap as
    // ColumnMapping/PrintSettings — task_45ed82c9), so name-based queries are
    // unreliable; "Font weight" is the only true Select (not Autocomplete) rendered
    // for a text element, distinguished by aria-haspopup="listbox".
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const { container } = render(<ElementPropertiesPanel element={textElement()} availableBindings={[]} onUpdate={onUpdate} onDelete={vi.fn()} />);
    await user.click(container.querySelector('[aria-haspopup="listbox"]')!);
    await user.click(await screen.findByRole('option', { name: 'Bold' }));
    expect(onUpdate).toHaveBeenCalledWith({ fontWeight: 'bold' });
  });

  it('clicking a vertical-align option calls onUpdate with that value', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<ElementPropertiesPanel element={textElement()} availableBindings={[]} onUpdate={onUpdate} onDelete={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Top' }));
    expect(onUpdate).toHaveBeenCalledWith({ verticalAlign: 'top' });
  });

  it('re-clicking the already-selected vertical-align option does not call onUpdate with null', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<ElementPropertiesPanel element={textElement({ verticalAlign: 'center' })} availableBindings={[]} onUpdate={onUpdate} onDelete={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Center' }));
    expect(onUpdate).not.toHaveBeenCalledWith({ verticalAlign: null });
  });

  it('captures a typed-but-not-confirmed font family on blur', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<ElementPropertiesPanel element={textElement()} availableBindings={[]} onUpdate={onUpdate} onDelete={vi.fn()} />);
    const field = screen.getByLabelText('Font');
    await user.click(field);
    await user.type(field, 'Custom Font');
    await user.tab();
    expect(onUpdate).toHaveBeenCalledWith({ fontFamily: 'Custom Font' });
  });

  it('changing color calls onUpdate', () => {
    const onUpdate = vi.fn();
    render(<ElementPropertiesPanel element={textElement()} availableBindings={[]} onUpdate={onUpdate} onDelete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#ff0000' } });
    expect(onUpdate).toHaveBeenCalledWith({ color: '#ff0000' });
  });
});

describe('ElementPropertiesPanel — image-specific fields', () => {
  it('shows placeholder and image-fit fields, not font fields', () => {
    render(<ElementPropertiesPanel element={imageElement()} availableBindings={[]} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByLabelText('Placeholder text')).toBeInTheDocument();
    expect(screen.queryByLabelText('Font size')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Font weight')).not.toBeInTheDocument();
  });

  it('changing image fit calls onUpdate', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const { container } = render(<ElementPropertiesPanel element={imageElement()} availableBindings={[]} onUpdate={onUpdate} onDelete={vi.fn()} />);
    await user.click(container.querySelector('[aria-haspopup="listbox"]')!);
    await user.click(await screen.findByRole('option', { name: 'Contain (show full image)' }));
    expect(onUpdate).toHaveBeenCalledWith({ objectFit: 'contain' });
  });
});

describe('ElementPropertiesPanel — footer actions', () => {
  it('Delete Element calls onDelete', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<ElementPropertiesPanel element={textElement()} availableBindings={[]} onUpdate={vi.fn()} onDelete={onDelete} />);
    await user.click(screen.getByRole('button', { name: 'Delete Element' }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('hides Duplicate in single-select mode when onDuplicate is not provided', () => {
    render(<ElementPropertiesPanel element={textElement()} availableBindings={[]} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Duplicate' })).not.toBeInTheDocument();
  });

  it('Duplicate calls onDuplicate in single-select mode when provided', async () => {
    const user = userEvent.setup();
    const onDuplicate = vi.fn();
    render(<ElementPropertiesPanel element={textElement()} availableBindings={[]} onUpdate={vi.fn()} onDelete={vi.fn()} onDuplicate={onDuplicate} />);
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(onDuplicate).toHaveBeenCalled();
  });
});
