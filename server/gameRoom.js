const PREP_TIME = 60;
const HUNT_TIME = 180;
const RESULT_TIME = 10;

class GameRoom {
  constructor(io, roomId) {
    this.io = io;
    this.roomId = roomId;
    this.status = 'lobby';
    this.timer = 0;
    this.intervalId = null;
    this.players = {};
    this.readyPlayers = new Set();
  }

  setPlayersReference(playersObj) {
    this.players = playersObj;
  }

  broadcastState() {
    this.io.to(this.roomId).emit('gameState', {
      status: this.status,
      timer: this.timer,
      readyCount: this.readyPlayers.size,
      totalCount: Object.keys(this.players).length,
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
  }

  startPrep() {
    this.status = 'prep';
    this.timer = PREP_TIME;
    this.readyPlayers.clear();
    this.assignRoles();

    Object.values(this.players).forEach(p => {
      p.hp = 100;
      p.textureData = null;
    });

    this.broadcastState();
    this.io.to(this.roomId).emit('updatePlayers', this.players);
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

    Object.values(this.players).forEach(p => {
      p.role = 'hider';
      p.isAlive = true;
      p.hp = 100;
    });

    this.broadcastState();
    this.io.to(this.roomId).emit('updatePlayers', this.players);
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

  handleTag(seekerId, targetId) {
    if (this.status !== 'hunt') return;
    const seeker = this.players[seekerId];
    const target = this.players[targetId];
    if (!seeker || !target) return;
    if (seeker.role !== 'seeker' || target.role !== 'hider') return;
    if (!target.isAlive) return;

    target.isAlive = false;
    this.io.to(this.roomId).emit('playerTagged', { targetId, seekerId });
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
