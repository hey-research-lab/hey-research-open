/**
 * Golden baselines (multichain WP1.0, 2026-11-11): test-only helpers, never imported by runtime code.
 *
 * Phase 1 of the multichain plan (a private HEY record §6) promises "no visible change": every
 * page, API answer, count, report, dataset and npm package behaves exactly as before. These helpers turn a surface into
 * text that a golden file can hold, so a test fails when that surface moves:
 *
 * - `goldenJson` keeps every value, in the order the code emitted it (key order is part of a JSON answer's bytes). An
 *   `undefined` property is written as `"[undefined]"`, so a key that exists with no value is told apart from a key that
 *   does not exist; a `Set` and a `Map` are written as arrays.
 * - `goldenShape` keeps the structure — every key and the type of every leaf — and the values of the keys named in
 *   `keep` (a `chainId`, a `status`, a `reason`). It is for answers read from a seeded database, whose dates and counts
 *   move with the clock and the fixture; what a partner parses is the keys and the meaning-bearing values.
 *
 * The production capture script (`scripts/golden-capture.mjs`) carries its own copy of the shape rule in plain
 * JavaScript, since it runs with no build step.
 */

export const GOLDEN_UNDEFINED = '[undefined]';

const goldenReplacer = (_key: string, value: unknown): unknown => {
  if (value === undefined) return GOLDEN_UNDEFINED;
  if (typeof value === 'bigint') return `${value.toString()}n`;
  if (value instanceof Set) return [...value];
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof RegExp) return value.toString();
  if (typeof value === 'function') return `[function ${(value as { name?: string }).name || 'anonymous'}]`;
  return value;
};

/** Every value, in emission order, two-space indented and newline-terminated. */
export function goldenJson(value: unknown): string {
  return `${JSON.stringify(value, goldenReplacer, 2)}\n`;
}

export type GoldenShapeOptions = {
  /** Keys whose values are kept as they are (at any depth). Every other leaf becomes its type name. */
  keep?: readonly string[];
  /**
   * `false` writes every array as `"array"`, its items unread: for a payload whose lists fill or empty with the calendar
   * (a weekly report built from a seed dated relative to today), where the items' shape would move with the weekday.
   */
  arrayItems?: boolean;
};

type Shape = string | Shape[] | { [key: string]: Shape };

const leafType = (value: unknown): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (value instanceof Date) return 'date';
  return typeof value;
};

/** Two shapes of array items folded into one: keys unioned in first-seen order, differing leaves joined with `|`. */
function mergeShapes(a: Shape, b: Shape): Shape {
  if (typeof a === 'string' && typeof b === 'string') {
    if (a === b) return a;
    return [...new Set([...a.split('|'), ...b.split('|')])].sort().join('|');
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const merged = [...a, ...b];
    return merged.length === 0 ? [] : [merged.reduce(mergeShapes)];
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const out: { [key: string]: Shape } = {};
    for (const key of Object.keys(a)) out[key] = key in b ? mergeShapes(a[key]!, b[key]!) : a[key]!;
    for (const key of Object.keys(b)) if (!(key in out)) out[key] = b[key]!;
    return out;
  }
  // An object in one item and a leaf in another: say both, never drop either.
  return `${JSON.stringify(a)}|${JSON.stringify(b)}`;
}

type ShapeRules = { keep: ReadonlySet<string>; arrayItems: boolean };

function shapeOf(value: unknown, rules: ShapeRules, key: string | undefined): Shape {
  if (key !== undefined && rules.keep.has(key) && (value === null || typeof value !== 'object' || Array.isArray(value))) {
    return JSON.stringify(value === undefined ? GOLDEN_UNDEFINED : value);
  }
  if (Array.isArray(value)) {
    if (!rules.arrayItems) return 'array';
    if (value.length === 0) return [];
    return [value.map((item) => shapeOf(item, rules, undefined)).reduce(mergeShapes)];
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const out: { [key: string]: Shape } = {};
    for (const [childKey, child] of Object.entries(value)) out[childKey] = shapeOf(child, rules, childKey);
    return out;
  }
  return leafType(value);
}

/**
 * The structure of a value: every key in emission order, every leaf as its type (`string`, `number`, `boolean`,
 * `null`), arrays as the union of their items' shapes, and the values of `keep` keys as JSON. An empty array is `[]`:
 * the golden then says the fixture held nothing there, which is itself a fact worth noticing when it changes.
 */
export function goldenShape(value: unknown, options: GoldenShapeOptions = {}): string {
  return goldenJson(shapeOf(value, { keep: new Set(options.keep ?? []), arrayItems: options.arrayItems ?? true }, undefined));
}
