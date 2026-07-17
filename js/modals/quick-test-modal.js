'use strict';

import { l } from '../translations.js';
import { la } from '../utils.js';
import { Storage } from '../storage.js';
import { addIcons } from './quick-test/utils.js';
import { UsbTest } from './quick-test/usb-test.js';
import { ButtonsTest } from './quick-test/buttons-test.js';
import { TrackpadTest } from './quick-test/trackpad-test.js';
import { ImuTest } from './quick-test/imu-test.js';
import { AdaptiveTest } from './quick-test/adaptive-test.js';
import { HapticTest } from './quick-test/haptic-test.js';
import { LightsTest } from './quick-test/lights-test.js';
import { SpeakerTest } from './quick-test/speaker-test.js';
import { HeadphoneTest } from './quick-test/headphone-test.js';
import { MicrophoneTest } from './quick-test/microphone-test.js';

// One class per test, in accordion/sequence order. Each defines its id,
// name, icon and content, plus optional init/start/stop/reset/handleInput
// hooks - see the classes for the contract.
const TEST_CLASSES = [
  UsbTest,
  ButtonsTest,
  TrackpadTest,
  ImuTest,
  AdaptiveTest,
  HapticTest,
  LightsTest,
  SpeakerTest,
  HeadphoneTest,
  MicrophoneTest,
];

const TEST_SEQUENCE = TEST_CLASSES.map(cls => cls.id);

/**
 * Quick Test Modal: hosts the individual test modules in an accordion,
 * owns the test sequence, results, navigation and skip management
 */
export class QuickTestModal {
  constructor(controllerInstance) {
    this.controller = controllerInstance;

    // Instantiate one test object per test type
    this.tests = {};
    TEST_CLASSES.forEach(cls => {
      this.tests[cls.id] = new cls(this);
    });

    this.resetAllTests();

    this._loadSkippedTestsFromStorage();

    // Bind event handlers to maintain proper context
    this._boundAccordionShown = (event) => this._handleAccordionShown(event);
    this._boundAccordionHidden = (event) => this._handleAccordionHidden(event);
    this._boundModalHidden = () => {
      // Clean up any active tests BEFORE destroying the instance
      TEST_SEQUENCE.forEach(testType => this.tests[testType].stop?.());

      destroyCurrentInstance();
    };

    this._initEventListeners();
  }

  _initializeState() {
    this.state = {
      isTransitioning: false,
      skippedTests: [],
      batteryAlertShown: false,
    };
    TEST_SEQUENCE.forEach(testType => {
      this.state[testType] = null;
    });
  }

  // ---------------------------------------------------------------------
  // Host API used by the test modules
  // ---------------------------------------------------------------------

  /**
   * Start icon animation for a specific test type
   */
  startIconAnimation(testType) {
    const $accordionItem = $(`#${testType}-test-item`);
    const $icon = $accordionItem.find('.accordion-button i');
    $icon.addClass(`test-icon-${testType}`);
  }

  /**
   * Stop icon animation for a specific test type
   */
  stopIconAnimation(testType) {
    const $accordionItem = $(`#${testType}-test-item`);
    const $icon = $accordionItem.find('.accordion-button i');
    $icon.removeClass(`test-icon-${testType}`);
  }

  /**
   * Whether a controller-driven transition is currently being debounced
   */
  isTransitioning() {
    return this.state.isTransitioning;
  }

  /**
   * Set transitioning state to prevent rapid button presses
   */
  setTransitioning() {
    this.state.isTransitioning = true;
    setTimeout(() => {
      this.state.isTransitioning = false;
    }, 750);
  }

