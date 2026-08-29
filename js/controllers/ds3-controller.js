'use strict';

import BaseController from './base-controller.js';
import { dec2hex8, la } from '../utils.js';
import { l } from '../translations.js';

// DS3 / SIXAXIS USB input report. WebHID strips the report ID (0x01), so
// these offsets are one less than the report-ID-counted docs. Provisional,
// from the hid-sony / eleccelerator layout; verify with the raw inspector in
// the DS3 button panel.
//   byte 1: select 0x01, l3 0x02, r3 0x04, start 0x08,
//           up 0x10, right 0x20, down 0x40, left 0x80
//   byte 2: l2 0x01, r2 0x02, l1 0x04, r1 0x08,
//           triangle 0x10, circle 0x20, cross 0x40, square 0x80
//   byte 3: ps 0x01
//   bytes 5-8: LX, LY, RX, RY
//   bytes 17-18: L2, R2 analog pressure
// The dpad is four discrete bits (not a hat), so it is parsed in
// parseDeviceSpecificInputs rather than via dpadByte.
// The DS3 reuses the DualShock 4 SVG, so buttons carry the DS4 svg element
// names. DS3 select/start map to the DS4 Create/Options positions.
const DS3_BUTTON_MAP = [
  { name: 'select', byte: 1, mask: 0x01, svg: 'Create' },
  { name: 'l3', byte: 1, mask: 0x02, svg: 'L3' },
  { name: 'r3', byte: 1, mask: 0x04, svg: 'R3' },
  { name: 'start', byte: 1, mask: 0x08, svg: 'Options' },
  { name: 'l2', byte: 2, mask: 0x01, svg: 'L2' }, // analog handled separately
  { name: 'r2', byte: 2, mask: 0x02, svg: 'R2' }, // analog handled separately
  { name: 'l1', byte: 2, mask: 0x04, svg: 'L1' },
  { name: 'r1', byte: 2, mask: 0x08, svg: 'R1' },
  { name: 'triangle', byte: 2, mask: 0x10, svg: 'Triangle' },
  { name: 'circle', byte: 2, mask: 0x20, svg: 'Circle' },
  { name: 'cross', byte: 2, mask: 0x40, svg: 'Cross' },
  { name: 'square', byte: 2, mask: 0x80, svg: 'Square' },
  { name: 'ps', byte: 3, mask: 0x01, svg: 'PS' },
];

const DS3_DPAD = [
  { name: 'up', mask: 0x10 },
  { name: 'right', mask: 0x20 },
  { name: 'down', mask: 0x40 },
  { name: 'left', mask: 0x80 },
];

const DS3_INPUT_CONFIG = {
  buttonMap: DS3_BUTTON_MAP,
  stickBytes: { lx: 5, ly: 6, rx: 7, ry: 8 },
  l2AnalogByte: 17,
  r2AnalogByte: 18,
};

// Format 6 MAC bytes read forward from a feature-report DataView
function format_mac_forward(view, start) {
  const bytes = [];
  for (let i = 0; i < 6; i++) bytes.push(dec2hex8(view.getUint8(start + i)));
  return bytes.join(':');
}

/**
 * DualShock 3 (SIXAXIS) controller. USB only. Currently testing/diagnose
 * only: no calibration is offered yet. (The DS3 does store stick-center
 * calibration in flash, read/written via feature report 0xF1 - unlike the
 * DS4/DS5 flow and dangerous enough to brick a controller, so it is left for
 * a carefully-scoped follow-up.) The controller is set operational by reading
 * feature report 0xF2 before any input reports flow (handled during connect);
 * its identity is its Bluetooth MAC address, also read from 0xF2.
 */
class DS3Controller extends BaseController {
  constructor(device) {
    super(device);
    this.model = "DS3";
    this.btAddress = null;
  }

  getInputConfig() {
    return DS3_INPUT_CONFIG;
  }

  getNumberOfSticks() {
    return 2;
  }

  getSupportedQuickTests() {
    return [];
  }

  // Read the controller's own Bluetooth MAC from feature report 0xF2
  // (bytes 4-9 of the response, which starts with the 0xF2 report ID)
  async _readBtAddress() {
    if (this.btAddress) return this.btAddress;
    try {
      const data = await this.receiveFeatureReport(0xf2);
      if (data && data.byteLength >= 10) {
        this.btAddress = format_mac_forward(data, 4);
      }
    } catch (e) {
      console.warn('DS3: failed to read 0xF2 for MAC:', e);
    }
    return this.btAddress;
  }

  async getSerialNumber() {
    return (await this._readBtAddress()) || 'DS3';
  }

  async getInfo() {
    const infoItems = [];
    try {
      const mac = await this._readBtAddress();
      if (mac) {
        infoItems.push({ key: l("Bluetooth Address"), value: mac, cat: "hw", copyable: true });
      }
      // 0xF5 reports the paired PS3's Bluetooth MAC (bytes 2-7)
      const paired = await this.receiveFeatureReport(0xf5);
      if (paired && paired.byteLength >= 8) {
        infoItems.push({ key: l("Paired to"), value: format_mac_forward(paired, 2), cat: "hw", copyable: true });
      }
    } catch (e) {
      console.warn('DS3: getInfo feature reads failed:', e);
    }
    return { ok: true, infoItems };
  }

  parseBatteryStatus(data) {
    // Provisional: DS3 charge byte (report-ID-counted offset 30 -> 29 here).
    // 0xEE/0xEF = charging over USB; 0x00-0x05 = discrete charge levels.
    // Verify against the raw inspector.
    const b = data.byteLength > 29 ? data.getUint8(29) : 0xee;
    if (b === 0xee || b === 0xef) {
      return { charge_level: 100, cable_connected: true, is_charging: true, is_error: false };
    }
    const levels = { 0x00: 0, 0x01: 20, 0x02: 40, 0x03: 60, 0x04: 80, 0x05: 100 };
    return {
      charge_level: levels[b] ?? 100,
      cable_connected: true,
      is_charging: false,
      is_error: false,
    };
  }

  // The DS3 dpad is four discrete bits in byte 1, not a hat, so the generic
  // button loop (which skips up/right/down/left) does not handle it
  parseDeviceSpecificInputs(data) {
    const result = {};
    if (data.byteLength > 1) {
      const b = data.getUint8(1);
      DS3_DPAD.forEach(({ name, mask }) => { result[name] = (b & mask) !== 0; });
    }
    return result;
  }
}

export default DS3Controller;
