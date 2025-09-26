'use strict';

import { sleep } from '../utils.js';

/**
 * Calibrate Stick Range Modal Class
 * Handles stick range calibration
 */
export class CalibRangeModal {
  constructor(controllerInstance, doneCallback = null) {
    this.controller = controllerInstance;
    this.doneCallback = doneCallback;
  }

  async open() {
    if(!this.controller.isConnected())
      return;

    bootstrap.Modal.getOrCreateInstance('#rangeModal').show();

    await sleep(1000);
    await this.controller.calibrateRangeBegin();
  }

  async onClose() {
    bootstrap.Modal.getOrCreateInstance('#rangeModal').hide();

    const result = await this.controller.calibrateRangeOnClose();

    // Call the done callback if provided (range calibration is always successful when onClose is called)
    if (this.doneCallback && typeof this.doneCallback === 'function') {
      this.doneCallback(true, result?.message);
    }
  }
}

// Global reference to the current range calibration instance
let currentCalibRangeInstance = null;

/**
 * Helper function to safely clear the current calibration instance
 */
function destroyCurrentInstance() {
  currentCalibRangeInstance = null;
}

// Legacy function exports for backward compatibility
export async function calibrate_range(controller, doneCallback = null) {
  destroyCurrentInstance(); // Clean up any existing instance
  currentCalibRangeInstance = new CalibRangeModal(controller, doneCallback);
  await currentCalibRangeInstance.open();
}

async function calibrate_range_on_close() {
  if (currentCalibRangeInstance) {
    await currentCalibRangeInstance.onClose();
  }
}

// Legacy compatibility - expose functions to window for HTML onclick handlers
window.calibrate_range_on_close = calibrate_range_on_close;