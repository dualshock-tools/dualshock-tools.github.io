'use strict';

import { draw_stick_position } from '../stick-renderer.js';
import { dec2hex32, float_to_str } from '../utils.js';

const FINETUNE_INPUT_SUFFIXES = ["LL", "LT", "RL", "RT", "LR", "LB", "RR", "RB", "LX", "LY", "RX", "RY"];

/**
 * DS5 Finetuning Class
 * Handles controller stick calibration and fine-tuning operations
 */
export class Finetune {
  constructor() {
    this._mode = 'center'; // 'center' or 'circularity'
    this.original_data = [];
    this.last_written_data = [];
    this.active_stick = null; // 'left', 'right', or null
    this._centerStepSize = 5; // Default step size for center mode
    this._circularityStepSize = 5; // Default step size for circularity mode
    
    // Dependencies
    this.controller = null;
    this.ll_data = null;
    this.rr_data = null;
    this.clearCircularity = null;
    
    // Closure functions
    this.refresh_finetune_sticks = this._createRefreshSticksThrottled();
    this.update_finetune_warning_messages = this._createUpdateWarningMessagesClosure();
    this.flash_finetune_warning = this._createFlashWarningClosure();
    
    // Continuous adjustment state
    this.continuous_adjustment = {
      initial_delay: null,
      repeat_delay: null,
    };
  }

  get mode() {
    return this._mode;
  }

  set mode(mode) {
    if (mode !== 'center' && mode !== 'circularity') {
      throw new Error(`Invalid finetune mode: ${mode}. Must be 'center' or 'circularity'`);
    }
    this._mode = mode;
    this._updateUI();
  }

  get stepSize() {
    return this._mode === 'center' ? this._centerStepSize : this._circularityStepSize;
  }

  set stepSize(size) {
    if (this._mode === 'center') {
      this._centerStepSize = size;
    } else {
      this._circularityStepSize = size;
    }
    this._updateStepSizeUI();
    this._saveStepSizeToLocalStorage();
  }

  async init(controllerInstance, { ll_data, rr_data, clear_circularity }) {
    this.controller = controllerInstance;
    this.ll_data = ll_data;
    this.rr_data = rr_data;
    this.clearCircularity = clear_circularity;

    this._initEventListeners();
    this._restoreShowRawNumbersCheckbox();
    this._restoreStepSizeFromLocalStorage();
  
    // Lock NVS before
    const nv = await this.controller.queryNvStatus();
    if(!nv.locked) {
      const res = await this.controller.nvsLock();
      if(!res.ok) {
        return;
      }

      const nv2 = await this.controller.queryNvStatus();
      if(!nv2.locked) {
        const errTxt = "0x" + dec2hex32(nv2.raw);
        throw new Error("ERROR: Cannot lock NVS (" + errTxt + ")");
      }
    } else if(nv.status !== 'locked') {
      throw new Error("ERROR: Cannot read NVS status. Finetuning is not safe on this device.");
    }

    const data = await this._readFinetuneData();

    const modal = new bootstrap.Modal(document.getElementById('finetuneModal'), {})
    modal.show();

    const maxValue = this.controller.getFinetuneMaxValue();
    FINETUNE_INPUT_SUFFIXES.forEach((suffix, i) => {
      const el = $("#finetune" + suffix);
      el.attr('max', maxValue);
      el.val(data[i]);
    });

    // Start in center mode
    this.setMode('center');
    this.setStickToFinetune('left');

    // Initialize the raw numbers display state
    this._showRawNumbersChanged();

    this.original_data = data;

    this.refresh_finetune_sticks();
  }

  /**
   * Initialize event listeners for the finetune modal
   */
  _initEventListeners() {
    FINETUNE_INPUT_SUFFIXES.forEach((suffix) => {
      $("#finetune" + suffix).on('change', () => this._onFinetuneChange());
    });

    // Set up mode toggle event listeners
    $("#finetuneModeCenter").on('change', (e) => {
      if (e.target.checked) {
        this.setMode('center');
      }
    });

    $("#finetuneModeCircularity").on('change', (e) => {
      if (e.target.checked) {
        this.setMode('circularity');
      }
    });

    $("#showRawNumbersCheckbox").on('change', () => {
      this._showRawNumbersChanged();
    });

    $("#left-stick-card").on('click', () => {
      console.log("Left stick card clicked");
      this.setStickToFinetune('left');
    });

    $("#right-stick-card").on('click', () => {
      this.setStickToFinetune('right');
    });

    $('#finetuneModal').on('hidden.bs.modal', () => {
      console.log("Finetune modal hidden event triggered");
      destroyCurrentInstance();
    });

    // Step size dropdown event listeners
    $('.dropdown-item[data-step]').on('click', (e) => {
      e.preventDefault();
      const stepSize = parseInt($(e.target).data('step'));
      this.stepSize = stepSize;
    });
  }

