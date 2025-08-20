# Embroidery Filter

A high-performance server-side embroidery filter for images with sub-0.5s processing time for 2000×2000 images.

## Features

- 🎨 **Embroidery Effect**: Transform images into embroidery-style artwork
- ⚡ **High Performance**: Process 2000×2000 images in under 0.5 seconds
- 🎯 **Color Quantization**: Reduce to ≤12 colors for stitchable regions
- 🧵 **Thread Textures**: Directional thread patterns following image contours
- 🖼️ **Multiple Formats**: Support for PNG, JPG with transparency preservation
- 🔧 **Customizable**: Adjustable thread thickness, hatch patterns, and backgrounds
- 🚀 **Scalable**: Worker thread pool for concurrent processing

## Quick Start

### Prerequisites

- Node.js 18+ 
- Docker (optional, for containerized deployment)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd embroidery-filter
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:8080`

### Docker Deployment

```bash
# Build the Docker image
docker build -t embroidery-filter .

# Run the container
docker run -p 8080:8080 embroidery-filter
```

## API Documentation

### POST /filter/embroidery

Transform an image into embroidery style.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body:
  - `image`: Image file (PNG, JPG, etc.)
  - `options`: JSON string with processing options

**Options:**
```json
{
  "maxColors": 8,                    // Number of colors (2-12)
  "threadThickness": 3,              // Thread thickness in pixels (1-10)
  "preserveTransparency": true,      // Keep alpha channel
  "hatch": "diagonal",               // "none" | "diagonal" | "cross"
  "background": null,                // Background settings
  "style": {                         // Processing style
    "orientation": "binned-8",       // "binned-8" | "lic"
    "edges": "canny"                 // "canny" | "xdog"
  }
}
```

**Background Options:**
```json
// Solid color background
{
  "type": "color",
  "hex": "#E5E0D6"
}

// Fabric texture background
{
  "type": "fabric", 
  "name": "cotton"
}
```

**Response:**
- Content-Type: `image/png` or `image/jpeg`
- Headers:
  - `X-Processing-Time`: Processing time in milliseconds
  - `X-Palette-Size`: Number of colors in final image
  - `X-Original-Size`: Original image dimensions
  - `X-Final-Size`: Final image dimensions

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "memory": {
    "heapUsed": 123456,
    "heapTotal": 234567,
    "external": 34567
  },
  "workerPool": {
    "threadCount": 4,
    "queueSize": 0,
    "completed": 42,
    "duration": 1234
  }
}
```

## Usage Examples

### cURL Example

```bash
curl -X POST http://localhost:8080/filter/embroidery \
  -F "image=@input.png" \
  -F 'options={"maxColors":8,"threadThickness":3,"hatch":"cross","preserveTransparency":true}' \
  --output output.png
```

### JavaScript Example

```javascript
const formData = new FormData();
formData.append('image', imageFile);

const options = {
  maxColors: 8,
  threadThickness: 3,
  preserveTransparency: true,
  hatch: 'diagonal',
  background: {
    type: 'color',
    hex: '#E5E0D6'
  }
};

formData.append('options', JSON.stringify(options));

const response = await fetch('http://localhost:8080/filter/embroidery', {
  method: 'POST',
  body: formData
});

const processedImage = await response.blob();
```

### Python Example

```python
import requests

with open('input.png', 'rb') as f:
    files = {'image': f}
    data = {
        'options': '{"maxColors":8,"threadThickness":3,"hatch":"diagonal"}'
    }
    
    response = requests.post(
        'http://localhost:8080/filter/embroidery',
        files=files,
        data=data
    )
    
    with open('output.png', 'wb') as f:
        f.write(response.content)
```

## Development

### Project Structure

```
embroidery-filter/
├── src/
│   ├── server.ts              # Express server and API endpoints
│   ├── workers/
│   │   └── runEmbroidery.ts   # Worker thread entry point
│   └── pipeline/
│       └── embroidery.ts      # Main processing pipeline
├── scripts/
│   └── bench.ts              # Performance benchmarking
├── test-images/              # Test images for benchmarking
├── test-output/              # Output from benchmark tests
└── assets/
    └── fabrics/              # Fabric texture images
```

### Available Scripts

```bash
# Development
npm run dev          # Start development server with hot reload
npm run build        # Build TypeScript to JavaScript
npm run start        # Start production server
npm run clean        # Clean build artifacts

# Testing & Benchmarking
npm run test         # Run tests
npm run bench        # Run performance benchmarks
npm run lint         # Run ESLint

# Docker
docker build -t embroidery-filter .  # Build Docker image
docker run -p 8080:8080 embroidery-filter  # Run container
```

### Performance Testing

1. **Add test images** to `test-images/` directory:
   - `sample-512x512.png`
   - `sample-1024x1024.png`
   - `sample-2000x2000.png`

2. **Run benchmark**:
   ```bash
   npm run bench
   ```

3. **Check results** in `test-output/` directory

### Performance Targets

- **Processing Time**: < 500ms for 2000×2000 images
- **Memory Usage**: < 512MB per request
- **Concurrency**: Support 10+ concurrent requests
- **Scalability**: Horizontal scaling capability

## Configuration

### Environment Variables

```bash
PORT=8080                    # Server port (default: 8080)
NODE_ENV=production          # Environment (development/production)
MAX_FILE_SIZE=8388608        # Max file size in bytes (default: 8MB)
WORKER_THREADS=4             # Number of worker threads (default: CPU count - 1)
```

### Worker Pool Configuration

The worker pool is automatically configured based on your system:

- **Threads**: CPU count - 1 (minimum 1, maximum 8)
- **Idle Timeout**: 30 seconds
- **Max Queue**: 100 requests

## Architecture

### Processing Pipeline

1. **Image Normalization**: Resize to ≤2000px, ensure alpha channel
2. **Color Quantization**: Reduce to ≤12 colors using NeuQuant algorithm
3. **Edge Detection**: Canny edge detection for contour extraction
4. **Orientation Field**: Compute dominant orientation for each pixel
5. **Texture Generation**: Create thread and hatch patterns
6. **Compositing**: Layer textures and effects
7. **Background Handling**: Apply background if transparency not preserved

### Technologies Used

- **Sharp (libvips)**: High-performance image processing
- **OpenCV**: Computer vision operations (edge detection, orientation)
- **Image-Q**: Color quantization algorithms
- **Canvas**: Procedural texture generation
- **Piscina**: Worker thread pool management
- **Express**: HTTP server framework

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run the benchmark to ensure performance
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- Create an issue on GitHub
- Check the health endpoint: `GET /health`
- Review the benchmark results: `npm run bench`
