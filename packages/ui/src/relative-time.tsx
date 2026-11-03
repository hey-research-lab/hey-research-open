'use client';

import { useEffect, useState } from 'react';

import { formatRelativeTime } from './format';

/**
 * An age that stays true in a stored page (2026-11-03 full audit, frontend F12).
 *
 * The browse pages are kept at the edge for minutes ("Shipped 1h ago" on a card, a list row, a preview), so the age
 * printed when the page was rendered went on being served after it stopped being true. The server still prints the
 * age — a reader with no script reads the same words as before, beside the `<time dateTime>` the caller wraps it in —
 * and the browser recomputes it from that instant with the same rule (`formatRelativeTime`) once the page is live,
 * then every minute. The first render is the server's text, so hydration never disagrees.
 */
export function RelativeTimeText({ at, initial, prefix = '' }: { at: string; initial: string; prefix?: string }) {
  const [text, setText] = useState(initial);
  useEffect(() => {
    const instant = new Date(at);
    if (Number.isNaN(instant.getTime())) return undefined;
    const update = () => setText(`${prefix}${formatRelativeTime(instant)}`);
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [at, prefix]);
  return <>{text}</>;
}
