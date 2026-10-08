import { useEffect, useState } from 'react';

/** Display clock only. It never alters a persisted deadline. */
export function useRecoveryClock(until: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!until) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      const time = Date.now();
      setNow(time);
      if (time >= until && timer !== undefined) clearInterval(timer);
    };
    // Refresh a stopped clock when a new deadline arrives, without a synchronous effect update.
    const refresh = setTimeout(update, 0);
    if (Date.now() < until) timer = setInterval(update, 1000);
    return () => {
      clearTimeout(refresh);
      if (timer !== undefined) clearInterval(timer);
    };
  }, [until]);
  return now;
}
