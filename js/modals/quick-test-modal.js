'use strict';

const TEST_SEQUENCE = ['usb', 'buttons', 'haptic', 'adaptive', 'lights', 'speaker', 'headphone', 'microphone'];
const TEST_NAMES = {
  'usb': 'USB Connector',
  'buttons': 'Buttons',
  'haptic': 'Haptic Vibration',
  'adaptive': 'Adaptive Trigger',
  'lights': 'Lights',
  'speaker': 'Speaker',
  'headphone': 'Headphone Jack',
  'microphone': 'Microphone',
};

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
/**
 * Quick Test Modal Class
 * Handles controller feature testing including haptic feedback, adaptive triggers, speaker, and microphone functionality
 */
export class QuickTestModal {
  constructor(controllerInstance, { l }) {
    this.controller = controllerInstance;
    this.l = l;

    this.resetAllTests();

    this._loadSkippedTestsFromStorage();

    // Bind event handlers to maintain proper context
    this._boundAccordionShown = (event) => this._handleAccordionShown(event);
    this._boundAccordionHidden = (event) => this._handleAccordionHidden(event);
    this._boundModalHidden = () => {
      this.resetAllTests();
      destroyCurrentInstance();
    };

    this._initEventListeners();
  }

  _initializeState() {
    this.state = {
      usb: null,
      buttons: null,
      haptic: null,
      adaptive: null,
      lights: null,
      speaker: null,
      microphone: null,
      headphone: null,
      microphoneStream: null,
      microphoneContext: null,
      microphoneMonitoring: false,
      buttonPressCount: {},
      longPressTimers: {},
      longPressThreshold: 400,
      isTransitioning: false,
      skippedTests: [],
      lightsAnimationInterval: null,
    };
  }

  /**
   * Save skipped tests to localStorage
   */
  _saveSkippedTestsToStorage() {
    try {
      localStorage.setItem('quickTestSkippedTests', JSON.stringify(this.state.skippedTests));
    } catch (error) {
      console.warn('Failed to save skipped tests to localStorage:', error);
    }
  }

  /**
   * Load skipped tests from localStorage
   */
  _loadSkippedTestsFromStorage() {
    try {
      const saved = localStorage.getItem('quickTestSkippedTests');
      if (saved) {
        const skippedTests = JSON.parse(saved);
        if (Array.isArray(skippedTests)) {
          this.state.skippedTests = skippedTests.filter(test => TEST_SEQUENCE.includes(test));
          // Apply the skipped tests to the UI
          this._applySkippedTestsToUI();
        }
      }
    } catch (error) {
      console.warn('Failed to load skipped tests from localStorage:', error);
      this.state.skippedTests = [];
    }
  }

  /**
   * Apply skipped tests to the UI (rebuild accordion with non-skipped tests)
   */
  _applySkippedTestsToUI() {
    this._buildDynamicAccordion();
    this._updateSkippedTestsDropdown();
  }

