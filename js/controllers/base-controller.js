'use strict';

/**
* Base Controller class that provides common functionality for all controller types
*/
class BaseController {
  constructor(device, uiDependencies = {}) {
    this.device = device;
    this.model = "undefined"; // to be set by subclasses
    this.finetuneMaxValue; // to be set by subclasses

    // UI dependencies injected from core
    this.l = uiDependencies.l;
  }

  getModel() {
    return this.model;
  }

  /**
  * Get the underlying HID device
  * @returns {HIDDevice} The HID device
  */
  getDevice() {
    return this.device;
  }

  getInputConfig() {
    throw new Error('getInputConfig() must be implemented by subclass');
  }

  /**
   * Get the maximum value for finetune data
   * @returns {number} Maximum value for finetune adjustments
   */
  getFinetuneMaxValue() {
    if(!this.finetuneMaxValue) throw new Error('getFinetuneMaxValue() must be implemented by subclass');
    return this.finetuneMaxValue;
  }

  /**
  * Set input report handler
  * @param {Function} handler Input report handler function
  */
  setInputReportHandler(handler) {
    this.device.oninputreport = handler;
  }

  /**
  * Allocate request buffer with proper size based on device feature reports
  * @param {number} id Report ID
  * @param {Array} data Data array to include in the request
  * @returns {Uint8Array} Allocated request buffer
  */
  alloc_req(id, data = []) {
    const fr = this.device.collections[0].featureReports;
    const [report] = fr.find(e => e.reportId === id)?.items || [];
    const maxLen = report?.reportCount || data.length;

    const len = Math.min(data.length, maxLen);
    const out = new Uint8Array(maxLen);
    out.set(data.slice(0, len));
    return out;
  }

  /**
  * Send feature report to device
  * @param {number} reportId Report ID
  * @param {ArrayBuffer|Array} data Data to send (if Array, will be processed through allocReq)
  */
  async sendFeatureReport(reportId, data) {
    // If data is an array, use allocReq to create proper buffer
    if (Array.isArray(data)) {
      data = this.alloc_req(reportId, data);
    }

    try {
      return await this.device.sendFeatureReport(reportId, data);
    } catch (error) {
      // HID doesn't throw proper Errors with stack (stack is "name: message") so generate a new stack here
      throw new Error(error.stack);
    }
  }

  /**
  * Receive feature report from device
  * @param {number} reportId Report ID
  */
  async receiveFeatureReport(reportId) {
    return await this.device.receiveFeatureReport(reportId);
  }

  /**
  * Close the HID device connection
  */
  async close() {
    if (this.device?.opened) {
      await this.device.close();
    }
  }

  // Abstract methods that must be implemented by subclasses
  async getInfo() {
    throw new Error('getInfo() must be implemented by subclass');
  }

  async flash(progressCallback = null) {
    throw new Error('flash() must be implemented by subclass');
  }

  async reset() {
    throw new Error('reset() must be implemented by subclass');
  }

  async nvsLock() {
    throw new Error('nvsLock() must be implemented by subclass');
  }

  async nvsUnlock() {
    throw new Error('nvsUnlock() must be implemented by subclass');
  }

  async calibrateSticksBegin() {
    throw new Error('calibrateSticksBegin() must be implemented by subclass');
  }

  async calibrateSticksEnd() {
    throw new Error('calibrateSticksEnd() must be implemented by subclass');
  }

  async calibrateSticksSample() {
    throw new Error('calibrateSticksSample() must be implemented by subclass');
  }

  async calibrateRangeBegin() {
    throw new Error('calibrateRangeBegin() must be implemented by subclass');
  }

  async calibrateRangeEnd() {
    throw new Error('calibrateRangeEnd() must be implemented by subclass');
  }

  parseBatteryStatus(data) {
    throw new Error('parseBatteryStatus() must be implemented by subclass');
  }
}

export default BaseController;
