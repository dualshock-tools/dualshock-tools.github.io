'use strict';

import DS5Controller from './ds5-controller.js';
import { sleep, dec2hex32, la, lf } from '../utils.js';

/**
* DualSense Edge (DS5 Edge) Controller implementation
*/
class DS5EdgeController extends DS5Controller {
  constructor(device, uiDependencies = {}) {
    super(device, uiDependencies);
    this.model = "DS5_Edge";
    this.finetuneMaxValue = 4095; // 12-bit max value for DS5 Edge
  }

  async getInfo() {
    const { l } = this;

    // DS5 Edge uses the same info structure as DS5 but with is_edge=true
    const result = await this._getInfo(true);

    if (result.ok) {
      // DS Edge extra module info
      const empty = Array(17).fill('\x00').join('');
      try {
        const sticks_barcode = (await this.getBarcode()).map(barcode => barcode === empty ? l("Unknown") : barcode);
        result.infoItems.push({ key: l("Left Module Barcode"), value: sticks_barcode[1], cat: "fw" });
        result.infoItems.push({ key: l("Right Module Barcode"), value: sticks_barcode[0], cat: "fw" });
      } catch(_e) {
        // ignore module read errors here
      }
    }

    return result;
  }

  async flash(progressCallback = null) {
    la("ds5_edge_flash");
    try {
      const ret = await this.flashModules(progressCallback);
      if(ret) {
        return { 
          success: true, 
          message: "<b>" + this.l("Changes saved successfully") + "</b>.<br><br>" + this.l("If the calibration is not stored permanently, please double-check the wirings of the hardware mod."),
          isHtml: true
        };
      }
    } catch(error) {
      throw new Error(this.l("Error while saving changes"), { cause: error });
    }
  }

  async getBarcode() {
    await this.sendFeatureReport(0x80, [21,34]);
    await sleep(100);

    const data = lf("ds5_edge_get_barcode", await this.receiveFeatureReport(0x81));
    const td = new TextDecoder();
    const r_bc = td.decode(data.buffer.slice(21, 21+17));
    const l_bc = td.decode(data.buffer.slice(40, 40+17));
    return [r_bc, l_bc];
  }

  async unlockModule(i) {
    const m_name = i == 0 ? "left module" : "right module";

    await this.sendFeatureReport(0x80, [21, 6, i, 11]);
    await sleep(200);
    const ret = await this.waitUntilWritten([21, 6, 2]);
    if(!ret) {
      throw new Error(this.l("Cannot unlock") + " " + this.l(m_name));
    }
  }

  async lockModule(i) {
    const m_name = i == 0 ? "left module" : "right module";

    await this.sendFeatureReport(0x80, [21, 4, i, 8]);
    await sleep(200);
    const ret = await this.waitUntilWritten([21, 4, 2]);
    if(!ret) {
      throw new Error(this.l("Cannot lock") + " " + this.l(m_name));
    }
  }

  async storeDataInto(i) {
    const m_name = i == 0 ? "left module" : "right module";

    await this.sendFeatureReport(0x80, [21, 5, i]);
    await sleep(200);
    const ret = await this.waitUntilWritten([21, 3, 2]);
    if(!ret) {
      throw new Error(this.l("Cannot store data into") + " " + this.l(m_name));
    }
  }

  async flashModules(progressCallback) {
    la("ds5_edge_flash_modules");
    try {
      progressCallback(0);

      // Reload data, this ensures correctly writing data in the controller
      await sleep(100);
      progressCallback(10);

      // Unlock modules
      await this.unlockModule(0);
      progressCallback(15);
      await this.unlockModule(1);
      progressCallback(30);

      // Unlock NVS
      await this.nvsUnlock();
      await sleep(50);
      progressCallback(45);

      // This should trigger write into modules
      const data = await this.getInMemoryModuleData();
      await sleep(50);
      progressCallback(60);
      await this.writeFinetuneData(data);

      // Extra delay
      await sleep(100);

      // Lock back modules
      await this.lockModule(0);
      progressCallback(80);
      await this.lockModule(1);
      progressCallback(100);

      // Lock back NVS
      await sleep(100);
      const lockRes = await this.nvsLock();
      if(!lockRes.ok) throw (lockRes.error || new Error("NVS lock failed"));

      await sleep(250);

      return true;
    } catch(error) {
      la("ds5_edge_flash_modules_failed", {"r": error});
      throw error;
    }
  }

  async waitUntilWritten(expected) {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const data = await this.receiveFeatureReport(0x81);

      // Check if all expected bytes match
      const allMatch = expected.every((expectedByte, i) => 
        data.getUint8(1 + i, true) === expectedByte
      );

      if (allMatch) {
        return true;
      }

      attempts++;
      await sleep(50);
    }

    return false;
  }

  async calibrateSticksEnd() {
    la("ds5_calibrate_sticks_end");
    try {
      // Write
      await this.sendFeatureReport(0x82, [2,1,1]);

      let data = await this.receiveFeatureReport(0x83);

      if(data.getUint32(0, false) != 0x83010101) {
        const d1 = dec2hex32(data.getUint32(0, false));
        la("ds5_calibrate_sticks_failed", {"s": 3, d1});
        return { ok: false, code: 4, d1 };
      }

      await this.sendFeatureReport(0x82, [2,1,1]);
      data = await this.receiveFeatureReport(0x83);
      if(data.getUint32(0, false) != 0x83010103 && data.getUint32(0, false) != 0x83010312) {
        const d1 = dec2hex32(data.getUint32(0, false));
        la("ds5_calibrate_sticks_failed", {"s": 3, d1});
        return { ok: false, code: 5, d1 };
      }

      return { ok: true };
    } catch(error) {
      la("ds5_calibrate_sticks_end_failed", {"r": error});
      return { ok: false, error };
    }
  }

  async calibrateRangeEnd() {
    la("ds5_calibrate_range_end");
    try {
      // Write
      await this.sendFeatureReport(0x82, [2,1,2]);

      // Assert
      let data = await this.receiveFeatureReport(0x83);

      if(data.getUint32(0, false) != 0x83010201) {
        const d1 = dec2hex32(data.getUint32(0, false));
        la("ds5_calibrate_range_end_failed", {d1});
        return { ok: false, code: 4, d1 };
      }

      await this.sendFeatureReport(0x82, [2,1,2]);
      data = await this.receiveFeatureReport(0x83)
      if(data.getUint32(0, false) != 0x83010203) {
        const d1 = dec2hex32(data.getUint32(0, false));
        la("ds5_calibrate_range_end_failed", {d1});
        return { ok: false, code: 5, d1 };
      }

      return { ok: true };
    } catch(error) {
      la("ds5_calibrate_range_end_failed", {"r": error});
      return { ok: false, error };
    }
  }

  async getInMemoryModuleData() {
    // DualSense Edge
    await this.sendFeatureReport(0x80, [12, 4]);
    await sleep(100);
    const data = await this.receiveFeatureReport(0x81);
    const cmd = data.getUint8(0, true);
    const [p1, p2, p3] = [1, 2, 3].map(i => data.getUint8(i, true));

    if(cmd != 129 || p1 != 12 || (p2 != 2 && p2 != 4) || p3 != 2)
      return null;

    return Array.from({ length: 12 }, (_, i) => data.getUint16(4 + i * 2, true));
  }

  async writeFinetuneData(data) {
    const pkg = data.reduce((acc, val) => acc.concat([val & 0xff, val >> 8]), [12, 1]);
    await this.sendFeatureReport(0x80, pkg)
  }
}

export default DS5EdgeController;
