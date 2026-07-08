const socket = io();

const loginScreen = document.getElementById('login-screen');
const gameUi = document.getElementById('game-ui');
const nicknameInput = document.getElementById('nickname-input');
const joinBtn = document.getElementById('join-btn');
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const missionText = document.getElementById('mission-text');

let myId = null;
let players = {};
let myX = 400;
let myY = 300;
let speed = 6;

// Keyboard input state
const keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    w: false,
    a: false,
    s: false,
    d: false
};

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Join game
joinBtn.addEventListener('click', () => {
    let nickname = nicknameInput.value.trim();
    if (!nickname) nickname = '무명';
    
    socket.emit('join', nickname);
    loginScreen.classList.add('hidden');
    gameUi.classList.remove('hidden');
    myId = socket.id;
    
    // Set initial spawn center
    myX = canvas.width / 2;
    myY = canvas.height / 2;
    
    requestAnimationFrame(gameLoop);
});

nicknameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinBtn.click();
});

// Socket events
socket.on('updatePlayers', (serverPlayers) => {
    players = serverPlayers;
    if (myId && !players[myId]) {
        // I might have been disconnected or reset
        myId = socket.id;
    }
});

// Input handling
window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key)) {
        keys[e.key] = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key)) {
        keys[e.key] = false;
    }
});

function gameLoop() {
    if (!myId) return;

    let dx = 0;
    let dy = 0;
    if (keys.ArrowUp || keys.w) dy -= speed;
    if (keys.ArrowDown || keys.s) dy += speed;
    if (keys.ArrowLeft || keys.a) dx -= speed;
    if (keys.ArrowRight || keys.d) dx += speed;

    if (dx !== 0 || dy !== 0) {
        myX += dx;
        myY += dy;
        
        // Bounds checking against canvas
        myX = Math.max(20, Math.min(canvas.width - 20, myX));
        myY = Math.max(20, Math.min(canvas.height - 20, myY));

        socket.emit('move', { x: myX, y: myY });
    }

    draw();
    requestAnimationFrame(gameLoop);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid background
    ctx.strokeStyle = '#b2ebf2';
    ctx.lineWidth = 2;
    for (let i = 0; i < canvas.width; i += 60) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 60) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
    }

    // Draw all players
    for (const id in players) {
        const p = players[id];
        if (!p.isAlive) continue;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 20, 20, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Eyes (Cute style)
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(p.x - 7, p.y - 5, 7, 0, Math.PI * 2);
        ctx.arc(p.x + 7, p.y - 5, 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(p.x - 7, p.y - 5, 3, 0, Math.PI * 2);
        ctx.arc(p.x + 7, p.y - 5, 3, 0, Math.PI * 2);
        ctx.fill();

        // Highlight for self
        if (id === myId) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 25, 0, Math.PI * 2);
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Nickname
        ctx.fillStyle = '#333';
        ctx.font = 'bold 18px Jua';
        ctx.textAlign = 'center';
        // Draw outline for better readability
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.strokeText(p.nickname, p.x, p.y - 35);
        ctx.fillText(p.nickname, p.x, p.y - 35);
    }
}
