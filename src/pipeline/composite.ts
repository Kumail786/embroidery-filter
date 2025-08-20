import sharp from 'sharp';
import { createOrientationMask } from './orientation.ts';
import { tileSheetCache, keyTile, maskCache, keyMask } from './cache.ts';

interface CompositingResult { buffer: Buffer; info: { width: number; height: number } }

export async function compositeImage(
  quantized: { data: Buffer; info: sharp.Raw; palette: any[] },
  textures: { threadTextures: Buffer[]; hatchPatterns: Buffer[] },
  edges: { edges: Buffer; edgeMap: Uint8Array; rimBand: Uint8Array },
  orientation: { orientationBins: Uint8Array },
  options: { threadThickness: number; preserveTransparency: boolean; sheen?: number; densityScale?: number; borderStitch?: boolean }
): Promise<CompositingResult> {
  const { data, info } = quantized;
  const { threadTextures, hatchPatterns } = textures;
  const { edges: edgeBuffer, rimBand } = edges;
  const { orientationBins } = orientation;

  // **CRITICAL: Build all composite layers in parallel, then batch into single Sharp operation**
  const compositeOps: any[] = [];
  
  // Pre-compute alpha mask once for reuse
  const alphaMaskRaw = await sharp(quantized.data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .ensureAlpha().extractChannel(3).raw().toBuffer();

  // Hatch pattern overlay
  if (hatchPatterns.length > 0 && hatchPatterns[0]) {
    const tileKey = keyTile('hatch', 0, info.width, info.height);
    let hatchSheet = tileSheetCache.get(tileKey);
    if (!hatchSheet) {
      // Cache as RAW buffer instead of PNG to eliminate decode overhead
      hatchSheet = await sharp({ create: { width: info.width, height: info.height, channels: 4, background: { r:0,g:0,b:0,alpha:0 } } })
        .composite([{ input: hatchPatterns[0], tile: true, left: 0, top: 0 }])
        .raw()
        .toBuffer();
      tileSheetCache.set(tileKey, hatchSheet);
    }
    
    compositeOps.push({
      input: hatchSheet,
      raw: { width: info.width, height: info.height, channels: 4 },
      blend: 'multiply',
      mask: { input: alphaMaskRaw, raw: { width: info.width, height: info.height, channels: 1 } }
    });
  }

  // Thread textures per orientation bin
  for (let binIndex = 0; binIndex < threadTextures.length; binIndex++) {
    const tileKey = keyTile('thread', binIndex, info.width, info.height);
    let threadSheet = tileSheetCache.get(tileKey);
    if (!threadSheet) {
      // Cache as RAW buffer instead of PNG 
      threadSheet = await sharp({ create: { width: info.width, height: info.height, channels: 4, background: { r:0,g:0,b:0,alpha:0 } } })
        .composite([{ input: threadTextures[binIndex], tile: true, left: 0, top: 0 }])
        .raw()
        .toBuffer();
      tileSheetCache.set(tileKey, threadSheet);
    }
    
    const maskKey = keyMask(binIndex, info.width, info.height, 'bins');
    let maskBuf = maskCache.get(maskKey);
    if (!maskBuf) {
      const maskArr = createOrientationMask(orientationBins, binIndex, info.width, info.height);
      maskBuf = Buffer.from(maskArr);
      maskCache.set(maskKey, maskBuf);
    }
    
    compositeOps.push({
      input: threadSheet,
      raw: { width: info.width, height: info.height, channels: 4 },
      blend: 'overlay', 
      mask: { input: maskBuf, raw: { width: info.width, height: info.height, channels: 1 } }
    });
  }

  // Edge overlay
  compositeOps.push({ input: edgeBuffer, blend: 'overlay' });

  // Rim band
  if (options.borderStitch !== false) {
    const stitches = createEnhancedStitchPattern(rimBand, options.threadThickness, info.width, info.height);
    const stitchMaskRaw = Buffer.from(stitches);
    compositeOps.push({
      input: { create: { width: info.width, height: info.height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } },
      left: 0, top: 0, blend: 'overlay',
      mask: { input: stitchMaskRaw, raw: { width: info.width, height: info.height, channels: 1 } }
    });
  }

  // **SINGLE Sharp pipeline with batched composites - eliminates ALL intermediate PNG encoding**
  const composite = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .composite(compositeOps)
    .png()
    .toBuffer();

  return { buffer: composite, info: { width: info.width, height: info.height } };
}

function createEnhancedStitchPattern(rimBand: Uint8Array, stitchLength: number, width: number, height: number): Uint8Array {
  const out = new Uint8Array(rimBand.length);
  const dash = Math.max(2, Math.round(stitchLength * 1.5));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x; if (!rimBand[i]) continue; const on = ((Math.floor(x / dash) + Math.floor(y / dash)) % 2) === 0; out[i] = on ? 255 : 0;
    }
  }
  return out;
}