'use strict';

import { l } from '../../translations.js';

/**
 * Microphone test: monitors the controller mic's input level, buzzes the
 * controller on loud input, and auto-passes after enough activity
 */
export class MicrophoneTest {
  static id = 'microphone';
  static testName = 'Microphone';
  static icon = 'fas fa-microphone';

  constructor(host) {
    this.host = host;
    this.stream = null;
    this.audioContext = null;
    this.monitoring = false;
  }

  content() {
    const instructions = l('Instructions');
    const pass = l('Pass');
    const fail = l('Fail');
    const microphoneTestDesc = l("This test will monitor the controller's microphone input levels.");
    const microphoneInstructions = l("Blow gently into the controller's microphone. You should see the audio level indicator respond.");
    const microphoneLevel = l('Microphone Level:');
    return `
      <p>${microphoneTestDesc}</p>
      <p><strong>${instructions}:</strong> ${microphoneInstructions}</p>
      <div class="mb-3" id="mic-level-container" style="display: none;">
        <label class="form-label">${microphoneLevel}</label>
        <div class="progress">
          <div class="progress-bar bg-info" role="progressbar" id="mic-level-bar" style="width: 0%" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
        </div>
      </div>
      <div class="d-flex gap-2 mt-3">
        <button type="button" class="btn btn-success" id="microphone-pass-btn" onclick="markTestResult('microphone', true)">
          <i class="fas fa-check me-1"></i><span>${pass}</span>
        </button>
        <button type="button" class="btn btn-danger" id="microphone-fail-btn" onclick="markTestResult('microphone', false)">
          <i class="fas fa-times me-1"></i><span>${fail}</span>
        </button>
      </div>
    `;
  }

  async start() {
    const $levelContainer = $('#mic-level-container');
    const $levelBar = $('#mic-level-bar');

    if (this.monitoring) {
      // Stop monitoring
      this.stop();
      return;
    }

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      // Create audio context and analyzer
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyzer = audioContext.createAnalyser();

      analyzer.fftSize = 256;
      const bufferLength = analyzer.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      source.connect(analyzer);

      this.stream = stream;
      this.audioContext = audioContext;
      this.monitoring = true;

      this.host.startIconAnimation('microphone');

      $levelContainer.show();

      // Monitor audio levels
      let isVibrating = false;
      const vibrationThreshold = 30; // Audio level threshold to trigger vibration
      let count = 0;

      const updateLevel = () => {
        if (!this.monitoring) return;

        analyzer.getByteFrequencyData(dataArray);

        // Calculate average level
        const sum = dataArray.reduce((acc, value) => acc + value, 0);
        const average = sum / bufferLength;
        const percentage = Math.min(100, (average / 255) * 100);

        $levelBar.css('width', percentage + '%');
        $levelBar.attr('aria-valuenow', percentage);

        // Trigger vibration when audio level exceeds threshold
        if (percentage > vibrationThreshold && !isVibrating) {
          this.host.controller.setVibration({ heavyLeft: 50, duration: 50 }, () => { isVibrating = false; });
          isVibrating = true;
          count++;
        }

        if (count > 5) {
          const activeTest = this.host.getCurrentActiveTest();
          this.host.markTestResult(activeTest, true);
        }

        requestAnimationFrame(updateLevel);
      };

      updateLevel();

    } catch (error) {
      console.error('Microphone test failed:', error);
    }
  }

  stop() {
    const $levelContainer = $('#mic-level-container');

    this.monitoring = false;

    this.host.stopIconAnimation('microphone');

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    $levelContainer.hide();
  }
}
