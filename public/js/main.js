import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';

// ────────────────────────────────────
// main.js — Three.js 3D 렌더링 엔진 & Phase 5
// ────────────────────────────────────
const canvas = document.getElementById('game-canvas');
let renderer, scene, camera, composer, bokehPass;
let ambientLight, dirLight;

let isGameRunning = false;
let lastTime = 0;
let localPlayer = null;
let paintTool = null;
let currentRoomId = null;

const MAP = { width: 2000, height: 2000 };

const input = { keys: {} };
const pointer = { x: 0, y: 0, isDown: false };
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// 리소스 캐시
const textureCache = {};
const meshCache = {};

window.addEventListener('keydown', (e) => { 
  input.keys[e.key] = true; 
  handleShortcuts(e.key);
  if (e.code === 'Space') {
    e.preventDefault();
    handleJump();
  }
});
window.addEventListener('keyup', (e) => { input.keys[e.key] = false; });
window.addEventListener('resize', resizeCanvas);

function handleShortcuts(key) {
  if (!socket || !localPlayer) return;
  const me = networkPlayers[socket.id];
  if (!me || me.role !== 'hider' || !me.isAlive) return;

  const k = key.toLowerCase();
  
  if (gameStateManager.status === 'prep') {
    if (k === 'r') {
      const shapes = ['circle', 'square', 'triangle'];
      let idx = shapes.indexOf(me.shape);
      if (idx === -1) idx = 0;
      const nextShape = shapes[(idx + 1) % shapes.length];
      socket.emit('changeShape', nextShape);
    }
  }

  if (gameStateManager.status === 'prep' || gameStateManager.status === 'hunt') {
    if (k === 'q') {
      if (paintTool) {
        socket.emit('addDecoy', {
          x: localPlayer.x,
          y: localPlayer.y,
          shape: me.shape || 'circle',
          textureData: paintTool.getTextureData()
        });
      }
    } else if (k === 'x') {
      socket.emit('removeDecoys');
    }
  }
}

function handleJump() {
  if (localPlayer && localPlayer.vz === 0) {
    localPlayer.vz = 400; // 초기 점프 속도
  }
}

// ── 포인터 이벤트 ──
canvas.addEventListener('mousedown', (e) => {
  pointer.isDown = true;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  onPointerDown(e);
});
canvas.addEventListener('mousemove', (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  onPointerMove(e);
});
canvas.addEventListener('mouseup', () => { pointer.isDown = false; onPointerUp(); });
canvas.addEventListener('mouseleave', () => { pointer.isDown = false; onPointerUp(); });

// 카메라 줌 대체 (FOV 또는 카메라 거리 조절)
let targetZoom = 600;
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  targetZoom += e.deltaY * 0.5;
  targetZoom = Math.max(300, Math.min(targetZoom, 1500));
}, { passive: false });

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (camera && renderer) {
    camera.aspect = canvas.width / canvas.height;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.width, canvas.height);
    composer.setSize(canvas.width, canvas.height);
  }
}

// ── 3D 엔진 초기화 ──
function init3D() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x1a2e40); // 기본 배경색

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 5000);
  
  // 조명 세팅
  ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(500, 1000, 500);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 3000;
  const d = 1000;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d;
  dirLight.shadow.camera.bottom = -d;
  scene.add(dirLight);

  // 바닥 생성
  const groundGeo = new THREE.PlaneGeometry(MAP.width * 2, MAP.height * 2);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.8 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 포스트프로세싱 (피사계 심도)
  composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  bokehPass = new BokehPass(scene, camera, {
    focus: 1.0,
    aperture: 0.0001,
    maxblur: 0.01,
    width: window.innerWidth,
    height: window.innerHeight
  });
  composer.addPass(bokehPass);
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

