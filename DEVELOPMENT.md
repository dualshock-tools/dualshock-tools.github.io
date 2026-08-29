# Development Guide

## Requirements

- **Node.js v20 or higher** (v26 recommended). The build toolchain (Gulp 5, Rollup 4, yargs-parser) requires Node 20+; older versions fail with a WASM allocation crash or a `yargs-parser` version error. With [nvm](https://github.com/nvm-sh/nvm), run `nvm install && nvm use` to pick up the pinned version from `.nvmrc`.

## Quick Start

```bash
# Use the pinned Node version (requires nvm)
nvm install && nvm use

# Install dependencies
npm install

# Start development with auto-reload
npm run dev:full
```

Open `http://localhost:8080` in your browser (Chrome or Edge). WebHID works over HTTP on `localhost`. To reach the app from another device, use `npm run serve:https` and open `https://localhost:8443` (accept the self-signed certificate warning).

## Available Scripts

| Script                | Description                                               |
| --------------------- | --------------------------------------------------------- |
| `npm run build`       | Build for development (with source maps)                  |
| `npm run build:prod`  | Build for production (minified, optimized)                |
| `npm run clean`       | Clean the dist directory                                  |
| `npm run serve`       | Serve built app over HTTP at `localhost:8080` (WebHID works on localhost)   |
| `npm run serve:https` | Serve built app over HTTPS at `localhost:8443` (needed for other devices)   |
| `npm run start`       | Build and serve over HTTP at `localhost:8080`             |
| `npm run dev:full`    | **Recommended**: Build, watch, and serve with auto-reload |
| `npm run watch`       | Watch files and rebuild on changes                        |

## Development Workflow

### For Active Development

```bash
npm run dev:full
```

This starts the complete development environment:

- Builds the application
- Watches for file changes
- Serves over HTTP at `http://localhost:8080`
- Automatically rebuilds when you save files

### For Testing Built Version

```bash
npm run start
```

This builds once and serves the result.

### Docker

To build and run without installing Node:

```bash
docker compose up --build
```

Then open `http://localhost:8080`. The container builds the production bundle and serves it over HTTP; WebHID still works because the browser sees `localhost`, which is a secure context. (Docker on Windows/macOS is fine here — the controller talks to the browser, not the container.)

## Important Notes

### WebHID & HTTPS

The WebHID API requires a secure context. `localhost` counts as secure, so the default HTTP server (`http://localhost:8080`) works for local development without any certificates. HTTPS is only needed to reach the app from another device on your network — `npm run serve:https` serves over `https://localhost:8443` using self-signed certificates located at:

- `server.crt` - SSL certificate
- `server.key` - SSL private key

### Browser Compatibility

- **Chrome/Edge**: Full WebHID support ✅
- **Firefox**: No WebHID support ❌
- **Safari**: No WebHID support ❌

### SSL Certificate Warning

When first accessing `https://localhost:8443`, your browser will show a security warning because we're using a self-signed certificate. This is normal for development - click "Advanced" and "Proceed to localhost" to continue.

## File Structure

```
├── js/                 # Source JavaScript files
│   ├── core.js        # Main application entry point
│   ├── controllers/   # Controller-specific classes
│   └── modals/        # Modal dialog handlers
├── css/               # Source CSS files
├── templates/         # HTML template files
├── lang/              # Translation JSON files
├── assets/            # SVG assets
├── dist/              # Built application (auto-generated)
└── dev-server.js      # Custom development server
```

## Build Process

The build system uses Gulp with the following steps:

1. **JavaScript**: Bundled with Rollup, supports ES modules
2. **CSS**: Concatenated and optionally minified
3. **HTML**: Processed and optionally minified
4. **Assets**: Copied to dist, SVGs can be inlined in production
5. **Languages**: JSON files copied and optionally minified

### Development vs Production

| Feature        | Development | Production |
| -------------- | ----------- | ---------- |
| Source maps    | ✅          | ❌         |
| Minification   | ❌          | ✅         |
| Asset inlining | ❌          | ✅         |
| File hashing   | ❌          | ✅         |

## Troubleshooting

### Port Already in Use

If port 8443 is busy:

```bash
PORT=8444 npm run serve:https
```

### Build Errors

Clean and rebuild:

```bash
npm run clean
npm run build
```

### SSL Certificate Issues

The certificates are pre-generated. If you need new ones:

```bash
openssl req -x509 -newkey rsa:4096 -keyout server.key -out server.crt -days 365 -nodes -subj "/CN=localhost"
```

### WebHID Not Working

1. Use Chrome or Edge browser (Firefox and Safari don't support WebHID)
2. Open the app via `localhost` (a secure context) — `http://localhost:8080` is fine
3. When accessing from another device, use `npm run serve:https` and accept the SSL certificate warning
4. Check browser console for errors
