'use strict';

import { l } from '../../translations.js';
import { setCheckBadge } from './utils.js';

// Trackpad test tuning
const TRACKPAD_MOVE_PASS_UNITS = 500;      // accumulated finger travel (raw units, pad is 1920 wide) that counts as "movement"
const TRACKPAD_TRAIL_LENGTH = 150;         // trail points kept per finger for the drawing
const TRACKPAD_AUTOPASS_DELAY_MS = 1500;   // linger after all checks turn green before auto-passing
const TRACKPAD_FINGER_COLORS = ['#0d6efd', '#dc3545'];

/**
 * Trackpad test: checks touch tracking, two-finger detection and the click,
 * drawing the finger trails on a live canvas, with an auto-pass
 */
export class TrackpadTest {
  static id = 'trackpad';
  static testName = 'Trackpad';
  static icon = 'fas fa-fingerprint';

  constructor(host) {
    this.host = host;
    this.monitoring = false;
    this.stats = null;
    this.trails = [[], []];
    this.rafId = null;
    this.autoPassArmed = false;
  }

  content() {
    const instructions = l('Instructions');
    const pass = l('Pass');
    const fail = l('Fail');
    const trackpadTestDesc = l("This test checks the trackpad's touch tracking, two-finger detection, and click.");
    const trackpadInstructions = l('Draw on the trackpad below with one finger, touch it with two fingers at once, and click it until every check turns green.');
    const trackpadRestart = l('Restart');
    const trackpadCheck = (id, label) => `
      <div class="d-flex align-items-center me-3">
        <span class="badge bg-secondary test-check" id="${id}"><i class="far fa-circle"></i></span>
        <span class="ms-1">${label}</span>
      </div>`;
    return `
      <p class="mb-2">${trackpadTestDesc}</p>
      <p class="mb-2"><strong>${instructions}:</strong> ${trackpadInstructions}</p>
      <div class="d-flex flex-wrap mb-2">
        ${trackpadCheck('trackpad-check-move', l('Movement'))}
        ${trackpadCheck('trackpad-check-both', l('Two fingers'))}
        ${trackpadCheck('trackpad-check-click', l('Click'))}
      </div>
      <canvas id="trackpad-canvas" class="mb-2" style="width: 100%; height: 180px;"></canvas>
      <div class="d-flex gap-2 mt-3">
        <button type="button" class="btn btn-success" id="trackpad-pass-btn" onclick="markTestResult('trackpad', true)">
          <i class="fas fa-check me-1"></i><span>${pass}</span>
        </button>
        <button type="button" class="btn btn-danger" id="trackpad-fail-btn" onclick="markTestResult('trackpad', false)">
          <i class="fas fa-times me-1"></i><span>${fail}</span>
        </button>
        <button type="button" class="btn btn-outline-primary" id="trackpad-reset-btn" onclick="quickTestAction('trackpad', 'reset')">
          <i class="fas fa-redo me-1"></i><span>${trackpadRestart}</span>
        </button>
      </div>
    `;
  }

  start() {
    this.host.startIconAnimation('trackpad');
    this.monitoring = true;
    // Don't auto-close when revisiting a test whose checks were already all
    // green when it opened; pressing Restart re-arms the auto-pass
    this.autoPassArmed = !this.stats || !this._areAllChecksGreen(this.stats);
    // Keep progress if the section is collapsed and re-expanded mid-test
    if (!this.stats) {
      this._resetStats();
    }
    this._startRenderLoop();
  }

  stop() {
    this.host.stopIconAnimation('trackpad');
    this.monitoring = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this._cancelAutoPass();
  }

  /**
   * Restart the trackpad test: clear the checks and the finger trails,
   * and re-arm the auto-pass
   */
  reset() {
    this._resetStats();
    this.autoPassArmed = true;
  }

  /**
   * Record one sample while this test is active (rendering happens on
   * animation frames)
   */
  handleInput(changes, touchPoints) {
    this._recordSample(changes, touchPoints);
  }

  /**
   * Cancel a pending auto-pass countdown, if any
   */
  _cancelAutoPass() {
    if (this.stats?.autoPassTimer) {
      clearTimeout(this.stats.autoPassTimer);
      this.stats.autoPassTimer = null;
    }
  }

  /**
   * Reset trackpad activity stats and finger trails
   */
  _resetStats() {
    this._cancelAutoPass();
    this.trails = [[], []];
    this.stats = {
      travel: 0,
      bothFingersSeen: false,
      clicked: false,
      lastPoints: [null, null],
      autoPassTimer: null,
    };
  }

