'use strict';

import { sleep, la } from '../utils.js';

/**
* Controller Manager - Manages the current controller instance and provides unified interface
*/
class ControllerManager {
  constructor(uiDependencies = {}) {
    this.currentController = null;
    this.l = uiDependencies.l || ((text) => text); // fallback to identity function
    this.has_changes_to_write = null; 
    this.inputHandler = null; // Callback function for input processing

    // Button and stick states for UI updates
    this.button_states = {
      // e.g. 'square': false, 'cross': false, ...
      sticks: {
        left: {
          x: 0,
          y: 0
        },
        right: {
          x: 0,
          y: 0
        }
      }
    };

    // Touch points for touchpad input
    this.touchPoints = [];

    // Battery status tracking
    this.batteryStatus = {
      bat_txt: "",
      changed: false,
      bat_capacity: 0,
      cable_connected: false,
      is_charging: false,
      is_error: false
    };
    this._lastBatteryText = "";
  }

  /**
  * Set the current controller instance
  * @param {BaseController} controller Controller instance
  */
  setControllerInstance(instance) {
    this.currentController = instance;
  }

  /**
  * Get the current device (for backward compatibility)
  * @returns {HIDDevice|null} Current device or null if none set
  */
  getDevice() {
    return this.currentController?.getDevice() || null;
  }

  getInputConfig() {
    return this.currentController.getInputConfig();
  }

  async getDeviceInfo() {
    return await this.currentController.getInfo();
  }

  /**
  * Set input report handler on the underlying device
  * @param {Function|null} handler Input report handler function or null to clear
  */
  setInputReportHandler(handler) {
    this.currentController.device.oninputreport = handler;
  }

  /**
  * Query NVS (Non-Volatile Storage) status
  * @returns {Promise<Object>} NVS status object
  */
  async queryNvStatus() {
    return await this.currentController.queryNvStatus();
  }

  /**
  * Get in-memory module data (finetune data)
  * @returns {Promise<Array>} Module data array
  */
  async getInMemoryModuleData() {
    return await this.currentController.getInMemoryModuleData();
  }

  /**
  * Write finetune data to controller
  * @param {Array} data Finetune data array
  */
  async writeFinetuneData(data) {
    await this.currentController.writeFinetuneData(data);
  }

  controllerType() {
    return this.currentController.getType();
  }

  /**
  * Check if a controller is connected
  * @returns {boolean} True if controller is connected
  */
  isConnected() {
    return this.currentController !== null;
  }

  /**
  * Set the input callback function
  * @param {Function} callback - Function to call after processing input
  */
  setInputHandler(callback) {
    this.inputHandler = callback;
  }

  /**
  * Disconnect the current controller
  */
  async disconnect() {
    if (this.currentController) {
      await this.currentController.close();
      this.currentController = null;
    }
  }

  /**
  * Update NVS changes status and UI
  * @param {boolean} new_value Changes status
  */
  setHasChangesToWrite(new_value) {
    if (new_value === this.has_changes_to_write)
      return;

    if (new_value == true) {
      $("#savechanges").prop("disabled", false);
      $("#savechanges").addClass("btn-success").removeClass("btn-outline-secondary");
    } else {
      $("#savechanges").prop("disabled", true);
      $("#savechanges").removeClass("btn-success").addClass("btn-outline-secondary");
    }

    this.has_changes_to_write = new_value;
  }

  // Unified controller operations that delegate to the current controller

  /**
  * Flash/save changes to the controller
  */
  async flash(progressCallback = null) {
    const result = await this.currentController.flash(progressCallback);
    this.setHasChangesToWrite(false);
    return result;
  }

  /**
  * Reset the controller
  */
  async reset() {
    await this.currentController.reset();
  }

  /**
  * Unlock NVS (Non-Volatile Storage)
  */
  async nvsUnlock() {
    await this.currentController.nvsUnlock();
  }

  /**
  * Lock NVS (Non-Volatile Storage)
  */
  async nvsLock() {
    const res = await this.currentController.nvsLock();
    if (!res.ok) {
      throw new Error(this.l("NVS Lock failed: ") + String(res.error));
    }

    return res;
  }

