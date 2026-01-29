const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const highScoreElement = document.getElementById('highScore');
const finalScoreElement = document.getElementById('finalScore');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');

// Game constants
const GRID_SIZE = 20;
const TILE_COUNT = canvas.width / GRID_SIZE;
const GAME_SPEED = 100; // ms per frame

// Game state
let snake = [];
let food = { x: 0, y: 0 };
let dx = 0;
let dy = 0;
let lastInputDirection = { x: 0, y: 0 };
let score = 0;
let highScore = localStorage.getItem('snakeHighScore') || 0;
let gameInterval;
let isGameRunning = false;
let animationFrameId = null;

// Colors
const SNAKE_HEAD_COLOR = '#00ff88';
const SNAKE_BODY_COLOR = '#00b8ff';
const FOOD_COLOR = '#ff0055';

// --- Particle System ---
let particles = [];

function createParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const speed = 1.5 + Math.random() * 3;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1.0,
            decay: 0.015 + Math.random() * 0.025,
            size: 2 + Math.random() * 4,
            color: color
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.life -= p.decay;
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

function drawParticles() {
    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
}

// --- Floating Score Popup ---
let scorePopups = [];

function createScorePopup(x, y, text) {
    scorePopups.push({
        x: x,
        y: y,
        text: text,
        life: 1.0,
        decay: 0.02,
        vy: -1.5
    });
}

function updateScorePopups() {
    for (let i = scorePopups.length - 1; i >= 0; i--) {
        const p = scorePopups[i];
        p.y += p.vy;
        p.life -= p.decay;
        if (p.life <= 0) {
            scorePopups.splice(i, 1);
        }
    }
}

function drawScorePopups() {
    scorePopups.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.shadowColor = SNAKE_HEAD_COLOR;
        ctx.font = 'bold 16px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.textAlign = 'start';
}

// --- Screen Shake ---
let shakeIntensity = 0;
let shakeDuration = 0;

function triggerShake(intensity, duration) {
    shakeIntensity = intensity;
    shakeDuration = duration;
}

function applyShake() {
    if (shakeDuration > 0) {
        const offsetX = (Math.random() - 0.5) * shakeIntensity * 2;
        const offsetY = (Math.random() - 0.5) * shakeIntensity * 2;
        canvas.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
        shakeDuration--;
        shakeIntensity *= 0.9;
    } else {
        canvas.style.transform = '';
    }
}

// --- Food animation ---
let foodPulse = 0;

// --- Render loop (separate from game logic) ---
function renderLoop() {
    foodPulse += 0.06;
    updateParticles();
    updateScorePopups();
    applyShake();
    draw();
    animationFrameId = requestAnimationFrame(renderLoop);
}

function initGame() {
    snake = [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 }
    ];
    score = 0;
    dx = 1;
    dy = 0;
    lastInputDirection = { x: 1, y: 0 };
    particles = [];
    scorePopups = [];
    shakeIntensity = 0;
    shakeDuration = 0;
    updateScore();
    updateHighScore();
    generateFood();
    isGameRunning = true;

    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');

    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(gameLoop, GAME_SPEED);

    // Start render loop if not already running
    if (!animationFrameId) {
        renderLoop();
    }
}

function gameLoop() {
    if (!isGameRunning) return;

    moveSnake();
    if (checkCollision()) {
        gameOver();
        return;
    }
    checkFoodCollision();
}

function moveSnake() {
    const head = { x: snake[0].x + dx, y: snake[0].y + dy };
    snake.unshift(head);
    snake.pop();
    lastInputDirection = { x: dx, y: dy };
}

function checkCollision() {
    const head = snake[0];

    // Wall collision
    if (head.x < 0 || head.x >= TILE_COUNT || head.y < 0 || head.y >= TILE_COUNT) {
        return true;
    }

    // Self collision
    for (let i = 1; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) {
            return true;
        }
    }

    return false;
}

function checkFoodCollision() {
    const head = snake[0];
    if (head.x === food.x && head.y === food.y) {
        score += 10;
        updateScore();

        // Particle burst at food location
        const fx = food.x * GRID_SIZE + GRID_SIZE / 2;
        const fy = food.y * GRID_SIZE + GRID_SIZE / 2;
        createParticles(fx, fy, FOOD_COLOR, 12);
        createParticles(fx, fy, '#ff88aa', 6);
        createScorePopup(fx, fy - 10, '+10');

        // Grow snake
        const tail = snake[snake.length - 1];
        snake.push({ ...tail });

        generateFood();
    }
}

function generateFood() {
    let validPosition = false;
    while (!validPosition) {
        food.x = Math.floor(Math.random() * TILE_COUNT);
        food.y = Math.floor(Math.random() * TILE_COUNT);

        validPosition = true;
        for (let part of snake) {
            if (part.x === food.x && part.y === food.y) {
                validPosition = false;
                break;
            }
        }
    }
}

// --- Helper: rounded rect ---
function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
}

// --- Lerp helper for color interpolation ---
function lerpColor(a, b, t) {
    const ah = parseInt(a.replace('#', ''), 16);
    const bh = parseInt(b.replace('#', ''), 16);
    const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
    const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
    const rr = Math.round(ar + (br - ar) * t);
    const rg = Math.round(ag + (bg - ag) * t);
    const rb = Math.round(ab + (bb - ab) * t);
    return `rgb(${rr},${rg},${rb})`;
}

