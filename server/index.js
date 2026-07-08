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
      x: Math.random() * 800 + 100,
      y: Math.random() * 600 + 100,
      z: 0,
      color: '#ffffff',
      isAlive: true,
      hp: 100,
      role: 'hider',
      textureData: null
    };

    // 현재 게임 상태 전송
    socket.emit('gameState', { status: room.status, timer: room.timer });
    io.to(roomId).emit('updatePlayers', room.players);
  });

  socket.on('move', (data) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.players[socket.id] && room.players[socket.id].isAlive) {
      room.players[socket.id].x = data.x;
      room.players[socket.id].y = data.y;
    }
  });

  socket.on('startGame', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.status === 'lobby') {
      room.startPrep();
    }
  });

  socket.on('saveTexture', (textureData) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.players[socket.id] && room.status === 'prep') {
      room.players[socket.id].textureData = textureData;
    }
  });

  socket.on('tagPlayer', (targetId) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && targetId) {
      room.handleTag(socket.id, targetId);
    } else if (room) {
      room.handleMiss(socket.id);
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.user.nickname}`);
    if (currentRoomId) {
      const room = rooms.get(currentRoomId);
      if (room) {
        delete room.players[socket.id];
        io.to(currentRoomId).emit('updatePlayers', room.players);
        
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
