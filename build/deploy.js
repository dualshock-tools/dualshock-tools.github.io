#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

console.log('🚀 Deployment Preparation Script');
console.log('================================');

async function checkBuildExists() {
  if (!(await fs.pathExists(distDir))) {
    console.error('❌ No build found. Run "npm run build" first.');
    process.exit(1);
  }
  console.log('✅ Build directory found');
}

async function validateBuild() {
  const requiredFiles = [
    'index.html',
    'app.js',
    'app.css',
    'bundle-data.js',
    'languages.js'
  ];

  for (const file of requiredFiles) {
    const filePath = path.join(distDir, file);
    if (!(await fs.pathExists(filePath))) {
      console.error(`❌ Missing required file: ${file}`);
      process.exit(1);
    }
  }
  console.log('✅ All required files present');
}

async function generateDeploymentInfo() {
  const stats = await fs.stat(distDir);
  const files = await fs.readdir(distDir, { recursive: true });
  
  let totalSize = 0;
  const fileList = [];

  for (const file of files) {
    const filePath = path.join(distDir, file);
    const stat = await fs.stat(filePath);
    
    if (stat.isFile()) {
      totalSize += stat.size;
      fileList.push({
        name: file,
        size: stat.size,
        sizeFormatted: formatBytes(stat.size)
      });
    }
  }

  const deployInfo = {
    buildTime: stats.mtime.toISOString(),
    totalFiles: fileList.length,
    totalSize: totalSize,
    totalSizeFormatted: formatBytes(totalSize),
    files: fileList.sort((a, b) => b.size - a.size)
  };

  await fs.writeJson(path.join(distDir, 'deploy-info.json'), deployInfo, { spaces: 2 });
  
  console.log(`✅ Deployment info generated`);
  console.log(`   📁 Total files: ${deployInfo.totalFiles}`);
  console.log(`   📦 Total size: ${deployInfo.totalSizeFormatted}`);
  
  console.log('\n📊 Largest files:');
  deployInfo.files.slice(0, 5).forEach(file => {
    console.log(`   ${file.sizeFormatted.padStart(8)} - ${file.name}`);
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function showDeploymentInstructions() {
  console.log('\n🌐 Deployment Instructions');
  console.log('==========================');
  console.log('1. Upload the entire "dist/" folder to your web server');
  console.log('2. Ensure your server supports:');
  console.log('   - HTTPS (required for WebHID API)');
  console.log('   - Proper MIME types for .js and .css files');
  console.log('   - Gzip compression (recommended)');
  console.log('3. Test the application in a Chrome-based browser');
  console.log('\n📋 Server Configuration:');
  console.log('   - Document root: point to the dist/ folder');
  console.log('   - Index file: index.html');
  console.log('   - Error pages: redirect to index.html for SPA routing');
}

async function main() {
  try {
    await checkBuildExists();
    await validateBuild();
    await generateDeploymentInfo();
    await showDeploymentInstructions();
    
    console.log('\n🎉 Ready for deployment!');
  } catch (error) {
    console.error('\n❌ Deployment preparation failed:', error.message);
    process.exit(1);
  }
}

main();