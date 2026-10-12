'use strict';

import { sleep, la } from './utils.js';
import { l } from './translations.js';
import { Storage } from './storage.js';
import type BaseController from './controllers/base-controller.js';
import type {
  ActionResult,
  AudioOutput,
  BatteryStatus,
  ButtonMapping,
  InputConfig,
  NvStatus,
  ProgressCallback,
  TriggerSetting,
} from './controllers/base-controller.js';

export interface StickPosition { x: number, y: number }
export interface Sticks { left: StickPosition, right: StickPosition }
export interface Vector3 { x: number, y: number, z: number }
export interface ImuState { gyro: Vector3, accel: Vector3 }

export interface TouchPoint {
  active: boolean;
  id: number;
  x: number;
  y: number;
}

/**
* Latest value of every input: booleans for buttons, numbers for analog
* values (`l2_analog`, `r2_analog`, Edge trigger stops), plus the sticks.
*/
export interface ButtonStates {
  sticks: Sticks;
  [name: string]: boolean | number | Sticks | undefined;
}

/** Inputs that changed in the latest report, keyed like ButtonStates */
export interface InputChanges {
  sticks?: Sticks;
  imu?: ImuState;
  [name: string]: boolean | number | Sticks | ImuState | undefined;
}

export interface ControllerBatteryStatus extends BatteryStatus {
  /** HTML for the battery indicator */
  bat_txt: string;
  /** Whether bat_txt changed since the previous report */
  changed: boolean;
}

export interface InputResult {
  changes: InputChanges;
  inputConfig: { buttonMap: ButtonMapping[] };
  touchPoints: TouchPoint[];
  batteryStatus: ControllerBatteryStatus;
}

export interface ControllerManagerDependencies {
  handleNvStatusUpdate?: (nv: NvStatus) => void;
}

type TriggerPresetName = 'off' | 'light' | 'medium' | 'heavy';
type DoneCallback = (result: { success: boolean }) => void;

const NOT_GENUINE_SONY_CONTROLLER_MSG = "Your device might not be a genuine Sony controller. If it is not a clone then please report this issue.";

/**
* Controller Manager - Manages the current controller instance and provides unified interface
*/
class ControllerManager {
  currentController: BaseController | null;
  handleNvStatusUpdate: ControllerManagerDependencies['handleNvStatusUpdate'];
  has_changes_to_write: boolean | null;
  inputHandler: ((result: InputResult) => void) | null;
  button_states: ButtonStates;
  imuState: ImuState;
  touchPoints: TouchPoint[];
  batteryStatus: ControllerBatteryStatus;
  _lastBatteryText: string;
  /** Latest raw input report, for debug/inspection views */
  lastRawInput?: DataView;

  constructor(uiDependencies: ControllerManagerDependencies = {}) {
    this.currentController = null;
    this.handleNvStatusUpdate = uiDependencies.handleNvStatusUpdate;
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

    // IMU state for gyro and accelerometer
    this.imuState = {
      gyro: {
        x: 0,
        y: 0,
        z: 0
      },
      accel: {
        x: 0,
        y: 0,
        z: 0
      }
    };

    // Touch points for touchpad input
    this.touchPoints = [];

    // Battery status tracking
    this.batteryStatus = {
      bat_txt: "",
      changed: false,
      charge_level: 0,
      cable_connected: false,
      is_charging: false,
      is_error: false
    };
    this._lastBatteryText = "";
  }

  /**
  * Save has_changes_to_write state to storage
  */
  async _saveHasChangesState(): Promise<void> {
    if (!this.currentController) return;
    try {
      const serialNumber = await this.currentController.getSerialNumber();
      Storage.hasChangesState.set(serialNumber, this.has_changes_to_write!);
    } catch (e) {
      console.warn('Failed to save changes state:', e);
    }
  }

  /**
  * Restore has_changes_to_write state from storage
  */
  async _restoreHasChangesState(): Promise<void> {
    if (!this.currentController) return;
    try {
      const serialNumber = await this.currentController.getSerialNumber();
      const restoredState = Storage.hasChangesState.get(serialNumber);
      if (restoredState !== null) {
        this.has_changes_to_write = restoredState;
        this._updateUI();
      }
    } catch (e) {
      console.warn('Failed to restore changes state:', e);
    }
  }

