// Music and sounds on or off, remembered on this device.

import { loadAudio, saveAudio, type AudioSettings } from '../data/storage';

export const audioSettings: AudioSettings = loadAudio();

const listeners: (() => void)[] = [];

/** Turns music or sounds on or off (and remembers it). */
export function setAudio(change: Partial<AudioSettings>): void {
  Object.assign(audioSettings, change);
  saveAudio(audioSettings);
  for (const listener of listeners) listener();
}

export function onAudioChange(listener: () => void): void {
  listeners.push(listener);
}
