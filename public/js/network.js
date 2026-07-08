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

  socket.on('gameState', (state) => {
    // 이전 상태가 prep이었고, 새로운 상태가 hunt라면 드로잉 완료 텍스처 서버로 전송
    if (gameStateManager.status === 'prep' && state.status === 'hunt') {
      if (paintTool) {
        socket.emit('saveTexture', paintTool.getTextureData());
      }
    }
    
    gameStateManager.updateState(state);
  });

  socket.on('playerTagged', ({ targetId, seekerId }) => {
    const targetName = networkPlayers[targetId]?.nickname || '누군가';
    const seekerName = networkPlayers[seekerId]?.nickname || '술래';
    console.log(`${targetName}님이 ${seekerName}님에게 잡혔습니다!`);
    // 킬로그 UI 등 표시 가능
  });

  socket.on('gameEnd', ({ winner }) => {
    const text = winner === 'hiders' ? '숨는 자 승리! 🎉' : '술래 승리! 💀';
    document.getElementById('game-status').textContent = text;
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
