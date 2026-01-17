'use strict';

import BaseController from './base-controller.js';
import {
  sleep,
  buf2hex,
  dec2hex,
  dec2hex32,
  format_mac_from_view,
  la
} from '../utils.js';
import { l } from '../translations.js';

// DS4 Button mapping configuration
const DS4_BUTTON_MAP = [
  { name: 'up', byte: 4, mask: 0x0 }, // Dpad handled separately
  { name: 'right', byte: 4, mask: 0x1 },
  { name: 'down', byte: 4, mask: 0x2 },
  { name: 'left', byte: 4, mask: 0x3 },
  { name: 'square', byte: 4, mask: 0x10, svg: 'Square' },
  { name: 'cross', byte: 4, mask: 0x20, svg: 'Cross' },
  { name: 'circle', byte: 4, mask: 0x40, svg: 'Circle' },
  { name: 'triangle', byte: 4, mask: 0x80, svg: 'Triangle' },
  { name: 'l1', byte: 5, mask: 0x01, svg: 'L1' },
  { name: 'l2', byte: 5, mask: 0x04, svg: 'L2' }, // analog handled separately
  { name: 'r1', byte: 5, mask: 0x02, svg: 'R1' },
  { name: 'r2', byte: 5, mask: 0x08, svg: 'R2' }, // analog handled separately
  { name: 'create', byte: 5, mask: 0x10, svg: 'Create' },
  { name: 'options', byte: 5, mask: 0x20, svg: 'Options' },
  { name: 'l3', byte: 5, mask: 0x40, svg: 'L3' },
  { name: 'r3', byte: 5, mask: 0x80, svg: 'R3' },
  { name: 'ps', byte: 6, mask: 0x01, svg: 'PS' },
  { name: 'touchpad', byte: 6, mask: 0x02, svg: 'Trackpad' },
  // No mute button on DS4
];

// DS4 Input processing configuration
const DS4_INPUT_CONFIG = {
  buttonMap: DS4_BUTTON_MAP,
  dpadByte: 4,
  l2AnalogByte: 7,
  r2AnalogByte: 8,
  touchpadOffset: 34,
};

// DS4 Output Report Constants
const DS4_OUTPUT_REPORT = {
  USB_REPORT_ID: 0x05,
  BT_REPORT_ID: 0x11,
};

const DS4_VALID_FLAG0 = {
  RUMBLE: 0x01,           // Bit 0 for rumble motors
  LED: 0x02,              // Bit 1 for LED control
  LED_BLINK: 0x04,        // Bit 2 for LED blink control
};

// Basic DS4 Output Structure for vibration and LED control
class DS4OutputStruct {
  constructor(currentState = null) {
    // Create a 32-byte buffer for DS4 output report (USB)
    this.buffer = new ArrayBuffer(31);
    this.view = new DataView(this.buffer);

    // Control flags
    this.validFlag0 = currentState?.validFlag0 || 0;
    this.validFlag1 = currentState?.validFlag1 || 0;

    // Vibration motors
    this.rumbleRight = currentState?.rumbleRight || 0;
    this.rumbleLeft = currentState?.rumbleLeft || 0;

    // LED control
    this.ledRed = currentState?.ledRed || 0;
    this.ledGreen = currentState?.ledGreen || 0;
    this.ledBlue = currentState?.ledBlue || 0;

    // LED timing
    this.ledFlashOn = currentState?.ledFlashOn || 0;
    this.ledFlashOff = currentState?.ledFlashOff || 0;
  }

  // Pack the data into the output buffer
  pack() {
    // Based on DS4 output report structure
    // Byte 0-2: Valid flags and padding
    this.view.setUint8(0, this.validFlag0);
    this.view.setUint8(1, this.validFlag1);
    this.view.setUint8(2, 0x00);

    // Byte 3-4: Rumble motors
    this.view.setUint8(3, this.rumbleRight);
    this.view.setUint8(4, this.rumbleLeft);

    // Bytes 5-7: LED RGB
    this.view.setUint8(5, this.ledRed);
    this.view.setUint8(6, this.ledGreen);
    this.view.setUint8(7, this.ledBlue);

    // Bytes 8-9: LED flash timing
    this.view.setUint8(8, this.ledFlashOn);
    this.view.setUint8(9, this.ledFlashOff);

    return this.buffer;
  }
}

