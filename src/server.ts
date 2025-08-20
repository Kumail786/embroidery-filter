import express from 'express';
import multer from 'multer';
import cors from 'cors';
import Piscina from 'piscina';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import sharp from 'sharp';

// Sharp/libvips global tuning
try {
	sharp.simd(true);
	sharp.cache(false); // disable internal cache for unrelated images
	sharp.concurrency(1); // reduce fragmentation on non-jemalloc systems
} catch {}

// Types
interface EmbroideryOptions {
  maxColors?: number;
  threadThickness?: number;
  preserveTransparency?: boolean;
  hatch?: 'none' | 'diagonal' | 'cross';
  background?: {
    type: 'color' | 'fabric';
    hex?: string;
    name?: string;
  } | null;
  style?: {
    orientation?: 'binned-8' | 'lic';
    edges?: 'canny' | 'xdog';
    mode?: 'photo' | 'logo';
  };
  lighting?: { sheen?: number };
  border?: { stitch?: boolean; width?: number };
  density?: { scale?: number };
  grain?: { randomness?: number };
}

interface WorkerPayload {
  image: Buffer;
  mime: string;
  options: EmbroideryOptions;
}

interface WorkerResult {
  buffer: Buffer;
  mime: string;
  meta?: {
    processingTime: number;
    paletteSize: number;
    originalSize: { width: number; height: number };
    finalSize: { width: number; height: number };
    palette?: Array<{ r:number; g:number; b:number; a:number }>;
    warnings?: string[];
  };
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8080;

// Configure CORS
app.use(cors({
  origin: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024, // 8MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Initialize worker pool
const piscina = new Piscina({
  filename: new URL('./workers/bootstrap.cjs', import.meta.url).pathname,
  maxThreads: Math.max(1, Math.min(8, os.cpus().length - 1)),
  idleTimeout: 30000, // 30 seconds
  maxQueue: 100,
  execArgv: ['--import', 'tsx']
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    workerPool: {
      threadCount: piscina.maxThreads,
      queueSize: piscina.queueSize,
      completed: piscina.completed,
      duration: piscina.duration
    }
  });
});

// Main embroidery filter endpoint
app.post('/filter/embroidery', upload.single('image'), async (req, res) => {
  try {
    // Validate file upload
    if (!req.file) {
      return res.status(400).json({
        error: 'No image file provided',
        message: 'Please upload an image file using the "image" field'
      });
    }

    // Parse and validate options
    const raw: EmbroideryOptions = JSON.parse(req.body?.options || '{}');
    
    const options: EmbroideryOptions = {
      maxColors: Math.min(12, Math.max(2, raw.maxColors ?? 8)),
      threadThickness: Math.max(1, Math.min(10, raw.threadThickness ?? 3)),
      preserveTransparency: raw.preserveTransparency ?? true,
      hatch: (raw.hatch as any) ?? 'diagonal',
      background: raw.background ?? null,
      style: { orientation: raw.style?.orientation ?? 'binned-8', edges: raw.style?.edges ?? 'canny', mode: raw.style?.mode ?? 'photo' },
      lighting: { sheen: raw.lighting?.sheen ?? 0.25 },
      border: { stitch: raw.border?.stitch ?? true, width: raw.border?.width ?? (raw.threadThickness ?? 3) },
      density: { scale: raw.density?.scale ?? 1.0 },
      grain: { randomness: raw.grain?.randomness ?? 0.15 }
    };

    // Validate hatch option
    if (!['none', 'diagonal', 'cross'].includes(options.hatch!)) {
      return res.status(400).json({
        error: 'Invalid hatch option',
        message: 'hatch must be one of: none, diagonal, cross'
      });
    }

    // Validate background configuration
    if (options.background) {
      if (!['color', 'fabric'].includes(options.background.type)) {
        return res.status(400).json({
          error: 'Invalid background type',
          message: 'background.type must be "color" or "fabric"'
        });
      }
      
      if (options.background.type === 'color' && !options.background.hex) {
        return res.status(400).json({
          error: 'Missing background color',
          message: 'background.hex is required when background.type is "color"'
        });
      }
      
      if (options.background.type === 'fabric' && !options.background.name) {
        return res.status(400).json({
          error: 'Missing fabric name',
          message: 'background.name is required when background.type is "fabric"'
        });
      }
    }

    // Prepare worker payload
    const payload: WorkerPayload = {
      image: req.file.buffer,
      mime: req.file.mimetype,
      options: options
    };

    // Process image in worker thread
    const startTime = Date.now();
    const result: WorkerResult = await piscina.run(payload);
    const processingTime = Date.now() - startTime;

    // Set response headers
    res.setHeader('Content-Type', result.mime);
    res.setHeader('X-Processing-Ms', String(processingTime));
    
    if (result.meta?.palette) res.setHeader('X-Palette', JSON.stringify(result.meta.palette));
    if (result.meta?.warnings?.length) res.setHeader('X-Warnings', result.meta.warnings.join('|'));

    // Send processed image
    return res.send(Buffer.from(result.buffer));

  } catch (error: any) {
    console.error('Error processing embroidery filter:', error);
    
    // Handle specific error types
    if (error.message?.includes('Only image files are allowed')) {
      return res.status(400).json({
        error: 'Invalid file type',
        message: 'Please upload a valid image file (PNG, JPG, etc.)'
      });
    }
    
    if (error.message?.includes('File too large')) {
      return res.status(400).json({
        error: 'File too large',
        message: 'Maximum file size is 8MB'
      });
    }

    // Generic error response
    return res.status(500).json({
      error: 'Processing failed',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested endpoint does not exist'
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await piscina.destroy();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await piscina.destroy();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Embroidery filter server listening on port ${PORT}`);
  console.log(`📊 Worker pool initialized with ${piscina.maxThreads} threads`);
  console.log(`🔗 Health check available at http://localhost:${PORT}/health`);
  console.log(`🎨 Filter endpoint: POST http://localhost:${PORT}/filter/embroidery`);
});
