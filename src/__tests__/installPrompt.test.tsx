import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';

const storageKey = 'travel-budget:pwa-install-dismissed-until';
let standalone: boolean;

function device(userAgent: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
}

function installEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) });
  act(() => {
    window.dispatchEvent(event);
  });
  return { event, prompt };
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  standalone = false;
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: standalone,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('home screen installation prompt', () => {
  it('shows iPhone instructions after tapping the invitation', () => {
    device('iPhone');
    render(<InstallPrompt />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    fireEvent.click(screen.getByRole('button', { name: 'action' }));
    expect(screen.getByText('iosBrowser')).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'action' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('waits for Android installability and invokes the native prompt once', async () => {
    device('Android');
    render(<InstallPrompt />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    const { event, prompt } = installEvent();
    expect(event.defaultPrevented).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'action' }));
    });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('remembers Later across visits and reminds after seven days', () => {
    device('iPhone');
    const first = render(<InstallPrompt />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    fireEvent.click(screen.getByRole('button', { name: 'later' }));
    expect(Number(localStorage.getItem(storageKey))).toBeGreaterThan(Date.now());
    first.unmount();
    const second = render(<InstallPrompt />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    second.unmount();
    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000);
    render(<InstallPrompt />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole('region')).toBeVisible();
  });

  it('also snoozes after dismissing the native install dialog', async () => {
    device('Android');
    render(<InstallPrompt />);
    installEvent('dismissed');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'action' }));
    });
    expect(Number(localStorage.getItem(storageKey))).toBeGreaterThan(Date.now());
    installEvent();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it.each(['iPhone', 'Android', 'desktop'])(
    'does not invite installation in standalone mode on %s',
    (ua) => {
      device(ua);
      standalone = true;
      render(<InstallPrompt />);
      const { event } = installEvent();
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(event.defaultPrevented).toBe(false);
      expect(screen.queryByRole('region')).not.toBeInTheDocument();
    }
  );

  it('keeps unsupported desktop browsers quiet', () => {
    device('desktop');
    render(<InstallPrompt />);
    installEvent();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('hides when installation completes elsewhere', () => {
    device('Android');
    render(<InstallPrompt />);
    installEvent();
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('provides a fallback when the native prompt fails', async () => {
    device('Android');
    render(<InstallPrompt />);
    const { prompt } = installEvent();
    prompt.mockRejectedValueOnce(new Error('unavailable'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'action' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('fallback');
    expect(screen.queryByRole('button', { name: 'action' })).not.toBeInTheDocument();
  });

  it('still allows dismissal with blocked browser storage', () => {
    device('iPhone');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<InstallPrompt />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    fireEvent.click(screen.getByRole('button', { name: 'later' }));
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});
