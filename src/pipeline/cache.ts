import { LRUCache } from 'lru-cache';

// Cache for tiled sheets (keyed by `${type}:${angle}:${w}x${h}`)
export const tileSheetCache = new LRUCache<string, Buffer>({ max: 64, ttl: 1000 * 60 * 5 });

// Cache for masks (keyed by `${bin}:${w}x${h}:${hash}`)
export const maskCache = new LRUCache<string, Buffer>({ max: 128, ttl: 1000 * 60 * 2 });

export function keyTile(type: string, angle: number, w: number, h: number) {
  return `${type}:${angle}:${w}x${h}`;
}

export function keyMask(bin: number, w: number, h: number, sig: string) {
  return `${bin}:${w}x${h}:${sig}`;
}
