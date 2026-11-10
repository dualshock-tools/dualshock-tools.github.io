'use strict';

import { l } from '../../translations.js';

/**
 * Monitors microphone input and optionally records a local audio clip.
 * Recordings stay in memory until the test is closed or reset.
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
    this.run = 0;
    this.startPromise = null;

    this.recordingRun = 0;
    this.recordingState = 'idle';
    this.recorder = null;
    this.recordingUrl = null;
    this.recordingTimer = null;
  }

  content() {
    const instructions = l('Instructions');
    const pass = l('Pass');
    const fail = l('Fail');
    const supported = this._supportsRecording();

    return `
      <p>${l("This test will monitor the controller's microphone input levels.")}</p>
      <p>
        <strong>${instructions}:</strong>
        ${l("Blow gently into the controller's microphone. You should see the audio level indicator respond.")}
      </p>

      <div class="mb-3" id="mic-level-container" style="display: none;">
        <label class="form-label">${l('Microphone Level:')}</label>
        <div class="progress">
          <div
            class="progress-bar bg-info"
            role="progressbar"
            id="mic-level-bar"
            style="width: 0%"
            aria-valuenow="0"
            aria-valuemin="0"
            aria-valuemax="100"
          ></div>
        </div>
      </div>

      <div
        class="d-flex flex-wrap gap-2 mt-3"
        role="group"
        aria-label="${l('Microphone recording')}"
      >
        <button
          type="button"
          class="btn btn-primary"
          id="mic-record-start"
          onclick="quickTestAction('microphone', 'startRecording')"
          ${supported ? '' : 'disabled'}
        >
          <i class="fas fa-microphone me-1" aria-hidden="true"></i>
          <span>${l('Start recording')}</span>
        </button>

        <button
          type="button"
          class="btn btn-outline-secondary"
          id="mic-record-stop"
          disabled
          onclick="quickTestAction('microphone', 'stopRecording')"
        >
          <i class="fas fa-stop me-1" aria-hidden="true"></i>
          <span>${l('Stop')}</span>
        </button>

        <button
          type="button"
          class="btn btn-outline-secondary"
          id="mic-record-play"
          disabled
          onclick="quickTestAction('microphone', 'playRecording')"
        >
          <i class="fas fa-play me-1" aria-hidden="true"></i>
          <span>${l('Play recording')}</span>
        </button>
      </div>

      <p
        id="mic-record-status"
        class="text-muted mt-2"
        role="status"
        aria-live="polite"
      >${l(supported
        ? 'Record up to 30 seconds. Audio stays on this device and is deleted when you leave the test.'
        : 'Recording is not supported in this browser. Use a browser with microphone recording support over HTTPS.'
      )}</p>

      <audio id="mic-record-audio" preload="metadata" hidden></audio>

      <div class="d-flex gap-2 mt-3">
        <button
          type="button"
          class="btn btn-success"
          id="microphone-pass-btn"
          onclick="markTestResult('microphone', true)"
        >
          <i class="fas fa-check me-1"></i>
          <span>${pass}</span>
        </button>

        <button
          type="button"
          class="btn btn-danger"
          id="microphone-fail-btn"
          onclick="markTestResult('microphone', false)"
        >
          <i class="fas fa-times me-1"></i>
          <span>${fail}</span>
        </button>
      </div>
    `;
  }

  async start() {
    if (this.monitoring) return true;
    if (this.startPromise) return this.startPromise;

    const pending = this._start(this.run);
    this.startPromise = pending;

    try {
      return await pending;
    } finally {
      if (this.startPromise === pending) {
        this.startPromise = null;
      }
    }
  }

  async _start(run) {
    const $levelContainer = $('#mic-level-container');
    const $levelBar = $('#mic-level-bar');

    let stream = null;
    let audioContext = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      if (run !== this.run) {
        stream.getTracks().forEach(track => track.stop());
        return false;
      }

      audioContext = new (
        window.AudioContext || window.webkitAudioContext
      )();

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      if (run !== this.run) {
        stream.getTracks().forEach(track => track.stop());
        void audioContext.close().catch(() => {});
        return false;
      }

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

      let isVibrating = false;
      const vibrationThreshold = 30;
      let count = 0;

      const updateLevel = () => {
        if (!this.monitoring || run !== this.run) return;

        analyzer.getByteFrequencyData(dataArray);

        const sum = dataArray.reduce((acc, value) => acc + value, 0);
        const average = sum / bufferLength;
        const percentage = Math.min(100, (average / 255) * 100);

        $levelBar.css('width', percentage + '%');
        $levelBar.attr('aria-valuenow', percentage);

        // Avoid recording vibration noise or auto-closing the test
        // before a recorded clip can be played.
        const allowAutomaticResult =
          this.recordingState === 'idle' && !this.recordingUrl;

        if (
          allowAutomaticResult &&
          percentage > vibrationThreshold &&
          !isVibrating
        ) {
          this.host.controller.setVibration(
            { heavyLeft: 50, duration: 50 },
            () => {
              isVibrating = false;
            }
          );

          isVibrating = true;
          count++;
        }

        if (allowAutomaticResult && count > 5) {
          const activeTest = this.host.getCurrentActiveTest();
          this.host.markTestResult(activeTest, true);
        }

        requestAnimationFrame(updateLevel);
      };

      updateLevel();
      return true;
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());

      if (audioContext) {
        void audioContext.close().catch(() => {});
      }

      if (run !== this.run) return false;

      this.stream = null;
      this.audioContext = null;
      this.monitoring = false;

      this.host.stopIconAnimation('microphone');
      $levelContainer.hide();

      console.error('Microphone test failed:', error);

      this._recordStatus(
        error?.name === 'NotAllowedError' ||
        error?.name === 'SecurityError'
          ? 'Microphone access was denied. Allow access and try again.'
          : 'Microphone could not be opened. Check the selected input and close other audio applications.'
      );

      return false;
    }
  }

  stop() {
    ++this.run;
    this._clearRecording();

    this.monitoring = false;
    this.host.stopIconAnimation('microphone');

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      void this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    $('#mic-level-container').hide();
  }

  _supportsRecording() {
    return (
      typeof window.MediaRecorder === 'function' &&
      Boolean(navigator.mediaDevices?.getUserMedia)
    );
  }

  _recordStatus(message) {
    $('#mic-record-status').text(l(message));
  }

  _recordButtons() {
    const busy = [
      'requesting',
      'recording',
      'stopping'
    ].includes(this.recordingState);

    const playing = this.recordingState === 'playing';

    $('#mic-record-start').prop(
      'disabled',
      !this._supportsRecording() || busy || playing
    );

    $('#mic-record-stop').prop(
      'disabled',
      !busy && !playing
    );

    $('#mic-record-play').prop(
      'disabled',
      busy || playing || !this.recordingUrl
    );
  }

  _clearRecording() {
    ++this.recordingRun;

    clearTimeout(this.recordingTimer);
    this.recordingTimer = null;

    const recorder = this.recorder;
    this.recorder = null;

    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch (_) {
        // The recorder may already have stopped after an error.
      }
    }

    const audio = document.getElementById('mic-record-audio');

    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }

    if (this.recordingUrl) {
      URL.revokeObjectURL(this.recordingUrl);
    }

    this.recordingUrl = null;
    this.recordingState = 'idle';

    this._recordButtons();

    this._recordStatus(
      this._supportsRecording()
        ? 'Record up to 30 seconds. Audio stays on this device and is deleted when you leave the test.'
        : 'Recording is not supported in this browser. Use a browser with microphone recording support over HTTPS.'
    );
  }

  async startRecording() {
    if (this.recordingState !== 'idle') return;

    if (!this._supportsRecording()) {
      this._recordStatus(
        'Recording is not supported in this browser. Use a browser with microphone recording support over HTTPS.'
      );
      return;
    }

    this._clearRecording();

    const run = this.recordingRun;

    this.recordingState = 'requesting';
    this._recordButtons();
    this._recordStatus('Allow microphone access to start recording.');

    try {
      if (!this.monitoring) {
        const ready = await this.start();

        if (run !== this.recordingRun) return;

        if (!ready) {
          this.recordingState = 'idle';
          this._recordButtons();
          return;
        }
      }

      if (run !== this.recordingRun) return;

      if (!this.stream?.active) {
        throw new Error('Microphone stream is inactive');
      }

      const types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4'
      ];

      const mimeType = types.find(type =>
        MediaRecorder.isTypeSupported?.(type)
      );

      const recorder = new MediaRecorder(
        this.stream,
        mimeType ? { mimeType } : undefined
      );

      this.recorder = recorder;

      const chunks = [];

      recorder.ondataavailable = event => {
        if (run === this.recordingRun && event.data.size) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = () => {
        if (run !== this.recordingRun) return;

        this._clearRecording();
        this._recordStatus('Recording failed. Please try again.');
      };

      recorder.onstop = () => {
        if (run !== this.recordingRun) return;

        clearTimeout(this.recordingTimer);
        this.recordingTimer = null;
        this.recorder = null;

        const blob = new Blob(chunks, {
          type:
            recorder.mimeType ||
            chunks[0]?.type ||
            'audio/webm'
        });

        this.recordingState = 'idle';

        if (blob.size) {
          this.recordingUrl = URL.createObjectURL(blob);
          document.getElementById('mic-record-audio').src =
            this.recordingUrl;

          this._recordStatus(
            'Recording ready. Select Play recording to listen.'
          );
        } else {
          this._recordStatus(
            'No audio was recorded. Please try again.'
          );
        }

        this._recordButtons();
      };

      recorder.start();

      this.recordingState = 'recording';
      this._recordStatus('Recording (maximum 30 seconds) …');
      this._recordButtons();

      this.recordingTimer = setTimeout(() => {
        this.stopRecording();
      }, 30000);
    } catch (error) {
      if (run !== this.recordingRun) return;

      console.error('Microphone recording failed:', error);

      this._clearRecording();
      this._recordStatus('Recording failed. Please try again.');
    }
  }

  stopRecording() {
    if (this.recordingState === 'requesting') {
      this._clearRecording();
      return;
    }

    if (this.recordingState === 'playing') {
      const audio = document.getElementById('mic-record-audio');

      audio.pause();
      audio.currentTime = 0;

      this.recordingState = 'idle';

      this._recordStatus(
        'Recording ready. Select Play recording to listen.'
      );

      this._recordButtons();
      return;
    }

    if (this.recorder?.state === 'recording') {
      this.recordingState = 'stopping';

      this._recordStatus('Finishing recording …');
      this._recordButtons();

      this.recorder.stop();
    }
  }

  async playRecording() {
    if (!this.recordingUrl || this.recordingState !== 'idle') {
      return;
    }

    const run = this.recordingRun;
    const audio = document.getElementById('mic-record-audio');

    audio.currentTime = 0;

    this.recordingState = 'playing';
    this._recordButtons();

    audio.onended = () => {
      if (run !== this.recordingRun) return;

      this.recordingState = 'idle';

      this._recordStatus(
        'Recording ready. Select Play recording to listen.'
      );

      this._recordButtons();
    };

    audio.onerror = () => {
      if (run !== this.recordingRun) return;

      this.recordingState = 'idle';
      this._recordButtons();

      this._recordStatus(
        'Playback failed. Please make a new recording.'
      );
    };

    try {
      await audio.play();

      if (
        run === this.recordingRun &&
        this.recordingState === 'playing'
      ) {
        this._recordStatus('Playing recording …');
      }
    } catch (_) {
      if (run !== this.recordingRun) return;

      this.recordingState = 'idle';
      this._recordButtons();

      this._recordStatus(
        'Playback failed. Please make a new recording.'
      );
    }
  }
}
