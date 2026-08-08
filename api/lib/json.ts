/**
 * Writers are prompted for bare JSON, but models occasionally wrap it in a code
 * fence or a sentence of preamble. This pulls the first balanced JSON value out
 * of a response so one chatty writer doesn't drop a whole group.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  const candidates = fenced ? [fenced[1].trim(), trimmed] : [trimmed];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      const balanced = firstBalancedValue(candidate);
      if (balanced !== null) {
        try {
          return JSON.parse(balanced);
        } catch {
          // fall through to the next candidate
        }
      }
    }
  }

  throw new Error(`no JSON value found in model output: ${trimmed.slice(0, 200)}`);
}

/** Scans for the first `{...}` or `[...]` with balanced brackets, string-aware. */
function firstBalancedValue(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start === -1) return null;

  const openChar = text[start];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === openChar) depth++;
    else if (char === closeChar) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}
