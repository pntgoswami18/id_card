import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BackgroundWatermarkPanel from './BackgroundWatermarkPanel';
import type { WatermarkConfig } from '../types';

function imageFile(name = 'bg.png', sizeBytes = 1024): File {
  const file = new File(['x'.repeat(sizeBytes)], name, { type: 'image/png' });
  return file;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BackgroundWatermarkPanel — tabs', () => {
  it('starts on the Background tab and calls onWatermarkModeEnter only after switching to Watermark', async () => {
    const user = userEvent.setup();
    const onWatermarkModeEnter = vi.fn();
    render(
      <BackgroundWatermarkPanel
        background={null}
        watermark={null}
        onBackgroundChange={vi.fn()}
        onWatermarkChange={vi.fn()}
        onWatermarkModeEnter={onWatermarkModeEnter}
      />,
    );
    expect(onWatermarkModeEnter).not.toHaveBeenCalled();
    await user.click(screen.getByRole('tab', { name: 'Watermark' }));
    expect(onWatermarkModeEnter).toHaveBeenCalled();
  });
});

describe('BackgroundWatermarkPanel — background', () => {
  it('defaults to a solid #f5f5f5 background type when background is null and Solid Color is (re)selected', () => {
    render(
      <BackgroundWatermarkPanel
        background={null}
        watermark={null}
        onBackgroundChange={vi.fn()}
        onWatermarkChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Color')).toHaveValue('#f5f5f5');
  });

  it('changing the solid color calls onBackgroundChange with the new value', () => {
    const onBackgroundChange = vi.fn();
    render(
      <BackgroundWatermarkPanel
        background={{ type: 'solid', value: '#f5f5f5' }}
        watermark={null}
        onBackgroundChange={onBackgroundChange}
        onWatermarkChange={vi.fn()}
      />,
    );
    const colorInput = screen.getByLabelText('Color');
    fireEvent.change(colorInput, { target: { value: '#123456' } });
    expect(onBackgroundChange).toHaveBeenCalledWith({ type: 'solid', value: '#123456' });
  });

  it('switching background type to gradient seeds default gradient colors when background was null', async () => {
    const user = userEvent.setup();
    const onBackgroundChange = vi.fn();
    render(
      <BackgroundWatermarkPanel
        background={null}
        watermark={null}
        onBackgroundChange={onBackgroundChange}
        onWatermarkChange={vi.fn()}
      />,
    );
    await user.click(screen.getAllByRole('combobox')[0]);
    await user.click(await screen.findByRole('option', { name: 'Gradient' }));
    expect(onBackgroundChange).toHaveBeenCalledWith({
      type: 'gradient', value: '#4A90D9', gradientColor2: '#357ABD', gradientDirection: 'to bottom',
    });
  });

  it('clicking Clear Background calls onBackgroundChange(null)', async () => {
    const user = userEvent.setup();
    const onBackgroundChange = vi.fn();
    render(
      <BackgroundWatermarkPanel
        background={{ type: 'solid', value: '#fff' }}
        watermark={null}
        onBackgroundChange={onBackgroundChange}
        onWatermarkChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Clear Background' }));
    expect(onBackgroundChange).toHaveBeenCalledWith(null);
  });

  it('uploading a valid background image calls onBackgroundChange with a data URL and the file name', async () => {
    const user = userEvent.setup();
    const onBackgroundChange = vi.fn();
    render(
      <BackgroundWatermarkPanel
        background={{ type: 'image', value: '' }}
        watermark={null}
        onBackgroundChange={onBackgroundChange}
        onWatermarkChange={vi.fn()}
      />,
    );
    const input = screen.getByText('Upload Image From Device').querySelector('input')!;
    await user.upload(input, imageFile('logo.png'));

    await waitFor(() => expect(onBackgroundChange).toHaveBeenCalledWith(expect.objectContaining({
      type: 'image', imageFileName: 'logo.png',
    })));
    expect(vi.mocked(onBackgroundChange).mock.calls[0][0].value).toMatch(/^data:image\/png;base64,/);
  });

  it('rejects a background image over 2MB with an alert and does not call onBackgroundChange', async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const onBackgroundChange = vi.fn();
    render(
      <BackgroundWatermarkPanel
        background={{ type: 'image', value: '' }}
        watermark={null}
        onBackgroundChange={onBackgroundChange}
        onWatermarkChange={vi.fn()}
      />,
    );
    const input = screen.getByText('Upload Image From Device').querySelector('input')!;
    const big = imageFile('huge.png', 10);
    Object.defineProperty(big, 'size', { value: 3 * 1024 * 1024 });
    await user.upload(input, big);

    expect(alertSpy).toHaveBeenCalledWith('Background image must be under 2 MB.');
    expect(onBackgroundChange).not.toHaveBeenCalled();
  });

  it('editing the Image URL field sets a plain URL value and clears imageFileName', async () => {
    const user = userEvent.setup();
    const onBackgroundChange = vi.fn();
    render(
      <BackgroundWatermarkPanel
        background={{ type: 'image', value: '' }}
        watermark={null}
        onBackgroundChange={onBackgroundChange}
        onWatermarkChange={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText('Image URL'), 'h');
    expect(onBackgroundChange).toHaveBeenCalledWith({ type: 'image', value: 'h', imageFileName: undefined });
  });
});

describe('BackgroundWatermarkPanel — watermark', () => {
  async function openWatermarkTab(props: Parameters<typeof BackgroundWatermarkPanel>[0]) {
    const user = userEvent.setup();
    render(<BackgroundWatermarkPanel {...props} />);
    await user.click(screen.getByRole('tab', { name: 'Watermark' }));
    return user;
  }

  it('shows "Add Watermark" when there is no watermark yet', async () => {
    await openWatermarkTab({ background: null, watermark: null, onBackgroundChange: vi.fn(), onWatermarkChange: vi.fn() });
    expect(screen.getByRole('button', { name: 'Add Watermark' })).toBeInTheDocument();
    // "Remove Watermark" is rendered unconditionally by this component (not gated on
    // `watermark` being non-null) — pinning that as the current, if slightly odd, behavior.
    expect(screen.getByRole('button', { name: 'Remove Watermark' })).toBeInTheDocument();
  });

  it('clicking Add Watermark seeds a default text watermark', async () => {
    const onWatermarkChange = vi.fn();
    const user = await openWatermarkTab({ background: null, watermark: null, onBackgroundChange: vi.fn(), onWatermarkChange });
    await user.click(screen.getByRole('button', { name: 'Add Watermark' }));
    expect(onWatermarkChange).toHaveBeenCalledWith({ type: 'text', value: 'WATERMARK', opacity: 0.2, position: 'center' });
  });

  it('shows the opacity percentage derived from the 0-1 opacity value', async () => {
    const watermark: WatermarkConfig = { type: 'text', value: 'W', opacity: 0.35, position: 'center' };
    await openWatermarkTab({ background: null, watermark, onBackgroundChange: vi.fn(), onWatermarkChange: vi.fn() });
    expect(screen.getByText('Opacity: 35%')).toBeInTheDocument();
  });

  it('only shows the Font size field for text watermarks, not image ones', async () => {
    const textWm: WatermarkConfig = { type: 'text', value: 'W', opacity: 0.2, position: 'center' };
    const { unmount } = render(
      <BackgroundWatermarkPanel background={null} watermark={textWm} onBackgroundChange={vi.fn()} onWatermarkChange={vi.fn()} />,
    );
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Watermark' }));
    expect(screen.getByLabelText('Font size')).toBeInTheDocument();
    unmount();

    const imageWm: WatermarkConfig = { type: 'image', value: 'x', opacity: 0.2, position: 'center' };
    render(
      <BackgroundWatermarkPanel background={null} watermark={imageWm} onBackgroundChange={vi.fn()} onWatermarkChange={vi.fn()} />,
    );
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Watermark' }));
    expect(screen.queryByLabelText('Font size')).not.toBeInTheDocument();
  });

  it('falls back rotation to 0 when the field is cleared to a non-numeric value', async () => {
    const onWatermarkChange = vi.fn();
    const watermark: WatermarkConfig = { type: 'text', value: 'W', opacity: 0.2, position: 'center', rotation: 45 };
    const user = await openWatermarkTab({ background: null, watermark, onBackgroundChange: vi.fn(), onWatermarkChange });
    const rotationField = screen.getByLabelText('Rotation (degrees)');
    await user.clear(rotationField);
    expect(onWatermarkChange.mock.calls.at(-1)?.[0]).toMatchObject({ rotation: 0 });
  });

  it('clicking Remove Watermark calls onWatermarkChange(null)', async () => {
    const onWatermarkChange = vi.fn();
    const watermark: WatermarkConfig = { type: 'text', value: 'W', opacity: 0.2, position: 'center' };
    const user = await openWatermarkTab({ background: null, watermark, onBackgroundChange: vi.fn(), onWatermarkChange });
    await user.click(screen.getByRole('button', { name: 'Remove Watermark' }));
    expect(onWatermarkChange).toHaveBeenCalledWith(null);
  });

  it('clicking Done calls onDone', async () => {
    const onDone = vi.fn();
    const watermark: WatermarkConfig = { type: 'text', value: 'W', opacity: 0.2, position: 'center' };
    const user = await openWatermarkTab({ background: null, watermark, onBackgroundChange: vi.fn(), onWatermarkChange: vi.fn(), onDone });
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalled();
  });

  it('rejects a watermark image over 2MB with an alert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const onWatermarkChange = vi.fn();
    const watermark: WatermarkConfig = { type: 'image', value: '', opacity: 0.2, position: 'center' };
    const user = await openWatermarkTab({ background: null, watermark, onBackgroundChange: vi.fn(), onWatermarkChange });

    const input = screen.getByText('Upload Image From Device').querySelector('input')!;
    const big = imageFile('huge.png', 10);
    Object.defineProperty(big, 'size', { value: 3 * 1024 * 1024 });
    await user.upload(input, big);

    expect(alertSpy).toHaveBeenCalledWith('Watermark image must be under 2 MB.');
    expect(onWatermarkChange).not.toHaveBeenCalled();
  });
});
