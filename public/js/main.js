const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

let isGameRunning = false;
let lastTime = 0;
let localPlayer = null;
let paintTool = null;

// 마우스/터치 상태
const pointer = { x: 0, y: 0, isDown: false };

// 입력 상태
const input = {
  keys: {}
};

window.addEventListener('keydown', (e) => { input.keys[e.key] = true; });
window.addEventListener('keyup', (e) => { input.keys[e.key] = false; });
window.addEventListener('resize', resizeCanvas);

// 포인터 이벤트
canvas.addEventListener('mousedown', (e) => {
  pointer.isDown = true;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  handlePointerDown();
});
canvas.addEventListener('mousemove', (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  handlePointerMove();
});
canvas.addEventListener('mouseup', () => {
  pointer.isDown = false;
  handlePointerUp();
});
canvas.addEventListener('mouseleave', () => {
  pointer.isDown = false;
  handlePointerUp();
});

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

let currentRoomId = null;

function joinRoom(roomId) {
  if (!roomId) return;
  roomId = roomId.toUpperCase();
  currentRoomId = roomId;

  // URL 변경 (SPA)
  if (window.location.pathname !== `/rooms/${roomId}`) {
    history.pushState(null, '', `/rooms/${roomId}`);
  }

  document.getElementById('menu-screen').classList.remove('active');
  document.getElementById('game-screen').classList.add('active');

  startGame();
}

function startGame() {
  if (!currentToken) return;
  
  isGameRunning = true;
  resizeCanvas();
  connectSocket();
  
  // 소켓 연결 완료 후 room 입장
  if (socket && socket.connected) {
    socket.emit('joinRoom', currentRoomId);
  } else {
    // connectSocket에서 연결 이벤트 후 가입하도록 설정
    socket.on('connect', () => {
      socket.emit('joinRoom', currentRoomId);
    });
  }
  
  // 임시 초기 위치 (추후 서버에서 받아옴)
  localPlayer = new LocalPlayer(400, 300);
  paintTool = new PaintTool(40); // 플레이어 텍스처 크기 40x40
  
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

// 방 코드 생성기 (6자리)
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 메뉴 버튼 이벤트
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('quick-start-btn').addEventListener('click', () => {
    joinRoom(generateRoomCode());
  });

  document.getElementById('join-room-btn').addEventListener('click', () => {
    const code = document.getElementById('room-code-input').value.trim();
    if (code) joinRoom(code);
    else alert('방 코드를 입력해주세요.');
  });
  
  // 방장 강제 시작 버튼
  document.getElementById('host-start-btn').addEventListener('click', () => {
    if (socket && socket.connected && gameStateManager.status === 'lobby') {
      socket.emit('startGame');
    }
  });
});

// URL 직접 접속 시 방 자동 진입 체크 (auth.js의 initAuth 성공 후 호출되도록)
function checkUrlAndJoin() {
  const path = window.location.pathname;
  if (path.startsWith('/rooms/')) {
    const roomId = path.split('/')[2];
    if (roomId) {
      joinRoom(roomId);
    }
  }
}

function gameLoop(time) {
  if (!isGameRunning) return;

  const dt = (time - lastTime) / 1000;
  lastTime = time;

  update(dt);
  draw();

  requestAnimationFrame(gameLoop);
}

function update(dt) {
  if (localPlayer) {
    // 사냥 단계에서 숨는 자는 이동 중 페인팅 불가 로직 등 추가 가능
    localPlayer.update(dt, input);
  }
}

// 렌더링에 사용할 임시 이미지 캐시 (성능 최적화)
const textureCache = {};

