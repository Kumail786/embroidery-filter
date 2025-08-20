import sharp from 'sharp';
import { encodeMaskPNG } from './utils.ts';

interface EdgeResult {
  edges: Buffer;
  edgeMap: Uint8Array;
  rimBand: Uint8Array;
}

export async function detectEdges(
  quantized: { data: Buffer; info: sharp.Raw },
  options: { threadThickness: number; edgeMode?: 'photo' | 'logo' }
): Promise<EdgeResult> {
  const { data, info } = quantized;
  const targetMax = 600;
  const scale = Math.max(1, Math.ceil(Math.max(info.width, info.height) / targetMax));

  const base = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .toColourspace('b-w')
    .resize({ width: Math.floor(info.width / scale), height: Math.floor(info.height / scale), fit: 'inside' })
    .blur(1);

  const sobelX = { width: 3, height: 3, kernel: [-1,0,1,-2,0,2,-1,0,1] } as any;
  const sobelY = { width: 3, height: 3, kernel: [-1,-2,-1,0,0,0,1,2,1] } as any;

  const gxBuf = await base.clone().convolve(sobelX).raw().toBuffer();
  const gyBuf = await base.clone().convolve(sobelY).raw().toBuffer();
  const dsWidth = Math.floor(info.width / scale);
  const dsHeight = Math.floor(info.height / scale);

  const gx = new Uint8Array(gxBuf.buffer, gxBuf.byteOffset, gxBuf.length);
  const gy = new Uint8Array(gyBuf.buffer, gyBuf.byteOffset, gyBuf.length);
  let mean = 0; for (let i = 0; i < gx.length; i++) mean += Math.hypot(gx[i] || 0, gy[i] || 0);
  mean /= gx.length;
  const isLogo = options.edgeMode === 'logo';
  const thresh = isLogo ? Math.max(8, mean * 0.6) : Math.max(20, mean * 1.2);

  const edgesSmall = new Uint8Array(gx.length);
  for (let i = 0; i < gx.length; i++) {
    const m = Math.hypot(gx[i] || 0, gy[i] || 0);
    edgesSmall[i] = m >= thresh ? 255 : 0;
  }

  const edgeFullRaw = await sharp(Buffer.from(edgesSmall), { raw: { width: dsWidth, height: dsHeight, channels: 1 } })
    .resize({ width: info.width, height: info.height, fit: 'fill', kernel: sharp.kernel.nearest })
    .raw().toBuffer();
  const edgeMap = new Uint8Array(edgeFullRaw);

  const stitched = new Uint8Array(edgeMap.length);
  const stitchLen = Math.max(2, options.threadThickness);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = y * info.width + x;
      if (!edgeMap[i]) continue;
      const on = (Math.floor(x / stitchLen) % 2) === 0;
      stitched[i] = on ? 255 : 0;
    }
  }

  const alphaRaw = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .ensureAlpha().extractChannel(3).raw().toBuffer();
  const alphaBin = new Uint8Array(alphaRaw.length);
  for (let i = 0; i < alphaBin.length; i++) alphaBin[i] = alphaRaw[i] ? 255 : 0;

  const size = Math.max(3, options.threadThickness * 2 + 1);
  const k = new Array(size * size).fill(1);
  const kernel = { width: size, height: size, kernel: k } as any;

  const blurred = await sharp(Buffer.from(alphaBin), { raw: { width: info.width, height: info.height, channels: 1 } })
    .convolve(kernel)
    .raw().toBuffer();

  const rimBand = new Uint8Array(blurred.length);
  const thresholdDil = size * size * 0.1;
  const thresholdEro = size * size * 0.9;
  for (let i = 0; i < rimBand.length; i++) {
    const v = blurred[i] || 0;
    rimBand[i] = (v > thresholdDil && v < thresholdEro) ? 255 : 0;
  }

  const edgePng = await encodeMaskPNG(stitched, info.width, info.height);
  return { edges: edgePng, edgeMap, rimBand };
}
