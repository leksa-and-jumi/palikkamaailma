// Background music (made by scripts/music.mjs). Like in Minecraft, a calm
// track plays now and then with long quiet gaps between, chosen for where
// you are (day, night, a cave, the Nether). A mod can ask for its own track
// (a Halloween character's): it plays very quietly on a loop while the
// character is here, and the calm music waits.

import tracks from './musicTracks.json';
import { audioSettings, onAudioChange } from './settings';

export type Place = 'day' | 'night' | 'cave' | 'nether' | 'menu';

const CALM: Record<Place, readonly string[]> = {
  day: ['aamu', 'niitty', 'puro'],
  night: ['tahdet', 'puro'],
  cave: ['luola'],
  nether: ['nether'],
  menu: ['valikko'],
};
/** Quiet, like in Minecraft: music is a background, not the main thing. */
const CALM_VOLUME = 0.22;
const MOD_VOLUME = 0.16;
const MENU_VOLUME = 0.25;
const FIRST_WAIT: [number, number] = [20, 60];
/** Seconds of quiet between calm tracks. */
const GAP: [number, number] = [150, 360];
const FADE_IN = 4;
const FADE_OUT = 2.5;

const known: Readonly<Record<string, number>> = tracks;
const between = ([a, b]: [number, number]) => a + Math.random() * (b - a);

export class Music {
  private audio: HTMLAudioElement | null = null;
  private track: string | null = null;
  private target = 0;
  private wait = between(FIRST_WAIT);
  private modTrack: string | null = null;
  private last: string | null = null;
  private place: Place | null = null;

  constructor() {
    onAudioChange(() => {
      if (!audioSettings.music) this.stop(true);
    });
  }

  /** A mod's track (null = back to the calm music). */
  setModTrack(id: string | null): void {
    const track = id && known[id] ? id : null;
    if (track === this.modTrack) return;
    this.modTrack = track;
    if (track) this.play(track, MOD_VOLUME, true);
    else if (this.track && !CALM_TRACKS.has(this.track)) {
      this.stop(false);
      this.wait = between(FIRST_WAIT);
    }
  }

  /** Every frame, with where you are now. */
  update(dt: number, place: Place): void {
    if (place !== this.place) {
      // The title screen has its own tune; leaving it ends it.
      if (this.place === null || this.place === 'menu' || place === 'menu') {
        this.stop(false);
        this.wait = place === 'menu' ? 1.5 : between(FIRST_WAIT);
      }
      this.place = place;
    }
    const a = this.audio;
    if (a) {
      // Slow fades, so music never starts or stops with a jump.
      if (a.volume < this.target) {
        a.volume = Math.min(this.target, a.volume + (dt * this.target) / FADE_IN);
      } else if (a.volume > this.target) {
        a.volume = Math.max(this.target, a.volume - (dt * Math.max(a.volume, 0.05)) / FADE_OUT);
      }
      if (this.target === 0 && a.volume <= 0.001) this.drop();
      return;
    }
    if (!audioSettings.music || this.modTrack) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    const choices = CALM[place].filter((t) => known[t] && t !== this.last);
    const pick = choices[Math.floor(Math.random() * choices.length)] ?? CALM[place][0];
    if (pick && known[pick]) {
      this.play(pick, place === 'menu' ? MENU_VOLUME : CALM_VOLUME, place === 'menu');
    }
    this.wait = between(GAP);
  }

  private play(id: string, volume: number, loop: boolean): void {
    if (!audioSettings.music) return;
    this.drop();
    const audio = new Audio(`${import.meta.env.BASE_URL}music/${id}.m4a`);
    audio.volume = 0;
    audio.loop = loop;
    audio.addEventListener('ended', () => {
      if (this.audio === audio) this.drop();
    });
    void audio.play().catch(() => {
      // Not allowed before the first click: try again a bit later.
      if (this.audio === audio) this.drop();
      this.wait = 5;
    });
    this.audio = audio;
    this.track = id;
    this.last = id;
    this.target = volume;
  }

  /** Fades out (or stops at once). */
  private stop(now: boolean): void {
    if (now) this.drop();
    else this.target = 0;
  }

  private drop(): void {
    this.audio?.pause();
    this.audio = null;
    this.track = null;
    this.target = 0;
  }
}

const CALM_TRACKS = new Set(Object.values(CALM).flat());

export const music = new Music();