/**
* DualShock 4 Controller implementation
*/
class DS4Controller extends BaseController {
  constructor(device) {
    super(device);
    this.model = "DS4";

    // Initialize current output state to track controller settings
    this.currentOutputState = {
      validFlag0: 0,
      validFlag1: 0,
      rumbleRight: 0,
      rumbleLeft: 0,
      ledRed: 0,
      ledGreen: 0,
      ledBlue: 0,
      ledFlashOn: 0,
      ledFlashOff: 0,
    };
  }

  getInputConfig() {
    return DS4_INPUT_CONFIG;
  }

  async getSerialNumber() {
    return await this.getBdAddr();
  }

  async getInfo() {
    // Device-only: collect info and return a common structure; do not touch the DOM
    try {
      let deviceTypeText = l("unknown");
      let is_clone = false;

      const view = await this.receiveFeatureReport(0xa3);

      const cmd = view.getUint8(0, true);

      if(cmd != 0xa3 || view.buffer.byteLength < 49) {
        if(view.buffer.byteLength != 49) {
          deviceTypeText = l("clone");
          is_clone = true;
        }
      }

      const k1 = new TextDecoder().decode(view.buffer.slice(1, 0x10)).replace(/\0/g, '');
      const k2 = new TextDecoder().decode(view.buffer.slice(0x10, 0x20)).replace(/\0/g, '');

      const hw_ver_major = view.getUint16(0x21, true);
      const hw_ver_minor = view.getUint16(0x23, true);
      const sw_ver_major = view.getUint32(0x25, true);
      const sw_ver_minor = view.getUint16(0x25+4, true);
      try {
        if(!is_clone) {
          // If this feature report succeeds, it's an original device
          await this.receiveFeatureReport(0x81);
          deviceTypeText = l("original");
        }
      } catch(e) {
        la("clone");
        is_clone = true;
        deviceTypeText = l("clone");
      }

      const hw_version = `${dec2hex(hw_ver_major)}:${dec2hex(hw_ver_minor)}`;
      const sw_version = `${dec2hex(sw_ver_major)}:${dec2hex(sw_ver_minor)}`;
      const infoItems = [
        { key: l("Build Date"), value: `${k1} ${k2}`, cat: "fw" },
        { key: l("HW Version"), value: hw_version, cat: "hw" },
        { key: l("SW Version"), value: sw_version, cat: "fw" },
        { key: l("Device Type"), value: deviceTypeText, cat: "hw", severity: is_clone ? 'danger' : undefined },
      ];

      const board_model = this.hwToBoardModel(hw_ver_minor);
      const bd_addr = await this.getBdAddr();

      if(!is_clone) {
        // Add Board Model (UI will append the info icon)
        infoItems.push({ key: l("Board Model"), value: board_model, cat: "hw", addInfoIcon: 'board', copyable: true });
        infoItems.push({ key: l("Bluetooth Address"), value: bd_addr, cat: "hw" });
      }

      const nv = await this.queryNvStatus();
      const rare = this.isRare(hw_ver_minor);
      const disable_bits = is_clone ? 1 : 0; // 1: clone

      la("ds4_get_info", { hw_version, board_model, bd_addr, is_clone });  // Collect Bluetooth address for analytics

      return { ok: true, infoItems, nv, disable_bits, rare };
    } catch(error) {
      // Return error but do not touch DOM
      return { ok: false, error, disable_bits: 1 };
    }
  }

  async flash(progressCallback = null) {
    la("ds4_flash");
    try {
      await this.nvsUnlock();
      const lockRes = await this.nvsLock();
      if(!lockRes.ok) throw (lockRes.error || new Error("NVS lock failed"));

      return { success: true, message: l("Changes saved successfully") };
    } catch(error) {
      throw new Error(l("Error while saving changes"), { cause: error });
    }
  }

  async reset() {
    la("ds4_reset");
    try {
      await this.sendFeatureReport(0xa0, [4,1,0]);
    } catch(error) {
    }
  }

