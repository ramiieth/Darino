// @vitest-environment jsdom
/** دود‌آزمایی بات کاغذی: حالت شروع‌نشده و در حال اجرا روی دادهٔ ساختگی، بدون شبکه */
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aprToHourly, HOUR_MS } from '../domain/engine';
import { advanceLeg, newBook, PAPER_STRATEGIES, recordTick, summarize } from '../domain/paper';
import type { PaperStatus } from '../data/paperApi';

vi.mock('react-chartjs-2', () => ({ Line: () => null, Bar: () => null }));
let status: PaperStatus;
vi.mock('@/repositories/remoteClient', () => ({ fetchJson: vi.fn(() => Promise.resolve(status)) }));
afterEach(cleanup);

const { PaperBotTab } = await import('./PaperBotTab');
const ui = () => (
  <MemoryRouter>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PaperBotTab />
    </QueryClientProvider>
  </MemoryRouter>
);

const T0 = Date.UTC(2026, 10, 1);
function runningBook() {
  const warm = Array.from({ length: 168 }, (_, i) => ({ hour: T0 + i * HOUR_MS, rate: aprToHourly(10) }));
  const book = newBook(9000, { 'btc-hl': warm, 'eth-hl': warm, 'gold-lt': warm }, T0);
  const now = T0 + 230 * HOUR_MS;
  const evs = PAPER_STRATEGIES.flatMap((st) => {
    const pts = Array.from({ length: 60 }, (_, i) => ({ hour: T0 + (168 + i) * HOUR_MS, rate: aprToHourly(10) }));
    const bars = Array.from({ length: 62 }, (_, i) => ({ end: T0 + (167 + i) * HOUR_MS, high: 100, low: 100, close: 100 }));
    return advanceLeg(book.legs[st.id], st, pts, bars, now);
  });
  recordTick(book, evs, now, []);
  return { book, summary: summarize(book, now), tick: { configured: true, lastAt: Date.now() } };
}

describe('PaperBotTab', () => {
  it('شروع‌نشده: سه استراتژی و دکمهٔ شروع', async () => {
    status = { book: null, summary: null, tick: { configured: false, lastAt: null } };
    render(ui());
    expect(await screen.findByText('شروع بات کاغذی')).toBeTruthy();
    expect(screen.getByText('زمان‌بند فعال نیست')).toBeTruthy();
    for (const st of PAPER_STRATEGIES) expect(screen.getByText(st.label)).toBeTruthy();
  });

  it('در حال اجرا: پوزیشن‌ها و رویداد ورود', async () => {
    status = runningBook();
    render(ui());
    expect(await screen.findByText('در حال اجرا')).toBeTruthy();
    expect(screen.getAllByText(/باز · ۳×/)).toHaveLength(3);
    expect(screen.getAllByText('ورود').length).toBeGreaterThanOrEqual(3);
  });
});
