---
name: risk-management
description: Risk management for IG Markets trading. Position sizing, stop-loss strategies, risk/reward ratios, guaranteed stops, trailing stops, and portfolio-level risk controls. Use when the user asks about position sizing, managing risk, setting stops, or wants to understand how much they could lose.
---

# Risk Management

Skill for managing trading risk on IG Markets. Covers position sizing, stop placement, risk/reward analysis, and portfolio-level risk controls.

## When to Use

Trigger phrases: "position size", "how much should I risk", "stop loss", "risk/reward", "risk management", "guaranteed stop", "trailing stop", "how much could I lose", "protect my position", "maximum loss", "risk per trade", "money management".

## Critical Rules

1. **Risk per trade should be defined before entry.** Never open a position without knowing the maximum loss.
2. **Always recommend stops.** If the user wants to trade without a stop, explain the risk clearly. Do not refuse -- but make sure they understand.
3. **Do not encourage over-leveraging.** If a proposed position size would use >50% of available margin, flag it.
4. **Account for spread and slippage.** Stop-losses on non-guaranteed stops can be executed at worse levels than set. Factor this into risk calculations.

## Core Concepts

### Risk Per Trade

The amount of capital risked on a single trade. Industry convention:

- **Conservative**: 0.5-1% of account balance per trade
- **Moderate**: 1-2% of account balance per trade
- **Aggressive**: 2-5% of account balance per trade

```
risk_amount = account_balance * risk_percentage
```

Example: £10,000 account, 1% risk = £100 maximum loss per trade.

### Risk/Reward Ratio

The ratio of potential loss to potential gain:

```
risk    = entry_price - stop_level  (for BUY)
reward  = limit_level - entry_price (for BUY)
ratio   = risk : reward
```

Guidelines:

- **Minimum 1:1.5** -- risk £1 to make £1.50
- **Ideal 1:2 or better** -- risk £1 to make £2+
- **Never worse than 1:1** unless win rate is very high

### Position Sizing Formula

Calculate position size based on defined risk:

```
position_size = risk_amount / (stop_distance * value_per_point)
```

Where:

- `risk_amount` = how much you're willing to lose (e.g. £100)
- `stop_distance` = points between entry and stop (e.g. 50 points)
- `value_per_point` = currency value per point of movement per 1 unit of size

For spread bets, 1 unit = £1/point, so:

```
size = risk_amount / stop_distance
size = £100 / 50 = £2 per point
```

For CFDs, value per point depends on contract specification. Check `ig_market` for details.

## Workflows

### Position Sizing Calculator

When the user asks "how much should I trade" or "what size position":

1. **Get account details**: `ig_accounts` -- note available balance
2. **Get instrument details**: `ig_market(epic)` -- note min size, point value
3. **Determine risk parameters**:
   - Risk percentage (ask user, default to 1%)
   - Stop distance (from technical analysis or user preference)
4. **Calculate**:

   ```
   Account balance:  £10,000
   Risk per trade:   1% = £100
   Stop distance:    50 points
   Value per point:  £1 (spread bet) or as per contract spec (CFD)

   Position size = £100 / (50 * £1) = 2.0

   Recommended size: £2 per point
   Maximum loss:     £100 (1% of account)
   ```

5. **Verify** the calculated size meets the instrument's minimum deal size.
6. **Check margin**: Ensure the position won't use excessive margin.

### Stop-Loss Strategy Selection

Present the user with stop-loss options based on their situation:

#### Fixed Stop

A stop at a specific price level. The most common type.

**Best for**: Standard trading, known support/resistance levels.

```
ig_create_position(
  ...
  stopLevel: 7400.0       // absolute level
  // OR
  stopDistance: 50         // points from entry
)
```

**Placement guidelines**:

- Below recent support (for BUY) / above recent resistance (for SELL)
- At least as far as the min stop distance (`ig_market` -> `dealingRules.minStopOrProfitDistance`)
- Not so tight that normal price fluctuations trigger it

#### Guaranteed Stop

IG guarantees execution at exactly the stop level, even through gaps. Extra premium charged.

**Best for**: High-volatility events (earnings, elections), weekend holding, illiquid markets.

```
ig_create_position(
  ...
  guaranteedStop: true,
  stopDistance: 50
)
```

**Trade-off**: Wider spread (premium). Check costs with `ig_costs_open`.

#### Trailing Stop

The stop automatically moves in your favor as the price moves, but doesn't move back against you.

**Best for**: Trending markets where you want to lock in profits while letting winners run.

```
ig_update_position(
  dealId: "<id>",
  trailingStop: true,
  trailingStopDistance: 30,     // distance from current price
  trailingStopIncrement: 10    // minimum move before stop adjusts
)
```

