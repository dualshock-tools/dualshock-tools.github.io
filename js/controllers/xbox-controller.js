'use strict';

import BaseController from './base-controller.js';
import { l } from '../translations.js';

// Xbox controllers use the W3C Standard Gamepad layout. The internal names
// match the existing shared UI: A/B/X/Y correspond to cross/circle/square/triangle.
export const XBOX_BUTTON_MAP = [
  { name: 'cross', button: 0, svg: 'Cross' },       // A
  { name: 'circle', button: 1, svg: 'Circle' },     // B
  { name: 'square', button: 2, svg: 'Square' },     // X
  { name: 'triangle', button: 3, svg: 'Triangle' }, // Y
  { name: 'l1', button: 4, svg: 'L1' },             // LB
  { name: 'r1', button: 5, svg: 'R1' },             // RB
  { name: 'l2', button: 6, svg: 'L2' },             // LT
  { name: 'r2', button: 7, svg: 'R2' },             // RT
  { name: 'create', button: 8, svg: 'Create' },     // View
  { name: 'options', button: 9, svg: 'Options' },   // Menu
  { name: 'l3', button: 10, svg: 'L3' },
  { name: 'r3', button: 11, svg: 'R3' },
  { name: 'up', button: 12 },
  { name: 'down', button: 13 },
  { name: 'left', button: 14 },
  { name: 'right', button: 15 },
  { name: 'ps', button: 16, svg: 'PS' },             // Xbox button
];

const XBOX_INPUT_CONFIG = {
  type: 'gamepad',
  buttonMap: XBOX_BUTTON_MAP,
  axes: {
    leftX: 0,
    leftY: 1,
    rightX: 2,
    rightY: 3,
  },
  triggerButtons: {
    left: 6,
    right: 7,
  },
};

export function isXboxGamepad(gamepad) {
  if (!gamepad?.connected) return false;
  const id = gamepad.id || '';
  return /xbox|xinput|microsoft|vendor:\s*045e|vendor=045e/i.test(id);
}

/**
 * Gamepad.id is intentionally browser-defined, so an Xbox controller can have
 * a generic name. Once the user explicitly chooses the Xbox flow, a standard
 * two-stick gamepad is a safe compatibility fallback.
 */
export function isXboxCompatibleGamepad(gamepad) {
  if (!gamepad?.connected) return false;
  if (isXboxGamepad(gamepad)) return true;
  return gamepad.axes?.length >= 4 && gamepad.buttons?.length >= 16;
}

function getCurrentGamepad(index) {
  return navigator.getGamepads?.()[index] || null;
}

class XboxController extends BaseController {
  constructor(gamepad) {
    super(null);
    this.model = 'XBOX';
    this.gamepadIndex = gamepad.index;
    this.gamepadId = gamepad.id || 'Xbox Controller';
    this.mapping = gamepad.mapping || '';
    this.animationFrame = null;
    this.inputCallback = null;
  }

  getInputConfig() {
    return XBOX_INPUT_CONFIG;
  }

  getNumberOfSticks() {
    return 2;
  }

  getDevice() {
    return getCurrentGamepad(this.gamepadIndex);
  }

  getSerialNumber() {
    // The Gamepad API deliberately does not expose unique device identifiers.
    return Promise.resolve(null);
  }

  async getInfo() {
    const gamepad = this.getDevice();
    if (!gamepad?.connected) {
      return { ok: false, error: new Error('Xbox controller is no longer connected') };
    }

    const connection = /bluetooth/i.test(gamepad.id) ? 'Bluetooth' : l('USB or wireless');
    const mapping = gamepad.mapping === 'standard' ? l('Standard gamepad') : (gamepad.mapping || l('Unknown'));
    return {
      ok: true,
      infoItems: [
        { key: l('Browser interface'), value: 'Gamepad API', cat: 'fw' },
        { key: l('Input mapping'), value: mapping, cat: 'fw' },
        { key: l('Connection'), value: connection, cat: 'hw' },
        { key: l('Axes'), value: String(gamepad.axes.length), cat: 'hw' },
        { key: l('Buttons'), value: String(gamepad.buttons.length), cat: 'hw' },
      ],
      disable_bits: 0,
    };
  }

