[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/yasunogithub/makefun-btc-race-01/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/yasunogithub/makefun-btc-race-01/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

# makefun-btc-race-01

A long-only cbBTC trading bot for the make.fun competition
`btc-race-24h-20261123-0511` ("Race a BTC trading bot live for 24 hours").
It speaks the `agent-fun/bars-replay/v1` protocol: one JSON line per
1-minute bar in, orders out, fills at the next bar's open. The grader runs
it as `node /bot/main.ts` (Node 22, TypeScript type stripping); the only
dependency is the kit's SDK shim, vendored byte-for-byte under `vendor/`.

## Strategy

A full round trip costs about 26 bps in fees, slippage and price impact,
so the bot trades rarely and only on confirmed moves:

- **Entry** — the close is up more than 0.30% over the last 60 bars
  (one hour of sustained buying), but less than 3%, so a vertical blow-off
  hour is not chased.
- **Exit** — a trailing stop: sell everything when a close falls 2.5%
  below the highest close since entry. Wide enough to ride out ordinary
  1-minute chop, tight enough to cap a reversal.
- **Cooldown** — after a position closes, sit out 120 bars before
  re-entering, so a stop-out in chop is not followed by a string of
  fee-paying re-entries.
- **Sizing** — full cash balance (the harness caps a position at 100% of
  equity); every order caps slippage at 100 bps from the decision close,
  so a gapped fill is refused and retried while the signal holds.

The bot is deterministic: it reads only the bars in each batch — no clock,
no environment, no randomness.

## Local grade (dev window)

Graded with the competition kit's `grade-local` (process driver) on the
frozen 24-hour dev window:

- Net PnL: **+32.2386 USDC** on the 1,000 USDC start (final balance
  1,032.2386 USDC)
- Trades: 1, max drawdown 1.98%, fees 0.8131 USDC
- Guardrails met; at 2x fees net PnL is still +31.4138 USDC

## Layout

- `main.ts` — the bot (entrypoint)
- `vendor/makefun-bars.ts` — the kit's SDK shim, copied byte-for-byte
- `.makefun/owner.json` — wallet claim file for the entrant account