Note: Trailing stops must be enabled in account preferences. Check with `ig_preferences`.

#### Break-Even Stop

Moving the stop to entry price after the trade moves in your favor, eliminating risk.

**When to apply**: After the position has moved 1x the original stop distance in profit.

```
// Original trade: BUY at 7500, stop at 7450 (50-point stop)
// Price moves to 7550 (50 points profit)
// Move stop to break-even:
ig_update_position(
  dealId: "<id>",
  stopLevel: 7500.0    // entry price = zero risk
)
```

### Risk Assessment for a Proposed Trade

Before any trade, calculate and present the full risk picture:

1. **Get instrument details**: `ig_market(epic)`
2. **Calculate**:

   ```
   TRADE RISK ASSESSMENT
   ─────────────────────
   Instrument:      FTSE 100 (IX.D.FTSE.DAILY.IP)
   Direction:       BUY
   Entry (offer):   7521.5
   Size:            £2/point

   Stop level:      7470.0 (51.5 points)
   Limit level:     7600.0 (78.5 points)

   Maximum loss:    £103.00 (51.5 × £2)
   Target profit:   £157.00 (78.5 × £2)
   Risk/Reward:     1:1.53

   Account balance: £10,000
   Risk as % of account: 1.03%
   Margin required: £375.00 (5% of position value)
   Margin utilization after trade: 12.5%

   VERDICT: Within acceptable risk parameters ✓
   ```

3. If risk exceeds thresholds, suggest adjustments:
   - Reduce size to meet 1% risk target
   - Widen the stop (but adjust size down accordingly)
   - Use a guaranteed stop if holding through a risky event

### Portfolio Risk Review

Assess risk across all open positions:

1. `ig_positions` -- all open positions
2. `ig_accounts` -- account balance and margin

3. **Calculate**:
   - Total margin used vs. available
   - Total maximum loss (sum of: distance to each stop × size)
   - Positions without stops (flag as unlimited risk)
   - Correlated positions (e.g. long FTSE + long DAX = correlated directional risk)

4. **Present**:

   ```
   PORTFOLIO RISK SUMMARY
   ──────────────────────
   Open positions:          5
   Positions with stops:    3 / 5 ⚠️
   Total margin used:       £2,400 / £10,000 (24%)

   Maximum defined loss:    £450 (from stopped positions)
   Undefined risk:          2 positions without stops ⚠️

   Correlation risk:        3 long index positions (FTSE, DAX, DOW)
                            These are highly correlated -- a market
                            sell-off would hit all three simultaneously.

   RECOMMENDATIONS:
   1. Add stops to the 2 unprotected positions
   2. Consider reducing index exposure (3 correlated longs)
   3. Margin utilization is healthy (24%)
   ```

### Adjusting Risk on Existing Positions

When positions are already open and the user wants to manage risk:

#### Tighten Stops (Lock in Profits)

```
ig_update_position(dealId: "<id>", stopLevel: <new_tighter_level>)
```

#### Widen Stops (Give More Room)

Only do this if the user has calculated the increased risk and accepts it. Present the new maximum loss.

#### Add Stops to Unprotected Positions

1. `ig_positions` -- find positions without stops
2. For each, determine appropriate stop level from price history
3. Present the stop levels and maximum loss
4. After user approval: `ig_update_position(dealId, stopLevel)`

#### Scale Out

Reduce risk by closing part of the position:

```
ig_close_position(dealId: "<id>", direction: "SELL", size: <partial_size>, orderType: "MARKET")
```

## Risk Rules of Thumb

| Rule                 | Guideline                                              |
| -------------------- | ------------------------------------------------------ |
| Risk per trade       | 1-2% of account balance maximum                        |
| Total portfolio risk | Maximum 5-10% of account at risk at any time           |
| Correlation          | No more than 3 positions in the same sector/direction  |
| Margin utilization   | Keep below 50% for safety buffer                       |
| Stops                | Every position should have a stop-loss                 |
| Risk/Reward          | Minimum 1:1.5, ideally 1:2+                            |
| Guaranteed stops     | Use for positions held over weekends or through events |
| Max positions        | 5-10 simultaneous positions for retail traders         |

## Common Mistakes to Flag

- **Moving stops further away** to avoid being stopped out -- this increases risk
- **No stop-loss** on leveraged positions -- risk of losing more than deposited
- **Position too large** relative to account -- one bad trade can devastate the account
- **Correlated positions** not counted as combined risk -- 5 long index positions is not diversification
- **Ignoring overnight funding** costs eating into profits on long-held DFB positions
- **Trading during low liquidity** (pre-market, overnight) with tight stops -- slippage risk
