import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Simple test script to verify the API endpoints
 */
async function testAPI() {
  console.log('🧪 Testing Embroidery Filter API...\n');
  
  // Test 1: Health endpoint
  console.log('1. Testing health endpoint...');
  try {
    const healthResponse = await fetch('http://localhost:8080/health');
    const healthData = await healthResponse.json();
    
    if (healthResponse.ok && healthData.status === 'healthy') {
      console.log('✅ Health endpoint working');
      console.log(`   Server uptime: ${Math.round(healthData.uptime)}s`);
      console.log(`   Worker threads: ${healthData.workerPool.threadCount}`);
    } else {
      console.log('❌ Health endpoint failed');
      return;
    }
  } catch (error) {
    console.log('❌ Health endpoint error:', error);
    return;
  }
  
  // Test 2: Create a simple test image
  console.log('\n2. Creating test image...');
  try {
    // Create a simple 100x100 PNG image using sharp
    const sharp = await import('sharp');
    const testImageBuffer = await sharp.default({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 }
      }
    })
    .png()
    .toBuffer();
    
    console.log('✅ Test image created (100x100 red square)');
    
    // Test 3: API endpoint with test image
    console.log('\n3. Testing embroidery filter endpoint...');
    
    const formData = new FormData();
    formData.append('image', new Blob([testImageBuffer], { type: 'image/png' }), 'test.png');
    
    const options = {
      maxColors: 4,
      threadThickness: 2,
      preserveTransparency: true,
      hatch: 'diagonal' as const,
      background: null,
      style: {
        orientation: 'binned-8' as const,
        edges: 'canny' as const
      }
    };
    
    formData.append('options', JSON.stringify(options));
    
    const startTime = Date.now();
    const response = await fetch('http://localhost:8080/filter/embroidery', {
      method: 'POST',
      body: formData
    });
    const processingTime = Date.now() - startTime;
    
    if (response.ok) {
      const resultBuffer = await response.arrayBuffer();
      const processingTimeHeader = response.headers.get('X-Processing-Time');
      
      console.log('✅ Embroidery filter endpoint working');
      console.log(`   Processing time: ${processingTime}ms`);
      console.log(`   Response size: ${resultBuffer.byteLength} bytes`);
      console.log(`   Content-Type: ${response.headers.get('Content-Type')}`);
      
      if (processingTimeHeader) {
        console.log(`   Server processing time: ${processingTimeHeader}ms`);
      }
      
      // Save the result
      const outputPath = path.join(process.cwd(), 'test-output', 'api-test-result.png');
      await fs.writeFile(outputPath, Buffer.from(resultBuffer));
      console.log(`   Result saved to: ${outputPath}`);
      
    } else {
      const errorText = await response.text();
      console.log('❌ Embroidery filter endpoint failed');
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${errorText}`);
    }
    
  } catch (error) {
    console.log('❌ Test failed:', error);
  }
  
  console.log('\n🏁 API test completed!');
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testAPI().catch(console.error);
}
