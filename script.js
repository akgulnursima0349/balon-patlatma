/**
 * BUBBLE SHOOTER - FIXED PROGRESSION & CONNECTIVITY
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('nextBubbleCanvas');
const nextCtx = nextCanvas.getContext('2d');

const ROWS = 20;
const COLS = 16; 
const AUTO_DROP_SECONDS = 25; 
const MAX_MISSES = 5; // Kaç hatalı atışta satır iner

const STATES = { MENU: 0, PLAYING: 1, GAMEOVER: 2 };
let gameState = STATES.MENU;

let score = 0;
let highScore = localStorage.getItem('bs_high_score_v2') || 0;
let bubbleRadius = 0;
let rowHeight = 0;
let lastDropTime = 0;
let shotCounter = MAX_MISSES;
let currentTheme = 'default';
let isMuted = false;

// SES YÖNETİMİ
const audioLibrary = {
    shoot: new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3'),
    win: new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'),
    gameOver: new Audio('https://assets.mixkit.co/active_storage/sfx/2522/2522-preview.mp3'),
    bgm: new Audio('https://assets.mixkit.co/active_storage/sfx/123/123-preview.mp3'),
    pop_default: new Audio('https://assets.mixkit.co/active_storage/sfx/615/615-preview.mp3'),
    pop_animals: new Audio('https://assets.mixkit.co/active_storage/sfx/2513/2513-preview.mp3'),
    pop_candy: new Audio('https://assets.mixkit.co/active_storage/sfx/584/584-preview.mp3')
};

audioLibrary.bgm.loop = true;
audioLibrary.bgm.volume = 0.2;

function playSound(soundKey) {
    if (isMuted) return;
    const sound = audioLibrary[soundKey];
    if (sound) {
        sound.currentTime = 0;
        sound.play().catch(e => {});
    }
}

function toggleMute() {
    isMuted = !isMuted;
    document.getElementById('mute-toggle').innerText = isMuted ? '🔇' : '🔊';
    if (isMuted) audioLibrary.bgm.pause();
    else if (gameState === STATES.PLAYING) audioLibrary.bgm.play();
}

const THEMES = {
    default: { icons: null, popSound: 'pop_default', colors: [
        { name: 'red', gradient: ['#FF5F6D', '#B91C1C'] }, { name: 'blue', gradient: ['#38bdf8', '#1e40af'] },
        { name: 'green', gradient: ['#4ade80', '#166534'] }, { name: 'yellow', gradient: ['#fde047', '#a16207'] },
        { name: 'purple', gradient: ['#c084fc', '#6b21a8'] }, { name: 'cyan', gradient: ['#22d3ee', '#0e7490'] },
        { name: 'orange', gradient: ['#fb923c', '#9a3412'] }
    ]},
    animals: { icons: ['🐻', '🐼', '🐯', '🦁', '🐸', '🐵', '🐰'], popSound: 'pop_animals', colors: [
        { name: 'brown', gradient: ['#A8A29E', '#78350F'] }, { name: 'white', gradient: ['#F8FAFC', '#94A3B8'] },
        { name: 'orange', gradient: ['#FDBA74', '#C2410C'] }, { name: 'yellow', gradient: ['#FEF08A', '#A16207'] },
        { name: 'green', gradient: ['#86EFAC', '#15803D'] }, { name: 'gray', gradient: ['#CBD5E1', '#475569'] },
        { name: 'pink', gradient: ['#F9A8D4', '#BE185D'] }
    ]},
    candy: { icons: ['🍭', '🍬', '🍩', '🧁', '🍦', '🍪', '🍫'], popSound: 'pop_candy', colors: [
        { name: 'pink', gradient: ['#FBCFE8', '#DB2777'] }, { name: 'blue', gradient: ['#BFDBFE', '#2563EB'] },
        { name: 'purple', gradient: ['#E9D5FF', '#9333EA'] }, { name: 'cyan', gradient: ['#CFFAFE', '#0891B2'] },
        { name: 'mint', gradient: ['#D1FAE5', '#059669'] }, { name: 'cream', gradient: ['#FEF3C7', '#D97706'] },
        { name: 'red', gradient: ['#FECACA', '#DC2626'] }
    ]}
};

let grid = [];
let projectile = null;
let nextColorIndex = 0;
let mouse = { x: 0, y: 0 };
let popAnimations = [];

function setTheme(theme) {
    currentTheme = theme;
    const cards = document.querySelectorAll('.theme-card');
    cards.forEach(c => c.style.borderColor = 'rgba(255,255,255,0.2)');
    event.currentTarget.style.borderColor = 'white';
}

function resetGame() {
    audioLibrary.bgm.pause();
    document.getElementById('menu-overlay').classList.remove('hidden');
    document.getElementById('game-over-overlay').classList.add('hidden');
    document.getElementById('next-panel').classList.add('hidden');
    document.getElementById('penalty-card').classList.add('hidden');
    gameState = STATES.MENU;
}

function startGame() {
    gameState = STATES.PLAYING;
    score = 0;
    shotCounter = MAX_MISSES;
    lastDropTime = Date.now();
    document.getElementById('menu-overlay').classList.add('hidden');
    document.getElementById('game-over-overlay').classList.add('hidden');
    document.getElementById('high-score').innerText = highScore;
    document.getElementById('next-panel').classList.remove('hidden');
    document.getElementById('penalty-card').classList.remove('hidden');
    
    if (!isMuted) audioLibrary.bgm.play();
    
    resize();
    initGrid();
    nextColorIndex = Math.floor(Math.random() * THEMES[currentTheme].colors.length);
    createProjectile();
    updateUI();
}

function initGrid() {
    grid = [];
    const themeData = THEMES[currentTheme];
    for (let r = 0; r < ROWS; r++) {
        grid[r] = [];
        for (let c = 0; c < COLS; c++) {
            grid[r][c] = {
                active: r < 6,
                colorIndex: Math.floor(Math.random() * themeData.colors.length),
                r: r, c: c,
                isPopping: false
            };
        }
    }
}

function getBubbleCoords(r, c) {
    let x = c * bubbleRadius * 2 + bubbleRadius;
    if (r % 2 !== 0) x += bubbleRadius;
    let y = r * rowHeight + bubbleRadius;
    return { x, y };
}

function getNeighbors(r, c) {
    const n = [];
    const offset = (r % 2 === 0) ? 0 : 1;
    const dirs = [[0,-1],[0,1],[-1,-1+offset],[-1,offset],[1,-1+offset],[1,offset]];
    for (let [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) n.push(grid[nr][nc]);
    }
    return n;
}

function findMatches(r, c, color, matches = new Set()) {
    const key = `${r},${c}`;
    if (matches.has(key)) return matches;
    if (!grid[r][c].active || grid[r][c].colorIndex !== color || grid[r][c].isPopping) return matches;
    matches.add(key);
    getNeighbors(r, c).forEach(nb => findMatches(nb.r, nb.c, color, matches));
    return matches;
}

function dropDisconnected() {
    grid.forEach(row => row.forEach(b => b.connected = false));
    const queue = [];
    for (let c = 0; c < COLS; c++) {
        if (grid[0][c].active && !grid[0][c].isPopping) {
            grid[0][c].connected = true;
            queue.push(grid[0][c]);
        }
    }
    
    let head = 0;
    while(head < queue.length) {
        const curr = queue[head++];
        getNeighbors(curr.r, curr.c).forEach(nb => {
            if (nb.active && !nb.connected && !nb.isPopping) {
                nb.connected = true;
                queue.push(nb);
            }
        });
        // head++ kaldırıldı, queue[head++] zaten doğru ilerliyor
    }
    
    let count = 0;
    grid.forEach(row => row.forEach(b => {
        if (b.active && !b.connected && !b.isPopping) { 
            startPopAnimation(b.r, b.c);
            count++; 
        }
    }));
    return count;
}

function startPopAnimation(r, c) {
    const b = grid[r][c];
    if (b.isPopping) return;
    b.isPopping = true;
    popAnimations.push({
        r: r, c: c,
        colorIndex: b.colorIndex,
        startTime: Date.now()
    });
    playSound(THEMES[currentTheme].popSound);
}

function resize() {
    const container = document.getElementById('game-area');
    canvas.width = container.clientWidth;
    canvas.height = window.innerHeight * 0.9;
    bubbleRadius = canvas.width / (COLS + 0.5) / 2;
    rowHeight = bubbleRadius * 1.732;
}

function updateUI() {
    document.getElementById('current-score').innerText = score;
    nextCtx.clearRect(0,0,60,60);
    drawBubbleOnCtx(nextCtx, 30, 30, nextColorIndex, 0.9);

    // Ceza Göstergesi
    const penaltyBox = document.getElementById('penalty-bubbles');
    penaltyBox.innerHTML = '';
    for(let i=0; i<MAX_MISSES; i++) {
        const bubble = document.createElement('div');
        bubble.className = 'penalty-bubble' + (i < shotCounter ? ' active' : '');
        penaltyBox.appendChild(bubble);
    }
}

function drawBubbleOnCtx(context, x, y, colorIndex, scale = 1, alpha = 1) {
    const themeData = THEMES[currentTheme];
    const color = themeData.colors[colorIndex];
    if (!color) return;
    const r = Math.max(0, bubbleRadius * scale);
    context.globalAlpha = alpha;
    const grad = context.createRadialGradient(x-r/3, y-r/3, r/10, x, y, r);
    grad.addColorStop(0, color.gradient[0]);
    grad.addColorStop(1, color.gradient[1]);
    context.fillStyle = grad;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
    if (themeData.icons) {
        context.font = `${r * 1.2}px Arial`;
        context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillText(themeData.icons[colorIndex], x, y + r*0.05);
    }
    context.fillStyle = 'rgba(255,255,255,0.2)';
    context.beginPath();
    context.arc(x-r/3, y-r/3, r/3.5, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
}

function drawAimingArrow(startX, startY, angle) {
    ctx.save();
    ctx.translate(startX, startY);
    ctx.rotate(angle);
    const arrowLen = 140;
    const grad = ctx.createLinearGradient(0, 0, arrowLen, 0);
    grad.addColorStop(0, 'rgba(139, 92, 246, 0.9)');
    grad.addColorStop(1, 'rgba(139, 92, 246, 0)');
    ctx.strokeStyle = grad; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(arrowLen, 0); ctx.stroke();
    ctx.fillStyle = 'rgba(139, 92, 246, 0.9)';
    ctx.beginPath(); ctx.moveTo(arrowLen, 0); ctx.lineTo(arrowLen - 15, -8); ctx.lineTo(arrowLen - 15, 8); ctx.fill();
    ctx.restore();
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (gameState === STATES.PLAYING) {
        const now = Date.now();
        // Zaman bazlı düşme (Yedek mekanizma)
        if (now - lastDropTime >= AUTO_DROP_SECONDS * 1000) {
            pushGridDown();
            lastDropTime = now;
        }

        grid.forEach(row => row.forEach(b => {
            if (b.active && !b.isPopping) {
                const { x, y } = getBubbleCoords(b.r, b.c);
                drawBubbleOnCtx(ctx, x, y, b.colorIndex);
            }
        }));

        for (let i = popAnimations.length - 1; i >= 0; i--) {
            const anim = popAnimations[i];
            const elapsed = Date.now() - anim.startTime;
            const progress = elapsed / 400;
            if (progress >= 1) {
                grid[anim.r][anim.c].active = false;
                grid[anim.r][anim.c].isPopping = false;
                popAnimations.splice(i, 1);
            } else {
                const { x, y } = getBubbleCoords(anim.r, anim.c);
                drawBubbleOnCtx(ctx, x, y, anim.colorIndex, 1.2 * (1 - progress), 1 - progress);
            }
        }

        const startX = canvas.width / 2, startY = canvas.height - bubbleRadius - 30;
        const angle = Math.atan2(mouse.y - startY, mouse.x - startX);
        if (angle < 0 && !projectile.moving && !projectile.isSettling) drawAimingArrow(startX, startY, angle);

        if (projectile) {
            if (projectile.moving) {
                projectile.x += projectile.vx;
                projectile.y += projectile.vy;
                if (projectile.x < bubbleRadius || projectile.x > canvas.width - bubbleRadius) projectile.vx *= -1;
                checkCollision();
            } else if (projectile.isSettling) {
                const dx = projectile.targetX - projectile.x;
                const dy = projectile.targetY - projectile.y;
                projectile.x += dx * 0.15; projectile.y += dy * 0.15;
                if (Math.hypot(dx, dy) < 1) finalizeSettling();
            }
            drawBubbleOnCtx(ctx, projectile.x, projectile.y, projectile.colorIndex);
        }
    }
    requestAnimationFrame(render);
}

function checkCollision() {
    let hit = projectile.y <= bubbleRadius;
    if (!hit) {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c].active && !grid[r][c].isPopping) {
                    const { x, y } = getBubbleCoords(r, c);
                    if (Math.hypot(projectile.x - x, projectile.y - y) < bubbleRadius * 1.5) { hit = true; break; }
                }
            }
            if (hit) break;
        }
    }
    if (hit) {
        projectile.moving = false;
        let r = Math.round((projectile.y - bubbleRadius) / rowHeight);
        let offsetX = (r % 2 !== 0) ? bubbleRadius : 0;
        let c = Math.max(0, Math.min(COLS-1, Math.round((projectile.x - bubbleRadius - offsetX) / (bubbleRadius * 2))));
        if (grid[r][c] && grid[r][c].active) {
            const neighbors = getNeighbors(r, c).filter(n => !n.active);
            if (neighbors.length > 0) {
                let best = neighbors[0], minDist = Infinity;
                neighbors.forEach(n => {
                    const coords = getBubbleCoords(n.r, n.c);
                    const d = Math.hypot(projectile.x - coords.x, projectile.y - coords.y);
                    if (d < minDist) { minDist = d; best = n; }
                }); r = best.r; c = best.c;
            }
        }
        const target = getBubbleCoords(r, c);
        projectile.targetX = target.x; projectile.targetY = target.y;
        projectile.targetR = r; projectile.targetC = c;
        projectile.isSettling = true;
    }
}

function finalizeSettling() {
    const r = projectile.targetR; const c = projectile.targetC;
    if (r >= ROWS - 2) { endGame(); return; }
    grid[r][c].active = true;
    grid[r][c].colorIndex = projectile.colorIndex;
    const matches = findMatches(r, c, grid[r][c].colorIndex);
    
    if (matches.size >= 3) {
        matches.forEach(k => { 
            const [rr, cc] = k.split(',').map(Number); 
            startPopAnimation(rr, cc);
        });
        score += matches.size * 10;
        setTimeout(() => {
            const dropped = dropDisconnected();
            if (dropped > 0) score += dropped * 20;
            updateUI();
        }, 100);
        // Başarılı patlatmada ceza sayacı dolmaz (veya klasik modda azalmaz)
    } else {
        // Hatalı atışta ceza sayacını azalt
        shotCounter--;
        if (shotCounter <= 0) {
            pushGridDown();
            shotCounter = MAX_MISSES;
        }
    }
    
    updateUI();
    createProjectile();
    checkWinCondition();
}

function checkWinCondition() {
    const hasActive = grid.some(row => row.some(b => b.active));
    if (!hasActive) { playSound('win'); setTimeout(() => { resetGame(); }, 2000); }
}

function pushGridDown() {
    for (let r = ROWS - 1; r > 0; r--) {
        for (let c = 0; c < COLS; c++) {
            grid[r][c].active = grid[r-1][c].active;
            grid[r][c].colorIndex = grid[r-1][c].colorIndex;
        }
    }
    const themeData = THEMES[currentTheme];
    for (let c = 0; c < COLS; c++) {
        grid[0][c].active = true;
        grid[0][c].colorIndex = Math.floor(Math.random() * themeData.colors.length);
    }
    // Limit kontrolü
    for (let c = 0; c < COLS; c++) if (grid[ROWS-3][c].active) endGame();
    updateUI();
}

function endGame() {
    gameState = STATES.GAMEOVER;
    audioLibrary.bgm.pause();
    playSound('gameOver');
    document.getElementById('game-over-overlay').classList.remove('hidden');
    document.getElementById('final-score').innerText = score;
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('bs_high_score_v2', highScore);
        document.getElementById('high-score').innerText = highScore;
    }
}

function createProjectile() {
    projectile = {
        x: canvas.width/2, y: canvas.height - bubbleRadius - 30,
        vx: 0, vy: 0, colorIndex: nextColorIndex,
        moving: false, isSettling: false
    };
    nextColorIndex = Math.floor(Math.random() * THEMES[currentTheme].colors.length);
}

function handleInput(e) {
    if (gameState !== STATES.PLAYING || (projectile && projectile.isSettling)) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX || (e.touches && e.touches[0].clientX)) - rect.left) * (canvas.width / rect.width);
    const y = ((e.clientY || (e.touches && e.touches[0].clientY)) - rect.top) * (canvas.height / rect.height);
    mouse.x = x; mouse.y = y;

    if ((e.type === 'pointerup' || e.type === 'touchend') && projectile && !projectile.moving) {
        const startX = canvas.width / 2, startY = canvas.height - bubbleRadius - 30;
        const angle = Math.atan2(y - startY, x - startX);
        if (angle < -0.2 && angle > -Math.PI + 0.2) {
            playSound('shoot'); 
            projectile.vx = Math.cos(angle) * 8.5; 
            projectile.vy = Math.sin(angle) * 8.5;
            projectile.moving = true;
        }
    }
}

window.onload = () => {
    resize();
    render();
    window.addEventListener('resize', () => { resize(); updateUI(); });
    canvas.addEventListener('pointerdown', handleInput);
    canvas.addEventListener('pointermove', handleInput);
    canvas.addEventListener('pointerup', handleInput);
};
