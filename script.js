/**
 * BUBBLE SHOOTER - FIXED PROGRESSION & CONNECTIVITY
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('nextBubbleCanvas');
const nextCtx = nextCanvas.getContext('2d');

const ROWS = 20;
const COLS = 16;
const AUTO_DROP_SECONDS = 45; // Daha seyrek aşağı düşmesi için süre uzatıldı
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
    shoot: new Audio('sounds/atis.mp3'),
    win: new Audio('sounds/kazandiniz.mp3'),
    gameOver: new Audio('sounds/oyun_bitti.mp3'),
    bgm: new Audio('sounds/arkaplan.mp3'), // Arka plan müziği için
    pop_default: new Audio('sounds/pop_klasik.mp3'),
    pop_animals: new Audio('sounds/pop_hayvanlar.mp3'),
    pop_candy: new Audio('sounds/pop_sekerler.mp3')
};

audioLibrary.bgm.loop = true;
audioLibrary.bgm.volume = 0.2;

function playSound(soundKey) {
    if (isMuted) return;
    const sound = audioLibrary[soundKey];
    if (sound) {
        sound.currentTime = 0;
        sound.play().catch(e => { });
    }
}

function toggleMute() {
    isMuted = !isMuted;
    document.getElementById('mute-toggle').innerText = isMuted ? '🔇' : '🔊';
    if (isMuted) audioLibrary.bgm.pause();
    else if (gameState === STATES.PLAYING) audioLibrary.bgm.play();
}

const THEMES = {
    default: {
        icons: null, popSound: 'pop_default', colors: [
            { name: 'red',    gradient: ['#FF5555', '#BB0000'] },
            { name: 'blue',   gradient: ['#4488FF', '#0033CC'] },
            { name: 'green',  gradient: ['#44DD44', '#008800'] },
            { name: 'yellow', gradient: ['#FFEE22', '#CC9900'] },
            { name: 'purple', gradient: ['#CC44FF', '#7700BB'] },
            { name: 'cyan',   gradient: ['#33DDFF', '#0088BB'] },
            { name: 'orange', gradient: ['#FF8833', '#BB4400'] }
        ]
    },
    animals: {
        icons: ['🐻', '🐼', '🐯', '🦁', '🐸', '🐵', '🐰'], popSound: 'pop_animals', colors: [
            { name: 'brown',  gradient: ['#CC7733', '#7B3310'] },
            { name: 'white',  gradient: ['#EEF6FF', '#8899BB'] },
            { name: 'orange', gradient: ['#FF7722', '#CC4400'] },
            { name: 'yellow', gradient: ['#FFD700', '#BB8800'] },
            { name: 'green',  gradient: ['#44CC55', '#117722'] },
            { name: 'gray',   gradient: ['#99AABB', '#556677'] },
            { name: 'pink',   gradient: ['#FF55AA', '#BB1166'] }
        ]
    },
    candy: {
        icons: ['🍭', '🍬', '🍩', '🧁', '🍦', '🍪', '🍫'], popSound: 'pop_candy', colors: [
            { name: 'pink',   gradient: ['#FF55BB', '#BB0077'] },
            { name: 'blue',   gradient: ['#4499FF', '#0055CC'] },
            { name: 'purple', gradient: ['#BB44FF', '#6600AA'] },
            { name: 'cyan',   gradient: ['#22CCFF', '#0077AA'] },
            { name: 'mint',   gradient: ['#33DD77', '#008844'] },
            { name: 'cream',  gradient: ['#FFCC33', '#BB7700'] },
            { name: 'red',    gradient: ['#FF4444', '#BB0000'] }
        ]
    }
};

let grid = [];
let projectile = null;
let nextColorIndex = 0;
let mouse = { x: 0, y: 0 };
let popAnimations = [];
let fallAnimations = []; // bağlantısı kopan balonların düşme animasyonu
let bubbleOffsets = {}; // "r,c" -> {dx, dy, vx, vy} çarpışma titreme animasyonu
let gridRowOffset = 0; // pushGridDown sonrası parite kaymasını dengeler

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
    bubbleOffsets = {};
    gridRowOffset = 0;
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
    if ((r + gridRowOffset) % 2 !== 0) x += bubbleRadius;
    let y = r * rowHeight + bubbleRadius;
    return { x, y };
}

function getNeighbors(r, c) {
    const n = [];
    const offset = ((r + gridRowOffset) % 2 === 0) ? 0 : 1;
    const dirs = [[0, -1], [0, 1], [-1, -1 + offset], [-1, offset], [1, -1 + offset], [1, offset]];
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
    while (head < queue.length) {
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
            b.isPopping = true;
            b.active = false;
            const { x, y } = getBubbleCoords(b.r, b.c);
            fallAnimations.push({
                x, y,
                vy: -1.5 + Math.random() * 1.0, // hafif yukarı fırlama
                vx: (Math.random() - 0.5) * 1.5,
                colorIndex: b.colorIndex,
                startTime: Date.now()
            });
            count++;
        }
    }));
    return count;
}

// Çarpışma anında bağlı balon grubuna yay fiziğiyle itme uygular (tüm modlar için)
function applyImpact(hitR, hitC, impactVx, impactVy) {
    const mag = Math.hypot(impactVx, impactVy) || 1;
    const dirX = impactVx / mag;
    const dirY = impactVy / mag;
    const strength = bubbleRadius * 0.4;

    // BFS ile bağlı grubu bul
    const connected = new Set();
    const queue = [{ r: hitR, c: hitC }];
    connected.add(`${hitR},${hitC}`);
    let head = 0;
    while (head < queue.length) {
        const { r, c } = queue[head++];
        getNeighbors(r, c).forEach(nb => {
            const key = `${nb.r},${nb.c}`;
            if (nb.active && !nb.isPopping && !connected.has(key)) {
                connected.add(key);
                queue.push({ r: nb.r, c: nb.c });
            }
        });
    }

    // Bağlı grup: çarpış yönü + radyal bileşen (dalgalanma etkisi)
    connected.forEach(key => {
        const [r, c] = key.split(',').map(Number);
        const dist = Math.hypot(r - hitR, c - hitC);
        const factor = 1 / (dist * 0.9 + 1);
        const radX = dist > 0 ? (c - hitC) / dist * 0.5 : 0;
        const radY = dist > 0 ? (r - hitR) / dist * 0.5 : 0;
        if (!bubbleOffsets[key]) bubbleOffsets[key] = { dx: 0, dy: 0, vx: 0, vy: 0 };
        bubbleOffsets[key].vx += (dirX + radX) * strength * factor;
        bubbleOffsets[key].vy += (dirY + radY) * strength * factor;
    });

    // Bağlı olmayan ama yakın balonlar: dışa doğru küçük sallanma
    for (let dr = -3; dr <= 3; dr++) {
        for (let dc = -3; dc <= 3; dc++) {
            const nr = hitR + dr, nc = hitC + dc;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
            const key = `${nr},${nc}`;
            if (connected.has(key) || !grid[nr][nc].active || grid[nr][nc].isPopping) continue;
            const dist = Math.hypot(dr, dc);
            if (dist > 3) continue;
            const radX = dist > 0 ? dc / dist : dirX;
            const radY = dist > 0 ? dr / dist : dirY;
            const factor = 1 / (dist * 1.2 + 1);
            if (!bubbleOffsets[key]) bubbleOffsets[key] = { dx: 0, dy: 0, vx: 0, vy: 0 };
            bubbleOffsets[key].vx += radX * strength * 0.25 * factor;
            bubbleOffsets[key].vy += radY * strength * 0.25 * factor;
        }
    }
}

// Her kare balon offsetlerini yay fiziğiyle sıfıra doğru günceller
function updateBubbleOffsets() {
    const spring = 0.18;
    const damping = 0.72;
    for (const key of Object.keys(bubbleOffsets)) {
        const o = bubbleOffsets[key];
        o.vx += -o.dx * spring;
        o.vy += -o.dy * spring;
        o.dx += o.vx;
        o.dy += o.vy;
        o.vx *= damping;
        o.vy *= damping;
        if (Math.abs(o.dx) < 0.05 && Math.abs(o.dy) < 0.05 && Math.abs(o.vx) < 0.05 && Math.abs(o.vy) < 0.05) {
            delete bubbleOffsets[key];
        }
    }
}

function startPopAnimation(r, c) {
    const b = grid[r][c];
    if (b.isPopping) return;
    b.isPopping = true;
    b.active = false; // grid'den hemen kaldır — push olsa da animasyon etkilenmesin
    const { x, y } = getBubbleCoords(r, c); // koordinatı şu an kaydet
    popAnimations.push({ x, y, colorIndex: b.colorIndex, startTime: Date.now() });
    playSound(THEMES[currentTheme].popSound);
}

function resize() {
    const container = document.getElementById('game-area');
    // Sayfanın %95'i kadarını alıp taşmayı engelliyoruz
    let maxH = window.innerHeight * 0.95;

    // Konteynerın kendi genişliğini baz alıyoruz
    let availableW = container.clientWidth;

    // Oran hesabı:
    let ratioW = (COLS + 0.5) * 2;
    let ratioH = ROWS * 1.732 + 3.5;
    let idealRatio = ratioW / ratioH;

    // Hedeflenen genişlik ve yüksekliği hesapla
    let targetW = availableW;
    let targetH = targetW / idealRatio;

    // Eğer hesaplanan yükseklik ekrana sığmıyorsa, yüksekliğe göre mecburi küçültme yap
    if (targetH > maxH) {
        targetH = maxH;
        targetW = targetH * idealRatio;
    }

    // Canvas çözünürlüğünü tam piksel olarak ayarla
    canvas.width = targetW;
    canvas.height = targetH;

    bubbleRadius = canvas.width / (COLS + 0.5) / 2;
    rowHeight = bubbleRadius * 1.732;

    // Yükseklik değiştiği için atıcının pozisyonunu güncellememiz gerekebilir
    if (projectile && !projectile.moving && !projectile.isSettling) {
        projectile.x = canvas.width / 2;
        projectile.y = canvas.height - bubbleRadius * 1.5;
    }
}

function updateUI() {
    document.getElementById('current-score').innerText = score;
    nextCtx.clearRect(0, 0, 60, 60);
    drawBubbleOnCtx(nextCtx, 30, 30, nextColorIndex, 0.9);

    // Ceza Göstergesi
    const penaltyBox = document.getElementById('penalty-bubbles');
    penaltyBox.innerHTML = '';
    for (let i = 0; i < MAX_MISSES; i++) {
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

    context.save();
    context.globalAlpha = alpha;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.clip();

    // 1. Temel küre gradyanı: üst-soldan sağ-alta (3D küre hacmi)
    const baseGrad = context.createRadialGradient(
        x - r * 0.22, y - r * 0.28, r * 0.05,
        x + r * 0.18, y + r * 0.28, r * 1.08
    );
    baseGrad.addColorStop(0, color.gradient[0]);
    baseGrad.addColorStop(1, color.gradient[1]);
    context.fillStyle = baseGrad;
    context.fillRect(x - r, y - r, r * 2, r * 2);

    // 2. Koyu kenar halkası (iç gölge — rim efekti)
    const rimGrad = context.createRadialGradient(x, y, r * 0.62, x, y, r);
    rimGrad.addColorStop(0, 'rgba(0,0,0,0)');
    rimGrad.addColorStop(1, 'rgba(0,0,0,0.30)');
    context.fillStyle = rimGrad;
    context.fillRect(x - r, y - r, r * 2, r * 2);

    // 3. Ana highlight: üst-orta, hafif sola yatık, geniş ve yumuşak
    const hlGrad = context.createRadialGradient(
        x - r * 0.14, y - r * 0.35, 0,
        x - r * 0.05, y - r * 0.05, r * 0.82
    );
    hlGrad.addColorStop(0,    'rgba(255,255,255,0.92)');
    hlGrad.addColorStop(0.30, 'rgba(255,255,255,0.38)');
    hlGrad.addColorStop(0.60, 'rgba(255,255,255,0.06)');
    hlGrad.addColorStop(1,    'rgba(255,255,255,0)');
    context.fillStyle = hlGrad;
    context.fillRect(x - r, y - r, r * 2, r * 2);

    context.restore();

    // 4. İnce dış kenar çizgisi
    context.save();
    context.globalAlpha = alpha * 0.30;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(0,0,0,0.6)';
    context.lineWidth = r * 0.07;
    context.stroke();
    context.restore();

    if (themeData.icons) {
        context.save();
        context.globalAlpha = alpha;
        context.font = `${r * 1.2}px Arial`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(themeData.icons[colorIndex], x, y + r * 0.05);
        context.restore();
    }
}

function drawTrajectory(startX, startY, angle) {
    const stepSize = 7;
    let vx = Math.cos(angle) * stepSize;
    let vy = Math.sin(angle) * stepSize;
    let x = startX;
    let y = startY;
    const dotR = bubbleRadius * 0.22;
    const maxSteps = 500;

    for (let i = 0; i < maxSteps; i++) {
        x += vx;
        y += vy;

        // Duvar sekmesi
        if (x < bubbleRadius)                  { x = bubbleRadius * 2 - x;                       vx *= -1; }
        if (x > canvas.width - bubbleRadius)   { x = 2 * (canvas.width - bubbleRadius) - x;     vx *= -1; }

        // Tavana çarptı
        if (y <= bubbleRadius) break;

        // Balona çarptı
        let hit = false;
        for (let r = 0; r < ROWS && !hit; r++) {
            for (let c = 0; c < COLS && !hit; c++) {
                if (grid[r][c].active && !grid[r][c].isPopping) {
                    const { x: bx, y: by } = getBubbleCoords(r, c);
                    if (Math.hypot(x - bx, y - by) < bubbleRadius * 1.6) hit = true;
                }
            }
        }
        if (hit) break;

        // Her N adımda bir nokta çiz
        if (i % 5 === 0) {
            const alpha = 0.90 - (i / maxSteps) * 0.40;
            ctx.beginPath();
            ctx.arc(x, y, dotR, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
            ctx.fill();
        }
    }
}

function drawAimingArrow(startX, startY, angle) {
    ctx.save();
    ctx.translate(startX, startY);
    ctx.rotate(angle);

    const len      = 170; // toplam ok uzunluğu
    const bodyStart = 28; // topun önünden başla
    const shaftW   = 6;   // gövde yarı-genişliği
    const headW    = 20;  // ok ucu yarı-genişliği (daha geniş)
    const headBase = len - 62; // ok ucunun başladığı yer (uzun ve sivri)

    // Tek parça dolu ok şekli (gövde + üçgen uç)
    ctx.fillStyle = 'rgba(190, 215, 255, 0.75)';
    ctx.beginPath();
    ctx.moveTo(bodyStart,  shaftW);
    ctx.lineTo(headBase,   shaftW);
    ctx.lineTo(headBase,   headW);
    ctx.lineTo(len,        0);       // ok ucu
    ctx.lineTo(headBase,  -headW);
    ctx.lineTo(headBase,  -shaftW);
    ctx.lineTo(bodyStart, -shaftW);
    ctx.closePath();
    ctx.fill();

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

        updateBubbleOffsets();
        grid.forEach(row => row.forEach(b => {
            if (b.active && !b.isPopping) {
                const { x, y } = getBubbleCoords(b.r, b.c);
                const off = bubbleOffsets[`${b.r},${b.c}`];
                drawBubbleOnCtx(ctx, off ? x + off.dx : x, off ? y + off.dy : y, b.colorIndex, 0.88);
            }
        }));

        for (let i = popAnimations.length - 1; i >= 0; i--) {
            const anim = popAnimations[i];
            const elapsed = Date.now() - anim.startTime;
            const progress = elapsed / 400;
            if (progress >= 1) {
                popAnimations.splice(i, 1); // grid zaten hemen güncellendi, burada dokunmaya gerek yok
            } else {
                drawBubbleOnCtx(ctx, anim.x, anim.y, anim.colorIndex, 0.88 * (1 - progress), 1);
            }
        }

        // Düşen balonlar
        const gravity = 0.55;
        for (let i = fallAnimations.length - 1; i >= 0; i--) {
            const fa = fallAnimations[i];
            fa.vy += gravity;
            fa.x += fa.vx;
            fa.y += fa.vy;
            const elapsed = Date.now() - fa.startTime;
            const alpha = Math.max(0, 1 - elapsed / 700);
            if (alpha <= 0 || fa.y > canvas.height + bubbleRadius * 2) {
                fallAnimations.splice(i, 1);
            } else {
                drawBubbleOnCtx(ctx, fa.x, fa.y, fa.colorIndex, 0.88, alpha);
            }
        }

        const startX = canvas.width / 2, startY = canvas.height - bubbleRadius * 1.5;
        const angle = Math.atan2(mouse.y - startY, mouse.x - startX);
        if (angle < 0 && !projectile.moving && !projectile.isSettling) {
            drawTrajectory(startX, startY, angle);
            drawAimingArrow(startX, startY, angle);
        }

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
            drawBubbleOnCtx(ctx, projectile.x, projectile.y, projectile.colorIndex, 0.88);
        }
    }
    requestAnimationFrame(render);
}

function findEmptyCell(nearX, nearY) {
    // Tüm grid'de nearX,nearY'ye en yakın boş hücreyi bulur
    let best = null, minDist = Infinity;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c].active || grid[r][c].isPopping) continue;
            const coords = getBubbleCoords(r, c);
            const d = Math.hypot(nearX - coords.x, nearY - coords.y);
            if (d < minDist) { minDist = d; best = grid[r][c]; }
        }
    }
    return best;
}

function checkCollision() {
    let hit = projectile.y <= bubbleRadius;
    let hitR = -1, hitC = -1;
    if (!hit) {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c].active && !grid[r][c].isPopping) {
                    const { x, y } = getBubbleCoords(r, c);
                    if (Math.hypot(projectile.x - x, projectile.y - y) < bubbleRadius * 1.5) {
                        hit = true; hitR = r; hitC = c; break;
                    }
                }
            }
            if (hit) break;
        }
    }
    if (hit) {
        if (hitR >= 0) applyImpact(hitR, hitC, projectile.vx, projectile.vy);
        projectile.moving = false;
        let r = Math.max(0, Math.min(ROWS - 1, Math.round((projectile.y - bubbleRadius) / rowHeight)));
        let offsetX = ((r + gridRowOffset) % 2 !== 0) ? bubbleRadius : 0;
        let c = Math.max(0, Math.min(COLS - 1, Math.round((projectile.x - bubbleRadius - offsetX) / (bubbleRadius * 2))));
        // Hesaplanan hücre doluysa boş yer bul
        if (grid[r][c] && grid[r][c].active) {
            const neighbors = getNeighbors(r, c).filter(n => !n.active && !n.isPopping);
            if (neighbors.length > 0) {
                let best = neighbors[0], minDist = Infinity;
                neighbors.forEach(n => {
                    const coords = getBubbleCoords(n.r, n.c);
                    const d = Math.hypot(projectile.x - coords.x, projectile.y - coords.y);
                    if (d < minDist) { minDist = d; best = n; }
                });
                r = best.r; c = best.c;
            } else {
                const cell = findEmptyCell(projectile.x, projectile.y);
                if (cell) { r = cell.r; c = cell.c; }
            }
        }
        const target = getBubbleCoords(r, c);
        projectile.targetX = target.x; projectile.targetY = target.y;
        projectile.targetR = r; projectile.targetC = c;
        projectile.isSettling = true;
    }
}

function finalizeSettling() {
    let r = projectile.targetR; let c = projectile.targetC;
    // Son güvence: hedef hâlâ doluysa tüm grid'de en yakın boş hücreye yerleştir
    if (grid[r][c] && grid[r][c].active) {
        const cell = findEmptyCell(projectile.targetX, projectile.targetY);
        if (!cell) { endGame(); return; } // grid tamamen dolu
        r = cell.r; c = cell.c;
    }
    if (r >= ROWS - 8) { endGame(); return; }
    grid[r][c].active = true;
    grid[r][c].colorIndex = projectile.colorIndex;
    grid[r][c].isPopping = false;
    const matches = findMatches(r, c, grid[r][c].colorIndex);

    if (matches.size >= 3) {
        const matchData = [];
        matches.forEach(k => {
            const [rr, cc] = k.split(',').map(Number);
            const b = grid[rr][cc];
            b.isPopping = true;
            b.active = false;
            const { x, y } = getBubbleCoords(rr, cc);
            matchData.push({ x, y, colorIndex: b.colorIndex });
        });

        let delay = 0;
        matchData.forEach(({ x, y, colorIndex }) => {
            setTimeout(() => {
                popAnimations.push({ x, y, colorIndex, startTime: Date.now() });
                playSound(THEMES[currentTheme].popSound);
            }, delay);
            delay += 60;
        });

        score += matches.size * 10;
        const dropped = dropDisconnected();
        if (dropped > 0) score += dropped * 20;
        updateUI();
    } else {
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
    // Baloncuk vurma oyunlarında her bir satır birbiriyle zig-zag (offset) yapar.
    // Eğer tüm satırları 1 satır aşağı kaydırırsak, hepsinin fiziksel pozisyonu (x eksenindeki yeri) kayar.
    // Bunu engellemek için r-1'den kopya alırken sütun hizalamasına dikkat etmemiz gerekir.

    // Aktif patlama/sallanma animasyonlarını temizle — kaymadan sonra konumlar bozulur
    bubbleOffsets = {};

    // Satırları kaydır (isPopping dahil tüm durumu kopyala)
    for (let r = ROWS - 1; r > 0; r--) {
        for (let c = 0; c < COLS; c++) {
            grid[r][c].active = grid[r - 1][c].active;
            grid[r][c].colorIndex = grid[r - 1][c].colorIndex;
            grid[r][c].isPopping = grid[r - 1][c].isPopping;
        }
    }

    // Parite sayacını tersine çevir — mevcut balonların X konumu kaymasın
    gridRowOffset = 1 - gridRowOffset;

    // En üst satırı oluştur — renkleri tahtadaki mevcut renklerle sınırla (görsel tutarlılık)
    const themeData = THEMES[currentTheme];
    const colorsOnBoard = new Set();
    for (let row = 1; row < ROWS; row++)
        for (let col = 0; col < COLS; col++)
            if (grid[row][col].active && !grid[row][col].isPopping)
                colorsOnBoard.add(grid[row][col].colorIndex);
    const palette = colorsOnBoard.size > 0
        ? [...colorsOnBoard]
        : Array.from({ length: themeData.colors.length }, (_, i) => i);
    for (let c = 0; c < COLS; c++) {
        grid[0][c].active = true;
        grid[0][c].colorIndex = palette[Math.floor(Math.random() * palette.length)];
        grid[0][c].isPopping = false;
    }

    // Düşme anına özel bağlantısız baloncukları kontrol et
    dropDisconnected();

    // Limit kontrolü
    for (let c = 0; c < COLS; c++) if (grid[ROWS - 8][c].active) endGame();
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
        x: canvas.width / 2, y: canvas.height - bubbleRadius * 1.5,
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
        const startX = canvas.width / 2, startY = canvas.height - bubbleRadius * 1.5;
        const angle = Math.atan2(y - startY, x - startX);
        if (angle < -0.2 && angle > -Math.PI + 0.2) {
            playSound('shoot');
            projectile.vx = Math.cos(angle) * 20; // Atış hızı ciddi oranda artırıldı
            projectile.vy = Math.sin(angle) * 20;
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
