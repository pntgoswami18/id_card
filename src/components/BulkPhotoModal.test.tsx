import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BulkPhotoModal from './BulkPhotoModal';

const photos = [
  { name: 'charlie.png', dataUrl: 'data:image/png;base64,c' },
  { name: 'alice.png', dataUrl: 'data:image/png;base64,a' },
  { name: 'bob.png', dataUrl: 'data:image/png;base64,b' },
];

function names() {
  return screen.getAllByRole('listitem').map((li) => li.textContent?.match(/^([\w.]+\.png)/)?.[1]);
}

describe('BulkPhotoModal', () => {
  it('renders the photo count and every photo name', () => {
    render(<BulkPhotoModal photos={photos} recordCount={5} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('3 photos found')).toBeInTheDocument();
    expect(screen.getByText('charlie.png')).toBeInTheDocument();
    expect(screen.getByText('alice.png')).toBeInTheDocument();
    expect(screen.getByText('bob.png')).toBeInTheDocument();
  });

  it('uses singular "photo" wording for exactly one photo', () => {
    render(<BulkPhotoModal photos={[photos[0]]} recordCount={1} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('1 photo found')).toBeInTheDocument();
  });

  it('sorts A -> Z when the A → Z toggle is clicked', async () => {
    // sortDir defaults to 'asc' without actually applying a sort on mount, and MUI's
    // exclusive ToggleButtonGroup doesn't fire onChange for re-clicking the already-
    // selected button — so go via Z→A first to force a real onChange, then back to A→Z.
    const user = userEvent.setup();
    render(<BulkPhotoModal photos={photos} recordCount={5} onConfirm={vi.fn()} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Z → A' }));
    await user.click(screen.getByRole('button', { name: 'A → Z' }));
    expect(names()).toEqual(['alice.png', 'bob.png', 'charlie.png']);
  });

  it('sorts Z -> A when the Z → A toggle is clicked', async () => {
    const user = userEvent.setup();
    render(<BulkPhotoModal photos={photos} recordCount={5} onConfirm={vi.fn()} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Z → A' }));
    expect(names()).toEqual(['charlie.png', 'bob.png', 'alice.png']);
  });

  it('dragging an item to a new position reorders the list and deselects the sort toggle', () => {
    render(<BulkPhotoModal photos={photos} recordCount={5} onConfirm={vi.fn()} onClose={vi.fn()} />);
    const items = screen.getAllByRole('listitem');
    // Drag the first item (charlie) onto the last position (bob, index 2).
    fireEvent.dragStart(items[0]);
    fireEvent.dragOver(items[2]);
    fireEvent.drop(items[2]);

    expect(names()).toEqual(['alice.png', 'bob.png', 'charlie.png']);
    expect(screen.getByRole('button', { name: 'A → Z' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Z → A' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('dropping onto the same index it started at is a no-op', () => {
    render(<BulkPhotoModal photos={photos} recordCount={5} onConfirm={vi.fn()} onClose={vi.fn()} />);
    const items = screen.getAllByRole('listitem');
    fireEvent.dragStart(items[1]);
    fireEvent.dragOver(items[1]);
    fireEvent.drop(items[1]);
    expect(names()).toEqual(['charlie.png', 'alice.png', 'bob.png']);
  });

  it('removing a photo drops it from the list and updates the assignment count', async () => {
    const user = userEvent.setup();
    render(<BulkPhotoModal photos={photos} recordCount={5} onConfirm={vi.fn()} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Remove alice.png' }));
    expect(screen.queryByText('alice.png')).not.toBeInTheDocument();
    expect(screen.getByText('2 photos found')).toBeInTheDocument();
    expect(screen.getByText(/Will assign to 2 of 5 cards/)).toBeInTheDocument();
  });

  it('notes unused photos when there are more photos than records', () => {
    render(<BulkPhotoModal photos={photos} recordCount={2} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/Will assign to 2 of 2 cards \(1 photo will be unused\)/)).toBeInTheDocument();
  });

  it('disables Confirm once every photo has been removed', async () => {
    const user = userEvent.setup();
    render(<BulkPhotoModal photos={[photos[0]]} recordCount={5} onConfirm={vi.fn()} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Remove charlie.png' }));
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });

  it('Confirm calls onConfirm with the current order', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<BulkPhotoModal photos={photos} recordCount={5} onConfirm={onConfirm} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Z → A' }));
    await user.click(screen.getByRole('button', { name: 'A → Z' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith([photos[1], photos[2], photos[0]]); // alice, bob, charlie
  });

  it('Cancel calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<BulkPhotoModal photos={photos} recordCount={5} onConfirm={vi.fn()} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('reselecting a folder replaces the list, sorted A -> Z, filtering out non-image files', async () => {
    const user = userEvent.setup();
    render(<BulkPhotoModal photos={photos} recordCount={5} onConfirm={vi.fn()} onClose={vi.fn()} />);

    const newFiles = [
      new File(['x'], 'zeta.png', { type: 'image/png' }),
      new File(['x'], 'yankee.png', { type: 'image/png' }),
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
    ];
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, newFiles);

    expect(await screen.findByText('yankee.png')).toBeInTheDocument();
    expect(screen.getByText('zeta.png')).toBeInTheDocument();
    expect(screen.queryByText('charlie.png')).not.toBeInTheDocument();
    expect(names()).toEqual(['yankee.png', 'zeta.png']);
  });
});