  /**
  * Update UI based on current has_changes_to_write state
  */
  _updateUI(): void {
    const saveBtn = $("#savechanges");
    saveBtn
      .prop('disabled', !this.has_changes_to_write)
      .toggleClass('btn-success', this.has_changes_to_write as boolean)
      .toggleClass('btn-outline-secondary', !this.has_changes_to_write);
  }

  /**
  * Clear controller state: remove storage entry and reset UI
  * @private
  */
  async _clearControllerState(): Promise<void> {
    if (this.currentController) {
      try {
        const serialNumber = await this.currentController.getSerialNumber();
        Storage.hasChangesState.clear(serialNumber);
      } catch (e) {
        console.warn('Failed to clear storage:', e);
      }
    }
    this.has_changes_to_write = false;
    this._updateUI();
  }

  /**
  * Set the current controller instance
  * @param instance Controller instance
  */
  setControllerInstance(instance: BaseController | null): void {
    this.currentController = instance;
    if (instance) {
      this._restoreHasChangesState().catch(e => console.warn('Failed to restore changes state:', e));
    }
  }

  /**
  * Get the current device (for backward compatibility)
  * @returns Current device or null if none set
  */
  getDevice(): HIDDevice | null {
    return this.currentController?.getDevice() || null;
  }

  getInputConfig(): InputConfig {
    return this.currentController!.getInputConfig();
  }

  async getDeviceInfo() {
    if (!this.currentController) return null;
    return await this.currentController.getInfo();
  }

  getFinetuneMaxValue(): number | null {
    if (!this.currentController) return null;
    return this.currentController.getFinetuneMaxValue();
  }

  /**
  * Set input report handler on the underlying device
  * @param handler Input report handler function or null to clear
  */
  setInputReportHandler(handler: HIDDevice['oninputreport']): void {
    if (!this.currentController) return;
    this.currentController.device.oninputreport = handler;
  }

  /**
  * Query NVS (Non-Volatile Storage) status
  * @returns NVS status object
  */
  async queryNvStatus(): Promise<NvStatus> {
    const nv = await this.currentController!.queryNvStatus();
    this.handleNvStatusUpdate!(nv);
    return nv;
  }

  /**
  * Get in-memory module data (finetune data)
  * @returns Module data array
  */
  async getInMemoryModuleData(): Promise<number[] | null> {
    return await this.currentController!.getInMemoryModuleData();
  }

  /**
  * Write finetune data to controller
  * @param data Finetune data array
  */
  async writeFinetuneData(data: number[]): Promise<void> {
    await this.currentController!.writeFinetuneData(data);
  }

  getModel(): string | null {
    if (!this.currentController) return null;
    return this.currentController.getModel();
  }

  /**
   * Get the list of supported quick tests for the current controller
   * @returns Array of supported test types
   */
  getSupportedQuickTests(): string[] {
    if (!this.currentController) {
      return [];
    }
    return this.currentController.getSupportedQuickTests();
  }

  /**
  * Check if a controller is connected
  * @returns True if controller is connected
  */
  isConnected(): boolean {
    return this.currentController !== null;
  }

  /**
  * Set the input callback function
  * @param callback - Function to call after processing input
  */
  setInputHandler(callback: (result: InputResult) => void): void {
    this.inputHandler = callback;
  }

  /**
  * Disconnect the current controller
  */
  async disconnect(): Promise<void> {
    if (this.currentController) {
      await this.currentController.close();
      this.currentController = null;
    }
  }

  /**
  * Update NVS changes status and UI
  * @param hasChanges Changes status
  */
  setHasChangesToWrite(hasChanges: boolean): void {
    if (hasChanges === this.has_changes_to_write)
      return;

    this.has_changes_to_write = hasChanges;
    this._updateUI();
    this._saveHasChangesState().catch(e => console.warn('Failed to save changes state:', e));
  }

  // Unified controller operations that delegate to the current controller

