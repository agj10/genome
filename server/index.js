const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();
const { initDB } = require('./db');
const GameRoom = require('./gameRoom');

// 라우터
const authRoutes = require('./routes/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API 라우트
app.use('/api/auth', authRoutes);

// SPA 라우팅 지원: /rooms/:id 등으로 접속해도 index.html을 서빙
app.get('/rooms/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 빠른 시작 (가장 사람 많은 대기방 찾기)
app.get('/api/quick-room', (req, res) => {
  let bestRoom = null;
  let maxP = -1;
  for (const [roomId, room] of rooms.entries()) {
    if (room.status === 'lobby' && room.isPublic) {
      const pCount = Object.keys(room.players).length;
      if (pCount < room.maxPlayers && pCount > maxP) {
        maxP = pCount;
        bestRoom = roomId;
      }
    }
  }
  
  if (bestRoom) {
    res.json({ roomId: bestRoom });
  } else {
    // 없으면 새 방 생성용 랜덤 코드 반환 (사실상 Create Room 역할 병행)
    const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let r = '';
    for (let i = 0; i < 6; i++) r += c[Math.floor(Math.random() * c.length)];
    res.json({ roomId: r, isNew: true });
  }
});

// 방 만들기 (설정 적용)
app.post('/api/create-room', (req, res) => {
  const { roomId, isPublic, password, maxPlayers, gameMode, mapTheme } = req.body;
  if (rooms.has(roomId)) {
    return res.status(400).json({ error: '이미 존재하는 방입니다.' });
  }
  
  const room = new GameRoom(io, roomId);
  room.setPlayersReference({});
  room.isPublic = isPublic;
  room.password = password || '';
  room.maxPlayers = maxPlayers || 10;
  room.gameMode = gameMode || 'normal';
  room.mapTheme = mapTheme || 'mansion';
  rooms.set(roomId, room);
  
  res.json({ success: true, roomId });
});

// 데이터베이스 초기화
initDB();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_local_dev';

// 서버 상태
const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    const room = new GameRoom(io, roomId);
    // 각 방마다 players 객체 독립적으로 생성
    room.setPlayersReference({});
    rooms.set(roomId, room);
    console.log(`Room created: ${roomId}`);
  }
  return rooms.get(roomId);
}

// 소켓 인증 미들웨어
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('인증 오류: 토큰이 없습니다.'));
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('인증 오류: 유효하지 않은 토큰입니다.'));
    socket.user = decoded; // { id, nickname }
    next();
  });
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user.nickname} (${socket.id})`);
  let currentRoomId = null;

  socket.on('joinRoom', (roomId) => {
    if (currentRoomId) {
      socket.leave(currentRoomId);
      const oldRoom = rooms.get(currentRoomId);
      if (oldRoom && oldRoom.players[socket.id]) {
        delete oldRoom.players[socket.id];
        io.to(currentRoomId).emit('updatePlayers', oldRoom.players);
      }
    }

    socket.join(roomId);
    currentRoomId = roomId;
    const room = getOrCreateRoom(roomId);

    // 해당 방에 플레이어 추가
    room.players[socket.id] = {
      userId: socket.user.id,
      nickname: socket.user.nickname,
      x: 800 + Math.random() * 400,
      y: 800 + Math.random() * 400,
      z: 0,
      color: '#ffffff',
      isAlive: true,
      hp: 100,
      role: 'hider',
      textureData: null
    };

    // 현재 게임 상태 전송
    socket.emit('gameState', {
      status: room.status,
      timer: room.timer,
      readyCount: room.readyPlayers.size,
      totalCount: Object.keys(room.players).length,
      mode: room.mode
    });
    // 접속 시 생성되어 있는 맵 오브젝트 정보 전송
    socket.emit('mapData', room.mapObjects);
    socket.emit('updateDecoys', room.decoys);
    
    io.to(roomId).emit('updatePlayers', room.players);
  });

  socket.on('move', (data) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.players[socket.id] && room.players[socket.id].isAlive) {
      room.players[socket.id].x = data.x;
      room.players[socket.id].y = data.y;
      room.players[socket.id].z = data.z || 0;
    }
  });

  socket.on('updateRoomSettings', (settings) => {
    if (currentRoomId && rooms.has(currentRoomId)) {
      const room = rooms.get(currentRoomId);
      // 방장인지 확인 (편의상 현재는 아무나 변경 가능, 차후 호스트 검증 추가)
      if (room.status === 'lobby') {
        room.applySettings(settings);
      }
    }
  });

  socket.on('playerReady', (isReady) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room) room.toggleReady(socket.id);
  });

  socket.on('toggleReady', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room) room.toggleReady(socket.id);
  });

  socket.on('saveTexture', (textureData) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.players[socket.id] && room.status === 'prep') {
      room.players[socket.id].textureData = textureData;
    }
  });

  socket.on('changeMode', (mode) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room) room.setMode(mode);
  });

  socket.on('changeShape', (shape) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.players[socket.id]) {
      room.players[socket.id].shape = shape;
      io.to(currentRoomId).emit('updatePlayers', room.players);
    }
  });

  socket.on('addDecoy', (data) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room) {
      room.addDecoy(socket.id, data.x, data.y, data.shape, data.textureData);
    }
  });

  socket.on('removeDecoys', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room) room.removeDecoys(socket.id);
  });

  socket.on('tagPlayer', (data) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && data) {
      if (typeof data === 'string') {
        // 기존 호환성 유지
        room.handleTag(socket.id, data, false);
      } else {
        // { targetId, isDecoy }
        room.handleTag(socket.id, data.targetId, data.isDecoy);
      }
    } else if (room) {
      room.handleMiss(socket.id);
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.user.nickname}`);
    if (currentRoomId) {
      const room = rooms.get(currentRoomId);
      if (room) {
        room.removePlayer(socket.id);
        io.to(currentRoomId).emit('updatePlayers', room.players);
        room.broadcastState();
        
        // 방에 아무도 없으면 삭제
        if (Object.keys(room.players).length === 0) {
          if (room.intervalId) clearInterval(room.intervalId);
          rooms.delete(currentRoomId);
          console.log(`Room deleted: ${currentRoomId}`);
        }
      }
    }
  });
});

// 30fps 서버 업데이트 루프
setInterval(() => {
  rooms.forEach((room, roomId) => {
    io.to(roomId).emit('updatePlayers', room.players);
  });
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
