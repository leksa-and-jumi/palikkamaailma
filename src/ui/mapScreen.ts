// The big map window (M): zoom in and out, see where everyone is.

import { MAP } from '../config';
import { drawMap, type MapMarker, type MapTiles } from './worldMap';

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

export class MapScreen {
  private zoom = 1;
  private close: (() => void) | null = null;

  get isOpen(): boolean {
    return this.close !== null;
  }

  /** Blocks from the middle to the edge at this zoom (for making the pictures). */
  get radius(): number {
    const canvas = $('big-map') as HTMLCanvasElement;
    return (canvas.width / 2) * (MAP.zooms[this.zoom] ?? 1);
  }

  open(onClose: () => void): void {
    $('map-screen').hidden = false;
    const close = () => {
      $('map-screen').hidden = true;
      window.removeEventListener('keydown', keys);
      this.close = null;
      onClose();
    };
    const keys = (e: KeyboardEvent) => {
      if (e.code === 'KeyM' || e.code === 'Escape') close();
      else if (e.key === '+' || e.code === 'NumpadAdd') this.zoomBy(-1);
      else if (e.key === '-' || e.code === 'NumpadSubtract') this.zoomBy(1);
    };
    // The key that opened the map must not close it straight away.
    setTimeout(() => window.addEventListener('keydown', keys), 0);
    $('map-close').onclick = close;
    $('map-screen').onmousedown = (e) => {
      if (e.target === $('map-screen')) close();
    };
    $('map-in').onclick = () => this.zoomBy(-1);
    $('map-out').onclick = () => this.zoomBy(1);
    this.close = close;
  }

  private zoomBy(step: number): void {
    this.zoom = Math.max(0, Math.min(MAP.zooms.length - 1, this.zoom + step));
  }

  draw(tiles: MapTiles, x: number, z: number, markers: readonly MapMarker[]): void {
    if (!this.isOpen) return;
    const canvas = $('big-map') as HTMLCanvasElement;
    drawMap(canvas, tiles, x, z, MAP.zooms[this.zoom] ?? 1, markers);
    $('map-info').textContent =
      `📍 x ${Math.floor(x)}, z ${Math.floor(z)} · ➕ ➖ zoomaa · M sulkee`;
  }
}
