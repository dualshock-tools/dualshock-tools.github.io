'use strict';

import { l } from '../../translations.js';

/**
 * Headphone jack test: plays a tone routed to the 3.5mm jack on demand
 */
export class HeadphoneTest {
  static id = 'headphone';
  static testName = 'Headphone Jack';
  static icon = 'fas fa-headphones';

  constructor(host) {
    this.host = host;
  }

  content() {
    const instructions = l('Instructions');
    const pass = l('Pass');
    const fail = l('Fail');
    const headphoneTestDesc = l('This test checks the headphone jack functionality.');
    const headphoneStep1 = l('Plug in headphones to the 3.5mm jack');
    const headphoneStep2 = l('Click "Test Speaker" to listen for the tone through the headphones');
    const testSpeaker = l('Test Speaker');
    return `
      <p>${headphoneTestDesc}</p>
      <p><strong>${instructions}:</strong></p>
      <ol>
        <li>${headphoneStep1}</li>
        <li>${headphoneStep2}</li>
      </ol>
      <div class="d-flex gap-2 mt-3">
        <button type="button" class="btn btn-primary" id="headphone-test-btn" onclick="quickTestAction('headphone', 'testAudio')">
          <i class="fas fa-volume-up me-1"></i><span>${testSpeaker}</span>
        </button>
        <button type="button" class="btn btn-success" id="headphone-pass-btn" onclick="markTestResult('headphone', true)">
          <i class="fas fa-check me-1"></i><span>${pass}</span>
        </button>
        <button type="button" class="btn btn-danger" id="headphone-fail-btn" onclick="markTestResult('headphone', false)">
          <i class="fas fa-times me-1"></i><span>${fail}</span>
        </button>
      </div>
    `;
  }

  /**
   * Play a test tone routed to the headphone output instead of the
   * built-in speaker
   */
  async testAudio() {
    this.host.startIconAnimation('headphone');

    try {
      await this.host.controller.setSpeakerTone(500, ({success}) => {}, "headphones");

      // Stop the animation after the tone completes
      setTimeout(() => {
        this.host.stopIconAnimation('headphone');
      }, 700); // Slightly longer than tone duration
    } catch (error) {
      console.error('Error testing headphone audio:', error);
      this.host.stopIconAnimation('headphone');
    }
  }
}
