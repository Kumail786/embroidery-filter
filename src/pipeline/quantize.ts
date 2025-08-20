import sharp from 'sharp';

interface QuantizationResult {
  data: Buffer;
  info: sharp.Raw;
  palette: Array<{ r: number; g: number; b: number; a: number }>;
  paletteSize: number;
}

export async function quantizeColors(
  normalized: { data: Buffer; info: sharp.Raw },
  maxColors: number
): Promise<QuantizationResult> {
  try {
    const { data, info } = normalized;
    
    // **OPTIMIZATION 1: More aggressive downscaling for quantization analysis**
    const targetMax = Math.min(400, Math.max(info.width, info.height) * 0.6); // Smaller target
    const scale = Math.max(1, Math.ceil(Math.max(info.width, info.height) / targetMax));
    
    // **OPTIMIZATION 2: Single-pass quantization without PNG round-trip**
    const { data: downscaled, info: dsInfo } = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
      .resize({ width: Math.floor(info.width / scale), height: Math.floor(info.height / scale), fit: 'inside', kernel: 'nearest' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // **OPTIMIZATION 3: Fast palette extraction without encoding/decoding**
    const usedPalette = extractPaletteFast(downscaled, dsInfo.width, dsInfo.height, maxColors);
    
    // **OPTIMIZATION 4: Apply palette to full resolution using simple mapping**
    const quantizedFull = await applyPaletteToImage(data, info, usedPalette);

    return {
      data: quantizedFull,
      info: { ...info, channels: 4 } as sharp.Raw, // Ensure RGBA
      palette: usedPalette,
      paletteSize: usedPalette.length
    };
  } catch (error) {
    console.error('Error in color quantization:', error);
    throw new Error(`Color quantization failed: ${error}`);
  }
}

function extractPaletteFromImage(
  rgba: Buffer,
  width: number,
  height: number,
  k: number
): Array<{ r: number; g: number; b: number; a: number }> {
  const seen = new Set<string>();
  const palette: Array<{ r: number; g: number; b: number; a: number }> = [];
  for (let i = 0; i < rgba.length && palette.length < k; i += 4) {
    const r = Number(rgba[i]);
    const g = Number(rgba[i + 1]);
    const b = Number(rgba[i + 2]);
    const a = Number(rgba[i + 3]);
    const key = `${r},${g},${b},${a}`;
    if (!seen.has(key)) { seen.add(key); palette.push({ r, g, b, a }); }
  }
  return palette;
}

/**
 * **Fast palette extraction using color frequency sampling**
 */
function extractPaletteFast(
  rgba: Buffer,
  width: number,
  height: number,
  maxColors: number
): Array<{ r: number; g: number; b: number; a: number }> {
  const colorFreq = new Map<string, { color: { r: number; g: number; b: number; a: number }, count: number }>();
  
  // **Sample every 4th pixel for speed**
  const step = 4;
  for (let i = 0; i < rgba.length; i += 4 * step) {
    const r = rgba[i] || 0;
    const g = rgba[i + 1] || 0;
    const b = rgba[i + 2] || 0;
    const a = rgba[i + 3] || 255;
    
    // **Round colors to reduce palette diversity**
    const roundedR = Math.round(r / 16) * 16;
    const roundedG = Math.round(g / 16) * 16;
    const roundedB = Math.round(b / 16) * 16;
    
    const key = `${roundedR},${roundedG},${roundedB},${a}`;
    if (colorFreq.has(key)) {
      colorFreq.get(key)!.count++;
    } else {
      colorFreq.set(key, { color: { r: roundedR, g: roundedG, b: roundedB, a }, count: 1 });
    }
  }
  
  // **Return most frequent colors**
  return Array.from(colorFreq.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, maxColors)
    .map(entry => entry.color);
}

/**
 * **Apply palette to full resolution image using nearest color matching**
 */
async function applyPaletteToImage(
  data: Buffer,
  info: sharp.Raw,
  palette: Array<{ r: number; g: number; b: number; a: number }>
): Promise<Buffer> {
  // **Ensure input is RGBA**
  const { data: rgbaData } = await sharp(data, { raw: info })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const quantized = Buffer.alloc(rgbaData.length);
  
  // **Fast nearest color matching**
  for (let i = 0; i < rgbaData.length; i += 4) {
    const r = rgbaData[i];
    const g = rgbaData[i + 1];
    const b = rgbaData[i + 2];
    const a = rgbaData[i + 3];
    
    let closestColor = palette[0];
    let minDistance = Infinity;
    
    for (const color of palette) {
      // **Fast Euclidean distance in RGB space**
      const dr = r - color.r;
      const dg = g - color.g;
      const db = b - color.b;
      const distance = dr * dr + dg * dg + db * db;
      
      if (distance < minDistance) {
        minDistance = distance;
        closestColor = color;
      }
    }
    
    quantized[i] = closestColor.r;
    quantized[i + 1] = closestColor.g;
    quantized[i + 2] = closestColor.b;
    quantized[i + 3] = a; // Preserve original alpha
  }
  
  return quantized;
}

export async function quantizeColorsMedianCut(
  normalized: { data: Buffer; info: sharp.Raw },
  maxColors: number
): Promise<QuantizationResult> {
  return await quantizeColors(normalized, maxColors);
}