  async nvsLock() {
    // la("ds4_nvlock");
    try {
      await this.sendFeatureReport(0xa0, [10,1,0]);
      return { ok: true };
    } catch(error) {
      return { ok: false, error };
    }
  }

  async nvsUnlock() {
    // la("ds4_nvunlock");
    try {
      await this.sendFeatureReport(0xa0, [10,2,0x3e,0x71,0x7f,0x89]);
      return { ok: true };
    } catch(error) {
      return { ok: false, error };
    }
  }

  async getBdAddr() {
    const view = await this.receiveFeatureReport(0x12);
    return format_mac_from_view(view, 1);
  }

  async calibrateRangeBegin() {
    la("ds4_calibrate_range_begin");
    try {
      // Begin
      await this.sendFeatureReport(0x90, [1,1,2]);
      await sleep(200);

      // Assert
      const data = await this.receiveFeatureReport(0x91);
      const data2 = await this.receiveFeatureReport(0x92);
      const [d1, d2] = [data, data2].map(v => v.buffer.byteLength == 4 ? v.getUint32(0, false) : undefined);
      if(d1 != 0x91010201 || d2 != 0x920102ff) {
        la("ds4_calibrate_range_begin_failed", {"d1": d1, "d2": d2});
        return {
          ok: false,
          error: new Error(`Stick range calibration begin failed: ${d1}, ${d2}`),
          code: 1, d1, d2
        };
      }
      return { ok: true };
    } catch(error) {
      la("ds4_calibrate_range_begin_failed", {"r": error});
      return { ok: false, error };
    }
  }

  async calibrateRangeEnd() {
    la("ds4_calibrate_range_end");
    try {
      // Write
      await this.sendFeatureReport(0x90, [2,1,2]);
      await sleep(200);

      const data = await this.receiveFeatureReport(0x91);
      const data2 = await this.receiveFeatureReport(0x92);
      const [d1, d2] = [data, data2].map(v => v.getUint32(0, false));
      if(d1 != 0x91010202 || d2 != 0x92010201) {
        la("ds4_calibrate_range_end_failed", {"d1": d1, "d2": d2});
        return { ok: false, code: 3, d1, d2 };
      }

      return { ok: true };
    } catch(error) {
      la("ds4_calibrate_range_end_failed", {"r": error});
      return { ok: false, error };
    }
  }

  async calibrateSticksBegin() {
    la("ds4_calibrate_sticks_begin");
    try {
      // Begin
      await this.sendFeatureReport(0x90, [1,1,1]);
      await sleep(200);

      // Assert
      const data = await this.receiveFeatureReport(0x91);
      const data2 = await this.receiveFeatureReport(0x92);
      const [d1, d2] = [data, data2].map(v => v.buffer.byteLength == 4 ? v.getUint32(0, false) : undefined);
      if(d1 != 0x91010101 || d2 != 0x920101ff) {
        la("ds4_calibrate_sticks_begin_failed", {"d1": d1, "d2": d2});
        return {
          ok: false,
          error: new Error(`Stick center calibration begin failed: ${d1}, ${d2}`),
          code: 1, d1, d2,
        };
      }

      return { ok: true };
    } catch(error) {
      la("ds4_calibrate_sticks_begin_failed", {"r": error});
      return { ok: false, error };
    }
  }

  async calibrateSticksSample() {
    la("ds4_calibrate_sticks_sample");
    try {
      // Sample
      await this.sendFeatureReport(0x90, [3,1,1]);
      await sleep(200);

      // Assert
      const data = await this.receiveFeatureReport(0x91);
      const data2 = await this.receiveFeatureReport(0x92);
      if(data.getUint32(0, false) != 0x91010101 || data2.getUint32(0, false) != 0x920101ff) {
        const [d1, d2] = [data, data2].map(v => dec2hex32(v.getUint32(0, false)));
        la("ds4_calibrate_sticks_sample_failed", {"d1": d1, "d2": d2});
        return { ok: false, code: 2, d1, d2 };
      }
      return { ok: true };
    } catch(error) {
      return { ok: false, error };
    }
  }

