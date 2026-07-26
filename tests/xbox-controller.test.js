import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
if (!globalThis.navigator) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {},
  });
}
globalThis.$ = () => ({
  prop() { return this; },
  toggleClass() { return this; },
});

const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};

const { default: XboxController, isXboxGamepad, isXboxCompatibleGamepad } =
  await import('../js/controllers/xbox-controller.js');
const { initControllerManager } =
  await import('../js/controller-manager.js');

function makeGamepad() {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  buttons[0] = { pressed: true, value: 1 };   // A
  buttons[6] = { pressed: true, value: 0.5 }; // LT
  buttons[12] = { pressed: true, value: 1 };  // D-pad up

  return {
    connected: true,
    index: 0,
    id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
    mapping: 'standard',
    axes: [0.25, -0.5, -1, 1],
    buttons,
  };
}

test('recognizes official Xbox and XInput identifiers', () => {
  assert.equal(isXboxGamepad(makeGamepad()), true);
  assert.equal(isXboxGamepad({
    ...makeGamepad(),
    id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
  }), true);
  assert.equal(isXboxGamepad({
    ...makeGamepad(),
    id: 'Generic USB Gamepad',
  }), false);
  assert.equal(isXboxCompatibleGamepad({
    ...makeGamepad(),
    id: 'Generic USB Gamepad',
  }), true);
});

test('maps a standard Xbox snapshot into the shared controller state', () => {
  const gamepad = makeGamepad();
  Object.defineProperty(globalThis.navigator, 'getGamepads', {
    configurable: true,
    value: () => [gamepad],
  });

  const manager = initControllerManager();
  manager.setControllerInstance(new XboxController(gamepad));

  let result;
  manager.setInputHandler((value) => { result = value; });
  manager.processControllerInput({ gamepad });

  assert.deepEqual(result.changes.sticks, {
    left: { x: 0.25, y: -0.5 },
    right: { x: -1, y: 1 },
  });
  assert.equal(result.changes.cross, true);
  assert.equal(result.changes.up, true);
  assert.equal(result.changes.l2_analog, 128);
  assert.equal(result.batteryStatus.unavailable, true);
  assert.equal(result.batteryStatus.bat_txt, '');
});

test('uses the requested duration and motor magnitudes for Xbox rumble', async () => {
  const effects = [];
  const gamepad = {
    ...makeGamepad(),
    vibrationActuator: {
      effects: ['dual-rumble'],
      async playEffect(type, parameters) {
        effects.push({ type, parameters });
        return 'complete';
      },
    },
  };
  Object.defineProperty(globalThis.navigator, 'getGamepads', {
    configurable: true,
    value: () => [gamepad],
  });

  const controller = new XboxController(gamepad);
  const manager = initControllerManager();
  manager.setControllerInstance(controller);
  assert.deepEqual(controller.getSupportedQuickTests(), ['buttons']);

  await manager.setVibration({ heavyLeft: 255, lightRight: 128, duration: 650 });

  assert.equal(effects.length, 1);
  assert.equal(effects[0].type, 'dual-rumble');
  assert.equal(effects[0].parameters.duration, 650);
  assert.equal(effects[0].parameters.strongMagnitude, 1);
  assert.equal(effects[0].parameters.weakMagnitude, 128 / 255);
});

test('does not offer the Xbox haptic quick test', () => {
  const gamepad = makeGamepad();
  Object.defineProperty(globalThis.navigator, 'getGamepads', {
    configurable: true,
    value: () => [gamepad],
  });

  const controller = new XboxController(gamepad);
  assert.deepEqual(controller.getSupportedQuickTests(), ['buttons']);
});

test('supports the legacy pulse method on vibrationActuator', async () => {
  const pulses = [];
  const gamepad = {
    ...makeGamepad(),
    vibrationActuator: {
      async pulse(magnitude, duration) {
        pulses.push({ magnitude, duration });
        return true;
      },
    },
  };
  Object.defineProperty(globalThis.navigator, 'getGamepads', {
    configurable: true,
    value: () => [gamepad],
  });

  const controller = new XboxController(gamepad);
  const result = await controller.setVibration(128, 255, 700);

  assert.deepEqual(controller.getSupportedQuickTests(), ['buttons']);
  assert.equal(result.backend, 'pulse');
  assert.deepEqual(pulses, [{ magnitude: 1, duration: 700 }]);
});

test('uses trigger-rumble when it is the actuator-advertised effect', async () => {
  const effects = [];
  const gamepad = {
    ...makeGamepad(),
    vibrationActuator: {
      effects: ['trigger-rumble'],
      async playEffect(type, parameters) {
        effects.push({ type, parameters });
        return 'complete';
      },
    },
  };
  Object.defineProperty(globalThis.navigator, 'getGamepads', {
    configurable: true,
    value: () => [gamepad],
  });

  const controller = new XboxController(gamepad);
  const result = await controller.setVibration(255, 255, 900);

  assert.equal(result.backend, 'playEffect:trigger-rumble');
  assert.equal(effects[0].type, 'trigger-rumble');
  assert.equal(effects[0].parameters.duration, 900);
});