  /**
  * Begin stick calibration
  */
  async calibrateSticksBegin() {
    const res = await this.currentController.calibrateSticksBegin();
    if (!res.ok) {
      const detail = res.code ? (this.l("Error ") + String(res.code)) : String(res.error || "");
      throw new Error(this.l("Stick calibration failed: ") + detail);
    }
    return true;
  }

  /**
  * End stick calibration
  */
  async calibrateSticksEnd() {
    const res = await this.currentController.calibrateSticksEnd();
    if (!res.ok) {
      await sleep(500);
      const detail = res.code ? (this.l("Error ") + String(res.code)) : String(res.error || "");
      throw new Error(this.l("Stick calibration failed: ") + detail);
    }

    this.setHasChangesToWrite(true);
    return true;
  }

  /**
  * Sample stick position during calibration
  */
  async calibrateSticksSample() {
    const res = await this.currentController.calibrateSticksSample();
    if (!res.ok) {
      await sleep(500);
      const detail = res.code ? (this.l("Error ") + String(res.code)) : String(res.error || "");
      throw new Error(this.l("Stick calibration failed: ") + detail);
    }
    return true;
  }

  /**
  * Begin stick range calibration (for UI-driven calibration)
  */
  async calibrateRangeBegin() {
    const ret = await this.currentController.calibrateRangeBegin();
    if (!ret.ok) {
      const detail = ret.code ? (this.l("Error ") + String(ret.code)) : String(ret.error || "");
      throw new Error(this.l("Range calibration failed: ") + detail);
    }
    return true;
  }

  /**
  * Handle range calibration on close
  */
  async calibrateRangeOnClose() {
    const res = await this.currentController.calibrateRangeEnd();
    if(res?.ok) {
      this.setHasChangesToWrite(true);
      return { success: true, message: this.l("Range calibration completed") };
    } else {
      // Check if the error is code 3 (DS4/DS5) or codes 4/5 (DS5 Edge), which typically means 
      // the calibration was already ended or the controller is not in range calibration mode
      if (res?.code === 3 || res?.code === 4 || res?.code === 5) {
        console.log("Range calibration end returned expected error code", res.code, "- treating as successful completion");
        // This is likely not an error - the calibration may have already been completed
        // or the user closed the window without starting calibration
        return { success: true, message: this.l("Range calibration window closed") };
      }

      console.log("Range calibration end failed with unexpected error:", res);
      await sleep(500);
      const msg = res?.code ? (this.l("Range calibration failed: ") + this.l("Error ") + String(res.code)) : (this.l("Range calibration failed: ") + String(res?.error || ""));
      return { success: false, message: msg };
    }
  }

  /**
  * Full stick calibration process ("OLD" fully automated calibration)
  * @param {Function} progressCallback - Callback function to report progress (0-100)
  */
  async calibrateSticks(progressCallback) {
    try {
      la("multi_calibrate_sticks");

      progressCallback(20);

      const okBegin = await this.calibrateSticksBegin();
      if (!okBegin) {
        return { success: false, message: this.l("Stick calibration failed to begin") };
      }

      progressCallback(30);

      // Sample multiple times during the process
      const sampleCount = 5;
      for (let i = 0; i < sampleCount; i++) {
        await sleep(100);
        const okSample = await this.calibrateSticksSample();
        if (!okSample) {
          return { success: false, message: this.l("Stick calibration sampling failed") };
        }

        // Progress from 30% to 80% during sampling
        const sampleProgress = 30 + ((i + 1) / sampleCount) * 50;
        progressCallback(Math.round(sampleProgress));
      }

      progressCallback(90);

      const okEnd = await this.calibrateSticksEnd();
      if (!okEnd) {
        return { success: false, message: this.l("Stick calibration failed to complete") };
      }

      progressCallback(100);
      return { success: true, message: this.l("Stick calibration completed") };
    } catch (e) {
      la("multi_calibrate_sticks_failed", {"r": e});
      throw e;
    }
  }

  /**
  * Helper function to check if stick positions have changed
  */
  sticksChanged(current, newValues) {
    return current.left.x !== newValues.left.x || current.left.y !== newValues.left.y ||
    current.right.x !== newValues.right.x || current.right.y !== newValues.right.y;
  }

