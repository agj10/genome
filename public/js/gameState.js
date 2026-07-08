class GameStateManager {
  constructor() {
    this.status = 'lobby'; // lobby, prep, hunt, results
    this.timer = 0;
    this.isSeeker = false;
  }
  
  updateState(newState) {
    this.status = newState.status;
    this.timer = newState.timer;
    
    // UI 업데이트
    const statusText = {
      'lobby': '로비 대기 중',
      'prep': '준비 단계: 맵에 위장하세요!',
      'hunt': '사냥 단계: 들키지 마세요!',
      'results': '결과 발표'
    }[this.status] || this.status;
    
    document.getElementById('game-status').textContent = statusText;
    
    const timerEl = document.getElementById('game-timer');
    const startBtn = document.getElementById('host-start-btn');
    
    if (this.status !== 'lobby') {
      timerEl.style.display = 'inline-block';
      if (startBtn) startBtn.style.display = 'none';
      const min = Math.floor(this.timer / 60).toString().padStart(2, '0');
      const sec = (this.timer % 60).toString().padStart(2, '0');
      timerEl.textContent = `${min}:${sec}`;
    } else {
      timerEl.style.display = 'none';
      if (startBtn) startBtn.style.display = 'inline-block';
    }
    
    // 준비 단계일 때만 페인트 패널 표시 (숨는 자 기준, 아직은 전부 표시)
    const paintPanel = document.getElementById('paint-panel');
    if (this.status === 'prep') {
      paintPanel.style.display = 'flex';
    } else {
      paintPanel.style.display = 'none';
    }
  }
}

const gameStateManager = new GameStateManager();
