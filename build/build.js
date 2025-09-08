#!/usr/bin/env node

import { build } from 'esbuild';
import { minify } from 'html-minifier-terser';
import { minify as terserMinify } from 'terser';
import CleanCSS from 'clean-css';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

// Check build mode
const isDev = process.argv.includes('--dev');
const skipLint = process.argv.includes('--skip-lint');
const isUltra = process.argv.includes('--ultra');

const buildMode = isDev ? 'development' : (isUltra ? 'ultra-production' : 'production');
console.log(`Building DualShock Calibration GUI (${buildMode} mode)...`);

async function cleanDist() {
  console.log('🧹 Cleaning dist directory...');
  await fs.remove(distDir);
  await fs.ensureDir(distDir);
}

async function runESLint() {
  if (skipLint) {
    console.log('⚠️  Skipping ESLint check...');
    return;
  }

  console.log('🔍 Running ESLint...');
  
  return new Promise((resolve, reject) => {
    const eslint = spawn('npx', ['eslint', '.'], {
      cwd: rootDir,
      stdio: 'inherit'
    });

    eslint.on('close', (code) => {
      if (code === 0) {
        console.log('✅ ESLint passed');
        resolve();
      } else {
        console.error('❌ ESLint failed');
        reject(new Error(`ESLint exited with code ${code}`));
      }
    });

    eslint.on('error', (error) => {
      console.error('❌ Failed to run ESLint:', error);
      reject(error);
    });
  });
}

async function buildJavaScript() {
  console.log('📦 Building JavaScript bundle...');
  
  try {
    // Create a temporary core.js that uses the build-compatible template loader
    const originalCore = await fs.readFile(path.join(rootDir, 'core.js'), 'utf8');
    const buildCore = originalCore.replace(
      "import { loadAllTemplates } from './js/template-loader.js';",
      "import { loadAllTemplates } from './build/template-loader-build.js';"
    );
    
    const tempCorePath = path.join(rootDir, 'core-build.js');
    await fs.writeFile(tempCorePath, buildCore);
    
    await build({
      entryPoints: [tempCorePath],
      bundle: true,
      format: 'esm',
      target: 'es2020',
      outfile: path.join(distDir, 'app.js'),
      minify: !isDev,
      sourcemap: isDev,
      treeShaking: true,
      mangleProps: !isDev ? /^_/ : undefined, // Mangle properties starting with underscore
      define: {
        'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
        'DEBUG': isDev ? 'true' : 'false'
      },
      drop: !isDev ? ['console', 'debugger'] : [],
      loader: {
        '.svg': 'text',
        '.html': 'text'
      },
      external: [
        'https://code.jquery.com/*',
        'https://cdn.jsdelivr.net/*'
      ],
      legalComments: 'none',
      keepNames: false,
      minifyWhitespace: !isDev,
      minifyIdentifiers: !isDev,
      minifySyntax: !isDev
    });
    
    // Clean up temporary file
    await fs.remove(tempCorePath);
    
    // Apply additional Terser compression for production builds
    if (!isDev) {
      console.log('🔧 Applying additional Terser compression...');
      const jsPath = path.join(distDir, 'app.js');
      const jsContent = await fs.readFile(jsPath, 'utf8');
      
      const terserOptions = {
        compress: {
          arguments: true,
          booleans_as_integers: true,
          drop_console: true,
          drop_debugger: true,
          ecma: 2020,
          hoist_funs: true,
          hoist_props: true,
          hoist_vars: true,
          inline: isUltra ? 4 : 3,
          loops: true,
          negate_iife: true,
          properties: true,
          reduce_funcs: true,
          reduce_vars: true,
          switches: true,
          toplevel: true,
          typeofs: false,
          unsafe: true,
          unsafe_arrows: true,
          unsafe_comps: true,
          unsafe_Function: true,
          unsafe_math: true,
          unsafe_symbols: true,
          unsafe_methods: true,
          unsafe_proto: true,
          unsafe_regexp: true,
          unsafe_undefined: true,
          unused: true,
          // Ultra mode specific optimizations
          ...(isUltra && {
            collapse_vars: true,
            conditionals: true,
            dead_code: true,
            evaluate: true,
            if_return: true,
            join_vars: true,
            keep_fargs: false,
            passes: 3,
            pure_getters: true,
            sequences: true,
            side_effects: true,
            warnings: false
          })
        },
        mangle: {
          toplevel: true,
          properties: isUltra ? {
            regex: /^[_$]/,
            reserved: ['$', 'jQuery', 'window', 'document']
          } : {
            regex: /^_/
          }
        },
        format: {
          comments: false,
          ecma: 2020,
          ...(isUltra && {
            ascii_only: true,
            beautify: false,
            braces: false,
            semicolons: false
          })
        },
        ecma: 2020,
        toplevel: true
      };
      
      const terserResult = await terserMinify(jsContent, terserOptions);
      
      if (terserResult.error) {
        console.error('❌ Terser compression failed:', terserResult.error);
        throw terserResult.error;
      }
      
      await fs.writeFile(jsPath, terserResult.code);
      console.log('✅ Additional Terser compression applied');
    }
    
    console.log('✅ JavaScript bundle created');
  } catch (error) {
    console.error('❌ JavaScript build failed:', error);
    throw error;
  }
}

