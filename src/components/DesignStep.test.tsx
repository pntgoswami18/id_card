import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DesignStep from './DesignStep';
import { renderWithAppState } from '../testUtils';
import { useAppState } from '../store/AppStateContext';
import { clearAllStores } from '../utils/testHelpers';
import { saveUserTemplate, loadUserTemplates } from '../utils/userTemplates';
import type { Template } from '../types';

// Save/Save-As-Template also calls saveTemplateWithPicker to export a .idtemplate file.
// jsdom has no FSA support and no real navigation, so the unmocked `<a download>` fallback
// logs a "Not implemented: navigation" error — mock it out since the file-export path itself
// is covered by workspaceFile.test.ts.
vi.mock('../utils/workspaceFile', async () => {
  const actual = await vi.importActual<typeof import('../utils/workspaceFile')>('../utils/workspaceFile');
  return { ...actual, saveTemplateWithPicker: vi.fn().mockResolvedValue(undefined) };
});

function StateProbe() {
  const { activeStep, template, printSettings, currentTemplateSource } = useAppState();
  return (
    <div
      data-testid="probe"
      data-active-step={activeStep}
      data-element-count={template.elements.length}
      data-template-id={template.id}
      data-template-name={template.name}
      data-orientation={printSettings.orientation}
      data-template-source={JSON.stringify(currentTemplateSource)}
    />
  );
}

function renderDesignStep(initialState?: Parameters<typeof renderWithAppState>[1]) {
  return renderWithAppState(<><DesignStep /><StateProbe /></>, initialState);
}

function probe() {
  return screen.getByTestId('probe');
}

function template(overrides: Partial<Template> = {}): Template {
  return { id: 'blank', name: 'Blank', elements: [], background: null, watermark: null, ...overrides };
}

