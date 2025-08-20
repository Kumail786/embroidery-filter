import { distanceTransform } from './utils.ts';

export interface WarningResult { warnings: string[] }

export function computeWarnings(
  alphaMask: Uint8Array,
  width: number,
  height: number,
  threadThickness: number,
  edgeMask?: Uint8Array,
  maxColors?: number,
  paletteSize?: number
): WarningResult {
  const warnings: string[] = [];

  // Thin strokes: use distance transform on alpha to estimate min stroke width
  const distIn = distanceTransform(alphaMask, width, height);
  let minStroke = Infinity; let samples = 0;
  for (let i = 0; i < distIn.length; i++) {
    if (alphaMask[i]) { minStroke = Math.min(minStroke, Number(distIn[i] ?? 0) * 2); samples++; }
  }
  if (samples > 0 && minStroke < threadThickness) {
    warnings.push('Thin strokes may not embroider cleanly');
  }

  // High edge density
  if (edgeMask) {
    let on = 0; for (let i = 0; i < edgeMask.length; i++) on += edgeMask[i] ? 1 : 0;
    const ratio = on / edgeMask.length;
    if (ratio > 0.12) warnings.push('Dense detail may fill in on fabric');
  }

  // Palette reduction notice
  if (typeof maxColors === 'number' && typeof paletteSize === 'number' && paletteSize > maxColors) {
    warnings.push(`Reduced colors to ${maxColors}`);
  }

  return { warnings };
}
