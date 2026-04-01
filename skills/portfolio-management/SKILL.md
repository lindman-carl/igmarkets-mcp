---
name: portfolio-management
description: Portfolio review, P&L analysis, exposure assessment, and rebalancing for IG Markets accounts. Use when the user wants to review their portfolio, check profit/loss, assess concentration risk, or rebalance positions.
---

# Portfolio Management

Skill for reviewing, analyzing, and managing an IG Markets trading portfolio. Use this when the user asks about their positions, P&L, account health, exposure, or wants to rebalance.

## When to Use

Trigger phrases: "portfolio review", "how are my positions", "P&L", "profit and loss", "account summary", "exposure", "rebalance", "what am I holding", "position summary", "account health", "margin usage", "how much am I up/down".

## Critical Rules

1. **Never trade without confirmation.** This skill involves analysis and recommendations. Any actual trades must be confirmed with the user first.
2. **Always check session first.** Call `ig_session_status` before running any workflow. If not authenticated, guide the user to log in.
3. **Present P&L clearly.** Always show both unrealized (open) and realized (closed) P&L when relevant. Use the account currency consistently.
4. **Flag risk.** If the portfolio has concentration risk (>30% in one position), high margin usage (>70%), or positions without stops, proactively warn the user.

## Workflows

### Full Portfolio Review

This is the go-to workflow when the user asks "how's my portfolio" or similar.

1. **Check session**: `ig_session_status`
2. **Get account info**: `ig_accounts` -- note available balance, equity, margin used, total P&L
3. **List positions**: `ig_positions` -- get all open positions with market data
4. **Summarize**:
   - Total number of open positions
   - Total unrealized P&L (sum of each position's P&L)
   - Margin used vs. available
   - Breakdown by direction (long vs. short count and value)
   - Largest winning position and largest losing position
   - Any positions without stop-losses (flag as risk)

Present as a clean table:

```
| Market        | Direction | Size | Entry   | Current | P&L     | Stop   | Limit  |
|---------------|-----------|------|---------|---------|---------|--------|--------|
| FTSE 100      | BUY       | 2    | 7450.0  | 7520.0  | +£140   | 7400.0 | 7600.0 |
| EUR/USD       | SELL      | 1    | 1.0850  | 1.0830  | +$20    | —      | —      |
```

### Account Health Check

Use when the user asks about margin, available funds, or account risk level.

1. `ig_accounts` -- get balance details for all accounts
2. Calculate and present:
   - **Balance**: Total account value
   - **Available to deal**: Cash available for new positions
   - **Margin used**: Total margin held for open positions
   - **Margin utilization**: (margin used / balance) as a percentage
   - **Risk level**: LOW (<30% margin), MEDIUM (30-60%), HIGH (60-80%), CRITICAL (>80%)
3. If margin utilization is HIGH or CRITICAL, recommend:
   - Closing losing positions
   - Adding stops to reduce margin requirements
   - Reducing position sizes

### Exposure Analysis

Use when the user asks "what am I exposed to" or wants to understand portfolio concentration.

1. `ig_positions` -- get all open positions
2. Categorize positions by:
   - **Asset class**: Indices, FX, Commodities, Shares, etc. (derive from epic naming)
   - **Direction**: Net long vs. net short exposure
   - **Geography**: UK, US, EU, Asia (derive from instrument names)
   - **Single-name concentration**: What % of total position value is in each instrument
3. Flag risks:
   - Any single position >30% of total value = concentration risk
   - All positions in same direction = directional risk
   - All positions in same asset class = sector risk
   - No hedging positions = unhedged risk

### P&L Report

Use when the user asks "how much have I made/lost" or wants a P&L breakdown.

#### Open P&L (Unrealized)

1. `ig_positions` -- calculate P&L per position from entry vs. current price
2. Sum total unrealized P&L
3. Show best and worst performers

#### Closed P&L (Realized)

1. `ig_transaction_history` with type `ALL_DEAL` -- for recent closed trades
2. Sum realized P&L from transaction records
3. Calculate win rate: (profitable trades / total trades) as percentage
4. Average winner vs. average loser

#### Combined Report

Present both together:

- Unrealized P&L: +/- amount
- Realized P&L (period): +/- amount
- Net P&L: combined total
- Win rate on closed trades

### Position Rebalancing

Use when the user wants to adjust their portfolio allocation or reduce risk.

1. `ig_positions` -- current portfolio state
2. Identify what needs changing based on user's goal:
   - **Reduce concentration**: Close or trim largest positions
   - **Reduce directional bias**: Close some long or short positions
   - **Add protection**: Add stops to unprotected positions
   - **Take profits**: Close positions above a profit threshold
   - **Cut losses**: Close positions below a loss threshold
3. Present a rebalancing plan as a list of proposed actions
4. **Wait for user confirmation** before executing any trades
5. Execute trades one at a time, checking `ig_deal_confirmation` after each

### Activity Review

Use when the user asks "what have I traded recently" or wants to review recent activity.

1. `ig_activity_history` with appropriate date range
2. Summarize:
   - Number of trades in period
   - Trades opened vs. closed
   - Markets traded
   - Any rejected deals (and why)
3. For deeper analysis, cross-reference with `ig_transaction_history` for P&L on closed trades

## Calculation Reference

### Margin Utilization

```
margin_utilization = (margin_used / account_balance) * 100
```

### Position P&L (CFD/Spread Bet)

```
BUY P&L  = (current_bid - entry_level) * size
SELL P&L = (entry_level - current_offer) * size
```

### Concentration

```
position_weight = abs(position_value) / sum(abs(all_position_values)) * 100
```

## Safety Reminders

- Unrealized P&L can change rapidly. Always note that figures are as of the current snapshot.
- Margin requirements can change. IG may increase margin requirements during volatile periods.
- Weekend gaps can cause positions to open at significantly different levels on Monday.
- Do not recommend the user increase position sizes to "average down" on losing positions unless they explicitly ask and understand the risk.
