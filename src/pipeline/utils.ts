import sharp from 'sharp';

export function rgbaToGray(rgba: Buffer, info: { width: number; height: number; channels: number }): Uint8Array {
	const { width, height, channels } = info as any;
	const out = new Uint8Array(width * height);
	for (let i = 0, p = 0; i < rgba.length; i += channels, p++) {
		const r = Number(rgba[i] ?? 0);
		const g = Number(rgba[i + 1] ?? 0);
		const b = Number(rgba[i + 2] ?? 0);
		out[p] = Math.max(0, Math.min(255, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)));
	}
	return out;
}

export function extractAlpha(rgba: Buffer, info: { width: number; height: number; channels: number }): Uint8Array {
	const { width, height, channels } = info as any;
	const out = new Uint8Array(width * height);
	if ((channels ?? 0) < 4) { out.fill(255); return out; }
	for (let i = 0, p = 0; i < rgba.length; i += channels, p++) out[p] = Number(rgba[i + 3] ?? 255);
	return out;
}

export function gaussianBlur3x3(gray: Uint8Array, width: number, height: number): Uint8Array {
	const k: number[] = [1,2,1,2,4,2,1,2,1];
	const out = new Uint8Array(width * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let acc = 0, wsum = 0, idx = 0;
			for (let j = -1; j <= 1; j++) {
				const yy = Math.max(0, Math.min(height - 1, y + j));
				for (let i = -1; i <= 1; i++) {
					const xx = Math.max(0, Math.min(width - 1, x + i));
					const w = Number(k[idx++] ?? 0);
					acc += Number(gray[yy * width + xx] ?? 0) * w; wsum += w;
				}
			}
			out[y * width + x] = wsum > 0 ? Math.round(acc / wsum) : (gray[y * width + x] ?? 0);
		}
	}
	return out;
}

export function sobel(gray: Uint8Array, width: number, height: number): { gx: Float32Array; gy: Float32Array } {
	const kx: number[] = [-1,0,1,-2,0,2,-1,0,1];
	const ky: number[] = [-1,-2,-1,0,0,0,1,2,1];
	const gx = new Float32Array(width * height);
	const gy = new Float32Array(width * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let sx = 0, sy = 0, idx = 0;
			for (let j = -1; j <= 1; j++) {
				const yy = Math.max(0, Math.min(height - 1, y + j));
				for (let i = -1; i <= 1; i++) {
					const xx = Math.max(0, Math.min(width - 1, x + i));
					const v = Number(gray[yy * width + xx] ?? 0);
					sx += v * Number(kx[idx] ?? 0); sy += v * Number(ky[idx] ?? 0); idx++;
				}
			}
			gx[y * width + x] = sx; gy[y * width + x] = sy;
		}
	}
	return { gx, gy };
}

export function binsFromGradients(gx: Float32Array, gy: Float32Array, width: number, height: number, numBins: number): Uint8Array {
	const bins = new Uint8Array(width * height);
	const scale = numBins / Math.PI;
	for (let i = 0; i < bins.length; i++) {
		let a = Math.atan2(Number(gy[i] ?? 0), Number(gx[i] ?? 0));
		if (a < 0) a += Math.PI; // [0, pi)
		let b = Math.floor(a * scale);
		if (b < 0) b = 0; if (b >= numBins) b = numBins - 1;
		bins[i] = b as number;
	}
	return bins;
}

export function maskForBin(bins: Uint8Array, width: number, height: number, binIndex: number): Uint8Array {
	const out = new Uint8Array(width * height);
	for (let i = 0; i < out.length; i++) out[i] = (Number(bins[i] ?? 0) === binIndex ? 255 : 0);
	return out;
}

export function magnitudeThreshold(gx: Float32Array, gy: Float32Array, width: number, height: number, threshold: number): Uint8Array {
	const out = new Uint8Array(width * height);
	for (let i = 0; i < out.length; i++) {
		const m = Math.hypot(Number(gx[i] ?? 0), Number(gy[i] ?? 0));
		out[i] = m >= threshold ? 255 : 0;
	}
	return out;
}

export async function encodeMaskPNG(mask: Uint8Array, width: number, height: number): Promise<Buffer> {
	return await sharp(Buffer.from(mask), { raw: { width, height, channels: 1 } }).png().toBuffer();
}

export function downsampleNearest(src: Uint8Array, w: number, h: number, scale: number): { data: Uint8Array; w: number; h: number } {
	if (scale <= 1) return { data: src, w, h };
	const nw = Math.max(1, Math.floor(w / scale)), nh = Math.max(1, Math.floor(h / scale));
	const out = new Uint8Array(nw * nh);
	for (let y = 0; y < nh; y++) {
		for (let x = 0; x < nw; x++) {
			const sx = Math.min(w - 1, Math.floor(x * scale));
			const sy = Math.min(h - 1, Math.floor(y * scale));
			out[y * nw + x] = Number(src[sy * w + sx] ?? 0);
		}
	}
	return { data: out, w: nw, h: nh };
}

export function upscaleNearest(src: Uint8Array, w: number, h: number, W: number, H: number): Uint8Array {
	if (W === w && H === h) return src;
	const out = new Uint8Array(W * H);
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const sx = Math.min(w - 1, Math.floor((x * w) / W));
			const sy = Math.min(h - 1, Math.floor((y * h) / H));
			out[y * W + x] = Number(src[sy * w + sx] ?? 0);
		}
	}
	return out;
}

export function distanceTransform(src: Uint8Array, width: number, height: number): Float32Array {
	const inf = 1e9;
	const dist = new Float32Array(width * height);
	for (let i = 0; i < dist.length; i++) dist[i] = (src[i] ?? 0) > 0 ? 0 : inf;
	const w = width;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = y * w + x;
			const cur = Number(dist[i] ?? inf);
			let best = cur;
			if (x > 0) best = Math.min(best, Number(dist[i - 1] ?? inf) + 1);
			if (y > 0) best = Math.min(best, Number(dist[i - w] ?? inf) + 1);
			if (x > 0 && y > 0) best = Math.min(best, Number(dist[i - w - 1] ?? inf) + 1.4);
			if (x + 1 < width && y > 0) best = Math.min(best, Number(dist[i - w + 1] ?? inf) + 1.4);
			dist[i] = best;
		}
	}
	for (let y = height - 1; y >= 0; y--) {
		for (let x = width - 1; x >= 0; x--) {
			const i = y * w + x;
			const cur = Number(dist[i] ?? 0);
			let best = cur;
			if (x + 1 < width) best = Math.min(best, Number(dist[i + 1] ?? inf) + 1);
			if (y + 1 < height) best = Math.min(best, Number(dist[i + w] ?? inf) + 1);
			if (x + 1 < width && y + 1 < height) best = Math.min(best, Number(dist[i + w + 1] ?? inf) + 1.4);
			if (x > 0 && y + 1 < height) best = Math.min(best, Number(dist[i + w - 1] ?? inf) + 1.4);
			dist[i] = best;
		}
	}
	return dist;
}

export function seededRandom(seed: number): () => number {
	let s = seed >>> 0;
	return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s & 0xfffffff) / 0xfffffff; };
}


