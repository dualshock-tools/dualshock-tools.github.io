'use strict';

import { sleep, la } from '../utils.js';
import { l } from '../translations.js';

/**
 * Calibration Center Modal Class
 * Handles step-by-step manual stick center calibration
 */
export class CalibCenterModal {
  constructor(controllerInstance, { resetStickDiagrams, successAlert, set_progress }) {
    this.controller = controllerInstance;
    this.resetStickDiagrams = resetStickDiagrams;
    this.successAlert = successAlert;
    this.set_progress = set_progress;

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

    this._close();
  }

  /**
   * "Old" fully automatic stick center calibration
   */
  async multiCalibrateSticks() {
    if(!this.controller.isConnected())
      return;

    this.set_progress(0);
    new bootstrap.Modal(document.getElementById('calibrateModal'), {}).show();

    await sleep(1000);

    // Use the controller manager's calibrateSticks method with UI progress updates
    this.set_progress(10);

    const result = await this.controller.calibrateSticks((progress) => {
      this.set_progress(progress);
    });

    await sleep(500);
    this._close();
    this.resetStickDiagrams();

    if (result?.message) {
      this.successAlert(result.message);
    }
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
  _close() {
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
export async function calibrate_stick_centers(controller, dependencies) {
  currentCalibCenterInstance = new CalibCenterModal(controller, dependencies);
  await currentCalibCenterInstance.open();
}

async function calib_next() {
  if (currentCalibCenterInstance) {
    await currentCalibCenterInstance.next();
  }
}

// "Old" fully automatic stick center calibration
export async function auto_calibrate_stick_centers(controller, dependencies) {
  currentCalibCenterInstance = new CalibCenterModal(controller, dependencies);
  await currentCalibCenterInstance.multiCalibrateSticks();
}

// Legacy compatibility - expose functions to window for HTML onclick handlers
window.calib_next = calib_next;
