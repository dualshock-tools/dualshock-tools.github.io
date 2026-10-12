'use strict';

import type { FinetuneHistoryEntry } from './finetune-history.js';

export interface LastConnectedInfo {
  deviceName: string;
  timestamp: string;
  serialNumber: string | null;
  boardModel?: string;
  color?: string;
}

export type Theme = 'light' | 'dark';

/** Fine-tune history entries, newest first, keyed by controller serial number. */
export type FinetuneHistoryStore = Record<string, FinetuneHistoryEntry[]>;

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
    PREFERRED_THEME: 'preferredTheme',
  },

  getChangesStorageKey(serialNumber: string | null | undefined): string | null {
    if (!serialNumber) return null;
    return `changes_${serialNumber}`;
  },

  setString(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`Failed to save to localStorage (${key}):`, e);
    }
  },

  getString(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn(`Failed to read from localStorage (${key}):`, e);
      return null;
    }
  },

  setObject(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`Failed to save object to localStorage (${key}):`, e);
    }
  },

  getObject<T>(key: string): T | null {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (e) {
      console.warn(`Failed to read object from localStorage (${key}):`, e);
      return null;
    }
  },

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`Failed to remove from localStorage (${key}):`, e);
    }
  },

  setBoolean(key: string, value: boolean): void {
    this.setString(key, value.toString());
  },

  getBoolean(key: string, defaultValue = false): boolean {
    const value = this.getString(key);
    return value !== null ? value === 'true' : defaultValue;
  },

  setNumber(key: string, value: number): void {
    this.setString(key, value.toString());
  },

  getNumber(key: string, defaultValue = 0): number {
    const value = this.getString(key);
    return value !== null ? parseInt(value, 10) : defaultValue;
  },

  lastConnectedController: {
    set(info: LastConnectedInfo): void {
      Storage.setObject(Storage.STORAGE_KEYS.LAST_CONNECTED_CONTROLLER, info);
    },

    get() {
      return Storage.getObject<LastConnectedInfo>(Storage.STORAGE_KEYS.LAST_CONNECTED_CONTROLLER);
    },

    clear() {
      Storage.removeItem(Storage.STORAGE_KEYS.LAST_CONNECTED_CONTROLLER);
    },
  },

  edgeModalDontShowAgain: {
    set(value: boolean): void {
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
    set(count: number): void {
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
    set(method: string): void {
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
    set(method: string): void {
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
    set(tests: string[]): void {
      Storage.setObject(Storage.STORAGE_KEYS.QUICK_TEST_SKIPPED_TESTS, tests);
    },

    get() {
      return Storage.getObject<string[]>(Storage.STORAGE_KEYS.QUICK_TEST_SKIPPED_TESTS) || [];
    },

    clear() {
      Storage.removeItem(Storage.STORAGE_KEYS.QUICK_TEST_SKIPPED_TESTS);
    },
  },

  showRawNumbersCheckbox: {
    set(value: boolean): void {
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
    set(value: number): void {
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
    set(value: number): void {
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
    set(serialNumber: string | null | undefined, hasChanges: boolean): void {
      const key = Storage.getChangesStorageKey(serialNumber);
      if (key) {
        Storage.setObject(key, hasChanges);
      }
    },

    get(serialNumber: string | null | undefined): boolean {
      const key = Storage.getChangesStorageKey(serialNumber);
      if (!key) return false;
      return Storage.getObject<boolean>(key) || false;
    },

    clear(serialNumber: string | null | undefined): void {
      const key = Storage.getChangesStorageKey(serialNumber);
      if (key) {
        Storage.removeItem(key);
      }
    },
  },

  finetuneHistory: {
    getAll() {
      return Storage.getObject<FinetuneHistoryStore>(Storage.STORAGE_KEYS.FINETUNE_HISTORY) || {};
    },

    setAll(history: FinetuneHistoryStore): void {
      Storage.setObject(Storage.STORAGE_KEYS.FINETUNE_HISTORY, history);
    },

    clear() {
      Storage.removeItem(Storage.STORAGE_KEYS.FINETUNE_HISTORY);
    },
  },

  preferredTheme: {
    set(theme: Theme): void {
      Storage.setString(Storage.STORAGE_KEYS.PREFERRED_THEME, theme);
    },

    get() {
      return Storage.getString(Storage.STORAGE_KEYS.PREFERRED_THEME) as Theme | null;
    },

    clear() {
      Storage.removeItem(Storage.STORAGE_KEYS.PREFERRED_THEME);
    }
  }
};
