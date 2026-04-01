---
name: trading-strategies
description: Basic systematic trading strategies for IG Markets. Momentum, mean-reversion, breakout, and trend-following strategies with clear entry/exit rules using available price and sentiment data. Use when the user asks about trading strategies, wants to implement a systematic approach, or asks "when should I buy/sell".
---

# Trading Strategies

Skill for implementing basic systematic trading strategies using IG Markets tools. Provides clear, rule-based frameworks for entering and exiting trades.

## When to Use

Trigger phrases: "trading strategy", "when to buy", "when to sell", "momentum strategy", "mean reversion", "breakout strategy", "trend following", "swing trading", "scalping", "systematic trading", "give me a strategy for", "how to trade [instrument]".

## Critical Rules

1. **These are frameworks, not guarantees.** No strategy works all the time. Always present expected win rates and the importance of risk management alongside any strategy.
2. **Backtest disclaimer.** These strategies are based on common trading principles. Past patterns do not guarantee future results. Always recommend the user test on a demo account first.
3. **Risk management is mandatory.** Every strategy must include stop-loss rules. Never present a strategy without defined exit rules for losses.
4. **Confirm before executing.** Present the strategy signal and proposed trade parameters. Wait for user confirmation before placing any trade.
5. **No financial advice.** Frame strategies as educational frameworks. The user makes all trading decisions.

## Available Data

IG Markets API provides:

- OHLC price data (multiple resolutions from SECOND to MONTH)
- Client sentiment (long/short percentages)
- Market details (bid, offer, spread, day range, market status)

It does **not** provide:

- Built-in technical indicators (must be calculated from OHLC data)
- Economic calendar or news
- Volume data
- Order book depth

## Strategy 1: Trend Following

**Philosophy**: Trade in the direction of the established trend. "The trend is your friend."

**Timeframe**: Daily charts for signal, hourly for entry timing.

**Best for**: Indices, FX pairs, commodities with strong directional moves.

### Setup

1. **Identify the trend** using 20-day price data:

   ```
   ig_prices_points(epic, resolution: "DAY", numPoints: 20)
   ```

2. **Trend determination** (using closing prices):
   - Calculate a simple 10-period moving average (SMA10): average of last 10 closes
   - Calculate a simple 20-period moving average (SMA20): average of last 20 closes
   - **Uptrend**: SMA10 > SMA20 AND current price > SMA10
   - **Downtrend**: SMA10 < SMA20 AND current price < SMA10
   - **No trend**: SMA10 ≈ SMA20 (within 0.5% of each other) -- do not trade

### Entry Rules

**Long entry (uptrend confirmed)**:

- Price pulls back to near SMA10 (within 1 ATR)
- Sentiment is not extremely bullish (< 75% long -- avoids crowded trades)
- Market is open and tradeable

**Short entry (downtrend confirmed)**:

- Price rallies back to near SMA10 (within 1 ATR)
- Sentiment is not extremely bearish (< 75% short)
- Market is open and tradeable

### Exit Rules

- **Stop-loss**: 1.5x ATR below entry (long) or above entry (short)
- **Take-profit**: 3x ATR from entry (targets 1:2 risk/reward)
- **Trailing stop**: After 1x ATR profit, move stop to break-even. After 2x ATR, trail at 1x ATR distance
- **Time exit**: If position hasn't moved 1x ATR in 5 trading days, close and re-evaluate

### Calculating ATR (Average True Range)

ATR measures average daily volatility:

```
True Range = max(high - low, abs(high - prev_close), abs(low - prev_close))
ATR(14) = average of True Range over last 14 days
```

Use daily price data to compute this from `ig_prices_points`.

### Implementation Workflow

1. `ig_prices_points(epic, "DAY", 20)` -- get price history
2. Calculate SMA10, SMA20, ATR(14) from the OHLC data
3. Determine trend direction
4. `ig_client_sentiment(marketId)` -- check sentiment filter
5. `ig_market(epic)` -- verify market is tradeable, get current price
6. If signal is valid, calculate position size using risk-management skill
7. Present trade proposal to user
8. After confirmation: `ig_create_position` with calculated stops/limits
9. `ig_deal_confirmation` to verify

---

## Strategy 2: Breakout Trading

**Philosophy**: Enter when price breaks through a significant level, expecting momentum to continue.

**Timeframe**: Daily for level identification, hourly or 15-min for entry.

