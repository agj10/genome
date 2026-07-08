const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const players = {};
let gameState = {
    status: 'waiting',
    mission: null
};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Set initial spawn somewhere in a typical screen size (will scale on client)
    players[socket.id] = {
        x: Math.random() * 800 + 100,
        y: Math.random() * 600 + 100,
        color: `hsl(${Math.random() * 360}, 80%, 60%)`,
        isAlive: true,
        nickname: 'Player'
    };

    socket.on('join', (nickname) => {
        players[socket.id].nickname = nickname || '이름없음';
        io.emit('updatePlayers', players);
    });

    socket.on('move', (data) => {
        if (players[socket.id] && players[socket.id].isAlive) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
        io.emit('updatePlayers', players);
    });
});

// Update loop 30fps
setInterval(() => {
    io.emit('updatePlayers', players);
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