  /**
   * Clean up event listeners for the finetune modal
   */
  removeEventListeners() {
    FINETUNE_INPUT_SUFFIXES.forEach((suffix) => {
      $("#finetune" + suffix).off('change');
    });

    // Remove mode toggle event listeners
    $("#finetuneModeCenter").off('change');
    $("#finetuneModeCircularity").off('change');

    // Remove other event listeners
    $("#showRawNumbersCheckbox").off('change');
    $("#left-stick-card").off('click');
    $("#right-stick-card").off('click');

    $('#finetuneModal').off('hidden.bs.modal');
    $('.dropdown-item[data-step]').off('click');
  }

  /**
   * Handle mode switching based on controller input
   */
  handleModeSwitching(changes) {
    if (changes.l1) {
      this.setMode('center');
      this._clearFinetuneAxisHighlights();
    } else if (changes.r1) {
      this.setMode('circularity');
      this._clearFinetuneAxisHighlights();
    }
  }

  /**
   * Handle stick switching based on controller input
   */
  handleStickSwitching(changes) {
    if (changes.sticks) {
      this._updateActiveStickBasedOnMovement();
    }
  }

  /**
   * Handle D-pad adjustments for finetuning
   */
  handleDpadAdjustment(changes) {
    if(!this.active_stick) return;

    if (this._mode === 'center') {
      this._handleCenterModeAdjustment(changes);
    } else {
      this._handleCircularityModeAdjustment(changes);
    }
  }

  /**
   * Save finetune changes
   */
  save() {
    // Unlock save button
    this.controller.setHasChangesToWrite(true);

    this._close();
  }

  /**
   * Cancel finetune changes and restore original data
   */
  async cancel() {
    if(this.original_data.length == 12)
      await this._writeFinetuneData(this.original_data)

    this._close();
  }

  /**
   * Set the finetune mode
   */
  setMode(mode) {
    this.mode = mode;
  }

  /**
   * Set which stick to finetune
   */
  setStickToFinetune(stick) {
    if(this.active_stick === stick) {
      return;
    }

    // Stop any continuous adjustments when switching sticks
    this.stopContinuousDpadAdjustment();
    this._clearFinetuneAxisHighlights();

    this.active_stick = stick;

    const other_stick = stick === 'left' ? 'right' : 'left';
    $(`#${this.active_stick}-stick-card`).addClass("stick-card-active");
    $(`#${other_stick}-stick-card`).removeClass("stick-card-active");
  }

  // Private methods

  /**
   * Restore the show raw numbers checkbox state from localStorage
   */
  _restoreShowRawNumbersCheckbox() {
    const savedState = localStorage.getItem('showRawNumbersCheckbox');
    if (savedState) {
      const isChecked = savedState === 'true';
      $("#showRawNumbersCheckbox").prop('checked', isChecked);
    }
  }

  /**
   * Check if stick is in extreme position (close to edges)
   * @param {Object} stick - Stick object with x and y properties
   * @returns {boolean} True if stick is in extreme position
   */
  _isStickInExtremePosition(stick) {
    const primeAxis = Math.max(Math.abs(stick.x), Math.abs(stick.y));
    const otherAxis = Math.min(Math.abs(stick.x), Math.abs(stick.y));
    return primeAxis >= 0.5 && otherAxis < 0.2;
  }

  _updateUI() {
    // Clear circularity data - we'll call this from core.js
    this.clearCircularity();

    const modal = $('#finetuneModal');
    if (this._mode === 'center') {
      $("#finetuneModeCenter").prop('checked', true);
      modal.removeClass('circularity-mode');
    } else if (this._mode === 'circularity') {
      $("#finetuneModeCircularity").prop('checked', true);
      modal.addClass('circularity-mode');
    }

    // Update step size UI when mode changes
    this._updateStepSizeUI();
  }

