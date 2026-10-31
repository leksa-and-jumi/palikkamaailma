// Records the Halloween characters' lines with ElevenLabs (through
// OpenRouter) into public/voices/, and lists them in src/audio/voiceLines.json
// (line id → seconds). Only new or changed lines are recorded, so running it
// again costs nothing; lines that are gone are deleted.
//
// The lines are found in the characters' code: intro/defeat/escape and
// every say(who, '…'). Lines in (brackets) are not spoken.
//
// Usage: OPENROUTER_API_KEY=… node scripts/voices.mjs   (or the key in .env.local)
//        node scripts/voices.mjs --list   shows the lines without recording
// Needs macOS afconvert to make the small .m4a files.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { voiceId } from '../src/audio/voiceId.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public/voices');
const LIST = path.join(ROOT, 'src/audio/voiceLines.json');
const MODEL = 'elevenlabs/eleven-v4';

/** Each character's file, voice (chosen by the parent) and way of speaking. */
const CAST = [
  { file: 'pumpkinKing.ts', voice: 'adam', style: '[booming, pompous]' },
  { file: 'mistMaiden.ts', voice: 'lily', style: '[whispers]' },
  { file: 'count.ts', voice: 'george', style: '[slow, sinister]' },
  { file: 'captain.ts', voice: 'bill', style: '[gruff, pirate]' },
  { file: 'spiderQueen.ts', voice: 'matilda', style: '[hissing]' },
  { file: 'silent.ts', voice: 'roger', style: '[very slow, deep whisper]' },
  { file: 'ikiyo.ts', voice: 'harry', style: '[raspy, monstrous, unhinged]' },
];

function apiKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  for (const file of ['.env.local', '../palikkamaailma/.env.local']) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    const line = fs
      .readFileSync(p, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('OPENROUTER_API_KEY='));
    if (line) return line.slice('OPENROUTER_API_KEY='.length).trim();
  }
  throw new Error('OPENROUTER_API_KEY puuttuu');
}

/** All the words a character says in its file. */
function linesIn(file) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(path.join(ROOT, 'src/mods/halloween', file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const found = new Set();
  const strings = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) found.add(node.text);
    ts.forEachChild(node, strings);
  };
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ['intro', 'defeat', 'escape'].includes(node.name.getText(source))
    ) {
      strings(node.initializer);
    }
    // api.say(who, '…') and a character's own say(api, '…').
    if (
      ts.isCallExpression(node) &&
      node.arguments[1] &&
      ((ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'say') ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'say'))
    ) {
      strings(node.arguments[1]);
    }
    // Lists of lines (TAUNTS, SCREAMS, HIT_LINES).
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      /^(TAUNTS|SCREAMS|[A-Z_]*LINES)$/.test(node.name.text) &&
      node.initializer
    ) {
      strings(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...found].filter((t) => /\p{L}/u.test(t) && !t.trim().startsWith('('));
}

async function record(key, voice, text, out) {
  const res = await fetch('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, voice, input: text, response_format: 'mp3' }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const mp3 = path.join(os.tmpdir(), `voice-${process.pid}.mp3`);
  fs.writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
  // Small mono AAC: voices do not need more.
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-c', '1', '-b', '48000', mp3, out]);
  const info = execFileSync('afinfo', [out], { encoding: 'utf8' });
  fs.unlinkSync(mp3);
  return Number(/estimated duration: ([\d.]+)/.exec(info)?.[1] ?? 0);
}

if (process.argv.includes('--list')) {
  for (const who of CAST)
    for (const text of linesIn(who.file)) console.log(`${who.voice}: ${text}`);
  process.exit(0);
}

const key = apiKey();
fs.mkdirSync(OUT, { recursive: true });
const old = fs.existsSync(LIST) ? JSON.parse(fs.readFileSync(LIST, 'utf8')) : {};
const list = {};
let letters = 0;
for (const who of CAST) {
  for (const text of linesIn(who.file)) {
    const id = voiceId(text);
    const file = path.join(OUT, `${id}.m4a`);
    if (old[id] && fs.existsSync(file)) {
      list[id] = old[id];
      continue;
    }
    // {tags} in a line become the voice's own tags ([screams], [whispers]…).
    const spoken = text.replace(/\{([^}]*)\}/g, '[$1]');
    const seconds = await record(key, who.voice, `${who.style} ${spoken}`, file);
    list[id] = Math.round(seconds * 10) / 10;
    letters += text.length;
    console.log(`🎙️ ${who.voice}: ${text} (${list[id]} s)`);
  }
}
for (const name of fs.readdirSync(OUT)) {
  if (!list[name.replace(/\.m4a$/, '')]) fs.unlinkSync(path.join(OUT, name));
}
const sorted = Object.fromEntries(Object.entries(list).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(LIST, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(
  `Valmis: ${Object.keys(list).length} repliikkiä, uusia ${letters} merkkiä (~$${((letters * 80) / 1e6).toFixed(2)}).`,
);
