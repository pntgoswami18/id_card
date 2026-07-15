import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ColumnMappingComponent from './ColumnMapping';
import type { TemplateElement } from '../types';

const elements: TemplateElement[] = [
  { id: 'e1', type: 'text', x: 0, y: 0, width: 50, height: 20, binding: 'name' },
  { id: 'e2', type: 'image', x: 0, y: 0, width: 50, height: 20, binding: 'photo' },
  // A second element bound to the same field as e1 — should collapse to one dropdown.
  { id: 'e3', type: 'text', x: 0, y: 0, width: 50, height: 20, binding: 'name' },
  // No binding — excluded entirely.
  { id: 'e4', type: 'label', x: 0, y: 0, width: 50, height: 20, value: 'Static' },
];
const headers = ['Full Name', 'Photo URL'];

describe('ColumnMapping', () => {
  it('shows a fallback message when no template elements have a binding', () => {
    render(
      <ColumnMappingComponent
        headers={headers}
        elements={[{ id: 'e4', type: 'label', x: 0, y: 0, width: 50, height: 20, value: 'Static' }]}
        mapping={{}}
        onMappingChange={vi.fn()}
        onGenerate={vi.fn()}
        onUploadDifferent={vi.fn()}
      />,
    );
    expect(screen.getByText(/No template fields with bindings/)).toBeInTheDocument();
  });

  it('renders one dropdown per unique binding, deduplicating repeated bindings', () => {
    render(
      <ColumnMappingComponent
        headers={headers}
        elements={elements}
        mapping={{}}
        onMappingChange={vi.fn()}
        onGenerate={vi.fn()}
        onUploadDifferent={vi.fn()}
      />,
    );
    // ColumnMapping doesn't link InputLabel<->Select via labelId/id (flagged separately),
    // so the accessible name isn't queryable — assert dedup via combobox count instead:
    // 3 bound elements (name, photo, name-again) collapse to 2 unique dropdowns.
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });

  it('disables Generate Cards until at least one field is mapped', () => {
    const { rerender } = render(
      <ColumnMappingComponent
        headers={headers}
        elements={elements}
        mapping={{}}
        onMappingChange={vi.fn()}
        onGenerate={vi.fn()}
        onUploadDifferent={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Generate Cards' })).toBeDisabled();

    rerender(
      <ColumnMappingComponent
        headers={headers}
        elements={elements}
        mapping={{ name: 'Full Name' }}
        onMappingChange={vi.fn()}
        onGenerate={vi.fn()}
        onUploadDifferent={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Generate Cards' })).toBeEnabled();
  });

  it('calls onGenerate when Generate Cards is clicked', async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    render(
      <ColumnMappingComponent
        headers={headers}
        elements={elements}
        mapping={{ name: 'Full Name' }}
        onMappingChange={vi.fn()}
        onGenerate={onGenerate}
        onUploadDifferent={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Generate Cards' }));
    expect(onGenerate).toHaveBeenCalled();
  });

  it('calls onUploadDifferent when its button is clicked', async () => {
    const user = userEvent.setup();
    const onUploadDifferent = vi.fn();
    render(
      <ColumnMappingComponent
        headers={headers}
        elements={elements}
        mapping={{}}
        onMappingChange={vi.fn()}
        onGenerate={vi.fn()}
        onUploadDifferent={onUploadDifferent}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Upload Different File' }));
    expect(onUploadDifferent).toHaveBeenCalled();
  });

  it('calls onMappingChange with the merged mapping when a column is selected', async () => {
    const user = userEvent.setup();
    const onMappingChange = vi.fn();
    render(
      <ColumnMappingComponent
        headers={headers}
        elements={elements}
        mapping={{ photo: 'Photo URL' }}
        onMappingChange={onMappingChange}
        onGenerate={vi.fn()}
        onUploadDifferent={vi.fn()}
      />,
    );
    // uniqueBindings preserves first-seen element order: 'name' (from e1) before 'photo' (from e2).
    await user.click(screen.getAllByRole('combobox')[0]);
    await user.click(await screen.findByRole('option', { name: 'Full Name' }));
    expect(onMappingChange).toHaveBeenCalledWith({ photo: 'Photo URL', name: 'Full Name' });
  });
});
