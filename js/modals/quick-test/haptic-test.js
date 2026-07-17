'use strict';

import { l } from '../../translations.js';

/**
 * Haptic vibration test: fires the heavy motor, then the light one
 */
export class HapticTest {
  static id = 'haptic';
  static testName = 'Haptic Vibration';
  static icon = 'fas fa-mobile-alt';

  constructor(host) {
    this.host = host;
  }

  content() {
    const instructions = l('Instructions');
    const pass = l('Pass');
    const fail = l('Fail');
    const hapticTestDesc = l("This test will activate the controller's vibration motors, first the heavy one, and then the light one.");
    const hapticInstructions = l('Feel for vibration in the controller.');
    const hapticRepeat = l('Repeat');
    return `
      <p>${hapticTestDesc}</p>
      <p><strong>${instructions}:</strong> ${hapticInstructions}</p>
      <div class="d-flex gap-2 mt-3">
        <button type="button" class="btn btn-success" id="haptic-pass-btn" onclick="markTestResult('haptic', true)">
          <i class="fas fa-check me-1"></i><span>${pass}</span>
        </button>
        <button type="button" class="btn btn-danger" id="haptic-fail-btn" onclick="markTestResult('haptic', false)">
          <i class="fas fa-times me-1"></i><span>${fail}</span>
        </button>
        <button type="button" class="btn btn-outline-primary" id="haptic-replay-btn" onclick="quickTestAction('haptic', 'start')">
          <i class="fas fa-redo me-1"></i><span>${hapticRepeat}</span>
        </button>
      </div>
    `;
  }

  async start() {
    this.host.startIconAnimation('haptic');
    await this.host.controller.setVibration({ heavyLeft: 255, lightRight: 0, duration: 500 }, async () => {
      await setTimeout(async () => {
        await this.host.controller.setVibration({ heavyLeft: 0, lightRight: 255, duration: 500 });
      }, 500);
    });
    setTimeout(() => { this.host.stopIconAnimation('haptic'); }, 1500);
  }
}
