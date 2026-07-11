// ────────────────────────────────────
// GameStateManager — 클라이언트 UI 상태
// 레디 시스템 + Announcer 연동
// ────────────────────────────────────
class GameStateManager {
  constructor() {
    this.status = 'lobby';
    this.timer = 0;
    this.isSeeker = false;
    this.readyCount = 0;
    this.totalCount = 0;
    this.amReady = false;
    this._prevStatus = 'lobby';
    this.uiDelayed = false;
  }

  updateState(newState) {
    this._prevStatus = this.status;
    this.status = newState.status;
    this.timer  = newState.timer;

    if (newState.readyCount !== undefined) this.readyCount = newState.readyCount;
    if (newState.totalCount !== undefined) this.totalCount = newState.totalCount;

    if (this._prevStatus !== this.status) {
      if (this.status === 'prep' || this.status === 'hunt') {
        this.uiDelayed = true;
        setTimeout(() => {
          this.uiDelayed = false;
          this.updateUI();
        }, 3000);
      } else {
        this.uiDelayed = false;
      }

      switch (this.status) {
        case 'prep':
          announcer.announce('🎨 준비 단계!', 2500);
          announcer.startCountdown(3, null);
          break;
        case 'hunt':
          announcer.announce('🔍 사냥 시작!', 2500);
          announcer.startCountdown(3, null);
          break;
        case 'results':
          announcer.announce('🏆 게임 종료!', 3000);
          break;
        case 'lobby':
          if (this._prevStatus === 'results') {
            announcer.announce('로비로 돌아갑니다...', 2000);
          }
          this.amReady = false;
          break;
      }
    }

    this.updateUI();
  }

  updateUI() {
    const displayStatus = this.uiDelayed ? this._prevStatus : this.status;

    // ── 상태 텍스트 ──
    const labels = {
      lobby:   '로비 대기 중',
      prep:    '🎨 준비 단계 — 위장하세요!',
      hunt:    '🔍 사냥 단계 — 들키지 마세요!',
      results: '🏆 결과 발표'
    };
    const statusEl = document.getElementById('game-status');
    if (statusEl) statusEl.textContent = labels[displayStatus] || displayStatus;

    // ── 타이머 ──
    const timerEl = document.getElementById('game-timer');
    if (displayStatus !== 'lobby') {
      timerEl.style.display = 'inline-block';
      let m = Math.floor(this.timer / 60);
      let s = this.timer % 60;
      timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    } else {
      timerEl.style.display = 'none';
    }

    // ── 레디 카운트 & 버튼 ──
    const readyBtn = document.getElementById('ready-btn');
    const readyCount = document.getElementById('ready-count');
    if (displayStatus === 'lobby') {
      if (readyBtn)   readyBtn.style.display = 'inline-block';
      if (readyCount) {
        readyCount.style.display = 'inline';
        readyCount.textContent = `${this.readyCount}/${this.totalCount}`;
      }
    } else {
      if (readyBtn)   readyBtn.style.display = 'none';
      if (readyCount) readyCount.style.display = 'none';
    }

    // ── 페인트 도구 토글 버튼 ──
    const paintToggle = document.getElementById('paint-toggle');
    const poseToggle = document.getElementById('pose-toggle');

    if (displayStatus === 'lobby' || displayStatus === 'prep' || displayStatus === 'hunt') {
      if (paintToggle) paintToggle.style.display = 'inline-block';
      if (poseToggle) poseToggle.style.display = 'inline-block';
    } else {
      if (paintToggle) paintToggle.style.display = 'none';
      if (poseToggle) poseToggle.style.display = 'none';
      if (typeof paintTool !== 'undefined' && paintTool) paintTool.closePanel();
    }

    // 로비 -> prep (게임 시작) 전환 시 자동 열기 및 초기화
    if (this._prevStatus === 'lobby' && displayStatus === 'prep') {
      if (typeof paintTool !== 'undefined' && paintTool && !this.uiDelayed) {
        paintTool.clearCanvas(); // 그림 초기화
        paintTool.openPanel();
      }
      if (socket && socket.connected) {
        socket.emit('changePose', 'idle'); // 포즈 초기화
      }
    }
  }

  toggleReady() {
    this.amReady = !this.amReady;
    const btn = document.getElementById('ready-btn');
    if (btn) {
      btn.classList.toggle('is-ready', this.amReady);
      btn.textContent = this.amReady ? '✔ 준비 완료' : '준비';
    }
    if (socket && socket.connected) {
      socket.emit('toggleReady');
    }
  }
}

const gameStateManager = new GameStateManager();
