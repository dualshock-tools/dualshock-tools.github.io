'use strict';

import BaseController from './base-controller.js';
import { 
  sleep, 
  dec2hex, 
  dec2hex32, 
  format_mac_from_view, 
  lf,
  la 
} from '../utils.js';

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
  { name: 'share', byte: 5, mask: 0x10, svg: 'Create' },
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
  batteryByte: 29,
  isDS4: true
};

/**
* DualShock 4 Controller implementation
*/
class DS4Controller extends BaseController {
  constructor(device, uiDependencies = {}) {
    super(device, uiDependencies);
    this.type = "DS4";
  }

  getInputConfig() {
    return DS4_INPUT_CONFIG;
  }

  async getInfo() {
    // Device-only: collect info and return a common structure; do not touch the DOM
    try {
      let deviceTypeText = this.l("unknown");
      let is_clone = false;

      const view = lf("ds4_info", await this.receiveFeatureReport(0xa3));

      const cmd = view.getUint8(0, true);

      if(cmd != 0xa3 || view.buffer.byteLength < 49) {
        if(view.buffer.byteLength != 49) {
          deviceTypeText = this.l("clone");
          is_clone = true;
        }
      }

      const k1 = new TextDecoder().decode(view.buffer.slice(1, 0x10)).replace(/\0/g, '');
      const k2 = new TextDecoder().decode(view.buffer.slice(0x10, 0x20)).replace(/\0/g, '');

      const hw_ver_major= view.getUint16(0x21, true);
      const hw_ver_minor= view.getUint16(0x23, true);
      const sw_ver_major= view.getUint32(0x25, true);
      const sw_ver_minor= view.getUint16(0x25+4, true);
      try {
        if(!is_clone) {
          // If this feature report succeeds, it's an original device
          await this.receiveFeatureReport(0x81);
          deviceTypeText = this.l("original");
        }
      } catch(e) {
        la("clone");
        is_clone = true;
        deviceTypeText = this.l("clone");
      }

      const infoItems = [
        { key: this.l("Build Date"), value: k1 + " " + k2, cat: "fw" },
        { key: this.l("HW Version"), value: "" + dec2hex(hw_ver_major) + ":" + dec2hex(hw_ver_minor), cat: "hw" },
        { key: this.l("SW Version"), value: dec2hex32(sw_ver_major) + ":" + dec2hex(sw_ver_minor), cat: "fw" },
        { key: this.l("Device Type"), value: deviceTypeText, cat: "hw", severity: is_clone ? 'danger' : undefined },
      ];

      if(!is_clone) {
        // Add Board Model (UI will append the info icon)
        infoItems.push({ key: this.l("Board Model"), value: this.hwToBoardModel(hw_ver_minor), cat: "hw", addInfoIcon: 'board' });

        const bd_addr = await this.getBdAddr();
        infoItems.push({ key: this.l("Bluetooth Address"), value: bd_addr, cat: "hw" });
      }

      const nv = await this.queryNvStatus();
      const rare = this.isRare(hw_ver_minor);
      const disable_bits = is_clone ? 1 : 0; // 1: clone

      return { ok: true, infoItems, nv, disable_bits, rare };
    } catch(e) {
      // Return error but do not touch DOM
      return { ok: false, error: e, disable_bits: 1 };
    }
  }

  async flash(progressCallback = null) {
    la("ds4_flash");
    try {
      await this.nvsUnlock();
      const lockRes = await this.nvsLock();
      if(!lockRes.ok) throw (lockRes.error || new Error("NVS lock failed"));

      return { success: true, message: this.l("Changes saved successfully") };
    } catch(error) {
      throw new Error(this.l("Error while saving changes: ") + String(error));
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
    la("ds4_nvlock");
    try {
      await this.sendFeatureReport(0xa0, [10,1,0]);
      return { ok: true };
    } catch(e) {
      return { ok: false, error: e };
    }
  }

  async nvsUnlock() {
    la("ds4_nvunlock");
    try {
      await this.sendFeatureReport(0xa0, [10,2,0x3e,0x71,0x7f,0x89]);
      return { ok: true };
    } catch(e) {
      return { ok: false, error: e };
    } 
  }

  async getBdAddr() {
    const view = lf("ds4_getbdaddr", await this.receiveFeatureReport(0x12));
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
      const d1 = data.getUint32(0, false);
      const d2 = data2.getUint32(0, false);
      if(d1 != 0x91010201 || d2 != 0x920102ff) {
        la("ds4_calibrate_range_begin_failed", {"d1": d1, "d2": d2});
        return { ok: false, code: 1, d1, d2 };
      }
      return { ok: true };
    } catch(e) {
      la("ds4_calibrate_range_begin_failed", {"r": e});
      return { ok: false, error: String(e) };
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
      const d1 = data.getUint32(0, false);
      const d2 = data2.getUint32(0, false);
      if(d1 != 0x91010202 || d2 != 0x92010201) {
        la("ds4_calibrate_range_end_failed", {"d1": d1, "d2": d2});
        return { ok: false, code: 3, d1, d2 };
      }

      return { ok: true };
    } catch(e) {
      la("ds4_calibrate_range_end_failed", {"r": e});
      return { ok: false, error: String(e) };
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
      const d1 = data.getUint32(0, false);
      const d2 = data2.getUint32(0, false);
      if(d1 != 0x91010101 || d2 != 0x920101ff) {
        la("ds4_calibrate_sticks_begin_failed", {"d1": d1, "d2": d2});
        return { ok: false, code: 1, d1, d2 };
      }

      return { ok: true };
    } catch(e) {
      la("ds4_calibrate_sticks_begin_failed", {"r": e});
      return { ok: false, error: String(e) };
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
        const d1 = dec2hex32(data.getUint32(0, false));
        const d2 = dec2hex32(data2.getUint32(0, false));
        la("ds4_calibrate_sticks_sample_failed", {"d1": d1, "d2": d2});
        return { ok: false, code: 2, d1, d2 };
      }
      return { ok: true };
    } catch(e) {
      return { ok: false, error: String(e) };
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
        const d1 = dec2hex32(data.getUint32(0, false));
        const d2 = dec2hex32(data2.getUint32(0, false));
        la("ds4_calibrate_sticks_end_failed", {"d1": d1, "d2": d2});
        return { ok: false, code: 3, d1, d2 };
      }

      return { ok: true };
    } catch(e) {
      la("ds4_calibrate_sticks_end_failed", {"r": e});
      return { ok: false, error: String(e) };
    }
  }

  async queryNvStatus() {
    try {
      await this.sendFeatureReport(0x08, [0xff,0, 12]);
      const data = lf("ds4_nvstatus", await this.receiveFeatureReport(0x11));
      const ret = data.getUint8(1, false);
      if (ret === 1) {
        return { device: 'ds4', status: 'locked', locked: true, mode: 'temporary', code: 1 };
      } else if (ret === 0) {
        return { device: 'ds4', status: 'unlocked', locked: false, mode: 'permanent', code: 0 };
      } else {
        return { device: 'ds4', status: 'unknown', locked: null, code: ret };
      }
    } catch (e) {
      return { device: 'ds4', status: 'error', locked: null, code: 2, error: e };
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
      return this.l("Unknown");
    }
  }

  isRare(hw_ver) {
    const a = hw_ver >> 8;
    const b = a >> 4;
    return ((b == 7 && a > 0x74) || (b == 9 && a != 0x93 && a != 0x90));
  }
}

export default DS4Controller;