  /**
   * Record one trackpad sample: track finger travel, two-finger contact and
   * the click
   */
  _recordSample(changes, touchPoints) {
    if (!this.monitoring || !this.stats) return;
    const stats = this.stats;

    if (changes.touchpad === true) {
      stats.clicked = true;
    }

    if (Array.isArray(touchPoints)) {
      if (touchPoints.filter(p => p.active).length >= 2) {
        stats.bothFingersSeen = true;
      }
      touchPoints.slice(0, 2).forEach((point, i) => {
        const trail = this.trails[i];
        const last = stats.lastPoints[i];
        if (point.active) {
          // Same finger still down: count the travel since the last sample
          if (last && last.id === point.id) {
            stats.travel += Math.hypot(point.x - last.x, point.y - last.y);
          }
          trail.push({ x: point.x, y: point.y });
          if (trail.length > TRACKPAD_TRAIL_LENGTH) {
            trail.shift();
          }
          stats.lastPoints[i] = { id: point.id, x: point.x, y: point.y };
        } else if (last) {
          // Finger lifted: break the trail so lines don't connect strokes
          stats.lastPoints[i] = null;
          trail.push(null);
        }
      });
    }

    this._checkComplete();
  }

  /**
   * Auto-pass the trackpad test shortly after movement, both fingers and the
   * click have all been seen
   */
  _checkComplete() {
    const stats = this.stats;
    if (!stats || stats.autoPassTimer || !this.autoPassArmed) return;
    if (!this._areAllChecksGreen(stats)) return;

    stats.autoPassTimer = setTimeout(() => {
      this.host.markTestResult('trackpad', true);
    }, TRACKPAD_AUTOPASS_DELAY_MS);
  }

  /**
   * True when movement, two-finger contact and the click have all been seen
   */
  _areAllChecksGreen(stats) {
    return stats.travel >= TRACKPAD_MOVE_PASS_UNITS && stats.bothFingersSeen && stats.clicked;
  }

  /**
   * Render the trackpad panel on animation frames while the test is active
   */
  _startRenderLoop() {
    if (this.rafId) return;
    const render = () => {
      if (!this.monitoring) {
        this.rafId = null;
        return;
      }
      this._renderPanel();
      this.rafId = requestAnimationFrame(render);
    };
    this.rafId = requestAnimationFrame(render);
  }

  /**
   * Update the trackpad check badges and redraw the pad: finger trails,
   * current finger positions, and a tint while the pad is clicked
   */
  _renderPanel() {
    const stats = this.stats;
    if (!stats) return;

    setCheckBadge('trackpad-check-move', stats.travel >= TRACKPAD_MOVE_PASS_UNITS);
    setCheckBadge('trackpad-check-both', stats.bothFingersSeen);
    setCheckBadge('trackpad-check-click', stats.clicked);

    const canvas = document.getElementById('trackpad-canvas');
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;

    // Match the backing store to the displayed size (handles devicePixelRatio)
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Fit the pad into the canvas preserving its physical aspect ratio.
    // Both pads report x up to ~1920; the DS4 pad is a little shallower.
    const padUnitsX = 1920;
    const padUnitsY = this.host.controller.getModel() === 'DS4' ? 943 : 1080;
    const scale = Math.min(width / padUnitsX, height / padUnitsY);
    const padW = padUnitsX * scale;
    const padH = padUnitsY * scale;
    const padX = (width - padW) / 2;
    const padY = (height - padH) / 2;
    const toCanvas = (p) => ({ x: padX + p.x * scale, y: padY + p.y * scale });

    // Pad outline, tinted while the pad is physically clicked
    ctx.fillStyle = this.host.controller.button_states.touchpad ? 'rgba(13, 110, 253, 0.25)' : 'rgba(128, 128, 128, 0.12)';
    ctx.fillRect(padX, padY, padW, padH);
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(padX, padY, padW, padH);

    this.trails.forEach((trail, i) => {
      ctx.strokeStyle = TRACKPAD_FINGER_COLORS[i];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let penDown = false;
      trail.forEach(point => {
        if (!point) {
          penDown = false;
          return;
        }
        const { x, y } = toCanvas(point);
        if (penDown) {
          ctx.lineTo(x, y);
        } else {
          ctx.moveTo(x, y);
          penDown = true;
        }
      });
      ctx.stroke();

      const current = this.stats.lastPoints[i];
      if (current) {
        const { x, y } = toCanvas(current);
        ctx.fillStyle = TRACKPAD_FINGER_COLORS[i];
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
}
