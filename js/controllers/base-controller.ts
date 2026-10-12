'use strict';

/** One button in an input report: pressed when `report[byte] & mask` is non-zero. */
export interface ButtonMapping {
  name: string;
  byte: number;
  mask: number;
  /** Id of the matching element in the controller SVG */
  svg?: string;
}

/**
* Where each input lives in a device's input report. Optional fields are
* absent on devices that don't have that input.
*/
export interface InputConfig {
  buttonMap: ButtonMapping[];
  dpadByte?: number;
  l2AnalogByte?: number;
  r2AnalogByte?: number;
  imuOffset?: number;
  touchpadOffset?: number;
  /** Stick axis bytes; defaults to { lx: 0, ly: 1, rx: 2, ry: 3 } */
  stickBytes?: { lx?: number, ly?: number, rx?: number, ry?: number };
}

/** A row in the controller info table */
export interface InfoItem {
  key: string;
  value: string;
  cat: 'hw' | 'fw';
  isExtra?: boolean;
  copyable?: boolean;
  addInfoIcon?: string;
  severity?: string;
}

/** NVS (non-volatile storage) lock status */
export interface NvStatus {
  device: 'ds4' | 'ds5';
  status: 'locked' | 'unlocked' | 'pending_reboot' | 'unknown' | 'error';
  locked: boolean | null;
  mode?: 'temporary' | 'permanent';
  code: number;
  raw?: number;
  error?: unknown;
}

export type ControllerInfo =
  | {
      ok: true;
      infoItems: InfoItem[];
      nv: NvStatus | null;
      /** Bit 1: clone, bit 2: outdated firmware */
      disable_bits: number;
      rare?: boolean;
      pending_reboot?: boolean;
    }
  | { ok: false; error: unknown; disable_bits?: number };

/** Result of a low-level device operation (calibration steps, NVS lock) */
export interface OpResult {
  ok: boolean;
  error?: unknown;
  code?: number;
  d1?: unknown;
  d2?: unknown;
}

/** Result of a user-facing action (flash, feature test) */
export interface ActionResult {
  success: boolean;
  message?: string;
  isHtml?: boolean;
}

export interface BatteryStatus {
  charge_level: number;
  cable_connected: boolean;
  is_charging: boolean;
  is_error: boolean;
}

export type TriggerMode = 'off' | 'single' | 'auto' | 'resistance';

export interface TriggerSetting {
  mode: TriggerMode;
  start: number;
  end: number;
  force: number;
}

export type AudioOutput = 'speaker' | 'headphones';

/** Receives progress as a percentage (0-100) */
export type ProgressCallback = (progress: number) => void;

/**
* Race a promise against a timeout. USB feature/output transfers on a genuine
* controller complete in milliseconds; some clones ignore reports they don't
* implement, leaving the transfer to hang until the OS timeout (seconds).
* @param promise - The transfer promise
* @param timeoutMs - Reject after this many ms (0 disables)
* @param label - Description used in the timeout error
*/
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (!timeoutMs) return await promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
* Base Controller class that provides common functionality for all controller types
*/
class BaseController {
  device: HIDDevice;
  model: string;
  finetuneMaxValue?: number; // to be set by subclasses

  // Optional capabilities; callers check for these before using them
  initializeCurrentOutputState?(): Promise<void>;
  resetSpeakerSettings?(): Promise<void>;

  constructor(device: HIDDevice) {
    this.device = device;
    this.model = "undefined"; // to be set by subclasses
  }

  getModel(): string {
    return this.model;
  }

  /**
  * Get the underlying HID device
  * @returns The HID device
  */
  getDevice(): HIDDevice {
    return this.device;
  }

  getInputConfig(): InputConfig {
    throw new Error('getInputConfig() must be implemented by subclass');
  }

  /**
   * Get the maximum value for finetune data
   * @returns Maximum value for finetune adjustments
   */
  getFinetuneMaxValue(): number {
    if(!this.finetuneMaxValue) throw new Error('getFinetuneMaxValue() must be implemented by subclass');
    return this.finetuneMaxValue;
  }

  getNumberOfSticks(): number {
    return 0;
  }

  /**
  * Set input report handler
  * @param handler Input report handler function
  */
  setInputReportHandler(handler: HIDDevice['oninputreport']): void {
    this.device.oninputreport = handler;
  }

  /**
  * Allocate request buffer with proper size based on device feature reports
  * @param id Report ID
  * @param data Data array to include in the request
  * @returns Allocated request buffer
  */
  alloc_req(id: number, data: number[] = []): Uint8Array<ArrayBuffer> {
    const fr = this.device.collections[0].featureReports!;
    const [report] = fr.find(e => e.reportId === id)?.items || [];
    const maxLen = report?.reportCount || data.length;

    const len = Math.min(data.length, maxLen);
    const out = new Uint8Array(maxLen);
    out.set(data.slice(0, len));
    return out;
  }

  /**
  * Send feature report to device
  * @param reportId Report ID
  * @param data Data to send (if Array, will be processed through allocReq)
  */
  async sendFeatureReport(reportId: number, data: BufferSource | number[]): Promise<void> {
    // If data is an array, use allocReq to create proper buffer
    if (Array.isArray(data)) {
      data = this.alloc_req(reportId, data);
    }

    try {
      return await this.device.sendFeatureReport(reportId, data);
    } catch (error) {
      // HID doesn't throw proper Errors with stack (stack is "name: message") so generate a new stack here
      throw new Error((error as Error).stack);
    }
  }