async function buildCSS() {
  console.log('🎨 Building CSS bundle...');
  
  const cssFiles = [
    path.join(rootDir, 'css', 'main.css'),
    path.join(rootDir, 'css', 'finetune.css')
  ];
  
  let combinedCSS = '';
  
  for (const cssFile of cssFiles) {
    if (await fs.pathExists(cssFile)) {
      const content = await fs.readFile(cssFile, 'utf8');
      combinedCSS += `/* ${path.basename(cssFile)} */\n${content}\n\n`;
    }
  }
  
  if (!isDev) {
    const cleanCSS = new CleanCSS({
      level: 2,
      returnPromise: true
    });
    
    try {
      const result = await cleanCSS.minify(combinedCSS);
      combinedCSS = result.styles;
      console.log('✅ CSS minified');
    } catch (error) {
      console.error('❌ CSS minification failed:', error);
      throw error;
    }
  }
  
  await fs.writeFile(path.join(distDir, 'app.css'), combinedCSS);
  console.log('✅ CSS bundle created');
}

async function inlineTemplates() {
  console.log('📄 Inlining HTML templates...');
  
  const templatesDir = path.join(rootDir, 'templates');
  const templates = {};
  
  if (await fs.pathExists(templatesDir)) {
    const templateFiles = await fs.readdir(templatesDir);
    
    for (const file of templateFiles) {
      if (file.endsWith('.html')) {
        const templatePath = path.join(templatesDir, file);
        let content = await fs.readFile(templatePath, 'utf8');
        
        if (!isDev) {
          content = await minify(content, {
            collapseWhitespace: true,
            removeComments: true,
            removeRedundantAttributes: true,
            removeScriptTypeAttributes: true,
            removeStyleLinkTypeAttributes: true,
            useShortDoctype: true,
            minifyCSS: true,
            minifyJS: true
          });
        }
        
        const templateName = path.basename(file, '.html');
        templates[templateName] = content;
      }
    }
  }
  
  // Also inline SVG assets
  const assets = {};
  const assetsDir = path.join(rootDir, 'assets');
  if (await fs.pathExists(assetsDir)) {
    const assetFiles = await fs.readdir(assetsDir);
    for (const file of assetFiles) {
      if (file.endsWith('.svg')) {
        const assetPath = path.join(assetsDir, file);
        const content = await fs.readFile(assetPath, 'utf8');
        assets[file] = content;
      }
    }
  }
  
  const bundleJS = `
// Auto-generated templates and assets bundle
window.TEMPLATES = ${JSON.stringify(templates, null, isDev ? 2 : 0)};
window.ASSETS = ${JSON.stringify(assets, null, isDev ? 2 : 0)};
`;
  
  await fs.writeFile(path.join(distDir, 'bundle-data.js'), bundleJS);
  console.log('✅ Templates and assets inlined');
}



async function processHTML() {
  console.log('📝 Processing HTML...');
  
  const indexPath = path.join(rootDir, 'index.html');
  let html = await fs.readFile(indexPath, 'utf8');
  
  // Replace script and CSS references
  html = html.replace(
    '<script type="module" src="core.js"></script>',
    '<script src="bundle-data.js"></script>\n<script type="module" src="app.js"></script>'
  );
  
  html = html.replace(
    '<link rel="stylesheet" href="css/main.css">',
    '<link rel="stylesheet" href="app.css">'
  );
  
  html = html.replace(
    '<link rel="stylesheet" href="css/finetune.css">',
    ''
  );
  
  if (!isDev) {
    html = await minify(html, {
      collapseWhitespace: true,
      removeComments: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      useShortDoctype: true,
      minifyCSS: true,
      minifyJS: true
    });
  }
  
  await fs.writeFile(path.join(distDir, 'index.html'), html);
  console.log('✅ HTML processed');
}

