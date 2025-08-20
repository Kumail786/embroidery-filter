import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

/**
 * Comprehensive test for embroidery filter effects
 */
async function testEmbroideryEffects() {
  console.log('🧵 Testing Embroidery Filter Effects...\n');
  
  // Create a test image with multiple colors and shapes
  const testImage = await createTestImage();
  
  const testCases = [
    {
      name: 'Basic Embroidery',
      options: {
        maxColors: 4,
        threadThickness: 2,
        preserveTransparency: true,
        hatch: 'diagonal' as const,
        background: null,
        style: {
          orientation: 'binned-8' as const,
          edges: 'canny' as const
        }
      }
    },
    {
      name: 'Cross Hatch',
      options: {
        maxColors: 6,
        threadThickness: 3,
        preserveTransparency: true,
        hatch: 'cross' as const,
        background: null,
        style: {
          orientation: 'binned-8' as const,
          edges: 'canny' as const
        }
      }
    },
    {
      name: 'No Hatch',
      options: {
        maxColors: 8,
        threadThickness: 4,
        preserveTransparency: true,
        hatch: 'none' as const,
        background: null,
        style: {
          orientation: 'binned-8' as const,
          edges: 'canny' as const
        }
      }
    },
    {
      name: 'With Background',
      options: {
        maxColors: 5,
        threadThickness: 2,
        preserveTransparency: false,
        hatch: 'diagonal' as const,
        background: {
          type: 'color' as const,
          hex: '#E5E0D6'
        },
        style: {
          orientation: 'binned-8' as const,
          edges: 'canny' as const
        }
      }
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`📸 Testing: ${testCase.name}`);
    
    try {
      const startTime = Date.now();
      
      // Process image through embroidery filter
      const response = await fetch('http://localhost:8080/filter/embroidery', {
        method: 'POST',
        body: createFormData(testImage, testCase.options)
      });
      
      const processingTime = Date.now() - startTime;
      
      if (response.ok) {
        const resultBuffer = await response.arrayBuffer();
        const processingTimeHeader = response.headers.get('X-Processing-Time');
        const paletteSize = response.headers.get('X-Palette-Size');
        
        // Save result
        const outputPath = path.join(
          process.cwd(),
          'test-output',
          `embroidery-${testCase.name.toLowerCase().replace(/\s+/g, '-')}.png`
        );
        await fs.writeFile(outputPath, Buffer.from(resultBuffer));
        
        console.log(`✅ ${testCase.name} - ${processingTime}ms`);
        console.log(`   Palette: ${paletteSize} colors`);
        console.log(`   Server time: ${processingTimeHeader}ms`);
        console.log(`   Saved: ${outputPath}`);
        
      } else {
        const errorText = await response.text();
        console.log(`❌ ${testCase.name} failed: ${response.status} - ${errorText}`);
      }
      
    } catch (error: any) {
      console.log(`❌ ${testCase.name} error: ${error.message}`);
    }
    
    console.log('');
  }
  
  console.log('🏁 Embroidery effects test completed!');
  console.log('📁 Check test-output/ directory for results');
}

/**
 * Create a test image with multiple colors and shapes
 */
async function createTestImage(): Promise<Buffer> {
  const width = 200;
  const height = 200;
  
  // Create a canvas with multiple colored shapes
  const canvas = new (await import('canvas')).createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Clear background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  
  // Draw colored shapes
  ctx.fillStyle = '#FF0000';
  ctx.fillRect(20, 20, 60, 60);
  
  ctx.fillStyle = '#00FF00';
  ctx.beginPath();
  ctx.arc(120, 60, 30, 0, 2 * Math.PI);
  ctx.fill();
  
  ctx.fillStyle = '#0000FF';
  ctx.beginPath();
  ctx.moveTo(160, 20);
  ctx.lineTo(180, 80);
  ctx.lineTo(140, 80);
  ctx.closePath();
  ctx.fill();
  
  ctx.fillStyle = '#FFFF00';
  ctx.fillRect(20, 120, 80, 40);
  
  ctx.fillStyle = '#FF00FF';
  ctx.beginPath();
  ctx.arc(140, 140, 25, 0, 2 * Math.PI);
  ctx.fill();
  
  // Add some text
  ctx.fillStyle = '#000000';
  ctx.font = '16px Arial';
  ctx.fillText('Test', 80, 180);
  
  return canvas.toBuffer('image/png');
}

/**
 * Create FormData for API request
 */
function createFormData(imageBuffer: Buffer, options: any): FormData {
  const formData = new FormData();
  formData.append('image', new Blob([imageBuffer], { type: 'image/png' }), 'test.png');
  formData.append('options', JSON.stringify(options));
  return formData;
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testEmbroideryEffects().catch(console.error);
}
