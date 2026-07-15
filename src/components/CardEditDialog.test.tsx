import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CardEditDialog from './CardEditDialog';
import type { CardRecord, Template } from '../types';

function template(): Template {
  return { id: 't1', name: 'T', elements: [], background: null, watermark: null };
}

const printSettings = { widthMm: 85.6, heightMm: 53.98, orientation: 'landscape' as const };

function record(overrides: CardRecord['overrides'] = {}, fontSizeOverrides?: Record<string, number>): CardRecord {
  return { id: 'r1', data: { name: 'Alice', photo: null }, overrides, fontSizeOverrides };
}

function baseProps() {
  return {
    open: true,
    onClose: vi.fn(),
    record: record(),
    bindings: [{ elementId: 'e1', binding: 'name' }, { elementId: 'e2', binding: 'photo', isImage: true }],
    onSave: vi.fn(),
    onTakePhoto: vi.fn(),
    onPhotoReady: vi.fn(),
    photoDisplayNames: {},
    template: template(),
    printSettings,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CardEditDialog', () => {
  it('renders nothing when record is null', () => {
    const { container } = render(<CardEditDialog {...baseProps()} record={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('seeds text field values from record.data, falling back through overrides first', async () => {
    render(<CardEditDialog {...baseProps()} record={record({ name: 'Override Name' })} />);
    expect(await screen.findByLabelText('name')).toHaveValue('Override Name');
  });

  it('shows "(no photo)" for an image binding with no photo yet', async () => {
    render(<CardEditDialog {...baseProps()} />);
    expect(await screen.findByText('(no photo)')).toBeInTheDocument();
  });

  it('shows the photo display name when an image binding has a data URL', async () => {
    render(<CardEditDialog {...baseProps()}
      record={record({ photo: 'data:image/png;base64,xyz' })}
      photoDisplayNames={{ photo: 'headshot.png' }}
    />);
    expect(await screen.findByText('headshot.png')).toBeInTheDocument();
  });

  it('editing a text field updates its value', async () => {
    const user = userEvent.setup();
    render(<CardEditDialog {...baseProps()} />);
    const field = await screen.findByLabelText('name');
    await user.clear(field);
    await user.type(field, 'Bob');
    expect(field).toHaveValue('Bob');
  });

  it('Save calls onSave with the edited overrides and closes the dialog', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<CardEditDialog {...baseProps()} onSave={onSave} onClose={onClose} />);
    const field = await screen.findByLabelText('name');
    await user.clear(field);
    await user.type(field, 'Bob');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith(
      { name: 'Bob', photo: null },
      { name: null, photo: null },
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('Cancel closes without calling onSave', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<CardEditDialog {...baseProps()} onSave={onSave} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  // NOTE: the Size field is a controlled input validated per-keystroke (handleFontSizeChange
  // rejects any value outside [4,144] and the rejection resets the field to its previous
  // value). That means typing "20" digit-by-digit via userEvent.type() never actually reaches
  // "20" — '2' alone is rejected (2<4) and resets to '', then '0' alone is also rejected — a
  // real bug flagged separately (task_328f6b67). fireEvent.change() (a single "paste"-style
  // event, unlike per-keystroke typing) is used here to still exercise the accept/reject logic.
  it('setting a font size within range shows "Reset to auto-fit", and clicking it clears the override', async () => {
    const user = userEvent.setup();
    render(<CardEditDialog {...baseProps()} />);
    const sizeField = await screen.findByLabelText('Size');
    fireEvent.change(sizeField, { target: { value: '20' } });
    expect(await screen.findByText('Reset to auto-fit')).toBeInTheDocument();

    await user.click(screen.getByText('Reset to auto-fit'));
    expect(screen.queryByText('Reset to auto-fit')).not.toBeInTheDocument();
  });

  it('ignores a font size outside the 4-144 range', async () => {
    render(<CardEditDialog {...baseProps()} />);
    const sizeField = await screen.findByLabelText('Size');
    fireEvent.change(sizeField, { target: { value: '999' } });
    // Out-of-range values are rejected by handleFontSizeChange, so no override is set.
    expect(screen.queryByText('Reset to auto-fit')).not.toBeInTheDocument();
  });

  it('Save reports a fixed font size in the fontSizeOverrides payload', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CardEditDialog {...baseProps()} onSave={onSave} />);
    const sizeField = await screen.findByLabelText('Size');
    fireEvent.change(sizeField, { target: { value: '20' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave.mock.calls[0][1]).toMatchObject({ name: 20 });
  });

  it('BUG (task_328f6b67): typing "20" keystroke-by-keystroke into Size never reaches 20', async () => {
    // Documents the real bug: '2' alone is rejected (2<4, resets to ''), then '0' alone is
    // also rejected (0<4) — a user typing normally can never enter this value. This test
    // should start failing (in a good way) once the fix lands; when it does, update it to
    // assert the field DOES show '20' and remove this comment.
    const user = userEvent.setup();
    render(<CardEditDialog {...baseProps()} />);
    const sizeField = await screen.findByLabelText('Size');
    await user.type(sizeField, '20');
    expect(sizeField).not.toHaveValue(20);
  });

  it('Take Photo calls onTakePhoto', async () => {
    const user = userEvent.setup();
    const onTakePhoto = vi.fn();
    render(<CardEditDialog {...baseProps()} onTakePhoto={onTakePhoto} />);
    await user.click(screen.getByRole('button', { name: 'Take Photo' }));
    expect(onTakePhoto).toHaveBeenCalled();
  });

  it('uploading a valid image calls onPhotoReady with a data URL and file name', async () => {
    const user = userEvent.setup();
    const onPhotoReady = vi.fn();
    render(<CardEditDialog {...baseProps()} onPhotoReady={onPhotoReady} />);
    const input = screen.getByText('Upload Photo').querySelector('input')!;
    await user.upload(input, new File(['x'], 'photo.png', { type: 'image/png' }));
    await waitFor(() => expect(onPhotoReady).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/), 'photo.png'));
  });

  it('rejects a non-image upload with an alert and does not call onPhotoReady', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const onPhotoReady = vi.fn();
    render(<CardEditDialog {...baseProps()} onPhotoReady={onPhotoReady} />);
    const input = screen.getByText('Upload Photo').querySelector('input')!;
    // fireEvent-level upload to bypass userEvent's own accept-attribute filtering.
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'doc.txt', { type: 'text/plain' })], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(alertSpy).toHaveBeenCalledWith('Please select an image file.');
    expect(onPhotoReady).not.toHaveBeenCalled();
  });

  it('rejects an image over 10MB with an alert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const onPhotoReady = vi.fn();
    render(<CardEditDialog {...baseProps()} onPhotoReady={onPhotoReady} />);
    const input = screen.getByText('Upload Photo').querySelector('input')!;
    const big = new File(['x'], 'huge.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    Object.defineProperty(input, 'files', { value: [big], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(alertSpy).toHaveBeenCalledWith('Image must be under 10 MB.');
    expect(onPhotoReady).not.toHaveBeenCalled();
  });

  it('resets field values when a different record is passed in', async () => {
    const { rerender } = render(<CardEditDialog {...baseProps()} record={record({ name: 'Alice Value' })} />);
    expect(await screen.findByLabelText('name')).toHaveValue('Alice Value');

    rerender(<CardEditDialog {...baseProps()} record={{ id: 'r2', data: { name: 'Bob' }, overrides: {} }} />);
    await waitFor(() => expect(screen.getByLabelText('name')).toHaveValue('Bob'));
  });
});