  /**
  * Flash/save changes to the controller
  */
  async flash(progressCallback: ProgressCallback | null = null): Promise<ActionResult | undefined> {
    await this._clearControllerState();
    return this.currentController!.flash(progressCallback);
  }

  /**
  * Reset the controller
  */
  async reset(): Promise<void> {
    await this._clearControllerState();
    return this.currentController!.reset();
  }

  /**
  * Unlock NVS (Non-Volatile Storage)
  */
  async nvsUnlock(): Promise<void> {
    await this.currentController!.nvsUnlock();
    await this.queryNvStatus(); // Refresh NVS status
  }

  /**
  * Lock NVS (Non-Volatile Storage)
  */
  async nvsLock() {
    const res = await this.currentController!.nvsLock();
    if (!res.ok) {
      throw new Error(l("NVS Lock failed"), { cause: res.error });
    }

    await this.queryNvStatus(); // Refresh NVS status
    return res;
  }

  /**
  * Begin stick calibration
  */
  async calibrateSticksBegin(): Promise<void> {
    const res = await this.currentController!.calibrateSticksBegin();
    if (!res.ok) {
      throw new Error(l(NOT_GENUINE_SONY_CONTROLLER_MSG), { cause: res.error });
    }
  }

  /**
  * Sample stick position during calibration
  */
  async calibrateSticksSample(): Promise<void> {
    const res = await this.currentController!.calibrateSticksSample();
    if (!res.ok) {
      await sleep(500);
      throw new Error(l("Stick calibration failed"), { cause: res.error });
    }
  }

  /**
  * End stick calibration
  */
  async calibrateSticksEnd(): Promise<void> {
    const res = await this.currentController!.calibrateSticksEnd();
    if (!res.ok) {
      await sleep(500);
      throw new Error(l("Stick calibration failed"), { cause: res.error });
    }

    this.setHasChangesToWrite(true);
  }

  /**
  * Begin stick range calibration (for UI-driven calibration)
  */
  async calibrateRangeBegin(): Promise<void> {
    const res = await this.currentController!.calibrateRangeBegin();
    if (!res.ok) {
      throw new Error(l(NOT_GENUINE_SONY_CONTROLLER_MSG), { cause: res.error });
    }
  }

  /**
  * Handle range calibration on close
  */
  async calibrateRangeOnClose(): Promise<ActionResult & { error?: unknown }> {
    if(!this.currentController) {
      return { success: false };
    }
    const res = await this.currentController.calibrateRangeEnd();
    if(res?.ok) {
      this.setHasChangesToWrite(true);
      return { success: true, message: l("Range calibration completed") };
    } else {
      // Check if the error is code 3 (DS4/DS5) or codes 4/5 (DS5 Edge), which typically means 
      // the calibration was already ended or the controller is not in range calibration mode
      if (res?.code === 3 || res?.code === 4 || res?.code === 5) {
        console.log("Range calibration end returned expected error code", res.code, "- treating as successful completion");
        // This is likely not an error - the calibration may have already been completed
        // or the user closed the window without starting calibration
        return { success: true };
      }

      console.log("Range calibration end failed with unexpected error:", res);
      await sleep(500);
      const msg = res?.code ? (`${l("Range calibration failed")}. ${l("Error")} ${res.code}`) : (`${l("Range calibration failed")}. ${res?.error || ""}`);
      return { success: false, message: msg, error: res?.error };
    }
  }

  /**
  * Full stick calibration process ("OLD" fully automated calibration)
  * @param progressCallback - Callback function to report progress (0-100)
  */
  async calibrateSticks(progressCallback: ProgressCallback): Promise<ActionResult> {
    try {
      la("multi_calibrate_sticks");

      progressCallback(20);
      await this.calibrateSticksBegin();
      progressCallback(30);

      // Sample multiple times during the process
      const sampleCount = 5;
      for (let i = 0; i < sampleCount; i++) {
        await sleep(100);
        await this.calibrateSticksSample();

        // Progress from 30% to 80% during sampling
        const sampleProgress = 30 + ((i + 1) / sampleCount) * 50;
        progressCallback(Math.round(sampleProgress));
      }

      progressCallback(90);
      await this.calibrateSticksEnd();
      progressCallback(100);

      return { success: true, message: l("Stick calibration completed") };
    } catch (e) {
      la("multi_calibrate_sticks_failed", {"r": e});
      throw e;
    }
  }

