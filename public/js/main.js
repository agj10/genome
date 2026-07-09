import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/addons/shaders/RGBShiftShader.js';

// ────────────────────────────────────
// main.js — Three.js 3D 렌더링 엔진 & Phase 5
// ────────────────────────────────────
const canvas = document.getElementById('game-canvas');
let renderer, scene, camera, composer;
let bokehPass, bloomPass, ssaoPass, rgbShiftPass;
let ambientLight, dirLight;
let groundMat; // 바닥 머티리얼 (색상 변경용)

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
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  input.keys[e.key] = true; 
  handleShortcuts(e.key);
  if (e.code === 'Space') {
    e.preventDefault();
    handleJump();
  }
});
window.addEventListener('keyup', (e) => { input.keys[e.key] = false; });
window.addEventListener('blur', () => { input.keys = {}; });
window.addEventListener('resize', resizeCanvas);

let isRightMouseDown = false;
let cameraPitchOffset = 0;

window.addEventListener('mousedown', (e) => {
  if (e.button === 2) {
    isRightMouseDown = true;
    e.preventDefault();
  }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 2) isRightMouseDown = false;
});
window.addEventListener('mousemove', (e) => {
  if (isRightMouseDown) {
    cameraPitchOffset += e.movementY * 1.5;
    if (cameraPitchOffset < -800) cameraPitchOffset = -800;
    if (cameraPitchOffset > 800) cameraPitchOffset = 800;
  }
});
window.addEventListener('contextmenu', e => e.preventDefault());

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

  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 1, 5000);
  
  // 조명 세팅
  ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const pointLight = new THREE.PointLight(0xffddaa, 1.5, 2000);
  pointLight.position.set(MAP.width / 2, 400, MAP.height / 2);
  pointLight.castShadow = true;
  scene.add(pointLight);

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

  // 바닥 텍스처 생성 (그리드 무늬)
  const gridCanvas = document.createElement('canvas');
  gridCanvas.width = 512; gridCanvas.height = 512;
  const gCtx = gridCanvas.getContext('2d');
  gCtx.fillStyle = '#2d3748';
  gCtx.fillRect(0, 0, 512, 512);
  gCtx.strokeStyle = '#4a5568';
  gCtx.lineWidth = 4;
  gCtx.beginPath();
  for (let i = 0; i <= 512; i += 64) {
    gCtx.moveTo(i, 0); gCtx.lineTo(i, 512);
    gCtx.moveTo(0, i); gCtx.lineTo(512, i);
  }
  gCtx.stroke();
  const gridTex = new THREE.CanvasTexture(gridCanvas);
  gridTex.wrapS = THREE.RepeatWrapping;
  gridTex.wrapT = THREE.RepeatWrapping;
  gridTex.repeat.set(MAP.width / 256, MAP.height / 256);

  // 바닥 생성
  const groundGeo = new THREE.PlaneGeometry(MAP.width * 2, MAP.height * 2);
  groundMat = new THREE.MeshStandardMaterial({ map: gridTex, roughness: 0.8 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 포스트프로세싱 설정
  composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 1. SSAO (Screen Space Ambient Occlusion) - 구석구석 자연스러운 음영 추가
  ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
  ssaoPass.kernelRadius = 16;
  ssaoPass.minDistance = 0.001;
  ssaoPass.maxDistance = 0.1;
  composer.addPass(ssaoPass);

  // 2. Bloom (빛 번짐)
  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.4, 0.85);
  composer.addPass(bloomPass);

  // 3. Bokeh (피사계 심도)
  bokehPass = new BokehPass(scene, camera, {
    focus: 1.0,
    aperture: 0.00005,
    maxblur: 0.004,
    width: window.innerWidth,
    height: window.innerHeight
  });
  composer.addPass(bokehPass);

  // 4. RGB Shift (색 수차 - 술래 거리에 따른 효과)
  rgbShiftPass = new ShaderPass(RGBShiftShader);
  rgbShiftPass.uniforms['amount'].value = 0.0;
  composer.addPass(rgbShiftPass);
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
  document.getElementById('quick-start-btn').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/quick-room');
      const data = await res.json();
      if (data.roomId) window.joinRoom(data.roomId);
    } catch (e) {
      console.error(e);
      alert('빠른 시작 중 오류가 발생했습니다.');
    }
  });

  const createModal = document.getElementById('create-room-modal');
  if (document.getElementById('show-create-room-btn')) {
    document.getElementById('show-create-room-btn').addEventListener('click', () => {
      document.getElementById('create-room-modal').querySelector('h2').textContent = '새로운 방 만들기';
      document.getElementById('create-room-confirm-btn').textContent = '방 만들기';
      createModal.style.display = 'flex';
    });
  }
  if (document.getElementById('create-room-cancel-btn')) {
    document.getElementById('create-room-cancel-btn').addEventListener('click', () => {
      createModal.style.display = 'none';
    });
  }

  if (document.getElementById('create-room-confirm-btn')) {
    document.getElementById('create-room-confirm-btn').addEventListener('click', async () => {
      const isPublic = !document.getElementById('create-room-password').value;
      const password = document.getElementById('create-room-password').value;
      const maxPlayers = parseInt(document.getElementById('create-room-max').value);
      const gameMode = document.getElementById('create-room-mode').value;
      const mapTheme = document.getElementById('create-room-map').value;

      if (currentRoomId) {
        if (socket) {
          socket.emit('updateRoomSettings', { isPublic, password, maxPlayers, gameMode, mapTheme });
        }
        createModal.style.display = 'none';
        return;
      }



      const roomId = generateRoomCode();
      try {
        const res = await fetch('/api/create-room', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, isPublic, password, maxPlayers, gameMode, mapTheme })
        });
        const data = await res.json();
        if (data.success) {
          createModal.style.display = 'none';
          window.joinRoom(roomId);
        } else {
          alert(data.error || '방 생성 실패');
        }
      } catch (e) {
        console.error(e);
      }
    });
  }

  if (document.getElementById('edit-room-btn')) {
    document.getElementById('edit-room-btn').addEventListener('click', () => {
      if (window.gameStateManager && window.gameStateManager.settings) {
        document.getElementById('create-room-mode').value = window.gameStateManager.settings.gameMode || 'normal';
        document.getElementById('create-room-map').value = window.gameStateManager.settings.mapTheme || 'mansion';
        document.getElementById('create-room-max').value = window.gameStateManager.settings.maxPlayers || 10;
      }
      document.getElementById('create-room-modal').querySelector('h2').textContent = '방 설정 변경';
      document.getElementById('create-room-confirm-btn').textContent = '변경 저장';
      createModal.style.display = 'flex';
    });
  }

  const statsModal = document.getElementById('stats-modal');
  if (document.getElementById('show-stats-btn')) {
    document.getElementById('show-stats-btn').addEventListener('click', () => {
      if (window.updateStatsUI) window.updateStatsUI();
      statsModal.style.display = 'flex';
    });
  }
  if (document.getElementById('close-stats-btn')) {
    document.getElementById('close-stats-btn').addEventListener('click', () => {
      statsModal.style.display = 'none';
    });
  }

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
    const oldX = localPlayer.x;
    const oldY = localPlayer.y;

    localPlayer.update(dt, input);
    
    const r = localPlayer.radius || 26;
    
    if (mapObjects) {
      for (const obj of mapObjects) {
        if (localPlayer.z < obj.height) {
          const halfSize = obj.size / 2;
          const left = obj.x - halfSize;
          const right = obj.x + halfSize;
          const top = obj.y - halfSize;
          const bottom = obj.y + halfSize;
          
          if (localPlayer.x + r > left && localPlayer.x - r < right &&
              localPlayer.y + r > top && localPlayer.y - r < bottom) {
            
            if (oldX + r <= left || oldX - r >= right) localPlayer.x = oldX;
            if (oldY + r <= top || oldY - r >= bottom) localPlayer.y = oldY;
          }
        }
      }
    }

    if (localPlayer.x < r) localPlayer.x = r;
    if (localPlayer.x > MAP.width - r) localPlayer.x = MAP.width - r;
    if (localPlayer.y < r) localPlayer.y = r;
    if (localPlayer.y > MAP.height - r) localPlayer.y = MAP.height - r;

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
    const camOffsetY = (targetZoom * 0.5) + (cameraPitchOffset * 0.5);
    const camOffsetZ = targetZoom * 0.9;

    camera.position.x += ((localPlayer.x + camOffsetX) - camera.position.x) * 5 * dt;
    camera.position.z += ((localPlayer.y + camOffsetZ) - camera.position.z) * 5 * dt;
    camera.position.y += ((localPlayer.z + camOffsetY) - camera.position.y) * 5 * dt;

    const lookAtY = localPlayer.z + (cameraPitchOffset * 0.2);
    camera.lookAt(localPlayer.x, lookAtY, localPlayer.y);
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
        // 2D 스프라이트 형태로 생성 (항상 카메라를 바라보는 평면)
        const boxCanvas = document.createElement('canvas');
        boxCanvas.width = 256; boxCanvas.height = 256;
        const bCtx = boxCanvas.getContext('2d');
        bCtx.fillStyle = obj.color;
        bCtx.fillRect(0, 0, 256, 256);
        bCtx.strokeStyle = 'rgba(0,0,0,0.3)';
        bCtx.lineWidth = 16;
        bCtx.strokeRect(8, 8, 240, 240);
        bCtx.beginPath();
        bCtx.moveTo(8, 8); bCtx.lineTo(248, 248);
        bCtx.moveTo(248, 8); bCtx.lineTo(8, 248);
        bCtx.stroke();
        const boxTex = new THREE.CanvasTexture(boxCanvas);

        // 오브젝트 모양에 따른 2D 지오메트리 사용 (기본은 사각형)
        const geo = getShapeGeometry(obj.type || 'square', obj.size);
        const mat = new THREE.MeshStandardMaterial({ 
          map: boxTex, 
          roughness: 0.7, 
          transparent: true, 
          alphaTest: 0.1,
          side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        meshCache[obj.id] = mesh;
      }
      const mesh = meshCache[obj.id];
      mesh.position.set(obj.x, obj.height/2, obj.y);
      // 완벽한 빌보드: 카메라 회전과 동일하게 맞춤
      mesh.quaternion.copy(camera.quaternion);
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

    // 완벽한 빌보드 (항상 카메라 방향)
    mesh.quaternion.copy(camera.quaternion);
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

    // 완벽한 빌보드 (항상 카메라 방향)
    mesh.quaternion.copy(camera.quaternion);
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

  // 색 수차 조절 (술래와의 거리)
  if (rgbShiftPass && localPlayer && me && me.role === 'hider' && gameStateManager.status === 'hunt') {
    let minSeekerDist = Infinity;
    for (const pId in networkPlayers) {
      const p = networkPlayers[pId];
      if (p.role === 'seeker' && p.isAlive && meshCache[pId]) {
        const d = new THREE.Vector2(localPlayer.x - p.x, localPlayer.y - p.y).length();
        if (d < minSeekerDist) minSeekerDist = d;
      }
    }
    // 술래가 300 유닛 이내로 접근하면 효과 강해짐
    if (minSeekerDist < 300) {
      const intensity = (300 - minSeekerDist) / 300;
      rgbShiftPass.uniforms['amount'].value = intensity * 0.015; // 최대 0.015
    } else {
      rgbShiftPass.uniforms['amount'].value = 0.0;
    }
  } else if (rgbShiftPass) {
    rgbShiftPass.uniforms['amount'].value = 0.0;
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

  if (gameStateManager.status === 'hunt' && me.role === 'seeker') {
    attemptTag3D(e.clientX, e.clientY);
  }
}

function onPointerMove(e) {
  // 사용되지 않음 (paintTool.js 내부에서 처리)
}

function onPointerUp() {
  // 사용되지 않음
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