  async _onFinetuneChange() {
    const out = FINETUNE_INPUT_SUFFIXES.map((suffix) => {
      const el = $("#finetune" + suffix);
      const v = parseInt(el.val());
      return isNaN(v) ? 0 : v;
    });
    await this._writeFinetuneData(out);
  }

  async _readFinetuneData() {
    const data = await this.controller.getInMemoryModuleData();
    if(!data) {
      throw new Error("ERROR: Cannot read calibration data");
    }

    this.last_written_data = data;
    return data;
  }

  async _writeFinetuneData(data) {
    if (data.length != 12) {
      return;
    }

    // const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    // if (deepEqual(data, this.last_written_data)) {
    // if (data == this.last_written_data) {   //mm this will never be true, but fixing it (per above) breaks Edge writes
    //     return;
    // }

    this.last_written_data = data
    if (this.controller.isConnected()) {
      await this.controller.writeFinetuneData(data);
    }
  }

  _createRefreshSticksThrottled() {
    let timeout = null;

    return () => {
      if (timeout) return;

      timeout = setTimeout(() => {
        const { left, right } = this.controller.button_states.sticks;
        this._ds5FinetuneUpdate("finetuneStickCanvasL", left.x, left.y);
        this._ds5FinetuneUpdate("finetuneStickCanvasR", right.x, right.y);

        this.update_finetune_warning_messages();
        this._highlightActiveFinetuneAxis();

        timeout = null;
      }, 10);
    };
  }

  _createUpdateWarningMessagesClosure() {
    let timeout = null; // to stop unnecessary flicker in center mode

    return () => {
      if(!this.active_stick) return;

      const currentStick = this.controller.button_states.sticks[this.active_stick];
      if (this._mode === 'center') {
        const isNearCenter = Math.abs(currentStick.x) <= 0.5 && Math.abs(currentStick.y) <= 0.5;
        if(!isNearCenter && timeout) return;

        clearTimeout(timeout);
        timeout = setTimeout(() => {
          timeout = null;
          if(this._mode !== 'center') return; // in case it changed during timeout

          $('#finetuneCenterSuccess').toggle(isNearCenter);
          $('#finetuneCenterWarning').toggle(!isNearCenter);
        }, isNearCenter ? 0 : 200);
      }

      if (this._mode === 'circularity') {
        // Check if stick is in extreme position (close to edges)
        const isInExtremePosition = this._isStickInExtremePosition(currentStick);
        $('#finetuneCircularitySuccess').toggle(isInExtremePosition);
        $('#finetuneCircularityWarning').toggle(!isInExtremePosition);
      }
    };
  }

  _clearFinetuneAxisHighlights(to_clear = {center: true, circularity: true}) {
    const { center, circularity } = to_clear;

    if(this._mode === 'center' && center || this._mode === 'circularity' && circularity) {
      // Clear label highlights
      const labelIds = ["Lx-lbl", "Ly-lbl", "Rx-lbl", "Ry-lbl"];
      labelIds.forEach(suffix => {
        $(`#finetuneStickCanvas${suffix}`).removeClass("text-primary");
      });
    }
  }

  _highlightActiveFinetuneAxis(opts = {}) {
    if(!this.active_stick) return;

    if (this._mode === 'center') {
      const { axis } = opts;
      if(!axis) return;

      this._clearFinetuneAxisHighlights({center: true});

      const labelSuffix = `${this.active_stick === 'left' ? "L" : "R"}${axis.toLowerCase()}`;
      $(`#finetuneStickCanvas${labelSuffix}-lbl`).addClass("text-primary");
    } else {
      this._clearFinetuneAxisHighlights({circularity: true});

      const sticks = this.controller.button_states.sticks;
      const currentStick = sticks[this.active_stick];

      // Only highlight if stick is moved significantly from center
      const deadzone = 0.5;
      if (Math.abs(currentStick.x) >= deadzone || Math.abs(currentStick.y) >= deadzone) {
        const quadrant = this._getStickQuadrant(currentStick.x, currentStick.y);
        const inputSuffix = this._getFinetuneInputSuffixForQuadrant(this.active_stick, quadrant);
        if (inputSuffix) {
          // Highlight the corresponding LX/LY label to observe
          const labelId = `finetuneStickCanvas${
            this.active_stick === 'left' ? 'L' : 'R'}${
              quadrant === 'left' || quadrant === 'right' ? 'x' : 'y'}-lbl`;
              $(`#${labelId}`).addClass("text-primary");
            }
          }
        }
      }

