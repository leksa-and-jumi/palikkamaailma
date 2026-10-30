// The file name of a recorded line: the same in the game and in
// scripts/voices.mjs, so a line finds its voice (FNV-1a of the text).

export function voiceId(text: string): string {
  let h = 0x811c9dc5;
  for (const ch of text.normalize('NFC')) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