  /**
   * Set left adaptive trigger with preset configurations (DS5 only)
   * @param preset - Preset name: 'light', 'medium', 'heavy', 'custom'
   * @param customParams - Custom parameters for 'custom' preset {start, end, force}
   * @returns Result object with success status and message
   */
  async setAdaptiveTriggerPreset({left, right}: { left: TriggerPresetName, right: TriggerPresetName }/* , customParams = {} */): Promise<ActionResult | void | undefined> {
    const presets: Record<TriggerPresetName, TriggerSetting> = {
      'off': { start: 0, end: 0, force: 0, mode: 'off' },
      'light': { start: 10, end: 80, force: 150, mode: 'single'},
      'medium': { start: 15, end: 100, force: 200, mode: 'single' },
      'heavy': { start: 20, end: 120, force: 255, mode: 'single' },
      // 'custom': customParams
    };

    if (!presets[left] || !presets[right]) {
      throw new Error(`Invalid preset. Available presets: light, medium, heavy, custom. Got "${left}" and "${right}".`);
    }

    const leftPreset = presets[left];
    const rightPreset = presets[right];

    // if (preset === 'custom') {
    //   // Validate custom parameters
    //   if (typeof start !== 'number' || typeof end !== 'number' || typeof force !== 'number') {
    //     throw new Error(l("Custom preset requires start, end, and force parameters"));
    //   }
    // }

    return await this.currentController?.setAdaptiveTrigger(leftPreset, rightPreset);
  }

  /**
   * Set vibration motors for haptic feedback (DS5 only)
   * @param options - Vibration options
   * @param options.heavyLeft - Left motor intensity (0-255)
   * @param options.lightRight - Right motor intensity (0-255)
   * @param options.duration - Duration in milliseconds (optional)
   * @param doneCb - Callback function called when vibration ends (optional)
   */
  async setVibration(
    {heavyLeft, lightRight, duration = 0}: { heavyLeft: number, lightRight?: number, duration?: number },
    doneCb: DoneCallback = ({success}) => {}
  ): Promise<void> {
    try {
      await this.currentController!.setVibration(heavyLeft, lightRight);

      // If duration is specified, automatically turn off vibration after the duration
      if (duration > 0) {
        setTimeout(async () => {
          if(!this.currentController) return doneCb({success: true});
          await this.currentController.setVibration(0, 0); // Turn off vibration
          doneCb({success: true});
        }, duration);
      }
    } catch (error) {
      if(!this.currentController) return; // the controller was unplugged
      if(duration) doneCb({ success: false});
      throw new Error(l("Failed to set vibration"), { cause: error });
    }
  }

  /**
   * Test speaker tone (DS5 only)
   * @param duration - Duration in milliseconds (optional)
   * @param doneCb - Callback function called when tone ends (optional)
   * @param output - Audio output destination: "speaker" (default) or "headphones" (optional)
   */
  async setSpeakerTone(duration = 1000, doneCb: DoneCallback = ({success}) => {}, output: AudioOutput = "speaker"): Promise<void> {
    try {
      await this.currentController!.setSpeakerTone(output);

      // If duration is specified, automatically reset speaker after the duration
      if (duration > 0) {
        setTimeout(async () => {
          if(!this.currentController) return doneCb({success: true});
          // Reset speaker settings to default by calling setSpeakerTone with reset parameters
          try {
            if (this.currentController.resetSpeakerSettings) {
              await this.currentController.resetSpeakerSettings();
            }
          } catch (resetError) {
            console.warn("Failed to reset speaker settings:", resetError);
          }
          doneCb({success: true});
        }, duration);
      }
    } catch (error) {
      if(!this.currentController) return; // the controller was unplugged
      if(duration) doneCb({ success: false});
      throw new Error(l("Failed to set speaker tone"), { cause: error });
    }
  }

