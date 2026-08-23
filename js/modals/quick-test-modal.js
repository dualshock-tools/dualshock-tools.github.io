'use strict';

import { l } from '../translations.js';
import { la } from '../utils.js';
import { Storage } from '../storage.js';

const TEST_SEQUENCE = ['usb', 'buttons', 'imu', 'adaptive', 'haptic', 'lights', 'speaker', 'headphone', 'microphone'];
const TEST_NAMES = {
  'usb': 'USB Connector',
  'buttons': 'Buttons',
  'imu': 'IMU (Gyroscope & Accelerometer)',
  'haptic': 'Haptic Vibration',
  'adaptive': 'Adaptive Trigger',
  'lights': 'Lights',
  'speaker': 'Speaker',
  'headphone': 'Headphone Jack',
  'microphone': 'Microphone',
};

// IMU test tuning
const IMU_HISTORY_LENGTH = 512;       // samples kept for the sparkline charts (~2s at 250Hz)
const IMU_STILL_WINDOW = 50;          // consecutive samples that must be quiet to re-zero the gyro
const IMU_STILL_SPREAD_DPS = 4;       // max per-axis spread within the window to count as "still"
const IMU_GYRO_PASS_DPS = 120;        // peak rate that counts as "axis exercised"
const IMU_ACCEL_PASS_RANGE_G = 0.5;   // gravity swing that counts as "axis exercised"
const IMU_GYRO_BAR_SCALE_DPS = 360;   // full-deflection scale for the gyro bar meters
const IMU_ACCEL_BAR_SCALE_G = 1.5;    // full-deflection scale for the accel bar meters
const IMU_TEXT_INTERVAL_MS = 150;     // text readouts update slower than the bars for readability
const IMU_AUTOPASS_DELAY_MS = 1500;   // linger after all checks turn green before auto-passing
const IMU_AXES = ['x', 'y', 'z'];

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

function addIcons(string) {
  return string
    .replace('[triangle]', '<svg width="20" height="20" style="vertical-align: -4px;"><use xlink:href="#ps-triangle"/></svg>')
    .replace('[square]', '<svg width="20" height="20" style="vertical-align: -4px;"><use xlink:href="#ps-square"/></svg>')
    .replace('[circle]', '<svg width="20" height="20" style="vertical-align: -4px;"><use xlink:href="#ps-circle"/></svg>')
    .replace('[cross]', '<svg width="20" height="20" style="vertical-align: -4px;"><use xlink:href="#ps-cross"/></svg>')
}

/**
 * Quick Test Modal Class
 * Handles controller feature testing including haptic feedback, adaptive triggers, speaker, and microphone functionality
 */
export class QuickTestModal {
  constructor(controllerInstance) {
    this.controller = controllerInstance;

    this.resetAllTests();

    this._loadSkippedTestsFromStorage();

    // Bind event handlers to maintain proper context
    this._boundAccordionShown = (event) => this._handleAccordionShown(event);
    this._boundAccordionHidden = (event) => this._handleAccordionHidden(event);
    this._boundModalHidden = () => {
    // Clean up any active tests BEFORE resetting state
      this._stopButtonsTest();
      this._stopImuTest();
      this._stopAdaptiveTest();
      this._stopLightsTest();
      this._stopMicrophoneTest();

      destroyCurrentInstance();
    };

    this._initEventListeners();
  }

  _initializeState() {
    this.state = {
      usb: null,
      buttons: null,
      imu: null,
      haptic: null,
      adaptive: null,
      lights: null,
      speaker: null,
      microphone: null,
      headphone: null,
      microphoneStream: null,
      microphoneContext: null,
      microphoneMonitoring: false,
      imuMonitoring: false,
      imuDataHistory: [],
      imuGyroBias: { x: 0, y: 0, z: 0 },
      imuBiasCaptured: false,
      imuStillWindow: [],
      imuStats: null,
      imuRafId: null,
      imuLastTextRender: 0,
      imuAutoPassArmed: false,
      buttonPressCount: {},
      longPressTimers: {},
      longPressThreshold: 400,
      isTransitioning: false,
      skippedTests: [],
      lightsAnimationInterval: null,
      batteryAlertShown: false,
    };
  }

  /**
   * Save skipped tests to storage
   */
  _saveSkippedTestsToStorage() {
    try {
      Storage.quickTestSkippedTests.set(this.state.skippedTests);
    } catch (error) {
      console.warn('Failed to save skipped tests to storage:', error);
    }
  }

  /**
   * Load skipped tests from storage
   */
  _loadSkippedTestsFromStorage() {
    try {
      const skippedTests = Storage.quickTestSkippedTests.get();
      if (Array.isArray(skippedTests) && skippedTests.length > 0) {
        this.state.skippedTests = skippedTests.filter(test => TEST_SEQUENCE.includes(test));
        this._applySkippedTestsToUI();
      }
    } catch (error) {
      console.warn('Failed to load skipped tests from storage:', error);
      this.state.skippedTests = [];
    }
  }

  /**
   * Apply skipped tests to the UI (rebuild accordion with non-skipped tests)
   */
  async _applySkippedTestsToUI() {
    this._buildDynamicAccordion();
    await this._initSvgController();
    this._updateSkippedTestsDropdown();
  }

  /**
   * Build dynamic accordion with only non-skipped tests
   */
  _buildDynamicAccordion() {
    const $accordion = $('#quickTestAccordion');
    $accordion.empty();

    // Get supported tests from the controller
    const supportedTests = this.controller.getSupportedQuickTests();

    // Get non-skipped tests in order, filtered by what the controller supports
    let activeTests = TEST_SEQUENCE.filter(testType =>
      !this.state.skippedTests.includes(testType) && supportedTests.includes(testType)
    );

    activeTests.forEach(testType => {
      const accordionItem = this._createAccordionItem(testType);
      $accordion.append(accordionItem);
    });

    // Re-initialize event listeners for the new accordion items
    this._initEventListeners();
  }

  /**
   * Create an accordion item for a specific test type
   */
  _createAccordionItem(testType) {
    const testName = l(TEST_NAMES[testType]);
    const testIcons = {
      'usb': 'fas fa-plug',
      'buttons': 'fas fa-gamepad',
      'imu': 'fas fa-compass',
      'haptic': 'fas fa-mobile-alt',
      'adaptive': 'fas fa-hand-pointer',
      'lights': 'fas fa-lightbulb',
      'speaker': 'fas fa-volume-up',
      'microphone': 'fas fa-microphone',
      'headphone': 'fas fa-headphones'
    };

    const testContent = this._getTestContent(testType);

    const notTested = l('Not tested');
    const hide = l('hide');
    return $(`
      <div class="accordion-item" id="${testType}-test-item">
        <h2 class="accordion-header">
          <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${testType}-test-collapse" aria-expanded="false" aria-controls="${testType}-test-collapse">
            <div class="d-flex align-items-center w-100">
              <i class="${testIcons[testType]} me-3 test-icon-${testType}"></i>
              <span class="flex-grow-1">${testName}</span>
              <a href="#" class="btn btn-link text-decoration-none skip-btn" id="${testType}-skip-btn" onclick="skipTest('${testType}'); return false;">
                <span>${hide}</span>
              </a>
              <span class="badge bg-secondary me-2" id="${testType}-test-status">${notTested}</span>
            </div>
          </button>
        </h2>
        <div id="${testType}-test-collapse" class="accordion-collapse collapse" data-bs-parent="#quickTestAccordion">
          <div class="accordion-body">
            ${testContent}
          </div>
        </div>
      </div>
    `);
  }

