'use strict';

import { sleep, la } from '../utils.js';
import { l } from '../translations.js';

/**
 * Calibration Center Modal Class
 * Handles step-by-step manual stick center calibration
 */
export class CalibCenterModal {
  constructor(controllerInstance, doneCallback = null) {
    this.controller = controllerInstance;
    this.doneCallback = doneCallback;

    this._initEventListeners();

    // Hide the spinner in case it's showing after prior failure
    $("#calibNext").prop("disabled", false);
    $("#btnSpinner").hide();
  }

  /**
   * Initialize event listeners for the calibration modal
   */
  _initEventListeners() {
    $('#calibCenterModal').on('hidden.bs.modal', () => {
      console.log("Closing calibration modal");
      destroyCurrentInstance();
    });
  }

  /**
   * Set progress bar width
   * @param {number} i - Progress percentage (0-100)
   */
  setProgress(i) {
    $("#calib-center-progress").css('width', '' + i + '%')
  }

  /**
   * Remove event listeners
   */
  removeEventListeners() {
    $('#calibCenterModal').off('hidden.bs.modal');
  }

  /**
   * Open the calibration modal
   */
  async open() {
    la("calib_open");
    this.calibrationGenerator = this.calibrationSteps();
    await this.next();
    new bootstrap.Modal(document.getElementById('calibCenterModal'), {}).show();
  }

  /**
   * Proceed to the next calibration step (legacy method)
   */
  async next() {
    la("calib_next");
    const result = await this.calibrationGenerator.next();
    if (result.done) {
      this.calibrationGenerator = null;
    }
  }

  /**
   * Generator function for calibration steps
   */
  async* calibrationSteps() {
    // Step 1: Initial setup
    la("calib_step", {"i": 1});
    this._updateUI(1, "Stick center calibration", "Start", true);
    yield 1;

    // Step 2: Initialize calibration
    la("calib_step", {"i": 2});
    this._showSpinner("Initializing...");
    await sleep(100);
    await this._multiCalibSticksBegin();
    await this._hideSpinner();

    this._updateUI(2, "Calibration in progress", "Continue", false);
    yield 2;

    // Steps 3-5: Sample calibration data
    for (let sampleStep = 3; sampleStep <= 5; sampleStep++) {
      la("calib_step", {"i": sampleStep});
      this._showSpinner("Sampling...");
      await sleep(150);
      await this._multiCalibSticksSample();
      await this._hideSpinner();

      this._updateUI(sampleStep, "Calibration in progress", "Continue", false);
      yield sampleStep;
    }

    // Step 6: Final sampling and storage
    la("calib_step", {"i": 6});
    this._showSpinner("Sampling...");
    await this._multiCalibSticksSample();
    await sleep(200);
    $("#calibNextText").text(l("Storing calibration..."));
    await sleep(500);
    await this._multiCalibSticksEnd();
    await this._hideSpinner();

    this._updateUI(6, "Stick center calibration", "Done", true);
    yield 6;

    this._close(true, l("Stick calibration completed"));
  }

  /**
   * "Old" fully automatic stick center calibration
   */
  async multiCalibrateSticks() {
    if(!this.controller.isConnected())
      return;

    this.setProgress(0);
    new bootstrap.Modal(document.getElementById('autoCalibCenterModal'), {}).show();

    await sleep(1000);

    // Use the controller manager's calibrateSticks method with UI progress updates
    this.setProgress(10);

    const result = await this.controller.calibrateSticks((progress) => {
      this.setProgress(progress);
    });

    await sleep(500);
    this._close(true, result?.message);
  }

  /**
   * Helper functions for step-by-step manual calibration UI
   */
  async _multiCalibSticksBegin() {
    await this.controller.calibrateSticksBegin();
  }

  async _multiCalibSticksEnd() {
    await this.controller.calibrateSticksEnd();
  }

  async _multiCalibSticksSample() {
    await this.controller.calibrateSticksSample();
  }

  /**
   * Close the calibration modal
   */
  _close(success = false, message = null) {
    // Call the done callback if provided
    if (this.doneCallback && typeof this.doneCallback === 'function') {
      this.doneCallback(success, message);
    }

    $(".modal.show").modal("hide");
  }

  /**
   * Update the UI for a specific calibration step
   */
  _updateUI(step, title, buttonText, allowDismiss) {
    // Hide all step lists and remove active class
    for (let j = 1; j < 7; j++) {
      $("#list-" + j).hide();
      $("#list-" + j + "-calib").removeClass("active");
    }

    // Show current step and mark as active
    $("#list-" + step).show();
    $("#list-" + step + "-calib").addClass("active");

    // Update title and button text
    $("#calibTitle").text(l(title));
    $("#calibNextText").text(l(buttonText));

    // Show/hide cross icon
    if (allowDismiss) {
      $("#calibCross").show();
    } else {
      $("#calibCross").hide();
    }

    // Show/hide Quick calibrate button - only show on step 1 (welcome screen)
    $("#quickCalibBtn").toggle(step === 1);
  }

  /**
   * Show spinner and disable button
   */
  _showSpinner(text) {
    $("#calibNextText").text(l(text));
    $("#btnSpinner").show();
    $("#calibNext").prop("disabled", true);
  }

  /**
   * Hide spinner and enable button
   */
  async _hideSpinner() {
    await sleep(200);
    $("#calibNext").prop("disabled", false);
    $("#btnSpinner").hide();
  }
}

// Global reference to the current calibration instance
let currentCalibCenterInstance = null;

/**
 * Helper function to safely clear the current calibration instance
 */
function destroyCurrentInstance() {
  if (currentCalibCenterInstance) {
    console.log("Destroying current calibration instance");
    currentCalibCenterInstance.removeEventListeners();
    currentCalibCenterInstance = null;
  }
}

// Legacy function exports for backward compatibility
export async function calibrate_stick_centers(controller, doneCallback = null) {
  currentCalibCenterInstance = new CalibCenterModal(controller, doneCallback);
  await currentCalibCenterInstance.open();
}

async function calib_next() {
  if (currentCalibCenterInstance) {
    await currentCalibCenterInstance.next();
  }
}

// Function to close current manual calibration and start auto calibration instead
async function quick_calibrate_instead() {
  if (currentCalibCenterInstance) {
    // Get the callback from the current instance before closing
    const doneCallback = currentCalibCenterInstance.doneCallback;

    // Close the current manual calibration modal (without calling callback)
    currentCalibCenterInstance.doneCallback = null; // Temporarily remove callback to avoid double-calling
    currentCalibCenterInstance._close();

    // Get the controller from the current instance
    const { controller } = currentCalibCenterInstance;

    // Destroy the current instance
    destroyCurrentInstance();

    // Start auto calibration with the original callback
    await auto_calibrate_stick_centers(controller, {}, doneCallback);
  }
}

// "Old" fully automatic stick center calibration
export async function auto_calibrate_stick_centers(controller, doneCallback = null) {
  currentCalibCenterInstance = new CalibCenterModal(controller, doneCallback);
  await currentCalibCenterInstance.multiCalibrateSticks();
}

// Legacy compatibility - expose functions to window for HTML onclick handlers
window.calib_next = calib_next;
window.quick_calibrate_instead = quick_calibrate_instead;
