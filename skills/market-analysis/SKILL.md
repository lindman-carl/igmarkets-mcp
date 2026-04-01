---
name: market-analysis
description: Market research and analysis workflows for IG Markets. Price action analysis, sentiment checks, multi-timeframe review, market screening, and pre-trade research. Use when the user wants to analyze a market, compare instruments, check sentiment, or screen for opportunities.
---

# Market Analysis

Skill for researching and analyzing markets before trading. Use this when the user wants to study price action, check sentiment, compare instruments, or find trading opportunities.

## When to Use

Trigger phrases: "analyze [market]", "what's happening with [market]", "market overview", "check sentiment", "price analysis", "technical analysis", "compare markets", "screen markets", "find opportunities", "what's trending", "market research", "how is [instrument] doing".

## Critical Rules

1. **Analysis is not advice.** Present data and observations. Do not make definitive predictions. Use language like "the data suggests" rather than "the price will".
2. **State the timeframe.** Every price observation is timeframe-dependent. Always specify which resolution and period you're analyzing.
3. **Use multiple data sources.** Combine price data, sentiment, and market details for a more complete picture. Don't rely on a single signal.
4. **Note market hours.** Check if the market is currently open. Prices during closed hours may be indicative only.

## Workflows

### Single Market Deep Dive

Comprehensive analysis of one instrument. Use when the user says "analyze FTSE" or "what's happening with gold".

1. **Get market details**:

   ```
   ig_market(epic: "IX.D.FTSE.DAILY.IP")
   ```

   Extract: current bid/offer, day high/low, change %, market status, instrument type.

2. **Get price history** (multiple timeframes):

   ```
   ig_prices_points(epic: "IX.D.FTSE.DAILY.IP", resolution: "DAY", numPoints: 20)
   ig_prices_points(epic: "IX.D.FTSE.DAILY.IP", resolution: "HOUR", numPoints: 24)
   ```

3. **Check sentiment**:

   ```
   ig_client_sentiment(marketId: "<marketId from market details>")
   ```

4. **Check related markets**:

   ```
   ig_related_sentiment(marketId: "<marketId>")
   ```

5. **Present analysis**:

   **Current Snapshot:**
   - Price: 7520.5 (bid) / 7521.5 (offer)
   - Day range: 7485.0 - 7535.0
   - Change: +35.0 (+0.47%)
   - Status: TRADEABLE

   **Price Action (20-day):**
   - Trend: Upward / Downward / Sideways
   - 20-day high: X, low: Y
   - Recent pattern: Higher highs and higher lows (bullish) / etc.

   **Sentiment:**
   - Long: 65% / Short: 35% (bullish bias among IG clients)
   - Note: Retail sentiment is often a contrarian indicator

   **Key Levels:**
   - Support: [derived from recent lows in price data]
   - Resistance: [derived from recent highs in price data]

### Multi-Timeframe Analysis

Analyze the same instrument across different timeframes to identify alignment or divergence.

1. **Monthly** (big picture): `ig_prices_points(resolution: "MONTH", numPoints: 12)`
2. **Weekly** (medium trend): `ig_prices_points(resolution: "WEEK", numPoints: 12)`
3. **Daily** (short-term): `ig_prices_points(resolution: "DAY", numPoints: 20)`
4. **Hourly** (intraday): `ig_prices_points(resolution: "HOUR", numPoints: 24)`

For each timeframe, identify:

- Direction of the trend (higher highs/lows vs lower highs/lows)
- Key support and resistance levels
- Whether the current price is near the top, middle, or bottom of the recent range

Present a summary:

```
Timeframe | Trend    | Key Level  | Position in Range
----------|----------|------------|------------------
Monthly   | Bullish  | 7200 supp  | Upper third
Weekly    | Bullish  | 7350 supp  | Middle
Daily     | Sideways | 7480-7540  | Upper bound
Hourly    | Bearish  | 7510 supp  | Lower third
```

**Alignment**: If all timeframes agree (e.g. all bullish), the signal is stronger. If they diverge (e.g. daily bullish but hourly bearish), suggest caution or waiting for clearer signals.

### Sentiment Analysis

Focused analysis of how other IG clients are positioned.

1. `ig_client_sentiment(marketId: "<id>")` -- bull/bear percentages
2. `ig_related_sentiment(marketId: "<id>")` -- sentiment on correlated markets

Interpretation framework:

- **Extreme bullish (>75% long)**: Crowded trade. Contrarian signal -- could be bearish.
- **Extreme bearish (>75% short)**: Crowded short. Contrarian signal -- could be bullish.
- **Balanced (40-60%)**: No strong signal from sentiment alone.
- **Sentiment + price alignment**: If price is rising AND sentiment is bearish, the move may have legs (shorts will need to cover).
- **Sentiment + price divergence**: If price is falling BUT sentiment is very bullish, longs may capitulate causing further drops.