**Best for**: Indices and commodities during range consolidation.

### Setup

1. **Identify the range** using 20-day price data:

   ```
   ig_prices_points(epic, resolution: "DAY", numPoints: 20)
   ```

2. **Find the range**:
   - **Resistance**: Highest high in the last 10-20 days
   - **Support**: Lowest low in the last 10-20 days
   - **Range width**: resistance - support
   - **Valid range**: Price must have touched support at least twice AND resistance at least twice

3. **Wait for the breakout**:
   - Price closes above resistance = bullish breakout
   - Price closes below support = bearish breakout

### Entry Rules

**Bullish breakout**:

- Daily close above the 20-day high
- Use a working order: `ig_create_working_order(type: "STOP", direction: "BUY", level: resistance + buffer)`
- Buffer = 0.5% above resistance to filter false breakouts

**Bearish breakout**:

- Daily close below the 20-day low
- `ig_create_working_order(type: "STOP", direction: "SELL", level: support - buffer)`

### Exit Rules

- **Stop-loss**: Inside the range. Place stop at mid-range level (halfway between support and resistance)
- **Take-profit**: Range width projected from breakout point
  - Bullish target = resistance + range_width
  - Bearish target = support - range_width
- **False breakout**: If price re-enters the range within 2 candles, close immediately

### Implementation Workflow

1. `ig_prices_points(epic, "DAY", 20)` -- identify range
2. Calculate support, resistance, range width
3. Determine breakout direction or set working orders for both directions
4. `ig_market(epic)` -- check current price, dealing rules, min distances
5. Present the setup to user:

   ```
   BREAKOUT SETUP: FTSE 100
   ────────────────────────
   20-day range:   7450 - 7550
   Range width:    100 points

   Bullish trigger: Close above 7550
   → Entry: 7555 (buy stop)
   → Stop:  7500 (mid-range)
   → Target: 7650 (range projection)
   → Risk/Reward: 1:1.73

   Bearish trigger: Close below 7450
   → Entry: 7445 (sell stop)
   → Stop:  7500 (mid-range)
   → Target: 7350 (range projection)
   → Risk/Reward: 1:1.73
   ```

6. After confirmation: `ig_create_working_order`
7. Monitor daily: `ig_working_orders` to check if triggered

---

## Strategy 3: Mean Reversion

**Philosophy**: Prices that deviate significantly from their average tend to revert back. Buy oversold, sell overbought.

**Timeframe**: Daily signals, held for 2-5 days typically.

**Best for**: FX pairs, large-cap indices. Less effective in strongly trending markets.

### Setup

1. **Calculate the mean** using 20-day price data:

   ```
   ig_prices_points(epic, resolution: "DAY", numPoints: 20)
   ```

2. **Measure deviation**:
   - SMA20 = average of last 20 closing prices
   - Standard deviation (SD) of last 20 closes
   - Upper band = SMA20 + (2 × SD)
   - Lower band = SMA20 - (2 × SD)
   - These are essentially Bollinger Bands calculated manually

3. **Identify extremes**:
   - Price at or below lower band = oversold → potential BUY
   - Price at or above upper band = overbought → potential SELL

### Entry Rules

**Long (buy the dip)**:

- Price closes below the lower band (SMA20 - 2×SD)
- Sentiment is bearish (> 55% short) -- confirms fear/pessimism
- No major downtrend (SMA20 should be flat or rising, not falling steeply)

**Short (sell the rally)**:

- Price closes above the upper band (SMA20 + 2×SD)
- Sentiment is bullish (> 55% long) -- confirms euphoria
- No major uptrend (SMA20 should be flat or falling)

### Exit Rules

- **Target**: Return to SMA20 (the mean)
- **Stop-loss**: 1× band width beyond entry
  - For longs: stop at lower band - (upper band - lower band) × 0.5
  - For shorts: stop at upper band + (upper band - lower band) × 0.5
- **Time exit**: If price hasn't reverted to SMA20 within 5 trading days, close at market
- **Trend filter**: If SMA20 has moved 2%+ against the position during the hold, close early

### Implementation Workflow

