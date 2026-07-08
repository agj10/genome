// ────────────────────────────────────
// main.js — 2.5D 렌더링 엔진
// ────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');

let isGameRunning = false;
let lastTime      = 0;
let localPlayer   = null;
let paintTool     = null;
let currentRoomId = null;

// 맵 설정 (월드 좌표 기준)
const MAP = { width: 2000, height: 2000 };

// 입력
const input   = { keys: {} };
const pointer = { x: 0, y: 0, isDown: false };

window.addEventListener('keydown', (e) => { input.keys[e.key] = true; });
window.addEventListener('keyup',   (e) => { input.keys[e.key] = false; });
window.addEventListener('resize', resizeCanvas);

// ── 포인터 이벤트 ──
canvas.addEventListener('mousedown', (e) => {
  pointer.isDown = true;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  onPointerDown();
});
canvas.addEventListener('mousemove', (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  onPointerMove();
});
canvas.addEventListener('mouseup',    () => { pointer.isDown = false; onPointerUp(); });
canvas.addEventListener('mouseleave', () => { pointer.isDown = false; onPointerUp(); });

// ── 줌 ──
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  camera.handleWheel(e.deltaY);
}, { passive: false });

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}

// ────────────────────────────────────
// 방 / 게임 시작
// ────────────────────────────────────
function generateRoomCode() {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let r = '';
  for (let i = 0; i < 6; i++) r += c[Math.floor(Math.random() * c.length)];
  return r;
}

function joinRoom(roomId) {
  if (!roomId) return;
  roomId = roomId.toUpperCase();
  currentRoomId = roomId;

  if (window.location.pathname !== `/rooms/${roomId}`) {
    history.pushState(null, '', `/rooms/${roomId}`);
  }

  document.getElementById('menu-screen').classList.remove('active');
  document.getElementById('game-screen').classList.add('active');
  startGame();
}

function startGame() {
  if (!currentToken || isGameRunning) return;

  isGameRunning = true;
  resizeCanvas();
  connectSocket();

  // 소켓 연결 후 방 참가
  const doJoin = () => socket.emit('joinRoom', currentRoomId);
  if (socket && socket.connected) doJoin();
  else socket.on('connect', doJoin);

  // 맵 중앙에서 시작
  localPlayer = new LocalPlayer(MAP.width / 2, MAP.height / 2);
  paintTool   = new PaintTool(64);   // 텍스처 64x64

  // 카메라 즉시 플레이어 위치로 스냅
  camera.x = camera.targetX = localPlayer.x;
  camera.y = camera.targetY = localPlayer.y;

  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function checkUrlAndJoin() {
  const p = window.location.pathname;
  if (p.startsWith('/rooms/')) {
    const id = p.split('/')[2];
    if (id) joinRoom(id);
  }
}

// ── 메뉴 버튼 ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('quick-start-btn').addEventListener('click', () => joinRoom(generateRoomCode()));

  document.getElementById('join-room-btn').addEventListener('click', () => {
    const code = document.getElementById('room-code-input').value.trim();
    if (code) joinRoom(code);
    else alert('방 코드를 입력해주세요.');
  });

  document.getElementById('host-start-btn').addEventListener('click', () => {
    if (socket && socket.connected && gameStateManager.status === 'lobby') {
      socket.emit('startGame');
    }
  });
});

// ────────────────────────────────────
// 게임 루프
// ────────────────────────────────────
function gameLoop(time) {
  if (!isGameRunning) return;
  const dt = Math.min((time - lastTime) / 1000, 0.05); // cap delta
  lastTime = time;

  update(dt);
  draw();

  requestAnimationFrame(gameLoop);
}

function update(dt) {
  if (localPlayer) {
    localPlayer.update(dt, input);
    camera.follow(localPlayer.x, localPlayer.y);
  }
  camera.update(dt);
}

// ────────────────────────────────────
// 렌더링
// ────────────────────────────────────
const textureCache = {};
const SPRITE_R = 26;  // 스프라이트 반지름 (월드 단위)

function draw() {
  const W = canvas.width;
  const H = canvas.height;

  // 배경
  ctx.fillStyle = '#b8d4e8';
  ctx.fillRect(0, 0, W, H);

  drawGround(W, H);
  drawPlayers(W, H);
}

