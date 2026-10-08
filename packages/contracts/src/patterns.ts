/** Finite, reviewed regex set for the initial portable profile; other patterns are unsupported. */
export const PORTABLE_PATTERNS = {
  blockId:
    "^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26})$(?![\\s\\S])",
  blockType:
    "^[^\\u0009-\\u000D\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF:]+:[^\\u0009-\\u000D\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+$(?![\\s\\S])",
  label: "^[A-Za-z][A-Za-z0-9_:.-]*$(?![\\s\\S])",
  integerString: "^-?(?:0|[1-9][0-9]*)$(?![\\s\\S])",
  decimalString: "^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$(?![\\s\\S])",
  nonblank:
    "[^\\u0009-\\u000D\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]",
  dateTime:
    "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$(?![\\s\\S])",
} as const;
