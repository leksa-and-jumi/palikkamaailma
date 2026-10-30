// The yellow splash text under the title (the title itself is 3D blocks,
// see src/render/logo3d.ts).

const SPLASHES = [
  'Nyt Netherillä!',
  'Kaivosvaunuja!',
  'Juliuksen ja Leon peli!',
  'Kuuhyppy!',
  '100 % palikoita!',
  'Kutsu kaveri!',
  'Varo creeperiä!',
  'Taikarakentaja!',
  'Rakenna korkealle!',
  'Pokaaleja!',
];

export function randomSplash(): string {
  return SPLASHES[Math.floor(Math.random() * SPLASHES.length)]!;
}
