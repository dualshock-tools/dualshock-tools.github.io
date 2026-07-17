'use strict';

import { l } from '../../translations.js';

/**
 * Adaptive trigger test: enables heavy resistance on L2/R2 for the user to feel
 */
export class AdaptiveTest {
  static id = 'adaptive';
  static testName = 'Adaptive Trigger';
  static icon = 'fas fa-hand-pointer';

  constructor(host) {
    this.host = host;
    this.active = false;
  }

  content() {
    const instructions = l('Instructions');
    const pass = l('Pass');
    const fail = l('Fail');
    const adaptiveTestDesc = l('This test will enable heavy resistance on both L2 and R2 triggers.');
    const adaptiveInstructions = l('Press L2 and R2 triggers to feel the trigger resistance.');
    return `
      <p>${adaptiveTestDesc}</p>
      <p><strong>${instructions}:</strong> ${adaptiveInstructions}</p>
      <div class="d-flex gap-2 mt-3">
        <button type="button" class="btn btn-success" id="adaptive-pass-btn" onclick="markTestResult('adaptive', true)">
          <i class="fas fa-check me-1"></i><span>${pass}</span>
        </button>
        <button type="button" class="btn btn-danger" id="adaptive-fail-btn" onclick="markTestResult('adaptive', false)">
          <i class="fas fa-times me-1"></i><span>${fail}</span>
        </button>
      </div>
    `;
  }

  async start() {
    this.host.startIconAnimation('adaptive');
    this.active = true;
    await this.host.controller.setAdaptiveTriggerPreset({ left: 'heavy', right: 'heavy' });
  }

  async stop() {
    this.host.stopIconAnimation('adaptive');
    // Only touch the hardware if the resistance was actually enabled
    if (!this.active) return;
    this.active = false;
    await this.host.controller.setAdaptiveTriggerPreset({ left: 'off', right: 'off' });
  }
}