  /**
   * Get the content for a specific test type
   */
  _getTestContent(testType) {
    const instructions = l('Instructions');
    const pass = l('Pass');
    const fail = l('Fail');
    switch (testType) {
      case 'usb':
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
      case 'buttons':
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
            <button type="button" class="btn btn-outline-primary" id="buttons-reset-btn" onclick="resetButtonsTest()">
              <i class="fas fa-redo me-1"></i><span>${restart}</span>
            </button>
          </div>
        `);
      case 'imu':
        const imuTestDesc = l('This test checks that the gyroscope and accelerometer respond on all axes.');
        const imuInstructions = l('Rotate the controller a full turn around each axis until every check turns green.');
        const imuRestart = l('Restart');
        const imuAtRest = l('at rest');
        const imuValueStyle = 'style="min-width: 7ch; text-align: right;"';
        const imuAxisColors = { x: '#dc3545', y: '#198754', z: '#0d6efd' };
        const imuAxisRow = (axis, label, sensor, initial) => `
          <div class="d-flex align-items-center">
            <span style="color: ${imuAxisColors[axis]};">${label}</span>
            <span class="ms-auto" ${imuValueStyle} id="imu-${sensor}-${axis}">${initial}</span>
            <span class="badge bg-secondary ms-2 imu-check" id="imu-check-${sensor}-${axis}"><i class="far fa-circle"></i></span>
          </div>
          <div class="imu-bar">
            <div class="imu-bar-fill" id="imu-bar-${sensor}-${axis}" style="background: ${imuAxisColors[axis]};"></div>
          </div>`;
        const imuSummaryRow = (labelHtml, valueId, checkId, initial) => `
          <div class="d-flex align-items-center border-top mt-1 pt-1">
            ${labelHtml}
            <span class="ms-auto" ${imuValueStyle} id="${valueId}">${initial}</span>
            <span class="badge bg-secondary ms-2 imu-check" id="${checkId}"><i class="far fa-circle"></i></span>
          </div>`;
        return `
          <p class="mb-2">${imuTestDesc}</p>
          <p class="mb-2"><strong>${instructions}:</strong> ${imuInstructions}</p>
          <div class="row g-2 mb-2">
            <div class="col-md-6">
              <label class="form-label mb-1"><strong>${l('Gyroscope')}</strong> <span class="text-muted">(°/s)</span></label>
              <div class="font-monospace small bg-body-tertiary border rounded p-2">
                ${imuAxisRow('x', l('Pitch'), 'gyro', '+0.0')}
                ${imuAxisRow('y', l('Yaw'), 'gyro', '+0.0')}
                ${imuAxisRow('z', l('Roll'), 'gyro', '+0.0')}
                ${imuSummaryRow(`<span>${l('Bias')} <span class="text-muted">(${l('auto-zeroed at rest')})</span></span>`, 'imu-gyro-bias', 'imu-check-gyro-bias', '0.0')}
              </div>
              <canvas id="imu-gyro-chart" class="border rounded mt-1" style="width: 100%; height: 90px;"></canvas>
            </div>
            <div class="col-md-6">
              <label class="form-label mb-1"><strong>${l('Accelerometer')}</strong> <span class="text-muted">(g)</span></label>
              <div class="font-monospace small bg-body-tertiary border rounded p-2">
                ${imuAxisRow('x', 'X', 'accel', '+0.00')}
                ${imuAxisRow('y', 'Y', 'accel', '+0.00')}
                ${imuAxisRow('z', 'Z', 'accel', '+0.00')}
                ${imuSummaryRow(`<span>${l('Total')} <span class="text-muted">(≈1.00 ${imuAtRest})</span></span>`, 'imu-accel-mag', 'imu-check-accel-mag', '0.00')}
              </div>
              <canvas id="imu-accel-chart" class="border rounded mt-1" style="width: 100%; height: 90px;"></canvas>
            </div>
          </div>
          <div class="row g-2 align-items-center">
            <div class="col-md-6">
              <div class="d-flex gap-2">
                <button type="button" class="btn btn-success" id="imu-pass-btn" onclick="markTestResult('imu', true)">
                  <i class="fas fa-check me-1"></i><span>${pass}</span>
                </button>
                <button type="button" class="btn btn-danger" id="imu-fail-btn" onclick="markTestResult('imu', false)">
                  <i class="fas fa-times me-1"></i><span>${fail}</span>
                </button>
                <button type="button" class="btn btn-outline-primary" id="imu-reset-btn" onclick="resetImuTest()">
                  <i class="fas fa-redo me-1"></i><span>${imuRestart}</span>
                </button>
              </div>
            </div>
            <div class="col-md-6">
              <div class="form-text mt-0">
                <i class="fas fa-info-circle me-1"></i>${l('At rest the accelerometer measures gravity: with the controller flat on a table, the Y axis points straight up and reads about +1 g while X and Z stay near 0.')}
              </div>
            </div>
          </div>
        `;
      case 'haptic':
        const hapticTestDesc = l("This test will activate the controller's vibration motors, first the heavy one, and then the light one.");
        const hapticInstructions = l('Feel for vibration in the controller.');
        const hapticRepeat = l('Repeat');
        return `
          <p>${hapticTestDesc}</p>
          <p><strong>${instructions}:</strong> ${hapticInstructions}</p>
          <div class="d-flex gap-2 mt-3">
            <button type="button" class="btn btn-success" id="haptic-pass-btn" onclick="markTestResult('haptic', true)">
              <i class="fas fa-check me-1"></i><span>${pass}</span>
            </button>
            <button type="button" class="btn btn-danger" id="haptic-fail-btn" onclick="markTestResult('haptic', false)">
              <i class="fas fa-times me-1"></i><span>${fail}</span>
            </button>
            <button type="button" class="btn btn-outline-primary" id="haptic-replay-btn" onclick="replayHapticTest()">
              <i class="fas fa-redo me-1"></i><span>${hapticRepeat}</span>
            </button>
          </div>
        `;
      case 'adaptive':
        const adaptiveTestDesc = l('This test will enable heavy resistance on both L2 and R2 triggers.');
        const adaptiveInstructions = l('Press L2 and R2 triggers to feel the trigger resistance.');
        return `
          <p>${adaptiveTestDesc}</p>
          <p><strong>${instructions}:</strong> ${adaptiveInstructions}</p>
          <div class="d-flex gap-2 mt-3">
            <button type="button" class="btn btn-success" id="adaptive-pass-btn" onclick="markTestResult('adaptive', true)">
              <i class="fas fa-check me-1"></i><span>${pass}</span>
            </button>
            <button type="button" class="btn btn-danger" id="adaptive-fail-btn" onclick="markTestResult('adaptive', false)">
              <i class="fas fa-times me-1"></i><span>${fail}</span>
            </button>
          </div>
        `;
      case 'lights':
        const lightsTestDesc = l('This test will cycle through red, green, and blue colors on the controller lightbar, animate the player indicator lights, and flash the mute button.');
        const lightsInstructions = l('Watch the controller lights change colors, the player lights animate, and the mute button flash.');
        return `
          <p>${lightsTestDesc}</p>
          <p><strong>${instructions}:</strong> ${lightsInstructions}</p>
          <div class="d-flex gap-2 mt-3">
            <button type="button" class="btn btn-success" id="lights-pass-btn" onclick="markTestResult('lights', true)">
              <i class="fas fa-check me-1"></i><span>${pass}</span>
            </button>
            <button type="button" class="btn btn-danger" id="lights-fail-btn" onclick="markTestResult('lights', false)">
              <i class="fas fa-times me-1"></i><span>${fail}</span>
            </button>
          </div>
        `;
      case 'speaker':
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
            <button type="button" class="btn btn-outline-primary" id="speaker-replay-btn" onclick="replaySpeakerTest()">
              <i class="fas fa-redo me-1"></i><span>${repeat}</span>
            </button>
          </div>
        `;
      case 'microphone':
        const microphoneTestDesc = l("This test will monitor the controller's microphone input levels.");
        const microphoneInstructions = l("Blow gently into the controller's microphone. You should see the audio level indicator respond.");
        const microphoneLevel = l('Microphone Level:');
        return `
          <p>${microphoneTestDesc}</p>
          <p><strong>${instructions}:</strong> ${microphoneInstructions}</p>
          <div class="mb-3" id="mic-level-container" style="display: none;">
            <label class="form-label">${microphoneLevel}</label>
            <div class="progress">
              <div class="progress-bar bg-info" role="progressbar" id="mic-level-bar" style="width: 0%" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
            </div>
          </div>
          <div class="d-flex gap-2 mt-3">
            <button type="button" class="btn btn-success" id="microphone-pass-btn" onclick="markTestResult('microphone', true)">
              <i class="fas fa-check me-1"></i><span>${pass}</span>
            </button>
            <button type="button" class="btn btn-danger" id="microphone-fail-btn" onclick="markTestResult('microphone', false)">
              <i class="fas fa-times me-1"></i><span>${fail}</span>
            </button>
          </div>
        `;
      case 'headphone':
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
            <button type="button" class="btn btn-primary" id="headphone-test-btn" onclick="testHeadphoneAudio()">
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
      default:
        return '';
    }
  }

