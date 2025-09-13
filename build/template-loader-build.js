'use strict';

// This is a build-time compatible version of template-loader.js
// It will be replaced during the build process

// Cache for loaded templates
const templateCache = new Map();

/**
* Load a template - this version tries bundled templates first, then falls back to fetch
* @param {string} templateName - Name of the template file without extension
* @returns {Promise<string>} - Promise that resolves with the template HTML
*/
async function loadTemplate(templateName) {
  // Check if template is already in cache
  if (templateCache.has(templateName)) {
    return templateCache.get(templateName);
  }

  try {
    // Try to load from bundled templates first (production build)
    if (typeof window !== 'undefined' && window.TEMPLATES && window.TEMPLATES[templateName]) {
      const templateHtml = window.TEMPLATES[templateName];
      templateCache.set(templateName, templateHtml);
      return templateHtml;
    }

    // Fallback to fetch (development mode)
    const hasExtension = templateName.includes('.');
    const templatePath = hasExtension ? `templates/${templateName}` : `templates/${templateName}.html`;

    const response = await fetch(templatePath);
    if (!response.ok) {
      throw new Error(`Failed to load template: ${templateName}`);
    }

    const templateHtml = await response.text();
    templateCache.set(templateName, templateHtml);
    return templateHtml;
  } catch (error) {
    console.error(`Error loading template ${templateName}:`, error);
    return '';
  }
}

/**
* Load SVG assets - handles both bundled and fetch modes
*/
async function loadSVGAssets() {
  try {
    // Try bundled assets first
    if (typeof window !== 'undefined' && window.ASSETS && window.ASSETS['icons.svg']) {
      return window.ASSETS['icons.svg'];
    }

    // Fallback to fetch
    const response = await fetch('assets/icons.svg');
    if (!response.ok) {
      throw new Error('Failed to load SVG icons');
    }
    return await response.text();
  } catch (error) {
    console.error('Error loading SVG assets:', error);
    return '';
  }
}

/**
* Load all templates and insert them into the DOM
*/
export async function loadAllTemplates() {
  try {
    // Load SVG icons
    const iconsHtml = await loadSVGAssets();
    if (iconsHtml) {
      const iconsContainer = document.createElement('div');
      iconsContainer.innerHTML = iconsHtml;
      document.body.prepend(iconsContainer);
    }

    // Load modals
    const modalTemplates = [
      'faq-modal',
      'popup-modal',
      'finetune-modal',
      'calib-center-modal',
      'welcome-modal',
      'calibrate-modal',
      'range-modal',
      'edge-progress-modal',
      'edge-modal',
      'donate-modal'
    ];

    const modalHtmlPromises = modalTemplates.map(template => loadTemplate(template));
    const modalHtmls = await Promise.all(modalHtmlPromises);

    // Create modals container
    const modalsContainer = document.createElement('div');
    modalsContainer.id = 'modals-container';
    modalsContainer.innerHTML = modalHtmls.join('');
    document.body.appendChild(modalsContainer);

    console.log('All templates loaded successfully');
  } catch (error) {
    console.error('Error loading templates:', error);
  }
}