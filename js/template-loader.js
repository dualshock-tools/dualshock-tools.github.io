'use strict';

// Cache for loaded templates
const templateCache = new Map();

/**
* Load a template from the templates directory or bundled assets
* @param {string} templateName - Name of the template file without extension
* @returns {Promise<string>} - Promise that resolves with the template HTML
*/
async function loadTemplate(templateName) {
  // Check if template is already in cache
  if (templateCache.has(templateName)) {
    return templateCache.get(templateName);
  }

  // Check if we have bundled assets (production mode)
  if (window.BUNDLED_ASSETS && window.BUNDLED_ASSETS.templates) {
    const templateHtml = window.BUNDLED_ASSETS.templates[templateName];
    if (templateHtml) {
      templateCache.set(templateName, templateHtml);
      return templateHtml;
    }
  }

  // Fallback to fetching from server (development mode)
  // Only append .html if the templateName doesn't already have an extension
  const hasExtension = templateName.includes('.');
  const templatePath = hasExtension ? `templates/${templateName}` : `templates/${templateName}.html`;

  const response = await fetch(templatePath);
  if (!response.ok) {
    throw new Error(`Failed to load template: ${templateName}`);
  }

  const templateHtml = await response.text();
  templateCache.set(templateName, templateHtml);
  return templateHtml;
}

/**
* Load SVG assets from bundled assets or server
* @param {string} assetPath - Path to the SVG asset
* @returns {Promise<string>} - Promise that resolves with the SVG content
*/
async function loadSvgAsset(assetPath) {
  // Check if we have bundled assets (production mode)
  if (window.BUNDLED_ASSETS && window.BUNDLED_ASSETS.svg) {
    const svgContent = window.BUNDLED_ASSETS.svg[assetPath];
    if (svgContent) {
      return svgContent;
    }
  }

  // Fallback to fetching from server (development mode)
  const response = await fetch(`assets/${assetPath}`);
  if (!response.ok) {
    throw new Error(`Failed to load SVG asset: ${assetPath}`);
  }

  return await response.text();
}

/**
* Load all templates and insert them into the DOM
*/
export async function loadAllTemplates() {
  // Load SVG icons
  const iconsHtml = await loadSvgAsset('icons.svg');
  const iconsContainer = document.createElement('div');
  iconsContainer.innerHTML = iconsHtml;
  document.body.prepend(iconsContainer);

  // Load modals
  const faqModalHtml = await loadTemplate('faq-modal');
  const popupModalHtml = await loadTemplate('popup-modal');
  const finetuneModalHtml = await loadTemplate('finetune-modal');
  const calibCenterModalHtml = await loadTemplate('calib-center-modal');
  const welcomeModalHtml = await loadTemplate('welcome-modal');
  const calibrateModalHtml = await loadTemplate('calibrate-modal');
  const rangeModalHtml = await loadTemplate('range-modal');
  const edgeProgressModalHtml = await loadTemplate('edge-progress-modal');
  const edgeModalHtml = await loadTemplate('edge-modal');
  const donateModalHtml = await loadTemplate('donate-modal');

  // Create modals container
  const modalsContainer = document.createElement('div');
  modalsContainer.id = 'modals-container';
  modalsContainer.innerHTML = faqModalHtml + popupModalHtml + finetuneModalHtml + calibCenterModalHtml + welcomeModalHtml + calibrateModalHtml + rangeModalHtml + edgeProgressModalHtml + edgeModalHtml + donateModalHtml;
  document.body.appendChild(modalsContainer);
}
