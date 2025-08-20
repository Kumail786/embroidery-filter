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
    const targetMax = 600;
    const scale = Math.max(1, Math.ceil(Math.max(info.width, info.height) / targetMax));
    const resized = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
      .resize({ width: Math.floor(info.width / scale), height: Math.floor(info.height / scale), fit: 'inside' })
      .png({ palette: true, colors: Math.max(2, Math.min(12, maxColors)), dither: 0 })
      .toBuffer();

    const { data: outRGBA, info: outInfo } = await sharp(resized)
      .ensureAlpha()
      .resize({ width: info.width, height: info.height, fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const usedPalette = extractPaletteFromImage(outRGBA, outInfo.width, outInfo.height, maxColors);

    return {
      data: outRGBA,
      info: outInfo as unknown as sharp.Raw,
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

export async function quantizeColorsMedianCut(
  normalized: { data: Buffer; info: sharp.Raw },
  maxColors: number
): Promise<QuantizationResult> {
  return await quantizeColors(normalized, maxColors);
}
