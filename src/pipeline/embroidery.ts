import sharp from 'sharp';
import { quantizeColors } from './quantize.ts';
import { detectEdges } from './edges.ts';
import { computeOrientation } from './orientation.ts';
import { compositeImage } from './composite.ts';
import { generateTextures } from './textures.ts';
import { extractAlpha } from './utils.ts';
import { computeWarnings } from './warnings.ts';

// Types
interface EmbroideryOptions {
  maxColors: number;
  threadThickness: number;
  preserveTransparency: boolean;
  hatch: 'none' | 'diagonal' | 'cross';
  background: { type: 'color' | 'fabric'; hex?: string; name?: string } | null;
  style: { orientation: 'binned-8' | 'lic'; edges: 'canny' | 'xdog'; mode?: 'photo' | 'logo' };
  lighting?: { sheen?: number };
  border?: { stitch?: boolean; width?: number };
  density?: { scale?: number };
  grain?: { randomness?: number };
}

interface ProcessingResult { buffer: Buffer; mime: string; meta?: { paletteSize: number; originalSize: { width: number; height: number }; finalSize: { width: number; height: number }; palette?: Array<{ r:number; g:number; b:number; a:number }>; warnings?: string[]; timings?: Record<string, number> } }

export async function processEmbroidery(input: Buffer, mime: string, options: EmbroideryOptions): Promise<ProcessingResult> {
  const timings: Record<string, number> = {};
  const t0 = process.hrtime.bigint();
  try {
    const n0 = process.hrtime.bigint();
    const normalized = await normalizeImage(input, mime);
    const n1 = process.hrtime.bigint();
    timings.normalizeMs = Number(n1 - n0) / 1e6;

    // Vector fast-path removed during cleanup; using raster pipeline for all modes

    const q0 = process.hrtime.bigint();
    const quantized = await quantizeColors(normalized, options.maxColors);
    const q1 = process.hrtime.bigint();
    timings.quantizeMs = Number(q1 - q0) / 1e6;

    // **PARALLEL PROCESSING**: Run edges and orientation concurrently since both only depend on quantized data
    const eo0 = process.hrtime.bigint();
    const [edges, orientation] = await Promise.all([
      detectEdges(quantized, { threadThickness: options.threadThickness, edgeMode: options.style?.mode === 'logo' ? 'logo' : 'photo' }),
      computeOrientation(quantized, options.style.orientation, options.style?.mode === 'logo' ? 'logo' : 'photo')
    ]);
    const eo1 = process.hrtime.bigint();
    timings.edgesOrientationParallelMs = Number(eo1 - eo0) / 1e6;

    const densityScaleVal = options.density?.scale !== undefined ? options.density.scale : 1;
    const grainVal = options.grain?.randomness !== undefined ? options.grain.randomness : 0.15;
    const sheenVal = options.lighting?.sheen !== undefined ? options.lighting.sheen : 0.25;

    const tgen0 = process.hrtime.bigint();
    const textures = await generateTextures(quantized, orientation, {
      threadThickness: options.threadThickness,
      hatch: options.hatch,
      densityScale: densityScaleVal,
      grainRandomness: grainVal,
      sheen: sheenVal
    });
    const tgen1 = process.hrtime.bigint();
    timings.texturesMs = Number(tgen1 - tgen0) / 1e6;

    const c0 = process.hrtime.bigint();
    const final = await compositeImage(quantized, textures, edges, orientation, {
      threadThickness: options.threadThickness,
      preserveTransparency: options.preserveTransparency,
      sheen: sheenVal,
      densityScale: densityScaleVal,
      borderStitch: options.border?.stitch !== false
    });
    const c1 = process.hrtime.bigint();
    timings.compositeMs = Number(c1 - c0) / 1e6;

    const b0 = process.hrtime.bigint();
    const result = await applyBackgroundLocal(final, options);
    const b1 = process.hrtime.bigint();
    timings.backgroundMs = Number(b1 - b0) / 1e6;

    const alpha = extractAlpha(quantized.data, quantized.info as any);
    const wr = computeWarnings(alpha, quantized.info.width, quantized.info.height, options.threadThickness, edges.edgeMap, options.maxColors, quantized.paletteSize);

    const t1 = process.hrtime.bigint();
    timings.totalMs = Number(t1 - t0) / 1e6;

    console.log(JSON.stringify({ level: 'info', msg: 'embroidery.timings', timings }));

    return {
      buffer: result.buffer,
      mime: result.mime,
      meta: {
        paletteSize: quantized.paletteSize,
        originalSize: normalized.info,
        finalSize: result.info,
        palette: quantized.palette,
        warnings: wr.warnings,
        timings
      }
    };
  } catch (error) {
    const t1 = process.hrtime.bigint();
    timings.totalMs = Number(t1 - t0) / 1e6;
    console.error(JSON.stringify({ level: 'error', msg: 'embroidery.failure', timings, error: (error as any)?.message }));
    throw error;
  }
}

async function normalizeImage(input: Buffer, mime: string) {
  const maxSize = 2000;
  const image = sharp(input).ensureAlpha().resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true, fastShrinkOnLoad: true });
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  return { data, info };
}

async function applyBackgroundLocal(composited: any, options: EmbroideryOptions) {
  if (options.preserveTransparency) {
    return { buffer: composited.buffer, mime: 'image/png', info: composited.info };
  }
  const info = composited.info;
  let backgroundBuffer: Buffer;
  if (!options.background || options.background.type === 'color') {
    const hex = (options.background?.hex || '#E5E0D6').replace('#','');
    const r = parseInt(hex.slice(0,2),16)||229, g = parseInt(hex.slice(2,4),16)||224, b = parseInt(hex.slice(4,6),16)||214;
    backgroundBuffer = await sharp({ create: { width: info.width, height: info.height, channels: 3, background: { r, g, b } } }).png().toBuffer();
  } else {
    const candidates = [ `assets/fabrics/${options.background.name}.jpg`, `assets/fabrics/${options.background.name}.jpeg`, `assets/fabrics/${options.background.name}.png` ];
    let s: sharp.Sharp | null = null;
    for (const p of candidates) { try { const test = sharp(p); await test.metadata(); s = test; break; } catch {} }
    if (!s) {
      backgroundBuffer = await sharp({ create: { width: info.width, height: info.height, channels: 3, background: { r:229, g:224, b:214 } } }).png().toBuffer();
    } else {
      backgroundBuffer = await s.resize(info.width, info.height, { fit: 'cover' }).toBuffer();
    }
  }
  const result = await sharp(backgroundBuffer).composite([{ input: composited.buffer }]).png().toBuffer();
  return { buffer: result, mime: 'image/png', info };
}