  /**
   * Clear saved skipped tests from storage
   */
  _clearSkippedTestsFromStorage() {
    try {
      Storage.quickTestSkippedTests.clear();
    } catch (error) {
      console.warn('Failed to clear skipped tests from storage:', error);
    }
  }

  /**
   * Start icon animation for a specific test type
   */
  _startIconAnimation(testType) {
    const $accordionItem = $(`#${testType}-test-item`);
    const $icon = $accordionItem.find('.accordion-button i');
    $icon.addClass(`test-icon-${testType}`);
  }

  /**
   * Stop icon animation for a specific test type
   */
  _stopIconAnimation(testType) {
    const $accordionItem = $(`#${testType}-test-item`);
    const $icon = $accordionItem.find('.accordion-button i');
    $icon.removeClass(`test-icon-${testType}`);
  }

  /**
   * Update the instruction text based on current test state
   */
  _updateInstructions() {
    const $instructionsText = $('#quick-test-instructions-text');
    const activeTest = this._getCurrentActiveTest();
    const allTestsCompleted = this._areAllTestsCompleted();

    let instruction;
    if (activeTest === 'buttons') {
      instruction = l('Test all buttons, or long-press [square] to Pass and [cross] to Fail, or [circle] to skip.');
    } else if (activeTest) {
      instruction = l('Press [square] to Pass, [cross] to Fail, or [circle] to skip.');
    } else if (allTestsCompleted) {
      instruction = l('Press [circle] to close, or [square] to start over');
    } else {
      instruction = l('Press [square] to begin or [circle] to close');
    }

    // Append back instruction if test is active and not the first one
    if (activeTest && !this._isFirstTest(activeTest)) {
      instruction += ' ' + l('Press [triangle] to go back.');
    }

    $instructionsText.html(addIcons(instruction));
  }

  /**
   * Check if all tests have been completed
   */
  _areAllTestsCompleted() {
    return TEST_SEQUENCE.every(test => this.state[test] !== null || this.state.skippedTests.includes(test));
  }

  /**
   * Initialize event listeners for the quick test modal
   */
  // Set up event listeners for accordion collapse events to auto-start tests
  _initEventListeners() {
    // Remove existing listeners first
    this._removeAccordionEventListeners();

    // Add listeners for currently active tests
    const activeTests = TEST_SEQUENCE.filter(testType => !this.state.skippedTests.includes(testType));
    activeTests.forEach(testType => {
      const elementId = `${testType}-test-collapse`;
      const $element = $(`#${elementId}`);
      if ($element.length) {
        $element.on('shown.bs.collapse', this._boundAccordionShown);
        $element.on('hidden.bs.collapse', this._boundAccordionHidden);
      }
    });

    // Always try to add modal listeners (remove first to avoid duplicates)
    this._removeModalEventListeners();
    const $modal = $('#quickTestModal');
    $modal.on('hidden.bs.modal', this._boundModalHidden);
    $modal.on('shown.bs.modal', () => {
      this._updateInstructions();
      // Automatically start the test sequence when modal opens
      this._startTestSequence();
    });
  }

  /**
   * Remove accordion event listeners only
   */
  _removeAccordionEventListeners() {
    // Remove listeners from all possible test elements
    TEST_SEQUENCE.forEach(testType => {
      const elementId = `${testType}-test-collapse`;
      const $element = $(`#${elementId}`);
      if ($element.length) {
        $element.off('shown.bs.collapse');
        $element.off('hidden.bs.collapse');
      }
    });
  }

  /**
   * Remove modal event listeners only
   */
  _removeModalEventListeners() {
    const $modal = $('#quickTestModal');
    $modal.off('hidden.bs.modal', this._boundModalHidden);
    $modal.off('shown.bs.modal');
  }

  /**
   * Remove event listeners
   */
  removeEventListeners() {
    this._removeAccordionEventListeners();
    this._removeModalEventListeners();
  }

  /**
   * Open the Quick Test modal
   */
  async open() {
    la("quick_test_modal_open");

    // Build the dynamic accordion first
    this._buildDynamicAccordion();
    await this._initSvgController();
    bootstrap.Modal.getOrCreateInstance('#quickTestModal').show();
  }

  /**
   * Initialize SVG controller for the quick test modal
   */
  async _initSvgController() {
    // Only initialize SVG if buttons test is not skipped
    if (this.state.skippedTests.includes('buttons')) {
      return;
    }

    const svgContainer = document.getElementById('quick-test-controller-svg-placeholder');
    if (!svgContainer) {
      console.warn('Quick test SVG container not found - buttons test may be skipped');
      return;
    }

    // Determine which SVG to load based on controller model
    const model = this.controller.getModel();
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
    const dualshock = this._getQuickTestElement('qt-Controller');
    this._setSvgGroupColor(dualshock, lightBlue);

    ['qt-Button_outlines','qt-Button_outlines_behind', 'qt-L3_outline', 'qt-R3_outline', 'qt-Trackpad_outline'].forEach(id => {
      const group = this._getQuickTestElement(id);
      this._setSvgGroupColor(group, midBlue);
    });

    ['qt-Controller_infills', 'qt-Button_infills', 'qt-L3_infill', 'qt-R3_infill', 'qt-Trackpad_infill'].forEach(id => {
      const group = document.getElementById(id);
      this._setSvgGroupColor(group, 'white');
    });

    this._resetButtonColors();
  }

  /**
   * Get element from the quick test modal's SVG (scoped to avoid conflicts with main page)
   */
  _getQuickTestElement(id) {
    if (!this.svgContainer) {
      return null;
    }
    return this.svgContainer.querySelector(`#${id}`);
  }