  /**
  * Helper function to check if stick positions have changed
  */
  _sticksChanged(current: Sticks, newValues: Sticks): boolean {
    return current.left.x !== newValues.left.x || current.left.y !== newValues.left.y ||
    current.right.x !== newValues.right.x || current.right.y !== newValues.right.y;
  }

  /**
  * Helper function to check if IMU (gyro/accel) values have changed
  */
  _imuChanged(current: ImuState, newValues: ImuState): boolean {
    return current.gyro.x !== newValues.gyro.x || current.gyro.y !== newValues.gyro.y || current.gyro.z !== newValues.gyro.z ||
    current.accel.x !== newValues.accel.x || current.accel.y !== newValues.accel.y || current.accel.z !== newValues.accel.z;
  }

  /**
  * Parse IMU (gyro and accelerometer) state changes
  * @param data - Input data view
  * @param imuOffset - Offset to IMU data
  * @returns IMU changes or null if no changes
  */
  _parseImuState(data: DataView, imuOffset: number | undefined): ImuState | null {
    if (imuOffset === undefined) return null; // device has no known IMU data
    const newIMU = this._parseIMUData(data, imuOffset);
    if (this._imuChanged(this.imuState, newIMU)) {
      this.imuState = newIMU;
      return newIMU;
    }
    return null;
  }

