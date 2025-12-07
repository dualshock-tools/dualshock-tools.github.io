'use strict';

/**
* Base Controller class that provides common functionality for all controller types
*/
class BaseController {
  constructor(device) {
    this.device = device;
    this.model = "undefined"; // to be set by subclasses
    this.finetuneMaxValue; // to be set by subclasses
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

  getNumberOfSticks() {
    return 0;
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

  /**
  * Get the serial number of the device
  * @returns {Promise<string>} The device serial number
  */
  async getSerialNumber() {
    throw new Error('getSerialNumber() must be implemented by subclass');
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
  
  async setAdaptiveTrigger(left, right) {
    // Default no-op implementation for controllers that don't support adaptive triggers
    return { success: true, message: "This controller does not support adaptive triggers" };
  }

  async setVibration(heavyLeft = 0, lightRight = 0) {
    // Default no-op implementation for controllers that don't support vibration
    return { success: true, message: "This controller does not support vibration" };
  }

  async setAdaptiveTriggerPreset(config) {
    // Default no-op implementation for controllers that don't support adaptive trigger presets
    return { success: true, message: "This controller does not support adaptive trigger presets" };
  }

  async setSpeakerTone(output = 'speaker') {
    // Default no-op implementation for controllers that don't support speaker audio
    if (callback) callback({ success: true, message: "This controller does not support speaker audio" });
    return { success: true, message: "This controller does not support speaker audio" };
  }

  async resetLights() {
    // Default no-op implementation for controllers that don't support controllable lights
    return { success: true, message: "This controller does not support controllable lights" };
  }

  async setMuteLed(mode) {
    // Default no-op implementation for controllers that don't support mute LED
    return { success: true, message: "This controller does not support mute LED" };
  }

  async setLightbarColor(r, g, b) {
    // Default no-op implementation for controllers that don't support lightbar colors
    return { success: true, message: "This controller does not support lightbar colors" };
  }

  async setPlayerIndicator(pattern) {
    // Default no-op implementation for controllers that don't support player indicators
    return { success: true, message: "This controller does not support player indicators" };
  }

  /**
   * Get the list of supported quick tests for this controller
   * @returns {Array<string>} Array of supported test types
   */
  getSupportedQuickTests() {
    // Default implementation - supports all tests
    return ['usb', 'buttons', 'adaptive', 'haptic', 'lights', 'speaker', 'headphone', 'microphone'];
  }
}

export default BaseController;
