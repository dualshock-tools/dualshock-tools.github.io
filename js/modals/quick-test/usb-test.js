'use strict';

import { l } from '../../translations.js';

/**
 * USB connector test: fully manual - wiggle the cable, watch for disconnects
 */
export class UsbTest {
  static id = 'usb';
  static testName = 'USB Connector';
  static icon = 'fas fa-plug';

  constructor(host) {
    this.host = host;
  }

  content() {
    const instructions = l('Instructions');
    const pass = l('Pass');
    const fail = l('Fail');
    const usbTestDesc = l('This test checks the reliability of the USB port.');
    const wiggleTheCable = l('Wiggle the USB cable to see if the controller disconnects.');
    const beGentle = l('Be gentle to avoid damage.');
    return `
      <p>${usbTestDesc}</p>
      <p><strong>${instructions}:</strong> ${wiggleTheCable}</p>
      <div class="alert alert-warning mb-3">
        <i class="fas fa-exclamation-triangle me-2"></i>
        <span>${beGentle}</span>
      </div>
      <div class="d-flex gap-2 mt-3">
        <button type="button" class="btn btn-success" id="usb-pass-btn" onclick="markTestResult('usb', true)">
          <i class="fas fa-check me-1"></i><span>${pass}</span>
        </button>
        <button type="button" class="btn btn-danger" id="usb-fail-btn" onclick="markTestResult('usb', false)">
          <i class="fas fa-times me-1"></i><span>${fail}</span>
        </button>
      </div>
    `;
  }
}