async function copyStaticAssets() {
  console.log('📁 Copying static assets...');
  
  const staticFiles = [
    // Icons and favicons
    'apple-touch-icon.png',
    'favicon-16x16.png',
    'favicon-32x32.png',
    'favicon-96x96.png',
    'favicon.ico',
    'favicon.svg',
    'web-app-manifest-192x192.png',
    'web-app-manifest-512x512.png',
    'site.webmanifest',
    
    // Other assets
    'donate.png',
    'googlec4c2e36a49e62fa3.html',
    'LICENSE.txt'
  ];
  
  for (const file of staticFiles) {
    const srcPath = path.join(rootDir, file);
    const destPath = path.join(distDir, file);
    
    if (await fs.pathExists(srcPath)) {
      await fs.copy(srcPath, destPath);
    }
  }
  
  // Copy assets directory
  const assetsDir = path.join(rootDir, 'assets');
  if (await fs.pathExists(assetsDir)) {
    await fs.copy(assetsDir, path.join(distDir, 'assets'));
  }
  
  // Copy language files
  const langDir = path.join(rootDir, 'lang');
  if (await fs.pathExists(langDir)) {
    await fs.copy(langDir, path.join(distDir, 'lang'));
    console.log('✅ Language files copied');
  }
  
  console.log('✅ Static assets copied');
}

async function generateBuildInfo() {
  const buildInfo = {
    buildTime: new Date().toISOString(),
    mode: buildMode,
    version: '1.0.0',
    compression: {
      esbuild: !isDev,
      terser: !isDev,
      ultraMode: isUltra
    }
  };
  
  // Add file size information for production builds
  if (!isDev) {
    const jsPath = path.join(distDir, 'app.js');
    const cssPath = path.join(distDir, 'app.css');
    const htmlPath = path.join(distDir, 'index.html');
    
    const getFileSize = async (filePath) => {
      try {
        const stats = await fs.stat(filePath);
        return {
          bytes: stats.size,
          kb: Math.round(stats.size / 1024 * 100) / 100,
          mb: Math.round(stats.size / 1024 / 1024 * 100) / 100
        };
      } catch {
        return null;
      }
    };
    
    buildInfo.fileSizes = {
      javascript: await getFileSize(jsPath),
      css: await getFileSize(cssPath),
      html: await getFileSize(htmlPath)
    };
    
    // Calculate total bundle size
    const totalBytes = Object.values(buildInfo.fileSizes)
      .filter(size => size !== null)
      .reduce((sum, size) => sum + size.bytes, 0);
    
    buildInfo.totalSize = {
      bytes: totalBytes,
      kb: Math.round(totalBytes / 1024 * 100) / 100,
      mb: Math.round(totalBytes / 1024 / 1024 * 100) / 100
    };
  }
  
  await fs.writeJson(path.join(distDir, 'build-info.json'), buildInfo, { spaces: 2 });
  console.log('✅ Build info generated');
  
  // Display compression statistics
  if (!isDev && buildInfo.fileSizes) {
    console.log('\n📊 Bundle Size Analysis:');
    console.log(`JavaScript: ${buildInfo.fileSizes.javascript?.kb || 0} KB`);
    console.log(`CSS: ${buildInfo.fileSizes.css?.kb || 0} KB`);
    console.log(`HTML: ${buildInfo.fileSizes.html?.kb || 0} KB`);
    console.log(`Total: ${buildInfo.totalSize.kb} KB`);
  }
}

async function main() {
  try {
    const startTime = Date.now();
    
    await cleanDist();
    await runESLint();
    await Promise.all([
      buildJavaScript(),
      buildCSS(),
      inlineTemplates()
    ]);
    await processHTML();
    await copyStaticAssets();
    await generateBuildInfo();
    
    const buildTime = Date.now() - startTime;
    console.log(`\n🎉 Build completed successfully in ${buildTime}ms`);
    console.log(`📦 Output directory: ${distDir}`);
    
    if (isDev) {
      console.log('🔧 Development build - files are not minified');
    } else if (isUltra) {
      console.log('🚀 Ultra production build - maximum compression applied');
      console.log('💡 Run "npm run analyze" to see detailed compression statistics');
    } else {
      console.log('🚀 Production build - files are minified and optimized');
    }
    
  } catch (error) {
    console.error('\n❌ Build failed:', error);
    process.exit(1);
  }
}

main();