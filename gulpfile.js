import gulp from 'gulp';
import cleanCSS from 'gulp-clean-css';
import htmlmin from 'gulp-htmlmin';
import concat from 'gulp-concat';
import sourcemaps from 'gulp-sourcemaps';
import gulpif from 'gulp-if';
import rename from 'gulp-rename';
import { deleteAsync } from 'del';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import replace from 'gulp-replace';
import jsonMinify from 'gulp-json-minify';
import crypto from 'crypto';
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import rollupTerser from '@rollup/plugin-terser';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

// Get command line arguments
const argv = yargs(hideBin(process.argv)).argv;
const isProduction = argv.production || process.env.NODE_ENV === 'production';

// Paths configuration
const paths = {
  src: {
    js: {
      entry: 'js/core.js',
      all: 'js/**/*.js'
    },
    css: ['css/main.css', 'css/finetune.css'],
    html: {
      main: 'index.html',
      templates: 'templates/**/*.html'
    },
    lang: 'lang/**/*.json',
    assets: [
      'favicon.ico',
      'favicon.svg',
      'favicon-16x16.png',
      'favicon-32x32.png',
      'favicon-96x96.png',
      'apple-touch-icon.png',
      'web-app-manifest-192x192.png',
      'web-app-manifest-512x512.png',
      'site.webmanifest',
      'donate.png',
      'googlec4c2e36a49e62fa3.html',
      'fa.min.css'
    ],
    svg: 'assets/**/*.svg'
  },
  dist: 'dist',
  temp: '.tmp'
};

// Clean task
function clean() {
  return deleteAsync([paths.dist, paths.temp]);
}

// JavaScript bundling with Rollup
async function scripts() {
  const inputOptions = {
    input: paths.src.js.entry,
    plugins: [
      nodeResolve(),
      ...(isProduction ? [
        rollupTerser({
          compress: {
            drop_console: false,
            drop_debugger: true,
            pure_funcs: ['console.debug', 'console.trace'],
            passes: 2,
            unsafe: true,
            unsafe_comps: true,
            unsafe_math: true,
            unsafe_proto: true
          },
          mangle: {
            reserved: [
              'gboot', 'connect', 'disconnect', 'disconnectSync',
              'show_faq_modal', 'calibrate_stick_centers', 'calibrate_range',
              'ds5_finetune', 'auto_calibrate_stick_centers', 'flash_all_changes',
              'reboot_controller', 'welcome_accepted', 'show_info_tab',
              'nvslock', 'nvsunlock', 'refresh_nvstatus', 'show_edge_modal',
              'show_donate_modal'
            ],
            properties: {
              regex: /^_/
            }
          },
          format: {
            comments: false
          }
        })
      ] : [])
    ]
  };

  let filename = 'app.js';
  
  if (isProduction) {
    const bundle = await rollup(inputOptions);
    const { output } = await bundle.generate({ format: 'es' });
    const code = output[0].code;
    const hash = crypto.createHash('md5').update(code).digest('hex').substring(0, 8);
    filename = `app-${hash}.js`;
    
    await fs.writeFile(path.join(paths.dist, filename), code);
    await bundle.close();
  } else {
    const outputOptions = {
      file: path.join(paths.dist, filename),
      format: 'es',
      sourcemap: true
    };

    const bundle = await rollup(inputOptions);
    await bundle.write(outputOptions);
    await bundle.close();
  }

  // Store the filename for HTML processing
  global.jsFilename = filename;
  return Promise.resolve();
}

// CSS processing
function styles() {
  let stream = gulp.src(paths.src.css)
    .pipe(gulpif(!isProduction, sourcemaps.init()))
    .pipe(concat('app.css'));

  if (isProduction) {
    stream = stream.pipe(cleanCSS({
      level: 2
    }));
    
    // Add hash to filename in production
    stream = stream.pipe(rename(function(path) {
      const hash = crypto.createHash('md5').update(Date.now().toString()).digest('hex').substring(0, 8);
      path.basename = `app-${hash}`;
      global.cssFilename = `${path.basename}.css`;
    }));
  } else {
    stream = stream.pipe(sourcemaps.write('.'));
    global.cssFilename = 'app.css';
  }

  return stream.pipe(gulp.dest(paths.dist));
}

