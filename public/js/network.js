let socket = null;
let networkPlayers = {};

function connectSocket() {
  if (socket) return;
  
  if (!currentToken) {
    console.error("토큰이 없어 소켓에 연결할 수 없습니다.");
    return;
  }
  
  socket = io({
    auth: {
      token: currentToken
    }
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    document.getElementById('game-status').textContent = '로비 (온라인)';
  });

  socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err.message);
    document.getElementById('game-status').textContent = '오프라인 (연결 오류)';
    // 인증 오류 시 로그아웃 처리
    if (err.message.includes('인증 오류')) {
      document.getElementById('logout-btn').click();
    }
  });

  socket.on('updatePlayers', (serverPlayers) => {
    networkPlayers = serverPlayers;
  });
}

function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

function emitMove(x, y) {
  if (socket && socket.connected) {
    socket.emit('move', { x, y });
  }
}