1. `ig_prices_points(epic, "DAY", 20)` -- get price history
2. Calculate SMA20, standard deviation, upper/lower bands
3. Check if current price is beyond the bands
4. `ig_client_sentiment(marketId)` -- sentiment confirmation
5. `ig_market(epic)` -- current price and trading status
6. Present signal:

   ```
   MEAN REVERSION SIGNAL: EUR/USD
   ──────────────────────────────
   SMA(20):     1.0850
   Upper band:  1.0920 (+2 SD)
   Lower band:  1.0780 (-2 SD)
   Current:     1.0770 ← BELOW lower band (oversold)

   Sentiment:   62% short (confirms bearish excess)

   Proposed: BUY at market (~1.0775)
   Stop:     1.0710 (below band extension)
   Target:   1.0850 (SMA20 reversion)
   Risk/Reward: 1:1.15
   Hold:     Up to 5 days
   ```

7. After confirmation: `ig_create_position`

---

## Strategy 4: Sentiment Contrarian

**Philosophy**: When retail traders are overwhelmingly positioned one way, trade the other way. The crowd is often wrong at extremes.

**Timeframe**: Daily. Positions held for 1-10 days.

**Best for**: Major FX pairs, major indices. These markets have enough institutional flow to move against retail positioning.

### Setup

1. **Check sentiment**:

   ```
   ig_client_sentiment(marketId)
   ```

2. **Identify extremes**:
   - **Extreme bullish**: > 75% of IG clients are long
   - **Extreme bearish**: > 75% of IG clients are short

3. **Confirm with price**:
   ```
   ig_prices_points(epic, resolution: "DAY", numPoints: 10)
   ```

### Entry Rules

**Contrarian short** (when crowd is extreme long):

- Sentiment > 75% long
- Price is near or at a resistance level (from recent highs)
- Price showing signs of exhaustion (smaller daily ranges, failing to make new highs)

**Contrarian long** (when crowd is extreme short):

- Sentiment > 75% short
- Price is near or at a support level (from recent lows)
- Price showing signs of stabilization (no new lows in last 2-3 days)

### Exit Rules

- **Stop**: Beyond the recent extreme (highest high for shorts, lowest low for longs)
- **Target**: When sentiment normalizes back to 55-60% range
- **Time exit**: 10 trading days maximum
- Re-check sentiment daily: `ig_client_sentiment`

### Implementation Workflow

1. Screen multiple markets for extreme sentiment:
   ```
   ig_client_sentiment_bulk(marketIds: "FTSE,DAX,EURUSD,GBPUSD,USDJPY,GOLD,OIL")
   ```
2. Filter to those with > 75% in one direction
3. For each candidate, check price data for confirmation
4. Present opportunities to user
5. After confirmation: trade with defined risk

---

## Strategy Comparison

| Strategy             | Win Rate\* | Risk/Reward | Hold Time  | Best Market Conditions    |
| -------------------- | ---------- | ----------- | ---------- | ------------------------- |
| Trend Following      | 35-45%     | 1:2 - 1:3   | Days-Weeks | Trending markets          |
| Breakout             | 30-40%     | 1:1.5 - 1:2 | Days       | Range → Trend transitions |
| Mean Reversion       | 55-65%     | 1:1 - 1:1.5 | 2-5 days   | Ranging/Choppy markets    |
| Sentiment Contrarian | 45-55%     | 1:1.5 - 1:2 | 1-10 days  | Extreme positioning       |

\*Approximate. Actual results depend on implementation, market conditions, and risk management.

## General Strategy Guidelines

### Before Implementing Any Strategy

1. **Test on demo first.** Use `isDemo: true` and trade the strategy for at least 20 trades before using real money.
2. **Define rules in advance.** Entry, exit, stop, and position size should all be predetermined.
3. **Keep a trade journal.** Use `ig_activity_history` and `ig_transaction_history` to review past trades.
4. **One strategy at a time.** Don't run multiple strategies simultaneously until each is proven individually.

### Combining with Other Skills

- Use **market-analysis** skill for deeper research before taking a strategy signal
- Use **risk-management** skill for position sizing on every trade
- Use **portfolio-management** skill to monitor overall exposure when running multiple strategy positions
- Use **cfd-trading** skill for the actual trade execution mechanics

### When NOT to Trade

- Market is closed or in auction
- Major news event imminent (earnings, central bank, elections) -- unless that's explicitly your strategy
- Spread is unusually wide (check `ig_market` snapshot)
- You've already hit your daily/weekly loss limit
- The strategy doesn't have a clear signal -- forcing trades is the fastest way to lose money
