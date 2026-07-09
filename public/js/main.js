// ────────────────────────────────────
// main.js — 2.5D 렌더링 엔진 & Phase 4 메커니즘
// ────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');

let isGameRunning = false;
let lastTime      = 0;
let localPlayer   = null;
let paintTool     = null;
let currentRoomId = null;

const MAP = { width: 2000, height: 2000 };

const input   = { keys: {} };
const pointer = { x: 0, y: 0, isDown: false };

window.addEventListener('keydown', (e) => { 
  input.keys[e.key] = true; 
  handleShortcuts(e.key);
});
window.addEventListener('keyup',   (e) => { input.keys[e.key] = false; });
window.addEventListener('resize', resizeCanvas);

function handleShortcuts(key) {
  if (!socket || !localPlayer) return;
  const me = networkPlayers[socket.id];
  if (!me || me.role !== 'hider' || !me.isAlive) return;

  const k = key.toLowerCase();
  
  if (gameStateManager.status === 'prep') {
    if (k === 'r') {
      // 형태 변환 (Circle -> Square -> Triangle -> Circle)
      const shapes = ['circle', 'square', 'triangle'];
      let idx = shapes.indexOf(me.shape);
      if (idx === -1) idx = 0;
      const nextShape = shapes[(idx + 1) % shapes.length];
      socket.emit('changeShape', nextShape);
    }
  }

  if (gameStateManager.status === 'prep' || gameStateManager.status === 'hunt') {
    if (k === 'q') {
      // 디코이 설치
      if (paintTool) {
        socket.emit('addDecoy', {
          x: localPlayer.x,
          y: localPlayer.y,
          shape: me.shape || 'circle',
          textureData: paintTool.getTextureData()
        });
      }
    } else if (k === 'x') {
      // 디코이 제거
      socket.emit('removeDecoys');
    }
  }
}

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

  const doJoin = () => socket.emit('joinRoom', currentRoomId);
  if (socket && socket.connected) doJoin();
  else socket.on('connect', doJoin);

  localPlayer = new LocalPlayer(MAP.width / 2, MAP.height / 2);
  paintTool   = new PaintTool(64);

  camera.x = camera.targetX = localPlayer.x;
  camera.y = camera.targetY = localPlayer.y;

  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

// ── 메뉴 버튼 ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('quick-start-btn').addEventListener('click', () => joinRoom(generateRoomCode()));

  document.getElementById('join-room-btn').addEventListener('click', () => {
    const code = document.getElementById('room-code-input').value.trim();
    if (code) joinRoom(code);
    else alert('방 코드를 입력해주세요.');
  });

  document.getElementById('ready-btn').addEventListener('click', () => {
    gameStateManager.toggleReady();
  });

  // 게임 모드 변경 (방장 전용/우선 누구나)
  const modeSelect = document.getElementById('game-mode-select');
  if (modeSelect) {
    modeSelect.addEventListener('change', (e) => {
      if (socket && socket.connected) {
        socket.emit('changeMode', e.target.value);
      }
    });
  }
});

// ────────────────────────────────────
// 게임 루프
// ────────────────────────────────────
function gameLoop(time) {
  if (!isGameRunning) return;
  const dt = Math.min((time - lastTime) / 1000, 0.05);
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
const SPRITE_R = 26;

function getThemeColor(varName, fallback) {
  const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return val || fallback;
}

function draw() {
  const W = canvas.width;
  const H = canvas.height;

  // 배경 (테마에 따라)
  ctx.fillStyle = getThemeColor('--ground-bg', '#1a2e40');
  ctx.fillRect(0, 0, W, H);

  drawGround(W, H);
  
  // Y-Sorting 렌더링 파이프라인 (맵 오브젝트 + 플레이어 + 디코이)
  renderYEntities(W, H);

  // Announcer 오버레이
  announcer.render(ctx, W, H);
}

function drawGround(W, H) {
  const gridSize = 100;
  const tl = camera.screenToWorld(0, 0, W, H);
  const br = camera.screenToWorld(W, H, W, H);

  const startX = Math.floor(tl.x / gridSize) * gridSize;
  const endX   = Math.ceil(br.x / gridSize) * gridSize;
  const startY = Math.floor(tl.y / gridSize) * gridSize;
  const endY   = Math.ceil(br.y / gridSize) * gridSize;

  ctx.strokeStyle = getThemeColor('--grid-color', 'rgba(100,140,170,0.25)');
  ctx.lineWidth = 1;

  for (let x = startX; x <= endX; x += gridSize) {
    const top = camera.worldToScreen(x, startY, 0, W, H);
    const bot = camera.worldToScreen(x, endY,   0, W, H);
    ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bot.x, bot.y); ctx.stroke();
  }
  for (let y = startY; y <= endY; y += gridSize) {
    const lft = camera.worldToScreen(startX, y, 0, W, H);
    const rgt = camera.worldToScreen(endX,   y, 0, W, H);
    ctx.beginPath(); ctx.moveTo(lft.x, lft.y); ctx.lineTo(rgt.x, rgt.y); ctx.stroke();
  }

  // 맵 경계
  const corners = [
    camera.worldToScreen(0, 0, 0, W, H),
    camera.worldToScreen(MAP.width, 0, 0, W, H),
    camera.worldToScreen(MAP.width, MAP.height, 0, W, H),
    camera.worldToScreen(0, MAP.height, 0, W, H),
  ];
  ctx.strokeStyle = getThemeColor('--grid-border', 'rgba(80,120,160,0.5)');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.stroke();
}

