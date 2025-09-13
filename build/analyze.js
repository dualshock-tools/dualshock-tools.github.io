#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { gzipSync, brotliCompressSync } from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

async function analyzeBundle() {
  console.log('📊 Analyzing bundle sizes...\n');

  const files = [
    { name: 'JavaScript', path: path.join(distDir, 'app.js') },
    { name: 'CSS', path: path.join(distDir, 'app.css') },
    { name: 'HTML', path: path.join(distDir, 'index.html') },
    { name: 'Bundle Data', path: path.join(distDir, 'bundle-data.js') },
    { name: 'Languages', path: path.join(distDir, 'languages.js') }
  ];

  let totalOriginal = 0;
  let totalGzip = 0;
  let totalBrotli = 0;

  console.log('File'.padEnd(15) + 'Original'.padEnd(12) + 'Gzip'.padEnd(12) + 'Brotli'.padEnd(12) + 'Compression');
  console.log('─'.repeat(70));

  for (const file of files) {
    if (await fs.pathExists(file.path)) {
      const content = await fs.readFile(file.path);
      const originalSize = content.length;
      const gzipSize = gzipSync(content).length;
      const brotliSize = brotliCompressSync(content).length;

      totalOriginal += originalSize;
      totalGzip += gzipSize;
      totalBrotli += brotliSize;

      const gzipRatio = ((1 - gzipSize / originalSize) * 100).toFixed(1);
      const brotliRatio = ((1 - brotliSize / originalSize) * 100).toFixed(1);

      console.log(
        file.name.padEnd(15) +
        formatBytes(originalSize).padEnd(12) +
        formatBytes(gzipSize).padEnd(12) +
        formatBytes(brotliSize).padEnd(12) +
        `${gzipRatio}% / ${brotliRatio}%`
      );
    }
  }

  console.log('─'.repeat(70));
  const totalGzipRatio = ((1 - totalGzip / totalOriginal) * 100).toFixed(1);
  const totalBrotliRatio = ((1 - totalBrotli / totalOriginal) * 100).toFixed(1);

  console.log(
    'TOTAL'.padEnd(15) +
    formatBytes(totalOriginal).padEnd(12) +
    formatBytes(totalGzip).padEnd(12) +
    formatBytes(totalBrotli).padEnd(12) +
    `${totalGzipRatio}% / ${totalBrotliRatio}%`
  );

  console.log('\n🎯 Recommendations:');
  
  if (totalOriginal > 500 * 1024) {
    console.log('⚠️  Bundle size is quite large (>500KB). Consider code splitting.');
  } else if (totalOriginal > 250 * 1024) {
    console.log('⚠️  Bundle size is moderate (>250KB). Monitor for growth.');
  } else {
    console.log('✅ Bundle size is reasonable (<250KB).');
  }

  if (totalGzipRatio < 60) {
    console.log('⚠️  Gzip compression ratio is low. Consider more aggressive minification.');
  } else {
    console.log('✅ Good compression ratio achieved.');
  }

  console.log('\n💡 Tips:');
  console.log('• Enable gzip/brotli compression on your web server');
  console.log('• Consider lazy loading for non-critical features');
  console.log('• Use tree shaking to eliminate unused code');
  console.log('• Consider using build:ultra for maximum compression');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function main() {
  try {
    if (!await fs.pathExists(distDir)) {
      console.error('❌ No dist directory found. Run npm run build first.');
      process.exit(1);
    }

    await analyzeBundle();
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  }
}

main();