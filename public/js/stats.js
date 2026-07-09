// 전적 및 통계 관리 시스템

function getStats() {
  const defaultStats = {
    matches: 0,
    wins: 0,
    seekerGames: 0,
    seekerWins: 0,
    hiderGames: 0,
    hiderWins: 0,
    caught: 0,
    catches: 0,
    shapeCount: 0,
    decoyCount: 0
  };
  
  const saved = localStorage.getItem('genome_stats');
  if (saved) {
    return { ...defaultStats, ...JSON.parse(saved) };
  }
  return defaultStats;
}

function saveStats(stats) {
  localStorage.setItem('genome_stats', JSON.stringify(stats));
}

window.recordMatchResult = function(role, isWin) {
  const stats = getStats();
  stats.matches++;
  if (isWin) stats.wins++;
  
  if (role === 'seeker') {
    stats.seekerGames++;
    if (isWin) stats.seekerWins++;
  } else {
    stats.hiderGames++;
    if (isWin) stats.hiderWins++;
  }
  saveStats(stats);
}

window.recordAction = function(actionType, count = 1) {
  const stats = getStats();
  if (stats[actionType] !== undefined) {
    stats[actionType] += count;
    saveStats(stats);
  }
}

window.updateStatsUI = function() {
  const stats = getStats();
  const winrate = stats.matches > 0 ? Math.round((stats.wins / stats.matches) * 100) : 0;
  
  // 로비 기본 통계
  const mEl = document.getElementById('stat-matches');
  if (mEl) mEl.textContent = stats.matches;
  const wEl = document.getElementById('stat-wins');
  if (wEl) wEl.textContent = stats.wins;
  
  // 모달 상세 통계
  const ids = {
    'stat-detail-matches': stats.matches,
    'stat-detail-wins': stats.wins,
    'stat-detail-winrate': winrate,
    'stat-detail-seeker-games': stats.seekerGames,
    'stat-detail-seeker-wins': stats.seekerWins,
    'stat-detail-hider-games': stats.hiderGames,
    'stat-detail-hider-wins': stats.hiderWins,
    'stat-detail-caught': stats.caught,
    'stat-detail-catches': stats.catches,
    'stat-detail-shape': stats.shapeCount,
    'stat-detail-decoy': stats.decoyCount
  };
  
  for (const [id, value] of Object.entries(ids)) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
}

// 윈도우 로드 시 한 번 업데이트
window.addEventListener('load', () => {
  if (window.updateStatsUI) window.updateStatsUI();
});
