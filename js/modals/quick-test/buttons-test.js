'use strict';

import { l } from '../../translations.js';
import { addIcons } from './utils.js';

const BUTTONS = ['triangle', 'cross', 'circle', 'square', 'l1', 'r1', 'l2', 'r2', 'l3', 'r3', 'up', 'down', 'left', 'right', 'create', 'touchpad', 'options', 'ps', 'mute'];
const BUTTON_INFILL_MAPPING = {
  'triangle': 'qt-Triangle_infill',
  'cross': 'qt-Cross_infill',
  'circle': 'qt-Circle_infill',
  'square': 'qt-Square_infill',
  'l1': 'qt-L1_infill',
  'r1': 'qt-R1_infill',
  'l2': 'qt-L2_infill',
  'r2': 'qt-R2_infill',
  'l3': 'qt-L3_infill',
  'r3': 'qt-R3_infill',
  'up': 'qt-Up_infill',
  'down': 'qt-Down_infill',
  'left': 'qt-Left_infill',
  'right': 'qt-Right_infill',
  'create': 'qt-Create_infill',
  'touchpad': 'qt-Trackpad_infill',
  'options': 'qt-Options_infill',
  'ps': 'qt-PS_infill',
  'mute': 'qt-Mute_infill'
};

// Buttons that only need a single press to turn green
const CHECK_ONCE_BUTTONS = ['create', 'touchpad', 'options', 'l3', 'ps', 'mute', 'r3'];

const LONG_PRESS_BUTTONS = ['cross', 'square', 'triangle', 'circle'];
const LONG_PRESS_THRESHOLD_MS = 400;

/**
 * Buttons test: press every button until it turns green on the controller
 * drawing, with long-press shortcuts on the face buttons. This test captures
 * controller input while active (face buttons count presses instead of
 * navigating the test sequence).
 */
export class ButtonsTest {
  static id = 'buttons';
  static testName = 'Buttons';
  static icon = 'fas fa-gamepad';
  static capturesInput = true;

  constructor(host) {
    this.host = host;
    this.pressCount = {};
    this.longPressTimers = {};
    this.svgContainer = null;
  }

  content() {
    const instructions = l('Instructions');
    const pass = l('Pass');
    const fail = l('Fail');
    const buttonsTestDesc = l('This test checks all controller buttons by requiring you to press each button up to three times.');
    const buttonsInstructions = l('Press each button until they turn green.');
    const buttonsLongPress = l('Long-press [circle] to skip ahead.');
    const restart = l('Restart');
    return addIcons(`
      <p>${buttonsTestDesc}</p>
      <p><strong>${instructions}:</strong> ${buttonsInstructions}</p>
      <div class="d-flex justify-content-center mb-3">
        <div style="width: 80%; max-width: 400px;" id="quick-test-controller-svg-placeholder">
          <!-- SVG will be loaded dynamically -->
        </div>
      </div>
      <div class="alert alert-info mb-3">
        <i class="fas fa-info-circle me-2"></i>
        <span>${buttonsLongPress}</span>
      </div>
      <div class="d-flex gap-2 mt-3">
        <button type="button" class="btn btn-success" id="buttons-pass-btn" onclick="markTestResult('buttons', true)">
          <i class="fas fa-check me-1"></i><span>${pass}</span>
        </button>
        <button type="button" class="btn btn-danger" id="buttons-fail-btn" onclick="markTestResult('buttons', false)">
          <i class="fas fa-times me-1"></i><span>${fail}</span>
        </button>
        <button type="button" class="btn btn-outline-primary" id="buttons-reset-btn" onclick="quickTestAction('buttons', 'reset')">
          <i class="fas fa-redo me-1"></i><span>${restart}</span>
        </button>
      </div>
    `);
  }

