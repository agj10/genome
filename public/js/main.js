const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

let isGameRunning = false;
let lastTime = 0;
let localPlayer = null;

// 입력 상태
const input = {
  keys: {}
};

window.addEventListener('keydown', (e) => { input.keys[e.key] = true; });
window.addEventListener('keyup', (e) => { input.keys[e.key] = false; });
window.addEventListener('resize', resizeCanvas);

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function startGame() {
  if (!currentToken) return;
  
  isGameRunning = true;
  resizeCanvas();
  connectSocket();
  
  // 임시 초기 위치 (추후 서버에서 받아옴)
  localPlayer = new LocalPlayer(400, 300);
  
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
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
    localPlayer.update(dt, input);
  }
}

function draw() {
  // 배경 클리어
  ctx.fillStyle = '#cce0ff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 현재 내 소켓 ID (네트워크 플레이어 중 나를 구분하기 위해)
  const myId = socket ? socket.id : null;

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

    // 캐릭터 (플레이스홀더)
    ctx.fillStyle = (id === myId) ? '#667eea' : '#ffffff';
    ctx.beginPath();
    ctx.arc(drawX, drawY, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 닉네임 텍스트
    ctx.fillStyle = '#333';
    ctx.font = '14px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(p.nickname, drawX, drawY - 25);
  }
}