beforeEach(async () => {
  await clearAllStores();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('DesignStep — adding elements', () => {
  it('Add Text adds and selects a text element', async () => {
    const user = userEvent.setup();
    renderDesignStep({ initialState: { template: template() } });
    await user.click(await screen.findByRole('button', { name: 'Add Text' }));
    await waitFor(() => expect(probe()).toHaveAttribute('data-element-count', '1'));
    expect(await screen.findByText('Text element')).toBeInTheDocument();
  });

  it('Add Image adds and selects an image element', async () => {
    const user = userEvent.setup();
    renderDesignStep({ initialState: { template: template() } });
    await user.click(await screen.findByRole('button', { name: 'Add Image' }));
    await waitFor(() => expect(probe()).toHaveAttribute('data-element-count', '1'));
    expect(await screen.findByText('Image element')).toBeInTheDocument();
  });

  it('Add Label adds and selects a label element', async () => {
    const user = userEvent.setup();
    renderDesignStep({ initialState: { template: template() } });
    await user.click(await screen.findByRole('button', { name: 'Add Label' }));
    await waitFor(() => expect(probe()).toHaveAttribute('data-element-count', '1'));
    expect(await screen.findByText('Label element')).toBeInTheDocument();
  });
});

describe('DesignStep — element selection and deletion', () => {
  it('clicking (mousedown) an element on the canvas selects it', async () => {
    renderDesignStep({ initialState: { template: template() } });
    fireEvent.click(await screen.findByRole('button', { name: 'Add Text' }));
    await waitFor(() => expect(probe()).toHaveAttribute('data-element-count', '1'));
    expect(await screen.findByText('Text element')).toBeInTheDocument();

    // Add Label switches selection away from Text (Add* auto-selects the new element),
    // so the properties panel now shows Label instead of Text.
    fireEvent.click(screen.getByRole('button', { name: 'Add Label' }));
    await waitFor(() => expect(probe()).toHaveAttribute('data-element-count', '2'));
    expect(await screen.findByText('Label element')).toBeInTheDocument();
    expect(screen.queryByText('Text element')).not.toBeInTheDocument();

    // Mousedown on the canvas Text element should re-select it, proving the click-to-select
    // path (not just Add*'s auto-select) actually drives selection.
    // Exact name 'Text' (the canvas element's own rendered content) distinguishes it from 'Add Text'.
    const canvasElement = screen.getByRole('button', { name: 'Text' });
    fireEvent.mouseDown(canvasElement);
    expect(await screen.findByText('Text element')).toBeInTheDocument();
    expect(screen.queryByText('Label element')).not.toBeInTheDocument();
  });

  it('Delete Element removes the selected element', async () => {
    const user = userEvent.setup();
    renderDesignStep({ initialState: { template: template() } });
    await user.click(await screen.findByRole('button', { name: 'Add Text' }));
    await waitFor(() => expect(probe()).toHaveAttribute('data-element-count', '1'));

    await user.click(await screen.findByRole('button', { name: 'Delete Element' }));
    await waitFor(() => expect(probe()).toHaveAttribute('data-element-count', '0'));
    expect(screen.getByText('Select an element to edit, or drag to select multiple')).toBeInTheDocument();
  });
});

describe('DesignStep — orientation', () => {
  it('changing orientation dispatches the new value', async () => {
    const user = userEvent.setup();
    const { container } = renderDesignStep({ initialState: { template: template(), printSettings: { widthMm: 85.6, heightMm: 53.98, orientation: 'landscape' } } });
    await waitFor(() => expect(probe()).toHaveAttribute('data-orientation', 'landscape'));

    await user.click(container.querySelector('[aria-haspopup="listbox"]')!);
    await user.click(await screen.findByRole('option', { name: 'Portrait' }));
    await waitFor(() => expect(probe()).toHaveAttribute('data-orientation', 'portrait'));
  });
});

describe('DesignStep — background/watermark panel', () => {
  it('toggles between the element properties panel and the background/watermark panel', async () => {
    const user = userEvent.setup();
    renderDesignStep({ initialState: { template: template() } });
    expect(await screen.findByText('Select an element to edit, or drag to select multiple')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Background / Watermark' }));
    expect(await screen.findByRole('tab', { name: 'Background' })).toBeInTheDocument();
    expect(screen.queryByText('Select an element to edit, or drag to select multiple')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Background / Watermark' }));
    expect(await screen.findByText('Select an element to edit, or drag to select multiple')).toBeInTheDocument();
  });
});

describe('DesignStep — copy/paste elements', () => {
  it('Ctrl+C then Ctrl+V duplicates the selected element with an offset', async () => {
    const user = userEvent.setup();
    renderDesignStep({ initialState: { template: template() } });
    await user.click(await screen.findByRole('button', { name: 'Add Text' }));
    await waitFor(() => expect(probe()).toHaveAttribute('data-element-count', '1'));

    fireEvent.keyDown(document, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(document, { key: 'v', ctrlKey: true });

    await waitFor(() => expect(probe()).toHaveAttribute('data-element-count', '2'));
  });
});

describe('DesignStep — templateLinkedToParent chip', () => {
  it('shows the linked-template chip when templateLinkedToParent is true', async () => {
    renderDesignStep({ initialState: { template: template(), templateLinkedToParent: true } });
    expect(await screen.findByText('Linked to parent template')).toBeInTheDocument();
  });

  it('hides the chip when not linked', async () => {
    renderDesignStep({ initialState: { template: template(), templateLinkedToParent: false } });
    await waitFor(() => expect(probe()).toBeInTheDocument());
    expect(screen.queryByText('Linked to parent template')).not.toBeInTheDocument();
  });
});

describe('DesignStep — save template flow', () => {
  it('hides "Save" (overwrite) in the menu when there is no current user template source', async () => {
    const user = userEvent.setup();
    renderDesignStep({ initialState: { template: template(), currentTemplateSource: null } });
    await user.click(await screen.findByRole('button', { name: 'Save Template Options' }));
    expect(screen.queryByRole('menuitem', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Save As Template' })).toBeInTheDocument();
  });

  it('shows "Save" in the menu when the current template source is a saved user template', async () => {
    const user = userEvent.setup();
    renderDesignStep({
      initialState: { template: template(), currentTemplateSource: { type: 'user', id: 'user-1' } },
    });
    await user.click(await screen.findByRole('button', { name: 'Save Template Options' }));
    expect(screen.getByRole('menuitem', { name: 'Save' })).toBeInTheDocument();
  });

  it('"Save As Template" saves under the typed name and updates the template source', async () => {
    const user = userEvent.setup();
    renderDesignStep({ initialState: { template: template() } });
    await user.click(await screen.findByRole('button', { name: 'Save Template Options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Save As Template' }));

    const nameField = await screen.findByLabelText('Template Name');
    await user.type(nameField, 'My New Template');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(probe()).toHaveAttribute('data-template-name', 'My New Template'));
    const saved = await loadUserTemplates();
    expect(saved.some((t) => t.meta.name === 'My New Template')).toBe(true);
  });

  it('defaults to "My Template" when Save As Template is submitted with a blank name', async () => {
    const user = userEvent.setup();
    renderDesignStep({ initialState: { template: template() } });
    await user.click(await screen.findByRole('button', { name: 'Save Template Options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Save As Template' }));
    await user.click(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(probe()).toHaveAttribute('data-template-name', 'My Template'));
  });
});

describe('DesignStep — template picker integration', () => {
  it('selecting a saved template from the picker applies it', async () => {
    const user = userEvent.setup();
    await saveUserTemplate({ id: 'user-2', name: 'Employee Badge', elements: [], background: null, watermark: null });
    renderDesignStep({ initialState: { template: template() } });

    await user.click(await screen.findByRole('button', { name: 'Start From Template' }));
    await user.click(await screen.findByText('Employee Badge'));

    await waitFor(() => expect(probe()).toHaveAttribute('data-template-source', JSON.stringify({ type: 'user', id: 'user-2' })));
  });
});

describe('DesignStep — Continue to Data', () => {
  it('dispatches SET_ACTIVE_STEP to 1', async () => {
    const user = userEvent.setup();
    renderDesignStep({ initialState: { template: template() } });
    await user.click(screen.getByRole('button', { name: 'Continue to Data step' }));
    await waitFor(() => expect(probe()).toHaveAttribute('data-active-step', '1'));
  });
});