  /**
   * Load the controller SVG into the accordion body after it is (re)built
   */
  async init() {
    const svgContainer = document.getElementById('quick-test-controller-svg-placeholder');
    if (!svgContainer) {
      console.warn('Quick test SVG container not found - buttons test may be skipped');
      return;
    }

    // Determine which SVG to load based on controller model
    const model = this.host.controller.getModel();
    let svgFileName;
    if (model === 'DS4') {
      svgFileName = 'dualshock-controller.svg';
    } else if (model === 'DS5' || model === 'DS5_Edge') {
      svgFileName = 'dualsense-controller.svg';
    } else {
      throw new Error(`Unknown controller model: ${model}`);
    }

    let svgContent;

    // Check if we have bundled assets (production mode)
    if (window.BUNDLED_ASSETS && window.BUNDLED_ASSETS.svg && window.BUNDLED_ASSETS.svg[svgFileName]) {
      svgContent = window.BUNDLED_ASSETS.svg[svgFileName];
    } else {
      // Fallback to fetching from server (development mode)
      const response = await fetch(`assets/${svgFileName}`);
      if (!response.ok) {
        throw new Error(`Failed to load controller SVG: ${svgFileName}`);
      }
      svgContent = await response.text();
    }

    // Modify SVG content to use unique IDs for the quick test modal
    svgContent = svgContent.replace(/id="([^"]+)"/g, 'id="qt-$1"');

    svgContainer.innerHTML = svgContent;

    // Apply initial styling to the SVG
    const svg = svgContainer.querySelector('svg');
    if (svg) {
      svg.id = 'qt-controller-svg';
      svg.style.width = '100%';
      svg.style.height = 'auto';
    }

    // Store reference to the SVG container for scoped queries
    this.svgContainer = svgContainer;

    const lightBlue = '#7ecbff';
    const midBlue = '#3399cc';
    const dualshock = this._getSvgElement('qt-Controller');
    this._setSvgGroupColor(dualshock, lightBlue);

    ['qt-Button_outlines','qt-Button_outlines_behind', 'qt-L3_outline', 'qt-R3_outline', 'qt-Trackpad_outline'].forEach(id => {
      const group = this._getSvgElement(id);
      this._setSvgGroupColor(group, midBlue);
    });

    ['qt-Controller_infills', 'qt-Button_infills', 'qt-L3_infill', 'qt-R3_infill', 'qt-Trackpad_infill'].forEach(id => {
      const group = document.getElementById(id);
      this._setSvgGroupColor(group, 'white');
    });