// ── 바닥 그리드 (2.5D 원근감) ──
function drawGround(W, H) {
  const gridSize = 100; // 월드 단위 간격

  // 화면에 보이는 월드 범위 계산 (약간 넉넉하게)
  const tl = camera.screenToWorld(0, 0, W, H);
  const br = camera.screenToWorld(W, H, W, H);

  const startX = Math.floor(tl.x / gridSize) * gridSize;
  const endX   = Math.ceil(br.x / gridSize) * gridSize;
  const startY = Math.floor(tl.y / gridSize) * gridSize;
  const endY   = Math.ceil(br.y / gridSize) * gridSize;

  ctx.strokeStyle = 'rgba(100, 140, 170, 0.25)';
  ctx.lineWidth   = 1;

  // 세로선
  for (let x = startX; x <= endX; x += gridSize) {
    const top = camera.worldToScreen(x, startY, 0, W, H);
    const bot = camera.worldToScreen(x, endY,   0, W, H);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(bot.x, bot.y);
    ctx.stroke();
  }
  // 가로선
  for (let y = startY; y <= endY; y += gridSize) {
    const lft = camera.worldToScreen(startX, y, 0, W, H);
    const rgt = camera.worldToScreen(endX,   y, 0, W, H);
    ctx.beginPath();
    ctx.moveTo(lft.x, lft.y);
    ctx.lineTo(rgt.x, rgt.y);
    ctx.stroke();
  }

  // 맵 경계 사각형
  const corners = [
    camera.worldToScreen(0, 0, 0, W, H),
    camera.worldToScreen(MAP.width, 0, 0, W, H),
    camera.worldToScreen(MAP.width, MAP.height, 0, W, H),
    camera.worldToScreen(0, MAP.height, 0, W, H),
  ];
  ctx.strokeStyle = 'rgba(80, 120, 160, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.stroke();
}