  async calibrateSticksEnd() {
    la("ds4_calibrate_sticks_end");
    try {
      // Write
      await this.sendFeatureReport(0x90, [2,1,1]);
      await sleep(200);

      const data = await this.receiveFeatureReport(0x91);
      const data2 = await this.receiveFeatureReport(0x92);
      if(data.getUint32(0, false) != 0x91010102 || data2.getUint32(0, false) != 0x92010101) {
        const [d1, d2] = [data, data2].map(v => dec2hex32(v.getUint32(0, false)));
        la("ds4_calibrate_sticks_end_failed", {"d1": d1, "d2": d2});
        return { ok: false, code: 3, d1, d2 };
      }

      return { ok: true };
    } catch(error) {
      la("ds4_calibrate_sticks_end_failed", {"r": error});
      return { ok: false, error };
    }
  }

  async queryNvStatus() {
    try {
      await this.sendFeatureReport(0x08, [0xff,0, 12]);
      const data = await this.receiveFeatureReport(0x11);
      const ret = data.getUint8(1, false);
      const res = { device: 'ds4', code: ret }
      switch(ret) {
        case 1:
          return { ...res, status: 'locked', locked: true, mode: 'temporary' };
        case 0:
          return { ...res, status: 'unlocked', locked: false, mode: 'permanent' };
        default:
          return { ...res, status: 'unknown', locked: null };
      }
    } catch (error) {
      return { device: 'ds4', status: 'error', locked: null, code: 2, error };
    }
  }

  hwToBoardModel(hw_ver) {
    const a = hw_ver >> 8;
    if(a == 0x31) {
      return "JDM-001";
    } else if(a == 0x43) {
      return "JDM-011";
    } else if(a == 0x54) {
      return "JDM-030";
    } else if(a >= 0x64 && a <= 0x74) {
      return "JDM-040";
    } else if((a > 0x80 && a < 0x84) || a == 0x93) {
      return "JDM-020";
    } else if(a == 0xa4 || a == 0x90 || a == 0xa0) {
      return "JDM-050";
    } else if(a == 0xb0) {
      return "JDM-055 (Scuf?)";
    } else if(a == 0xb4) {
      return "JDM-055";
    } else {
      if(this.isRare(hw_ver))
        return "WOW!";
      return l("Unknown");
    }
  }

  isRare(hw_ver) {
    const a = hw_ver >> 8;
    const b = a >> 4;
    return ((b == 7 && a > 0x74) || (b == 9 && a != 0x93 && a != 0x90));
  }

  /**
  * Parse DS4 battery status from input data
  */
  parseBatteryStatus(data) {
    const bat = data.getUint8(29); // DS4 battery byte is at position 29

    // DS4: bat_data = low 4 bits, bat_status = bit 4
    const bat_data = bat & 0x0f;
    const bat_status = (bat >> 4) & 1;
    const cable_connected = bat_status === 1;

    let charge_level = 0;
    let is_charging = false;
    let is_error = false;

    if (cable_connected) {
      if (bat_data < 10) {
        charge_level = Math.min(bat_data * 10 + 5, 100);
        is_charging = true;
      } else if (bat_data === 10) {
        charge_level = 100;
        is_charging = true;
      } else if (bat_data === 11) {
        charge_level = 100; // Fully charged
      } else {
        charge_level = 0;
        is_error = true;
      }
    } else {
      // On battery power
      charge_level = bat_data < 10 ? bat_data * 10 + 5 : 100;
    }

    return { charge_level, cable_connected, is_charging, is_error };
  }

  /**
   * Send output report to the DS4 controller
   * @param {ArrayBuffer} data - The output report data
   */
  async sendOutputReport(data, reason = "") {
    if (!this.device?.opened) {
      throw new Error('Device is not opened');
    }
    try {
      console.log(`Sending output report${ reason ? ` to ${reason}` : '' }:`, DS4_OUTPUT_REPORT.USB_REPORT_ID, buf2hex(data));
      await this.device.sendReport(DS4_OUTPUT_REPORT.USB_REPORT_ID, new Uint8Array(data));
    } catch (error) {
      throw new Error(`Failed to send output report: ${error.message}`);
    }
  }

  /**
   * Update the current output state with values from an OutputStruct
   * @param {DS4OutputStruct} outputStruct - The output structure to copy state from
   */
  updateCurrentOutputState(outputStruct) {
    this.currentOutputState = { ...outputStruct };
  }

