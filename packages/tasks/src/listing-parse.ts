import { PRODUCT_LIMITS, listingProposalSchema, type ListingProposal } from "@oia/schema";

/**
 * W1.2 door 3: pasted listing text → proposals, 0 AI by design. The paste IS
 * the owner's data (13/11 model: the description exists already); the parser
 * only splits a name line and finds VN price spans for the always-highlight
 * rule. No network, no quota, deterministic: this module must stay pure so the
 * renderer, the loopback API and tests share one behavior (the language-field
 * lesson: two implementations drift apart).
 */

/** VN price shapes a seller actually types: 129.000đ / 129.000 đ / 1.299.000 VND /
 *  250k / 1tr2 / 1.2tr / 99.000₫. Dots are thousand separators here, NOT decimals.
 *  No \b after the suffix: đ/₫ are non-ASCII, \b goes blind behind them (found
 *  by the W1.2 test fixtures); a Unicode lookahead does the edge instead. */
const PRICE_RE = /(?:\d{1,3}(?:\.\d{3})+|\d[\d.]*)\s*(?:đ|₫|vnd|vnđ)(?![\p{L}\p{N}])|(?:\d+(?:\.\d+)?)\s*(?:k|tr)\d*(?![\p{L}\p{N}])/giu;

export function findPriceSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  for (const m of text.matchAll(PRICE_RE)) {
    if (m[0].length > 0) spans.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
    if (spans.length >= 50) break;
  }
  return spans;
}

export function parsePastedListing(text: string): ListingProposal {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Paste the listing text first.");
  if (trimmed.length > PRODUCT_LIMITS.description) {
    throw new Error(`The paste is ${trimmed.length} characters, the limit is ${PRODUCT_LIMITS.description}.`);
  }
  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  // Name = first line when it looks like one (short, not a sentence pile)
  const first = lines[0] ?? "";
  const name = first.length <= PRODUCT_LIMITS.name ? first : "";
  return listingProposalSchema.parse({
    name,
    description: trimmed,
    brand: "",
    priceSpans: findPriceSpans(trimmed),
    source: "pasted text",
  });
}
