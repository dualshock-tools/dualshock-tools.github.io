#!/usr/bin/env node

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const config = {
  httpPort: process.env.HTTP_PORT || 8080,
  host: process.env.HOST || 'localhost',
  distDir: path.join(__dirname, 'dist')
};

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || 'application/octet-stream';
}

function requestHandler(req, res) {
  // Parse URL and remove query parameters
  let urlPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  
  // Default to index.html for root requests
  if (urlPath === '/') {
    urlPath = '/index.html';
  }
  
  const filePath = path.join(config.distDir, urlPath);
  const mimeType = getMimeType(filePath);
  
  // Security check - ensure file is within dist directory
  if (!filePath.startsWith(config.distDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  
  // Set CORS headers for development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Disable caching for development
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Handle OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Try to serve index.html for SPA routing
        const indexPath = path.join(config.distDir, 'index.html');
        fs.readFile(indexPath, (indexErr, indexData) => {
          if (indexErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(indexData);
          }
        });
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(data);
    }
  });
}

function startServer() {
  // Check if dist directory exists
  if (!fs.existsSync(config.distDir)) {
    console.error(`❌ Dist directory not found: ${config.distDir}`);
    console.log('💡 Run "npm run build" first to build the application');
    process.exit(1);
  }
  
  const server = http.createServer(requestHandler);

  server.listen(config.httpPort, config.host, () => {
    console.log('🚀 Development server started!');
    console.log(`📱 App running at: http://${config.host}:${config.httpPort}`);
    console.log('💡 WebHID works here because localhost is a secure context');
    console.log('💡 Press Ctrl+C to stop the server');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${config.httpPort} is already in use`);
      console.log('💡 Try using a different port: HTTP_PORT=8081 npm run serve');
    } else {
      console.error('❌ Server error:', err.message);
    }
    process.exit(1);
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down development server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down development server...');
  process.exit(0);
});

// Start the server
startServer();