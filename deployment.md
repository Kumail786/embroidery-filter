# 🚀 Embroidery Filter API - Deployment Guide

## Overview
This is a Node.js Express API server that converts images into realistic embroidery effects in under 0.5 seconds.

## 🆓 Free Deployment Options

### 1. Railway (Recommended)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
railway login
railway init
railway up
```
- **Free tier**: 500 hours/month
- **Auto-deploy** from GitHub
- **Built-in domains**: your-app.railway.app

### 2. Render
1. Go to [render.com](https://render.com)
2. Connect your GitHub repository
3. Choose "Web Service"
4. Build command: `npm install && npm run build`
5. Start command: `npm start`
- **Free tier**: 750 hours/month
- **Auto-sleep** after 15min inactivity

### 3. Heroku
```bash
# Install Heroku CLI
heroku create your-embroidery-api
git push heroku main
```
- **Free tier**: 1000 hours/month (legacy)

## 📋 Environment Variables

Set these in your deployment platform:

```env
PORT=8080
NODE_ENV=production
MAX_WORKERS=2
WORKER_TIMEOUT=30000
MAX_FILE_SIZE=50MB
```

## 🧪 Testing with Postman

### 1. Health Check
```
GET https://your-api-url.com/health
```

### 2. Embroidery Filter
```
POST https://your-api-url.com/filter/embroidery
Content-Type: multipart/form-data

Body:
- image: [Select image file - JPG/PNG]
- options: {
    "maxColors": 12,
    "threadThickness": 5,
    "hatch": "diagonal",
    "style": {
      "orientation": "binned-8",
      "edges": "canny",
      "mode": "photo"
    },
    "lighting": { "sheen": 0.25 },
    "border": { "stitch": true, "width": 5 }
  }
```

### Response Headers:
- `X-Processing-Time`: Processing time in ms
- `X-Palette-Size`: Number of colors used
- `X-Original-Size`: Input image dimensions
- `X-Final-Size`: Output image dimensions

## 🔧 Production Optimization

### Memory Management
- Uses worker threads for CPU-intensive tasks
- Sharp optimizations for image processing
- LRU cache for texture assets

### Performance Monitoring
- Processing time logged for each request
- Health check endpoint for uptime monitoring
- Graceful shutdown handling

## 📖 API Documentation

### Endpoints

#### GET /health
Returns server status and configuration.

#### POST /filter/embroidery
Converts uploaded image to embroidery effect.

**Parameters:**
- `image` (file): Image file (JPG/PNG, max 50MB)
- `options` (JSON): Processing options

**Options Schema:**
```json
{
  "maxColors": 6-12,
  "threadThickness": 1-5,
  "hatch": "diagonal|cross|vertical|horizontal",
  "preserveTransparency": boolean,
  "style": {
    "orientation": "uniform|binned-4|binned-8",
    "edges": "canny|sobel",
    "mode": "photo|logo"
  },
  "lighting": { "sheen": 0.0-1.0 },
  "border": { "stitch": boolean, "width": 1-5 },
  "density": { "scale": 0.5-2.0 },
  "grain": { "randomness": 0.0-1.0 },
  "background": { "type": "fabric", "texture": "linen" }
}
```

## 🐳 Docker Deployment

```dockerfile
FROM node:18-bullseye-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 8080
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t embroidery-filter .
docker run -p 8080:8080 embroidery-filter
```