  /**
   * Get a copy of the current output state
   * @returns {Object} A copy of the current output state
   */
  getCurrentOutputState() {
    return { ...this.currentOutputState };
  }

  /**
   * Initialize the current output state when the controller is first connected.
   * This method sets up reasonable defaults for the DS4 controller.
   */
  async initializeCurrentOutputState() {
    try {
      // Reset all output state to known defaults
      this.currentOutputState = {
        ...this.getCurrentOutputState(),
        validFlag0: DS4_VALID_FLAG0.RUMBLE | DS4_VALID_FLAG0.LED,
        ledRed: 0,
        ledGreen: 0,
        ledBlue: 255, // Default to blue
        ledFlashOn: 0,
        ledFlashOff: 0
      };

      // Send a "reset" output report to ensure the controller is in a known state
      const resetOutputStruct = new DS4OutputStruct(this.currentOutputState);
      await this.sendOutputReport(resetOutputStruct.pack(), 'init default states');

      // Update our state to reflect what we just sent
      this.updateCurrentOutputState(resetOutputStruct);
    } catch (error) {
      console.warn("Failed to initialize DS4 output state:", error);
      // Even if the reset fails, we still have the default state initialized
    }
  }

  /**
   * Set vibration motors for haptic feedback
   * @param {number} heavyLeft - Left motor intensity (0-255)
   * @param {number} lightRight - Right motor intensity (0-255)
   */
  async setVibration(heavyLeft = 0, lightRight = 0) {
    try {
      const { validFlag0 } = this.currentOutputState;
      const outputStruct = new DS4OutputStruct({
        ...this.currentOutputState,
        rumbleLeft: Math.max(0, Math.min(255, heavyLeft)),
        rumbleRight: Math.max(0, Math.min(255, lightRight)),
        validFlag0: validFlag0 | DS4_VALID_FLAG0.RUMBLE,
      });
      await this.sendOutputReport(outputStruct.pack(), 'set vibration');
      outputStruct.validFlag0 &= ~DS4_VALID_FLAG0.RUMBLE;

      // Update current state to reflect the changes
      this.updateCurrentOutputState(outputStruct);

      return { success: true, message: "Vibration set successfully" };
    } catch (error) {
      throw new Error("Failed to set vibration", { cause: error });
    }
  }

  /**
   * Set lightbar color
   * @param {number} red - Red component (0-255)
   * @param {number} green - Green component (0-255)
   * @param {number} blue - Blue component (0-255)
   */
  async setLightbarColor(red = 0, green = 0, blue = 0) {
    try {
      const { validFlag0 } = this.currentOutputState;
      const outputStruct = new DS4OutputStruct({
        ...this.currentOutputState,
        ledRed: Math.max(0, Math.min(255, red)),
        ledGreen: Math.max(0, Math.min(255, green)),
        ledBlue: Math.max(0, Math.min(255, blue)),
        validFlag0: validFlag0 | DS4_VALID_FLAG0.LED,
      });
      await this.sendOutputReport(outputStruct.pack(), 'set lightbar color');
      outputStruct.validFlag0 &= ~DS4_VALID_FLAG0.LED;

      // Update current state to reflect the changes
      this.updateCurrentOutputState(outputStruct);
    } catch (error) {
      throw new Error("Failed to set lightbar color", { cause: error });
    }
  }

  /**
   * Set lightbar blink pattern
   * @param {number} red - Red component (0-255)
   * @param {number} green - Green component (0-255)
   * @param {number} blue - Blue component (0-255)
   * @param {number} flashOn - On duration in deciseconds (0-255)
   * @param {number} flashOff - Off duration in deciseconds (0-255)
   */
  async setLightbarBlink(red = 0, green = 0, blue = 0, flashOn = 0, flashOff = 0) {
    try {
      const { validFlag0 } = this.currentOutputState;
      const outputStruct = new DS4OutputStruct({
        ...this.currentOutputState,
        ledRed: Math.max(0, Math.min(255, red)),
        ledGreen: Math.max(0, Math.min(255, green)),
        ledBlue: Math.max(0, Math.min(255, blue)),
        ledFlashOn: Math.max(0, Math.min(255, flashOn)),
        ledFlashOff: Math.max(0, Math.min(255, flashOff)),
        validFlag0: validFlag0 | DS4_VALID_FLAG0.LED | DS4_VALID_FLAG0.LED_BLINK,
      });
      await this.sendOutputReport(outputStruct.pack(), 'set lightbar blink');
      outputStruct.validFlag0 &= ~(DS4_VALID_FLAG0.LED | DS4_VALID_FLAG0.LED_BLINK);

      // Update current state to reflect the changes
      this.updateCurrentOutputState(outputStruct);
    } catch (error) {
      throw new Error("Failed to set lightbar blink", { cause: error });
    }
  }

