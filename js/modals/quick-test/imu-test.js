'use strict';

import { l } from '../../translations.js';
import { setCheckBadge } from './utils.js';

// IMU test tuning
const IMU_HISTORY_LENGTH = 512;       // samples kept for the sparkline charts (~2s at 250Hz)
const IMU_STILL_WINDOW = 50;          // consecutive samples that must be quiet to re-zero the gyro
const IMU_STILL_SPREAD_DPS = 4;       // max per-axis spread within the window to count as "still"
const IMU_GYRO_PASS_DPS = 120;        // peak rate that counts as "axis exercised"
const IMU_ACCEL_PASS_RANGE_G = 0.5;   // gravity swing that counts as "axis exercised"
const IMU_GYRO_BAR_SCALE_DPS = 360;   // full-deflection scale for the gyro bar meters
const IMU_ACCEL_BAR_SCALE_G = 1.5;    // full-deflection scale for the accel bar meters
const IMU_TEXT_INTERVAL_MS = 150;     // text readouts update slower than the bars for readability
const IMU_AUTOPASS_DELAY_MS = 1500;   // linger after all checks turn green before auto-passing
const IMU_AXES = ['x', 'y', 'z'];

/**
 * IMU test: checks that the gyroscope and accelerometer respond on all
 * axes, with live readouts, bar meters, sparkline charts and an auto-pass
 */
export class ImuTest {
  static id = 'imu';
  static testName = 'IMU (Gyroscope & Accelerometer)';
  static icon = 'fas fa-compass';

  constructor(host) {
    this.host = host;
    this.monitoring = false;
    this.dataHistory = [];
    this.gyroBias = { x: 0, y: 0, z: 0 };
    this.biasCaptured = false;
    this.stillWindow = [];
    this.stats = null;
    this.rafId = null;
    this.lastTextRender = 0;
    this.autoPassArmed = false;
  }

  content() {
    const instructions = l('Instructions');
    const pass = l('Pass');
    const fail = l('Fail');
    const imuTestDesc = l('This test checks that the gyroscope and accelerometer respond on all axes.');
    const imuInstructions = l('Rotate the controller a full turn around each axis until every check turns green.');
    const imuRestart = l('Restart');
    const imuAtRest = l('at rest');
    const imuValueStyle = 'style="min-width: 7ch; text-align: right;"';
    const imuAxisColors = { x: '#dc3545', y: '#198754', z: '#0d6efd' };
    const imuAxisRow = (axis, label, sensor, initial) => `
      <div class="d-flex align-items-center">
        <span style="color: ${imuAxisColors[axis]};">${label}</span>
        <span class="ms-auto" ${imuValueStyle} id="imu-${sensor}-${axis}">${initial}</span>
        <span class="badge bg-secondary ms-2 test-check" id="imu-check-${sensor}-${axis}"><i class="far fa-circle"></i></span>
      </div>
      <div class="imu-bar">
        <div class="imu-bar-fill" id="imu-bar-${sensor}-${axis}" style="background: ${imuAxisColors[axis]};"></div>
      </div>`;
    const imuSummaryRow = (labelHtml, valueId, checkId, initial) => `
      <div class="d-flex align-items-center border-top mt-1 pt-1">
        ${labelHtml}
        <span class="ms-auto" ${imuValueStyle} id="${valueId}">${initial}</span>
        <span class="badge bg-secondary ms-2 test-check" id="${checkId}"><i class="far fa-circle"></i></span>
      </div>`;
    return `
      <p class="mb-2">${imuTestDesc}</p>
      <p class="mb-2"><strong>${instructions}:</strong> ${imuInstructions}</p>
      <div class="row g-2 mb-2">
        <div class="col-md-6">
          <label class="form-label mb-1"><strong>${l('Gyroscope')}</strong> <span class="text-muted">(°/s)</span></label>
          <div class="font-monospace small bg-light border rounded p-2">
            ${imuAxisRow('x', l('Pitch'), 'gyro', '+0.0')}
            ${imuAxisRow('y', l('Yaw'), 'gyro', '+0.0')}
            ${imuAxisRow('z', l('Roll'), 'gyro', '+0.0')}
            ${imuSummaryRow(`<span>${l('Bias')} <span class="text-muted">(${l('auto-zeroed at rest')})</span></span>`, 'imu-gyro-bias', 'imu-check-gyro-bias', '0.0')}
          </div>
          <canvas id="imu-gyro-chart" class="border rounded mt-1" style="width: 100%; height: 90px;"></canvas>
        </div>
        <div class="col-md-6">
          <label class="form-label mb-1"><strong>${l('Accelerometer')}</strong> <span class="text-muted">(g)</span></label>
          <div class="font-monospace small bg-light border rounded p-2">
            ${imuAxisRow('x', 'X', 'accel', '+0.00')}
            ${imuAxisRow('y', 'Y', 'accel', '+0.00')}
            ${imuAxisRow('z', 'Z', 'accel', '+0.00')}
            ${imuSummaryRow(`<span>${l('Total')} <span class="text-muted">(≈1.00 ${imuAtRest})</span></span>`, 'imu-accel-mag', 'imu-check-accel-mag', '0.00')}
          </div>
          <canvas id="imu-accel-chart" class="border rounded mt-1" style="width: 100%; height: 90px;"></canvas>
        </div>
      </div>
      <div class="row g-2 align-items-center">
        <div class="col-md-6">
          <div class="d-flex gap-2">
            <button type="button" class="btn btn-success" id="imu-pass-btn" onclick="markTestResult('imu', true)">
              <i class="fas fa-check me-1"></i><span>${pass}</span>
            </button>
            <button type="button" class="btn btn-danger" id="imu-fail-btn" onclick="markTestResult('imu', false)">
              <i class="fas fa-times me-1"></i><span>${fail}</span>
            </button>
            <button type="button" class="btn btn-outline-primary" id="imu-reset-btn" onclick="quickTestAction('imu', 'reset')">
              <i class="fas fa-redo me-1"></i><span>${imuRestart}</span>
            </button>
          </div>
        </div>
        <div class="col-md-6">
          <div class="form-text mt-0">
            <i class="fas fa-info-circle me-1"></i>${l('At rest the accelerometer measures gravity: with the controller flat on a table, the Y axis points straight up and reads about +1 g while X and Z stay near 0.')}
          </div>
        </div>
      </div>
    `;
  }