  /**
  * Generic button processing for DS4/DS5
  * Records button states and returns changes
  */
  recordButtonStates(data, BUTTON_MAP, dpad_byte, l2_analog_byte, r2_analog_byte) {
    const changes = {};

    // Stick positions (always at bytes 0-3)
    const [new_lx, new_ly, new_rx, new_ry] = [0, 1, 2, 3]
      .map(i => data.getUint8(i))
      .map(v => Math.round((v - 127.5) / 128 * 100) / 100);

    const newSticks = {
      left: { x: new_lx, y: new_ly },
      right: { x: new_rx, y: new_ry }
    };

    if (this.sticksChanged(this.button_states.sticks, newSticks)) {
      this.button_states.sticks = newSticks;
      changes.sticks = newSticks;
    }

    // L2/R2 analog values
    [
      ['l2', l2_analog_byte],
      ['r2', r2_analog_byte]
    ].forEach(([name, byte]) => {
      const val = data.getUint8(byte);
      const key = name + '_analog';
      if (val !== this.button_states[key]) {
        this.button_states[key] = val;
        changes[key] = val;
      }
    });

    // Dpad is a 4-bit hat value
    const hat = data.getUint8(dpad_byte) & 0x0F;
    const dpad_map = {
      up:    (hat === 0 || hat === 1 || hat === 7),
      right: (hat === 1 || hat === 2 || hat === 3),
      down:  (hat === 3 || hat === 4 || hat === 5),
      left:  (hat === 5 || hat === 6 || hat === 7)
    };
    for (const dir of ['up', 'right', 'down', 'left']) {
      const pressed = dpad_map[dir];
      if (this.button_states[dir] !== pressed) {
        this.button_states[dir] = pressed;
        changes[dir] = pressed;
      }
    }

    // Other buttons
    for (const btn of BUTTON_MAP) {
      if (['up', 'right', 'down', 'left'].includes(btn.name)) continue; // Dpad handled above
      const pressed = (data.getUint8(btn.byte) & btn.mask) !== 0;
      if (this.button_states[btn.name] !== pressed) {
        this.button_states[btn.name] = pressed;
        changes[btn.name] = pressed;
      }
    }

    return changes;
  }

  /**
  * Process controller input data and call callback if set
  * This is the first part of the split process_controller_input function
  * @param {Object} inputData - The input data from the controller
  * @returns {Object} Changes object containing processed input data
  */
  processControllerInput(inputData) {
    const { data } = inputData;

    const inputConfig = this.currentController.getInputConfig();
    const { buttonMap, dpadByte, l2AnalogByte, r2AnalogByte } = inputConfig;
    const { touchpadOffset, batteryByte, isDS4 } = inputConfig;

    // Process button states using the device-specific configuration
    const changes = this.recordButtonStates(data, buttonMap, dpadByte, l2AnalogByte, r2AnalogByte);

    // Parse and store touch points if touchpad data is available
    if (touchpadOffset) {
      this.touchPoints = this.parseTouchPoints(data, touchpadOffset);
    }

    // Parse and store battery status if battery data is available
    this.batteryStatus = this.parseBatteryStatus(data, batteryByte, isDS4);

    const result = {
      changes,
      inputConfig: { buttonMap, isDS4 },
      touchPoints: this.touchPoints,
      batteryStatus: this.batteryStatus,
    };

    this.inputHandler(result);
  }

  /**
  * Parse touch points from input data
  * @param {DataView} data - Input data view
  * @param {number} offset - Offset to touchpad data
  * @returns {Array} Array of touch points with {active, id, x, y} properties
  */
  parseTouchPoints(data, offset) {
    // Returns array of up to 2 points: {active, id, x, y}
    const points = [];
    for (let i = 0; i < 2; i++) {
      const base = offset + i * 4;
      const arr = [];
      for (let j = 0; j < 4; j++) arr.push(data.getUint8(base + j));
      const b0 = data.getUint8(base);
      const active = (b0 & 0x80) === 0; // 0 = finger down, 1 = up
      const id = b0 & 0x7F;
      const b1 = data.getUint8(base + 1);
      const b2 = data.getUint8(base + 2);
      const b3 = data.getUint8(base + 3);
      // x: 12 bits, y: 12 bits
      const x = ((b2 & 0x0F) << 8) | b1;
      const y = (b3 << 4) | (b2 >> 4);
      points.push({ active, id, x, y });
    }
    return points;
  }

