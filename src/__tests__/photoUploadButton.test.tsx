import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) =>
    key + (values ? JSON.stringify(values) : ''),
}));
vi.mock('@/lib/photoUpload', () => ({ runPhotoUploadQueue: mocks.run }));
import { PhotoUploadButton } from '@/components/trips/detail/album/PhotoUploadButton';
import type { PhotoUploadTask } from '@/lib/photoUpload';
const props = {
  tripId: 'trip',
  photoCount: 0,
  onPhoto: vi.fn(),
  onView: vi.fn(),
  onFinished: vi.fn(),
};
beforeEach(() => {
  vi.resetAllMocks();
});
describe('photo upload progress panel', () => {
  it('retains progress when an empty album gains photos and retries only failed entries', async () => {
    let release!: () => void;
    mocks.run.mockImplementationOnce(async (tasks, options) => {
      tasks[0].stage = 'saved';
      options.onChange({ ...tasks[0] });
      tasks[1].stage = 'failed';
      tasks[1].reason = 'failed';
      options.onChange({ ...tasks[1] });
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const view = render(<PhotoUploadButton {...props} />);
    fireEvent.change(view.container.querySelector('input')!, {
      target: { files: [new File(['a'], 'a.jpg'), new File(['b'], 'b.jpg')] },
    });
    expect(screen.getByRole('button', { name: 'upload' })).toBeDisabled();
    expect(screen.getByText('a.jpg')).toBeInTheDocument();
    view.rerender(<PhotoUploadButton {...props} photoCount={1} />);
    expect(screen.getByText('a.jpg')).toBeInTheDocument();
    expect(mocks.run).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
    });
    expect(screen.getByRole('status')).toHaveTextContent('"saved":1');
    expect(screen.getByRole('status')).toHaveTextContent('"failed":1');
    mocks.run.mockResolvedValueOnce(undefined);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'uploadRetry' }));
    });
    expect(mocks.run.mock.calls[1][0].map((task: PhotoUploadTask) => task.file.name)).toEqual([
      'b.jpg',
    ]);
  });
  it('stops active transport on request and on unmount', async () => {
    let signal!: AbortSignal;
    let release!: () => void;
    mocks.run.mockImplementation(async (_tasks, options) => {
      signal = options.signal;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const view = render(<PhotoUploadButton {...props} />);
    fireEvent.change(view.container.querySelector('input')!, {
      target: { files: [new File(['a'], 'a.jpg')] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'uploadStop' }));
    expect(signal.aborted).toBe(true);
    await act(async () => {
      release();
    });
    fireEvent.change(view.container.querySelector('input')!, {
      target: { files: [new File(['b'], 'b.jpg')] },
    });
    expect(signal.aborted).toBe(false);
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      release();
    });
  });
});