  start() {
    this.host.startIconAnimation('imu');
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
    this.host.stopIconAnimation('imu');
    this.monitoring = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this._cancelAutoPass();
  }

  /**
   * Restart the IMU test: clear progress, re-capture the gyroscope bias
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
  handleInput(changes) {
    if (changes.imu) {
      this._recordSample(changes.imu);
    }
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
   * Reset IMU sample history, per-axis activity stats and gyro bias capture
   */
  _resetStats() {
    this._cancelAutoPass();
    this.dataHistory = [];
    this.stillWindow = [];
    this.gyroBias = { x: 0, y: 0, z: 0 };
    this.biasCaptured = false;
    this.stats = {
      gyroPeak: { x: 0, y: 0, z: 0 },
      accelMin: { x: Infinity, y: Infinity, z: Infinity },
      accelMax: { x: -Infinity, y: -Infinity, z: -Infinity },
      magnitudeSeen: false,
      autoPassTimer: null,
    };
  }

  /**
   * Record one IMU sample: apply gyro bias and track per-axis activity
   */
  _recordSample(imuData) {
    if (!this.monitoring || !this.stats) return;
    const stats = this.stats;

    // Continuously re-zero the gyroscope: whenever the last IMU_STILL_WINDOW
    // samples are quiet on all axes, their average becomes the new bias
    const raw = imuData.gyro;
    const stillWindow = this.stillWindow;
    stillWindow.push({ x: raw.x, y: raw.y, z: raw.z });
    if (stillWindow.length > IMU_STILL_WINDOW) {
      stillWindow.shift();
    }
    if (stillWindow.length === IMU_STILL_WINDOW &&
        IMU_AXES.every(axis => {
          const values = stillWindow.map(s => s[axis]);
          return Math.max(...values) - Math.min(...values) < IMU_STILL_SPREAD_DPS;
        })) {
      this.gyroBias = {
        x: stillWindow.reduce((acc, s) => acc + s.x, 0) / IMU_STILL_WINDOW,
        y: stillWindow.reduce((acc, s) => acc + s.y, 0) / IMU_STILL_WINDOW,
        z: stillWindow.reduce((acc, s) => acc + s.z, 0) / IMU_STILL_WINDOW
      };
      this.biasCaptured = true;
    }

    const bias = this.gyroBias;
    const gyro = { x: raw.x - bias.x, y: raw.y - bias.y, z: raw.z - bias.z };
    const accel = { x: imuData.accel.x, y: imuData.accel.y, z: imuData.accel.z };
    const magnitude = Math.hypot(accel.x, accel.y, accel.z);

    IMU_AXES.forEach(axis => {
      stats.gyroPeak[axis] = Math.max(stats.gyroPeak[axis], Math.abs(gyro[axis]));
      stats.accelMin[axis] = Math.min(stats.accelMin[axis], accel[axis]);
      stats.accelMax[axis] = Math.max(stats.accelMax[axis], accel[axis]);
    });
    // A healthy accelerometer reads ~1g total while the controller is at rest
    if (magnitude > 0.8 && magnitude < 1.2) {
      stats.magnitudeSeen = true;
    }

    this.dataHistory.push({ gyro, accel, magnitude });
    if (this.dataHistory.length > IMU_HISTORY_LENGTH) {
      this.dataHistory.shift();
    }

    this._checkComplete();
  }