// Bundle templates and SVG assets into HTML for production
async function bundleAssets() {
  if (!isProduction) {
    return Promise.resolve();
  }

  try {
    // Read all template files
    const templateFiles = await glob('templates/**/*.html');
    const templates = {};
    
    for (const templateFile of templateFiles) {
      const content = await fs.readFile(templateFile, 'utf8');
      const templateName = path.basename(templateFile, '.html');
      templates[templateName] = content;
    }

    // Read SVG assets
    const svgFiles = await glob('assets/**/*.svg');
    const svgAssets = {};
    
    for (const svgFile of svgFiles) {
      const content = await fs.readFile(svgFile, 'utf8');
      const assetName = path.relative('assets', svgFile);
      svgAssets[assetName] = content;
    }

    // Create the bundled assets object
    const bundledAssets = {
      templates,
      svg: svgAssets
    };

    // Store for use in HTML processing
    global.bundledAssets = bundledAssets;
    return Promise.resolve();
  } catch (error) {
    console.error('Error bundling assets:', error);
    throw error;
  }
}

// HTML processing
async function html() {
  const jsFile = global.jsFilename || 'app.js';
  const cssFile = global.cssFilename || 'app.css';
  
  let htmlContent = await fs.readFile(paths.src.html.main, 'utf8');
  
  // Replace script and CSS references
  htmlContent = htmlContent.replace('<script type="module" src="js/core.js"></script>', `<script type="module" src="${jsFile}"></script>`);
  htmlContent = htmlContent.replace('<link rel="stylesheet" href="css/main.css">', '');
  htmlContent = htmlContent.replace('<link rel="stylesheet" href="css/finetune.css">', `<link rel="stylesheet" href="${cssFile}">`);

  // In production, inject bundled assets
  if (isProduction && global.bundledAssets) {
    const bundledAssetsScript = `
    <script type="text/javascript">
      window.BUNDLED_ASSETS = ${JSON.stringify(global.bundledAssets)};
    </script>`;
    
    // Insert the bundled assets script before the main app script
    htmlContent = htmlContent.replace(
      `<script type="module" src="${jsFile}"></script>`,
      `${bundledAssetsScript}\n<script type="module" src="${jsFile}"></script>`
    );
  }

  if (isProduction) {
    // Use htmlmin to minify the content
    const htmlMinify = (await import('html-minifier-terser')).minify;
    htmlContent = await htmlMinify(htmlContent, {
      caseSensitive: false,
      collapseBooleanAttributes: true,
      collapseInlineTagWhitespace: false,
      collapseWhitespace: true,
      conservativeCollapse: false,
      decodeEntities: true,
      html5: true,
      includeAutoGeneratedTags: true,
      keepClosingSlash: false,
      minifyCSS: true,
      minifyJS: true,
      minifyURLs: false,
      preserveLineBreaks: false,
      preventAttributesEscaping: false,
      processConditionalComments: false,
      removeAttributeQuotes: true,
      removeComments: true,
      removeEmptyAttributes: true,
      removeEmptyElements: false,
      removeOptionalTags: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      removeTagWhitespace: false,
      sortAttributes: true,
      sortClassName: true,
      trimCustomFragments: true,
      useShortDoctype: true
    });
  }

  // Write the processed HTML file
  await fs.writeFile(path.join(paths.dist, 'index.html'), htmlContent);
  return Promise.resolve();
}

// Template processing (only for development builds)
function templates() {
  if (isProduction) {
    // In production, templates are bundled into the HTML file
    return Promise.resolve();
  }
  
  return gulp.src(paths.src.html.templates)
    .pipe(gulp.dest(`${paths.dist}/templates`));
}

// Language files processing
function languages() {
  return gulp.src(paths.src.lang)
    .pipe(gulpif(isProduction, jsonMinify()))
    .pipe(gulp.dest(`${paths.dist}/lang`));
}

// Copy assets (SVGs are bundled in production)
function assets() {
  if (isProduction) {
    // In production, SVGs are bundled into the HTML file, so only copy other assets
    return gulp.src(paths.src.assets, { base: '.' })
      .pipe(gulp.dest(paths.dist));
  }
  
  return gulp.src([...paths.src.assets, paths.src.svg], { base: '.' })
    .pipe(gulp.dest(paths.dist));
}

// Watch task
function watch() {
  gulp.watch(paths.src.js.all, scripts);
  gulp.watch(paths.src.css, styles);
  gulp.watch([paths.src.html.main, paths.src.html.templates], gulp.series(html, templates));
  gulp.watch(paths.src.lang, languages);
  gulp.watch([...paths.src.assets, paths.src.svg], assets);
}

// Development task
function dev() {
  console.log('🚀 Development mode - watching files for changes...');
  return watch();
}

// Build task
const build = gulp.series(
  clean,
  gulp.parallel(scripts, styles),
  bundleAssets,
  gulp.parallel(html, templates, languages, assets)
);

// Export tasks
export { clean, scripts, styles, bundleAssets, html, templates, languages, assets, watch, dev, build };
export default build;