function draw() {
  // 배경 클리어
  ctx.fillStyle = '#cce0ff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const myId = socket ? socket.id : null;
  const me = myId ? networkPlayers[myId] : null;

  if (me) {
    gameStateManager.isSeeker = (me.role === 'seeker');
    // HP 업데이트
    if (gameStateManager.isSeeker) {
      document.getElementById('hp-box').style.display = 'inline-flex';
      const fill = document.getElementById('hp-bar-fill');
      fill.style.width = Math.max(0, me.hp) + '%';
      fill.style.backgroundColor = me.hp > 30 ? '#48bb78' : '#e53e3e';
    } else {
      document.getElementById('hp-box').style.display = 'none';
    }
  }

  // 서버에서 받은 모든 플레이어 그리기
  for (const id in networkPlayers) {
    const p = networkPlayers[id];
    
    // 로컬 플레이어는 클라이언트 예측을 위해 localPlayer 객체 사용
    let drawX = p.x;
    let drawY = p.y;
    
    if (id === myId && localPlayer) {
      drawX = localPlayer.x;
      drawY = localPlayer.y;
    }

    // 그림자
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(drawX, drawY + 15, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 캐릭터 텍스처 (자신의 것은 실시간 오프스크린 캔버스, 남의 것은 textureData 사용)
    if (id === myId && paintTool) {
      ctx.drawImage(paintTool.canvas, drawX - paintTool.size/2, drawY - paintTool.size/2);
    } else if (p.textureData) {
      if (!textureCache[id] || textureCache[id].src !== p.textureData) {
        const img = new Image();
        img.src = p.textureData;
        textureCache[id] = img;
      }
      ctx.drawImage(textureCache[id], drawX - 20, drawY - 20, 40, 40);
    } else {
      // 기본 플레이스홀더
      ctx.fillStyle = p.role === 'seeker' ? '#fc8181' : '#ffffff';
      ctx.beginPath();
      ctx.arc(drawX, drawY, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 닉네임 텍스트 (사냥 중 숨는 자는 다른 숨는 자 이름만 보이거나, 결과 창에서만 보이게 처리 가능)
    ctx.fillStyle = '#333';
    ctx.font = '14px Inter';
    ctx.textAlign = 'center';
    
    // 술래는 사냥 중일 때 숨는 자의 닉네임이 안 보이게 해야 함
    const isHunt = gameStateManager.status === 'hunt';
    const hideName = isHunt && me && me.role === 'seeker' && p.role === 'hider';
    
    if (!hideName || p.isAlive === false) {
      ctx.fillText(p.nickname + (p.isAlive ? '' : ' 💀'), drawX, drawY - 25);
    }
  }
}

// 상호작용
function handlePointerDown() {
  if (!socket || !localPlayer) return;
  const myId = socket.id;
  const me = networkPlayers[myId];
  if (!me) return;

  if (gameStateManager.status === 'prep' && me.role === 'hider') {
    paintTool.handlePointerDown(pointer.x, pointer.y, localPlayer.x, localPlayer.y);
  } else if (gameStateManager.status === 'hunt' && me.role === 'seeker') {
    // 술래 태그 시도
    attemptTag(pointer.x, pointer.y);
  }
}

function handlePointerMove() {
  if (!socket || !localPlayer) return;
  const myId = socket.id;
  const me = networkPlayers[myId];
  
  if (gameStateManager.status === 'prep' && me.role === 'hider' && pointer.isDown) {
    paintTool.handlePointerMove(pointer.x, pointer.y, localPlayer.x, localPlayer.y);
  }
}

function handlePointerUp() {
  if (gameStateManager.status === 'prep' && paintTool) {
    paintTool.handlePointerUp();
  }
}

function attemptTag(px, py) {
  let targetId = null;
  // 클릭 지점이 누군가와 겹치는지 체크 (간단한 원 충돌)
  for (const id in networkPlayers) {
    if (id === socket.id) continue;
    const p = networkPlayers[id];
    if (!p.isAlive || p.role !== 'hider') continue;

    const dx = p.x - px;
    const dy = p.y - py;
    if (Math.sqrt(dx * dx + dy * dy) <= 20) { // 반지름 20
      targetId = id;
      break;
    }
  }
  socket.emit('tagPlayer', targetId);
}