  startInput(handler) {
    this.inputCallback = handler;

    const poll = () => {
      const gamepad = this.getDevice();
      if (!gamepad?.connected || !this.inputCallback) return;
      this.inputCallback({ gamepad });
      this.animationFrame = requestAnimationFrame(poll);
    };

    poll();
  }

  stopInput() {
    this.inputCallback = null;
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  async close() {
    this.stopInput();
  }

  parseBatteryStatus() {
    // Battery information is not part of the standard Gamepad API.
    return {
      charge_level: 100,
      cable_connected: false,
      is_charging: false,
      is_error: false,
      unavailable: true,
    };
  }

  getSupportedQuickTests() {
    // Wired Xbox rumble is not reliable through the browser Gamepad API, and
    // the USB interface cannot be claimed while the browser owns it for input.
    return ['buttons'];
  }

  getVibrationCapabilities() {
    const gamepad = this.getDevice();
    const actuators = [
      gamepad?.vibrationActuator,
      ...(gamepad?.hapticActuators ? Array.from(gamepad.hapticActuators) : []),
    ].filter((actuator, index, values) => actuator && values.indexOf(actuator) === index);

    return actuators.map(actuator => ({
      actuator,
      effects: actuator.effects ? Array.from(actuator.effects) : [],
      type: actuator.type || '',
      canPlayEffect: typeof actuator.playEffect === 'function',
      canPulse: typeof actuator.pulse === 'function',
    }));
  }

  supportsVibration() {
    return this.getVibrationCapabilities().some(({ canPlayEffect, canPulse }) => canPlayEffect || canPulse);
  }

  handlesVibrationDuration() {
    return true;
  }

  async setVibration(heavyLeft = 0, lightRight = 0, duration = 500) {
    const gamepad = this.getDevice();
    if (!gamepad?.connected) {
      throw new Error('Xbox controller is no longer connected');
    }

    const strongMagnitude = Math.max(0, Math.min(1, heavyLeft / 255));
    const weakMagnitude = Math.max(0, Math.min(1, lightRight / 255));
    const effectDuration = Math.max(1, duration || 1);
    const capabilities = this.getVibrationCapabilities();

    for (const capability of capabilities) {
      const { actuator, effects, type, canPlayEffect } = capability;
      if (!canPlayEffect) continue;

      if (!strongMagnitude && !weakMagnitude && typeof actuator.reset === 'function') {
        await actuator.reset();
        return { success: true, backend: 'reset', result: 'complete' };
      }

      const advertisedEffects = effects.filter(effect =>
        ['dual-rumble', 'trigger-rumble', 'vibration'].includes(effect)
      );
      const effectCandidates = [
        ...advertisedEffects,
        type === 'trigger-rumble' ? 'trigger-rumble' : null,
        type === 'vibration' ? 'vibration' : null,
        'dual-rumble',
      ].filter((effect, index, values) => effect && values.indexOf(effect) === index);

      for (const effect of effectCandidates) {
        try {
          const result = await actuator.playEffect(effect, {
            startDelay: 0,
            duration: effectDuration,
            strongMagnitude,
            weakMagnitude,
            leftTrigger: 0,
            rightTrigger: 0,
          });
          if (result === false) continue;
          return {
            success: result !== 'preempted',
            backend: `playEffect:${effect}`,
            result: result ?? 'complete',
            message: result === 'preempted' ? 'The vibration effect was preempted by the browser.' : undefined,
          };
        } catch (error) {
          if (!['NotSupportedError', 'TypeError'].includes(error?.name)) throw error;
        }
      }
    }

    for (const { actuator, canPulse } of capabilities) {
      if (!canPulse) continue;
      const result = await actuator.pulse(
        Math.max(strongMagnitude, weakMagnitude),
        strongMagnitude || weakMagnitude ? effectDuration : 1
      );
      if (result === false) continue;
      return {
        success: true,
        backend: 'pulse',
        result: result ?? 'complete',
      };
    }

    const exposed = capabilities.length > 0;
    return {
      success: false,
      message: exposed
        ? 'The browser exposed a haptic actuator but rejected every supported vibration command.'
        : 'Haptics are not exposed by this browser.',
    };
  }
}

export default XboxController;
