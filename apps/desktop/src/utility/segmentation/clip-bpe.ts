/** CLIP byte-pair encoder for SAM 3 text prompts (D21).
 *  SAM 3's language tower is CLIP's: BPE vocab 49408, SOT 49406 / EOT 49407,
 *  prompts cut to 32. Pure TS port of the reference simple_tokenizer (OpenAI),
 *  no dependency; vocab.json + merges.txt are downloaded with the models.
 *  GPT-2 byte-level unicode mapping keeps every byte encodable. */

const byteEncoder = (() => {
  const bs = [...range(33, 127), ...range(161, 173), ...range(174, 256)];
  const cs = [...bs];
  let n = 0;
  for (let b = 0; b < 256; b++) if (!bs.includes(b)) { bs.push(b); cs.push(256 + n++); }
  return new Map(bs.map((b, i) => [b, String.fromCharCode(cs[i])]));
})();

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i < to; i++) out.push(i);
  return out;
}

const PAT = /<\|startoftext\|>|<\|endoftext\|>|'s|'t|'re|'ve|'m|'ll|'d|[a-z]+|[0-9]|[^\sa-z0-9]+/gi;

export type ClipTokenizer = {
  /** lowercase + whitespace-collapsed phrase → ids, SOT/EOT included, pad 0 to 32. */
  encodePhrase(phrase: string): number[];
};

export function createClipTokenizer(vocabJson: string, mergesText: string): ClipTokenizer {
  const encoder: Map<string, number> = new Map(Object.entries(JSON.parse(vocabJson) as Record<string, number>));
  const merges = mergesText.split("\n").slice(1).filter((l) => l.trim() && l.split(" ").length === 2);
  const ranks = new Map<string, number>(merges.map((l, i) => [l, i]));
  const cache = new Map<string, string[]>();

  function bpe(token: string): string[] {
    const hit = cache.get(token);
    if (hit) return hit;
    let word: string[] = [...token];
    for (;;) {
      let bestPair: [string, string] | null = null;
      let bestRank = Infinity;
      for (let i = 0; i < word.length - 1; i++) {
        const r = ranks.get(`${word[i]} ${word[i + 1]}`) ?? Infinity;
        if (r < bestRank) { bestRank = r; bestPair = [word[i], word[i + 1]]; }
      }
      if (!bestPair) break;
      const [f, s] = bestPair;
      const next: string[] = [];
      for (let i = 0; i < word.length;) {
        if (i < word.length - 1 && word[i] === f && word[i + 1] === s) { next.push(f + s); i += 2; }
        else { next.push(word[i]); i++; }
      }
      word = next;
    }
    cache.set(token, word);
    return word;
  }

  return {
    encodePhrase(phrase: string): number[] {
      const clean = phrase.toLowerCase().replace(/\s+/g, " ").trim();
      const ids: number[] = [49406];
      for (const raw of clean.match(PAT) ?? []) {
        const mapped = [...raw].map((c) => byteEncoder.get(c.charCodeAt(0)) ?? "").join("");
        for (const t of bpe(mapped)) {
          const id = encoder.get(t);
          if (id !== undefined) ids.push(id);
        }
      }
      ids.push(49407);
      while (ids.length < 32) ids.push(0);
      return ids.slice(0, 32);
    },
  };
}
