'use strict';

import { sleep } from '../utils.js';
import { l } from '../translations.js';
import { CIRCULARITY_DATA_SIZE } from '../stick-renderer.js';

const SECONDS_UNTIL_UNLOCK = 15;

/**
 * Calibrate Stick Range Modal Class
 * Handles stick range calibration
 */
export class CalibRangeModal {
  constructor(controllerInstance, { ll_data, rr_data }, doneCallback = null) {
    // Dependencies
    this.controller = controllerInstance;
    this.ll_data = ll_data;
    this.rr_data = rr_data;

    // Progress tracking
    this.buttonText = l("Done");
    this.leftNonZeroCount = 0;
    this.rightNonZeroCount = 0;
    this.leftFullCycles = 0;
    this.rightFullCycles = 0;
    this.requiredFullCycles = 4;
    this.progressUpdateInterval = null;

    // Countdown timer
    this.countdownSeconds = 0;
    this.countdownInterval = null;

    // Progress alert enhancement
    this.leftCycleProgress = 0;
    this.rightCycleProgress = 0;

    this.allDonePromiseResolve = undefined;
    this.doneCallback = doneCallback;
  }

  async open() {
    if(!this.controller.isConnected())
      return;

    $('#range-calibration-alert').hide();
    $('#keep-rotating-alert').removeClass('blink-text');
    $('#range-done-btn')
      .prop('disabled', true)
      .toggleClass('btn-primary', false)
      .toggleClass('btn-outline-primary', true);
    bootstrap.Modal.getOrCreateInstance('#rangeModal').show();

    this.ll_data.fill(0);
    this.rr_data.fill(0);

    this.updateProgress();  // reset progress bar
    this.startProgressMonitoring();

    this.resetAlertEnhancement();
    this.startCountdown();

    await sleep(1000);
    await this.controller.calibrateRangeBegin();
  }

  async onClose() {
    this.stopProgressMonitoring();
    this.stopCountdown();

    bootstrap.Modal.getOrCreateInstance('#rangeModal').hide();

    const result = await this.controller.calibrateRangeOnClose();

    // Call the done callback if provided (range calibration is always successful when onClose is called)
    if (this.doneCallback && typeof this.doneCallback === 'function') {
      this.doneCallback(true, result?.message);
    }
    this.allDonePromiseResolve();
  }

  /**
   * Start monitoring progress by checking ll_data and rr_data arrays
   */
  startProgressMonitoring() {
    this.progressUpdateInterval = setInterval(() => {
      this.checkDataProgress();
    }, 100); // Check every 100ms
  }

  /**
   * Stop progress monitoring
   */
  stopProgressMonitoring() {
    if (this.progressUpdateInterval) {
      clearInterval(this.progressUpdateInterval);
      this.progressUpdateInterval = null;
    }
  }

  /**
   * Start countdown timer for Done button
   */
  startCountdown() {
    this.countdownSeconds = SECONDS_UNTIL_UNLOCK;
    this.updateCountdownButton();

    // Every second, update countdown
    this.countdownInterval = setInterval(() => {
      this.countdownSeconds--;
      if (this.countdownSeconds <= 0 || this.leftCycleProgress + this.rightCycleProgress >= 100) {
        this.stopCountdown();

        $('#range-calibration-alert').hide();
        $('#range-done-btn')
          .prop('disabled', false)
          .toggleClass('btn-primary', true)
          .toggleClass('btn-outline-primary', false);

        this.updateCountdownButton();
      } else {
        this.checkAndEnhanceAlert();
      }
      this.updateCountdownButton();
    }, 1000);
  }

  /**
   * Stop countdown timer
   */
  stopCountdown() {
    if (!this.countdownInterval) return;

    clearInterval(this.countdownInterval);
    this.countdownInterval = null;
    this.countdownSeconds = 0;
    this.updateCountdownButton();
  }

  /**
   * Update countdown button text and state
   */
  updateCountdownButton() {
    const seconds = this.countdownSeconds;
    const text = this.buttonText + (seconds > 0 ? ` (${seconds})` : "");
    $('#range-done-btn').text(text);
  }

