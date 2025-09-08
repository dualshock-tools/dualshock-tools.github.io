// Build configuration for DualShock Calibration GUI

export const buildConfig = {
  // Input/Output paths
  paths: {
    root: '../',
    dist: 'dist',
    templates: 'templates',
    assets: 'assets',
    lang: 'lang',
    css: 'css',
    js: 'js',
    controllers: 'controllers'
  },

  // Files to include in build
  files: {
    entry: 'core.js',
    html: 'index.html',
    css: [
      'css/main.css',
      'css/finetune.css'
    ],
    staticAssets: [
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
    ]
  },

  // Build options
  build: {
    target: 'es2020',
    format: 'esm',
    
    // Minification options
    minify: {
      html: {
        collapseWhitespace: true,
        removeComments: true,
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
        useShortDoctype: true,
        minifyCSS: true,
        minifyJS: true
      },
      css: {
        level: 2
      }
    },

    // External dependencies (not bundled)
    external: [
      'https://code.jquery.com/*',
      'https://cdn.jsdelivr.net/*'
    ]
  },

  // Output file names
  output: {
    js: 'app.js',
    css: 'app.css',
    html: 'index.html',
    templates: 'bundle-data.js',
    languages: 'languages.js',
    buildInfo: 'build-info.json'
  }
};