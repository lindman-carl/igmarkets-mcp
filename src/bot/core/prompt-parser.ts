/**
 * Strategy Prompt Parser
 *
 * Parses a markdown strategy prompt that contains a YAML frontmatter header
 * and a free-form markdown body.
 *
 * Format:
 * ```markdown
 * ---
 * name: "My Strategy"
 * tickers:
 *   - epic: "IX.D.FTSE.DAILY.IP"
 *     expiry: "DFB"
 *     currencyCode: "GBP"
 * strategyType: "trend-following"
 * riskPerTrade: 0.01
 * maxOpenPositions: 3
 * ---
 *
 * ## Trading Rules
 *
 * Buy when SMA10 crosses above SMA20...
 * ```
 *
 * The frontmatter is validated against StrategyPromptFrontmatterSchema.
 * The body is returned as-is (trimmed).
 */

import {
  StrategyPromptFrontmatterSchema,
  type ParsedStrategyPrompt,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// Frontmatter delimiter pattern
// ---------------------------------------------------------------------------

/**
 * Matches a YAML frontmatter block delimited by `---` at the start of a string.
 * Captures the content between the delimiters.
 */
const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;

// ---------------------------------------------------------------------------
// Minimal YAML-subset parser
// ---------------------------------------------------------------------------

/**
 * Parse a minimal YAML subset into a plain object.
 *
 * Supports:
 * - Scalar key-value pairs:  `key: value`
 * - Quoted strings:          `key: "value"` or `key: 'value'`
 * - Numbers:                 `key: 42` or `key: 0.01`
 * - Booleans:                `key: true` / `key: false`
 * - Simple arrays of scalars or objects (2-space indent):
 *     ```
 *     items:
 *       - value1
 *       - value2
 *     ```
 *   or:
 *     ```
 *     items:
 *       - key1: value1
 *         key2: value2
 *     ```
 * - Nested objects (one level):
 *     ```
 *     strategyParams:
 *       smaPeriodFast: 10
 *       smaPeriodSlow: 20
 *     ```
 *
 * This is intentionally simple — no multi-line strings, anchors, tags, etc.
 */
export function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    // Skip blank lines and comments
    if (trimmed === "" || trimmed.startsWith("#")) {
      i++;
      continue;
    }

    // Top-level key: value
    const kvMatch = trimmed.match(/^(\w[\w.-]*)\s*:\s*(.*)/);
    if (!kvMatch) {
      i++;
      continue;
    }

    const key = kvMatch[1];
    const inlineValue = kvMatch[2].trim();

    if (inlineValue === "" || inlineValue === "|" || inlineValue === ">") {
      // Could be an array or nested object — look ahead
      const children = collectIndented(lines, i + 1);
      i = children.nextIndex;

      if (children.lines.length === 0) {
        result[key] = inlineValue === "" ? null : "";
        continue;
      }

      // Determine if it's an array (first non-empty child starts with "- ")
      const firstChild = children.lines.find((l) => l.trim() !== "");
      if (firstChild && firstChild.trim().startsWith("- ")) {
        result[key] = parseYamlArray(children.lines);
      } else {
        result[key] = parseYamlObject(children.lines);
      }
    } else {
      result[key] = parseScalar(inlineValue);
      i++;
    }
  }

  return result;
}

/** Collect lines that are indented more than the current level. */
function collectIndented(
  lines: string[],
  startIdx: number,
): { lines: string[]; nextIndex: number } {
  const collected: string[] = [];
  let i = startIdx;
  while (i < lines.length) {
    const line = lines[i];
    // Empty lines are part of the block
    if (line.trim() === "") {
      collected.push(line);
      i++;
      continue;
    }
    // If it starts with spaces (indented), it's part of the block
    if (/^\s+/.test(line)) {
      collected.push(line);
      i++;
    } else {
      break;
    }
  }
  // Trim trailing empty lines
  while (
    collected.length > 0 &&
    collected[collected.length - 1].trim() === ""
  ) {
    collected.pop();
  }
  return { lines: collected, nextIndex: i };
}

/** Parse an indented YAML array block into an array of values. */
function parseYamlArray(lines: string[]): unknown[] {
  const result: unknown[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      i++;
      continue;
    }

    const arrayMatch = trimmed.match(/^-\s*(.*)/);
    if (!arrayMatch) {
      i++;
      continue;
    }

    const afterDash = arrayMatch[1].trim();

    // Check if this array item has key-value pairs (object)
    const kvMatch = afterDash.match(/^(\w[\w.-]*)\s*:\s*(.*)/);
    if (kvMatch) {
      // Object item — collect this line + any continuation lines
      const obj: Record<string, unknown> = {};
      obj[kvMatch[1]] = parseScalar(kvMatch[2].trim());

      // Look for continuation lines (indented further than the "- ")
      i++;
      while (i < lines.length) {
        const contLine = lines[i];
        const contTrimmed = contLine.trim();
        if (contTrimmed === "" || contTrimmed.startsWith("#")) {
          i++;
          continue;
        }
        // If it starts with "- " at the same indent, it's a new array item
        if (contTrimmed.startsWith("- ")) break;
        // It's a continuation of the object
        const contKv = contTrimmed.match(/^(\w[\w.-]*)\s*:\s*(.*)/);
        if (contKv) {
          obj[contKv[1]] = parseScalar(contKv[2].trim());
        }
        i++;
      }
      result.push(obj);
    } else if (afterDash !== "") {
      // Scalar item
      result.push(parseScalar(afterDash));
      i++;
    } else {
      i++;
    }
  }

  return result;
}

/** Parse an indented YAML object block. */
function parseYamlObject(lines: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const kvMatch = trimmed.match(/^(\w[\w.-]*)\s*:\s*(.*)/);
    if (kvMatch) {
      result[kvMatch[1]] = parseScalar(kvMatch[2].trim());
    }
  }
  return result;
}

/** Parse a YAML scalar value. */
function parseScalar(value: string): unknown {
  if (value === "") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;

  // Quoted string
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  // Number
  const num = Number(value);
  if (!isNaN(num) && value !== "") return num;

  // Bare string
  return value;
}

// ---------------------------------------------------------------------------
// Main Parser
// ---------------------------------------------------------------------------

/**
 * Parse a strategy prompt's markdown content into structured frontmatter
 * and a free-form body.
 *
 * @param prompt - The full markdown prompt string
 * @returns Parsed frontmatter (validated by Zod) and the remaining body
 */
export function parseStrategyPrompt(prompt: string): ParsedStrategyPrompt {
  const match = prompt.match(FRONTMATTER_RE);

  if (!match) {
    // No frontmatter — entire string is body
    return {
      frontmatter: {},
      body: prompt.trim(),
    };
  }

  const yamlContent = match[1];
  const body = prompt.slice(match[0].length).trim();

  const raw = parseSimpleYaml(yamlContent);
  const frontmatter = StrategyPromptFrontmatterSchema.parse(raw);

  return { frontmatter, body };
}