  _ds5FinetuneUpdate(name, plx, ply) {
    const showRawNumbers = $("#showRawNumbersCheckbox").is(":checked");
    const canvasId = `${name}${showRawNumbers ? '' : '_large'}`;
    const c = document.getElementById(canvasId);

    if (!c) {
      console.error(`Canvas element not found: ${canvasId}`);
      return;
    }

    const ctx = c.getContext("2d");

    const margins = showRawNumbers ? 15 : 5;
    const radius = c.width / 2 - margins;
    const sz = c.width/2 - margins;
    const hb = radius + margins;
    const yb = radius + margins;
    ctx.clearRect(0, 0, c.width, c.height);

    const isLeftStick = name === "finetuneStickCanvasL";
    const highlight = this.active_stick == (isLeftStick ? 'left' : 'right') && this._isDpadAdjustmentActive();
    if (this._mode === 'circularity') {
      // Draw stick position with circle
      draw_stick_position(ctx, hb, yb, sz, plx, ply, {
        circularity_data: isLeftStick ? this.ll_data : this.rr_data,
        highlight
      });
    } else {
      // Draw stick position with crosshair
      draw_stick_position(ctx, hb, yb, sz, plx, ply, {
        enable_zoom_center: true,
        highlight
      });
    }

    $("#"+ name + "x-lbl").text(float_to_str(plx, 3));
    $("#"+ name + "y-lbl").text(float_to_str(ply, 3));
  }

  _showRawNumbersChanged() {
    const showRawNumbers = $("#showRawNumbersCheckbox").is(":checked");
    const modal = $("#finetuneModal");
    modal.toggleClass("hide-raw-numbers", !showRawNumbers);
    localStorage.setItem('showRawNumbersCheckbox', showRawNumbers);

    this.refresh_finetune_sticks();
  }

  _close() {
    console.log("Closing finetune modal");
    $("#finetuneModal").modal("hide");
  }

  _isStickAwayFromCenter(stick_pos, deadzone = 0.2) {
    return Math.abs(stick_pos.x) >= deadzone || Math.abs(stick_pos.y) >= deadzone;
  }

  _updateActiveStickBasedOnMovement() {
    const sticks = this.controller.button_states.sticks;
    const deadzone = 0.2;

    const left_is_away = this._isStickAwayFromCenter(sticks.left, deadzone);
    const right_is_away = this._isStickAwayFromCenter(sticks.right, deadzone);

    if (left_is_away && right_is_away) {
      // Both sticks are away from center - clear highlighting
      this._clearActiveStick();
    } else if (left_is_away && !right_is_away) {
      // Only left stick is away from center
      this.setStickToFinetune('left');
    } else if (right_is_away && !left_is_away) {
      // Only right stick is away from center
      this.setStickToFinetune('right');
    }
    // If both sticks are centered, keep current active stick (no change)
  }

  _clearActiveStick() {
    // Remove active class from both cards
    $("#left-stick-card").removeClass("stick-card-active");
    $("#right-stick-card").removeClass("stick-card-active");

    this.active_stick = null; // Clear active stick
    this._clearFinetuneAxisHighlights();
  }

  _getStickQuadrant(x, y) {
    // Determine which quadrant the stick is in based on x,y coordinates
    // x and y are normalized values between -1 and 1
    if (Math.abs(x) > Math.abs(y)) {
      return x > 0 ? 'right' : 'left';
    } else {
      return y > 0 ? 'down' : 'up';
    }
  }

  _getFinetuneInputSuffixForQuadrant(stick, quadrant) {
    // This function should only be used in circularity mode
    // In center mode, we don't care about quadrants - use direct axis mapping instead
    if (this._mode === 'center') {
      // This function shouldn't be called in center mode
      console.warn('get_finetune_input_suffix_for_quadrant called in center mode - this should not happen');
      return null;
    }

    // Circularity mode: map quadrants to specific calibration points
    if (stick === 'left') {
      switch (quadrant) {
        case 'left': return "LL";
        case 'up': return "LT";
        case 'right': return "LR";
        case 'down': return "LB";
      }
    } else if (stick === 'right') {
      switch (quadrant) {
        case 'left': return "RL";
        case 'up': return "RT";
        case 'right': return "RR";
        case 'down': return "RB";
      }
    }
    return null; // Invalid
  }

