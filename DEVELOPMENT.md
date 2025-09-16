# Development Guide

## Quick Start

```bash
# Install dependencies
npm install

# Start development with auto-reload
npm run dev:full
```

Open `https://localhost:8443` in your browser (accept the SSL certificate warning).

## Available Scripts

| Script                | Description                                               |
| --------------------- | --------------------------------------------------------- |
| `npm run build`       | Build for development (with source maps)                  |
| `npm run build:prod`  | Build for production (minified, optimized)                |
| `npm run clean`       | Clean the dist directory                                  |
| `npm run serve:https` | Serve built app over HTTPS (required for WebHID)          |
| `npm run serve`       | Serve built app over HTTP (WebHID won't work)             |
| `npm run start`       | Build and serve over HTTPS                                |
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
- Serves over HTTPS at `https://localhost:8443`
- Automatically rebuilds when you save files

### For Testing Built Version

```bash
npm run start
```

This builds once and serves the result.

## Important Notes

### HTTPS Requirement

The WebHID API requires HTTPS. The development server uses self-signed certificates located at:

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

1. Make sure you're using HTTPS (`npm run serve:https`)
2. Use Chrome or Edge browser
3. Accept the SSL certificate warning
4. Check browser console for errors
