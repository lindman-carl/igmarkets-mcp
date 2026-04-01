/**
 * Prompt Parser Tests
 *
 * Tests for parseStrategyPrompt and parseSimpleYaml.
 * Covers valid frontmatter, missing frontmatter, invalid fields, edge cases.
 */

import { describe, it, expect } from "vitest";
import { parseStrategyPrompt, parseSimpleYaml } from "./prompt-parser.js";

// ---------------------------------------------------------------------------
// parseSimpleYaml — low-level YAML subset parser
// ---------------------------------------------------------------------------

describe("parseSimpleYaml", () => {
  it("parses simple key-value pairs", () => {
    const result = parseSimpleYaml(`name: "My Strategy"\nstrategyType: trend-following`);
    expect(result.name).toBe("My Strategy");
    expect(result.strategyType).toBe("trend-following");
  });

  it("parses numbers", () => {
    const result = parseSimpleYaml("riskPerTrade: 0.01\nmaxOpenPositions: 3");
    expect(result.riskPerTrade).toBe(0.01);
    expect(result.maxOpenPositions).toBe(3);
  });

  it("parses booleans", () => {
    const result = parseSimpleYaml("active: true\ndisabled: false");
    expect(result.active).toBe(true);
    expect(result.disabled).toBe(false);
  });

  it("parses null and tilde as null", () => {
    const result = parseSimpleYaml("a: null\nb: ~");
    expect(result.a).toBeNull();
    expect(result.b).toBeNull();
  });

  it("parses single-quoted strings", () => {
    const result = parseSimpleYaml("name: 'hello world'");
    expect(result.name).toBe("hello world");
  });

  it("parses simple arrays of scalars", () => {
    const result = parseSimpleYaml("items:\n  - apple\n  - banana\n  - cherry");
    expect(result.items).toEqual(["apple", "banana", "cherry"]);
  });

  it("parses arrays of objects", () => {
    const yaml = `tickers:
  - epic: "IX.D.FTSE.DAILY.IP"
    expiry: "DFB"
    currencyCode: "GBP"
  - epic: "IX.D.DAX.DAILY.IP"
    expiry: "DFB"
    currencyCode: "EUR"`;
    const result = parseSimpleYaml(yaml);
    expect(result.tickers).toEqual([
      { epic: "IX.D.FTSE.DAILY.IP", expiry: "DFB", currencyCode: "GBP" },
      { epic: "IX.D.DAX.DAILY.IP", expiry: "DFB", currencyCode: "EUR" },
    ]);
  });

  it("parses nested objects", () => {
    const yaml = `strategyParams:
  smaPeriodFast: 10
  smaPeriodSlow: 20
  atrPeriod: 14`;
    const result = parseSimpleYaml(yaml);
    expect(result.strategyParams).toEqual({
      smaPeriodFast: 10,
      smaPeriodSlow: 20,
      atrPeriod: 14,
    });
  });

  it("skips comments", () => {
    const result = parseSimpleYaml("# comment\nname: test\n# another comment");
    expect(result.name).toBe("test");
  });

  it("skips blank lines", () => {
    const result = parseSimpleYaml("\n\nname: test\n\nvalue: 42\n\n");
    expect(result.name).toBe("test");
    expect(result.value).toBe(42);
  });

  it("handles empty value as null", () => {
    const result = parseSimpleYaml("key:");
    expect(result.key).toBeNull();
  });

  it("handles bare strings (unquoted)", () => {
    const result = parseSimpleYaml("name: hello world");
    expect(result.name).toBe("hello world");
  });
});

// ---------------------------------------------------------------------------
// parseStrategyPrompt — full prompt parser
// ---------------------------------------------------------------------------