  _handleCenterModeAdjustment(changes) {
    const adjustmentStep = this._centerStepSize; // Use center step size for center mode

    // Define button mappings for center mode
    const buttonMappings = [
      { buttons: ['left', 'square'], adjustment: adjustmentStep, axis: 'X' },
      { buttons: ['right', 'circle'], adjustment: -adjustmentStep, axis: 'X' },
      { buttons: ['up', 'triangle'], adjustment: adjustmentStep, axis: 'Y' },
      { buttons: ['down', 'cross'], adjustment: -adjustmentStep, axis: 'Y' }
    ];

    // Check if any relevant button was released
    const relevantButtons = ['left', 'right', 'square', 'circle', 'up', 'down', 'triangle', 'cross'];
    if (relevantButtons.some(button => changes[button] === false)) {
      this.stopContinuousDpadAdjustment();
      return;
    }

    // Check for button presses
    for (const mapping of buttonMappings) {
      // Check if active stick is away from center (> 0.5)
      const sticks = this.controller.button_states.sticks;
      const currentStick = sticks[this.active_stick];
      const stickAwayFromCenter = Math.abs(currentStick.x) > 0.5 || Math.abs(currentStick.y) > 0.5;
      if (stickAwayFromCenter && this._isNavigationKeyPressed()) {
        this.flash_finetune_warning();
        return;
      }

      if (mapping.buttons.some(button => changes[button])) {
        this._highlightActiveFinetuneAxis({axis: mapping.axis});
        this._startContinuousDpadAdjustmentCenterMode(this.active_stick, mapping.axis, mapping.adjustment);
        return;
      }
    }
  }

  _isNavigationKeyPressed() {
    const nav_buttons = ['left', 'right', 'up', 'down', 'square', 'circle', 'triangle', 'cross'];
    return nav_buttons.some(button => this.controller.button_states[button] === true);
  }

  _createFlashWarningClosure() {
    let timeout = null;

    return () => {
      function toggle() {
        $("#finetuneCenterWarning").toggleClass(['alert-warning', 'alert-danger']);
        $("#finetuneCircularityWarning").toggleClass(['alert-warning', 'alert-danger']);
      }

      if(timeout) return;

      toggle();   // on
      timeout = setTimeout(() => {
        toggle();   // off
        timeout = null;
      }, 300);
    };
  }

  _handleCircularityModeAdjustment({sticks: _, ...changes}) {
    const sticks = this.controller.button_states.sticks;
    const currentStick = sticks[this.active_stick];

    // Only adjust if stick is moved significantly from center
    const isInExtremePosition = this._isStickInExtremePosition(currentStick);
    if (!isInExtremePosition) {
      this.stopContinuousDpadAdjustment();
      if(this._isNavigationKeyPressed()) {
        this.flash_finetune_warning();
      }
      return;
    }

    const quadrant = this._getStickQuadrant(currentStick.x, currentStick.y);

    // Use circularity step size for circularity mode
    const adjustmentStep = this._circularityStepSize;

    // Define button mappings for each quadrant type
    const horizontalButtons = ['left', 'right', 'square', 'circle'];
    const verticalButtons = ['up', 'down', 'triangle', 'cross'];

    let adjustment = 0;
    let relevantButtons = [];

    if (quadrant === 'left' || quadrant === 'right') {
      // Horizontal quadrants: left increases, right decreases
      relevantButtons = horizontalButtons;
      if (changes.left || changes.square) {
        adjustment = adjustmentStep;
      } else if (changes.right || changes.circle) {
        adjustment = -adjustmentStep;
      }
    } else if (quadrant === 'up' || quadrant === 'down') {
      // Vertical quadrants: up increases, down decreases
      relevantButtons = verticalButtons;
      if (changes.up || changes.triangle) {
        adjustment = adjustmentStep;
      } else if (changes.down || changes.cross) {
        adjustment = -adjustmentStep;
      }
    }

    // Check if any relevant button was released
    if (relevantButtons.some(button => changes[button] === false)) {
      this.stopContinuousDpadAdjustment();
      return;
    }

    // Start continuous adjustment on button press
    if (adjustment !== 0) {
      this._startContinuousDpadAdjustment(this.active_stick, quadrant, adjustment);
    }
  }

  _startContinuousDpadAdjustment(stick, quadrant, adjustment) {
    const inputSuffix = this._getFinetuneInputSuffixForQuadrant(stick, quadrant);
    this._startContinuousAdjustmentWithSuffix(inputSuffix, adjustment);
  }