  /**
   * Get the list of buttons to test based on controller model
   * DS4 controllers don't have a mute button
   */
  _getAvailableButtons() {
    const model = this.controller.getModel();
    if (!model) {
      return BUTTONS;
    }
    if (model === 'DS4') {
      return BUTTONS.filter(button => button !== 'mute');
    }
    return BUTTONS;
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
   * Handle accordion section being shown (expanded)
   */
  _handleAccordionShown(event) {
    const collapseId = event.target.id;
    const testType = collapseId.replace('-test-collapse', '');

    // Update instructions when a test becomes active
    this._updateInstructions();

    // Always auto-start test when section is expanded
    // Small delay to ensure UI is fully expanded
    setTimeout(() => {
      switch (testType) {
        case 'usb':
          // USB test is manual - no auto-start needed
          break;
        case 'buttons':
          this._startButtonsTest();
          break;
        case 'imu':
          this._startImuTest();
          break;
        case 'haptic':
          this._startHapticTest();
          break;
        case 'adaptive':
          this._startAdaptiveTest();
          break;
        case 'lights':
          this._startLightsTest();
          break;
        case 'speaker':
          this._startSpeakerTest();
          break;
        case 'microphone':
          this._startMicrophoneTest();
          break;
        case 'headphone':
          // Headphone test is manual - no auto-start needed
          break;
      }
    }, 100);
  }

  /**
   * Handle accordion section being hidden (collapsed)
   */
  _handleAccordionHidden(event) {
    const collapseId = event.target.id;
    const testType = collapseId.replace('-test-collapse', '');

    // Stop ongoing tests when section is collapsed
    switch (testType) {
      case 'usb':
        // USB test is manual - no stop needed
        break;
      case 'buttons':
        this._stopButtonsTest();
        break;
      case 'imu':
        this._stopImuTest();
        break;
      case 'adaptive':
        this._stopAdaptiveTest();
        break;
      case 'lights':
        this._stopLightsTest();
        break;
      case 'microphone':
        this._stopMicrophoneTest();
        break;
      case 'headphone':
        // Headphone test is manual - no stop needed
        break;
    }

    // Update instructions when a test is collapsed
    setTimeout(() => {
      this._updateInstructions();
    }, 300);
  }

  /**
   * Start buttons test
   */
  _startButtonsTest() {
    this._startIconAnimation('buttons');

    // Initialize button press counts only if not already initialized
    if (!this.state.buttonPressCount || Object.keys(this.state.buttonPressCount).length === 0) {
      this.state.buttonPressCount = {};
      this._getAvailableButtons().forEach(button => {
        this.state.buttonPressCount[button] = 0;
      });
    }

    // Check for any buttons that are already stuck pressed when the test starts
    // and draw them as pressed
    this._getAvailableButtons().forEach(button => {
      if (this.controller.button_states[button] === true) {
        this._setButtonPressed(button, true);
      }
    });
  }

  /**
   * Stop buttons test
   */
  _stopButtonsTest() {
    this._stopIconAnimation('buttons');

    // Clear any active long-press timers
    this._clearAllLongPressTimers();
  }

  /**
   * Reset all button colors to light blue
   */
  _resetButtonColors() {
    Object.keys(BUTTON_INFILL_MAPPING).forEach(button => {
      const buttonElement = this._getQuickTestElement(BUTTON_INFILL_MAPPING[button]);
      this._setSvgGroupColor(buttonElement, 'orange');
    });
  }

  /**
   * Update button color based on press count
   */
  _updateButtonColor(button) {
    const count = this.state.buttonPressCount[button] || 0;
    const buttonElement = this._getQuickTestElement(BUTTON_INFILL_MAPPING[button]);

    if (buttonElement) {
      const checkOnce = ['create', 'touchpad', 'options', 'l3', 'ps', 'mute', 'r3'].includes(button);
      const colors = checkOnce ? ['orange'] : ['orange', '#a5c9fcff', '#287ffaff'];
      const color = colors[count] || '#16c016ff';
      this._setSvgGroupColor(buttonElement, color);
    }
  }

  /**
   * Check if all buttons have been pressed the required number of times
   */
  _checkButtonsTestComplete() {
    const allPressed = this._getAvailableButtons().every(button => {
      const count = this.state.buttonPressCount[button] || 0;
      // Special buttons (create, options, mute, ps) only need 1 press
      const checkOnce = ['create', 'touchpad', 'options', 'l3', 'ps', 'mute', 'r3'].includes(button);
      return checkOnce ? count >= 1 : count >= 3;
    });
    if (allPressed) {
      // Auto-pass the test
      setTimeout(() => {
        this.markTestResult('buttons', true);
      }, 500);
    }
  }

  /**
   * Reset the buttons test to initial state
   */
  resetButtonsTest() {
    // Reset button press counts
    this.state.buttonPressCount = {};
    this._getAvailableButtons().forEach(button => {
      this.state.buttonPressCount[button] = 0;
    });

    // Clear any active long-press timers
    this._clearAllLongPressTimers();

    // Reset all button colors to orange (initial state)
    this._resetButtonColors();

    // Check for any buttons that are already stuck pressed and draw them as pressed
    this._getAvailableButtons().forEach(button => {
      if (this.controller.button_states[button] === true) {
        this._setButtonPressed(button, true);
      }
    });
  }

  /**
   * Start haptic vibration test
   */
  async _startHapticTest() {
    this._startIconAnimation('haptic');
    await this.controller.setVibration({ heavyLeft: 255, lightRight: 0, duration: 500 }, async () => {
      await setTimeout(async () => {
        await this.controller.setVibration({ heavyLeft: 0, lightRight: 255, duration: 500 });
      }, 500);
    });
    setTimeout(() => { this._stopIconAnimation('haptic'); }, 1500); }

  /**
   * Start adaptive trigger test
   */
  async _startAdaptiveTest() {
    this._startIconAnimation('adaptive');
    await this.controller.setAdaptiveTriggerPreset({ left: 'heavy', right: 'heavy' });
  }

  /**
   * Stop adaptive trigger test
   */
  async _stopAdaptiveTest() {
    this._stopIconAnimation('adaptive');
    console.log("Stopping Adaptive Trigger Test", this.controller);
    await this.controller.setAdaptiveTriggerPreset({ left: 'off', right: 'off' });
  }

  /**
   * Start lights test - cycles through colors and animates player lights
   */
  async _startLightsTest() {
    this._startIconAnimation('lights');
    const { currentController } = this.controller;

    if (!currentController?.setLightbarColor || !currentController?.setPlayerIndicator) {
      console.warn('Controller does not support light control');
      alert('This controller does not support light control. Only DualSense (DS5) controllers support this feature.');
      this._stopIconAnimation('lights');
      return;
    }

    const colors = [
      { r: 255, g: 0, b: 0 },   // Red
      { r: 0, g: 255, b: 0 },   // Green
      { r: 0, g: 0, b: 255 },   // Blue
    ];

    const playerPatterns = [
      0b10001,  // Light 1 & 5
      0b01010,  // Light 2 & 4
      0b00100,  // Light 3
      0b01010,  // Light 4 & 2
      0b10001,  // Light 5 & 1
      0b11111,  // All lights
      0b00000,  // No lights
      0b11111,  // All lights
      0b00000,  // No lights
    ];

    let colorIndex = 0;
    let patternIndex = 0;

    // Set mute LED - cycle through off, solid, pulsing
    if (currentController.setMuteLed) {
      await currentController.setMuteLed(2); // pulsing
    }

    // Start the animation
    this.state.lightsAnimationInterval = setInterval(async () => {
      try {
        const color = colors[colorIndex];
        const pattern = playerPatterns[patternIndex];

        // Set lightbar color and player indicator
        await currentController.setLightbarColor(color.r, color.g, color.b);
        await currentController.setPlayerIndicator(pattern);

        // Cycle through colors every 3 pattern changes
        patternIndex = (patternIndex + 1) % playerPatterns.length;
        if (patternIndex === 0) {
          colorIndex = (colorIndex + 1) % colors.length;
        }
      } catch (error) {
        console.error('Error during lights test:', error);
      }
    }, 200);
  }

  /**
   * Stop lights test and reset lights
   */
  async _stopLightsTest() {
    if(!this.state) return;

    this._stopIconAnimation('lights');

    // Clear the animation interval
    if (this.state.lightsAnimationInterval) {
      clearInterval(this.state.lightsAnimationInterval);
      this.state.lightsAnimationInterval = null;
    }

    await this.controller.currentController?.resetLights();
  }

  /**
   * Start speaker tone test
   */
  async _startSpeakerTest() {
    this._startIconAnimation('speaker');
    await this.controller.setSpeakerTone(300);
    setTimeout(() => { this._stopIconAnimation('speaker'); }, 1000);
  }

  /**
   * Start microphone test
   */
  async _startMicrophoneTest() {
    const $levelContainer = $('#mic-level-container');
    const $levelBar = $('#mic-level-bar');

    if (this.state.microphoneMonitoring) {
      // Stop monitoring
      this._stopMicrophoneTest();
      return;
    }

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      // Create audio context and analyzer
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyzer = audioContext.createAnalyser();

      analyzer.fftSize = 256;
      const bufferLength = analyzer.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      source.connect(analyzer);

      this.state.microphoneStream = stream;
      this.state.microphoneContext = audioContext;
      this.state.microphoneMonitoring = true;

      this._startIconAnimation('microphone');

      $levelContainer.show();

      // Monitor audio levels
      let isVibrating = false;
      const vibrationThreshold = 30; // Audio level threshold to trigger vibration
      let count = 0;

      const updateLevel = () => {
        if (!this.state.microphoneMonitoring) return;

        analyzer.getByteFrequencyData(dataArray);

        // Calculate average level
        const sum = dataArray.reduce((acc, value) => acc + value, 0);
        const average = sum / bufferLength;
        const percentage = Math.min(100, (average / 255) * 100);

        $levelBar.css('width', percentage + '%');
        $levelBar.attr('aria-valuenow', percentage);

        // Trigger vibration when audio level exceeds threshold
        if (percentage > vibrationThreshold && !isVibrating) {
          this.controller.setVibration({ heavyLeft: 50, duration: 50 }, () => { isVibrating = false; });
          isVibrating = true;
          count++;
        }

        if(count > 5){
          const activeTest = this._getCurrentActiveTest();
          this.markTestResult(activeTest, true);
        }

        requestAnimationFrame(updateLevel);
      };

      updateLevel();

    } catch (error) {
      console.error('Microphone test failed:', error);
    }
  }