  /**
   * Build dynamic accordion with only non-skipped tests
   */
  _buildDynamicAccordion() {
    const $accordion = $('#quickTestAccordion');
    $accordion.empty();

    // Get non-skipped tests in order
    const activeTests = TEST_SEQUENCE.filter(testType => !this.state.skippedTests.includes(testType));

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
    const testName = TEST_NAMES[testType];
    const testIcons = {
      'usb': 'fas fa-plug',
      'buttons': 'fas fa-gamepad',
      'haptic': 'fas fa-mobile-alt',
      'adaptive': 'fas fa-hand-pointer',
      'lights': 'fas fa-lightbulb',
      'speaker': 'fas fa-volume-up',
      'microphone': 'fas fa-microphone',
      'headphone': 'fas fa-headphones'
    };

    const testContent = this._getTestContent(testType);

    return $(`
      <div class="accordion-item" id="${testType}-test-item">
        <h2 class="accordion-header">
          <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${testType}-test-collapse" aria-expanded="false" aria-controls="${testType}-test-collapse">
            <div class="d-flex align-items-center w-100">
              <i class="${testIcons[testType]} me-3 test-icon-${testType}"></i>
              <span class="flex-grow-1 ds-i18n">${testName}</span>
              <a href="#" class="btn btn-link text-decoration-none skip-btn" id="${testType}-skip-btn" onclick="skipTest('${testType}'); return false;">
                <span class="ds-i18n">skip</span>
              </a>
              <span class="badge bg-secondary me-2" id="${testType}-test-status">Not tested</span>
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
    switch (testType) {
      case 'usb':
        return `
          <p class="ds-i18n">This test checks the reliability of the USB port.</p>
          <p class="ds-i18n"><strong>Instructions:</strong> Wiggle the USB cable to see if the controller disconnects.</p>
          <div class="alert alert-warning mb-3">
            <i class="fas fa-exclamation-triangle me-2"></i>
            <span class="ds-i18n">Be gentle to avoid damage.</span>
          </div>
          <div class="d-flex gap-2 mt-3">
            <button type="button" class="btn btn-success" id="usb-pass-btn" onclick="markTestResult('usb', true)">
              <i class="fas fa-check me-1"></i><span class="ds-i18n">Pass</span>
            </button>
            <button type="button" class="btn btn-danger" id="usb-fail-btn" onclick="markTestResult('usb', false)">
              <i class="fas fa-times me-1"></i><span class="ds-i18n">Fail</span>
            </button>
          </div>
        `;
      case 'buttons':
        return `
          <p class="ds-i18n">This test checks all controller buttons by requiring you to press each button up to three times.</p>
          <p class="ds-i18n"><strong>Instructions:</strong> Press each button until they turn green.</p>
          <div class="d-flex justify-content-center mb-3">
            <div style="width: 80%; max-width: 400px;" id="quick-test-controller-svg-placeholder">
              <!-- SVG will be loaded dynamically -->
            </div>
          </div>
          <div class="alert alert-info mb-3">
            <i class="fas fa-info-circle me-2"></i>
            <span class="ds-i18n">The test will automatically pass when all buttons have turned green.</span>
          </div>
          <div class="d-flex gap-2 mt-3">
            <button type="button" class="btn btn-success" id="buttons-pass-btn" onclick="markTestResult('buttons', true)">
              <i class="fas fa-check me-1"></i><span class="ds-i18n">Pass</span>
            </button>
            <button type="button" class="btn btn-danger" id="buttons-fail-btn" onclick="markTestResult('buttons', false)">
              <i class="fas fa-times me-1"></i><span class="ds-i18n">Fail</span>
            </button>
            <button type="button" class="btn btn-outline-primary" id="buttons-reset-btn" onclick="resetButtonsTest()">
              <i class="fas fa-redo me-1"></i><span class="ds-i18n">Restart</span>
            </button>
          </div>
        `;
      case 'haptic':
        return `
          <p class="ds-i18n">This test will activate the controller's vibration motors for 3 seconds.</p>
          <p class="ds-i18n"><strong>Instructions:</strong> Feel for vibration in the controller.</p>
          <div class="d-flex gap-2 mt-3">
            <button type="button" class="btn btn-success" id="haptic-pass-btn" onclick="markTestResult('haptic', true)">
              <i class="fas fa-check me-1"></i><span class="ds-i18n">Pass</span>
            </button>
            <button type="button" class="btn btn-danger" id="haptic-fail-btn" onclick="markTestResult('haptic', false)">
              <i class="fas fa-times me-1"></i><span class="ds-i18n">Fail</span>
            </button>
          </div>
        `;
      case 'adaptive':
        return `
          <p class="ds-i18n">This test will enable heavy resistance on both L2 and R2 triggers.</p>
          <p class="ds-i18n"><strong>Instructions:</strong> Press L2 and R2 triggers to feel the trigger resistance.</p>
          <div class="d-flex gap-2 mt-3">
            <button type="button" class="btn btn-success" id="adaptive-pass-btn" onclick="markTestResult('adaptive', true)">
              <i class="fas fa-check me-1"></i><span class="ds-i18n">Pass</span>
            </button>
            <button type="button" class="btn btn-danger" id="adaptive-fail-btn" onclick="markTestResult('adaptive', false)">
              <i class="fas fa-times me-1"></i><span class="ds-i18n">Fail</span>
            </button>
          </div>
        `;
      case 'lights':
        return `
          <p class="ds-i18n">This test will cycle through red, green, and blue colors on the controller lightbar, animate the player indicator lights, and flash the mute button.</p>
          <p class="ds-i18n"><strong>Instructions:</strong> Watch the controller lights change colors, the player lights animate, and the mute button flash.</p>
          <div class="alert alert-info mb-3">
            <i class="fas fa-info-circle me-2"></i>
            <span class="ds-i18n">The lights will automatically cycle through colors and patterns until you mark the test as passed or failed.</span>
          </div>
          <div class="d-flex gap-2 mt-3">
            <button type="button" class="btn btn-success" id="lights-pass-btn" onclick="markTestResult('lights', true)">
              <i class="fas fa-check me-1"></i><span class="ds-i18n">Pass</span>
            </button>
            <button type="button" class="btn btn-danger" id="lights-fail-btn" onclick="markTestResult('lights', false)">
              <i class="fas fa-times me-1"></i><span class="ds-i18n">Fail</span>
            </button>
          </div>
        `;
      case 'speaker':
        return `
          <p class="ds-i18n">This test will play a tone through the controller's built-in speaker.</p>
          <p class="ds-i18n"><strong>Instructions:</strong> Listen for a tone from the controller speaker.</p>
          <div class="d-flex gap-2 mt-3">
            <button type="button" class="btn btn-success" id="speaker-pass-btn" onclick="markTestResult('speaker', true)">
              <i class="fas fa-check me-1"></i><span class="ds-i18n">Pass</span>
            </button>
            <button type="button" class="btn btn-danger" id="speaker-fail-btn" onclick="markTestResult('speaker', false)">
              <i class="fas fa-times me-1"></i><span class="ds-i18n">Fail</span>
            </button>
          </div>
        `;
      case 'microphone':
        return `
          <p class="ds-i18n">This test will monitor the controller's microphone input levels.</p>
          <p class="ds-i18n"><strong>Instructions:</strong> Blow gently into the controller's microphone. You should see the audio level indicator respond.</p>
          <div class="mb-3" id="mic-level-container" style="display: none;">
            <label class="form-label ds-i18n">Microphone Level:</label>
            <div class="progress">
              <div class="progress-bar bg-info" role="progressbar" id="mic-level-bar" style="width: 0%" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
            </div>
          </div>
          <div class="d-flex gap-2 mt-3">
            <button type="button" class="btn btn-success" id="microphone-pass-btn" onclick="markTestResult('microphone', true)">
              <i class="fas fa-check me-1"></i><span class="ds-i18n">Pass</span>
            </button>
            <button type="button" class="btn btn-danger" id="microphone-fail-btn" onclick="markTestResult('microphone', false)">
              <i class="fas fa-times me-1"></i><span class="ds-i18n">Fail</span>
            </button>
          </div>
        `;
      case 'headphone':
        return `
          <p class="ds-i18n">This test checks the headphone jack functionality.</p>
          <p class="ds-i18n"><strong>Instructions:</strong></p>
          <ol class="ds-i18n">
            <li>Plug in headphones to the 3.5mm jack</li>
            <li>Click "Test Speaker" to listen for the tone through the headphones</li>
          </ol>
          <div class="d-flex gap-2 mt-3">
            <button type="button" class="btn btn-primary" id="headphone-test-btn" onclick="testHeadphoneAudio()">
              <i class="fas fa-volume-up me-1"></i><span class="ds-i18n">Test Speaker</span>
            </button>
            <button type="button" class="btn btn-success" id="headphone-pass-btn" onclick="markTestResult('headphone', true)">
              <i class="fas fa-check me-1"></i><span class="ds-i18n">Pass</span>
            </button>
            <button type="button" class="btn btn-danger" id="headphone-fail-btn" onclick="markTestResult('headphone', false)">
              <i class="fas fa-times me-1"></i><span class="ds-i18n">Fail</span>
            </button>
          </div>
        `;
      default:
        return '';
    }
  }

  /**
   * Clear saved skipped tests from localStorage
   */
  _clearSkippedTestsFromStorage() {
    try {
      localStorage.removeItem('quickTestSkippedTests');
    } catch (error) {
      console.warn('Failed to clear skipped tests from localStorage:', error);
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

    if (activeTest === 'buttons') {
      $instructionsText.html(this.l('Test all buttons, or long-press <kbd>Square</kbd> to Pass and <kbd>Cross</kbd> to Fail, or <kbd>Circle</kbd> to skip.'));
    } else if (activeTest) {
      $instructionsText.html(this.l('Press <kbd>Square</kbd> to Pass, <kbd>Cross</kbd> to Fail, or <kbd>Circle</kbd> to skip.'));
    } else if (allTestsCompleted) {
      $instructionsText.html(this.l('Press <kbd>Circle</kbd> to close, or <kbd>Square</kbd> to start over'));
    } else {
      $instructionsText.html(this.l('Press <kbd>Square</kbd> to begin or <kbd>Circle</kbd> to close'));
    }
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

    let svgContent;

    // Check if we have bundled assets (production mode)
    if (window.BUNDLED_ASSETS && window.BUNDLED_ASSETS.svg && window.BUNDLED_ASSETS.svg['dualshock-controller.svg']) {
      svgContent = window.BUNDLED_ASSETS.svg['dualshock-controller.svg'];
    } else {
      // Fallback to fetching from server (development mode)
      const response = await fetch('assets/dualshock-controller.svg');
      if (!response.ok) {
        throw new Error('Failed to load controller SVG');
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

    ['qt-Button_outlines', 'qt-L3_outline', 'qt-R3_outline', 'qt-Trackpad_outline'].forEach(id => {
      const group = this._getQuickTestElement(id);
      this._setSvgGroupColor(group, midBlue);
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
      BUTTONS.forEach(button => {
        this.state.buttonPressCount[button] = 0;
      });
    }

    // Check for any buttons that are already stuck pressed when the test starts
    // and draw them as pressed
    BUTTONS.forEach(button => {
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
    const allPressed = BUTTONS.every(button => {
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
    BUTTONS.forEach(button => {
      this.state.buttonPressCount[button] = 0;
    });

    // Clear any active long-press timers
    this._clearAllLongPressTimers();

    // Reset all button colors to orange (initial state)
    this._resetButtonColors();

    // Check for any buttons that are already stuck pressed and draw them as pressed
    BUTTONS.forEach(button => {
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
    await this.controller.setVibration({ heavyLeft: 255, lightRight: 255, duration: 1000 });
    setTimeout(() => { this._stopIconAnimation('haptic'); }, 1000); }

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

    await this.controller.currentController.resetLights();
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
      $statusBadge.text(this.l('Passed'));
      $accordionItem.addClass('border-success');
      $accordionButton.css('backgroundColor', 'rgba(25, 135, 84, 0.1)'); // Light green background
    } else {
      $statusBadge.attr('class', 'badge bg-danger me-2');
      $statusBadge.text(this.l('Failed'));
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
  skipTest(testType) {
    // Add to skipped tests if not already there
    if (!this.state.skippedTests.includes(testType)) {
      this.state.skippedTests.push(testType);
    }

    // Save to localStorage
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

    this._updateSkippedTestsDropdown();
    this._updateTestSummary();
    this._expandNextTest(testType);
    this._updateInstructions();
  }

  /**
   * Add a test back from the skipped list
   */
  addTestBack(testType) {
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
      const testName = this.l(TEST_NAMES[testType]);
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

    TEST_SEQUENCE.forEach(test => {
      if (this.state[test] !== null) {
        completed++;
        if (this.state[test]) passed++;
      }
    });

    const numTests = TEST_SEQUENCE.length - skipped;
    const totalProcessed = completed + skipped;

    if (totalProcessed === 0) {
      $summary.text(this.l('No tests completed yet.'));
      $summary.attr('class', 'text-muted ds-i18n');
    } else {
      let summaryText = this.l(`${completed}/${numTests} tests completed. ${passed} passed, ${completed - passed} failed.`);
      if (skipped > 0) {
        summaryText += this.l(` ${skipped} skipped.`);
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
   * Handle controller input for test navigation and control
   */
  handleControllerInput(changes) {
    if(this.state.isTransitioning) return;

    const activeTest = this._getCurrentActiveTest();

    // If buttons test is active, track button presses
    if (activeTest === 'buttons') {
      this._trackButtonPresses(changes);
      return;
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
    BUTTONS.forEach(button => {
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
  _startTestSequence() {
    // First, reset all tests to ensure clean state
    this.resetAllTests();

    // After a short delay, start with the first non-skipped test
    setTimeout(() => {
      // Find the first test that is not skipped
      const firstAvailableTest = TEST_SEQUENCE.find(test => !this.state.skippedTests.includes(test));

      if (firstAvailableTest) {
        const $firstCollapse = $(`#${firstAvailableTest}-test-collapse`);
        bootstrap.Collapse.getOrCreateInstance($firstCollapse[0]).show();
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
    const previousIndex = currentIndex > 0 ? currentIndex - 1 : 0;
    if(previousIndex == currentIndex) return;

    const previousTest = TEST_SEQUENCE[previousIndex];

    // Collapse current test
    const $currentCollapse = $(`#${activeTest}-test-collapse`);
    bootstrap.Collapse.getInstance($currentCollapse[0])?.hide();


    // Expand previous test after a short delay
    setTimeout(() => {
      const $previousCollapse = $(`#${previousTest}-test-collapse`);
      bootstrap.Collapse.getOrCreateInstance($previousCollapse[0]).show();
    }, 300);
  }

  /**
   * Reset all tests to initial state
   */
  resetAllTests() {
    // Clear any active long-press timers before resetting state
    this._clearAllLongPressTimers();

    // Clean up any active tests BEFORE resetting state
    this._stopButtonsTest();
    this._stopAdaptiveTest();
    this._stopLightsTest();
    this._stopMicrophoneTest();

    // Reset state
    this._initializeState();

    // Load saved skipped tests from localStorage
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
      $statusBadge.text(this.l('Not tested'));
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
    this._applySkippedTestsToUI();

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
 * Update quick test button visibility based on controller type
 */
export function updateQuickTestButtonVisibility(controller) {
  const $button = $('#quick-test-btn');
  const model = controller?.getModel();
  const supported = (controller?.isConnected() && (model === "DS5" /* || model === "DS5_Edge" */));
  $button.toggleClass('disabled', !supported);
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
export function quicktest_handle_controller_input(changes) {
  if (currentQuickTestInstance && isQuickTestVisible()) {
    currentQuickTestInstance.handleControllerInput(changes);
  }
}

/**
 * Show the Quick Test modal (legacy function for backward compatibility)
 */
export async function show_quick_test_modal(controller, { l } = {}) {
  // Destroy any existing instance
  destroyCurrentInstance();

  // Create new instance
  currentQuickTestInstance = new QuickTestModal(controller, { l });
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

// Legacy compatibility - expose functions to window for HTML onclick handlers
window.markTestResult = markTestResult;
window.resetAllTests = resetAllTests;
window.resetButtonsTest = resetButtonsTest;
window.skipTest = skipTest;
window.addTestBack = addTestBack;
window.testHeadphoneAudio = testHeadphoneAudio;