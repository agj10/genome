const PREP_TIME = 60;
const HUNT_TIME = 180;
const RESULT_TIME = 10;

class GameRoom {
  constructor(io, roomId, settings = {}) {
    this.io = io;
    this.roomId = roomId;
    this.status = 'lobby';
    this.timer = 0;
    this.intervalId = null;
    this.players = {};
    this.readyPlayers = new Set();
    
    // 방 설정 옵션
    this.isPublic = settings.isPublic !== undefined ? settings.isPublic : true;
    this.password = settings.password || '';
    this.maxPlayers = settings.maxPlayers || 10;
    this.gameMode = settings.gameMode || 'normal';
    this.mapTheme = settings.mapTheme || 'mansion';
    
    this.mapObjects = this.generateMapObjects();
    this.decoys = {}; // { decoyId: { ownerId, x, y, shape, textureData } }
    this.decoyCounter = 0;
  }

  applySettings(settings) {
    if (settings.isPublic !== undefined) this.isPublic = settings.isPublic;
    if (settings.password !== undefined) this.password = settings.password;
    if (settings.maxPlayers !== undefined) this.maxPlayers = settings.maxPlayers;
    if (settings.gameMode !== undefined) this.gameMode = settings.gameMode;
    if (settings.mapTheme !== undefined && settings.mapTheme !== this.mapTheme) {
      this.mapTheme = settings.mapTheme;
      this.mapObjects = this.generateMapObjects();
      this.io.to(this.roomId).emit('mapData', this.mapObjects); // 맵 즉시 갱신
    }
    this.broadcastState();
  }