  /**
   * Check if ll_data and rr_data have received data
   */
  checkDataProgress() {
    const JOYSTICK_EXTREME_THRESHOLD = 0.95;
    const CIRCLE_FILL_THRESHOLD = 0.95;

    // Count the number of times the joysticks have been rotated full circle
    const leftNonZeroCount = this.ll_data.filter(v => v > JOYSTICK_EXTREME_THRESHOLD).length
    const leftFillRatio = leftNonZeroCount / CIRCULARITY_DATA_SIZE;
    if (leftFillRatio >= CIRCLE_FILL_THRESHOLD) {
      this.leftFullCycles++;
      this.ll_data.fill(0);
    }

    const rightNonZeroCount = this.rr_data.filter(v => v > JOYSTICK_EXTREME_THRESHOLD).length;
    const rightFillRatio = rightNonZeroCount / CIRCULARITY_DATA_SIZE;
    if (rightFillRatio >= CIRCLE_FILL_THRESHOLD) {
      this.rightFullCycles++;
      this.rr_data.fill(0);
    }

    // Update progress if counts changed
    if (leftNonZeroCount !== this.leftNonZeroCount || rightNonZeroCount !== this.rightNonZeroCount) {
      this.leftNonZeroCount = leftNonZeroCount;
      this.rightNonZeroCount = rightNonZeroCount;
      this.updateProgress();
    }
  }

  /**
   * Update the progress bar and enable/disable Done button
   */
  updateProgress() {
    // Calculate progress based on full cycles completed
    // Each stick needs to complete 4 full cycles to contribute 50% to total progress
    const leftCycleProgress = Math.min(1, this.leftFullCycles / this.requiredFullCycles) * 50;
    const rightCycleProgress = Math.min(1, this.rightFullCycles / this.requiredFullCycles) * 50;
    this.leftCycleProgress = leftCycleProgress;
    this.rightCycleProgress = rightCycleProgress;

    // Add current partial progress for visual feedback
    const leftCurrentProgress = (this.leftNonZeroCount / CIRCULARITY_DATA_SIZE) * (50 / this.requiredFullCycles);
    const rightCurrentProgress = (this.rightNonZeroCount / CIRCULARITY_DATA_SIZE) * (50 / this.requiredFullCycles);

    const totalProgress = Math.round(
      Math.min(50, leftCycleProgress + leftCurrentProgress) +
      Math.min(50, rightCycleProgress  + rightCurrentProgress)
    );

    const $progressBar = $('#range-progress-bar');
    const $progressText = $('#range-progress-text');

    $progressBar
      .css('width', `${totalProgress}%`)
      .attr('aria-valuenow', totalProgress);

    $progressText.text(`${totalProgress}% (L:${this.leftFullCycles}/${this.requiredFullCycles}, R:${this.rightFullCycles}/${this.requiredFullCycles})`);
  }

  checkAndEnhanceAlert() {
    const secondsElapsed = SECONDS_UNTIL_UNLOCK - this.countdownSeconds;

    const alertIsVisible = $('#range-calibration-alert').is(":visible")
    const progressBelowThreshold = this.leftCycleProgress < 10 || this.rightCycleProgress < 10;
    if (secondsElapsed >= 5 && progressBelowThreshold && !alertIsVisible) {
      $('#range-calibration-alert').show();
    }

    const isBlinking = $('#keep-rotating-alert').hasClass('blink-text');
    if (secondsElapsed >= 7 && progressBelowThreshold && !isBlinking) {
      $('#keep-rotating-alert').addClass('blink-text');
    }
  }

  resetAlertEnhancement() {
    $('#keep-rotating-alert').removeClass('blink-text');
  }
}

// Global reference to the current range calibration instance
let currentCalibRangeInstance = null;

function destroyCurrentInstance() {
  currentCalibRangeInstance = null;
}

export async function calibrate_range(controller, dependencies, doneCallback = null) {
  destroyCurrentInstance(); // Clean up any existing instance
  currentCalibRangeInstance = new CalibRangeModal(controller, dependencies, doneCallback);

  await currentCalibRangeInstance.open();
  return new Promise((resolve) => {
    currentCalibRangeInstance.allDonePromiseResolve = resolve;
  });
}

async function calibrate_range_on_close() {
  if (currentCalibRangeInstance) {
    await currentCalibRangeInstance.onClose();
    destroyCurrentInstance();
  }
}

// Expose functions to window for HTML onclick handlers
window.calibrate_range_on_close = calibrate_range_on_close;