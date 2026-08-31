# DualShock Calibration GUI

A web-based calibration tool for PlayStation DualShock 4, DualSense, and DualSense Edge controllers using the WebHID API.

The live version of this project is available at [https://dualshock-tools.github.io](https://dualshock-tools.github.io).

No installation is required: simply open the website in a WebHID-compatible browser.

## Features

- Controller connection via WebHID API
- Stick calibration and range calibration
- Input testing and visualization
- Battery status display
- Multi-language support (20+ languages)
- Progressive Web App capabilities

## Docker

A pre-built Docker image is available for running DualShock Tools without installing any dependencies.

See the [Docker guide](DOCKER.md) for installation and usage instructions.

## Contributing

Interested in contributing? Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on submitting changes and pull requests.

## Development

### Prerequisites

- Node.js v20 or higher (v26 recommended — see `.nvmrc`). Older versions (14, 16, 18) will fail the build; the toolchain requires Node 20+.
- npm or yarn
- Modern browser with WebHID support (Chrome/Edge)

If you use [nvm](https://github.com/nvm-sh/nvm), run `nvm install && nvm use` in the project root to pick up the version from `.nvmrc`.

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

   The app will be available at `http://localhost:8080`. WebHID works here because
   `localhost` is treated as a secure context.

### Docker

Alternatively, build and run without installing Node:

```bash
docker compose up --build
```

The app is then available at `http://localhost:8080`.

### Development Scripts

- `npm run build` - Build the application for development
- `npm run build:prod` - Build the application for production
- `npm run clean` - Clean the dist directory
- `npm run serve` - Serve the built app over HTTP at `http://localhost:8080` (WebHID works on localhost)
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
3. Serve the app at `http://localhost:8080`
4. Automatically rebuild when files change

### Important Notes

- **WebHID & secure contexts**: WebHID requires a secure context. `localhost` counts as secure, so the HTTP dev server (`http://localhost:8080`) works for local development. Reaching the app from another device would need HTTPS — use the production site for that.
- **Controller Support**: Only works in browsers with WebHID support (Chrome, Edge, Opera).

### Project Structure

- `js/` - Source JavaScript files
- `scss/` - Source SCSS files
- `templates/` - HTML template files
- `lang/` - Translation files
- `assets/` - SVG assets
- `dist/` - Built application (generated)

### Build System

The project uses Gulp for building:

- JavaScript bundling with Rollup
- SCSS concatenation and minification
- HTML processing and minification
- Asset optimization
- Development vs production builds