  /**
   * Auto-pass the IMU test shortly after every gyro axis has seen a clear
   * rotation and every accel axis has seen the gravity vector swing through it
   */
  _checkComplete() {
    const stats = this.stats;
    if (!stats || stats.autoPassTimer || !this.autoPassArmed) return;
    if (!this._areAllChecksGreen(stats)) return;

    stats.autoPassTimer = setTimeout(() => {
      this.host.markTestResult('imu', true);
    }, IMU_AUTOPASS_DELAY_MS);
  }

  /**
   * True when every gyro axis, every accel axis and the magnitude check passed
   */
  _areAllChecksGreen(stats) {
    const gyroOk = IMU_AXES.every(axis => stats.gyroPeak[axis] >= IMU_GYRO_PASS_DPS);
    const accelOk = IMU_AXES.every(axis => stats.accelMax[axis] - stats.accelMin[axis] >= IMU_ACCEL_PASS_RANGE_G);
    return gyroOk && accelOk && stats.magnitudeSeen;
  }

  /**
   * Render the IMU panels on animation frames while the test is active
   */
  _startRenderLoop() {
    if (this.rafId) return;
    const render = () => {
      if (!this.monitoring) {
        this.rafId = null;
        return;
      }
      this._renderPanels();
      this.rafId = requestAnimationFrame(render);
    };
    this.rafId = requestAnimationFrame(render);
  }

  /**
   * Update IMU readouts, bar meters, checkmarks and sparkline charts.
   * Bars, checks and charts render every frame; the text readouts are
   * throttled so the numbers stay readable while the sensors flutter.
   */
  _renderPanels() {
    const history = this.dataHistory;
    const stats = this.stats;
    if (!history.length || !stats) return;
    const latest = history[history.length - 1];

    const now = performance.now();
    if (now - this.lastTextRender >= IMU_TEXT_INTERVAL_MS) {
      this.lastTextRender = now;
      const fmt = (value, digits) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
      IMU_AXES.forEach(axis => {
        $(`#imu-gyro-${axis}`).text(fmt(latest.gyro[axis], 1));
        $(`#imu-accel-${axis}`).text(fmt(latest.accel[axis], 2));
      });
      const bias = this.gyroBias;
      $('#imu-gyro-bias').text(Math.hypot(bias.x, bias.y, bias.z).toFixed(1));
      $('#imu-accel-mag').text(latest.magnitude.toFixed(2));
    }

    IMU_AXES.forEach(axis => {
      this._setBar(`imu-bar-gyro-${axis}`, latest.gyro[axis], IMU_GYRO_BAR_SCALE_DPS);
      this._setBar(`imu-bar-accel-${axis}`, latest.accel[axis], IMU_ACCEL_BAR_SCALE_G);
      setCheckBadge(`imu-check-gyro-${axis}`, stats.gyroPeak[axis] >= IMU_GYRO_PASS_DPS);
      setCheckBadge(`imu-check-accel-${axis}`, stats.accelMax[axis] - stats.accelMin[axis] >= IMU_ACCEL_PASS_RANGE_G);
    });
    setCheckBadge('imu-check-gyro-bias', this.biasCaptured);
    setCheckBadge('imu-check-accel-mag', stats.magnitudeSeen);

    this._drawChart('imu-gyro-chart', history, 'gyro', IMU_GYRO_PASS_DPS * 2);
    this._drawChart('imu-accel-chart', history, 'accel', 1.5);
  }

  /**
   * Deflect one center-zero bar meter, clamped to ±scale
   */
  _setBar(id, value, scale) {
    const bar = document.getElementById(id);
    if (!bar) return;
    const clamped = Math.max(-1, Math.min(1, value / scale));
    const half = Math.abs(clamped) * 50;
    bar.style.width = `${half}%`;
    bar.style.left = clamped < 0 ? `${50 - half}%` : '50%';
  }

  /**
   * Draw a three-axis sparkline chart onto a canvas
   */
  _drawChart(canvasId, history, field, minScale) {
    const canvas = document.getElementById(canvasId);
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

    // Symmetric auto-scale around zero, never below minScale
    let scale = minScale;
    history.forEach(sample => {
      IMU_AXES.forEach(axis => {
        scale = Math.max(scale, Math.abs(sample[field][axis]));
      });
    });
    scale *= 1.05;

    // Zero line
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    const colors = { x: '#dc3545', y: '#198754', z: '#0d6efd' };
    IMU_AXES.forEach(axis => {
      ctx.strokeStyle = colors[axis];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      history.forEach((sample, i) => {
        const px = (i / (IMU_HISTORY_LENGTH - 1)) * width;
        const py = height / 2 - (sample[field][axis] / scale) * (height / 2);
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      });
      ctx.stroke();
    });
  }
}
