import { formatClock } from '../core/format.js';

let timer = null;

/** Shows a live HH:mm clock using the server time zone. */
export function startLiveClock(root, timeZone) {
  stopLiveClock();
  const nodes = [...root.querySelectorAll('[data-live-clock]')];
  if (!nodes.length) return;

  const paint = () => {
    const text = formatClock(new Date(), timeZone);
    for (const node of nodes) node.textContent = text;
  };

  paint();
  timer = window.setInterval(paint, 10_000);
}

export function stopLiveClock() {
  if (timer) window.clearInterval(timer);
  timer = null;
}