  generateMapObjects() {
    const objects = [];
    let colors = [];
    let shapes = [];
    let objectCount = 30;
    let minSize = 40, maxSizeOffset = 40;
    let minHeight = 40, maxHeightOffset = 60;

    switch (this.mapTheme) {
      case 'mansion':
        colors = ['#8B4513', '#A0522D', '#D2691E', '#CD853F', '#F4A460'];
        shapes = ['square'];
        objectCount = 40;
        minSize = 50; maxSizeOffset = 80;
        break;
      case 'sewer':
        colors = ['#2F4F4F', '#556B2F', '#808000', '#696969', '#708090'];
        shapes = ['circle'];
        objectCount = 35;
        minHeight = 60; maxHeightOffset = 40;
        break;
      case 'backrooms':
        colors = ['#F5DEB3', '#FFE4B5', '#FFDAB9'];
        shapes = ['square'];
        objectCount = 10; // 장애물이 거의 없음
        minSize = 100; maxSizeOffset = 50;
        minHeight = 100; maxHeightOffset = 50;
        break;
      case 'country':
        colors = ['#228B22', '#32CD32', '#DAA520', '#B8860B'];
        shapes = ['square', 'circle'];
        objectCount = 30;
        minHeight = 30; maxHeightOffset = 40;
        break;
      case 'penguin':
        colors = ['#ADD8E6', '#87CEEB', '#00BFFF', '#E0FFFF', '#FFFFFF'];
        shapes = ['circle', 'triangle'];
        objectCount = 35;
        minSize = 30; maxSizeOffset = 40;
        break;
      case 'sugarland':
        colors = ['#FF69B4', '#FFC0CB', '#FFA07A', '#FFD700', '#DDA0DD'];
        shapes = ['circle', 'square', 'triangle'];
        objectCount = 50; // 작고 많음
        minSize = 20; maxSizeOffset = 30;
        minHeight = 20; maxHeightOffset = 40;
        break;
      case 'osaka':
        colors = ['#FF1493', '#00FFFF', '#FF00FF', '#FFFF00', '#00FF00'];
        shapes = ['square'];
        objectCount = 35;
        break;
      default:
        colors = ['#e53e3e', '#ecc94b', '#48bb78', '#4299e1', '#ed64a6', '#9f7aea', '#a0aec0', '#4a5568'];
        shapes = ['circle', 'square', 'triangle'];
        break;
    }
    
    for (let i = 0; i < objectCount; i++) {
      objects.push({
        id: `obj_${i}`,
        type: shapes[Math.floor(Math.random() * shapes.length)],
        x: Math.random() * 1800 + 100, // 2000x2000 맵
        y: Math.random() * 1800 + 100,
        z: 0,
        size: Math.random() * maxSizeOffset + minSize, 
        height: Math.random() * maxHeightOffset + minHeight, 
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
    return objects;
  }

  setPlayersReference(playersObj) {
    this.players = playersObj;
  }

  setMode(mode) {
    if (this.status === 'lobby') {
      this.mode = mode;
      this.broadcastState();
    }
  }

  broadcastState() {
    this.io.to(this.roomId).emit('gameState', {
      status: this.status,
      timer: this.timer,
      readyCount: this.readyPlayers.size,
      playerCount: Object.keys(this.players).length,
      settings: {
        isPublic: this.isPublic,
        maxPlayers: this.maxPlayers,
        gameMode: this.gameMode,
        mapTheme: this.mapTheme
      }
    });
  }

  // ── 레디 시스템 ──
  toggleReady(socketId) {
    if (this.status !== 'lobby') return;

    if (this.readyPlayers.has(socketId)) {
      this.readyPlayers.delete(socketId);
    } else {
      this.readyPlayers.add(socketId);
    }

    this.broadcastState();

    // 전원 레디 체크 (최소 1명 이상)
    const total = Object.keys(this.players).length;
    if (total > 0 && this.readyPlayers.size >= total) {
      this.startPrep();
    }
  }

  removePlayer(socketId) {
    this.readyPlayers.delete(socketId);
    delete this.players[socketId];
    
    // 주인이 나갔을 때 해당 주인의 디코이 제거
    for (const dId in this.decoys) {
      if (this.decoys[dId].ownerId === socketId) {
        delete this.decoys[dId];
      }
    }
  }

  startPrep() {
    this.status = 'prep';
    this.timer = PREP_TIME;
    this.readyPlayers.clear();
    this.decoys = {}; // 디코이 초기화
    this.assignRoles();

    Object.values(this.players).forEach(p => {
      p.hp = 100;
      p.textureData = null;
      p.shape = 'circle'; // 기본 모양
    });

    // 시작 시 맵 오브젝트 전송
    this.io.to(this.roomId).emit('mapData', this.mapObjects);

    this.broadcastState();
    this.io.to(this.roomId).emit('updatePlayers', this.players);
    this.io.to(this.roomId).emit('updateDecoys', this.decoys);
    this.startTimer(() => this.startHunt());
  }

  startHunt() {
    this.status = 'hunt';
    this.timer = HUNT_TIME;
    this.broadcastState();
    this.startTimer(() => this.startResults());
  }

  startResults() {
    this.status = 'results';
    this.timer = RESULT_TIME;
    this.broadcastState();

    let hidersAlive = 0;
    Object.values(this.players).forEach(p => {
      if (p.role === 'hider' && p.isAlive) hidersAlive++;
    });

    const winner = hidersAlive > 0 ? 'hiders' : 'seekers';
    this.io.to(this.roomId).emit('gameEnd', { winner });
    this.startTimer(() => this.resetToLobby());
  }

  resetToLobby() {
    this.status = 'lobby';
    this.timer = 0;
    this.readyPlayers.clear();
    this.decoys = {};

    Object.values(this.players).forEach(p => {
      p.role = 'hider';
      p.isAlive = true;
      p.hp = 100;
      p.shape = 'circle';
    });

    this.broadcastState();
    this.io.to(this.roomId).emit('updatePlayers', this.players);
    this.io.to(this.roomId).emit('updateDecoys', this.decoys);
  }

  startTimer(onComplete) {
    if (this.intervalId) clearInterval(this.intervalId);

    this.intervalId = setInterval(() => {
      this.timer--;
      this.broadcastState();
      if (this.timer <= 0) {
        clearInterval(this.intervalId);
        if (onComplete) onComplete();
      }
    }, 1000);
  }

  assignRoles() {
    const ids = Object.keys(this.players);
    if (ids.length === 0) return;

    ids.forEach(id => {
      this.players[id].role = 'hider';
      this.players[id].isAlive = true;
    });

    const seekerIdx = Math.floor(Math.random() * ids.length);
    this.players[ids[seekerIdx]].role = 'seeker';
  }

  // ── 디코이 로직 ──
  addDecoy(ownerId, x, y, shape, textureData) {
    if (this.status !== 'prep' && this.status !== 'hunt') return;
    
    let currentDecoys = 0;
    for (const dId in this.decoys) {
      if (this.decoys[dId].ownerId === ownerId) currentDecoys++;
    }

    if (currentDecoys >= 2) return; // 최대 2개

    this.decoyCounter++;
    const decoyId = `decoy_${this.decoyCounter}`;
    this.decoys[decoyId] = { ownerId, x, y, shape, textureData };
    
    this.io.to(this.roomId).emit('updateDecoys', this.decoys);
  }

  removeDecoys(ownerId) {
    let changed = false;
    for (const dId in this.decoys) {
      if (this.decoys[dId].ownerId === ownerId) {
        delete this.decoys[dId];
        changed = true;
      }
    }
    if (changed) {
      this.io.to(this.roomId).emit('updateDecoys', this.decoys);
    }
  }

  // ── 태그 로직 ──
  handleTag(seekerId, targetId, isDecoy = false) {
    if (this.status !== 'hunt') return;
    const seeker = this.players[seekerId];
    if (!seeker || seeker.role !== 'seeker') return;

    if (isDecoy) {
      // 디코이 태그 시 디코이 파괴 + 페널티
      if (this.decoys[targetId]) {
        delete this.decoys[targetId];
        this.io.to(this.roomId).emit('updateDecoys', this.decoys);
        this.handleMiss(seekerId); // 디코이를 치면 헛스윙 처리
      }
      return;
    }

    const target = this.players[targetId];
    if (!target || target.role !== 'hider' || !target.isAlive) return;

    // 플레이어 태그 성공
    if (this.mode === 'infection') {
      target.role = 'seeker'; // 감염 모드: 술래로 변환
      target.hp = 100;
      this.io.to(this.roomId).emit('playerTagged', { targetId, seekerId, infected: true });
    } else {
      target.isAlive = false; // 노멀 모드: 탈락
      this.io.to(this.roomId).emit('playerTagged', { targetId, seekerId, infected: false });
    }

    this.io.to(this.roomId).emit('updatePlayers', this.players);

    let hidersAlive = 0;
    Object.values(this.players).forEach(p => {
      if (p.role === 'hider' && p.isAlive) hidersAlive++;
    });

    if (hidersAlive === 0) {
      if (this.intervalId) clearInterval(this.intervalId);
      this.startResults();
    }
  }

  handleMiss(seekerId) {
    if (this.status !== 'hunt') return;
    const seeker = this.players[seekerId];
    if (seeker && seeker.role === 'seeker') {
      seeker.hp -= 20;
      if (seeker.hp < 0) seeker.hp = 0;
      this.io.to(this.roomId).emit('updatePlayers', this.players);
    }
  }
}

module.exports = GameRoom;