  /**
  * Receive feature report from device.
  * @param reportId Report ID
  * @param timeoutMs Optional: reject if no response within this many
  *   ms. Off by default; used for probing reports a clone may ignore (which
  *   would otherwise hang the USB control transfer until the OS timeout).
  */
  async receiveFeatureReport(reportId: number, timeoutMs = 0): Promise<DataView> {
    return await withTimeout(
      this.device.receiveFeatureReport(reportId),
      timeoutMs,
      `receiveFeatureReport(0x${reportId.toString(16)})`);
  }

  /**
  * Close the HID device connection
  */
  async close(): Promise<void> {
    if (this.device?.opened) {
      await this.device.close();
    }
  }

  /**
  * Get the serial number of the device
  * @returns The device serial number
  */
  async getSerialNumber(): Promise<string> {
    throw new Error('getSerialNumber() must be implemented by subclass');
  }

  // Abstract methods that must be implemented by subclasses
  async getInfo(): Promise<ControllerInfo> {
    throw new Error('getInfo() must be implemented by subclass');
  }

  async flash(progressCallback: ProgressCallback | null = null): Promise<ActionResult | undefined> {
    throw new Error('flash() must be implemented by subclass');
  }

  async reset(): Promise<void> {
    throw new Error('reset() must be implemented by subclass');
  }

  async nvsLock(): Promise<OpResult> {
    throw new Error('nvsLock() must be implemented by subclass');
  }

  async nvsUnlock(): Promise<OpResult | void> {
    throw new Error('nvsUnlock() must be implemented by subclass');
  }

  async queryNvStatus(): Promise<NvStatus> {
    throw new Error('queryNvStatus() must be implemented by subclass');
  }

  async getInMemoryModuleData(): Promise<number[] | null> {
    throw new Error('getInMemoryModuleData() must be implemented by subclass');
  }

  async writeFinetuneData(data: number[]): Promise<void> {
    throw new Error('writeFinetuneData() must be implemented by subclass');
  }

  async calibrateSticksBegin(): Promise<OpResult> {
    throw new Error('calibrateSticksBegin() must be implemented by subclass');
  }

  async calibrateSticksEnd(): Promise<OpResult> {
    throw new Error('calibrateSticksEnd() must be implemented by subclass');
  }

  async calibrateSticksSample(): Promise<OpResult> {
    throw new Error('calibrateSticksSample() must be implemented by subclass');
  }

  async calibrateRangeBegin(): Promise<OpResult> {
    throw new Error('calibrateRangeBegin() must be implemented by subclass');
  }

  async calibrateRangeEnd(): Promise<OpResult> {
    throw new Error('calibrateRangeEnd() must be implemented by subclass');
  }

  parseDeviceSpecificInputs(data: DataView): Record<string, number> {
    return {};
  }

  parseBatteryStatus(data: DataView): BatteryStatus {
    throw new Error('parseBatteryStatus() must be implemented by subclass');
  }

  async setAdaptiveTrigger(left: TriggerSetting, right: TriggerSetting): Promise<ActionResult | void> {
    // Default no-op implementation for controllers that don't support adaptive triggers
    return { success: true, message: "This controller does not support adaptive triggers" };
  }

  async setVibration(heavyLeft = 0, lightRight = 0): Promise<ActionResult | void> {
    // Default no-op implementation for controllers that don't support vibration
    return { success: true, message: "This controller does not support vibration" };
  }

  async setAdaptiveTriggerPreset(config: unknown): Promise<ActionResult | void> {
    // Default no-op implementation for controllers that don't support adaptive trigger presets
    return { success: true, message: "This controller does not support adaptive trigger presets" };
  }

  async setSpeakerTone(output: AudioOutput = 'speaker'): Promise<ActionResult | void> {
    // Default no-op implementation for controllers that don't support speaker audio
    return { success: true, message: "This controller does not support speaker audio" };
  }

  async resetLights(): Promise<ActionResult | void> {
    // Default no-op implementation for controllers that don't support controllable lights
    return { success: true, message: "This controller does not support controllable lights" };
  }

  async setMuteLed(mode: number): Promise<ActionResult | void> {
    // Default no-op implementation for controllers that don't support mute LED
    return { success: true, message: "This controller does not support mute LED" };
  }

  async setLightbarColor(r: number, g: number, b: number): Promise<ActionResult | void> {
    // Default no-op implementation for controllers that don't support lightbar colors
    return { success: true, message: "This controller does not support lightbar colors" };
  }

  async setPlayerIndicator(pattern: number): Promise<ActionResult | void> {
    // Default no-op implementation for controllers that don't support player indicators
    return { success: true, message: "This controller does not support player indicators" };
  }

  /**
   * Get the list of supported quick tests for this controller
   * @returns Array of supported test types
   */
  getSupportedQuickTests(): string[] {
    // Default implementation - supports all tests
    return ['usb', 'buttons', 'trackpad', 'imu', 'adaptive', 'haptic', 'lights', 'speaker', 'headphone', 'microphone'];
  }
}

export default BaseController;
