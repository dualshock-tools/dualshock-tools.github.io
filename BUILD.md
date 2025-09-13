# Build System Documentation

This document describes the build system for the DualShock Calibration GUI project.

## Overview

The build system creates a production-ready distribution of the web application with:

- **Bundled and minified JavaScript** (ES6 modules → single file)
- **Minified CSS** (multiple files → single file)
- **Inlined HTML templates** (no runtime fetching)
- **Bundled language files** (all translations in one file)
- **Optimized static assets**

## Quick Start

### Install Dependencies

```bash
npm install
```

### Development Build

```bash
npm run build:dev
```

- Creates unminified files for debugging
- Includes source maps
- Faster build time

### Production Build

```bash
npm run build
```

- Minifies all files for optimal size
- No source maps
- Optimized for deployment

### Clean Build Directory

```bash
npm run clean
```

### Serve Built Files Locally

```bash
npm run serve
```

Serves the `dist` folder on http://localhost:8080

### Development Workflow

```bash
npm run dev
```

Builds in development mode and starts local server

## Build Output

The build process creates a `dist/` directory with:

### Core Files

- `index.html` - Main HTML file with updated references
- `app.js` - Bundled JavaScript (64KB minified)
- `app.css` - Bundled CSS (2.3KB minified)
- `bundle-data.js` - Inlined templates and SVG assets (58KB minified)
- `languages.js` - All language files bundled (494KB minified)

### Static Assets

- All favicon and icon files
- `assets/` directory with SVG files
- `site.webmanifest` for PWA support
- Other static files (LICENSE.txt, etc.)

### Build Info

- `build-info.json` - Contains build timestamp and mode

## File Size Comparison

| File Type  | Original | Minified | Reduction |
| ---------- | -------- | -------- | --------- |
| JavaScript | 114KB    | 64KB     | 44%       |
| CSS        | 3.4KB    | 2.3KB    | 32%       |
| HTML       | 16KB     | 11KB     | 31%       |
| Templates  | 66KB     | 58KB     | 12%       |
| Languages  | 526KB    | 494KB    | 6%        |

## Build Features

### JavaScript Bundling

- Uses **esbuild** for fast bundling and minification
- Bundles all ES6 modules into a single file
- Tree-shaking removes unused code
- External CDN dependencies remain external

### CSS Processing

- Combines multiple CSS files
- Minifies with **clean-css**
- Removes unused styles and comments

### Template Inlining

- Converts HTML templates to JavaScript objects
- Eliminates runtime fetch requests
- Minifies HTML content

### Language Bundling

- Combines all JSON language files
- Creates single JavaScript module
- Reduces HTTP requests

### Asset Optimization

- Inlines SVG assets as JavaScript
- Copies static files efficiently
- Maintains directory structure

## Development vs Production

### Development Mode (`--dev`)

- Unminified code for debugging
- Source maps included
- Faster build times
- Readable output

### Production Mode (default)

- Minified and optimized
- No source maps
- Smaller file sizes
- Optimized for deployment

## Browser Compatibility

The built application maintains the same browser requirements:

- **WebHID API support** (Chrome-based browsers)
- **ES2020 features**
- **Modern JavaScript modules**

## Deployment

The `dist/` folder contains everything needed for deployment:

1. Upload entire `dist/` folder to web server
2. Ensure server supports:
   - HTTPS (required for WebHID)
   - Proper MIME types for `.js` and `.css` files
   - Gzip compression (recommended)

## Customization

### Adding New Files to Build

Edit `build/build.js` to include additional files:

```javascript
// In copyStaticAssets function
const staticFiles = [
  // Add new files here
  "new-file.txt",
];
```

### Modifying Build Process

The build script is modular with separate functions for each step:

- `buildJavaScript()` - JavaScript bundling
- `buildCSS()` - CSS processing
- `inlineTemplates()` - Template inlining
- `bundleLanguages()` - Language bundling
- `processHTML()` - HTML processing
- `copyStaticAssets()` - Asset copying

### Build Configuration

Key settings in `build/build.js`:

- `target: 'es2020'` - JavaScript target version
- `format: 'esm'` - Output module format
- Minification settings for HTML, CSS, and JS

## Troubleshooting

### Build Fails

1. Check Node.js version (requires Node 16+)
2. Ensure all dependencies are installed: `npm install`
3. Check for syntax errors in source files

### Large Bundle Size

1. Check for unused dependencies
2. Review language files (largest contributor)
3. Consider code splitting for very large applications

### Runtime Errors

1. Test with development build first
2. Check browser console for errors
3. Verify WebHID API availability

## Performance Benefits

The build system provides several performance improvements:

1. **Reduced HTTP Requests**: Multiple files → fewer files
2. **Smaller File Sizes**: Minification reduces bandwidth
3. **Faster Loading**: Bundled assets load more efficiently
4. **Better Caching**: Fewer files to cache and manage
5. **Eliminated Runtime Fetches**: Templates and languages are inlined

## Future Enhancements

Potential improvements to consider:

- **Code splitting** for very large applications
- **Image optimization** for PNG/SVG files
- **Service worker** generation for offline support
- **Bundle analysis** tools for size optimization
- **Hot reload** for development workflow
