#!/bin/bash

# DualShock Calibration GUI - Development Setup Script

echo "🎮 DualShock Calibration GUI - Development Setup"
echo "================================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    echo "💡 Please install Node.js (v16 or higher) from https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1)

if [ "$MAJOR_VERSION" -lt 16 ]; then
    echo "❌ Node.js version $NODE_VERSION is too old"
    echo "💡 Please upgrade to Node.js v16 or higher"
    exit 1
fi

echo "✅ Node.js version: $NODE_VERSION"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed"
    echo "💡 npm should come with Node.js installation"
    exit 1
fi

echo "✅ npm version: $(npm -v)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
if npm install; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo ""

# Build the application
echo "🔨 Building application..."
if npm run build; then
    echo "✅ Application built successfully"
else
    echo "❌ Failed to build application"
    exit 1
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "🚀 To start development:"
echo "   npm run dev:full"
echo ""
echo "📱 The app will be available at:"
echo "   https://localhost:8443"
echo ""
echo "💡 You may need to accept the SSL certificate warning in your browser"
echo "💡 Use Chrome or Edge for full WebHID support"
echo ""
echo "📚 For more information, see:"
echo "   - README.md"
echo "   - DEVELOPMENT.md"