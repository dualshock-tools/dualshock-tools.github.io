---
description: Repository Information Overview
alwaysApply: true
---

# DualShock Calibration GUI Information

## Summary

A web-based calibration tool for PlayStation DualShock 4, DualSense, and DualSense Edge controllers. The application uses WebHID API to connect to controllers and provides a user interface for calibration and testing of controller inputs.

## Structure

- **root**: Main JavaScript files and HTML interface
- **lang/**: Contains JSON files for multiple language translations
- **scripts/**: Utility scripts for development (e.g., language file processing)

## Language & Runtime

**Language**: JavaScript (Frontend), Python (Utilities)
**JavaScript Version**: ECMAScript 2021
**Build System**: None (Static web application)
**Package Manager**: None (CDN dependencies)

## Dependencies

**Main Dependencies**:

- Bootstrap 5.3.3 (UI framework)
- jQuery 3.7.1 (DOM manipulation)
- FontAwesome 6.6.0 (Icons)

## Web Application

**Entry Point**: index.html
**Main Scripts**:

- core.js: Core application logic and initialization
- device.js: Controller device interaction via WebHID API

## Internationalization

**Framework**: Custom implementation
**Language Files**: JSON format in lang/ directory
**Available Languages**: 20+ languages including Arabic, Bulgarian, Czech, Danish, German, Spanish, French, etc.
**Processing Tool**: scripts/process_lang.py (Python utility for managing language files)

## Web Features

**Progressive Web App**: Configured with site.webmanifest
**Icons**: Various sizes for different platforms (favicon, apple-touch-icon, web-app-manifest)
**Browser Compatibility**: Requires WebHID support (primarily Chrome-based browsers)

## Controller Support

**Supported Devices**:

- DualShock 4
- DualSense
- DualSense Edge

**Features**:

- Controller connection via WebHID
- Stick calibration
- Input testing
- Battery status display

## Development

**Linting**: ESLint with custom configuration (eslint.config.mjs)
**Code Standards**:

- ECMAScript 2021
- Strict mode ('use strict')
- Preference for const/let over var