// ── 플레이어 렌더링 ──
function drawPlayers(W, H) {
  const myId = socket ? socket.id : null;
  const me   = myId ? networkPlayers[myId] : null;

  // HP UI 업데이트
  if (me) {
    gameStateManager.isSeeker = me.role === 'seeker';
    const hpBox = document.getElementById('hp-box');
    if (me.role === 'seeker') {
      hpBox.style.display = 'inline-flex';
      const fill = document.getElementById('hp-bar-fill');
      fill.style.width = Math.max(0, me.hp) + '%';
      fill.style.backgroundColor = me.hp > 30 ? '#48bb78' : '#e53e3e';
    } else {
      hpBox.style.display = 'none';
    }
  }

  // Y-Sorting: y좌표가 작은(뒤쪽) 플레이어를 먼저 그린다
  const sortedIds = Object.keys(networkPlayers).sort((a, b) => {
    const ay = a === myId && localPlayer ? localPlayer.y : networkPlayers[a].y;
    const by = b === myId && localPlayer ? localPlayer.y : networkPlayers[b].y;
    return ay - by;
  });

  for (const id of sortedIds) {
    const p = networkPlayers[id];

    // 월드 좌표 결정 (자기 자신은 localPlayer 사용)
    let wx = p.x;
    let wy = p.y;
    if (id === myId && localPlayer) {
      wx = localPlayer.x;
      wy = localPlayer.y;
    }

    const screen = camera.worldToScreen(wx, wy, 0, W, H);
    const r = SPRITE_R * camera.scale;

    // 화면 밖이면 스킵
    if (screen.x < -r * 2 || screen.x > W + r * 2 || screen.y < -r * 2 || screen.y > H + r * 2) continue;

    // ── 그림자 (타원) ──
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y + r * 0.55, r * 0.7, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── 캐릭터 스프라이트 ──
    if (id === myId && paintTool) {
      // 자신: 실시간 오프스크린 캔버스
      const sz = SPRITE_R * 2 * camera.scale;
      ctx.drawImage(paintTool.canvas, screen.x - sz / 2, screen.y - sz, sz, sz);
    } else if (p.textureData) {
      // 타인: 서버에서 받은 텍스처
      if (!textureCache[id] || textureCache[id]._src !== p.textureData) {
        const img = new Image();
        img.src = p.textureData;
        img._src = p.textureData;
        textureCache[id] = img;
      }
      const sz = SPRITE_R * 2 * camera.scale;
      ctx.drawImage(textureCache[id], screen.x - sz / 2, screen.y - sz, sz, sz);
    } else {
      // 기본 플레이스홀더
      const bodyColor = p.role === 'seeker' ? '#fc8181' : '#e8ecf1';
      // 몸통
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y - r * 0.5, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#556';
      ctx.lineWidth = 2 * camera.scale;
      ctx.stroke();
      // 죽었으면 X 표시
      if (!p.isAlive) {
        ctx.strokeStyle = '#c00';
        ctx.lineWidth = 3 * camera.scale;
        const cr = r * 0.35;
        ctx.beginPath();
        ctx.moveTo(screen.x - cr, screen.y - r * 0.5 - cr);
        ctx.lineTo(screen.x + cr, screen.y - r * 0.5 + cr);
        ctx.moveTo(screen.x + cr, screen.y - r * 0.5 - cr);
        ctx.lineTo(screen.x - cr, screen.y - r * 0.5 + cr);
        ctx.stroke();
      }
    }

    // ── 닉네임 ──
    const isHunt  = gameStateManager.status === 'hunt';
    const hideName = isHunt && me && me.role === 'seeker' && p.role === 'hider' && p.isAlive;

    if (!hideName) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.font = `bold ${Math.round(13 * camera.scale)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      const label = p.nickname + (p.isAlive ? '' : ' 💀');
      ctx.fillText(label, screen.x, screen.y - r * 1.7);
    }
  }
}

// ────────────────────────────────────
// 포인터 → 드로잉 / 태그
// ────────────────────────────────────
function onPointerDown() {
  if (!socket || !localPlayer) return;
  const me = networkPlayers[socket.id];
  if (!me) return;

  if (gameStateManager.status === 'prep' && me.role === 'hider') {
    // 화면 좌표 → 텍스처 로컬 좌표로 변환
    const local = screenToTextureLocal(pointer.x, pointer.y);
    if (local) paintTool.beginStroke(local.x, local.y);
  } else if (gameStateManager.status === 'hunt' && me.role === 'seeker') {
    attemptTag(pointer.x, pointer.y);
  }
}

function onPointerMove() {
  if (!pointer.isDown || !socket || !localPlayer) return;
  const me = networkPlayers[socket.id];
  if (!me) return;

  if (gameStateManager.status === 'prep' && me.role === 'hider') {
    const local = screenToTextureLocal(pointer.x, pointer.y);
    if (local) paintTool.continueStroke(local.x, local.y);
  }
}

function onPointerUp() {
  if (paintTool) paintTool.endStroke();
}

/** 화면 좌표 → 내 캐릭터 텍스처의 로컬 좌표 (0~size) */
function screenToTextureLocal(sx, sy) {
  if (!localPlayer || !paintTool) return null;

  const W = canvas.width;
  const H = canvas.height;

  // 내 캐릭터의 화면 좌표
  const ps = camera.worldToScreen(localPlayer.x, localPlayer.y, 0, W, H);
  const sz = SPRITE_R * 2 * camera.scale;

  // 스프라이트 영역: (ps.x - sz/2, ps.y - sz) ~ (ps.x + sz/2, ps.y)
  const relX = (sx - (ps.x - sz / 2)) / sz * paintTool.size;
  const relY = (sy - (ps.y - sz))      / sz * paintTool.size;

  if (relX < 0 || relX > paintTool.size || relY < 0 || relY > paintTool.size) return null;
  return { x: relX, y: relY };
}

function attemptTag(sx, sy) {
  const W = canvas.width;
  const H = canvas.height;
  let targetId = null;

  for (const id in networkPlayers) {
    if (id === socket.id) continue;
    const p = networkPlayers[id];
    if (!p.isAlive || p.role !== 'hider') continue;

    const ps = camera.worldToScreen(p.x, p.y, 0, W, H);
    const r  = SPRITE_R * camera.scale;
    const dx = sx - ps.x;
    const dy = sy - (ps.y - r * 0.5);
    if (Math.sqrt(dx * dx + dy * dy) <= r * 1.2) {
      targetId = id;
      break;
    }
  }
  socket.emit('tagPlayer', targetId);
}
