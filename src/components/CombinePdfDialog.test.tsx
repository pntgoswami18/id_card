import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JSZip from 'jszip';
import CombinePdfDialog from './CombinePdfDialog';
import { clearAllStores } from '../utils/testHelpers';
import { createWorkspace, saveWorkspaceData, getDefaultWorkspaceData } from '../utils/workspaceStorage';
import type { CardRecord } from '../types';

vi.mock('../utils/exportImages', () => ({
  renderCardsToImages: vi.fn(),
}));
vi.mock('../utils/aggregatePdf', () => ({
  aggregateCardsToPdf: vi.fn().mockResolvedValue(undefined),
}));

const defaultPaper = {
  paperWidthMm: 210, paperHeightMm: 297, paperOrientation: 'auto' as const, pageMarginMm: 5, cardGapMm: 0,
};

function records(n: number): CardRecord[] {
  return Array.from({ length: n }, (_, i) => ({ id: `r${i}`, data: {}, overrides: {} }));
}

async function seedWorkspaceWithCards(name: string, cardCount: number) {
  const meta = await createWorkspace(name);
  await saveWorkspaceData(meta.id, { ...getDefaultWorkspaceData(), records: records(cardCount) });
  return meta;
}

beforeEach(async () => {
  await clearAllStores();
  const { renderCardsToImages } = await import('../utils/exportImages');
  vi.mocked(renderCardsToImages).mockResolvedValue({
    cards: [{ recordIndex: 0, dataUrl: 'data:image/jpeg;base64,x', blob: new Blob() }],
    errors: [],
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('CombinePdfDialog — workspaces tab', () => {
  it('shows "No workspaces found." when there are none', async () => {
    render(<CombinePdfDialog open onClose={vi.fn()} defaultPaper={defaultPaper} />);
    expect(await screen.findByText('No workspaces found.')).toBeInTheDocument();
  });

  it('lists workspaces and enables Generate PDF once one is selected', async () => {
    const user = userEvent.setup();
    await seedWorkspaceWithCards('Employee Badges', 3);
    render(<CombinePdfDialog open onClose={vi.fn()} defaultPaper={defaultPaper} />);

    const checkbox = await screen.findByRole('checkbox', { name: 'Employee Badges' });
    expect(screen.getByRole('button', { name: 'Generate PDF' })).toBeDisabled();
    await user.click(checkbox);
    expect(screen.getByRole('button', { name: 'Generate PDF' })).toBeEnabled();
  });

  it('generates a PDF from the selected workspace and closes on success', async () => {
    const user = userEvent.setup();
    const { aggregateCardsToPdf } = await import('../utils/aggregatePdf');
    const onClose = vi.fn();
    await seedWorkspaceWithCards('Badges', 2);
    render(<CombinePdfDialog open onClose={onClose} defaultPaper={defaultPaper} />);

    await user.click(await screen.findByRole('checkbox', { name: 'Badges' }));
    await user.click(screen.getByRole('button', { name: 'Generate PDF' }));

    await waitFor(() => expect(aggregateCardsToPdf).toHaveBeenCalled());
    const [cards, options] = vi.mocked(aggregateCardsToPdf).mock.calls[0];
    // The mocked renderCardsToImages always resolves one rendered card regardless of record count.
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ dataUrl: 'data:image/jpeg;base64,x' });
    expect(options).toMatchObject({ paperWidthMm: defaultPaper.paperWidthMm, paperHeightMm: defaultPaper.paperHeightMm });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an error when the selected workspace has no cards', async () => {
    const user = userEvent.setup();
    await seedWorkspaceWithCards('Empty Workspace', 0);
    render(<CombinePdfDialog open onClose={vi.fn()} defaultPaper={defaultPaper} />);

    await user.click(await screen.findByRole('checkbox', { name: 'Empty Workspace' }));
    await user.click(screen.getByRole('button', { name: 'Generate PDF' }));

    expect(await screen.findByText('Selected workspaces have no cards to combine.')).toBeInTheDocument();
  });
});

describe('CombinePdfDialog — images tab', () => {
  it('enables Generate PDF once an image is imported', async () => {
    const user = userEvent.setup();
    render(<CombinePdfDialog open onClose={vi.fn()} defaultPaper={defaultPaper} />);
    await user.click(screen.getByRole('tab', { name: 'From exported images' }));
    expect(screen.getByRole('button', { name: 'Generate PDF' })).toBeDisabled();

    const file = new File(['x'], 'card.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    // A loose image has no manifest size, so the summary also appends "· N need a size".
    expect(await screen.findByText(/^1 image imported/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate PDF' })).toBeEnabled();
  });

  it('shows manual size fields for an image with no manifest size', async () => {
    const user = userEvent.setup();
    render(<CombinePdfDialog open onClose={vi.fn()} defaultPaper={defaultPaper} />);
    await user.click(screen.getByRole('tab', { name: 'From exported images' }));

    const file = new File(['x'], 'card.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(await screen.findByLabelText('Card width (mm)')).toBeInTheDocument();
    expect(screen.getByLabelText('Card height (mm)')).toBeInTheDocument();
  });

  it('recovers sized cards from a ZIP with a manifest, without showing manual size fields', async () => {
    const user = userEvent.setup();
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      version: 1, workspaceName: 'W', cardWidthMm: 85.6, cardHeightMm: 53.98, format: 'png', count: 1,
    }));
    zip.file('card-001.png', 'fake-bytes');
    const blob = await zip.generateAsync({ type: 'blob' });
    const zipFile = new File([blob], 'export.zip', { type: 'application/zip' });

    render(<CombinePdfDialog open onClose={vi.fn()} defaultPaper={defaultPaper} />);
    await user.click(screen.getByRole('tab', { name: 'From exported images' }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, zipFile);

    expect(await screen.findByText('1 image imported')).toBeInTheDocument();
    expect(screen.queryByLabelText('Card width (mm)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate PDF' })).toBeEnabled();
  });
});

describe('CombinePdfDialog — paper size', () => {
  it('detects the preset matching defaultPaper', async () => {
    render(<CombinePdfDialog open onClose={vi.fn()} defaultPaper={{ ...defaultPaper, paperWidthMm: 297, paperHeightMm: 420 }} />);
    expect(await screen.findByText('A3 (297 × 420 mm)')).toBeInTheDocument();
  });

  it('falls back to Custom when defaultPaper matches no preset, and disables Generate for an invalid size', async () => {
    await seedWorkspaceWithCards('W', 1);
    const user = userEvent.setup();
    render(<CombinePdfDialog open onClose={vi.fn()} defaultPaper={{ ...defaultPaper, paperWidthMm: 123, paperHeightMm: 456 }} />);
    expect(await screen.findByLabelText('Paper width (mm)')).toHaveValue(123);

    await user.click(await screen.findByRole('checkbox', { name: 'W' }));
    expect(screen.getByRole('button', { name: 'Generate PDF' })).toBeEnabled();

    const widthField = screen.getByLabelText('Paper width (mm)');
    await user.clear(widthField);
    await user.type(widthField, '0');
    expect(screen.getByRole('button', { name: 'Generate PDF' })).toBeDisabled();
  });
});

describe('CombinePdfDialog — dialog chrome', () => {
  it('Cancel calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CombinePdfDialog open onClose={onClose} defaultPaper={defaultPaper} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('resets workspace selection when reopened', async () => {
    const user = userEvent.setup();
    await seedWorkspaceWithCards('Badges', 1);
    const { rerender } = render(<CombinePdfDialog open={false} onClose={vi.fn()} defaultPaper={defaultPaper} />);
    rerender(<CombinePdfDialog open onClose={vi.fn()} defaultPaper={defaultPaper} />);

    const checkbox = await screen.findByRole('checkbox', { name: 'Badges' });
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    rerender(<CombinePdfDialog open={false} onClose={vi.fn()} defaultPaper={defaultPaper} />);
    rerender(<CombinePdfDialog open onClose={vi.fn()} defaultPaper={defaultPaper} />);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Badges' })).not.toBeChecked());
  });
});