  /**
  * Parse battery status from input data
  * @param {DataView} data - Input data view
  * @param {number} byte - Byte offset for battery data
  * @param {boolean} isDS4 - Whether this is a DS4 controller
  * @returns {Object} Battery status object with bat_txt, changed, bat_capacity, etc.
  */
  parseBatteryStatus(data, byte, isDS4 = false) {
    const bat = data.getUint8(byte);
    let bat_capacity = 0, cable_connected = false, is_charging = false, is_error = false;

    if (isDS4) {
      // DS4: bat_data = low 4 bits, bat_status = bit 4
      const bat_data = bat & 0x0f;
      const bat_status = (bat >> 4) & 1;
      if (bat_status == 1) {
        cable_connected = true;
        if (bat_data < 10) {
          bat_capacity = Math.min(bat_data * 10 + 5, 100);
          is_charging = true;
        } else if (bat_data == 10) {
          bat_capacity = 100;
          is_charging = true;
        } else if (bat_data == 11) {
          bat_capacity = 100;
          // charged
        } else {
          bat_capacity = 0;
          is_error = true;
        }
      } else {
        cable_connected = false;
        if (bat_data < 10) {
          bat_capacity = bat_data * 10 + 5;
        } else {
          bat_capacity = 100;
        }
      }
    } else {
      // DS5: bat_charge = low 4 bits, bat_status = high 4 bits
      const bat_charge = bat & 0x0f;
      const bat_status = bat >> 4;
      if (bat_status == 0) {
        bat_capacity = Math.min(bat_charge * 10 + 5, 100);
      } else if (bat_status == 1) {
        bat_capacity = Math.min(bat_charge * 10 + 5, 100);
        is_charging = true;
        cable_connected = true;
      } else if (bat_status == 2) {
        bat_capacity = 100;
        cable_connected = true;
      } else {
        is_error = true;
      }
    }

    // Generate battery text with icons
    const bat_txt = this.batteryPercentToText(bat_capacity, is_charging, is_error);

    // Check if battery text has changed
    const changed = bat_txt !== this._lastBatteryText;
    this._lastBatteryText = bat_txt;

    // Update internal battery status
    const batteryStatus = {
      bat_txt,
      changed,
      bat_capacity,
      cable_connected,
      is_charging,
      is_error
    };

    return batteryStatus;
  }

  /**
  * Convert battery percentage to display text with icons
  * @param {number} bat_charge - Battery charge percentage
  * @param {boolean} is_charging - Whether battery is charging
  * @param {boolean} is_error - Whether there's a battery error
  * @returns {string} HTML string with battery status and icons
  */
  batteryPercentToText(bat_charge, is_charging, is_error) {
    if (is_error) {
      return '<font color="red">' + this.l("error") + '</font>';
    }

    const batteryIcons = [
      { threshold: 20, icon: 'fa-battery-empty' },
      { threshold: 40, icon: 'fa-battery-quarter' },
      { threshold: 60, icon: 'fa-battery-half' },
      { threshold: 80, icon: 'fa-battery-three-quarters' },
    ];

    const icon_txt = batteryIcons.find(item => bat_charge < item.threshold)?.icon || 'fa-battery-full';
    const icon_full = '<i class="fa-solid ' + icon_txt + '"></i>';
    const bolt_txt = is_charging ? '<i class="fa-solid fa-bolt"></i>' : '';
    return bat_charge + "%" + ' ' + bolt_txt + ' ' + icon_full;
  }

  /**
  * Get a bound input handler function that can be assigned to device.oninputreport
  * @returns {Function} Bound input handler function
  */
  getInputHandler() {
    return this.processControllerInput.bind(this);
  }
}

// Function to initialize the controller manager with dependencies
export function initControllerManager(dependencies = {}) {
  const self = new ControllerManager(dependencies);

  // This disables the save button until something actually changes
  self.setHasChangesToWrite(false);
  return self;
}
