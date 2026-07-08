const PREP_TIME = 60; // 준비 시간 60초
const HUNT_TIME = 180; // 사냥 시간 3분
const RESULT_TIME = 10; // 결과 화면 10초

class GameRoom {
  constructor(io, roomId) {
    this.io = io;
    this.roomId = roomId;
    this.status = 'lobby'; // lobby, prep, hunt, results
    this.timer = 0;
    this.intervalId = null;
    this.players = {};
  }

  setPlayersReference(playersObj) {
    this.players = playersObj;
  }

  broadcastState() {
    this.io.to(this.roomId).emit('gameState', {
      status: this.status,
      timer: this.timer
    });
  }

  startPrep() {
    this.status = 'prep';
    this.timer = PREP_TIME;
    this.assignRoles();
    
    // 플레이어 체력 초기화
    Object.values(this.players).forEach(p => {
      p.hp = 100;
      p.textureData = null; // 텍스처 초기화
    });
    
    this.broadcastState();
    this.io.to(this.roomId).emit('updatePlayers', this.players); // 역할 배정 결과 전송

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

    // 결과 정산 로직 (생존자 여부 판단)
    let hidersAlive = 0;
    Object.values(this.players).forEach(p => {
      if (p.role === 'hider' && p.isAlive) {
        hidersAlive++;
      }
    });

    const winner = hidersAlive > 0 ? 'hiders' : 'seekers';
    this.io.to(this.roomId).emit('gameEnd', { winner });

    this.startTimer(() => this.resetToLobby());
  }

  resetToLobby() {
    this.status = 'lobby';
    this.timer = 0;
    
    // 플레이어 상태 리셋
    Object.values(this.players).forEach(p => {
      p.role = 'hider';
      p.isAlive = true;
      p.hp = 100;
    });

    this.broadcastState();
    this.io.emit('updatePlayers', this.players);
  }

  startTimer(onComplete) {
    if (this.intervalId) clearInterval(this.intervalId);

    this.intervalId = setInterval(() => {
      this.timer--;
      this.broadcastState(); // 1초마다 타이머 브로드캐스트

      if (this.timer <= 0) {
        clearInterval(this.intervalId);
        if (onComplete) onComplete();
      }
    }, 1000);
  }

  assignRoles() {
    const playerIds = Object.keys(this.players);
    if (playerIds.length === 0) return;

    // 초기화
    playerIds.forEach(id => {
      this.players[id].role = 'hider';
      this.players[id].isAlive = true;
    });

    // 랜덤으로 1명 술래 지정 (인원이 많으면 비례해서 증가 가능)
    const seekerIndex = Math.floor(Math.random() * playerIds.length);
    const seekerId = playerIds[seekerIndex];
    this.players[seekerId].role = 'seeker';
  }

  handleTag(seekerId, targetId) {
    if (this.status !== 'hunt') return;
    const seeker = this.players[seekerId];
    const target = this.players[targetId];

    if (!seeker || !target) return;
    if (seeker.role !== 'seeker' || target.role !== 'hider') return;
    if (!target.isAlive) return;

    // 태그 성공
    target.isAlive = false;
    this.io.to(this.roomId).emit('playerTagged', { targetId, seekerId });
    this.io.to(this.roomId).emit('updatePlayers', this.players);

    // 모든 hider가 잡혔는지 체크
    let hidersAlive = 0;
    Object.values(this.players).forEach(p => {
      if (p.role === 'hider' && p.isAlive) {
        hidersAlive++;
      }
    });

    if (hidersAlive === 0) {
      if (this.intervalId) clearInterval(this.intervalId);
      this.startResults(); // 즉시 사냥 종료
    }
  }

  handleMiss(seekerId) {
    if (this.status !== 'hunt') return;
    const seeker = this.players[seekerId];
    if (seeker && seeker.role === 'seeker') {
      seeker.hp -= 20; // 헛스윙 시 체력 20 감소
      if (seeker.hp <= 0) {
        seeker.hp = 0;
        // 기절 페널티 부여 로직 추가 가능
      }
      this.io.to(this.roomId).emit('updatePlayers', this.players);
    }
  }
}

module.exports = GameRoom;