// ── 클리핑 렌더링 헬퍼 ──
function drawShapeTexture(shape, x, y, r, imgSource) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  const sz = r * 2;
  
  if (shape === 'square') {
    ctx.rect(-sz/2, -sz, sz, sz);
  } else if (shape === 'triangle') {
    ctx.moveTo(0, -sz);
    ctx.lineTo(sz/2, 0);
    ctx.lineTo(-sz/2, 0);
    ctx.closePath();
  } else {
    // circle
    ctx.arc(0, -sz/2, r, 0, Math.PI * 2);
  }
  
  ctx.clip();
  ctx.drawImage(imgSource, -sz/2, -sz, sz, sz);
  ctx.restore();
}

function drawShapeSolid(shape, x, y, r, color, borderColor, isDead) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  const sz = r * 2;
  
  if (shape === 'square') {
    ctx.rect(-sz/2, -sz, sz, sz);
  } else if (shape === 'triangle') {
    ctx.moveTo(0, -sz);
    ctx.lineTo(sz/2, 0);
    ctx.lineTo(-sz/2, 0);
    ctx.closePath();
  } else {
    ctx.arc(0, -sz/2, r, 0, Math.PI * 2);
  }
  
  ctx.fillStyle = color;
  ctx.fill();
  if (borderColor) {
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2 * camera.scale;
    ctx.stroke();
  }
  
  if (isDead) {
    ctx.strokeStyle = '#c00';
    ctx.lineWidth = 3 * camera.scale;
    const cr = r * 0.35;
    ctx.beginPath();
    ctx.moveTo(-cr, -r*0.5 - cr);
    ctx.lineTo(cr, -r*0.5 + cr);
    ctx.moveTo(cr, -r*0.5 - cr);
    ctx.lineTo(-cr, -r*0.5 + cr);
    ctx.stroke();
  }
  
  ctx.restore();
}

