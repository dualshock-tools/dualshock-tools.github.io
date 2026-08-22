'use strict';

import { l } from '../../translations.js';

/**
 * Speaker test: plays a tone through the controller's built-in speaker
 */
export class SpeakerTest {
  static id = 'speaker';
  static testName = 'Speaker';
  static icon = 'fas fa-volume-up';

  constructor(host) {
    this.host = host;
  }

  content() {
    const instructions = l('Instructions');
    const pass = l('Pass');
    const fail = l('Fail');
    const speakerTestDesc = l("This test will play a tone through the controller's built-in speaker.");
    const speakerInstructions = l('Listen for a tone from the controller speaker.');
    const repeat = l('Repeat');
    return `
      <p>${speakerTestDesc}</p>
      <p><strong>${instructions}:</strong> ${speakerInstructions}</p>
      <div class="d-flex gap-2 mt-3">
        <button type="button" class="btn btn-success" id="speaker-pass-btn" onclick="markTestResult('speaker', true)">
          <i class="fas fa-check me-1"></i><span>${pass}</span>
        </button>
        <button type="button" class="btn btn-danger" id="speaker-fail-btn" onclick="markTestResult('speaker', false)">
          <i class="fas fa-times me-1"></i><span>${fail}</span>
        </button>
        <button type="button" class="btn btn-outline-primary" id="speaker-replay-btn" onclick="quickTestAction('speaker', 'start')">
          <i class="fas fa-redo me-1"></i><span>${repeat}</span>
        </button>
      </div>
    `;
  }

  async start() {
    this.host.startIconAnimation('speaker');
    await this.host.controller.setSpeakerTone(300);
    setTimeout(() => { this.host.stopIconAnimation('speaker'); }, 1000);
  }
}