  /**
  * Generic button processing for DS4/DS5
  * Records button states and returns changes
  */
  _recordButtonStates(
    data: DataView,
    BUTTON_MAP: ButtonMapping[],
    dpadByte: number | undefined,
    l2AnalogByte: number | undefined,
    r2AnalogByte: number | undefined,
    stickBytes: InputConfig['stickBytes']
  ): InputChanges {
    const changes: InputChanges = {};

    // Stick positions: bytes 0-3 unless the device layout says otherwise;
    // axes without a byte (e.g. the missing second stick on VR2) read as 0
    const { lx, ly, rx, ry } = stickBytes ?? { lx: 0, ly: 1, rx: 2, ry: 3 };
    const readAxis = (byte: number | undefined) =>
      byte === undefined ? 0 : Math.round((data.getUint8(byte) - 127.5) / 128 * 100) / 100;

    const newSticks = {
      left: { x: readAxis(lx), y: readAxis(ly) },
      right: { x: readAxis(rx), y: readAxis(ry) }
    };

    if (this._sticksChanged(this.button_states.sticks, newSticks)) {
      this.button_states.sticks = newSticks;
      changes.sticks = newSticks;
    }

    // L2/R2 analog values (byte undefined = trigger not present on this device)
    ([
      ['l2', l2AnalogByte],
      ['r2', r2AnalogByte]
    ] as const).forEach(([name, byte]) => {
      if (byte === undefined) return;
      const val = data.getUint8(byte);
      const key = name + '_analog';
      if (val !== this.button_states[key]) {
        this.button_states[key] = val;
        changes[key] = val;
      }
    });

    // Dpad is a 4-bit hat value (dpadByte undefined = no dpad on this device)
    if (dpadByte !== undefined) {
      const hat = data.getUint8(dpadByte) & 0x0F;
      const dpad_map: Record<string, boolean> = {
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

    // Handle the Edge controller's specific inputs
    const deviceSpecificInputs = this.currentController!.parseDeviceSpecificInputs(data);
    Object.entries(deviceSpecificInputs).forEach(([key, value]) => {
      if(value !== this.button_states[key]) {
        this.button_states[key] = value;
        changes[key] = value;
      }
    })

    return changes;
  }

  /**
  * Process controller input data and call callback if set
  * This is the first part of the split process_controller_input function
  * @param inputData - The input data from the controller
  */
  processControllerInput(inputData: HIDInputReportEvent): void {
    const { data } = inputData;

    // Keep the latest raw report around for debug/inspection views
    this.lastRawInput = data;

    const inputConfig = this.currentController!.getInputConfig();
    const { buttonMap, dpadByte, l2AnalogByte, r2AnalogByte, imuOffset } = inputConfig;
    const { touchpadOffset } = inputConfig;

    // Process button states using the device-specific configuration
    const changes = this._recordButtonStates(data, buttonMap, dpadByte, l2AnalogByte, r2AnalogByte, inputConfig.stickBytes);

    // Record IMU state if available
    const imuChanges = this._parseImuState(data, imuOffset);
    if (imuChanges) {
      changes.imu = imuChanges;
    }

    // Parse and store touch points if touchpad data is available
    if (touchpadOffset) {
      this.touchPoints = this._parseTouchPoints(data, touchpadOffset);
    }

    // Parse and store battery status
    this.batteryStatus = this._parseBatteryStatus(data);

    const result = {
      changes,
      inputConfig: { buttonMap },
      touchPoints: this.touchPoints,
      batteryStatus: this.batteryStatus,
    };

    this.inputHandler!(result);
  }

  /**
  * Parse touch points from input data
  * @param data - Input data view
  * @param offset - Offset to touchpad data
  * @returns Array of touch points with {active, id, x, y} properties
  */
  _parseTouchPoints(data: DataView, offset: number): TouchPoint[] {
    // Returns array of up to 2 points: {active, id, x, y}
    const points: TouchPoint[] = [];
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
  */
  _parseBatteryStatus(data: DataView): ControllerBatteryStatus {
    const batteryInfo = this.currentController!.parseBatteryStatus(data);
    const bat_txt = this._batteryPercentToText(batteryInfo);

    const changed = bat_txt !== this._lastBatteryText;
    this._lastBatteryText = bat_txt;

    return { bat_txt, changed, ...batteryInfo };
  }

  /**
  * Parse IMU (gyro and accelerometer) data from input data
  * @param data - Input data view
  * @param imuOffset - Offset to IMU data
  * @returns IMU data with gyro and accel values
  */
  _parseIMUData(data: DataView, imuOffset: number): ImuState {
    // Nominal, uncalibrated sensitivities. In both DS4 and DS5 input reports
    // the gyroscope (pitch, yaw, roll) comes first, followed by the accelerometer.
    const GYRO_SENSITIVITY_LSB_PER_DPS = 14.31;
    const ACCEL_SENSITIVITY_LSB_PER_G = 8192.0;

    const [gyroX, gyroY, gyroZ] = [0, 2, 4]
      .map(i => data.getInt16(imuOffset + i, true))
      .map(v => v / GYRO_SENSITIVITY_LSB_PER_DPS);  // degrees per second
    const [accelX, accelY, accelZ] = [6, 8, 10]
      .map(i => data.getInt16(imuOffset + i, true))
      .map(v => v / ACCEL_SENSITIVITY_LSB_PER_G);   // g (should total ~1g at rest)

    return {
      gyro: {
        x: gyroX, y: gyroY, z: gyroZ
      },
      accel: {
        x: accelX, y: accelY, z: accelZ
      }
    };
  }

  /**
  * Convert battery percentage to display text with icons
  */
  _batteryPercentToText({charge_level, is_charging, is_error}: BatteryStatus): string {
    if (is_error) {
      return '<font color="red">' + l("error") + '</font>';
    }

    const batteryIcons = [
      { threshold: 20, icon: 'fa-battery-empty' },
      { threshold: 40, icon: 'fa-battery-quarter' },
      { threshold: 60, icon: 'fa-battery-half' },
      { threshold: 80, icon: 'fa-battery-three-quarters' },
    ];

    const icon_txt = batteryIcons.find(item => charge_level < item.threshold)?.icon || 'fa-battery-full';
    const icon_full = `<i class="fa-solid ${icon_txt}"></i>`;
    const bolt_txt = is_charging ? '<i class="fa-solid fa-bolt"></i>' : '';
    return [`${charge_level}%`, icon_full, bolt_txt].join(' ');
  }

  /**
  * Get a bound input handler function that can be assigned to device.oninputreport
  * @returns Bound input handler function
  */
  getInputHandler(): (inputData: HIDInputReportEvent) => void {
    return this.processControllerInput.bind(this);
  }
}

// Function to initialize the controller manager with dependencies
export type { ControllerManager };

export function initControllerManager(dependencies: ControllerManagerDependencies = {}): ControllerManager {
  const self = new ControllerManager(dependencies);

  // This disables the save button until something actually changes
  self.setHasChangesToWrite(false);
  return self;
}
