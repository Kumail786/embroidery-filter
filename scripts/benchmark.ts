#!/usr/bin/env tsx

/**
 * Simple benchmark script - calls real API with maximum settings
 */

import fs from 'node:fs/promises';

const SERVER_URL = 'http://localhost:8080';

// Maximum settings for stress testing
const MAX_SETTINGS = {
  maxColors: 12,
  threadThickness: 5,
  hatch: "cross",
  preserveTransparency: true,
  style: { orientation: "binned-8", edges: "canny", mode: "photo" },
  lighting: { sheen: 0.35 },
  border: { stitch: true, width: 3 },
  density: { scale: 1.5 },
  grain: { randomness: 0.25 }
};

interface BenchResult {
  image: string;
  timeMs: number;
  sizeKB: number;
  paletteSize: number;
  warnings: string[];
}

async function benchmarkImage(imagePath: string): Promise<BenchResult> {
  const imageBuffer = await fs.readFile(imagePath);
  const imageName = imagePath.split('/').pop() || 'unknown';
  
  console.log(`🔥 Benchmarking: ${imageName} with maximum settings...`);
  
  // Use modern FormData
  const form = new FormData();
  form.append('image', new Blob([imageBuffer]), imageName);
  form.append('options', JSON.stringify(MAX_SETTINGS));
  
  const startTime = Date.now();
  
  const response = await fetch(`${SERVER_URL}/filter/embroidery`, {
    method: 'POST',
    body: form
  });
  
  const timeMs = Date.now() - startTime;
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const resultBuffer = Buffer.from(await response.arrayBuffer());
  const outputPath = `test-output/${imageName}-benchmark.png`;
  await fs.writeFile(outputPath, resultBuffer);
  
  return {
    image: imageName,
    timeMs,
    sizeKB: Math.round(resultBuffer.length / 1024),
    paletteSize: parseInt(response.headers.get('X-Palette-Size') || '0'),
    warnings: (response.headers.get('X-Warnings') || '').split(',').filter(Boolean)
  };
}

async function main() {
  try {
    await fs.mkdir('test-output', { recursive: true });
    
    const results: BenchResult[] = [];
    
    // Test available images
    const testImages = [
      'test-images/image1.jpg',
      'test-images/image2.jpeg'
    ];
    
    for (const imagePath of testImages) {
      try {
        const result = await benchmarkImage(imagePath);
        results.push(result);
        console.log(`✅ ${result.image}: ${result.timeMs}ms, ${result.sizeKB}KB, ${result.paletteSize} colors`);
        if (result.warnings.length > 0) {
          console.log(`   ⚠️  ${result.warnings.join(', ')}`);
        }
      } catch (error: any) {
        console.log(`❌ ${imagePath}: ${error.message}`);
      }
    }
    
    if (results.length === 0) {
      console.log('❌ No images found to test. Add images to test-images/ directory.');
      return;
    }
    
    // Summary
    const avgTime = results.reduce((sum, r) => sum + r.timeMs, 0) / results.length;
    const maxTime = Math.max(...results.map(r => r.timeMs));
    
    console.log('\n🏆 BENCHMARK SUMMARY:');
    console.log(`   Images tested: ${results.length}`);
    console.log(`   Average time: ${Math.round(avgTime)}ms`);
    console.log(`   Maximum time: ${maxTime}ms`);
    console.log(`   Target: 500ms`);
    console.log(`   Status: ${maxTime <= 500 ? '✅ PASSED' : '❌ NEEDS OPTIMIZATION'}`);
    
    // Save detailed results
    const summary = {
      timestamp: new Date().toISOString(),
      settings: MAX_SETTINGS,
      results,
      summary: {
        avgTime: Math.round(avgTime),
        maxTime,
        target: 500,
        passed: maxTime <= 500
      }
    };
    
    await fs.writeFile('test-output/benchmark-summary.json', JSON.stringify(summary, null, 2));
    console.log('\n💾 Results saved: test-output/benchmark-summary.json');
    
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
