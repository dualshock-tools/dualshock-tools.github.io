'use strict';

import { sleep, float_to_str } from '../utils.js';
import { l } from '../translations.js';
import { CIRCULARITY_DATA_SIZE, draw_stick_dial } from '../stick-renderer.js';

const SECONDS_UNTIL_UNLOCK = 15;

/**
 * Calibrate Stick Range Modal Class
 * Handles stick range calibration
 */
export class CalibRangeModal {
  constructor(controllerInstance, { ll_data, rr_data }, doneCallback = null, expertMode = false) {
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

    this.expertMode = expertMode;

    this.allDonePromiseResolve = undefined;
    this.doneCallback = doneCallback;

    this.hasSingleStick = (this.controller.currentController.getNumberOfSticks() == 1);

    // Stick rendering
    this.stickRenderInterval = null;
    this.currentStickPositions = {
      left: { x: 0, y: 0 },
      right: { x: 0, y: 0 }
    };

    this._initEventListeners();
  }

  /**
   * Initialize event listeners for the calibration modal
   */
  _initEventListeners() {
    $('#rangeModal').on('hidden.bs.modal', () => {
      console.log("Closing range calibration modal");
      if (currentCalibRangeInstance === this) {
        this.onClose().catch(err => console.error("Error in onClose:", err));
      }
    });
  }

  /**
   * Remove event listeners
   */
  removeEventListeners() {
    $('#rangeModal').off('hidden.bs.modal');
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

    // Start rendering loop
    this.startStickRendering();

    this._updateUIVisibility();
    if (!this.expertMode) {
      this.updateProgress();  // reset progress bar
      this.startProgressMonitoring();

      this.resetAlertEnhancement();
      this.startCountdown();
    }

    await sleep(1000);
    await this.controller.calibrateRangeBegin();
  }

