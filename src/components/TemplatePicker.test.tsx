import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemplatePicker from './TemplatePicker';
import { clearAllStores } from '../utils/testHelpers';
import { saveUserTemplate } from '../utils/userTemplates';
import type { Template } from '../types';

function template(id: string, name: string): Template {
  return { id, name, elements: [], background: null, watermark: null };
}

beforeEach(async () => {
  await clearAllStores();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('TemplatePicker', () => {
  it('renders nothing under "My templates" when none are saved', async () => {
    render(<TemplatePicker open onClose={vi.fn()} onSelect={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('My templates')).not.toBeInTheDocument());
  });

  it('loads and lists saved user templates when opened', async () => {
    await saveUserTemplate(template('user-1', 'Employee Badge'));
    render(<TemplatePicker open onClose={vi.fn()} onSelect={vi.fn()} />);
    expect(await screen.findByText('Employee Badge')).toBeInTheDocument();
  });

  it('does not load templates while closed', () => {
    render(<TemplatePicker open={false} onClose={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.queryByText('Start From Template')).not.toBeInTheDocument();
  });

  it('selecting a template resolves it and calls onSelect + onClose', async () => {
    await saveUserTemplate(template('user-1', 'Employee Badge'));
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<TemplatePicker open onClose={onClose} onSelect={onSelect} />);

    const item = await screen.findByText('Employee Badge');
    await userEvent.setup().click(item);

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1', name: 'Employee Badge' }),
      { type: 'user', id: 'user-1' },
    ));
    expect(onClose).toHaveBeenCalled();
  });

  it('deleting a template removes it from the list and calls onAfterDelete', async () => {
    const user = userEvent.setup();
    await saveUserTemplate(template('user-1', 'Employee Badge'));
    const onAfterDelete = vi.fn();
    render(<TemplatePicker open onClose={vi.fn()} onSelect={vi.fn()} onAfterDelete={onAfterDelete} />);

    await screen.findByText('Employee Badge');
    await user.click(screen.getByRole('button', { name: 'Delete Employee Badge' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByText('Employee Badge')).not.toBeInTheDocument());
    expect(onAfterDelete).toHaveBeenCalledWith('user-1');
  });

  it('cancelling the delete confirmation keeps the template', async () => {
    const user = userEvent.setup();
    await saveUserTemplate(template('user-1', 'Employee Badge'));
    render(<TemplatePicker open onClose={vi.fn()} onSelect={vi.fn()} />);

    await screen.findByText('Employee Badge');
    await user.click(screen.getByRole('button', { name: 'Delete Employee Badge' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Employee Badge')).toBeInTheDocument();
  });

  it('importing a valid .idtemplate file saves it under a fresh id and selects it', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<TemplatePicker open onClose={onClose} onSelect={onSelect} />);

    const fileContent = JSON.stringify({
      version: 1, app: 'id_card_generator', type: 'template', savedAt: 'x',
      name: 'Imported', template: template('original-id', 'Imported'),
    });
    const file = new File([fileContent], 'imported.idtemplate', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => expect(onSelect).toHaveBeenCalled());
    const [selectedTemplate, source] = onSelect.mock.calls[0];
    expect(selectedTemplate.id).not.toBe('original-id'); // reassigned to avoid overwriting
    expect(source).toEqual({ type: 'user', id: selectedTemplate.id });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an error dialog for an invalid template file and does not call onSelect', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TemplatePicker open onClose={vi.fn()} onSelect={onSelect} />);

    const file = new File(['not json'], 'bad.idtemplate');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(await screen.findByText('Import Failed')).toBeInTheDocument();
    expect(screen.getByText(/Invalid template file/)).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clicking Close calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TemplatePicker open onClose={onClose} onSelect={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