window.joinRoom = function(roomId) {
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
  init3D();
  resizeCanvas();
  connectSocket();

  const doJoin = () => socket.emit('joinRoom', currentRoomId);
  if (socket && socket.connected) doJoin();
  else socket.on('connect', doJoin);

  // 로컬 플레이어 물리 확장을 위해 LocalPlayer 클래스 대신 객체로 Z값 추가
  localPlayer = new LocalPlayer(MAP.width / 2, MAP.height / 2);
  localPlayer.z = 0;
  localPlayer.vz = 0;
  window.localPlayer = localPlayer;

  paintTool = new PaintTool(64);
  window.paintTool = paintTool;

  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

// ── UI 이벤트 리스너 ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('quick-start-btn').addEventListener('click', () => window.joinRoom(generateRoomCode()));

  document.getElementById('join-room-btn').addEventListener('click', () => {
    const code = document.getElementById('room-code-input').value.trim();
    if (code) window.joinRoom(code);
    else alert('방 코드를 입력해주세요.');
  });

  document.getElementById('ready-btn').addEventListener('click', () => {
    gameStateManager.toggleReady();
  });

  // Custom event listener for game mode
  window.addEventListener('gameModeChanged', (e) => {
    if (socket && socket.connected) {
      socket.emit('changeMode', e.detail);
    }
  });
});

// ────────────────────────────────────
// 게임 루프
// ────────────────────────────────────
function gameLoop(time) {
  if (!isGameRunning) return;
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  
  update(dt);
  render3D();
  
  requestAnimationFrame(gameLoop);
}

function update(dt) {
  if (localPlayer) {
    // XY 이동
    localPlayer.update(dt, input);
    
    // Z 물리 (중력 및 점프)
    const gravity = -900;
    localPlayer.vz += gravity * dt;
    localPlayer.z += localPlayer.vz * dt;
    
    // 바닥 충돌 (간단한 AABB - 맵 오브젝트 위에 올라가는 기능)
    let groundHeight = 0;
    const r = 26; // 플레이어 반지름
    if (mapObjects) {
      for (const obj of mapObjects) {
        // AABB 체크 (원형이지만 박스로 취급)
        if (Math.abs(localPlayer.x - obj.x) < obj.size/2 + r &&
            Math.abs(localPlayer.y - obj.y) < obj.size/2 + r) {
          // 오브젝트 위에 있는지
          if (localPlayer.z >= obj.height - Math.abs(localPlayer.vz*dt)*2) {
            groundHeight = Math.max(groundHeight, obj.height);
          }
        }
      }
    }

    if (localPlayer.z <= groundHeight) {
      localPlayer.z = groundHeight;
      localPlayer.vz = 0;
    }

    // 서버에 내 Z 좌표도 포함하여 전송 (network.js/player.js가 emit을 하지만,
    // 현재 구조에서는 player.js가 x,y만 보낼 수 있으므로 여기서 가로채거나 수정 필요.
    // player.js 의 emit 코드를 덮어쓰지 않고 직접 전송합니다.)
    if (socket) {
      // 1초에 30번만 보내도록 하는 로직이 필요하지만, 여기서는 간략히 매 프레임이나
      // 혹은 update 빈도에 맞춰 보냅니다. (기존 player.js에서 x,y를 보냅니다)
      socket.emit('move', { x: localPlayer.x, y: localPlayer.y, z: localPlayer.z });
    }
  }

  // 카메라 업데이트
  if (localPlayer) {
    // 비스듬히 앞을 내려다보는 뷰 (거리: targetZoom)
    const camOffsetX = 0;
    const camOffsetY = targetZoom * 0.8;
    const camOffsetZ = targetZoom * 0.8; // Z가 높이 (three.js에서는 Y가 높이입니다)

    // Three.js 좌표계: x: 가로, z: 세로(깊이), y: 높이
    camera.position.x += ((localPlayer.x + camOffsetX) - camera.position.x) * 5 * dt;
    camera.position.z += ((localPlayer.y + camOffsetZ) - camera.position.z) * 5 * dt;
    camera.position.y += ((localPlayer.z + camOffsetY) - camera.position.y) * 5 * dt;

    camera.lookAt(localPlayer.x, localPlayer.z, localPlayer.y); // Y와 Z 스왑
  }
}

