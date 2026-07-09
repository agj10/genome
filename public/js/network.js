let socket = null;
let networkPlayers = {};
let mapObjects = [];
let networkDecoys = {};

function connectSocket() {
  if (socket) return;

  if (!currentToken) {
    console.error("토큰이 없어 소켓에 연결할 수 없습니다.");
    return;
  }

  socket = io({
    auth: { token: currentToken }
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
  });

  socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err.message);
    document.getElementById('game-status').textContent = '오프라인 (연결 오류)';
    if (err.message.includes('인증 오류')) {
      document.getElementById('logout-btn').click();
    }
  });

  socket.on('updatePlayers', (serverPlayers) => {
    networkPlayers = serverPlayers;
  });

  socket.on('mapData', (data) => {
    mapObjects = data;
  });

  socket.on('updateDecoys', (decoys) => {
    networkDecoys = decoys;
  });

  socket.on('gameState', (state) => {
    // prep → hunt 전환 시 텍스처 전송
    if (gameStateManager.status === 'prep' && state.status === 'hunt') {
      if (paintTool) {
        socket.emit('saveTexture', paintTool.getTextureData());
      }
    }

    gameStateManager.updateState(state);
  });

  socket.on('playerTagged', ({ targetId, seekerId, infected }) => {
    const targetName = networkPlayers[targetId]?.nickname || '누군가';
    const seekerName = networkPlayers[seekerId]?.nickname || '술래';
    if (infected) {
      announcer.announce(`🦠 ${targetName} 감염됨! (술래 증가)`, 2000);
    } else {
      announcer.announce(`💀 ${targetName} → ${seekerName}에게 잡힘!`, 2000);
    }
  });

  socket.on('gameEnd', ({ winner }) => {
    const text = winner === 'hiders' ? '숨는 자 승리! 🎉' : '술래 승리! 💀';
    announcer.announce(text, 3000);
  });
}

function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

function emitMove(x, y, z = 0) {
  if (socket && socket.connected) {
    socket.emit('move', { x, y, z });
  }
}