  /**
   * Set speaker tone for audio output through the controller's headphone jack
   * Note: DS4 only supports playing sound through headphones connected to the controller.
   * The built-in speaker is not supported. DS4 audio is a standard USB audio device,
   * not controlled via HID output reports.
   * @param {string} output - Audio output destination: "headphones" only (throws error if "speaker")
   * @throws {Error} If output is set to "speaker" (not supported on DS4)
   */
  async setSpeakerTone(output = "speaker") {
    // Throw error if trying to use the built-in speaker
    if (output === "speaker") {
      throw new Error("DS4 does not support playing sound through the built-in speaker. Only 'headphones' output is supported.");
    }

    // DS4 speaker works as a standard USB audio device (class-compliant)
    // It cannot be controlled through HID output reports like DS5

    // Create Web Audio Context
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // Try to get microphone permission to see device labels
    let hasPermission = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      hasPermission = true;
    } catch (error) {
      throw new Error('Microphone permission required to enumerate audio devices', { cause: error });
    }

    // Check if we have access to audio devices and setSinkId support
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter(device => device.kind === 'audiooutput');

      // Look for DualShock 4 audio device
      const ds4AudioDevice = audioOutputs.find(device =>
        device.label && /wireless controller|dualshock|sony/i.test(device.label)
      );

      // Create audio elements for tone generation
      const oscillator = audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);

      // Configure volume envelope (fade in/out to avoid clicks)
      // Use max volume for better audibility
      const gainNode = audioContext.createGain();
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(1, audioContext.currentTime + 0.05);
      gainNode.gain.linearRampToValueAtTime(1, audioContext.currentTime + 0.5);
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.25);

      // Connect audio graph
      oscillator.connect(gainNode);

      let audioElement = null;

      // If DS4 audio device is found and setSinkId is supported, route to it
      if (ds4AudioDevice && typeof HTMLMediaElement !== 'undefined' && HTMLMediaElement.prototype.setSinkId) {
        try {
          // Create a MediaStreamDestination to capture the audio
          const streamDestination = audioContext.createMediaStreamDestination();
          gainNode.connect(streamDestination);

          // Create an audio element to play the stream
          audioElement = new Audio();
          audioElement.autoplay = false;
          audioElement.volume = 1.0; // Max volume

          // Set the audio output to the DS4 speaker BEFORE setting srcObject
          await audioElement.setSinkId(ds4AudioDevice.deviceId);
          audioElement.srcObject = streamDestination.stream;

          // Play the audio element FIRST
          await audioElement.play();

          // THEN start the oscillator (so the stream is already being consumed)
          oscillator.start();
          oscillator.stop(audioContext.currentTime + 0.8);
        } catch (error) {
          throw new Error('Could not set DS4 as audio sink', { cause: error });
        }
      }

      // Clean up audio context and element after tone completes
      setTimeout(() => {
        if (audioElement) {
          audioElement.pause();
          audioElement.srcObject = null;
        }
        if (audioContext.state !== 'closed') {
          audioContext.close();
        }
      }, 1000);
    } else {
      throw new Error('WebRTC getUserMedia API or mediaDevices enumeration not available.');
    }
  }

  getNumberOfSticks() {
    return 2;
  }

  /**
   * Get the list of supported quick tests for DS4 controller
   * DS4 does not support adaptive triggers, speaker, or microphone
   * @returns {Array<string>} Array of supported test types
   */
  getSupportedQuickTests() {
    return ['usb', 'buttons', 'haptic', 'lights', 'headphone'];
  }
}

export default DS4Controller;
