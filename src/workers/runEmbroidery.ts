import { processEmbroidery } from '../pipeline/embroidery.ts';

// Types for worker communication
interface WorkerPayload {
  image: Buffer;
  mime: string;
  options: {
    maxColors: number;
    threadThickness: number;
    preserveTransparency: boolean;
    hatch: 'none' | 'diagonal' | 'cross';
    background: {
      type: 'color' | 'fabric';
      hex?: string;
      name?: string;
    } | null;
    style: {
      orientation: 'binned-8' | 'lic';
      edges: 'canny' | 'xdog';
    };
  };
}

interface WorkerResult {
  buffer: Buffer;
  mime: string;
  meta?: {
    processingTime: number;
    paletteSize: number;
    originalSize: { width: number; height: number };
    finalSize: { width: number; height: number };
  };
}

/**
 * Worker thread entry point for embroidery processing
 * This function is called by the main thread via Piscina
 */
export default async function runEmbroidery(payload: WorkerPayload): Promise<WorkerResult> {
  try {
    const startTime = Date.now();
    
    // Process the image through the embroidery pipeline
    const result = await processEmbroidery(
      payload.image,
      payload.mime,
      payload.options
    );
    
    const processingTime = Date.now() - startTime;
    
    // Return the processed image with metadata
    return {
      buffer: result.buffer,
      mime: result.mime,
      meta: {
        processingTime,
        paletteSize: result.meta?.paletteSize || 0,
        originalSize: result.meta?.originalSize || { width: 0, height: 0 },
        finalSize: result.meta?.finalSize || { width: 0, height: 0 }
      }
    };
    
  } catch (error) {
    // Re-throw the error to be handled by the main thread
    throw error;
  }
}
