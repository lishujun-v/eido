/* ============================================
   HTML Animation Player — Engine
   ============================================ */

class AnimationPlayer {
  constructor(scenes) {
    this.scenes = scenes;
    this.currentIndex = -1;
    this.playing = false;
    this.speed = 1.0;
    this.audioCtx = null;
    this.currentAudio = null;
    this.currentAudioSource = null;
    this.currentAudioBuffer = null;
    this.audioStartTime = 0;
    this.audioElapsedBeforePause = 0;
    this.sceneTimer = null;
    this.rafId = null;
    this.subtitleTimer = null;

    this.totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);

    this.elements = {
      player: document.querySelector('.player'),
      sceneContainer: document.querySelector('.scene-container'),
      subtitle: document.querySelector('.subtitle-overlay'),
      playBtn: document.querySelector('.btn-play'),
      prevBtn: document.querySelector('.btn-prev'),
      nextBtn: document.querySelector('.btn-next'),
      timeDisplay: document.querySelector('.time-display'),
      speedBadge: document.querySelector('.speed-badge'),
      fullscreenBtn: document.querySelector('.btn-fullscreen'),
      progressBar: document.querySelector('.progress-bar'),
      progressFill: document.querySelector('.progress-fill'),
      progressThumb: document.querySelector('.progress-thumb'),
      loadingOverlay: document.querySelector('.loading-overlay'),
    };

