import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PreviewStep from './PreviewStep';
import { renderWithAppState } from '../testUtils';
import { useAppState } from '../store/AppStateContext';
import { clearAllStores } from '../utils/testHelpers';
import type { CardRecord, Template } from '../types';

function StateProbe() {
  const { activeStep, records, selectedCardIndices } = useAppState();
  return (
    <div
      data-testid="probe"
      data-active-step={activeStep}
      data-selected={JSON.stringify(selectedCardIndices)}
      data-overrides={JSON.stringify(records.map((r) => r.overrides))}
    />
  );
}

function renderPreviewStep(initialState?: Parameters<typeof renderWithAppState>[1]) {
  return renderWithAppState(<><PreviewStep /><StateProbe /></>, initialState);
}

function probe() {
  return screen.getByTestId('probe');
}

function templateWithFields(withImage = true): Template {
  return {
    id: 't1', name: 'T', background: null, watermark: null,
    elements: [
      { id: 'e1', type: 'text', x: 0, y: 0, width: 50, height: 20, binding: 'name' },
      ...(withImage ? [{ id: 'e2', type: 'image' as const, x: 0, y: 0, width: 50, height: 20, binding: 'photo' }] : []),
    ],
  };
}

function records(names: string[]): CardRecord[] {
  return names.map((name, i) => ({ id: `r${i}`, data: { name }, overrides: {} }));
}

const printSettings = { widthMm: 85.6, heightMm: 53.98, orientation: 'landscape' as const };