  async onClose() {
    this.stopStickRendering();
    this.stopProgressMonitoring();
    this.stopCountdown();

    const result = await this.controller.calibrateRangeOnClose();

    // Call the done callback if provided
    if (result && this.doneCallback && typeof this.doneCallback === 'function') {
      this.doneCallback(result.success, result.message);
    }
    if (this.allDonePromiseResolve) {
      this.allDonePromiseResolve();
    }
    destroyCurrentInstance();
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
      // If there is only one stick, sum two times leftCycleProgress, so that it can reach 100.
      if (this.countdownSeconds <= 0 || this.leftCycleProgress + (this.hasSingleStick ? this.leftCycleProgress : this.rightCycleProgress) >= 100) {
        this.stopCountdown();
        this._enableDoneButton();
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
   * Enable the Done button and hide calibration alert
   */
  _enableDoneButton() {
    $('#range-calibration-alert').hide();
    $('#range-done-btn')
      .prop('disabled', false)
      .toggleClass('btn-primary', true)
      .toggleClass('btn-outline-primary', false);
  }

  /**
   * Check if ll_data and rr_data have received data
   */
  checkDataProgress() {
    const JOYSTICK_EXTREME_THRESHOLD = 0.80;
    const CIRCLE_FILL_THRESHOLD = 0.95;

    // Count the number of times the joysticks have been rotated full circle
    const leftNonZeroCount = this.ll_data.filter(v => v > JOYSTICK_EXTREME_THRESHOLD).length
    const leftFillRatio = leftNonZeroCount / CIRCULARITY_DATA_SIZE;
    if (leftFillRatio >= CIRCLE_FILL_THRESHOLD) {
      this.leftFullCycles++;
      this.ll_data.fill(0);
    }

    if(this.hasSingleStick) {
      // Update progress if counts changed
      if (leftNonZeroCount !== this.leftNonZeroCount) {
        this.leftNonZeroCount = leftNonZeroCount;
        this.updateProgress();
      }
    } else {
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
      this.hasSingleStick ? 
        Math.min(100, 2*(leftCycleProgress + leftCurrentProgress)) : (
          Math.min(50, leftCycleProgress + leftCurrentProgress) +
          Math.min(50, rightCycleProgress  + rightCurrentProgress)
        )
    );

    const $progressBar = $('#range-progress-bar');
    const $progressText = $('#range-progress-text');

    $progressBar
      .css('width', `${totalProgress}%`)
      .attr('aria-valuenow', totalProgress);

    if(!this.hasSingleStick) {
      $progressText.text(`${totalProgress}% (L:${this.leftFullCycles}/${this.requiredFullCycles}, R:${this.rightFullCycles}/${this.requiredFullCycles})`);
    } else {
      $progressText.text(`${totalProgress}% (L:${this.leftFullCycles}/${this.requiredFullCycles})`);
    }
  }

  checkAndEnhanceAlert() {
    const secondsElapsed = SECONDS_UNTIL_UNLOCK - this.countdownSeconds;

    const alertIsVisible = $('#range-calibration-alert').is(":visible")
    const progressBelowThreshold = this.leftCycleProgress < 10 || (this.hasSingleStick ? false : this.rightCycleProgress < 10);

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

  /**
   * Update UI visibility based on expert mode
   */
  _updateUIVisibility() {
    if (this.expertMode) {
      // Hide progress bar, progress text, and alert in expert mode. Enable Done button immediately.
      $('#range-progress-container').hide();
      $('#range-progress-text-container').hide();
      $('#range-calibration-alert').hide();
      this._enableDoneButton();
    } else {
      // Show progress bar and progress text in normal mode
      $('#range-progress-container').show();
      $('#range-progress-text-container').show();
    }

    // Hide right stick elements if single stick controller
    $('#range-right-stick-canvas').toggle(!this.hasSingleStick);
    $('#range-rx').toggle(!this.hasSingleStick);
    $('#range-ry').toggle(!this.hasSingleStick);
  }

  /**
   * Clear a canvas with white background
   */
  _clearCanvas(ctx, canvas) {
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  /**
   * Update current stick positions for rendering
   */
  handleControllerInput({sticks}) {
    if (sticks?.left) {
      this.currentStickPositions.left = { ...sticks.left };
    }
    if (sticks?.right) {
      this.currentStickPositions.right = { ...sticks.right };
    }
  }

  /**
   * Start stick rendering loop
   */
  startStickRendering() {
    if (this.stickRenderInterval) return;

    this.stickRenderInterval = setInterval(() => {
      this._renderSticks();
    }, 16); // ~60 FPS
  }

  /**
   * Stop stick rendering loop
   */
  stopStickRendering() {
    if (this.stickRenderInterval) {
      clearInterval(this.stickRenderInterval);
      this.stickRenderInterval = null;
    }
  }

  /**
   * Render both stick dials
   */
  _renderSticks() {
    const leftCanvas = document.getElementById('range-left-stick-canvas');
    const leftCtx = leftCanvas.getContext('2d');

    // Draw stick dials in normal mode (no circularity data, no zoom)
    const size = 60;
    const centerX = leftCanvas.width / 2;
    const centerY = leftCanvas.height / 2;
    const {left, right} = this.currentStickPositions;

    this._clearCanvas(leftCtx, leftCanvas);
    draw_stick_dial(leftCtx, centerX, centerY, size, left.x, left.y);

    const precision = 2;
    $("#range-lx-lbl").text(float_to_str(left.x, precision));
    $("#range-ly-lbl").text(float_to_str(left.y, precision));

    // Only render right stick if not a single stick controller
    if (!this.hasSingleStick) {
      const rightCanvas = document.getElementById('range-right-stick-canvas');
      const rightCtx = rightCanvas.getContext('2d');

      this._clearCanvas(rightCtx, rightCanvas);
      draw_stick_dial(rightCtx, centerX, centerY, size, right.x, right.y);

      $("#range-rx-lbl").text(float_to_str(right.x, precision));
      $("#range-ry-lbl").text(float_to_str(right.y, precision));
    }
  }
}

// Global reference to the current range calibration instance
let currentCalibRangeInstance = null;

function destroyCurrentInstance() {
  if (currentCalibRangeInstance) {
    console.log("Destroying current range calibration instance");
    currentCalibRangeInstance.removeEventListeners();
    currentCalibRangeInstance = null;
  }
}

export async function calibrate_range(controller, dependencies, doneCallback = null, expertMode = false) {
  destroyCurrentInstance(); // Clean up any existing instance
  currentCalibRangeInstance = new CalibRangeModal(controller, dependencies, doneCallback, expertMode);

  await currentCalibRangeInstance.open();
  return new Promise((resolve) => {
    currentCalibRangeInstance.allDonePromiseResolve = resolve;
  });
}

async function calibrate_range_on_close() {
  if (currentCalibRangeInstance) {
    bootstrap.Modal.getOrCreateInstance('#rangeModal').hide();
  }
}

export function rangeCalibHandleControllerInput(changes) {
  if (currentCalibRangeInstance) {
    currentCalibRangeInstance.handleControllerInput(changes);
  }
}

// Expose functions to window for HTML onclick handlers
window.calibrate_range_on_close = calibrate_range_on_close;
