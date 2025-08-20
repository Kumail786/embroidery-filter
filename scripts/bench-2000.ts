import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { processEmbroidery } from '../src/pipeline/embroidery.js';

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true }).catch(() => {});
}

async function makeTestImage(width: number, height: number): Promise<Buffer> {
  const bg = await sharp({ create: { width, height, channels: 3, background: { r: 240, g: 240, b: 240 } } })
    .png()
    .toBuffer();
  const overlay1 = await sharp({ create: { width: Math.floor(width*0.6), height: Math.floor(height*0.6), channels: 4, background: { r: 20, g: 120, b: 220, alpha: 1 } } })
    .png().toBuffer();
  const overlay2 = await sharp({ create: { width: Math.floor(width*0.35), height: Math.floor(height*0.35), channels: 4, background: { r: 250, g: 80, b: 60, alpha: 1 } } })
    .png().toBuffer();
  const img = await sharp(bg)
    .composite([
      { input: overlay1, left: Math.floor(width*0.2), top: Math.floor(height*0.2) },
      { input: overlay2, left: Math.floor(width*0.35), top: Math.floor(height*0.35) }
    ])
    .png().toBuffer();
  return img;
}

async function runCase(name: string, input: Buffer, opts: any) {
  const t0 = Date.now();
  const out = await processEmbroidery(input, 'image/png', opts);
  const ms = Date.now() - t0;
  const outfile = path.join('test-output', `${name}.png`);
  await sharp(out.buffer).toFile(outfile);
  console.log(`${name}: ${ms} ms, out=${outfile}, size=${out.buffer.length} bytes`);
  return { name, ms, size: out.buffer.length, warnings: out.meta?.warnings ?? [], paletteSize: out.meta?.paletteSize ?? 0 };
}

async function main() {
  await ensureDir('test-output');
  const W = 2000, H = 2000;

  // Synthetic
  const synth = await makeTestImage(W, H);
  const previewOpts = { maxColors: 8, threadThickness: 3, preserveTransparency: true, hatch: 'diagonal' as const, background: null, style: { orientation: 'binned-8' as const, edges: 'canny' as const, mode: 'photo' as const }, lighting: { sheen: 0.25 }, border: { stitch: true, width: 3 }, density: { scale: 1.0 }, grain: { randomness: 0.15 } };
  const results: any[] = [];
  results.push(await runCase('bench-2000-synth-preview', synth, previewOpts));

  // If there is a real 2000x2000 image, process it
  const candidate = path.join('test-images', 'pexels-sunrise-2000.jpg');
  try {
    const stat = await fs.stat(candidate);
    if (stat.isFile()) {
      const buf = await fs.readFile(candidate);
      results.push(await runCase('bench-2000-pexels-preview', buf, previewOpts));
    }
  } catch {}

  // Write JSON summary
  const summaryFile = path.join('test-output', 'bench-2000-summary.json');
  await fs.writeFile(summaryFile, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  console.log(`Summary written: ${summaryFile}`);
}

main().catch(err => { console.error(err); process.exit(1); });
