import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PrintSettingsComponent from './PrintSettings';
import { clearAllStores } from '../utils/testHelpers';
import type { PrintSettings, PrintPreset } from '../types';

function settings(overrides: Partial<PrintSettings> = {}): PrintSettings {
  return { widthMm: 85.6, heightMm: 53.98, orientation: 'landscape', ...overrides };
}

beforeEach(async () => {
  await clearAllStores();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('PrintSettings — paper size', () => {
  it('selecting a named paper preset calls onSettingsChange with its dimensions', async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();
    render(
      <PrintSettingsComponent settings={settings()} presets={[]} onSettingsChange={onSettingsChange} onPresetsChange={vi.fn()} />,
    );
    await user.click(screen.getAllByRole('combobox')[0]);
    await user.click(await screen.findByRole('option', { name: 'A3 (297 × 420 mm)' }));
    expect(onSettingsChange).toHaveBeenCalledWith({ paperWidthMm: 297, paperHeightMm: 420 });
  });

  it('selecting "Custom" reveals width/height fields without changing settings yet', async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();
    render(
      <PrintSettingsComponent settings={settings()} presets={[]} onSettingsChange={onSettingsChange} onPresetsChange={vi.fn()} />,
    );
    await user.click(screen.getAllByRole('combobox')[0]);
    await user.click(await screen.findByRole('option', { name: 'Custom' }));
    expect(await screen.findByLabelText('Width (mm)')).toBeInTheDocument();
    expect(onSettingsChange).not.toHaveBeenCalled();
  });

  it('editing custom width/height calls onSettingsChange in mm', async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();
    render(
      <PrintSettingsComponent
        settings={{ ...settings(), paperWidthMm: 300, paperHeightMm: 300 }}
        presets={[]} onSettingsChange={onSettingsChange} onPresetsChange={vi.fn()}
      />,
    );
    await user.click(screen.getAllByRole('combobox')[0]);
    await user.click(await screen.findByRole('option', { name: 'Custom' }));
    // fireEvent.change (single "paste"-style event), not userEvent.type: this field's
    // `value` is bound directly to the settings prop, which this test's mocked
    // onSettingsChange never feeds back — so per-keystroke typing would recompute
    // from the same stale starting value on every character instead of accumulating.
    const widthField = await screen.findByLabelText('Width (mm)');
    fireEvent.change(widthField, { target: { value: '250' } });
    expect(onSettingsChange).toHaveBeenCalledWith({ paperWidthMm: 250 });
  });

  it('auto-detects "Custom" when the current paper dims match no preset', async () => {
    render(
      <PrintSettingsComponent
        settings={{ ...settings(), paperWidthMm: 123, paperHeightMm: 456 }}
        presets={[]} onSettingsChange={vi.fn()} onPresetsChange={vi.fn()}
      />,
    );
    expect(await screen.findByLabelText('Width (mm)')).toBeInTheDocument();
  });
});

describe('PrintSettings — units', () => {
  it('displays card width converted to cm when the cm unit is selected', async () => {
    const user = userEvent.setup();
    render(
      <PrintSettingsComponent settings={settings({ widthMm: 100 })} presets={[]} onSettingsChange={vi.fn()} onPresetsChange={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: 'cm' }));
    expect(screen.getByLabelText('Width')).toHaveValue(10);
  });
});

