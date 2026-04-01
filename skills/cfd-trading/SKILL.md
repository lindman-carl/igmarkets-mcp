---
name: cfd-trading
description: CFD and spread bet trading workflows for IG Markets. Covers opening/closing CFD positions, understanding margin and leverage, DFB expiry, overnight funding, and CFD-specific instrument selection. Use when the user wants to trade CFDs, understand leverage, or manage spread bet positions.
---

# CFD Trading

Skill for executing and managing CFD (Contract for Difference) and spread bet trades on IG Markets. Use this when the user wants to open, close, or manage leveraged positions.

## When to Use

Trigger phrases: "buy CFD", "sell CFD", "open a trade", "go long", "go short", "spread bet", "leverage", "margin trade", "DFB", "daily funded bet", "open a position on", "trade [instrument]", "what's the margin on".

## Critical Rules

1. **Always confirm before trading.** Summarize epic, direction, size, stops, limits, and estimated margin before executing. Wait for explicit user approval.
2. **Check instrument details first.** Always call `ig_market` before placing a trade to verify min size, margin factor, currency, expiry options, and trading hours.
3. **Recommend stops.** If the user doesn't specify a stop-loss, recommend one. Never silently open a position without at least mentioning stop-loss protection.
4. **Explain costs.** CFDs have overnight funding charges. DFB positions held overnight incur daily financing costs. Make sure the user understands this for positions intended to be held for days/weeks.
5. **Direction on close is inverted.** BUY positions are closed with SELL direction and vice versa.

## Key CFD Concepts

### What is a CFD?

A Contract for Difference is a leveraged derivative. You don't own the underlying asset -- you're trading the price movement. Profits and losses are amplified by leverage.

### Margin

The deposit required to open a position. For example, a 5% margin factor means you need 5% of the full position value as margin. A £10,000 position requires £500 margin.

```
margin_required = position_value * margin_factor
position_value  = price * size * (contract_size or 1)
```

### DFB (Daily Funded Bet)

The most common expiry type on IG. DFB positions:

- Have no fixed expiry date (they roll daily)
- Incur overnight funding charges if held past the daily funding time
- Are suitable for short-to-medium term trading
- The funding charge is based on the underlying rate + IG's markup

### Expiry Types

- **DFB**: Daily funded -- rolls daily, funding charges apply overnight
- **Monthly/Quarterly**: Fixed expiry (e.g. "SEP-25") -- no overnight funding but wider spreads
- **`-`**: No expiry (some instruments like FX)

### Spread

The difference between the bid (sell) price and offer (buy) price. This is IG's primary commission on CFDs.

- You BUY at the offer price (higher)
- You SELL at the bid price (lower)
- To break even, the market must move by at least the spread in your favor

## Workflows

### Opening a CFD Position

Step-by-step workflow for entering a new trade.

1. **Find the market**:

   ```
   ig_search_markets(searchTerm: "AAPL")
   ```

   Note the `epic` from the results. Common epic patterns:
   - Shares: `CS.D.AAPL.CFD.IP` (CFD), `SA.D.AAPL.CASH.IP` (spread bet)
   - Indices: `IX.D.FTSE.DAILY.IP`, `IX.D.DAX.DAILY.IP`
   - FX: `CS.D.GBPUSD.TODAY.IP`
   - Commodities: `CS.D.USCGC.TODAY.IP` (gold)

2. **Check instrument details**:

   ```
   ig_market(epic: "CS.D.AAPL.CFD.IP")
   ```

   Extract and verify:
   - `instrument.minDealSize` -- minimum position size
   - `instrument.marginFactor` -- margin requirement percentage
   - `instrument.currencies` -- available currencies
   - `instrument.expiry` -- expiry type
   - `snapshot.bid` / `snapshot.offer` -- current prices
   - `snapshot.marketStatus` -- must be TRADEABLE
   - `dealingRules` -- min stop distance, min limit distance

3. **Calculate margin and present trade summary**:

   ```
   Direction:  BUY (long) / SELL (short)
   Instrument: Apple Inc (CS.D.AAPL.CFD.IP)
   Size:       10 contracts
   Price:      $185.50 (offer for BUY)
   Expiry:     DFB
   Margin:     ~$370 (at 20% margin factor)
   Stop:       $180.00 (distance: 550 points)
   Limit:      $195.00 (distance: 950 points)
   Risk/Reward: 1:1.7
   ```

