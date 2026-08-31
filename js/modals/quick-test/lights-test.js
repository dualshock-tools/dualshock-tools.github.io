'use strict';

import { l } from '../../translations.js';

/**
 * Lights test: cycles lightbar colors, animates the player indicator
 * lights and pulses the mute LED
 */
export class LightsTest {
  static id = 'lights';
  static testName = 'Lights';
  static icon = 'fas fa-lightbulb';

  constructor(host) {
    this.host = host;
    this.animationInterval = null;
    this.active = false;
  }

  content() {
    const instructions = l('Instructions');
    const pass = l('Pass');
    const fail = l('Fail');
    const lightsTestDesc = l('This test will cycle through red, green, and blue colors on the controller lightbar, animate the player indicator lights, and flash the mute button.');
    const lightsInstructions = l('Watch the controller lights change colors, the player lights animate, and the mute button flash.');
    return `
      <p>${lightsTestDesc}</p>
      <p><strong>${instructions}:</strong> ${lightsInstructions}</p>
      <div class="d-flex gap-2 mt-3">
        <button type="button" class="btn btn-success" id="lights-pass-btn" onclick="markTestResult('lights', true)">
          <i class="fas fa-check me-1"></i><span>${pass}</span>
        </button>
        <button type="button" class="btn btn-danger" id="lights-fail-btn" onclick="markTestResult('lights', false)">
          <i class="fas fa-times me-1"></i><span>${fail}</span>
        </button>
      </div>
    `;
  }

  async start() {
    this.host.startIconAnimation('lights');
    this.active = true;
    const { currentController } = this.host.controller;

    if (!currentController?.setLightbarColor || !currentController?.setPlayerIndicator) {
      console.warn('Controller does not support light control');
      alert('This controller does not support light control. Only DualSense (DS5) controllers support this feature.');
      this.host.stopIconAnimation('lights');
      return;
    }

    const colors = [
      { r: 255, g: 0, b: 0 },   // Red
      { r: 0, g: 255, b: 0 },   // Green
      { r: 0, g: 0, b: 255 },   // Blue
    ];

    const playerPatterns = [
      0b10001,  // Light 1 & 5
      0b01010,  // Light 2 & 4
      0b00100,  // Light 3
      0b01010,  // Light 4 & 2
      0b10001,  // Light 5 & 1
      0b11111,  // All lights
      0b00000,  // No lights
      0b11111,  // All lights
      0b00000,  // No lights
    ];

    let colorIndex = 0;
    let patternIndex = 0;

    // Set mute LED - cycle through off, solid, pulsing
    if (currentController.setMuteLed) {
      await currentController.setMuteLed(2); // pulsing
    }

    // Start the animation
    this.animationInterval = setInterval(async () => {
      try {
        const color = colors[colorIndex];
        const pattern = playerPatterns[patternIndex];

        // Set lightbar color and player indicator
        await currentController.setLightbarColor(color.r, color.g, color.b);
        await currentController.setPlayerIndicator(pattern);

        // Cycle through colors every 3 pattern changes
        patternIndex = (patternIndex + 1) % playerPatterns.length;
        if (patternIndex === 0) {
          colorIndex = (colorIndex + 1) % colors.length;
        }
      } catch (error) {
        console.error('Error during lights test:', error);
      }
    }, 200);
  }

  async stop() {
    this.host.stopIconAnimation('lights');

    // Clear the animation interval
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }

    // Only touch the hardware if the light show actually ran
    if (!this.active) return;
    this.active = false;
    await this.host.controller.currentController?.resetLights();
  }
}