Note: Sentiment data reflects IG retail clients only, not institutional or broader market positioning.

### Market Comparison

Compare multiple instruments side by side. Use when the user says "compare FTSE and DAX" or "which index is performing better".

1. Get market details for each:

   ```
   ig_markets(epics: "IX.D.FTSE.DAILY.IP,IX.D.DAX.DAILY.IP,IX.D.DOW.DAILY.IP")
   ```

2. Get recent price data for each:

   ```
   ig_prices_points(epic: "IX.D.FTSE.DAILY.IP", resolution: "DAY", numPoints: 5)
   ig_prices_points(epic: "IX.D.DAX.DAILY.IP", resolution: "DAY", numPoints: 5)
   ig_prices_points(epic: "IX.D.DOW.DAILY.IP", resolution: "DAY", numPoints: 5)
   ```

3. Get sentiment for each:

   ```
   ig_client_sentiment_bulk(marketIds: "FTSE,DAX,DOW")
   ```

4. Present comparison table:
   ```
   | Market   | Price    | Day Chg  | 5-Day Chg | Long% | Short% | Spread |
   |----------|----------|----------|-----------|-------|--------|--------|
   | FTSE 100 | 7520.5   | +0.47%   | +1.2%     | 65%   | 35%    | 1.0    |
   | DAX 40   | 18250.0  | +0.31%   | +0.8%     | 58%   | 42%    | 1.2    |
   | Dow 30   | 39800.0  | -0.15%   | +0.5%     | 72%   | 28%    | 1.6    |
   ```

### Market Screening

Scan a watchlist or category to find instruments meeting certain criteria.

1. **Get instruments from a watchlist or category**:

   ```
   ig_watchlists()
   ig_watchlist(watchlistId: "<id>")
   ```

   Or browse categories:

   ```
   ig_categories()
   ig_category_instruments(categoryId: "<id>")
   ```

2. **Get bulk market data**:

   ```
   ig_markets(epics: "<comma-separated list of epics>")
   ```

   Note: Max ~50 epics per call.

3. **Filter by criteria**:
   - Biggest movers (highest % change)
   - Most volatile (widest day range relative to price)
   - Near support/resistance (requires price history per instrument)
   - Extreme sentiment (requires sentiment data)

4. **Present results** as a ranked table with the filtering criterion highlighted.

### Pre-Trade Research Checklist

Before any trade, run through this checklist:

1. **Market status**: Is it open? (`ig_market` -> `snapshot.marketStatus`)
2. **Current price**: Bid/offer and spread (`ig_market` -> `snapshot`)
3. **Day range**: How much has it already moved today?
4. **Recent trend**: Direction over last 5-20 days (`ig_prices_points`)
5. **Key levels**: Support and resistance from price history
6. **Sentiment**: Are other traders positioned similarly? (`ig_client_sentiment`)
7. **Costs**: Spread, margin requirement, overnight funding (`ig_market`, `ig_costs_open`)
8. **Trading hours**: When does the market close? (`ig_market` -> `instrument.openingHours`)
9. **Upcoming events**: Any known earnings, data releases, or central bank decisions (note: IG API doesn't provide this -- flag that the user should check externally)

## Price Data Analysis Techniques

### Identifying Support and Resistance

From price history data (`ig_prices_points`):

- **Support**: Price levels where the market has repeatedly bounced up from. Look for recurring lows.
- **Resistance**: Price levels where the market has repeatedly reversed down from. Look for recurring highs.
- **Round numbers**: Psychologically significant (e.g. 7500, 10000, 1.0000)

### Trend Identification

Using closing prices from daily data:

- **Uptrend**: Sequence of higher highs and higher lows
- **Downtrend**: Sequence of lower highs and lower lows
- **Sideways/Range**: Prices bouncing between two levels

### Volatility Assessment

```
daily_range = high - low
average_range = average of daily_range over N days
range_vs_price = (average_range / current_price) * 100  // as percentage
```

High volatility = wider stops needed, larger potential moves.
Low volatility = tighter stops possible, may precede a breakout.

## Limitations

- IG's API provides OHLC price data but no built-in technical indicators (no moving averages, RSI, MACD, etc.). You must calculate these from raw price data if needed.
- Sentiment data is IG retail clients only. It does not represent the broader market.
- Historical data depth varies by instrument and resolution. Very granular resolutions (SECOND, MINUTE) may only have limited history.
- No economic calendar or news feed is available through the API. Recommend external sources for fundamental analysis.
