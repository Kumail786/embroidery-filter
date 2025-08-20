import sharp from 'sharp';
import { binsFromGradients } from './utils.ts';

interface OrientationResult {
  orientationField: Float32Array;
  orientationBins: Uint8Array;
  method: string;
}

export async function computeOrientation(
  quantized: { data: Buffer; info: sharp.Raw },
  orientationMethod: 'binned-8' | 'lic',
  mode: 'photo' | 'logo' = 'photo'
): Promise<OrientationResult> {
  try {
    const { data, info } = quantized;

    // **AGGRESSIVE downscaling for 3-4x speedup**
    const ANALYSIS_SIZE = mode === 'logo' ? 300 : 400;
    const downscaledInfo = {
      width: Math.min(info.width, ANALYSIS_SIZE),
      height: Math.min(info.height, ANALYSIS_SIZE),
      channels: 1
    };

    // **Use Sharp's native operations instead of JS loops**
    const grayBuffer = await sharp(data, { raw: info })
      .resize(downscaledInfo.width, downscaledInfo.height, { 
        fit: 'inside', 
        withoutEnlargement: true,
        kernel: 'nearest' // Fastest resize kernel
      })
      .greyscale()
      .blur(0.5) // Native Gaussian blur 
      .raw()
      .toBuffer();

    // **Sharp's native Sobel convolution**
    const Kx = [-1, 0, 1, -2, 0, 2, -1, 0, 1]; // Sobel X
    const Ky = [-1, -2, -1, 0, 0, 0, 1, 2, 1]; // Sobel Y

    const [gxBuffer, gyBuffer] = await Promise.all([
      sharp(grayBuffer, { raw: { width: downscaledInfo.width, height: downscaledInfo.height, channels: 1 } })
        .convolve({ width: 3, height: 3, kernel: Kx, scale: 1, offset: 0 })
        .raw()
        .toBuffer(),
      sharp(grayBuffer, { raw: { width: downscaledInfo.width, height: downscaledInfo.height, channels: 1 } })
        .convolve({ width: 3, height: 3, kernel: Ky, scale: 1, offset: 0 })
        .raw()
        .toBuffer()
    ]);

    // Convert to Float32Array for gradient binning
    const gxInt16 = new Int16Array(gxBuffer.buffer, gxBuffer.byteOffset, gxBuffer.byteLength / Int16Array.BYTES_PER_ELEMENT);
    const gyInt16 = new Int16Array(gyBuffer.buffer, gyBuffer.byteOffset, gyBuffer.byteLength / Int16Array.BYTES_PER_ELEMENT);
    
    const gx = new Float32Array(gxInt16);
    const gy = new Float32Array(gyInt16);

    // **Reduce bins for speed** 
    const numBins = orientationMethod === 'binned-8' ? (mode === 'logo' ? 4 : 6) : (mode === 'logo' ? 8 : 12);
    const orientationBinsDownscaled = binsFromGradients(gx, gy, downscaledInfo.width, downscaledInfo.height, numBins);

    // **Sharp's nearest neighbor upscaling**
    const orientationBinsPNG = await sharp(orientationBinsDownscaled, { 
      raw: { width: downscaledInfo.width, height: downscaledInfo.height, channels: 1 } 
    })
      .resize(info.width, info.height, { kernel: 'nearest' })
      .raw()
      .toBuffer();
    
    const orientationBins = new Uint8Array(orientationBinsPNG);

    // Simplified orientation field
    const orientationField = new Float32Array(gx.length);
    for (let i = 0; i < gx.length; i++) {
      let a = Math.atan2(gy[i] || 0, gx[i] || 0);
      if (a < 0) a += Math.PI;
      orientationField[i] = a;
    }

    return { orientationField, orientationBins, method: orientationMethod };
  } catch (error) {
    console.error('Error in orientation computation:', error);
    throw new Error(`Orientation computation failed: ${error}`);
  }
}

export function createOrientationMask(orientationBins: Uint8Array, binIndex: number, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = (orientationBins[i] === binIndex ? 255 : 0);
  return out;
}

export function getBinAngle(binIndex: number, numBins: number = 8): number {
  const binSize = Math.PI / numBins;
  return binIndex * binSize + binSize / 2;
}