  /**
   * Stop microphone test
   */
  _stopMicrophoneTest() {
    if(!this.state) return;

    const $levelContainer = $('#mic-level-container');

    this.state.microphoneMonitoring = false;

    this._stopIconAnimation('microphone');

    if (this.state.microphoneStream) {
      this.state.microphoneStream.getTracks().forEach(track => track.stop());
      this.state.microphoneStream = null;
    }

    if (this.state.microphoneContext) {
      this.state.microphoneContext.close();
      this.state.microphoneContext = null;
    }

    $levelContainer.hide();
  }

  /**
   * Start IMU (Gyroscope and Accelerometer) test
   */
  _startImuTest() {
    this._startIconAnimation('imu');
    if (!this.state) return;
    this.state.imuMonitoring = true;
    // Don't auto-close when revisiting a test whose checks were already all
    // green when it opened; pressing Restart re-arms the auto-pass
    this.state.imuAutoPassArmed = !this.state.imuStats || !this._areAllImuChecksGreen(this.state.imuStats);
    // Keep progress if the section is collapsed and re-expanded mid-test
    if (!this.state.imuStats) {
      this._resetImuStats();
    }
    this._startImuRenderLoop();
  }

  /**
   * Stop IMU test
   */
  _stopImuTest() {
    this._stopIconAnimation('imu');
    if (!this.state) return;
    this.state.imuMonitoring = false;
    if (this.state.imuRafId) {
      cancelAnimationFrame(this.state.imuRafId);
      this.state.imuRafId = null;
    }
    this._cancelImuAutoPass();
  }

  /**
   * Cancel a pending auto-pass countdown, if any
   */
  _cancelImuAutoPass() {
    const stats = this.state?.imuStats;
    if (stats?.autoPassTimer) {
      clearTimeout(stats.autoPassTimer);
      stats.autoPassTimer = null;
    }
  }

  /**
   * Restart the IMU test: clear progress, re-capture the gyroscope bias
   * and re-arm the auto-pass
   */
  resetImuTest() {
    if (!this.state) return;
    this._resetImuStats();
    this.state.imuAutoPassArmed = true;
  }

  /**
   * Reset IMU sample history, per-axis activity stats and gyro bias capture
   */
  _resetImuStats() {
    this._cancelImuAutoPass();
    this.state.imuDataHistory = [];
    this.state.imuStillWindow = [];
    this.state.imuGyroBias = { x: 0, y: 0, z: 0 };
    this.state.imuBiasCaptured = false;
    this.state.imuStats = {
      gyroPeak: { x: 0, y: 0, z: 0 },
      accelMin: { x: Infinity, y: Infinity, z: Infinity },
      accelMax: { x: -Infinity, y: -Infinity, z: -Infinity },
      magnitudeSeen: false,
      autoPassTimer: null,
    };
  }

  /**
   * Record one IMU sample: apply gyro bias and track per-axis activity.
   * Called per input report; rendering happens separately on animation frames.
   */
  _recordImuSample(imuData) {
    if (!this.state.imuMonitoring || !this.state.imuStats) return;
    const stats = this.state.imuStats;

    // Continuously re-zero the gyroscope: whenever the last IMU_STILL_WINDOW
    // samples are quiet on all axes, their average becomes the new bias
    const raw = imuData.gyro;
    const stillWindow = this.state.imuStillWindow;
    stillWindow.push({ x: raw.x, y: raw.y, z: raw.z });
    if (stillWindow.length > IMU_STILL_WINDOW) {
      stillWindow.shift();
    }
    if (stillWindow.length === IMU_STILL_WINDOW &&
        IMU_AXES.every(axis => {
          const values = stillWindow.map(s => s[axis]);
          return Math.max(...values) - Math.min(...values) < IMU_STILL_SPREAD_DPS;
        })) {
      this.state.imuGyroBias = {
        x: stillWindow.reduce((acc, s) => acc + s.x, 0) / IMU_STILL_WINDOW,
        y: stillWindow.reduce((acc, s) => acc + s.y, 0) / IMU_STILL_WINDOW,
        z: stillWindow.reduce((acc, s) => acc + s.z, 0) / IMU_STILL_WINDOW
      };
      this.state.imuBiasCaptured = true;
    }

    const bias = this.state.imuGyroBias;
    const gyro = { x: raw.x - bias.x, y: raw.y - bias.y, z: raw.z - bias.z };
    const accel = { x: imuData.accel.x, y: imuData.accel.y, z: imuData.accel.z };
    const magnitude = Math.hypot(accel.x, accel.y, accel.z);

    IMU_AXES.forEach(axis => {
      stats.gyroPeak[axis] = Math.max(stats.gyroPeak[axis], Math.abs(gyro[axis]));
      stats.accelMin[axis] = Math.min(stats.accelMin[axis], accel[axis]);
      stats.accelMax[axis] = Math.max(stats.accelMax[axis], accel[axis]);
    });
    // A healthy accelerometer reads ~1g total while the controller is at rest
    if (magnitude > 0.8 && magnitude < 1.2) {
      stats.magnitudeSeen = true;
    }

    this.state.imuDataHistory.push({ gyro, accel, magnitude });
    if (this.state.imuDataHistory.length > IMU_HISTORY_LENGTH) {
      this.state.imuDataHistory.shift();
    }

    this._checkImuTestComplete();
  }

