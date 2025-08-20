import fs from 'node:fs/promises';
import path from 'node:path';
import { processEmbroidery } from '../src/pipeline/embroidery.js';

interface BenchmarkResult {
  imageName: string;
  originalSize: { width: number; height: number };
  processingTime: number;
  memoryUsage: number;
  success: boolean;
  error?: string;
}

/**
 * Benchmark script to test embroidery filter performance
 */
async function runBenchmark() {
  console.log('🧪 Starting Embroidery Filter Benchmark...\n');
  
  const testImages = [
    'sample-512x512.png',
    'sample-1024x1024.png', 
    'sample-2000x2000.png'
  ];
  
  const options = {
    maxColors: 8,
    threadThickness: 3,
    preserveTransparency: true,
    hatch: 'diagonal' as const,
    background: null,
    style: {
      orientation: 'binned-8' as const,
      edges: 'canny' as const
    }
  };
  
  const results: BenchmarkResult[] = [];
  
  for (const imageName of testImages) {
    console.log(`📸 Testing with ${imageName}...`);
    
    try {
      // Check if test image exists
      const imagePath = path.join(process.cwd(), 'test-images', imageName);
      const imageBuffer = await fs.readFile(imagePath);
      
      // Get initial memory usage
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Process image
      const startTime = Date.now();
      const result = await processEmbroidery(imageBuffer, 'image/png', options);
      const processingTime = Date.now() - startTime;
      
      // Get final memory usage
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryUsage = finalMemory - initialMemory;
      
      // Save result
      const outputPath = path.join(process.cwd(), 'test-output', `embroidery-${imageName}`);
      await fs.writeFile(outputPath, result.buffer);
      
      results.push({
        imageName,
        originalSize: result.meta?.originalSize || { width: 0, height: 0 },
        processingTime,
        memoryUsage: Math.round(memoryUsage / 1024 / 1024), // MB
        success: true
      });
      
      console.log(`✅ Processed in ${processingTime}ms, Memory: ${Math.round(memoryUsage / 1024 / 1024)}MB`);
      
    } catch (error: any) {
      console.log(`❌ Failed: ${error.message}`);
      
      results.push({
        imageName,
        originalSize: { width: 0, height: 0 },
        processingTime: 0,
        memoryUsage: 0,
        success: false,
        error: error.message
      });
    }
  }
  
  // Print summary
  console.log('\n📊 Benchmark Results:');
  console.log('====================');
  
  const successfulResults = results.filter(r => r.success);
  
  if (successfulResults.length > 0) {
    const avgTime = successfulResults.reduce((sum, r) => sum + r.processingTime, 0) / successfulResults.length;
    const avgMemory = successfulResults.reduce((sum, r) => sum + r.memoryUsage, 0) / successfulResults.length;
    
    console.log(`Average Processing Time: ${Math.round(avgTime)}ms`);
    console.log(`Average Memory Usage: ${Math.round(avgMemory)}MB`);
    
    // Check performance targets
    const meetsTimeTarget = avgTime < 500; // < 0.5s target
    const meetsMemoryTarget = avgMemory < 512; // < 512MB target
    
    console.log(`\n🎯 Performance Targets:`);
    console.log(`Processing Time < 500ms: ${meetsTimeTarget ? '✅' : '❌'} (${Math.round(avgTime)}ms)`);
    console.log(`Memory Usage < 512MB: ${meetsMemoryTarget ? '✅' : '❌'} (${Math.round(avgMemory)}MB)`);
  }
  
  console.log('\n📋 Detailed Results:');
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    const time = result.success ? `${result.processingTime}ms` : 'N/A';
    const memory = result.success ? `${result.memoryUsage}MB` : 'N/A';
    const size = result.originalSize.width > 0 ? `${result.originalSize.width}x${result.originalSize.height}` : 'N/A';
    
    console.log(`${status} ${result.imageName} (${size}) - ${time}, ${memory}`);
    
    if (!result.success && result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  console.log('\n🏁 Benchmark completed!');
}

/**
 * Create test directories and sample images if they don't exist
 */
async function setupTestEnvironment() {
  const testDir = path.join(process.cwd(), 'test-images');
  const outputDir = path.join(process.cwd(), 'test-output');
  
  try {
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });
    
    console.log('📁 Test directories created');
    
    // Check if test images exist
    const testImages = ['sample-512x512.png', 'sample-1024x1024.png', 'sample-2000x2000.png'];
    const missingImages = [];
    
    for (const imageName of testImages) {
      try {
        await fs.access(path.join(testDir, imageName));
      } catch {
        missingImages.push(imageName);
      }
    }
    
    if (missingImages.length > 0) {
      console.log(`⚠️  Missing test images: ${missingImages.join(', ')}`);
      console.log('Please add test images to the test-images/ directory');
      console.log('You can use any PNG images with the following names:');
      console.log('- sample-512x512.png');
      console.log('- sample-1024x1024.png');
      console.log('- sample-2000x2000.png');
    } else {
      console.log('✅ All test images found');
    }
    
  } catch (error) {
    console.error('Error setting up test environment:', error);
  }
}

// Run benchmark if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupTestEnvironment()
    .then(() => runBenchmark())
    .catch(console.error);
}
