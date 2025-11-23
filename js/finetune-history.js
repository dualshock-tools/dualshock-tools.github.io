'use strict';

import { Storage } from './storage.js';

const MAX_HISTORY_ENTRIES_PER_CONTROLLER = 10;

/**
 * Manages finetune parameter history for DS5 and Edge controllers
 * Stores entries per controller identified by serial number
 */
export class FinetuneHistory {
  /**
   * Save current finetune settings for a controller
   * @param {Array} finetuneData - Array of 12 finetune values
   * @param {string} controllerSerialNumber - Serial number of the controller
   * @returns {string} The ID of the saved entry
   */
  static save(finetuneData, controllerSerialNumber) {
    if (!Array.isArray(finetuneData) || finetuneData.length !== 12) {
      throw new Error(`Finetune data must be an array of 12 values, got "${finetuneData}"`);
    }

    if (!controllerSerialNumber || typeof controllerSerialNumber !== 'string') {
      throw new Error('Controller serial number is required');
    }

    const allHistory = this._getAllHistory();
    const controllerHistory = allHistory[controllerSerialNumber] || [];

    // Check if the most recent entry has the same data
    if (controllerHistory.length > 0 && this._dataEquals(controllerHistory[0].data, finetuneData)) {
      // Update the timestamp of the existing entry
      controllerHistory[0].timestamp = Date.now();
      allHistory[controllerSerialNumber] = controllerHistory;
      this._saveAllHistory(allHistory);
      return controllerHistory[0].id;
    }

    const entry = {
      id: this._generateId(),
      timestamp: Date.now(),
      data: finetuneData
    };

    controllerHistory.unshift(entry);

    // Keep only the latest MAX_HISTORY_ENTRIES_PER_CONTROLLER for this controller
    if (controllerHistory.length > MAX_HISTORY_ENTRIES_PER_CONTROLLER) {
      controllerHistory.pop();
    }

    allHistory[controllerSerialNumber] = controllerHistory;
    this._saveAllHistory(allHistory);
    return entry.id;
  }

  /**
   * Get all saved finetune settings for a specific controller
   * @param {string} controllerSerialNumber - Serial number of the controller
   * @returns {Array} Array of saved settings entries for the controller
   */
  static getAll(controllerSerialNumber) {
    if (!controllerSerialNumber || typeof controllerSerialNumber !== 'string') {
      return [];
    }

    const allHistory = this._getAllHistory();
    return allHistory[controllerSerialNumber] || [];
  }

  /**
   * Get finetune settings by ID
   * @param {string} id - Entry ID
   * @param {string} controllerSerialNumber - Serial number of the controller
   * @returns {Object|null} Entry object or null if not found
   */
  static getById(id, controllerSerialNumber) {
    if (!controllerSerialNumber || typeof controllerSerialNumber !== 'string') {
      return null;
    }

    const history = this.getAll(controllerSerialNumber);
    return history.find(entry => entry.id === id) || null;
  }

  /**
   * Delete a saved entry
   * @param {string} id - Entry ID
   * @param {string} controllerSerialNumber - Serial number of the controller
   * @returns {boolean} True if deleted, false if not found
   */
  static delete(id, controllerSerialNumber) {
    if (!controllerSerialNumber || typeof controllerSerialNumber !== 'string') {
      return false;
    }

    const allHistory = this._getAllHistory();
    const controllerHistory = allHistory[controllerSerialNumber] || [];
    const index = controllerHistory.findIndex(entry => entry.id === id);

    if (index >= 0) {
      controllerHistory.splice(index, 1);
      allHistory[controllerSerialNumber] = controllerHistory;
      this._saveAllHistory(allHistory);
      return true;
    }
    return false;
  }

  /**
   * Clear all saved finetune settings for a specific controller
   * @param {string} controllerSerialNumber - Serial number of the controller
   */
  static clearAll(controllerSerialNumber) {
    if (!controllerSerialNumber || typeof controllerSerialNumber !== 'string') {
      return;
    }

    const allHistory = this._getAllHistory();
    delete allHistory[controllerSerialNumber];
    this._saveAllHistory(allHistory);
  }

  /**
   * Get finetune data from a specific entry
   * @param {string} id - Entry ID
   * @param {string} controllerSerialNumber - Serial number of the controller
   * @returns {Array|null} Finetune data array or null if not found
   */
  static getDataById(id, controllerSerialNumber) {
    const entry = this.getById(id, controllerSerialNumber);
    return entry ? entry.data : null;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Get all history from storage (for all controllers)
   * @private
   */
  static _getAllHistory() {
    try {
      return Storage.finetuneHistory.getAll();
    } catch (e) {
      console.error('Failed to parse finetune history:', e);
      return {};
    }
  }

  /**
   * Save all history to storage
   * @private
   */
  static _saveAllHistory(allHistory) {
    try {
      Storage.finetuneHistory.setAll(allHistory);
    } catch (e) {
      console.error('Failed to save finetune history:', e);
    }
  }

  /**
   * Generate unique ID
   * @private
   */
  static _generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Compare two data arrays for equality
   * @private
   */
  static _dataEquals(data1, data2) {
    if (!Array.isArray(data1) || !Array.isArray(data2)) {
      return false;
    }
    if (data1.length !== data2.length) {
      return false;
    }
    return data1.every((val, idx) => val === data2[idx]);
  }
}