    this._init();
  }

  /* --- Init --- */
  _init() {
    this._createSceneLayers();
    this._bindEvents();
    this._bindKeyboard();
    this._preloadAudio().then(() => {
      this.elements.loadingOverlay.classList.add('hidden');
      this._goToScene(0);
    });
  }

  _createSceneLayers() {
    this.scenes.forEach((scene, i) => {
      const layer = document.createElement('div');
      layer.className = 'scene-layer';
      layer.dataset.sceneIndex = i;
      layer.innerHTML = scene.content;
      this.elements.sceneContainer.appendChild(layer);
    });
    this.layers = this.elements.sceneContainer.querySelectorAll('.scene-layer');
  }

  /* --- Audio --- */
  async _preloadAudio() {
    // Preload all audio files in parallel
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not available, audio disabled');
      return;
    }

    const loads = this.scenes.map(async (scene, i) => {
      if (!scene.audio) return;
      try {
        const resp = await fetch(scene.audio);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const arrayBuffer = await resp.arrayBuffer();
        const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
        scene._audioBuffer = audioBuffer;
        scene._durationFromAudio = audioBuffer.duration * 1000;
        if (!scene.duration || scene.duration <= 0) {
          scene.duration = scene._durationFromAudio;
        }
      } catch (e) {
        console.warn(`Failed to load audio for scene ${i}: ${e.message}`);
      }
    });

    await Promise.all(loads);

    // Recalculate total duration after audio durations are known
    this.totalDuration = this.scenes.reduce((sum, s) => sum + (s.duration || 5000), 0);
  }

  _playAudioForScene(index) {
    this._stopAudio();
    if (!this.audioCtx) return;

    const scene = this.scenes[index];
    if (!scene || !scene._audioBuffer) return;

    this.currentAudioBuffer = scene._audioBuffer;
    this.currentAudioSource = this.audioCtx.createBufferSource();
    this.currentAudioSource.buffer = this.currentAudioBuffer;
    this.currentAudioSource.playbackRate.value = this.speed;
    this.currentAudioSource.connect(this.audioCtx.destination);

    this.currentAudioSource.onended = () => {
      this.currentAudioSource = null;
    };

    this.currentAudioSource.start(0, this.audioElapsedBeforePause);
    this.audioStartTime = this.audioCtx.currentTime - this.audioElapsedBeforePause;
  }

  _stopAudio() {
    if (this.currentAudioSource) {
      try { this.currentAudioSource.stop(); } catch (e) { /* already stopped */ }
      this.currentAudioSource = null;
    }
    this.currentAudioBuffer = null;
    this.audioElapsedBeforePause = 0;
  }

  _pauseAudio() {
    if (this.currentAudioSource && this.audioCtx) {
      this.audioElapsedBeforePause = this.audioCtx.currentTime - this.audioStartTime;
      try { this.currentAudioSource.stop(); } catch (e) { /* already stopped */ }
      this.currentAudioSource = null;
    }
  }

  _getAudioElapsed() {
    if (this.currentAudioSource && this.audioCtx) {
      return this.audioCtx.currentTime - this.audioStartTime;
    }
    return this.audioElapsedBeforePause || 0;
  }

  /* --- Scene Navigation --- */
  _goToScene(index, transitionDir) {
    if (index < 0 || index >= this.scenes.length) {
      if (index >= this.scenes.length) {
        this._pause();
        return;
      }
      return;
    }

    const prevIndex = this.currentIndex;
    this.currentIndex = index;

    // Deactivate all layers
    this.layers.forEach(l => l.classList.remove('active'));

    // Activate target layer
    const targetLayer = this.layers[index];
    if (targetLayer) {
      targetLayer.classList.add('active');
    }

    // Start audio
    this._stopAudio();
    this._playAudioForScene(index);

    // Start scene timer
    const scene = this.scenes[index];
    this._clearSceneTimer();
    this._startSubtitle(scene);

    if (this.playing) {
      const effectiveDuration = scene.duration / this.speed;
      this.sceneTimer = setTimeout(() => {
        this._nextScene();
      }, effectiveDuration);
    }
  }

  _nextScene() {
    if (this.currentIndex < this.scenes.length - 1) {
      this._goToScene(this.currentIndex + 1);
    } else {
      this._pause();
    }
  }

  _prevScene() {
    if (this.currentIndex > 0) {
      this._goToScene(this.currentIndex - 1);
    }
  }

  _clearSceneTimer() {
    if (this.sceneTimer) {
      clearTimeout(this.sceneTimer);
      this.sceneTimer = null;
    }
  }

  /* --- Subtitles --- */
  _startSubtitle(scene) {
    if (this.subtitleTimer) clearInterval(this.subtitleTimer);

    const narration = scene.narration || '';
    if (!narration) {
      this.elements.subtitle.textContent = '';
      return;
    }

    // Show full narration text
    this.elements.subtitle.textContent = narration;
  }

  _clearSubtitle() {
    if (this.subtitleTimer) {
      clearInterval(this.subtitleTimer);
      this.subtitleTimer = null;
    }
    this.elements.subtitle.textContent = '';
  }

  /* --- Playback --- */
  _play() {
    if (this.playing) return;
    if (this.currentIndex < 0) this._goToScene(0);
    this.playing = true;
    this.elements.playBtn.textContent = '⏸';

    // Resume or start current scene audio
    if (this.currentAudioBuffer && !this.currentAudioSource) {
      this._playAudioForScene(this.currentIndex);
    }

    const scene = this.scenes[this.currentIndex];
    if (scene) {
      const elapsed = this._getAudioElapsed();
      const remaining = (scene.duration / this.speed) - (elapsed * 1000);
      if (remaining > 0) {
        this._clearSceneTimer();
        this.sceneTimer = setTimeout(() => this._nextScene(), remaining);
      }
    }

    this._startProgressLoop();
    this._startSubtitle(this.scenes[this.currentIndex]);
  }

  _pause() {
    if (!this.playing) return;
    this.playing = false;
    this.elements.playBtn.textContent = '▶';
    this._clearSceneTimer();
    this._pauseAudio();
    this._stopProgressLoop();
  }

  _togglePlay() {
    if (this.playing) {
      this._pause();
    } else {
      this._play();
    }
  }

  /* --- Speed --- */
  _cycleSpeed() {
    const speeds = [0.5, 1.0, 1.5, 2.0];
    const idx = speeds.indexOf(this.speed);
    this.speed = speeds[(idx + 1) % speeds.length];
    this.elements.speedBadge.textContent = this.speed + 'x';

    // Update audio playback rate
    if (this.currentAudioSource) {
      this.currentAudioSource.playbackRate.value = this.speed;
    }

    // Restart scene timer with new speed
    if (this.playing) {
      this._clearSceneTimer();
      const scene = this.scenes[this.currentIndex];
      if (scene) {
        const elapsed = this._getAudioElapsed();
        const remaining = (scene.duration / this.speed) - (elapsed * 1000);
        if (remaining > 0) {
          this.sceneTimer = setTimeout(() => this._nextScene(), remaining);
        }
      }
    }
  }

  /* --- Progress --- */
  _getCurrentTime() {
    let time = 0;
    for (let i = 0; i < this.currentIndex; i++) {
      time += this.scenes[i].duration;
    }
    const currentScene = this.scenes[this.currentIndex];
    if (currentScene) {
      const elapsed = this._getAudioElapsed();
      time += Math.min(elapsed * 1000, currentScene.duration);
    }
    return time;
  }

  _startProgressLoop() {
    this._stopProgressLoop();
    const tick = () => {
      if (!this.playing) return;
      const current = this._getCurrentTime();
      const pct = this.totalDuration > 0 ? (current / this.totalDuration) * 100 : 0;
      this.elements.progressFill.style.width = Math.min(pct, 100) + '%';
      this.elements.progressThumb.style.left = Math.min(pct, 100) + '%';
      this._updateTimeDisplay(current);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  _stopProgressLoop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  _updateTimeDisplay(ms) {
    const format = (t) => {
      const m = Math.floor(t / 60000);
      const s = Math.floor((t % 60000) / 1000);
      return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    };
    this.elements.timeDisplay.textContent =
      format(ms) + ' / ' + format(this.totalDuration);
  }

  _seekTo(e) {
    const rect = this.elements.progressBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const targetMs = pct * this.totalDuration;

    // Find target scene
    let accumulated = 0;
    let targetIndex = 0;
    for (let i = 0; i < this.scenes.length; i++) {
      if (accumulated + this.scenes[i].duration >= targetMs) {
        targetIndex = i;
        break;
      }
      accumulated += this.scenes[i].duration;
      targetIndex = i;
    }

    // Calculate offset within target scene
    const offsetInScene = targetMs - accumulated;
    this.audioElapsedBeforePause = offsetInScene / 1000;
    this._goToScene(targetIndex);

    if (this.playing) {
      this._playAudioForScene(targetIndex);
    }
  }

  /* --- Fullscreen --- */
  _toggleFullscreen() {
    const el = this.elements.player;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    }
  }

  /* --- Events --- */
  _bindEvents() {
    this.elements.playBtn.addEventListener('click', () => this._togglePlay());
    this.elements.prevBtn.addEventListener('click', () => this._prevScene());
    this.elements.nextBtn.addEventListener('click', () => this._nextScene());
    this.elements.speedBadge.addEventListener('click', () => this._cycleSpeed());
    this.elements.fullscreenBtn.addEventListener('click', () => this._toggleFullscreen());

    this.elements.progressBar.addEventListener('click', (e) => this._seekTo(e));

    // Drag on progress bar
    let dragging = false;
    const onDragStart = (e) => { dragging = true; this._seekTo(e); };
    const onDragMove = (e) => { if (dragging) this._seekTo(e); };
    const onDragEnd = () => { dragging = false; };

    this.elements.progressBar.addEventListener('mousedown', onDragStart);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);

    // Click on scene container to toggle play
    this.elements.sceneContainer.addEventListener('click', (e) => {
      if (e.target === this.elements.sceneContainer) {
        this._togglePlay();
      }
    });
  }

  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this._togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this._prevScene();
          break;
        case 'ArrowRight':
          e.preventDefault();
          this._nextScene();
          break;
        case 'KeyF':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            this._toggleFullscreen();
          }
          break;
      }
    });
  }

  /* --- Destroy --- */
  destroy() {
    this._pause();
    this._stopAudio();
    this._clearSubtitle();
    this._stopProgressLoop();
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}

/* --- Bootstrap --- */
// SCENES_DATA is replaced by the agent with the actual JSON scenes array
window.SCENES_DATA = SCENES_DATA_PLACEHOLDER;

document.addEventListener('DOMContentLoaded', () => {
  window.player = new AnimationPlayer(window.SCENES_DATA);
});