  /**
   * Auto-pass the IMU test 2 seconds after every gyro axis has seen a clear
   * rotation and every accel axis has seen the gravity vector swing through it
   */
  _checkImuTestComplete() {
    const stats = this.state.imuStats;
    if (!stats || stats.autoPassTimer || !this.state.imuAutoPassArmed) return;
    if (!this._areAllImuChecksGreen(stats)) return;

    stats.autoPassTimer = setTimeout(() => {
      this.markTestResult('imu', true);
    }, IMU_AUTOPASS_DELAY_MS);
  }

  /**
   * True when every gyro axis, every accel axis and the magnitude check passed
   */
  _areAllImuChecksGreen(stats) {
    const gyroOk = IMU_AXES.every(axis => stats.gyroPeak[axis] >= IMU_GYRO_PASS_DPS);
    const accelOk = IMU_AXES.every(axis => stats.accelMax[axis] - stats.accelMin[axis] >= IMU_ACCEL_PASS_RANGE_G);
    return gyroOk && accelOk && stats.magnitudeSeen;
  }

  /**
   * Render the IMU panels on animation frames while the test is active
   */
  _startImuRenderLoop() {
    if (this.state.imuRafId) return;
    const render = () => {
      if (!this.state?.imuMonitoring) {
        if (this.state) this.state.imuRafId = null;
        return;
      }
      this._renderImuPanels();
      this.state.imuRafId = requestAnimationFrame(render);
    };
    this.state.imuRafId = requestAnimationFrame(render);
  }

  /**
   * Update IMU readouts, bar meters, checkmarks and sparkline charts.
   * Bars, checks and charts render every frame; the text readouts are
   * throttled so the numbers stay readable while the sensors flutter.
   */
  _renderImuPanels() {
    const history = this.state.imuDataHistory;
    const stats = this.state.imuStats;
    if (!history.length || !stats) return;
    const latest = history[history.length - 1];

    const now = performance.now();
    if (now - this.state.imuLastTextRender >= IMU_TEXT_INTERVAL_MS) {
      this.state.imuLastTextRender = now;
      const fmt = (value, digits) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
      IMU_AXES.forEach(axis => {
        $(`#imu-gyro-${axis}`).text(fmt(latest.gyro[axis], 1));
        $(`#imu-accel-${axis}`).text(fmt(latest.accel[axis], 2));
      });
      const bias = this.state.imuGyroBias;
      $('#imu-gyro-bias').text(Math.hypot(bias.x, bias.y, bias.z).toFixed(1));
      $('#imu-accel-mag').text(latest.magnitude.toFixed(2));
    }

    IMU_AXES.forEach(axis => {
      this._setImuBar(`imu-bar-gyro-${axis}`, latest.gyro[axis], IMU_GYRO_BAR_SCALE_DPS);
      this._setImuBar(`imu-bar-accel-${axis}`, latest.accel[axis], IMU_ACCEL_BAR_SCALE_G);
      this._setImuCheck(`imu-check-gyro-${axis}`, stats.gyroPeak[axis] >= IMU_GYRO_PASS_DPS);
      this._setImuCheck(`imu-check-accel-${axis}`, stats.accelMax[axis] - stats.accelMin[axis] >= IMU_ACCEL_PASS_RANGE_G);
    });
    this._setImuCheck('imu-check-gyro-bias', this.state.imuBiasCaptured);
    this._setImuCheck('imu-check-accel-mag', stats.magnitudeSeen);

    this._drawImuChart('imu-gyro-chart', history, 'gyro', IMU_GYRO_PASS_DPS * 2);
    this._drawImuChart('imu-accel-chart', history, 'accel', 1.5);
  }

  /**
   * Deflect one center-zero bar meter, clamped to ±scale
   */
  _setImuBar(id, value, scale) {
    const bar = document.getElementById(id);
    if (!bar) return;
    const clamped = Math.max(-1, Math.min(1, value / scale));
    const half = Math.abs(clamped) * 50;
    bar.style.width = `${half}%`;
    bar.style.left = clamped < 0 ? `${50 - half}%` : '50%';
  }

  /**
   * Toggle one check/pending indicator badge
   */
  _setImuCheck(id, passed) {
    const check = document.getElementById(id);
    if (!check) return;
    const className = passed ? 'badge bg-success ms-2 imu-check' : 'badge bg-secondary ms-2 imu-check';
    if (check.className !== className) {
      check.className = className;
      check.innerHTML = passed ? '<i class="fas fa-check"></i>' : '<i class="far fa-circle"></i>';
    }
  }

  /**
   * Draw a three-axis sparkline chart onto a canvas
   */
  _drawImuChart(canvasId, history, field, minScale) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;

    // Match the backing store to the displayed size (handles devicePixelRatio)
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Symmetric auto-scale around zero, never below minScale
    let scale = minScale;
    history.forEach(sample => {
      IMU_AXES.forEach(axis => {
        scale = Math.max(scale, Math.abs(sample[field][axis]));
      });
    });
    scale *= 1.05;