4. **Wait for user confirmation**

5. **Execute the trade**:

   ```
   ig_create_position(
     epic: "CS.D.AAPL.CFD.IP",
     direction: "BUY",
     size: 10,
     expiry: "DFB",
     currencyCode: "USD",
     forceOpen: true,
     guaranteedStop: false,
     orderType: "MARKET",
     stopDistance: 550,
     limitDistance: 950
   )
   ```

6. **Verify the deal**:
   ```
   ig_deal_confirmation(dealReference: "<returned reference>")
   ```
   Report: OPEN (accepted) or REJECTED (with reason).

### Closing a CFD Position

1. **List positions**: `ig_positions`
2. **Identify the position**: Note `dealId`, `direction`, `size`
3. **Present close summary**:
   ```
   Closing: Apple Inc BUY x10
   Entry:   $185.50
   Current: $190.20
   P&L:     +$47.00
   ```
4. **Wait for user confirmation**
5. **Close**:
   ```
   ig_close_position(
     dealId: "<deal_id>",
     direction: "SELL",    // opposite of BUY
     size: 10,
     orderType: "MARKET"
   )
   ```
6. **Verify**: `ig_deal_confirmation`

### Partial Close

You can close part of a position by specifying a smaller size:

```
ig_close_position(
  dealId: "<deal_id>",
  direction: "SELL",
  size: 5,            // close half of a 10-size position
  orderType: "MARKET"
)
```

### Adjusting Stops and Limits

After a position is open, modify protection levels:

```
ig_update_position(
  dealId: "<deal_id>",
  stopLevel: 7400.0,
  limitLevel: 7600.0
)
```

For trailing stops:

```
ig_update_position(
  dealId: "<deal_id>",
  trailingStop: true,
  trailingStopDistance: 50,
  trailingStopIncrement: 10
)
```

### Setting Up a Limit Order (Working Order)

For entering at a specific price rather than the current market price:

1. `ig_market` to get current price and dealing rules
2. Determine entry level (must respect minimum distance from current price)
3. **Confirm with user**
4. Execute:
   ```
   ig_create_working_order(
     epic: "IX.D.FTSE.DAILY.IP",
     direction: "BUY",
     size: 2,
     level: 7400,
     type: "LIMIT",            // buy below market / sell above market
     currencyCode: "GBP",
     expiry: "DFB",
     guaranteedStop: false,
     timeInForce: "GOOD_TILL_CANCELLED",
     stopDistance: 50,
     limitDistance: 100
   )
   ```

Order types:

- **LIMIT**: Buy below current price or sell above current price (expect reversal)
- **STOP**: Buy above current price or sell below current price (expect breakout)

### Checking Costs Before Trading

For EU-regulated accounts, check indicative costs:

```
ig_costs_open(
  epic: "CS.D.AAPL.CFD.IP",
  direction: "BUY",
  size: 10,
  orderType: "MARKET",
  currencyCode: "USD"
)
```

## Common Patterns

### Going Long (Bullish)

- Direction: BUY
- Profit when price rises
- Stop below entry, limit above entry
- Close with SELL direction

### Going Short (Bearish)

- Direction: SELL
- Profit when price falls
- Stop above entry, limit below entry
- Close with BUY direction

### Hedging

Open a position in the opposite direction on the same or correlated instrument with `forceOpen: true`. This creates a second position rather than closing the first.

## Risk Warnings

- **Leverage amplifies losses as well as gains.** A 5% margin position means a 1% adverse move costs 20% of your margin.
- **Overnight funding** on DFB positions adds up. For long-held positions, consider monthly/quarterly expiry to avoid daily charges.
- **Guaranteed stops** cost extra (wider spread) but protect against gapping. Consider them for volatile instruments or event-driven trades.
- **Market gaps** can cause stop-losses to be executed at worse levels than set (slippage). This is especially relevant over weekends and around major announcements.
- **Minimum deal sizes** vary by instrument. Always check with `ig_market` before presenting trade options.