describe('PrintSettings — orientation', () => {
  it('changing paper orientation calls onSettingsChange', async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();
    render(
      <PrintSettingsComponent settings={settings()} presets={[]} onSettingsChange={onSettingsChange} onPresetsChange={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: 'Landscape' }));
    expect(onSettingsChange).toHaveBeenCalledWith({ paperOrientation: 'landscape' });
  });

  it('shows the auto-selected orientation caption when paperOrientation is "auto" and card dims are given', () => {
    render(
      <PrintSettingsComponent
        settings={settings()} presets={[]} onSettingsChange={vi.fn()} onPresetsChange={vi.fn()}
        cardWidthMm={85.6} cardHeightMm={53.98}
      />,
    );
    expect(screen.getByText(/Auto-selected:/)).toBeInTheDocument();
  });

  it('shows a layout summary (cols x rows = per sheet) when card dims are given', () => {
    render(
      <PrintSettingsComponent
        settings={settings()} presets={[]} onSettingsChange={vi.fn()} onPresetsChange={vi.fn()}
        cardWidthMm={85.6} cardHeightMm={53.98}
      />,
    );
    expect(screen.getByText(/cards? per sheet/)).toBeInTheDocument();
  });

  it('does not show a layout summary when card dims are not given', () => {
    render(
      <PrintSettingsComponent settings={settings()} presets={[]} onSettingsChange={vi.fn()} onPresetsChange={vi.fn()} />,
    );
    expect(screen.queryByText(/cards? per sheet/)).not.toBeInTheDocument();
  });
});

describe('PrintSettings — card size', () => {
  it('hides the card orientation selector when showOrientation is false', () => {
    render(
      <PrintSettingsComponent settings={settings()} presets={[]} onSettingsChange={vi.fn()} onPresetsChange={vi.fn()} showOrientation={false} />,
    );
    expect(screen.queryByLabelText('Card orientation')).not.toBeInTheDocument();
  });

  it('changing card orientation calls onSettingsChange', async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();
    render(
      <PrintSettingsComponent settings={settings()} presets={[]} onSettingsChange={onSettingsChange} onPresetsChange={vi.fn()} />,
    );
    await user.click(screen.getAllByRole('combobox')[1]);
    await user.click(await screen.findByRole('option', { name: 'Portrait' }));
    expect(onSettingsChange).toHaveBeenCalledWith({ orientation: 'portrait' });
  });
});

describe('PrintSettings — presets', () => {
  it('saving a preset prompts for a name and persists it', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('My Preset');
    const onPresetsChange = vi.fn();
    render(
      <PrintSettingsComponent settings={settings()} presets={[]} onSettingsChange={vi.fn()} onPresetsChange={onPresetsChange} />,
    );
    await user.click(screen.getByRole('button', { name: 'Save Current As Preset' }));

    expect(promptSpy).toHaveBeenCalledWith('Preset name');
    await waitFor(() => expect(onPresetsChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'My Preset', widthMm: 85.6, heightMm: 53.98 }),
    ]));
  });

  it('does not save a preset when the prompt is cancelled', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const onPresetsChange = vi.fn();
    render(
      <PrintSettingsComponent settings={settings()} presets={[]} onSettingsChange={vi.fn()} onPresetsChange={onPresetsChange} />,
    );
    await user.click(screen.getByRole('button', { name: 'Save Current As Preset' }));
    expect(onPresetsChange).not.toHaveBeenCalled();
  });

  it('clicking a preset button applies its settings', async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();
    const preset: PrintPreset = {
      id: 'p1', name: 'Badge', widthMm: 60, heightMm: 90, orientation: 'portrait', paperWidthMm: 210, paperHeightMm: 297,
    };
    render(
      <PrintSettingsComponent settings={settings()} presets={[preset]} onSettingsChange={onSettingsChange} onPresetsChange={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: 'Badge' }));
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      widthMm: 60, heightMm: 90, orientation: 'portrait', paperWidthMm: 210, paperHeightMm: 297,
    }));
  });

  it('deleting a preset removes it and reloads the preset list', async () => {
    const user = userEvent.setup();
    const preset: PrintPreset = { id: 'p1', name: 'Badge', widthMm: 60, heightMm: 90, orientation: 'portrait' };
    const onPresetsChange = vi.fn();
    render(
      <PrintSettingsComponent settings={settings()} presets={[preset]} onSettingsChange={vi.fn()} onPresetsChange={onPresetsChange} />,
    );
    await user.click(screen.getByRole('button', { name: '×' }));
    await waitFor(() => expect(onPresetsChange).toHaveBeenCalledWith([]));
  });
});
