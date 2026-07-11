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
    this.prepTime = settings.prepTime || 60;
    this.huntTime = settings.huntTime || 180;
    
    this.mapObjects = this.generateMapObjects();
    this.decoys = {}; // { decoyId: { ownerId, x, y, shape, textureData } }
    this.decoyCounter = 0;
  }

  applySettings(settings) {
    if (settings.isPublic !== undefined) this.isPublic = settings.isPublic;
    if (settings.password !== undefined) this.password = settings.password;
    if (settings.maxPlayers !== undefined) this.maxPlayers = settings.maxPlayers;
    if (settings.gameMode !== undefined) this.gameMode = settings.gameMode;
    if (settings.prepTime !== undefined) this.prepTime = settings.prepTime;
    if (settings.huntTime !== undefined) this.huntTime = settings.huntTime;
    if (settings.mapTheme !== undefined && settings.mapTheme !== this.mapTheme) {
      this.mapTheme = settings.mapTheme;
      this.mapObjects = this.generateMapObjects();
      this.io.to(this.roomId).emit('mapData', this.mapObjects); // 맵 즉시 갱신
    }
    this.broadcastState();
  }

  generateMapObjects() {
    const objects = [];
    const pushObj = (type, x, y, size, color) => {
      objects.push({
        id: `obj_${objects.length}`, type, x, y, z: 0, size, height: size, color
      });
    };

    switch (this.mapTheme) {
      case 'mansion': {
        // 저택: 격자형 방 구조와 중앙 거대 거실
        const colors = ['#8B4513', '#A0522D', '#D2691E', '#CD853F'];
        pushObj('square', 1000, 1000, 350, '#5C4033'); // 중앙 거대 테이블/카펫
        for (let x = 200; x <= 1800; x += 400) {
          for (let y = 200; y <= 1800; y += 400) {
            if (x > 700 && x < 1300 && y > 700 && y < 1300) continue; // 중앙 비우기
            if (Math.random() > 0.2) { // 80% 확률로 기둥/벽 생성
              pushObj('square', x + (Math.random()*100 - 50), y + (Math.random()*100 - 50), 120, colors[Math.floor(Math.random()*colors.length)]);
            }
          }
        }
        break;
      }
      case 'backrooms': {
        // 백룸: 크고 답답한 벽들로 이루어진 빽빽한 미로
        const colors = ['#F5DEB3', '#FFE4B5', '#FFDAB9'];
        for (let x = 300; x <= 1700; x += 250) {
          for (let y = 300; y <= 1700; y += 250) {
            if (Math.random() > 0.4) {
              // 크기를 불규칙하게 하여 길을 막음
              const size = Math.random() > 0.5 ? 200 : 150;
              pushObj('square', x, y, size, colors[Math.floor(Math.random()*colors.length)]);
            }
          }
        }
        break;
      }
      case 'sewer': {
        // 하수구: 양쪽에 파이프(원형)가 늘어선 중앙 복도 형태
        const colors = ['#2F4F4F', '#556B2F', '#808000', '#696969'];
        for (let y = 150; y <= 1850; y += 200) {
          // 좌측 파이프 라인
          pushObj('circle', 300 + Math.random()*150, y, 120, colors[Math.floor(Math.random()*colors.length)]);
          pushObj('circle', 500 + Math.random()*150, y, 100, colors[Math.floor(Math.random()*colors.length)]);
          // 우측 파이프 라인
          pushObj('circle', 1500 + Math.random()*150, y, 100, colors[Math.floor(Math.random()*colors.length)]);
          pushObj('circle', 1700 + Math.random()*150, y, 120, colors[Math.floor(Math.random()*colors.length)]);
        }
        break;
      }
      case 'country': {
        // 컨트리: 중앙 광장은 넓게 비우고 맵 외곽에 숲(나무) 밀집
        const colors = ['#228B22', '#32CD32', '#DAA520', '#B8860B'];
        for (let i = 0; i < 45; i++) {
          let x = Math.random() * 1800 + 100;
          let y = Math.random() * 1800 + 100;
          // 중앙 반경 600 접근 금지
          if (Math.abs(x - 1000) < 600 && Math.abs(y - 1000) < 600) {
            x = (x < 1000) ? x - 600 : x + 600;
            y = (y < 1000) ? y - 600 : y + 600;
          }
          const shape = Math.random() > 0.6 ? 'triangle' : 'circle';
          pushObj(shape, Math.max(100, Math.min(1900, x)), Math.max(100, Math.min(1850, y)), 70 + Math.random()*30, colors[Math.floor(Math.random()*colors.length)]);
        }
        break;
      }
      case 'sugarland': {
        // 슈가랜드: 매우 작고 많은 물체들이 동심원(달팽이 껍질) 모양으로 퍼짐
        const colors = ['#FF69B4', '#FFC0CB', '#FFA07A', '#FFD700', '#DDA0DD'];
        const shapes = ['circle', 'square', 'triangle'];
        let angle = 0;
        let radius = 100;
        for (let i = 0; i < 50; i++) {
          const cx = 1000 + Math.cos(angle) * radius;
          const cy = 1000 + Math.sin(angle) * radius;
          pushObj(shapes[i%3], cx, cy, 30 + Math.random()*20, colors[Math.floor(Math.random()*colors.length)]);
          angle += 0.5;
          radius += 18;
        }
        break;
      }
      case 'penguin': {
        // 펭귄 (얼음): 상단과 하단에 큰 덩어리들을 몰아두고, 가운데는 강처럼 비움
        const colors = ['#ADD8E6', '#87CEEB', '#00BFFF', '#E0FFFF', '#FFFFFF'];
        const shapes = ['square', 'circle', 'triangle'];
        for (let i = 0; i < 40; i++) {
          let x = Math.random() * 1800 + 100;
          let y = Math.random() * 1800 + 100;
          // 가운데 가로줄(강)은 비우기
          if (y > 700 && y < 1300) {
             y = Math.random() > 0.5 ? y - 600 : y + 600; 
          }
          pushObj(shapes[Math.floor(Math.random()*shapes.length)], x, y, 60 + Math.random()*40, colors[Math.floor(Math.random()*colors.length)]);
        }
        break;
      }
      case 'osaka': {
        // 오사카 (도심): 빽빽한 사거리 바둑판 구조 (3x3 거대 블록)
        const colors = ['#FF1493', '#00FFFF', '#FF00FF', '#FFFF00'];
        for (let x = 333; x <= 1666; x += 666) {
          for (let y = 333; y <= 1666; y += 666) {
            pushObj('square', x, y, 250, colors[Math.floor(Math.random()*colors.length)]); // 거대 빌딩
            // 빌딩 주변의 작은 간판들
            pushObj('square', x + 150, y, 50, colors[Math.floor(Math.random()*colors.length)]);
            pushObj('square', x - 150, y, 50, colors[Math.floor(Math.random()*colors.length)]);
          }
        }
        break;
      }
      default: {
        // 기본 맵: 무작위 산개
        const colors = ['#e53e3e', '#ecc94b', '#48bb78', '#4299e1', '#ed64a6', '#9f7aea', '#a0aec0', '#4a5568'];
        const shapes = ['circle', 'square', 'triangle'];
        for (let i = 0; i < 30; i++) {
          pushObj(shapes[Math.floor(Math.random()*shapes.length)], Math.random()*1800+100, Math.random()*1800+100, 40 + Math.random()*40, colors[Math.floor(Math.random()*colors.length)]);
        }
        break;
      }
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
        mapTheme: this.mapTheme,
        prepTime: this.prepTime,
        huntTime: this.huntTime
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
    this.timer = this.prepTime;
    this.readyPlayers.clear();
    this.decoys = {}; // 디코이 초기화
    this.assignRoles();

    Object.values(this.players).forEach(p => {
      p.hp = 100;
      p.textureData = null;
      p.shape = 'circle'; // 기본 모양
    });

    this.broadcastState();
    this.io.to(this.roomId).emit('updatePlayers', this.players);
    
    // 카운트다운 3초 동안 타이머 지연
    if (this.intervalId) clearInterval(this.intervalId);
    setTimeout(() => {
      this.startTimer(() => this.startHunt());
    }, 3000);
  }

  startHunt() {
    this.status = 'hunt';
    this.timer = this.huntTime;
    this.broadcastState();
    
    // 카운트다운 3초 동안 타이머 지연
    if (this.intervalId) clearInterval(this.intervalId);
    setTimeout(() => {
      this.startTimer(() => this.startResults());
    }, 3000);
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

  // ── 태그 로직 ──
  handleTag(seekerId, targetId) {
    if (this.status !== 'hunt') return;
    const seeker = this.players[seekerId];
    if (!seeker || seeker.role !== 'seeker') return;

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
