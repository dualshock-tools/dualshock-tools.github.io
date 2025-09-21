'use strict';

const ACCORDION_ELEMENTS = [
  'usb-test-collapse',
  'haptic-test-collapse',
  'adaptive-test-collapse',
  'speaker-test-collapse',
  'microphone-test-collapse'
];

const TEST_SEQUENCE = ['usb', 'haptic', 'adaptive', 'speaker', 'microphone'];

/**
 * Quick Test Modal Class
 * Handles controller feature testing including haptic feedback, adaptive triggers, speaker, and microphone functionality
 */
export class QuickTestModal {
  constructor(controllerInstance, { l }) {
    this.controller = controllerInstance;
    this.l = l;

    // Test state
    this.state = {
      haptic: null,
      adaptive: null,
      speaker: null,
      microphone: null,
      microphoneStream: null,
      microphoneContext: null,
      microphoneMonitoring: false
    };

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

    if (activeTest) {
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
  open() {
    bootstrap.Modal.getOrCreateInstance('#quickTestModal').show();
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
    await this.controller.setSpeakerTone(100);
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

    if (completed === 0) {
      $summary.text(this.l('No tests completed yet.'));
      $summary.attr('class', 'text-muted ds-i18n');
    } else {
      $summary.text(this.l(`${completed}/4 tests completed. ${passed} passed, ${completed - passed} failed.`));
      $summary.attr('class', completed === 4 ? 'text-success' : 'text-info');
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
    const activeTest = this._getCurrentActiveTest();

    // Handle Cross button (Start test sequence OR mark test as passed)
    if (changes.square === true) {
      if (!activeTest) {
        this._startTestSequence();
      } else {
        this.markTestResult(activeTest, true);
      }
    }

    // Handle Square button (Pass)
    if (activeTest && changes.cross === true) {
      this.markTestResult(activeTest, false);
    }

    // Handle Triangle button (Move to previous test)
    if (changes.triangle === true) {
      this._moveToPreviousTest();
    }

    // Handle Circle button (Close the modal)
    if (changes.circle === true) {
      bootstrap.Modal.getOrCreateInstance('#quickTestModal').hide();
    }
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
    this.state = {
      haptic: null,
      adaptive: null,
      speaker: null,
      microphone: null,
      microphoneStream: null,
      microphoneContext: null,
      microphoneMonitoring: false
    };

    // Clean up any active tests
    this._stopAdaptiveTest();
    this._stopMicrophoneTest();

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
export function show_quick_test_modal(controller, { l } = {}) {
  // Destroy any existing instance
  destroyCurrentInstance();

  // Create new instance
  currentQuickTestInstance = new QuickTestModal(controller, { l });
  currentQuickTestInstance.open();
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

// Legacy compatibility - expose functions to window for HTML onclick handlers
window.markTestResult = markTestResult;
window.resetAllTests = resetAllTests;