// ────────────────────────────────────
// 3D 렌더링 
// ────────────────────────────────────
function getShapeGeometry(shape, size) {
  if (shape === 'square') {
    return new THREE.PlaneGeometry(size, size);
  } else if (shape === 'triangle') {
    const geo = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      0, size/2, 0,
      -size/2, -size/2, 0,
      size/2, -size/2, 0
    ]);
    const uvs = new Float32Array([
      0.5, 1,
      0, 0,
      1, 0
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    return geo;
  } else { // circle
    return new THREE.CircleGeometry(size/2, 32);
  }
}

function render3D() {
  const myId = socket ? socket.id : null;
  const me = myId ? networkPlayers[myId] : null;

  // 조명 이동 (그림자 최적화를 위해 플레이어 따라다니게)
  if (localPlayer) {
    dirLight.position.x = localPlayer.x + 500;
    dirLight.position.z = localPlayer.y + 500;
    dirLight.target.position.set(localPlayer.x, 0, localPlayer.y);
    dirLight.target.updateMatrixWorld();
  }

  // 엔티티 정리 및 메쉬 동기화
  const activeIds = new Set();
  const rBase = 26;

  // 1. Map Objects
  if (mapObjects) {
    mapObjects.forEach(obj => {
      activeIds.add(obj.id);
      if (!meshCache[obj.id]) {
        // 벽/책상 등은 육면체(Box)로 구현하여 실제 입체감을 줍니다.
        // 또는 2D 스프라이트 형태로 세울 수도 있지만, "튀어나온 건 위로 뚝바로 세워서" 라면
        // 입체 박스가 자연스럽습니다. 지시에 따라 입체 박스로 하거나 Plane으로 합니다.
        // 여기선 입체(BoxGeometry)로 만들어 그림자와 물리(높이)를 자연스럽게 합니다.
        const geo = new THREE.BoxGeometry(obj.size, obj.height, obj.size);
        const mat = new THREE.MeshStandardMaterial({ color: obj.color, roughness: 0.7 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        meshCache[obj.id] = mesh;
      }
      const mesh = meshCache[obj.id];
      mesh.position.set(obj.x, obj.height/2, obj.y);
    });
  }

  // 2. Decoys
  for (const dId in networkDecoys) {
    activeIds.add(dId);
    const d = networkDecoys[dId];
    if (!meshCache[dId]) {
      const geo = getShapeGeometry(d.shape || 'circle', rBase * 2);
      const mat = new THREE.MeshStandardMaterial({ 
        color: 0xffffff, 
        transparent: true, 
        alphaTest: 0.1, 
        side: THREE.DoubleSide 
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      scene.add(mesh);
      meshCache[dId] = mesh;
    }
    const mesh = meshCache[dId];
    mesh.position.set(d.x, rBase, d.y); // z대신 y가 높이

    // 텍스처 업데이트
    if (d.textureData && mesh.userData.src !== d.textureData) {
      mesh.userData.src = d.textureData;
      new THREE.TextureLoader().load(d.textureData, (tex) => {
        mesh.material.map = tex;
        mesh.material.color.setHex(0xffffff);
        mesh.material.needsUpdate = true;
      });
    }

    // 빌보딩 (카메라를 향해 Y축 회전)
    mesh.rotation.y = Math.atan2(camera.position.x - mesh.position.x, camera.position.z - mesh.position.z);
  }

  // 3. Players
  for (const pId in networkPlayers) {
    activeIds.add(pId);
    const p = networkPlayers[pId];
    const pShape = p.shape || 'circle';

    if (!meshCache[pId] || meshCache[pId].userData.shape !== pShape) {
      if (meshCache[pId]) {
        scene.remove(meshCache[pId]);
        meshCache[pId].geometry.dispose();
      }
      const geo = getShapeGeometry(pShape, rBase * 2);
      const mat = new THREE.MeshStandardMaterial({ 
        color: p.role === 'seeker' ? 0xfc8181 : 0xe8ecf1, 
        transparent: true, 
        alphaTest: 0.1,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.userData.shape = pShape;
      scene.add(mesh);
      meshCache[pId] = mesh;
    }
    const mesh = meshCache[pId];

    let wx = p.x, wy = p.y, wz = p.z || 0;
    if (pId === myId && localPlayer) { 
      wx = localPlayer.x; wy = localPlayer.y; wz = localPlayer.z; 
    }
    mesh.position.set(wx, wz + rBase, wy);

    // 텍스처
    if (pId === myId && paintTool) {
      if (!mesh.userData.canvasTex) {
        mesh.userData.canvasTex = new THREE.CanvasTexture(paintTool.canvas);
        mesh.userData.canvasTex.minFilter = THREE.NearestFilter;
        mesh.userData.canvasTex.magFilter = THREE.NearestFilter;
        mesh.material.map = mesh.userData.canvasTex;
        mesh.material.color.setHex(0xffffff);
        mesh.material.needsUpdate = true;
      }
      mesh.userData.canvasTex.needsUpdate = true;
    } else if (p.textureData && mesh.userData.src !== p.textureData) {
      mesh.userData.src = p.textureData;
      new THREE.TextureLoader().load(p.textureData, (tex) => {
        mesh.material.map = tex;
        mesh.material.color.setHex(0xffffff);
        mesh.material.needsUpdate = true;
      });
    }

    // 사망 처리 시각화 (색상 어둡게 또는 투명도)
    if (!p.isAlive) {
      mesh.material.color.setHex(0x555555);
    } else if (!mesh.material.map) {
      mesh.material.color.setHex(p.role === 'seeker' ? 0xfc8181 : 0xe8ecf1);
    }

    // 빌보딩 (카메라를 향해 Y축 회전)
    mesh.rotation.y = Math.atan2(camera.position.x - mesh.position.x, camera.position.z - mesh.position.z);
  }

  // 화면에 없는 엔티티 삭제
  for (const id in meshCache) {
    if (!activeIds.has(id)) {
      scene.remove(meshCache[id]);
      meshCache[id].geometry.dispose();
      delete meshCache[id];
    }
  }

  // 초점 거리 조절 (피사계 심도)
  if (localPlayer) {
    const dist = camera.position.distanceTo(meshCache[myId]?.position || new THREE.Vector3(localPlayer.x, localPlayer.z, localPlayer.y));
    bokehPass.uniforms['focus'].value = dist;
  }

  // 렌더
  composer.render();

  // 오버레이 렌더링 (이름표, 아나운서)
  renderOverlay();
}

// ────────────────────────────────────
// 2D 오버레이 렌더링 (이름표 등)
// ────────────────────────────────────
function renderOverlay() {
  const W = canvas.width, H = canvas.height;
  const ctx2d = announcer.ctx || (() => {
    // Announcer가 ctx를 필요로 하므로, 2D 캔버스를 화면 위에 하나 띄워야 함
    // Three.js WebGL 위에 투명한 2D 캔버스 생성
    let c = document.getElementById('ui-canvas');
    if (!c) {
      c = document.createElement('canvas');
      c.id = 'ui-canvas';
      c.style.position = 'absolute';
      c.style.top = '0';
      c.style.left = '0';
      c.style.pointerEvents = 'none';
      c.style.zIndex = '10';
      document.getElementById('game-screen').appendChild(c);
    }
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    return c.getContext('2d');
  })();

  ctx2d.clearRect(0, 0, W, H);
  
  // 이름표 렌더링
  const myId = socket ? socket.id : null;
  const me = myId ? networkPlayers[myId] : null;
  const isHunt = gameStateManager.status === 'hunt';

  for (const pId in networkPlayers) {
    const p = networkPlayers[pId];
    if (!meshCache[pId]) continue;
    
    const hideName = isHunt && me && me.role === 'seeker' && p.role === 'hider' && p.isAlive;
    if (hideName) continue;

    const mesh = meshCache[pId];
    const pos = mesh.position.clone();
    pos.y += 40; // 머리 위로 이동
    
    // 3D 공간 -> 2D 스크린 투영
    pos.project(camera);
    
    const x = (pos.x * 0.5 + 0.5) * W;
    const y = (pos.y * -0.5 + 0.5) * H;
    
    if (pos.z > 1) continue; // 카메라 뒤에 있는 경우

    ctx2d.fillStyle = 'rgba(255,255,255,0.85)';
    ctx2d.font = `bold 14px Inter, sans-serif`;
    ctx2d.textAlign = 'center';
    const label = p.nickname + (p.isAlive ? '' : ' 💀');
    const tw = ctx2d.measureText(label).width;
    
    ctx2d.fillStyle = 'rgba(0,0,0,0.35)';
    ctx2d.fillRect(x - tw / 2 - 4, y - 12, tw + 8, 18);
    ctx2d.fillStyle = '#fff';
    ctx2d.fillText(label, x, y);
  }

  // 아나운서
  announcer.render(ctx2d, W, H);
}

// ────────────────────────────────────
// 포인터 → 드로잉 / 태그
// ────────────────────────────────────
function getPointerIntersection(sx, sy) {
  mouse.x = (sx / window.innerWidth) * 2 - 1;
  mouse.y = -(sy / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  // 내 메쉬와의 교차 검사 (드로잉용)
  if (socket && meshCache[socket.id]) {
    const intersects = raycaster.intersectObject(meshCache[socket.id]);
    if (intersects.length > 0) {
      return intersects[0].uv; // 0.0 ~ 1.0 범위
    }
  }
  return null;
}

function onPointerDown(e) {
  if (!socket || !localPlayer) return;
  const me = networkPlayers[socket.id];
  if (!me) return;

  if (gameStateManager.status === 'prep' && me.role === 'hider') {
    const uv = getPointerIntersection(e.clientX, e.clientY);
    if (uv && paintTool) {
      paintTool.beginStroke(uv.x * paintTool.size, (1 - uv.y) * paintTool.size); // UV y축 반전
    }
  } else if (gameStateManager.status === 'hunt' && me.role === 'seeker') {
    attemptTag3D(e.clientX, e.clientY);
  }
}

function onPointerMove(e) {
  if (!pointer.isDown || !socket || !localPlayer) return;
  const me = networkPlayers[socket.id];
  if (!me) return;
  
  if (gameStateManager.status === 'prep' && me.role === 'hider') {
    const uv = getPointerIntersection(e.clientX, e.clientY);
    if (uv && paintTool) {
      paintTool.continueStroke(uv.x * paintTool.size, (1 - uv.y) * paintTool.size);
    }
  }
}

function onPointerUp() {
  if (paintTool) paintTool.endStroke();
}

function attemptTag3D(sx, sy) {
  mouse.x = (sx / window.innerWidth) * 2 - 1;
  mouse.y = -(sy / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const targets = [];
  // 플레이어 및 디코이 메쉬 모으기
  for (const id in networkPlayers) {
    if (id !== socket.id && networkPlayers[id].isAlive && networkPlayers[id].role === 'hider') {
      if (meshCache[id]) targets.push(meshCache[id]);
    }
  }
  for (const dId in networkDecoys) {
    if (meshCache[dId]) {
      meshCache[dId].userData.isDecoy = true;
      meshCache[dId].userData.dId = dId;
      targets.push(meshCache[dId]);
    }
  }

  const intersects = raycaster.intersectObjects(targets);
  if (intersects.length > 0) {
    const hit = intersects[0].object;
    if (hit.userData.isDecoy) {
      socket.emit('tagPlayer', { targetId: hit.userData.dId, isDecoy: true });
    } else {
      // meshCache key 찾기
      const targetId = Object.keys(meshCache).find(k => meshCache[k] === hit);
      if (targetId) socket.emit('tagPlayer', { targetId, isDecoy: false });
    }
  } else {
    socket.emit('tagPlayer', null);
  }
}