  _startContinuousDpadAdjustmentCenterMode(stick, targetAxis, adjustment) {
    // In center mode, directly map to X/Y axes
    const inputSuffix = stick === 'left' ?
    (targetAxis === 'X' ? 'LX' : 'LY') :
    (targetAxis === 'X' ? 'RX' : 'RY');
    this._startContinuousAdjustmentWithSuffix(inputSuffix, adjustment);
  }

  _startContinuousAdjustmentWithSuffix(inputSuffix, adjustment) {
    this.stopContinuousDpadAdjustment();

    const element = $(`#finetune${inputSuffix}`);
    if (!element.length) return;

    // Perform initial adjustment immediately...
    this._performDpadAdjustment(element, adjustment);
    this.clearCircularity();

    // ...then prime continuous adjustment
    this.continuous_adjustment.initial_delay = setTimeout(() => {
      this.continuous_adjustment.repeat_delay = setInterval(() => {
        this._performDpadAdjustment(element, adjustment);
        this.clearCircularity();
      }, 150);
    }, 400); // Initial delay before continuous adjustment starts (400ms)
  }

  stopContinuousDpadAdjustment() {
    clearInterval(this.continuous_adjustment.repeat_delay);
    this.continuous_adjustment.repeat_delay = null;

    clearTimeout(this.continuous_adjustment.initial_delay);
    this.continuous_adjustment.initial_delay = null;
  }

  _isDpadAdjustmentActive() {
    return !!this.continuous_adjustment.initial_delay;
  }

  async _performDpadAdjustment(element, adjustment) {
    const currentValue = parseInt(element.val()) || 0;
    const maxValue = this.controller.getFinetuneMaxValue();

    const newValue = Math.max(0, Math.min(maxValue, currentValue + adjustment));
    element.val(newValue);

    // Trigger the change event to update the finetune data
    await this._onFinetuneChange();
  }

  /**
   * Update the step size UI display
   */
  _updateStepSizeUI() {
    const currentStepSize = this._mode === 'center' ? this._centerStepSize : this._circularityStepSize;
    $('#stepSizeValue').text(currentStepSize);
  }

  /**
   * Save step size to localStorage
   */
  _saveStepSizeToLocalStorage() {
    localStorage.setItem('finetuneCenterStepSize', this._centerStepSize.toString());
    localStorage.setItem('finetuneCircularityStepSize', this._circularityStepSize.toString());
  }

  /**
   * Restore step size from localStorage
   */
  _restoreStepSizeFromLocalStorage() {
    // Restore center step size
    const savedCenterStepSize = localStorage.getItem('finetuneCenterStepSize');
    if (savedCenterStepSize) {
      this._centerStepSize = parseInt(savedCenterStepSize);
    }

    // Restore circularity step size
    const savedCircularityStepSize = localStorage.getItem('finetuneCircularityStepSize');
    if (savedCircularityStepSize) {
      this._circularityStepSize = parseInt(savedCircularityStepSize);
    }

    this._updateStepSizeUI();
  }
}

// Global reference to the current finetune instance
let currentFinetuneInstance = null;

/**
 * Helper function to safely clear the current finetune instance
 */
function destroyCurrentInstance() {
  if (currentFinetuneInstance) {
    currentFinetuneInstance.stopContinuousDpadAdjustment();
    currentFinetuneInstance.removeEventListeners();
    currentFinetuneInstance = null;
  }
}

// Function to create and initialize finetune instance
export async function ds5_finetune(controller, dependencies) {
  // Create new instance
  currentFinetuneInstance = new Finetune();
  await currentFinetuneInstance.init(controller, dependencies);
}

export function finetune_handle_controller_input(changes) {
  if (currentFinetuneInstance) {
    currentFinetuneInstance.refresh_finetune_sticks();
    currentFinetuneInstance.handleModeSwitching(changes);
    currentFinetuneInstance.handleStickSwitching(changes);
    currentFinetuneInstance.handleDpadAdjustment(changes);
  }
}

function finetune_save() {
  console.log("Saving finetune changes");
  if (currentFinetuneInstance) {
    currentFinetuneInstance.save();
  }
}

async function finetune_cancel() {
  console.log("Cancelling finetune changes");
  if (currentFinetuneInstance) {
    await currentFinetuneInstance.cancel();
  }
}

export function isFinetuneVisible() {
  return !!currentFinetuneInstance;
}

window.finetune_cancel = finetune_cancel;
window.finetune_save = finetune_save;
