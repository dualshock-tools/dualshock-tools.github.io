'use strict';

export const Storage = {
  STORAGE_KEYS: {
    LAST_CONNECTED_CONTROLLER: 'lastConnectedController',
    EDGE_MODAL_DONT_SHOW_AGAIN: 'edgeModalDontShowAgain',
    FAILED_CALIBRATION_COUNT: 'failedCalibrationCount',
    CENTER_CALIBRATION_METHOD: 'centerCalibrationMethod',
    RANGE_CALIBRATION_METHOD: 'rangeCalibrationMethod',
    QUICK_TEST_SKIPPED_TESTS: 'quickTestSkippedTests',
    SHOW_RAW_NUMBERS_CHECKBOX: 'showRawNumbersCheckbox',
    FINETUNE_CENTER_STEP_SIZE: 'finetuneCenterStepSize',
    FINETUNE_CIRCULARITY_STEP_SIZE: 'finetuneCircularityStepSize',
    FINETUNE_HISTORY: 'finetuneHistory',
  },

  getChangesStorageKey(serialNumber) {
    if (!serialNumber) return null;
    return `changes_${serialNumber}`;
  },

  setString(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`Failed to save to localStorage (${key}):`, e);
    }
  },

  getString(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn(`Failed to read from localStorage (${key}):`, e);
      return null;
    }
  },

  setObject(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`Failed to save object to localStorage (${key}):`, e);
    }
  },

  getObject(key) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (e) {
      console.warn(`Failed to read object from localStorage (${key}):`, e);
      return null;
    }
  },

  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`Failed to remove from localStorage (${key}):`, e);
    }
  },

  setBoolean(key, value) {
    this.setString(key, value.toString());
  },

  getBoolean(key, defaultValue = false) {
    const value = this.getString(key);
    return value !== null ? value === 'true' : defaultValue;
  },

  setNumber(key, value) {
    this.setString(key, value.toString());
  },

  getNumber(key, defaultValue = 0) {
    const value = this.getString(key);
    return value !== null ? parseInt(value, 10) : defaultValue;
  },

  lastConnectedController: {
    set(info) {
      Storage.setObject(Storage.STORAGE_KEYS.LAST_CONNECTED_CONTROLLER, info);
    },

    get() {
      return Storage.getObject(Storage.STORAGE_KEYS.LAST_CONNECTED_CONTROLLER);
    },

    clear() {
      Storage.removeItem(Storage.STORAGE_KEYS.LAST_CONNECTED_CONTROLLER);
    },
  },

  edgeModalDontShowAgain: {
    set(value) {
      Storage.setBoolean(Storage.STORAGE_KEYS.EDGE_MODAL_DONT_SHOW_AGAIN, value);
    },

    get() {
      return Storage.getBoolean(Storage.STORAGE_KEYS.EDGE_MODAL_DONT_SHOW_AGAIN);
    },

    clear() {
      Storage.removeItem(Storage.STORAGE_KEYS.EDGE_MODAL_DONT_SHOW_AGAIN);
    },
  },

  failedCalibrationCount: {
    set(count) {
      Storage.setNumber(Storage.STORAGE_KEYS.FAILED_CALIBRATION_COUNT, count);
    },

    get() {
      return Storage.getNumber(Storage.STORAGE_KEYS.FAILED_CALIBRATION_COUNT, 0);
    },

    clear() {
      Storage.removeItem(Storage.STORAGE_KEYS.FAILED_CALIBRATION_COUNT);
    },
  },

  centerCalibrationMethod: {
    set(method) {
      Storage.setString(Storage.STORAGE_KEYS.CENTER_CALIBRATION_METHOD, method);
    },

    get(defaultValue = 'four-step') {
      return Storage.getString(Storage.STORAGE_KEYS.CENTER_CALIBRATION_METHOD) || defaultValue;
    },

    clear() {
      Storage.removeItem(Storage.STORAGE_KEYS.CENTER_CALIBRATION_METHOD);
    },
  },

  rangeCalibrationMethod: {
    set(method) {
      Storage.setString(Storage.STORAGE_KEYS.RANGE_CALIBRATION_METHOD, method);
    },

    get(defaultValue = 'normal') {
      return Storage.getString(Storage.STORAGE_KEYS.RANGE_CALIBRATION_METHOD) || defaultValue;
    },

    clear() {
      Storage.removeItem(Storage.STORAGE_KEYS.RANGE_CALIBRATION_METHOD);
    },
  },

  quickTestSkippedTests: {
    set(tests) {
      Storage.setObject(Storage.STORAGE_KEYS.QUICK_TEST_SKIPPED_TESTS, tests);
    },

    get() {
      return Storage.getObject(Storage.STORAGE_KEYS.QUICK_TEST_SKIPPED_TESTS) || [];
    },

    clear() {
      Storage.removeItem(Storage.STORAGE_KEYS.QUICK_TEST_SKIPPED_TESTS);
    },
  },

  showRawNumbersCheckbox: {
    set(value) {
      Storage.setString(Storage.STORAGE_KEYS.SHOW_RAW_NUMBERS_CHECKBOX, value.toString());
    },

    get() {
      const value = Storage.getString(Storage.STORAGE_KEYS.SHOW_RAW_NUMBERS_CHECKBOX);
      return value === 'true';
    },

    clear() {
      Storage.removeItem(Storage.STORAGE_KEYS.SHOW_RAW_NUMBERS_CHECKBOX);
    },
  },

  finetuneCenterStepSize: {
    set(value) {
      Storage.setString(Storage.STORAGE_KEYS.FINETUNE_CENTER_STEP_SIZE, value.toString());
    },

    get() {
      return Storage.getString(Storage.STORAGE_KEYS.FINETUNE_CENTER_STEP_SIZE);
    },

    clear() {
      Storage.removeItem(Storage.STORAGE_KEYS.FINETUNE_CENTER_STEP_SIZE);
    },
  },

  finetuneCircularityStepSize: {
    set(value) {
      Storage.setString(Storage.STORAGE_KEYS.FINETUNE_CIRCULARITY_STEP_SIZE, value.toString());
    },

    get() {
      return Storage.getString(Storage.STORAGE_KEYS.FINETUNE_CIRCULARITY_STEP_SIZE);
    },

    clear() {
      Storage.removeItem(Storage.STORAGE_KEYS.FINETUNE_CIRCULARITY_STEP_SIZE);
    },
  },

  hasChangesState: {
    set(serialNumber, hasChanges) {
      const key = Storage.getChangesStorageKey(serialNumber);
      if (key) {
        Storage.setObject(key, hasChanges);
      }
    },

    get(serialNumber) {
      const key = Storage.getChangesStorageKey(serialNumber);
      if (!key) return false;
      return Storage.getObject(key) || false;
    },

    clear(serialNumber) {
      const key = Storage.getChangesStorageKey(serialNumber);
      if (key) {
        Storage.removeItem(key);
      }
    },
  },

  finetuneHistory: {
    getAll() {
      return Storage.getObject(Storage.STORAGE_KEYS.FINETUNE_HISTORY) || {};
    },

    setAll(history) {
      Storage.setObject(Storage.STORAGE_KEYS.FINETUNE_HISTORY, history);
    },

    clear() {
      Storage.removeItem(Storage.STORAGE_KEYS.FINETUNE_HISTORY);
    },
  },
};
