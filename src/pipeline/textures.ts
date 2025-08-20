import { createCanvas } from 'canvas';
import sharp from 'sharp';

interface TextureResult {
  threadTextures: Buffer[];
  hatchPatterns: Buffer[];
  threadThickness: number;
}

// **Global texture cache - persistent across requests**
const globalTextureCache = new Map<string, Buffer[]>();

export async function generateTextures(
  quantized: { data: Buffer; info: sharp.Raw },
  orientation: { orientationBins: any },
  options: {
    threadThickness: number;
    hatch: 'none' | 'diagonal' | 'cross';
    densityScale?: number;
    grainRandomness?: number;
    sheen?: number;
  }
): Promise<TextureResult> {
  try {
    const { threadThickness, hatch } = options;
    const density = Math.max(0.5, Math.min(2, options.densityScale ?? 1));
    
    // **Check global cache first**
    const cacheKey = `${threadThickness}_${hatch}_${density}`;
    if (globalTextureCache.has(cacheKey)) {
      const cached = globalTextureCache.get(cacheKey)!;
      return {
        threadTextures: cached.slice(0, 6), // Reduced from 8
        hatchPatterns: cached.slice(6),
        threadThickness
      };
    }
    
    // **Generate fewer, smaller textures for speed**
    const threadTextures = await generateThreadTexturesFast(threadThickness, density);
    const hatchPatterns = await generateHatchPatternsFast(hatch, density);
    
    // **Cache for reuse**
    globalTextureCache.set(cacheKey, [...threadTextures, ...hatchPatterns]);
    
    return { threadTextures, hatchPatterns, threadThickness };
  } catch (error: any) {
    console.error('Error generating textures:', error);
    throw new Error(`Texture generation failed: ${error}`);
  }
}

/**
 * **Fast thread texture generation with reduced size and count**
 */
async function generateThreadTexturesFast(threadThickness: number, density: number): Promise<Buffer[]> {
  const size = 64; // Reduced from 256 for speed
  const numBins = 6; // Reduced from 8 for speed
  const textures: Buffer[] = [];

  for (let binIndex = 0; binIndex < numBins; binIndex++) {
    const angle = (binIndex * 180) / numBins;
    const texture = createThreadTextureFast(size, angle, threadThickness, density);
    textures.push(texture);
  }

  return textures;
}

/**
 * **Optimized thread texture creation**
 */
function createThreadTextureFast(size: number, angle: number, thickness: number, density: number): Buffer {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  ctx.clearRect(0, 0, size, size);
  
  // **Simplified gradient - no complex noise/fabric texture**
  const threadSpacing = Math.max(2, Math.round(thickness * 1.2 / density));
  const threadCount = Math.ceil(size / threadSpacing);
  
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.translate(-size / 2, -size / 2);
  
  // **Simple gradient without complex shading**
  for (let i = 0; i < threadCount; i++) {
    const x = i * threadSpacing;
    
    const gradient = ctx.createLinearGradient(x, 0, x + thickness, 0);
    gradient.addColorStop(0, '#333333');
    gradient.addColorStop(0.5, '#888888');
    gradient.addColorStop(1, '#333333');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(x, 0, thickness, size);
  }
  
  ctx.restore();
  return canvas.toBuffer('image/png');
}

/**
 * **Fast hatch pattern generation**
 */
async function generateHatchPatternsFast(hatchType: 'none' | 'diagonal' | 'cross', density: number): Promise<Buffer[]> {
  const size = 32; // Reduced from 128 for speed
  const patterns: Buffer[] = [];
  
  if (hatchType === 'none') {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    patterns.push(canvas.toBuffer('image/png'));
    
  } else if (hatchType === 'diagonal') {
    const diagonal = createHatchPatternFast(size, 45, density);
    patterns.push(diagonal);
    
  } else if (hatchType === 'cross') {
    // **Simple cross pattern without complex blending**
    const cross = createCrossHatchFast(size, density);
    patterns.push(cross);
  }
  
  return patterns;
}

/**
 * **Simplified hatch pattern**
 */
function createHatchPatternFast(size: number, angle: number, density: number): Buffer {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.lineWidth = 1;
  
  const lineSpacing = Math.max(3, Math.round(4 / density));
  const lineCount = Math.ceil(size * 2 / lineSpacing);
  
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.translate(-size / 2, -size / 2);
  
  ctx.beginPath();
  for (let i = 0; i < lineCount; i++) {
    const offset = i * lineSpacing - size;
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + size, size);
  }
  ctx.stroke();
  
  ctx.restore();
  return canvas.toBuffer('image/png');
}

/**
 * **Simple cross-hatch pattern**
 */
function createCrossHatchFast(size: number, density: number): Buffer {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 1;
  
  const lineSpacing = Math.max(3, Math.round(4 / density));
  const lineCount = Math.ceil(size * 2 / lineSpacing);
  
  // **Draw both diagonal directions in one pass**
  ctx.beginPath();
  for (let i = 0; i < lineCount; i++) {
    const offset = i * lineSpacing - size;
    // 45 degree lines
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + size, size);
    // -45 degree lines  
    ctx.moveTo(offset, size);
    ctx.lineTo(offset + size, 0);
  }
  ctx.stroke();
  
  return canvas.toBuffer('image/png');
}