  /**
   * Get the currently active (expanded) test type
   */
  getCurrentActiveTest() {
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
   * Expand the next untested item
   */
  expandNextTest(currentTest) {
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
   * Move to the previous test in the sequence
   */
  moveToPreviousTest() {
    const activeTest = this.getCurrentActiveTest();
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
   * Mark test result and update UI
   */
  markTestResult(testType, passed) {
    this.state[testType] = passed;

    this.stopIconAnimation(testType);

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

    // Clean up tests that keep hardware or system resources active
    if (testType === 'adaptive' || testType === 'microphone') {
      this.tests[testType].stop?.();
    }

    this._updateTestSummary();

    // Auto-expand next test
    this.expandNextTest(testType);
  }

  // ---------------------------------------------------------------------
  // Skipped tests
  // ---------------------------------------------------------------------

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
    this.stopIconAnimation(testType);
    this.tests[testType].stop?.();

    // Rebuild the accordion without the skipped test
    await this._applySkippedTestsToUI();

    this._updateTestSummary();
    this.expandNextTest(testType);
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
    await this._applySkippedTestsToUI();

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
      const testName = l(this.tests[testType].constructor.testName);
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

  // ---------------------------------------------------------------------
  // Accordion construction
  // ---------------------------------------------------------------------

  /**
   * The tests currently shown in the accordion: supported by the connected
   * controller and not skipped, in sequence order
   */
  _getActiveTests() {
    const supportedTests = this.controller.getSupportedQuickTests();
    return TEST_SEQUENCE.filter(testType =>
      !this.state.skippedTests.includes(testType) && supportedTests.includes(testType)
    );
  }

  /**
   * Rebuild the accordion with the active tests and re-run their DOM setup
   */
  async _applySkippedTestsToUI() {
    this._buildDynamicAccordion();
    await this._initTests();
    this._updateSkippedTestsDropdown();
  }

  /**
   * Build dynamic accordion with only the active tests
   */
  _buildDynamicAccordion() {
    const $accordion = $('#quickTestAccordion');
    $accordion.empty();

    this._getActiveTests().forEach(testType => {
      const accordionItem = this._createAccordionItem(testType);
      $accordion.append(accordionItem);
    });

    // Re-initialize event listeners for the new accordion items
    this._initEventListeners();
  }

  /**
   * Give each active test a chance to set up its DOM after the accordion
   * is (re)built - e.g. the buttons test loads the controller SVG
   */
  async _initTests() {
    for (const testType of this._getActiveTests()) {
      await this.tests[testType].init?.();
    }
  }

  /**
   * Create an accordion item for a specific test type
   */
  _createAccordionItem(testType) {
    const cls = this.tests[testType].constructor;
    const testName = l(cls.testName);

    const testContent = this.tests[testType].content();

    const notTested = l('Not tested');
    const hide = l('hide');
    return $(`
      <div class="accordion-item" id="${testType}-test-item">
        <h2 class="accordion-header">
          <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${testType}-test-collapse" aria-expanded="false" aria-controls="${testType}-test-collapse">
            <div class="d-flex align-items-center w-100">
              <i class="${cls.icon} me-3 test-icon-${testType}"></i>
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

  // ---------------------------------------------------------------------
  // Event listeners
  // ---------------------------------------------------------------------

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
      this.tests[testType]?.start?.();
    }, 100);
  }

  /**
   * Handle accordion section being hidden (collapsed)
   */
  _handleAccordionHidden(event) {
    const collapseId = event.target.id;
    const testType = collapseId.replace('-test-collapse', '');

    // Stop ongoing tests when section is collapsed
    this.tests[testType]?.stop?.();

    // Update instructions when a test is collapsed
    setTimeout(() => {
      this._updateInstructions();
    }, 300);
  }

  // ---------------------------------------------------------------------
  // Opening, input handling, sequence control
  // ---------------------------------------------------------------------

  /**
   * Open the Quick Test modal
   */
  async open() {
    la("quick_test_modal_open");

    // Build the dynamic accordion first
    this._buildDynamicAccordion();
    await this._initTests();
    bootstrap.Modal.getOrCreateInstance('#quickTestModal').show();
  }

  /**
   * Handle controller input for test navigation and control
   */
  handleControllerInput(changes, batteryStatus, touchPoints) {
    if (this.state.isTransitioning) return;

    // Check battery status and show/hide warning if charge is 5% or less
    if (batteryStatus) {
      // Only update visibility if alert hasn't been shown or charge level changed
      if (!this.state.batteryAlertShown || batteryStatus.changed) {
        console.log("Battery status changed:", batteryStatus);
        const { charge_level, is_error } = batteryStatus;
        const $batteryWarning = $('#battery-warning-alert');
        $batteryWarning.toggle(charge_level <= 5 || is_error);
        this.state.batteryAlertShown = true;
      }
    }

    const activeTest = this.getCurrentActiveTest();
    const test = activeTest ? this.tests[activeTest] : null;

    // Tests that capture input (the buttons test) consume everything;
    // the others just observe the samples while navigation stays active
    if (test?.constructor.capturesInput) {
      test.handleInput(changes, touchPoints);
      return;
    }
    test?.handleInput?.(changes, touchPoints);

    // Helper function to handle button press with transition
    const handleButtonPress = (action) => {
      this.setTransitioning();
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
      handleButtonPress(() => this.moveToPreviousTest());
    } else if (changes.circle === true) {
      handleButtonPress(() => {
        if (activeTest) {
          // Skip the current test by expanding the next one
          this.expandNextTest(activeTest);
        } else {
          // Close the modal if no test is active
          bootstrap.Modal.getOrCreateInstance('#quickTestModal').hide();
        }
      });
    }
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
   * Reset all tests to initial state
   */
  async resetAllTests() {
    // Stop and reset every test's own state (timers, monitors, streams)
    TEST_SEQUENCE.forEach(testType => {
      this.tests[testType].stop?.();
      this.tests[testType].reset?.();
    });

    // Reset state
    this._initializeState();

    // Load saved skipped tests from storage
    this._loadSkippedTestsFromStorage();

    // Reset UI
    TEST_SEQUENCE.forEach(test => {
      this.stopIconAnimation(test);

      const $statusBadge = $(`#${test}-test-status`);
      const $accordionItem = $(`#${test}-test-item`);
      const $accordionButton = $accordionItem.find('.accordion-button');

      $statusBadge.attr('class', 'badge bg-secondary me-2');
      $statusBadge.text(l('Not tested'));
      $accordionItem.removeClass('border-success border-danger');
      $accordionButton.css('backgroundColor', ''); // Clear background color

      // Show all test items initially
      $accordionItem.show();
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

  // ---------------------------------------------------------------------
  // Instructions and summary
  // ---------------------------------------------------------------------

  /**
   * Update the instruction text based on current test state
   */
  _updateInstructions() {
    const $instructionsText = $('#quick-test-instructions-text');
    const activeTest = this.getCurrentActiveTest();
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
   * Check if the given test is the first test in the sequence (excluding skipped tests)
   */
  _isFirstTest(testType) {
    // Get the first non-skipped test
    const firstTest = TEST_SEQUENCE.find(test => !this.state.skippedTests.includes(test));
    return testType === firstTest;
  }

  /**
   * Update test summary display
   */
  _updateTestSummary() {
    const $summary = $('#test-summary');

    let completed = 0;
    let passed = 0;
    let skipped = this.state.skippedTests.length;

    const activeTests = this._getActiveTests();

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
export function quicktest_handle_controller_input(changes, batteryStatus, touchPoints) {
  if (currentQuickTestInstance && isQuickTestVisible()) {
    currentQuickTestInstance.handleControllerInput(changes, batteryStatus, touchPoints);
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

/**
 * Invoke an action on a test module from an onclick handler in its content,
 * e.g. quickTestAction('imu', 'reset') or quickTestAction('haptic', 'start')
 */
function quickTestAction(testType, action) {
  currentQuickTestInstance?.tests[testType]?.[action]?.();
}

// Expose functions to window for the HTML onclick handlers
window.markTestResult = markTestResult;
window.resetAllTests = resetAllTests;
window.skipTest = skipTest;
window.addTestBack = addTestBack;
window.quickTestAction = quickTestAction;
