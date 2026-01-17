# DualShock Calibration GUI

A web-based calibration tool for PlayStation DualShock 4, DualSense, and DualSense Edge controllers using the WebHID API.

## Features

- Controller connection via WebHID API
- Stick calibration and range calibration
- Input testing and visualization
- Battery status display
- Multi-language support (20+ languages)
- Progressive Web App capabilities

## Development

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Modern browser with WebHID support (Chrome/Edge)

### Getting Started

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Build the application:**

   ```bash
   npm run build
   ```

3. **Start the development server:**

   ```bash
   npm run start
   ```

   The app will be available at `https://localhost:8443`

### Development Scripts

- `npm run build` - Build the application for development
- `npm run build:prod` - Build the application for production
- `npm run clean` - Clean the dist directory
- `npm run serve:https` - Serve the built app over HTTPS (required for WebHID)
- `npm run serve` - Serve the built app over HTTP (WebHID won't work)
- `npm run start` - Build and serve the app
- `npm run dev:full` - Build, watch for changes, and serve with auto-reload
- `npm run watch` - Watch for file changes and rebuild

### Development Workflow

For active development with auto-rebuild:

```bash
npm run dev:full
```

This will:

1. Build the application
2. Start watching for file changes
3. Serve the app over HTTPS at `https://localhost:8443`
4. Automatically rebuild when files change

### Important Notes

- **HTTPS Required**: The WebHID API requires HTTPS. The development server uses self-signed certificates.
- **Browser Security**: You may need to accept the self-signed certificate warning in your browser.
- **Controller Support**: Only works in browsers with WebHID support (Chrome, Edge, Opera).

### Project Structure

- `js/` - Source JavaScript files
- `css/` - Source CSS files
- `templates/` - HTML template files
- `lang/` - Translation files
- `assets/` - SVG assets
- `dist/` - Built application (generated)

### Build System

The project uses Gulp for building:

- JavaScript bundling with Rollup
- CSS concatenation and minification
- HTML processing and minification
- Asset optimization
- Development vs production builds
