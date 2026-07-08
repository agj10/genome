const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { initDB } = require('./db');

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

// 데이터베이스 초기화
initDB();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_local_dev';

// 소켓 상태
const players = {};
let gameState = {
  status: 'lobby', // lobby, prep, hunt, results
  timer: 0
};

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

  // 초기 플레이어 데이터 생성
  players[socket.id] = {
    userId: socket.user.id,
    nickname: socket.user.nickname,
    x: Math.random() * 800 + 100,
    y: Math.random() * 600 + 100,
    z: 0,
    color: '#ffffff',
    isAlive: true,
    role: 'hider' // or 'seeker'
  };

  // 접속한 플레이어 목록 브로드캐스트
  io.emit('updatePlayers', players);

  // 이동 이벤트
  socket.on('move', (data) => {
    if (players[socket.id] && players[socket.id].isAlive) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
    }
  });

  // 연결 종료
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.user.nickname}`);
    delete players[socket.id];
    io.emit('updatePlayers', players);
  });
});

// 30fps 서버 업데이트 루프
setInterval(() => {
  io.emit('updatePlayers', players);
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
