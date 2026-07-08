// ────────────────────────────────────
// GameStateManager — 클라이언트 UI 상태
// ────────────────────────────────────
class GameStateManager {
  constructor() {
    this.status = 'lobby';
    this.timer = 0;
    this.isSeeker = false;
  }

  updateState(newState) {
    this.status = newState.status;
    this.timer  = newState.timer;

    // ── 상태 텍스트 ──
    const labels = {
      lobby:   '로비 대기 중',
      prep:    '🎨 준비 단계 — 위장하세요!',
      hunt:    '🔍 사냥 단계 — 들키지 마세요!',
      results: '🏆 결과 발표'
    };
    document.getElementById('game-status').textContent = labels[this.status] || this.status;

    // ── 타이머 ──
    const timerEl  = document.getElementById('game-timer');
    const startBtn = document.getElementById('host-start-btn');

    if (this.status !== 'lobby') {
      timerEl.style.display = 'inline-block';
      if (startBtn) startBtn.style.display = 'none';
      const m = String(Math.floor(this.timer / 60)).padStart(2, '0');
      const s = String(this.timer % 60).padStart(2, '0');
      timerEl.textContent = `${m}:${s}`;
    } else {
      timerEl.style.display = 'none';
      if (startBtn) startBtn.style.display = 'inline-block';
    }

    // ── 페인트 도구 토글 버튼 가시성 ──
    const paintToggle = document.getElementById('paint-toggle');
    const paintPanel  = document.getElementById('paint-panel');
    if (this.status === 'prep') {
      if (paintToggle) paintToggle.style.display = 'inline-block';
    } else {
      if (paintToggle) paintToggle.style.display = 'none';
      if (paintPanel)  paintPanel.classList.remove('open');
    }
  }
}

const gameStateManager = new GameStateManager();