    // Zero line
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    const colors = { x: '#dc3545', y: '#198754', z: '#0d6efd' };
    IMU_AXES.forEach(axis => {
      ctx.strokeStyle = colors[axis];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      history.forEach((sample, i) => {
        const px = (i / (IMU_HISTORY_LENGTH - 1)) * width;
        const py = height / 2 - (sample[field][axis] / scale) * (height / 2);
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      });
      ctx.stroke();
    });
  }

  /**
   * Test headphone audio output by playing through controller headphones
   * This specifically routes audio to headphones instead of the built-in speaker
   */
  async testHeadphoneAudio() {
    this._startIconAnimation('headphone');

    try {
      // Play a test tone through the controller's headphone output
      // The third parameter specifies "headphones" as the output destination
      await this.controller.setSpeakerTone(500, ({success}) => {}, "headphones");

      // Stop the animation after the tone completes
      setTimeout(() => {
        this._stopIconAnimation('headphone');
      }, 700); // Slightly longer than tone duration

    } catch (error) {
      console.error('Error testing headphone audio:', error);
      this._stopIconAnimation('headphone');
    }
  }

  /**
   * Mark test result and update UI
   */
  markTestResult(testType, passed) {
    this.state[testType] = passed;

    this._stopIconAnimation(testType);

    const $statusBadge = $(`#${testType}-test-status`);
    const $accordionItem = $(`#${testType}-test-item`);
    const $accordionButton = $accordionItem.find('.accordion-button');

    $accordionItem.removeClass('border-success border-danger');

    if (passed) {
      $statusBadge.attr('class', 'badge bg-success me-2');
      $statusBadge.text(l('Passed'));
      $accordionItem.addClass('border-success');
      $accordionButton.css('backgroundColor', 'rgba(25, 135, 84, 0.1)'); // Light green background
    } else {
      $statusBadge.attr('class', 'badge bg-danger me-2');
      $statusBadge.text(l('Failed'));
      $accordionItem.addClass('border-danger');
      $accordionButton.css('backgroundColor', 'rgba(220, 53, 69, 0.1)'); // Light red background
    }

    // Clean up any active tests
    if (testType === 'adaptive') {
      this._stopAdaptiveTest();
    } else if (testType === 'microphone') {
      this._stopMicrophoneTest();
    }

    this._updateTestSummary();

    // Auto-expand next test
    this._expandNextTest(testType);
  }

  /**
   * Skip a test and remove it from the accordion
   */
  async skipTest(testType) {
    // Add to skipped tests if not already there
    if (!this.state.skippedTests.includes(testType)) {
      this.state.skippedTests.push(testType);
    }

    // Save to storage
    this._saveSkippedTestsToStorage();

    // Stop any ongoing test activities
    this._stopIconAnimation(testType);
    if (testType === 'adaptive') {
      this._stopAdaptiveTest();
    } else if (testType === 'microphone') {
      this._stopMicrophoneTest();
    } else if (testType === 'buttons') {
      this._stopButtonsTest();
    }

    // Rebuild the accordion without the skipped test
    this._buildDynamicAccordion();
    await this._initSvgController();

    this._updateSkippedTestsDropdown();
    this._updateTestSummary();
    this._expandNextTest(testType);
    this._updateInstructions();
  }

  /**
   * Add a test back from the skipped list
   */
  async addTestBack(testType) {
    // Remove from skipped tests
    const index = this.state.skippedTests.indexOf(testType);
    if (index > -1) {
      this.state.skippedTests.splice(index, 1);
    }

    this._saveSkippedTestsToStorage();

    // Reset test status in state
    this.state[testType] = null;

    // Rebuild the accordion with the restored test
    this._buildDynamicAccordion();
    await this._initSvgController();

    this._updateSkippedTestsDropdown();
    this._updateTestSummary();
    this._updateInstructions();
  }

  /**
   * Update the skipped tests dropdown
   */
  _updateSkippedTestsDropdown() {
    const $dropdown = $('#skipped-tests-dropdown');
    const $list = $('#skipped-tests-list');

    if (this.state.skippedTests.length === 0) {
      $dropdown.hide();
      return;
    }

    $dropdown.show();
    $list.empty();

    this.state.skippedTests.forEach(testType => {
      const testName = l(TEST_NAMES[testType]);
      const $item = $(`
        <li>
          <a class="dropdown-item" href="#" onclick="addTestBack('${testType}'); return false;">
            <i class="fas fa-plus me-2"></i>${testName}
          </a>
        </li>
      `);
      $list.append($item);
    });
  }

  /**
   * Update test summary display
   */
  _updateTestSummary() {
    const $summary = $('#test-summary');

    let completed = 0;
    let passed = 0;
    let skipped = this.state.skippedTests.length;

    // Get supported tests from the controller
    const supportedTests = this.controller.getSupportedQuickTests();

    // Get active tests for this controller model (non-skipped and supported)
    let activeTests = TEST_SEQUENCE.filter(testType =>
      !this.state.skippedTests.includes(testType) && supportedTests.includes(testType)
    );

    activeTests.forEach(test => {
      if (this.state[test] !== null) {
        completed++;
        if (this.state[test]) passed++;
      }
    });

    const numTests = activeTests.length;
    const totalProcessed = completed + skipped;

    if (totalProcessed === 0) {
      $summary.text(l('No tests completed yet.'));
      $summary.attr('class', 'text-muted');
    } else {
      let summaryText = `${completed}/${numTests} ${l("tests completed")}. ${passed} ${l("passed")}, ${completed - passed} ${l("failed")}.`;
      if (skipped > 0) {
        summaryText += ` ${skipped} ${l("skipped")}.`;
      }
      $summary.text(summaryText);
      $summary.attr('class', totalProcessed === numTests ? 'text-success' : 'text-info');
    }
  }

  /**
   * Expand the next untested item
   */
  _expandNextTest(currentTest) {
    const currentIndex = TEST_SEQUENCE.indexOf(currentTest);

    // Always collapse the current test first
    const $currentCollapse = $(`#${currentTest}-test-collapse`);
    bootstrap.Collapse.getInstance($currentCollapse[0])?.hide();

    // Find next untested item (not skipped and not completed)
    for (let i = currentIndex + 1; i < TEST_SEQUENCE.length; i++) {
      const nextTest = TEST_SEQUENCE[i];
      if (this.state[nextTest] === null && !this.state.skippedTests.includes(nextTest)) {
        const $nextCollapse = $(`#${nextTest}-test-collapse`);

        // Check if the element exists in the DOM before trying to create a Collapse instance
        if ($nextCollapse.length === 0 || !$nextCollapse[0]) {
          continue;
        }

        // Expand next
        setTimeout(() => {
          bootstrap.Collapse.getOrCreateInstance($nextCollapse[0]).show();
        }, 300);

        break;
      }
    }
  }

  /**
   * Get the currently active (expanded) test type
   */
  _getCurrentActiveTest() {
    for (const test of TEST_SEQUENCE) {
      // Skip tests that are in the skipped list
      if (this.state.skippedTests.includes(test)) {
        continue;
      }
      const $collapse = $(`#${test}-test-collapse`);
      if ($collapse.hasClass('show')) {
        return test;
      }
    }
    return null;
  }

  /**
   * Check if the given test is the first test in the sequence (excluding skipped tests)
   */
  _isFirstTest(testType) {
    // Get the first non-skipped test
    const firstTest = TEST_SEQUENCE.find(test => !this.state.skippedTests.includes(test));
    return testType === firstTest;
  }

  /**
   * Handle controller input for test navigation and control
   */
  handleControllerInput(changes, batteryStatus) {
    if(this.state.isTransitioning) return;

    // Check battery status and show/hide warning if charge is 5% or less
    if (batteryStatus) {
      // Only update visibility if alert hasn't been shown or charge level changed
      if (!this.state.batteryAlertShown || batteryStatus.changed ) {
        console.log("Battery status changed:", batteryStatus);
        const { charge_level, is_error } = batteryStatus;
        const $batteryWarning = $('#battery-warning-alert');
        $batteryWarning.toggle(charge_level <= 5 || is_error);
        this.state.batteryAlertShown = true;
      }
    }

    const activeTest = this._getCurrentActiveTest();

    // If buttons test is active, track button presses
    if (activeTest === 'buttons') {
      this._trackButtonPresses(changes);
      return;
    }

    // If IMU test is active, record the sample (rendering happens on animation frames)
    if (activeTest === 'imu' && changes.imu) {
      this._recordImuSample(changes.imu);
    }

    // Helper function to handle button press with transition
    const handleButtonPress = (action) => {
      this._setTransitioning();
      action();
    };

    // Handle button presses
    if (changes.square === true) {
      handleButtonPress(() => {
        if (!activeTest) {
          this._startTestSequence();
        } else {
          this.markTestResult(activeTest, true);
        }
      });
    } else if (activeTest && changes.cross === true) {
      handleButtonPress(() => this.markTestResult(activeTest, false));
    } else if (changes.triangle === true) {
      handleButtonPress(() => this._moveToPreviousTest());
    } else if (changes.circle === true) {
      handleButtonPress(() => {
        if (activeTest) {
          // Skip the current test by expanding the next one
          this._expandNextTest(activeTest);
        } else {
          // Close the modal if no test is active
          bootstrap.Modal.getOrCreateInstance('#quickTestModal').hide();
        }
      });
    }
  }

  /**
   * Set transitioning state to prevent rapid button presses
   */
  _setTransitioning() {
    this.state.isTransitioning = true;
    setTimeout(() => {
      this.state.isTransitioning = false;
    }, 750);
  }

  /**
   * Track button presses for the buttons test
   */
  _trackButtonPresses(changes) {
    this._getAvailableButtons().forEach(button => {
      const handleLongpress = ['cross', 'square', 'triangle', 'circle'].includes(button);
      if (changes[button] === true) {
        // Button pressed - increment count and show dark blue infill
        this.state.buttonPressCount[button]++;
        this._setButtonPressed(button, true);

        // Start long-press timer for square and cross buttons
        if (handleLongpress) {
          this._startLongPressTimer(button);
        }
      } else if (changes[button] === false) {
        // Button released - restore appropriate color based on press count
        this._setButtonPressed(button, false);

        // Clear long-press timer for square and cross buttons
        if (handleLongpress) {
          this._clearLongPressTimer(button);
        }
      }
    });

    // Check if test is complete
    this._checkButtonsTestComplete();
  }

  /**
   * Set button pressed state and update visual appearance
   */
  _setButtonPressed(button, isPressed) {
    const buttonElement = this._getQuickTestElement(BUTTON_INFILL_MAPPING[button]);
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
   * Start long-press timer for a button
   */
  _startLongPressTimer(button) {
    if(this.state.isTransitioning) return;

    // Clear any existing timer for this button
    this._clearLongPressTimer(button);

    // Start new timer
    this.state.longPressTimers[button] = setTimeout(() => {
      this._handleLongPress(button);
    }, this.state.longPressThreshold);
  }

  /**
   * Clear long-press timer for a button
   */
  _clearLongPressTimer(button) {
    if (this.state.longPressTimers[button]) {
      clearTimeout(this.state.longPressTimers[button]);
      delete this.state.longPressTimers[button];
    }
  }

  /**
   * Clear all active long-press timers
   */
  _clearAllLongPressTimers() {
    if(!this.state) return;

    Object.keys(this.state.longPressTimers).forEach(button => {
      this._clearLongPressTimer(button);
    });
  }

  /**
   * Handle long-press action for square and cross buttons during button test
   */
  _handleLongPress(button) {
    const activeTest = this._getCurrentActiveTest();
    if (activeTest === 'buttons') {
     this._setTransitioning();

      if (button === 'square') {
        this.markTestResult('buttons', true);
      } else if (button === 'cross') {
        this.markTestResult('buttons', false);
      } else if (button === 'triangle') {
        this._moveToPreviousTest();
      } else if (button === 'circle') {
        this._expandNextTest(activeTest);
      }
    }

    // Clear the timer since it has been handled
    delete this.state.longPressTimers[button];
  }

  /**
   * Start the test sequence from the beginning
   */
  async _startTestSequence() {
    // First, reset all tests to ensure clean state
    await this.resetAllTests();

    // After a short delay, start with the first non-skipped test
    setTimeout(() => {
      // Find the first test that is not skipped
      const firstAvailableTest = TEST_SEQUENCE.find(test => !this.state.skippedTests.includes(test));

      if (firstAvailableTest) {
        const $firstCollapse = $(`#${firstAvailableTest}-test-collapse`);
        // Check if the element exists in the DOM before trying to create a Collapse instance
        if ($firstCollapse.length > 0 && $firstCollapse[0]) {
          bootstrap.Collapse.getOrCreateInstance($firstCollapse[0]).show();
        }
      }
    }, 300);
  }

  /**
   * Move to the previous test in the sequence
   */
  _moveToPreviousTest() {
    const activeTest = this._getCurrentActiveTest();
    if (!activeTest) return;

    const currentIndex = TEST_SEQUENCE.indexOf(activeTest);

    // Find the previous non-skipped test
    let previousIndex = -1;
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (!this.state.skippedTests.includes(TEST_SEQUENCE[i])) {
        previousIndex = i;
        break;
      }
    }

    // If no previous test found, stay on current
    if (previousIndex === -1) return;

    const previousTest = TEST_SEQUENCE[previousIndex];

    // Collapse current test
    const $currentCollapse = $(`#${activeTest}-test-collapse`);
    bootstrap.Collapse.getInstance($currentCollapse[0])?.hide();


    // Expand previous test after a short delay
    setTimeout(() => {
      const $previousCollapse = $(`#${previousTest}-test-collapse`);
      // Check if the element exists in the DOM before trying to create a Collapse instance
      if ($previousCollapse.length > 0 && $previousCollapse[0]) {
        bootstrap.Collapse.getOrCreateInstance($previousCollapse[0]).show();
      }
    }, 300);
  }

  /**
   * Reset all tests to initial state
   */
  async resetAllTests() {
    // Clear any active long-press timers before resetting state
    this._clearAllLongPressTimers();

    // Reset state
    this._initializeState();

    // Load saved skipped tests from storage
    this._loadSkippedTestsFromStorage();

    // Reset button colors to initial state
    this._resetButtonColors();

    // Reset UI
    TEST_SEQUENCE.forEach(test => {
      this._stopIconAnimation(test);

      const $statusBadge = $(`#${test}-test-status`);
      const $accordionItem = $(`#${test}-test-item`);
      const $accordionButton = $accordionItem.find('.accordion-button');

      $statusBadge.attr('class', 'badge bg-secondary me-2');
      $statusBadge.text(l('Not tested'));
      $accordionItem.removeClass('border-success border-danger');
      $accordionButton.css('backgroundColor', ''); // Clear background color

      // Show all test items initially
      $accordionItem.show();

      if (test === 'microphone') {
        const $levelContainer = $('#mic-level-container');
        $levelContainer.hide();
      }
    });

    // Apply skipped tests to UI (hide skipped items)
    await this._applySkippedTestsToUI();

    this._updateTestSummary();

    // Update instructions after reset
    this._updateInstructions();

    // Collapse all accordions
    const $accordions = $('#quickTestAccordion .accordion-collapse');
    $accordions.each((index, accordion) => {
      bootstrap.Collapse.getInstance(accordion)?.hide();
    });
  }
}