    this._resetButtonColors();
  }

  start() {
    this.host.startIconAnimation('buttons');

    // Initialize button press counts only if not already initialized
    if (!this.pressCount || Object.keys(this.pressCount).length === 0) {
      this.pressCount = {};
      this._getAvailableButtons().forEach(button => {
        this.pressCount[button] = 0;
      });
    }

    // Check for any buttons that are already stuck pressed when the test starts
    // and draw them as pressed
    this._getAvailableButtons().forEach(button => {
      if (this.host.controller.button_states[button] === true) {
        this._setButtonPressed(button, true);
      }
    });
  }

  stop() {
    this.host.stopIconAnimation('buttons');

    // Clear any active long-press timers
    this._clearAllLongPressTimers();
  }

  /**
   * Reset the buttons test to initial state
   */
  reset() {
    // Reset button press counts
    this.pressCount = {};
    this._getAvailableButtons().forEach(button => {
      this.pressCount[button] = 0;
    });

    // Clear any active long-press timers
    this._clearAllLongPressTimers();

    // Reset all button colors to orange (initial state)
    this._resetButtonColors();

    // Check for any buttons that are already stuck pressed and draw them as pressed
    this._getAvailableButtons().forEach(button => {
      if (this.host.controller.button_states[button] === true) {
        this._setButtonPressed(button, true);
      }
    });
  }

  /**
   * Track button presses while the test is active
   */
  handleInput(changes) {
    this._getAvailableButtons().forEach(button => {
      const handleLongpress = LONG_PRESS_BUTTONS.includes(button);
      if (changes[button] === true) {
        // Button pressed - increment count and show dark blue infill
        this.pressCount[button]++;
        this._setButtonPressed(button, true);

        // Start long-press timer for the face buttons
        if (handleLongpress) {
          this._startLongPressTimer(button);
        }
      } else if (changes[button] === false) {
        // Button released - restore appropriate color based on press count
        this._setButtonPressed(button, false);

        // Clear long-press timer for the face buttons
        if (handleLongpress) {
          this._clearLongPressTimer(button);
        }
      }
    });

    // Check if test is complete
    this._checkComplete();
  }

  /**
   * Get the list of buttons to test based on controller model
   * DS4 controllers don't have a mute button
   */
  _getAvailableButtons() {
    const model = this.host.controller.getModel();
    if (!model) {
      return BUTTONS;
    }
    if (model === 'DS4') {
      return BUTTONS.filter(button => button !== 'mute');
    }
    return BUTTONS;
  }

  /**
   * Get element from this test's SVG (scoped to avoid conflicts with the
   * main page's controller drawing)
   */
  _getSvgElement(id) {
    if (!this.svgContainer) {
      return null;
    }
    return this.svgContainer.querySelector(`#${id}`);
  }

  /**
   * Set color for SVG group elements
   */
  _setSvgGroupColor(group, color) {
    if (group) {
      const elements = group.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon');
      elements.forEach(el => {
        // Set up a smooth transition for fill and stroke if not already set
        if (!el.style.transition) {
          el.style.transition = 'fill 0.10s, stroke 0.10s';
        }
        el.setAttribute('fill', color);
        el.setAttribute('stroke', color);
      });
    }
  }

  /**
   * Reset all button colors to the initial (untested) color
   */
  _resetButtonColors() {
    Object.keys(BUTTON_INFILL_MAPPING).forEach(button => {
      const buttonElement = this._getSvgElement(BUTTON_INFILL_MAPPING[button]);
      this._setSvgGroupColor(buttonElement, 'orange');
    });
  }

  /**
   * Update button color based on press count
   */
  _updateButtonColor(button) {
    const count = this.pressCount[button] || 0;
    const buttonElement = this._getSvgElement(BUTTON_INFILL_MAPPING[button]);

    if (buttonElement) {
      const checkOnce = CHECK_ONCE_BUTTONS.includes(button);
      const colors = checkOnce ? ['orange'] : ['orange', '#a5c9fcff', '#287ffaff'];
      const color = colors[count] || '#16c016ff';
      this._setSvgGroupColor(buttonElement, color);
    }
  }

  /**
   * Set button pressed state and update visual appearance
   */
  _setButtonPressed(button, isPressed) {
    const buttonElement = this._getSvgElement(BUTTON_INFILL_MAPPING[button]);
    if (buttonElement) {
      if (isPressed) {
        // Show dark blue infill while pressed
        this._setSvgGroupColor(buttonElement, 'rgba(0, 0, 120, 1)');
      } else {
        // Restore color based on press count when released
        this._updateButtonColor(button);
      }
    }
  }

  /**
   * Check if all buttons have been pressed the required number of times
   */
  _checkComplete() {
    const allPressed = this._getAvailableButtons().every(button => {
      const count = this.pressCount[button] || 0;
      // Special buttons only need 1 press
      const checkOnce = CHECK_ONCE_BUTTONS.includes(button);
      return checkOnce ? count >= 1 : count >= 3;
    });
    if (allPressed) {
      // Auto-pass the test
      setTimeout(() => {
        this.host.markTestResult('buttons', true);
      }, 500);
    }
  }

  /**
   * Start long-press timer for a button
   */
  _startLongPressTimer(button) {
    if (this.host.isTransitioning()) return;

    // Clear any existing timer for this button
    this._clearLongPressTimer(button);

    // Start new timer
    this.longPressTimers[button] = setTimeout(() => {
      this._handleLongPress(button);
    }, LONG_PRESS_THRESHOLD_MS);
  }

  /**
   * Clear long-press timer for a button
   */
  _clearLongPressTimer(button) {
    if (this.longPressTimers[button]) {
      clearTimeout(this.longPressTimers[button]);
      delete this.longPressTimers[button];
    }
  }

  /**
   * Clear all active long-press timers
   */
  _clearAllLongPressTimers() {
    Object.keys(this.longPressTimers).forEach(button => {
      this._clearLongPressTimer(button);
    });
  }

  /**
   * Handle long-press action for the face buttons during the button test
   */
  _handleLongPress(button) {
    const activeTest = this.host.getCurrentActiveTest();
    if (activeTest === 'buttons') {
      this.host.setTransitioning();

      if (button === 'square') {
        this.host.markTestResult('buttons', true);
      } else if (button === 'cross') {
        this.host.markTestResult('buttons', false);
      } else if (button === 'triangle') {
        this.host.moveToPreviousTest();
      } else if (button === 'circle') {
        this.host.expandNextTest(activeTest);
      }
    }

    // Clear the timer since it has been handled
    delete this.longPressTimers[button];
  }
}
