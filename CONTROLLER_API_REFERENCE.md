# DualSense Controller API Reference

This document describes the data structures, constants, and API calls used to interact with PlayStation controllers (DualSense, DualSense Edge, and DualShock 4) in the DualSense Tester application.

## Table of Contents

1. [Controller Types and Identification](#controller-types-and-identification)
2. [Connection Types](#connection-types)
3. [Data Structures](#data-structures)
4. [Input Report Offsets](#input-report-offsets)
5. [API Functions](#api-functions)
6. [Constants and Enums](#constants-and-enums)
7. [Controller-Specific Differences](#controller-specific-differences)
8. [Communication Protocols](#communication-protocols)
9. [Output Commands and Control](#output-commands-and-control)

## Controller Types and Identification

### Vendor and Product IDs

```typescript
export const VENDOR_ID_SONY = 0x054C

// Product IDs
export const PRODUCT_ID_DUALSHOCK_V1 = 0x05C4
export const PRODUCT_ID_DUALSHOCK_V2 = 0x09CC
export const PRODUCT_ID_DUALSENSE = 0x0CE6
export const PRODUCT_ID_DUALSENSE_EDGE = 0x0DF2

// HID Usage
export const USAGE_PAGE_GENERIC_DESKTOP = 0x0001
export const USAGE_ID_GD_GAME_PAD = 0x0005
```

### Controller Type Enum

```typescript
export enum DualSenseType {
  DualSense = 'DualSense',
  DualSenseEdge = 'DualSenseEdge',
  Unknown = 'Unknown',
}
```

## Connection Types

```typescript
export enum DualSenseConnectionType {
  Unknown = 'unknown',
  /** The controller is connected over USB */
  USB = 'usb',
  /** The controller is connected over Bluetooth */
  Bluetooth = 'bluetooth',
}

export enum DeviceConnectionType {
  USB = 'usb',
  Bluetooth = 'bluetooth',
  Unknown = 'unknown',
}
```

### Connection Type Detection

Controllers are identified by their input report sizes:

- **DualSense/DualSense Edge USB**: 504 bits (63 bytes)
- **DualSense/DualSense Edge Bluetooth**: 616 bits (77 bytes)
- **DualShock 4 USB**: 504 bits (63 bytes)
- **DualShock 4 Bluetooth**: Variable (uses different detection logic)

## Data Structures

### Device Information

```typescript
export interface DeviceItem {
  deviceName: string
  connectionType: DeviceConnectionType
  device: HIDDevice
}

export interface DualSenseDeviceInfo {
  deviceName: string
  vendorId: number
  productId: number
  atSerialNoLeft: string
  atSerialNoRight: string
  atMotorInfoLeft: string
  atMotorInfoRight: string
}
```

### Firmware Information

```typescript
export interface DualSenseFirmwareInfo {
  buildDate: string
  buildTime: string
  fwType: number
  swSeries: number
  hwInfo: number
  mainFwVersion: number
  deviceInfo: DataView // 12 bytes
  updateVersion: number
  updateImageInfo: DataView // 1 byte
  sblFwVersion: number
  dspFwVersion: number
  spiderDspFwVersion: number
  pcbaId: bigint
  pcbaIdFull: DataView // 24 bytes
  uniqueId: bigint
  bdMacAddress: bigint
  btPatchVersion: number
  serialNumber: DataView // 32 bytes
  assemblePartsInfo: DataView // 32 bytes
  batteryBarcode: DataView // 32 bytes
  vcmRightBarcode: DataView // 32 bytes
  vcmLeftBarcode: DataView // 32 bytes
  individualDataVerifyStatus: string
}
```

### Input Data Structure

```typescript
export interface DualSenseVisualResult {
  // Digital buttons
  triangle: boolean
  circle: boolean
  square: boolean
  cross: boolean
  r3: boolean
  l3: boolean
  option: boolean
  create: boolean
  r2: boolean
  l2: boolean
  r1: boolean
  l1: boolean
  mic: boolean
  touchpad: boolean
  ps: boolean
  up: boolean
  right: boolean
  down: boolean
  left: boolean
  fnR: boolean // DualSense Edge only
  fnL: boolean // DualSense Edge only
  bR: boolean // DualSense Edge only
  bL: boolean // DualSense Edge only

  // Analog inputs
  triggerLevelL: number
  triggerLevelR: number
  triggerL: number
  triggerR: number
  stickLX: number
  stickLY: number
  stickRX: number
  stickRY: number

  // Motion sensors
  gyroPitch: number
  gyroYaw: number
  gyroRoll: number
  accelX: number
  accelY: number
  accelZ: number

  // Touchpad
  touchpadID1: number
  touchpadX1: number
  touchpadY1: number
  touchpadID2: number
  touchpadX2: number
  touchpadY2: number
}

export interface TouchPadItem {
  id: number
  x: number
  y: number
}
```

## Input Report Offsets

### DualSense/DualSense Edge

```typescript
// USB Connection (offset starts at 0)
export const inputReportOffsetUSB = {
  analogStickLX: 0,
  analogStickLY: 1,
  analogStickRX: 2,
  analogStickRY: 3,
  analogTriggerL: 4,
  analogTriggerR: 5,
  sequenceNum: 6,
  digitalKeys: 7,
  incrementalNumber: 11,
  gyroPitch: 15,
  gyroYaw: 17,
  gyroRoll: 19,
  accelX: 21,
  accelY: 23,
  accelZ: 25,
  motionTimeStamp: 27,
  motionTemperature: 31,
  touchData: 32,
  atStatus0: 41,
  atStatus1: 42,
  hostTimestamp: 43,
  atStatus2: 47,
  deviceTimestamp: 48,
  status0: 52,
  status1: 53,
  status2: 54,
  aesCmac: 55,
  seqTag: 0,
  crc32: 0,
}

// Bluetooth Connection (offset starts at 1, crc32 at 73)
export const inputReportOffsetBluetooth = {
  // All offsets +1 from USB
  crc32: 73,
  // ... other fields offset by +1
}
```

### DualShock 4

```typescript
// USB Connection
export const inputReportOffsetUSB = {
  analogStickLX: 0,
  analogStickLY: 1,
  analogStickRX: 2,
  analogStickRY: 3,
  digitalKeys: 4,
  sequenceNum: 6,
  analogTriggerL: 7,
  analogTriggerR: 8,
  motionTimeStamp: 9,
  motionTemperature: 11,
  gyroPitch: 12,
  gyroYaw: 14,
  gyroRoll: 16,
  accelX: 18,
  accelY: 20,
  accelZ: 22,
  reserved2: 24,
  status: 29,
  reserved3: 31,
  touchData: 34,
  seqTag: 0,
  crc32: 0,
}

// Bluetooth Connection (offset starts at 2, crc32 at 73)
export const inputReportOffsetBluetooth = {
  // All offsets +2 from USB
  crc32: 73,
  // ... other fields offset by +2
}
```

## API Functions

### Connection and Communication

```typescript
// Request HID device access
async function requestHIDDevice(filters: HIDDeviceFilter[]): Promise<boolean>

// Send output reports
function sendOutputReportFactory(item: DeviceItem): (data: ArrayBuffer) => Promise<void>

// Send/receive feature reports
async function sendFeatureReport(item: DeviceItem, reportId: number, data: ArrayBuffer): Promise<void>
async function receiveFeatureReport(item: DeviceItem, reportId: number): Promise<DataView>
```

### DualSense-Specific Test Commands

```typescript
// Send test commands to DualSense controllers
async function sendTestCommand(
  item: DeviceItem,
  deviceId: DualSenseTestDeviceId,
  actionId: DualSenseTestActionId,
  resultLength: number
): Promise<{ result: TestResult, report: DataView } | { result: TestResult, report: null }>

// Get device information
async function getPcbaId(item: DeviceItem): Promise<bigint | undefined>
async function getUniqueId(item: DeviceItem): Promise<bigint | undefined>
async function getBdMacAddress(item: DeviceItem): Promise<bigint | undefined>
async function getSerialNumber(item: DeviceItem): Promise<DataView | undefined>
async function getBatteryBarcode(item: DeviceItem): Promise<DataView | undefined>
```

### Audio Control

```typescript
// Control wave output for DualSense
async function controlWaveOut(
  item: DeviceItem,
  enable: boolean,
  waveDevice: 'headphone' | 'speaker'
): Promise<void>
```

### Data Processing

```typescript
// Normalize thumbstick values to [-1, +1] range
function normalizeThumbStickAxis(value: number): number

// Format version numbers
function formatUpdateVersion(ver: number): string
function formatThreePartVersion(ver: number): string
function formatDspVersion(ver: number): string
```

## Constants and Enums

### Test Device IDs (DualSense)

```typescript
export enum DualSenseTestDeviceId {
  SYSTEM = 1,
  POWER = 2,
  MEMORY = 3,
  ANALOG_DATA = 4,
  TOUCH = 5,
  AUDIO = 6,
  ADAPTIVE_TRIGGER = 7,
  BULLET = 8,
  BLUETOOTH = 9,
  MOTION = 10,
  TRIGGER = 11,
  STICK = 12,
  LED = 13,
  BT_PATCH = 14,
  DSP_FW = 15,
  SPIDER_DSP_FW = 16,
  FINGER = 17,
  POSITION_TRACKING = 19,
  BUILTIN_MIC_CALIB_DATA = 20,
}
```

### Battery and Charging Status

```typescript
export enum ChargeStatus {
  DISCHARGING = 0,
  CHARGING = 1,
  COMPLETE = 2,
  ABNORMAL_VOLTAGE = 10,
  ABNORMAL_TEMPERATURE = 11,
  CHARGING_ERROR = 15,
}

export enum BatteryLevel {
  LEVEL1 = 0, // 0-9%
  LEVEL2 = 1, // 10-19%
  LEVEL3 = 2, // 20-29%
  LEVEL4 = 3, // 30-39%
  LEVEL5 = 4, // 40-49%
  LEVEL6 = 5, // 50-59%
  LEVEL7 = 6, // 60-69%
  LEVEL8 = 7, // 70-79%
  LEVEL9 = 8, // 80-89%
  LEVEL10 = 9, // 90-99%
  LEVEL11 = 10, // 100%
  UNKNOWN = 11,
}
```

### LED Control

```typescript
export enum PlayerLedControl {
  OFF = 0x00,
  PLAYER_1 = 0x04,
  PLAYER_2 = 0x0A,
  PLAYER_3 = 0x15,
  PLAYER_4 = 0x1B,
  ALL = 0x1F,
}

export enum MuteButtonLedControl {
  MIC_THRU,
  MIC_MUTED,
  ALL_MUTED,
}
```

## Controller-Specific Differences

### DualSense vs DualSense Edge

| Feature | DualSense | DualSense Edge |
|---------|-----------|----------------|
| Product ID | 0x0CE6 | 0x0DF2 |
| Additional Buttons | No | fnL, fnR, bL, bR |
| Profile Support | No | Yes (up to 3 profiles) |
| Profile Configuration | No | Yes (via test commands) |
| Adaptive Triggers | Yes | Yes |
| Haptic Feedback | Yes | Yes |
| Audio Control | Yes | Yes |

### DualSense vs DualShock 4

| Feature | DualSense | DualShock 4 |
|---------|-----------|-------------|
| Product ID | 0x0CE6 | 0x09CC/0x05C4 |
| Adaptive Triggers | Yes | No |
| Haptic Feedback | Yes | Limited |
| Audio Control | Yes | Limited |
| Motion Sensors | 6-axis | 6-axis |
| Touchpad | Yes | Yes |
| Light Bar | RGB LED | RGB Light Bar |
| Test Commands | Extensive | Limited |

### Input Report Differences

#### DualSense/DualSense Edge
- **USB Report Size**: 63 bytes
- **Bluetooth Report Size**: 77 bytes
- **Motion Data**: 16-bit signed integers
- **Adaptive Trigger Status**: Available
- **Profile Information**: Available (Edge only)

#### DualShock 4
- **USB Report Size**: 63 bytes
- **Bluetooth Report Size**: 77 bytes
- **Motion Data**: 16-bit signed integers
- **Adaptive Trigger Status**: Not available
- **Profile Information**: Not available

## Communication Protocols

### Report IDs

#### Output Reports
- **DualSense USB**: 0x02
- **DualSense Bluetooth**: 0x31
- **DualShock 4 USB**: 0x05
- **DualShock 4 Bluetooth**: 0x11

#### Feature Reports
- **0x80**: Test command (DualSense)
- **0x81**: Test result (DualSense)
- **0x22**: Bluetooth patch info (DualSense)
- **0x84/0x85**: Individual data verify (DualSense)

### CRC32 Checksums

Bluetooth communications require CRC32 checksums:

```typescript
// Output report checksum (DualSense)
function fillOutputReportChecksum(reportId: number, reportData: Uint8Array): void

// Feature report checksum (DualSense)
function fillFeatureReportChecksum(reportId: number, reportData: Uint8Array): void

// Profile array checksum (DualSense Edge)
function fillProfileArrayReportChecksum(byteArray: Uint8Array[]): void
```

### Checksum Calculation

```typescript
function crc32(prefixBytes: number[], dataView: DataView, suffixBytes: number[] = []): number
```

**Prefix bytes:**
- Output reports: `[0xA2, reportId]`
- Feature reports: `[0x53, reportId]`

## Output Commands and Control

### OutputStruct Class

The `OutputStruct` class is the primary interface for sending commands to DualSense controllers. It provides a structured way to control all output features including vibration, lights, audio, and adaptive triggers.

#### OutputStruct Structure (DualSense/DualSense Edge)

```typescript
export class OutputStruct {
  // Control flags - determine which features are active
  validFlag0: Ref<number> // Controls vibration, triggers, audio
  validFlag1: Ref<number> // Controls LEDs, mute button
  validFlag2: Ref<number> // Controls LED brightness

  // Vibration motors (0-255)
  bcVibrationRight: Ref<number> // Light rumble motor
  bcVibrationLeft: Ref<number> // Heavy rumble motor

  // Audio control (0-255)
  headphoneVolume: Ref<number>
  speakerVolume: Ref<number>
  micVolume: Ref<number>
  audioControl: Ref<number> // Audio routing control
  audioControl2: Ref<number> // Additional audio control

  // LED and indicator control
  muteLedControl: Ref<number> // Mute button LED state
  powerSaveMuteControl: Ref<number>
  lightbarSetup: Ref<number> // Lightbar configuration
  ledBrightness: Ref<number> // Player LED brightness (0-2)
  playerIndicator: Ref<number> // Player LED pattern
  ledCRed: Ref<number> // Lightbar red (0-255)
  ledCGreen: Ref<number> // Lightbar green (0-255)
  ledCBlue: Ref<number> // Lightbar blue (0-255)

  // Adaptive triggers - Right trigger
  adaptiveTriggerRightMode: Ref<number> // Trigger effect mode
  adaptiveTriggerRightParam0: Ref<number> // Effect parameter 0
  adaptiveTriggerRightParam1: Ref<number> // Effect parameter 1
  adaptiveTriggerRightParam2: Ref<number> // Effect parameter 2
  adaptiveTriggerRightParam3: Ref<number> // Effect parameter 3
  adaptiveTriggerRightParam4: Ref<number> // Effect parameter 4
  adaptiveTriggerRightParam5: Ref<number> // Effect parameter 5
  adaptiveTriggerRightParam6: Ref<number> // Effect parameter 6
  adaptiveTriggerRightParam7: Ref<number> // Effect parameter 7
  adaptiveTriggerRightParam8: Ref<number> // Effect parameter 8
  adaptiveTriggerRightParam9: Ref<number> // Effect parameter 9

  // Adaptive triggers - Left trigger
  adaptiveTriggerLeftMode: Ref<number> // Trigger effect mode
  adaptiveTriggerLeftParam0: Ref<number> // Effect parameter 0
  adaptiveTriggerLeftParam1: Ref<number> // Effect parameter 1
  adaptiveTriggerLeftParam2: Ref<number> // Effect parameter 2
  adaptiveTriggerLeftParam3: Ref<number> // Effect parameter 3
  adaptiveTriggerLeftParam4: Ref<number> // Effect parameter 4
  adaptiveTriggerLeftParam5: Ref<number> // Effect parameter 5
  adaptiveTriggerLeftParam6: Ref<number> // Effect parameter 6
  adaptiveTriggerLeftParam7: Ref<number> // Effect parameter 7
  adaptiveTriggerLeftParam8: Ref<number> // Effect parameter 8
  adaptiveTriggerLeftParam9: Ref<number> // Effect parameter 9

  // Haptic feedback
  hapticVolume: Ref<number> // Haptic feedback intensity

  // Reserved fields for future use
  Reserved0: Ref<number>
  Reserved1: Ref<number>
  Reserved2: Ref<number>
  Reserved3: Ref<number>
  Reserved7: Ref<number>
  Reserved8: Ref<number>

  // Generate binary report data
  get reportData(): Uint8Array
}
```

#### OutputStruct Structure (DualShock 4)

```typescript
export class OutputStruct {
  // Hardware and audio control
  hwControl: Ref<number> // Hardware control flags (default: 0xC4)
  audioControl: Ref<number> // Audio control settings

  // Control flags
  validFlag0: Ref<number> // Feature enable flags
  validFlag1: Ref<number> // Additional feature flags

  // Vibration motors (0-255)
  motorRight: Ref<number> // Light rumble motor
  motorLeft: Ref<number> // Heavy rumble motor

  // Light bar control (0-255)
  ledRed: Ref<number> // Light bar red component
  ledGreen: Ref<number> // Light bar green component
  ledBlue: Ref<number> // Light bar blue component
  ledBlinkOn: Ref<number> // Blink on duration
  ledBlinkOff: Ref<number> // Blink off duration

  reserved: Ref<number> // Reserved field

  // Generate binary report data (73 bytes for DualShock 4)
  get reportData(): Uint8Array
}
```

### Valid Flags System

The valid flags system controls which features are active in the output report. Each bit in the valid flag bytes corresponds to a specific feature:

#### ValidFlag0 (DualSense)
- **Bit 0**: Vibration motors enable
- **Bit 1**: Vibration motors control
- **Bit 2**: Adaptive trigger left enable
- **Bit 3**: Adaptive trigger right enable
- **Bit 4**: Headphone volume control
- **Bit 5**: Speaker volume control
- **Bit 6**: Microphone volume control
- **Bit 7**: Audio control enable

#### ValidFlag1 (DualSense)
- **Bit 0**: Mute LED control
- **Bit 1**: Power save control
- **Bit 2**: Lightbar color control
- **Bit 3**: Release lightbar control
- **Bit 4**: Player LED control

#### ValidFlag2 (DualSense)
- **Bit 0**: Player LED brightness control

### Adaptive Trigger Effects

The DualSense controller supports several adaptive trigger effect modes:

#### Trigger Effect Modes

```typescript
enum TriggerEffectMode {
  OFF = 0x00, // No effect
  RESISTANCE = 0x01, // Constant resistance
  TRIGGER = 0x02, // Trigger-like effect with release
  AUTO_TRIGGER = 0x06, // Automatic trigger with vibration
}
```

#### Effect Parameters by Mode

**Resistance Mode (0x01)**
- `Param0`: Start position (0-255) - where resistance begins
- `Param1`: Force strength (0-255) - resistance intensity

**Trigger Mode (0x02)**
- `Param0`: Start position (0-255) - where trigger effect begins
- `Param1`: End position (0-255) - where trigger releases
- `Param2`: Force strength (0-255) - trigger resistance

**Auto Trigger Mode (0x06)**
- `Param0`: Frequency (0-15) - vibration frequency
- `Param1`: Force strength (0-255) - effect intensity
- `Param2`: Start position (0-255) - where effect begins

### Sending Output Commands

#### Basic Output Command Flow

```typescript
// 1. Create OutputStruct instance
const outputStruct = new OutputStruct()

// 2. Configure desired features
outputStruct.bcVibrationLeft.value = 128 // Set left motor to 50%
outputStruct.bcVibrationRight.value = 64 // Set right motor to 25%

// 3. Set appropriate valid flags
outputStruct.validFlag0.value |= 0x03 // Enable vibration (bits 0 and 1)

// 4. Get binary report data
const reportData = outputStruct.reportData

// 5. Send via output report
const sendOutputReport = sendOutputReportFactory(deviceItem)
await sendOutputReport(reportData.buffer)

// 6. Clear valid flags after sending (optional)
outputStruct.validFlag0.value &= ~0x03 // Disable vibration flags
```

#### Advanced Example: Adaptive Trigger Configuration

```typescript
// Configure right trigger with resistance effect
const outputStruct = new OutputStruct()

// Set trigger mode to resistance
outputStruct.adaptiveTriggerRightMode.value = 0x01

// Configure resistance parameters
outputStruct.adaptiveTriggerRightParam0.value = 40 // Start at 40/255 position
outputStruct.adaptiveTriggerRightParam1.value = 230 // High resistance force

// Enable adaptive trigger
outputStruct.validFlag0.value |= 0x08 // Bit 3 for right trigger

// Send command
const reportData = outputStruct.reportData
await sendOutputReport(reportData.buffer)
```

#### LED and Lightbar Control

```typescript
// Set lightbar color to purple
outputStruct.ledCRed.value = 128
outputStruct.ledCGreen.value = 0
outputStruct.ledCBlue.value = 255

// Set player indicator to player 2
outputStruct.playerIndicator.value = PlayerLedControl.PLAYER_2

// Set LED brightness to medium
outputStruct.ledBrightness.value = 1

// Enable LED controls
outputStruct.validFlag1.value |= 0x14 // Bits 2 and 4 for lightbar and player LED
outputStruct.validFlag2.value |= 0x01 // Bit 0 for brightness control

// Send command
const reportData = outputStruct.reportData
await sendOutputReport(reportData.buffer)
```

### Connection-Specific Behavior

#### USB Connection
- **Report ID**: 0x02 (DualSense), 0x05 (DualShock 4)
- **Data Size**: Exact OutputStruct size (52 bytes for DualSense)
- **Checksum**: Not required
- **Sequence**: Not required

#### Bluetooth Connection
- **Report ID**: 0x31 (DualSense), 0x11 (DualShock 4)
- **Data Size**: 77 bytes total
- **Sequence Number**: Required in first byte (upper 4 bits)
- **Header**: 0x10 in second byte
- **Payload**: OutputStruct data starting at byte 2
- **Checksum**: CRC32 in last 4 bytes

#### Bluetooth Output Report Structure

```typescript
function sendOutputReportBluetooth(outputData: ArrayBuffer) {
  const reportData = new Uint8Array(77)

  // Sequence number (increments 0-255, then wraps)
  reportData[0] = (outputSeq << 4)
  outputSeq = (outputSeq + 1) % 256

  // Header byte
  reportData[1] = 0x10

  // Payload data
  reportData.set(new Uint8Array(outputData), 2)

  // Calculate and set CRC32 checksum
  fillOutputReportChecksum(0x31, reportData)

  // Send report
  await device.sendReport(0x31, reportData)
}
```

### Error Handling and Best Practices

#### Async Lock Pattern
```typescript
const outputReportLock = createAsyncLock()

async function sendOutputReport(beforeFn?: () => void, afterFn?: () => void) {
  await outputReportLock(async () => {
    beforeFn?.() // Set valid flags
    const reportData = outputStruct.reportData
    await sendOutputReportFactory(device)(reportData.buffer)
    afterFn?.() // Clear valid flags
  })
}
```

#### Valid Flag Management
```typescript
// Helper functions for flag management
function setValidFlag(target: Ref<number>, flagBit: number) {
  target.value |= (1 << flagBit)
}

function clearValidFlag(target: Ref<number>, flagBit: number) {
  target.value &= ~(1 << flagBit)
}

// Usage example
setValidFlag(outputStruct.validFlag0, 0) // Enable vibration
clearValidFlag(outputStruct.validFlag0, 0) // Disable vibration
```

## Usage Examples

### Basic Controller Detection

```typescript
// Request controller access
const filters = [
  {
    vendorId: VENDOR_ID_SONY,
    productId: PRODUCT_ID_DUALSENSE,
    usagePage: USAGE_PAGE_GENERIC_DESKTOP,
    usage: USAGE_ID_GD_GAME_PAD,
  }
]

await requestHIDDevice(filters)
```

### Reading Input Data

```typescript
// Set up input report handler
device.addEventListener('inputreport', (event: HIDInputReportEvent) => {
  const data = event.data
  const reportId = event.reportId

  // Parse based on connection type and controller model
  const offset = connectionType === 'usb' ? inputReportOffsetUSB : inputReportOffsetBluetooth

  const leftStickX = data.getUint8(offset.analogStickLX)
  const leftStickY = data.getUint8(offset.analogStickLY)
  // ... parse other data
})
```

### Complete Output Control Example

```typescript
// Initialize controller communication
const deviceItem = { device, connectionType }
const sendOutputReport = sendOutputReportFactory(deviceItem)
const outputStruct = new OutputStruct()

// Create async lock for thread safety
const outputLock = createAsyncLock()

async function controllerCommand(setupFn: () => void, cleanupFn?: () => void) {
  await outputLock(async () => {
    setupFn()
    const reportData = outputStruct.reportData
    await sendOutputReport(reportData.buffer)
    cleanupFn?.()
  })
}

// Example: Pulse vibration
await controllerCommand(
  () => {
    outputStruct.bcVibrationLeft.value = 255
    outputStruct.bcVibrationRight.value = 128
    outputStruct.validFlag0.value |= 0x03
  },
  () => {
    outputStruct.validFlag0.value &= ~0x03
  }
)

// Example: Set adaptive trigger effect
await controllerCommand(
  () => {
    outputStruct.adaptiveTriggerRightMode.value = 0x02 // Trigger mode
    outputStruct.adaptiveTriggerRightParam0.value = 15 // Start position
    outputStruct.adaptiveTriggerRightParam1.value = 100 // End position
    outputStruct.adaptiveTriggerRightParam2.value = 255 // Force
    outputStruct.validFlag0.value |= 0x08 // Enable right trigger
  },
  () => {
    outputStruct.validFlag0.value &= ~0x08
  }
)
```

This reference provides a comprehensive overview of the data structures, constants, and API calls used to interact with PlayStation controllers in the DualSense Tester application. The differences between controller models are clearly outlined, making it easier to implement controller-specific functionality.