// Global reference to the current quick test instance
let currentQuickTestInstance = null;

/**
 * Helper function to safely clear the current quick test instance
 */
function destroyCurrentInstance() {
  if (currentQuickTestInstance) {
    console.log("Destroying current quick test instance");
    currentQuickTestInstance.removeEventListeners();
    currentQuickTestInstance = null;
  }
}

/**
 * Check if the Quick Test Modal is currently visible
 */
export function isQuickTestVisible() {
  const $modal = $('#quickTestModal');
  return $modal.hasClass('show');
}

/**
 * Handle controller input for the Quick Test Modal
 */
export function quicktest_handle_controller_input(changes, batteryStatus) {
  if (currentQuickTestInstance && isQuickTestVisible()) {
    currentQuickTestInstance.handleControllerInput(changes, batteryStatus);
  }
}

/**
 * Show the Quick Test modal (legacy function for backward compatibility)
 */
export async function show_quick_test_modal(controller) {
  // Destroy any existing instance
  destroyCurrentInstance();

  // Create new instance
  currentQuickTestInstance = new QuickTestModal(controller);
  await currentQuickTestInstance.open();
}

function markTestResult(testType, passed) {
  if (currentQuickTestInstance) {
    currentQuickTestInstance.markTestResult(testType, passed);
  }
}

function resetAllTests() {
  if (currentQuickTestInstance) {
    currentQuickTestInstance.resetAllTests();
  }
}

function resetButtonsTest() {
  if (currentQuickTestInstance) {
    currentQuickTestInstance.resetButtonsTest();
  }
}

function skipTest(testType) {
  if (currentQuickTestInstance) {
    currentQuickTestInstance.skipTest(testType);
  }
}

function addTestBack(testType) {
  if (currentQuickTestInstance) {
    currentQuickTestInstance.addTestBack(testType);
  }
}

function testHeadphoneAudio() {
  if (currentQuickTestInstance) {
    currentQuickTestInstance.testHeadphoneAudio();
  }
}

function replaySpeakerTest() {
  if (currentQuickTestInstance) {
    currentQuickTestInstance._startSpeakerTest();
  }
}

function replayHapticTest() {
  if (currentQuickTestInstance) {
    currentQuickTestInstance._startHapticTest();
  }
}

function resetImuTest() {
  if (currentQuickTestInstance) {
    currentQuickTestInstance.resetImuTest();
  }
}

// Legacy compatibility - expose functions to window for HTML onclick handlers
window.markTestResult = markTestResult;
window.resetAllTests = resetAllTests;
window.resetButtonsTest = resetButtonsTest;
window.skipTest = skipTest;
window.addTestBack = addTestBack;
window.testHeadphoneAudio = testHeadphoneAudio;
window.replaySpeakerTest = replaySpeakerTest;
window.replayHapticTest = replayHapticTest;
window.resetImuTest = resetImuTest;
