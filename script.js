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
let lastInputDirection = { x: 0, y: 0 }; // Track the last processed direction to prevent reversing
let score = 0;
let highScore = localStorage.getItem('snakeHighScore') || 0;
let gameInterval;
let isGameRunning = false;

// Colors
const SNAKE_HEAD_COLOR = '#00ff88';
const SNAKE_BODY_COLOR = '#00b8ff';
const FOOD_COLOR = '#ff0055';

function initGame() {
    snake = [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 }
    ];
    score = 0;
    dx = 1;
    dy = 0;
    dy = 0;
    lastInputDirection = { x: 1, y: 0 };
    updateScore();
    updateHighScore();
    generateFood();
    isGameRunning = true;

    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');

    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(gameLoop, GAME_SPEED);
}

function gameLoop() {
    if (!isGameRunning) return;

    moveSnake();
    if (checkCollision()) {
        gameOver();
        return;
    }
    checkFoodCollision();
    draw();
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

        // Grow snake (add tail back)
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
        // Check if food spawns on snake
        for (let part of snake) {
            if (part.x === food.x && part.y === food.y) {
                validPosition = false;
                break;
            }
        }
    }
}

function draw() {
    // Clear canvas
    ctx.fillStyle = '#15151e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw snake
    snake.forEach((part, index) => {
        ctx.fillStyle = index === 0 ? SNAKE_HEAD_COLOR : SNAKE_BODY_COLOR;

        // Add glow effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = ctx.fillStyle;

        ctx.fillRect(part.x * GRID_SIZE, part.y * GRID_SIZE, GRID_SIZE - 2, GRID_SIZE - 2);

        // Reset shadow for performance
        ctx.shadowBlur = 0;
    });

    // Draw food
    ctx.fillStyle = FOOD_COLOR;
    ctx.shadowBlur = 15;
    ctx.shadowColor = FOOD_COLOR;

    // Draw rounded food (circle)
    ctx.beginPath();
    ctx.arc(
        food.x * GRID_SIZE + GRID_SIZE / 2,
        food.y * GRID_SIZE + GRID_SIZE / 2,
        GRID_SIZE / 2 - 2,
        0,
        2 * Math.PI
    );
    ctx.fill();

    ctx.shadowBlur = 0;
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
    gameOverScreen.classList.remove('hidden');
}

// Input handling
document.addEventListener('keydown', (e) => {
    // Prevent default scrolling for arrow keys
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

// Initial draw (optional, to show empty board or maybe a demo state, but here we just wait for start)
draw();
