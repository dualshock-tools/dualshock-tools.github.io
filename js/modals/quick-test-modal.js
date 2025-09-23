'use strict';

const ACCORDION_ELEMENTS = [
  'usb-test-collapse',
  'buttons-test-collapse',
  'haptic-test-collapse',
  'adaptive-test-collapse',
  'speaker-test-collapse',
  'microphone-test-collapse'
];

const TEST_SEQUENCE = ['usb', 'buttons', 'haptic', 'adaptive', 'speaker', 'microphone'];

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

    // Bind event handlers to maintain proper context
    this._boundAccordionShown = (event) => this._handleAccordionShown(event);
    this._boundAccordionHidden = (event) => this._handleAccordionHidden(event);
    this._boundModalHidden = () => {
      console.log("Quick Test modal hidden event triggered");
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
      speaker: null,
      microphone: null,
      microphoneStream: null,
      microphoneContext: null,
      microphoneMonitoring: false,
      buttonPressCount: {},
      longPressTimers: {},
      longPressThreshold: 400,
      isTransitioning: false,
    };
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
      $instructionsText.html(this.l('Test all buttons, or long-press <kbd>Square</kbd> to Pass and <kbd>Cross</kbd> to Fail'));
    } else if (activeTest) {
      $instructionsText.html(this.l('Press <kbd>Square</kbd> to Pass or <kbd>Cross</kbd> to Fail'));
    } else if (allTestsCompleted) {
      $instructionsText.html(this.l('Press <kbd>Circle</kbd> to close, or <kbd>Square</kbd> to start over'));
    } else {
      $instructionsText.html(this.l('Press <kbd>Square</kbd> to begin'));
    }
  }

  /**
   * Check if all tests have been completed
   */
  _areAllTestsCompleted() {
    return TEST_SEQUENCE.every(test => this.state[test] !== null);
  }

  /**
   * Initialize event listeners for the quick test modal
   */
  // Set up event listeners for accordion collapse events to auto-start tests
  _initEventListeners() {
    ACCORDION_ELEMENTS.forEach(elementId => {
      const $element = $(`#${elementId}`);
      if ($element.length) {
        $element.on('shown.bs.collapse', this._boundAccordionShown);
        $element.on('hidden.bs.collapse', this._boundAccordionHidden);
      }
    });

    $('#quickTestModal').on('hidden.bs.modal', this._boundModalHidden);
    $('#quickTestModal').on('shown.bs.modal', () => {
      this._updateInstructions();
    });
  }

  /**
   * Remove event listeners
   */
  removeEventListeners() {
    console.log("Removing event listeners");
    ACCORDION_ELEMENTS.forEach(elementId => {
      const $element = $(`#${elementId}`);
      if ($element.length) {
        $element.off('shown.bs.collapse', this._boundAccordionShown);
        $element.off('hidden.bs.collapse', this._boundAccordionHidden);
      }
    });

    $('#quickTestModal').off('hidden.bs.modal', this._boundModalHidden);
  }

  /**
   * Open the Quick Test modal
   */
  async open() {
    await this._initSvgController();
    bootstrap.Modal.getOrCreateInstance('#quickTestModal').show();
  }

  /**
   * Initialize SVG controller for the quick test modal
   */
  async _initSvgController() {
    const svgContainer = document.getElementById('quick-test-controller-svg-placeholder');
    if (!svgContainer) {
      console.warn('Quick test SVG container not found');
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
        case 'speaker':
          this._startSpeakerTest();
          break;
        case 'microphone':
          this._startMicrophoneTest();
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
      case 'microphone':
        this._stopMicrophoneTest();
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
      let color;
      // Special buttons (create, options, mute, ps) go straight to green on first press
      if (['create', 'options', 'mute', 'ps'].includes(button)) {
        color = ['orange'][count] || '#16c016ff';
      } else {
        // Other buttons follow the 3-press sequence
        color = ['orange', '#a5c9fcff', '#287ffaff'][count] || '#16c016ff';
      }
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
      const isSpecialButton = ['create', 'options', 'mute', 'ps'].includes(button);
      return isSpecialButton ? count >= 1 : count >= 3;
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
   * Update test summary display
   */
  _updateTestSummary() {
    const $summary = $('#test-summary');

    let completed = 0;
    let passed = 0;

    TEST_SEQUENCE.forEach(test => {
      if (this.state[test] !== null) {
        completed++;
        if (this.state[test]) passed++;
      }
    });

    const numTests = TEST_SEQUENCE.length;
    if (completed === 0) {
      $summary.text(this.l('No tests completed yet.'));
      $summary.attr('class', 'text-muted ds-i18n');
    } else {
      $summary.text(this.l(`${completed}/${numTests} tests completed. ${passed} passed, ${completed - passed} failed.`));
      $summary.attr('class', completed === numTests ? 'text-success' : 'text-info');
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

    // Find next untested item
    for (let i = currentIndex + 1; i < TEST_SEQUENCE.length; i++) {
      const nextTest = TEST_SEQUENCE[i];
      if (this.state[nextTest] === null) {
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
      handleButtonPress(() => bootstrap.Modal.getOrCreateInstance('#quickTestModal').hide());
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
      const handleLongpress = ['cross', 'square', 'triangle'].includes(button);
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

    // After a short delay, start with the first test
    setTimeout(() => {
      const [firstTest] = TEST_SEQUENCE;
      const $firstCollapse = $(`#${firstTest}-test-collapse`);
      bootstrap.Collapse.getOrCreateInstance($firstCollapse[0]).show();
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
    // Reset state
    this._initializeState();

    // Clear any active long-press timers before resetting state
    this._clearAllLongPressTimers();

    // Clean up any active tests
    this._stopButtonsTest();
    this._stopAdaptiveTest();
    this._stopMicrophoneTest();

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

      if (test === 'microphone') {
        const $levelContainer = $('#mic-level-container');
        $levelContainer.hide();
      }
    });

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
  const supported = (controller?.isConnected() && (model === "DS5" || model === "DS5_Edge"));
  $button.css('display', supported ? 'block' : 'none');
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

// Legacy function exports for backward compatibility (used by HTML onclick handlers)
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

// Legacy compatibility - expose functions to window for HTML onclick handlers
window.markTestResult = markTestResult;
window.resetAllTests = resetAllTests;
window.resetButtonsTest = resetButtonsTest;