beforeEach(async () => {
  await clearAllStores();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('PreviewStep — empty state', () => {
  it('shows a fallback message when there are no records', async () => {
    renderPreviewStep({ initialState: { template: templateWithFields(), records: [] } });
    expect(await screen.findByText('No cards to preview. Upload CSV in the Data step and generate cards.')).toBeInTheDocument();
  });
});

describe('PreviewStep — pagination summary', () => {
  it('shows the total card count with no search active', async () => {
    renderPreviewStep({ initialState: { template: templateWithFields(), records: records(['Alice', 'Bob']), printSettings } });
    expect(await screen.findByText(/Page 1 of 1 \(2 total\)/)).toBeInTheDocument();
  });

  it('shows a page control once results exceed one page', async () => {
    const many = records(Array.from({ length: 30 }, (_, i) => `Person ${i}`));
    renderPreviewStep({ initialState: { template: templateWithFields(), records: many, printSettings } });
    expect(await screen.findByText(/Page 1 of 2/)).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});

describe('PreviewStep — search', () => {
  it('filters cards by name and shows the search banner', async () => {
    const user = userEvent.setup();
    renderPreviewStep({ initialState: { template: templateWithFields(), records: records(['Alice', 'Bob', 'Charlie']), printSettings } });
    await user.type(screen.getByLabelText('Search cards'), 'ali');

    await waitFor(() => expect(screen.getByText(/Showing 1 of 3 cards matching "ali"/)).toBeInTheDocument(), { timeout: 2000 });
  });

  it('shows a no-match message for a query with no results', async () => {
    const user = userEvent.setup();
    renderPreviewStep({ initialState: { template: templateWithFields(), records: records(['Alice']), printSettings } });
    await user.type(screen.getByLabelText('Search cards'), 'zzz');
    await waitFor(() => expect(screen.getByText(/No cards match "zzz"/)).toBeInTheDocument(), { timeout: 2000 });
  });

  it('Clear resets the search query', async () => {
    const user = userEvent.setup();
    renderPreviewStep({ initialState: { template: templateWithFields(), records: records(['Alice', 'Bob']), printSettings } });
    await user.type(screen.getByLabelText('Search cards'), 'ali');
    await waitFor(() => expect(screen.getByText(/matching "ali"/)).toBeInTheDocument(), { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(screen.queryByText(/matching/)).not.toBeInTheDocument());
    expect(screen.getByLabelText('Search cards')).toHaveValue('');
  });
});

describe('PreviewStep — selection', () => {
  it('Select All selects every record', async () => {
    const user = userEvent.setup();
    renderPreviewStep({ initialState: { template: templateWithFields(), records: records(['Alice', 'Bob']), printSettings } });
    await user.click(await screen.findByRole('button', { name: 'Select All' }));
    await waitFor(() => expect(probe()).toHaveAttribute('data-selected', '[0,1]'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('Deselect All clears selection', async () => {
    const user = userEvent.setup();
    renderPreviewStep({
      initialState: { template: templateWithFields(), records: records(['Alice', 'Bob']), printSettings, selectedCardIndices: [0, 1] },
    });
    await user.click(await screen.findByRole('button', { name: 'Deselect All' }));
    await waitFor(() => expect(probe()).toHaveAttribute('data-selected', '[]'));
  });

  it('"Select Matching" appears while a search is active and only selects filtered records', async () => {
    const user = userEvent.setup();
    renderPreviewStep({ initialState: { template: templateWithFields(), records: records(['Alice', 'Bob', 'Charlie']), printSettings } });
    await user.type(screen.getByLabelText('Search cards'), 'a');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Select Matching' })).toBeInTheDocument(), { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: 'Select Matching' }));
    // "a" matches Alice (0) and Charlie (2), not Bob (1).
    await waitFor(() => expect(probe()).toHaveAttribute('data-selected', '[0,2]'));
  });

  it('Print button label reflects selection state and dispatches SET_ACTIVE_STEP', async () => {
    const user = userEvent.setup();
    renderPreviewStep({ initialState: { template: templateWithFields(), records: records(['Alice']), printSettings } });
    expect(await screen.findByRole('button', { name: 'Print All' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Print All' }));
    await waitFor(() => expect(probe()).toHaveAttribute('data-active-step', '3'));
  });
});

describe('PreviewStep — cards per page', () => {
  it('changing rows-per-page resets to page 1 and updates the summary', async () => {
    const user = userEvent.setup();
    const many = records(Array.from({ length: 30 }, (_, i) => `Person ${i}`));
    const { container } = renderPreviewStep({ initialState: { template: templateWithFields(), records: many, printSettings } });
    await screen.findByText(/Page 1 of 2/);

    await user.click(container.querySelector('[aria-haspopup="listbox"]')!);
    await user.click(await screen.findByRole('option', { name: '48' }));
    expect(await screen.findByText(/Page 1 of 1/)).toBeInTheDocument();
  });
});

describe('PreviewStep — bulk photos', () => {
  it('hides "Bulk add photos" when the template has no image binding', async () => {
    renderPreviewStep({ initialState: { template: templateWithFields(false), records: records(['Alice']), printSettings } });
    await screen.findByText('0 selected');
    expect(screen.queryByRole('button', { name: 'Bulk add photos' })).not.toBeInTheDocument();
  });

  it('shows "Bulk add photos" and opens the modal once photos are picked', async () => {
    renderPreviewStep({ initialState: { template: templateWithFields(), records: records(['Alice', 'Bob']), printSettings } });
    const bulkButton = await screen.findByRole('button', { name: 'Bulk add photos' });
    expect(bulkButton).toBeInTheDocument();

    const files = [
      new File(['x'], 'alice.png', { type: 'image/png' }),
      new File(['x'], 'bob.png', { type: 'image/png' }),
    ];
    const input = document.querySelector('input[webkitdirectory]') as HTMLInputElement;
    // userEvent.upload doesn't reliably drive a webkitdirectory input's multi-file
    // FileList in jsdom; set files + fire change directly, as with other filtered inputs.
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    fireEvent.change(input);

    expect(await screen.findByText('2 photos found')).toBeInTheDocument();
  });

  it('confirming bulk photos assigns them to records in order', async () => {
    const user = userEvent.setup();
    renderPreviewStep({ initialState: { template: templateWithFields(), records: records(['Alice', 'Bob']), printSettings } });
    await screen.findByRole('button', { name: 'Bulk add photos' });

    const files = [new File(['x'], 'alice.png', { type: 'image/png' }), new File(['x'], 'bob.png', { type: 'image/png' })];
    const input = document.querySelector('input[webkitdirectory]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    fireEvent.change(input);
    await screen.findByText('2 photos found');

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      const overrides = JSON.parse(probe().getAttribute('data-overrides')!);
      expect(overrides[0].photo).toMatch(/^data:image\/png;base64,/);
      expect(overrides[1].photo).toMatch(/^data:image\/png;base64,/);
    });
  });
});

describe('PreviewStep — card edit + photo capture flow', () => {
  it('clicking a card opens the edit dialog and Save dispatches overrides', async () => {
    const user = userEvent.setup();
    renderPreviewStep({ initialState: { template: templateWithFields(), records: records(['Alice']), printSettings } });
    await user.click((await screen.findByRole('checkbox')).closest('[class*="MuiBox-root"]')!.parentElement!);
    expect(await screen.findByText('Edit Card')).toBeInTheDocument();
    expect(screen.getByText('(no photo)')).toBeInTheDocument();

    const nameField = screen.getByLabelText('name');
    await user.clear(nameField);
    await user.type(nameField, 'Alicia');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const overrides = JSON.parse(probe().getAttribute('data-overrides')!);
      expect(overrides[0].name).toBe('Alicia');
    });
  });

  it('Take Photo -> capture -> crop -> confirm assigns the cropped photo to the edited record', async () => {
    const user = userEvent.setup();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia }, platform: 'Test' });

    renderPreviewStep({ initialState: { template: templateWithFields(), records: records(['Alice']), printSettings } });
    await user.click((await screen.findByRole('checkbox')).closest('[class*="MuiBox-root"]')!.parentElement!);
    await screen.findByText('Edit Card');

    await user.click(screen.getByRole('button', { name: 'Take Photo' }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    // Simulate the capture button — WebcamCapture needs a working canvas context to produce a dataUrl.
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,captured');
    await user.click(screen.getByRole('button', { name: 'Capture' }));

    expect(await screen.findByText('Crop Photo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use Photo' }));

    await waitFor(() => {
      const overrides = JSON.parse(probe().getAttribute('data-overrides')!);
      expect(overrides[0].photo).toMatch(/^data:image\/jpeg;base64,/);
    });
    expect(screen.queryByText('Crop Photo')).not.toBeInTheDocument();

    getContext.mockRestore();
    toDataURL.mockRestore();
    vi.unstubAllGlobals();
  });
});