describe("parseStrategyPrompt", () => {
  it("parses a complete prompt with frontmatter and body", () => {
    const prompt = `---
name: "FTSE Trend Follower"
tickers:
  - epic: "IX.D.FTSE.DAILY.IP"
    expiry: "DFB"
    currencyCode: "GBP"
strategyType: "trend-following"
riskPerTrade: 0.01
maxOpenPositions: 3
---

## Trading Rules

Buy when SMA10 crosses above SMA20.
`;

    const result = parseStrategyPrompt(prompt);

    expect(result.frontmatter.name).toBe("FTSE Trend Follower");
    expect(result.frontmatter.strategyType).toBe("trend-following");
    expect(result.frontmatter.riskPerTrade).toBe(0.01);
    expect(result.frontmatter.maxOpenPositions).toBe(3);
    expect(result.frontmatter.tickers).toHaveLength(1);
    expect(result.frontmatter.tickers![0].epic).toBe("IX.D.FTSE.DAILY.IP");
    expect(result.body).toContain("## Trading Rules");
    expect(result.body).toContain("Buy when SMA10 crosses above SMA20.");
  });

  it("returns empty frontmatter when no frontmatter present", () => {
    const prompt = "## Just a plain markdown doc\n\nNo frontmatter here.";
    const result = parseStrategyPrompt(prompt);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe("## Just a plain markdown doc\n\nNo frontmatter here.");
  });

  it("handles empty string", () => {
    const result = parseStrategyPrompt("");
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe("");
  });

  it("handles frontmatter-only prompt (no body)", () => {
    const prompt = `---
strategyType: "breakout"
maxOpenPositions: 5
---`;

    const result = parseStrategyPrompt(prompt);
    expect(result.frontmatter.strategyType).toBe("breakout");
    expect(result.frontmatter.maxOpenPositions).toBe(5);
    expect(result.body).toBe("");
  });

  it("handles body-only prompt (no frontmatter delimiters)", () => {
    const prompt = "Buy FTSE when RSI < 30.\nSell when RSI > 70.";
    const result = parseStrategyPrompt(prompt);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(prompt);
  });

  it("preserves markdown formatting in body", () => {
    const prompt = `---
strategyType: "mean-reversion"
---

# Main Strategy

- Buy on dip
- Sell on rally

> Important: check RSI first

\`\`\`
code block
\`\`\`
`;

    const result = parseStrategyPrompt(prompt);
    expect(result.body).toContain("# Main Strategy");
    expect(result.body).toContain("- Buy on dip");
    expect(result.body).toContain("> Important: check RSI first");
    expect(result.body).toContain("```\ncode block\n```");
  });

  it("handles multiple tickers in frontmatter", () => {
    const prompt = `---
tickers:
  - epic: "IX.D.FTSE.DAILY.IP"
    expiry: "DFB"
    currencyCode: "GBP"
  - epic: "IX.D.DAX.DAILY.IP"
    expiry: "DFB"
    currencyCode: "EUR"
  - epic: "CS.D.AAPL.CFD.IP"
    expiry: "-"
    currencyCode: "USD"
---

Trade all three.
`;

    const result = parseStrategyPrompt(prompt);
    expect(result.frontmatter.tickers).toHaveLength(3);
    expect(result.frontmatter.tickers![0].epic).toBe("IX.D.FTSE.DAILY.IP");
    expect(result.frontmatter.tickers![1].epic).toBe("IX.D.DAX.DAILY.IP");
    expect(result.frontmatter.tickers![2].epic).toBe("CS.D.AAPL.CFD.IP");
    expect(result.frontmatter.tickers![2].expiry).toBe("-");
  });

  it("handles strategyParams in frontmatter", () => {
    const prompt = `---
strategyType: "trend-following"
strategyParams:
  smaPeriodFast: 5
  smaPeriodSlow: 20
  atrPeriod: 14
  atrStopMultiplier: 2.0
  atrTargetMultiplier: 4.0
---

Custom params.
`;

    const result = parseStrategyPrompt(prompt);
    expect(result.frontmatter.strategyParams).toBeDefined();
    expect(result.frontmatter.strategyParams!.smaPeriodFast).toBe(5);
    expect(result.frontmatter.strategyParams!.smaPeriodSlow).toBe(20);
    expect(result.frontmatter.strategyParams!.atrStopMultiplier).toBe(2.0);
  });

  it("ignores unknown frontmatter keys (Zod strips them)", () => {
    const prompt = `---
strategyType: "breakout"
unknownKey: "should be stripped"
anotherUnknown: 42
---

Body text.
`;

    const result = parseStrategyPrompt(prompt);
    expect(result.frontmatter.strategyType).toBe("breakout");
    // Unknown keys should not appear
    expect((result.frontmatter as Record<string, unknown>).unknownKey).toBeUndefined();
  });

  it("throws on invalid frontmatter values (riskPerTrade > 0.1)", () => {
    const prompt = `---
riskPerTrade: 0.5
---

Too risky.
`;

    expect(() => parseStrategyPrompt(prompt)).toThrow();
  });

  it("throws on invalid frontmatter values (maxOpenPositions not positive)", () => {
    const prompt = `---
maxOpenPositions: -1
---

Invalid.
`;

    expect(() => parseStrategyPrompt(prompt)).toThrow();
  });

  it("handles frontmatter with only optional fields", () => {
    const prompt = `---
name: "Minimal"
---

Just a name.
`;

    const result = parseStrategyPrompt(prompt);
    expect(result.frontmatter.name).toBe("Minimal");
    expect(result.frontmatter.tickers).toBeUndefined();
    expect(result.frontmatter.strategyType).toBeUndefined();
    expect(result.frontmatter.riskPerTrade).toBeUndefined();
    expect(result.frontmatter.maxOpenPositions).toBeUndefined();
  });

  it("handles frontmatter with all fields populated", () => {
    const prompt = `---
name: "Full Strategy"
tickers:
  - epic: "IX.D.FTSE.DAILY.IP"
    expiry: "DFB"
    currencyCode: "GBP"
strategyType: "sentiment-contrarian"
riskPerTrade: 0.02
maxOpenPositions: 10
strategyParams:
  smaPeriodFast: 8
  smaPeriodSlow: 21
  atrPeriod: 14
  atrStopMultiplier: 1.5
  atrTargetMultiplier: 3.0
---

Full strategy with everything.
`;

    const result = parseStrategyPrompt(prompt);
    expect(result.frontmatter.name).toBe("Full Strategy");
    expect(result.frontmatter.strategyType).toBe("sentiment-contrarian");
    expect(result.frontmatter.riskPerTrade).toBe(0.02);
    expect(result.frontmatter.maxOpenPositions).toBe(10);
    expect(result.frontmatter.tickers).toHaveLength(1);
    expect(result.frontmatter.strategyParams!.smaPeriodFast).toBe(8);
    expect(result.body).toBe("Full strategy with everything.");
  });
});
