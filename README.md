# Controller Calibration GUI

A web-based controller diagnostics and calibration tool. PlayStation DualShock 4,
DualSense, and DualSense Edge controllers use WebHID for testing and device
calibration. Xbox controllers use the standard Gamepad API for live diagnostics
of sticks, triggers, D-pad, and buttons.

The browser Gamepad API does not expose Xbox firmware calibration commands.
Permanent Xbox thumbstick and trigger calibration is therefore completed in
Microsoft's official Xbox Accessories app after diagnosing the controller here.

## Features

- PlayStation connection via WebHID
- Xbox Wireless Controller and Elite Series 2 detection via the Gamepad API
- Stick calibration and range calibration
- Live stick, trigger, D-pad, and button testing and visualization
- Xbox circularity and center diagnostics
- Haptic vibration testing for supported PlayStation controllers
- Battery status display
- Multi-language support (20+ languages)
- Progressive Web App capabilities

## Development

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Modern browser with WebHID and Gamepad API support (Chrome/Edge recommended)

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

- **HTTPS Required**: WebHID and some browser controller features require a secure context. The development server uses self-signed certificates.
- **Browser Security**: You may need to accept the self-signed certificate warning in your browser.
- **Xbox calibration**: Browser diagnostics are supported, but permanent
  calibration is intentionally handed off to the Xbox Accessories app because
  the Gamepad API does not expose firmware calibration writes. Xbox vibration
  testing is omitted because wired rumble is not reliable across browsers and
  operating systems.
- **Controller Support**: PlayStation calibration requires WebHID. Xbox testing
  requires the Gamepad API and a controller exposed as Xbox/XInput by the browser.

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
