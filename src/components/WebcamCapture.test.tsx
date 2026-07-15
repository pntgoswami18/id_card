import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WebcamCapture from './WebcamCapture';

function fakeTrack(): MediaStreamTrack {
  return { stop: vi.fn() } as unknown as MediaStreamTrack;
}

function fakeStream(tracks: MediaStreamTrack[] = [fakeTrack()]): MediaStream {
  return { getTracks: () => tracks } as unknown as MediaStream;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('WebcamCapture', () => {
  it('does not request the camera when closed', () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    render(<WebcamCapture open={false} onClose={vi.fn()} onCapture={vi.fn()} />);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('requests a front-facing camera stream when opened', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream());
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    render(<WebcamCapture open onClose={vi.fn()} onCapture={vi.fn()} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'user' } }));
  });

  it('shows an error message and disables Capture when getUserMedia rejects', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error('Permission denied'));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    render(<WebcamCapture open onClose={vi.fn()} onCapture={vi.fn()} />);

    expect(await screen.findByText('Permission denied')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Capture' })).toBeDisabled();
  });

  it('falls back to a generic error message when the rejection has no message', async () => {
    const getUserMedia = vi.fn().mockRejectedValue({});
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    render(<WebcamCapture open onClose={vi.fn()} onCapture={vi.fn()} />);
    expect(await screen.findByText('Could not access camera')).toBeInTheDocument();
  });

  it('stops all stream tracks when the dialog closes', async () => {
    const track = fakeTrack();
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream([track]));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    const { rerender } = render(<WebcamCapture open onClose={vi.fn()} onCapture={vi.fn()} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    rerender(<WebcamCapture open={false} onClose={vi.fn()} onCapture={vi.fn()} />);
    expect(track.stop).toHaveBeenCalled();
  });

  it('stops tracks from a stream that resolves after the dialog has already closed', async () => {
    const track = fakeTrack();
    let resolveStream!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn().mockReturnValue(new Promise<MediaStream>((resolve) => { resolveStream = resolve; }));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    const { rerender } = render(<WebcamCapture open onClose={vi.fn()} onCapture={vi.fn()} />);
    rerender(<WebcamCapture open={false} onClose={vi.fn()} onCapture={vi.fn()} />);

    resolveStream(fakeStream([track]));
    await waitFor(() => expect(track.stop).toHaveBeenCalled());
  });

  it('does nothing when Capture is clicked before a stream is attached', async () => {
    const user = userEvent.setup();
    let resolveStream!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn().mockReturnValue(new Promise<MediaStream>((resolve) => { resolveStream = resolve; }));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const onCapture = vi.fn();

    render(<WebcamCapture open onClose={vi.fn()} onCapture={onCapture} />);
    await user.click(screen.getByRole('button', { name: 'Capture' }));
    expect(onCapture).not.toHaveBeenCalled();

    resolveStream(fakeStream()); // avoid an unhandled-rejection-shaped dangling promise
  });

  it('captures a frame to a data URL and calls onCapture + onClose', async () => {
    const user = userEvent.setup();
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream());
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    const drawImage = vi.fn();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,captured');

    const onCapture = vi.fn();
    const onClose = vi.fn();
    render(<WebcamCapture open onClose={onClose} onCapture={onCapture} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Capture' }));

    expect(drawImage).toHaveBeenCalled();
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.9);
    expect(onCapture).toHaveBeenCalledWith('data:image/jpeg;base64,captured');
    expect(onClose).toHaveBeenCalled();

    getContext.mockRestore();
    toDataURL.mockRestore();
  });
});
