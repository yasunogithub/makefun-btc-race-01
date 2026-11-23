// Trend-momentum bot for cbBTC, long only, speaking agent-fun/bars-replay/v1
// through the vendored SDK shim (vendor/makefun-bars.ts).
//
// Why this shape: on 1-minute bars a full round trip costs about 26 bps in
// fees, slippage and price impact, so short-horizon signals that flip often
// (EMA crosses, RSI flips) bleed money to whipsaws. This bot trades rarely:
//
//   Entry: the close has risen more than ENTRY_THRESHOLD (0.30%) over the
//     last MOMENTUM_BARS (60) bars — but by less than 3%, so a vertical
//     blow-off hour is not chased. One hour of sustained buying is a trend,
//     not noise, and 0.30% already clears the round-trip cost on its own.
//   Exit: a trailing stop. While holding, remember the highest close since
//     the entry decision; sell everything when a close falls TRAIL (2.5%)
//     below that peak. The band is wide enough to ride out ordinary 1-minute
//     chop (the dev window's in-trend pullbacks stay under it) and tight
//     enough to cap a reversal at roughly a 2.5% loss per trade.
//   Cooldown: after a position closes, wait COOLDOWN_BARS (120) bars before
//     entering again, so a stop-out in a choppy patch is not followed by a
//     string of re-entries paying the round-trip cost each time.
//
// Position size is the full cash balance (the harness caps a position at
// 100% of equity anyway, and the pool is deep next to the 1,000 USDC start).
// Every order caps slippage at 100 bps from the decision close, so a fill
// into a gap is refused and retried on the next bar while the signal holds
// instead of being taken at any price.
//
// Determinism: the bot reads only the bars in each batch (never the clock,
// the environment or randomness) and keeps its whole state in a few numbers
// updated with float64 arithmetic, so two runs answer identically.

import { BPS, runBars, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Trailing return window for the entry signal, in bars. */
const MOMENTUM_BARS = 60;
/** Enter only when the trailing MOMENTUM_BARS return beats this (0.30%). */
const ENTRY_THRESHOLD = 0.003;
/** But do not chase a blow-off: an hour up more than this (3%) is exhaustion
 *  more often than the start of a trend, so wait for a calmer confirmation. */
const ENTRY_CAP = 0.03;
/** Sell when a close falls this far below the highest close since entry. */
const TRAIL = 0.025;
/** Bars to sit out after a position closes before entering again. */
const COOLDOWN_BARS = 120;
/** Refuse fills more than 1% past the close the order was decided on. */
const MAX_SLIPPAGE_BPS = 100;

/** Every close seen so far, oldest first; only the last few are ever read. */
const closes: number[] = [];
/** Batch counter: the bar index the cooldown is measured against. */
let barIndex = -1;
/** Highest close since the current position's entry decision, if holding. */
let peak: number | null = null;
/** Whether the previous batch still held the position (to spot its close). */
let wasHeld = false;
/** First bar index at which a new entry is allowed again. */
let coolUntil = 0;

await runBars({
  onBatch(state, batch) {
    barIndex++;
    let close: number | null = null;
    for (const bar of batch.bars) {
      if (bar.symbol !== SYMBOL) continue;
      close = Number(bar.c);
      closes.push(close);
      if (closes.length > MOMENTUM_BARS + 1) closes.shift();
    }
    if (state.warmingUp || close === null) return [];

    const held = state.positions.get(SYMBOL);

    // A position that was open last batch and is gone now has closed (the
    // trailing-stop sell filled): start the cooldown from this bar.
    if (wasHeld && held === undefined) {
      coolUntil = barIndex + COOLDOWN_BARS;
      peak = null;
    }
    wasHeld = held !== undefined;

    if (held !== undefined) {
      if (peak === null || close > peak) peak = close;
      if (close < peak * (1 - TRAIL)) {
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      return [];
    }

    // Flat: enter only on a confirmed one-hour uptrend, after any cooldown.
    if (barIndex < coolUntil) return [];
    if (closes.length <= MOMENTUM_BARS) return [];
    const past = closes[0]!;
    if (past <= 0) return [];
    const trailing = close / past - 1;
    if (trailing <= ENTRY_THRESHOLD || trailing >= ENTRY_CAP) return [];

    const { caps, fees } = state.hello;
    const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
    let stake = state.cash < byWeight ? state.cash : byWeight;
    if (stake < BigInt(fees.min_notional_quote_units)) return [];
    peak = close;
    const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: stake, max_slippage_bps: MAX_SLIPPAGE_BPS };
    return [buy];
  },
});