function draw() {
    // Clear canvas
    ctx.fillStyle = '#15151e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw subtle grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= TILE_COUNT; i++) {
        ctx.beginPath();
        ctx.moveTo(i * GRID_SIZE, 0);
        ctx.lineTo(i * GRID_SIZE, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * GRID_SIZE);
        ctx.lineTo(canvas.width, i * GRID_SIZE);
        ctx.stroke();
    }

    // Draw snake with gradient body and rounded segments
    snake.forEach((part, index) => {
        const t = index / Math.max(snake.length - 1, 1);
        if (index === 0) {
            ctx.fillStyle = SNAKE_HEAD_COLOR;
        } else {
            ctx.fillStyle = lerpColor(SNAKE_HEAD_COLOR, SNAKE_BODY_COLOR, t);
        }

        // Glow effect
        ctx.shadowBlur = index === 0 ? 15 : 8;
        ctx.shadowColor = ctx.fillStyle;

        const padding = 1;
        const radius = 4;
        roundRect(
            part.x * GRID_SIZE + padding,
            part.y * GRID_SIZE + padding,
            GRID_SIZE - padding * 2,
            GRID_SIZE - padding * 2,
            radius
        );

        ctx.shadowBlur = 0;
    });

    // Draw snake eyes on head
    if (snake.length > 0) {
        const head = snake[0];
        const hx = head.x * GRID_SIZE;
        const hy = head.y * GRID_SIZE;
        const eyeSize = 3;
        const eyeOffset = 5;

        ctx.fillStyle = '#000';
        ctx.shadowBlur = 0;

        // Position eyes based on direction
        let eye1x, eye1y, eye2x, eye2y;
        if (dx === 1) { // right
            eye1x = hx + 13; eye1y = hy + 5;
            eye2x = hx + 13; eye2y = hy + 13;
        } else if (dx === -1) { // left
            eye1x = hx + 5; eye1y = hy + 5;
            eye2x = hx + 5; eye2y = hy + 13;
        } else if (dy === -1) { // up
            eye1x = hx + 5; eye1y = hy + 5;
            eye2x = hx + 13; eye2y = hy + 5;
        } else { // down
            eye1x = hx + 5; eye1y = hy + 13;
            eye2x = hx + 13; eye2y = hy + 13;
        }

        ctx.beginPath();
        ctx.arc(eye1x, eye1y, eyeSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(eye2x, eye2y, eyeSize, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw food with pulse animation
    const pulse = Math.sin(foodPulse) * 2;
    const foodRadius = GRID_SIZE / 2 - 2 + pulse;
    const fx = food.x * GRID_SIZE + GRID_SIZE / 2;
    const fy = food.y * GRID_SIZE + GRID_SIZE / 2;

    // Outer glow ring
    ctx.fillStyle = 'rgba(255, 0, 85, 0.15)';
    ctx.shadowBlur = 25;
    ctx.shadowColor = FOOD_COLOR;
    ctx.beginPath();
    ctx.arc(fx, fy, foodRadius + 4, 0, 2 * Math.PI);
    ctx.fill();

    // Main food
    ctx.fillStyle = FOOD_COLOR;
    ctx.shadowBlur = 20;
    ctx.shadowColor = FOOD_COLOR;
    ctx.beginPath();
    ctx.arc(fx, fy, foodRadius, 0, 2 * Math.PI);
    ctx.fill();

    // Food highlight (specular)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(fx - 2, fy - 2, foodRadius * 0.35, 0, 2 * Math.PI);
    ctx.fill();

    ctx.shadowBlur = 0;

    // Draw particles
    drawParticles();

    // Draw score popups
    drawScorePopups();
}

function updateScore() {
    scoreElement.textContent = score;
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('snakeHighScore', highScore);
        updateHighScore();
    }
}

function updateHighScore() {
    highScoreElement.textContent = highScore;
}

function gameOver() {
    isGameRunning = false;
    clearInterval(gameInterval);
    finalScoreElement.textContent = score;

    // Screen shake on death
    triggerShake(8, 15);

    // Death particles from snake head
    if (snake.length > 0) {
        const head = snake[0];
        const hx = head.x * GRID_SIZE + GRID_SIZE / 2;
        const hy = head.y * GRID_SIZE + GRID_SIZE / 2;
        createParticles(hx, hy, SNAKE_HEAD_COLOR, 20);
        createParticles(hx, hy, SNAKE_BODY_COLOR, 15);
        createParticles(hx, hy, '#ffffff', 8);
    }

    setTimeout(() => {
        gameOverScreen.classList.remove('hidden');
    }, 600);
}

// Input handling
document.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
    }

    if (!isGameRunning) return;

    const goingUp = lastInputDirection.y === -1;
    const goingDown = lastInputDirection.y === 1;
    const goingRight = lastInputDirection.x === 1;
    const goingLeft = lastInputDirection.x === -1;

    switch (e.key) {
        case 'ArrowLeft':
            if (!goingRight) { dx = -1; dy = 0; }
            break;
        case 'ArrowRight':
            if (!goingLeft) { dx = 1; dy = 0; }
            break;
        case 'ArrowUp':
            if (!goingDown) { dx = 0; dy = -1; }
            break;
        case 'ArrowDown':
            if (!goingUp) { dx = 0; dy = 1; }
            break;
    }
});

startBtn.addEventListener('click', initGame);
restartBtn.addEventListener('click', initGame);

// Start render loop immediately for idle animations
renderLoop();