// ── 통합 렌더링 ──
function renderYEntities(W, H) {
  const myId = socket ? socket.id : null;
  const me   = myId ? networkPlayers[myId] : null;

  // HP UI Update
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

  const entities = [];

  // 1. Map Objects
  if (mapObjects && mapObjects.length > 0) {
    mapObjects.forEach(obj => {
      entities.push({ type: 'obj', y: obj.y, data: obj });
    });
  }

  // 2. Decoys
  for (const dId in networkDecoys) {
    const d = networkDecoys[dId];
    entities.push({ type: 'decoy', y: d.y, id: dId, data: d });
  }

  // 3. Players
  for (const pId in networkPlayers) {
    const p = networkPlayers[pId];
    let wx = p.x, wy = p.y;
    if (pId === myId && localPlayer) { wx = localPlayer.x; wy = localPlayer.y; }
    entities.push({ type: 'player', y: wy, id: pId, data: p, wx });
  }

  // 정렬
  entities.sort((a, b) => a.y - b.y);

  // 렌더
  const rBase = SPRITE_R * camera.scale;

  for (const ent of entities) {
    const screen = camera.worldToScreen(ent.type==='player'?ent.wx:ent.data.x, ent.y, 0, W, H);
    
    // 그림자 (오브젝트는 크기에 비례, 플레이어/디코이는 고정)
    let shadowR = rBase;
    if (ent.type === 'obj') shadowR = (ent.data.size/2) * camera.scale;
    
    // 화면 밖이면 스킵
    if (screen.x < -shadowR * 3 || screen.x > W + shadowR * 3 || screen.y < -shadowR * 3 || screen.y > H + shadowR * 3) continue;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y + shadowR * 0.55, shadowR * 0.7, shadowR * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    if (ent.type === 'obj') {
      const o = ent.data;
      drawShapeSolid(o.type, screen.x, screen.y, (o.size/2) * camera.scale, o.color, 'rgba(0,0,0,0.2)', false);
    } 
    else if (ent.type === 'decoy') {
      const d = ent.data;
      if (d.textureData) {
        if (!textureCache[ent.id] || textureCache[ent.id]._src !== d.textureData) {
          const img = new Image();
          img.src = d.textureData;
          img._src = d.textureData;
          textureCache[ent.id] = img;
        }
        drawShapeTexture(d.shape || 'circle', screen.x, screen.y, rBase, textureCache[ent.id]);
      }
    }
    else if (ent.type === 'player') {
      const p = ent.data;
      const pShape = p.shape || 'circle';

      if (ent.id === myId && paintTool) {
        drawShapeTexture(pShape, screen.x, screen.y, rBase, paintTool.canvas);
      } else if (p.textureData) {
        if (!textureCache[ent.id] || textureCache[ent.id]._src !== p.textureData) {
          const img = new Image();
          img.src = p.textureData;
          img._src = p.textureData;
          textureCache[ent.id] = img;
        }
        drawShapeTexture(pShape, screen.x, screen.y, rBase, textureCache[ent.id]);
      } else {
        const bodyColor = p.role === 'seeker' ? '#fc8181' : '#e8ecf1';
        drawShapeSolid(pShape, screen.x, screen.y, rBase, bodyColor, '#556', !p.isAlive);
      }

      // 닉네임
      const isHunt  = gameStateManager.status === 'hunt';
      const hideName = isHunt && me && me.role === 'seeker' && p.role === 'hider' && p.isAlive;
      if (!hideName) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = `bold ${Math.round(13 * camera.scale)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        const label = p.nickname + (p.isAlive ? '' : ' 💀');
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        const ty = screen.y - rBase * 1.8;
        ctx.fillRect(screen.x - tw / 2 - 4, ty - 8, tw + 8, 16);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, screen.x, ty);
      }
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

function screenToTextureLocal(sx, sy) {
  if (!localPlayer || !paintTool) return null;
  const W = canvas.width, H = canvas.height;
  const ps = camera.worldToScreen(localPlayer.x, localPlayer.y, 0, W, H);
  const sz = SPRITE_R * 2 * camera.scale;
  const relX = (sx - (ps.x - sz / 2)) / sz * paintTool.size;
  const relY = (sy - (ps.y - sz))      / sz * paintTool.size;
  
  if (relX < 0 || relX > paintTool.size || relY < 0 || relY > paintTool.size) return null;
  
  // 클리핑: 형태 밖이면 붓질 무시
  const me = networkPlayers[socket.id];
  const shape = me?.shape || 'circle';
  const cx = paintTool.size / 2;
  const cy = paintTool.size / 2;
  
  if (shape === 'circle') {
    const dx = relX - cx;
    const dy = relY - cy;
    if (dx*dx + dy*dy > cx*cx) return null;
  } else if (shape === 'triangle') {
    // 단순화된 삼각형 판정: top(cx, 0), bl(0, size), br(size, size)
    // 좀 더 정밀하게 할 수도 있지만 직관적으로 패스
    if (relY < paintTool.size - relX * 2 && relX < cx) return null;
    if (relY < relX * 2 - paintTool.size && relX > cx) return null;
  }
  
  return { x: relX, y: relY };
}

function attemptTag(sx, sy) {
  const W = canvas.width, H = canvas.height;
  const r  = SPRITE_R * camera.scale;
  
  // 1. 디코이 검사
  for (const dId in networkDecoys) {
    const d = networkDecoys[dId];
    const ps = camera.worldToScreen(d.x, d.y, 0, W, H);
    const dx = sx - ps.x;
    const dy = sy - (ps.y - r * 0.5);
    if (Math.sqrt(dx * dx + dy * dy) <= r * 1.2) {
      socket.emit('tagPlayer', { targetId: dId, isDecoy: true });
      return;
    }
  }

  // 2. 플레이어 검사
  let targetId = null;
  for (const id in networkPlayers) {
    if (id === socket.id) continue;
    const p = networkPlayers[id];
    if (!p.isAlive || p.role !== 'hider') continue;
    
    const ps = camera.worldToScreen(p.x, p.y, 0, W, H);
    const dx = sx - ps.x;
    const dy = sy - (ps.y - r * 0.5);
    if (Math.sqrt(dx * dx + dy * dy) <= r * 1.2) {
      targetId = id;
      break;
    }
  }
  
  if (targetId) {
    socket.emit('tagPlayer', { targetId: targetId, isDecoy: false });
  } else {
    // 헛스윙 처리 요청
    socket.emit('tagPlayer', null);
  }
}
