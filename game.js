"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const startBtn = document.getElementById("startBtn");

const controls = {
  leftBtn: document.getElementById("leftBtn"),
  rightBtn: document.getElementById("rightBtn"),
  fireBtn: document.getElementById("fireBtn")
};

const W = canvas.width;
const H = canvas.height;

const keyState = Object.create(null);
const touchState = { left: false, right: false, fire: false };

const stars = [];
const playerBullets = [];
const enemyBullets = [];
const particles = [];

let enemies = [];
let formationTime = 0;
let animationId = 0;
let previousTs = 0;
let activeDivers = 0;
let hiScore = Number(localStorage.getItem("starstrike_hiscore") || 0);

const game = {
  mode: "title",
  score: 0,
  level: 1,
  lives: 3
};

const player = {
  x: W / 2,
  y: H - 56,
  w: 26,
  h: 24,
  speed: 290,
  cooldown: 0,
  invuln: 0
};

const scoreMap = {
  grunt: 80,
  escort: 150,
  boss: 300,
  mothership: 500
};

for (let i = 0; i < 120; i += 1) {
  stars.push({
    x: Math.random() * W,
    y: Math.random() * H,
    speed: 0.2 + Math.random() * 1.4,
    size: Math.random() < 0.85 ? 1 : 2
  });
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeInOut(t) {
  return t * t * (3 - 2 * t);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function setOverlay(title, text, buttonText) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  startBtn.textContent = buttonText;
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function showOverlay() {
  overlay.classList.remove("hidden");
}

function resetPlayer() {
  player.x = W / 2;
  player.y = H - 56;
  player.cooldown = 0;
  player.invuln = 2;
}

function createWave(level) {
  enemies = [];
  activeDivers = 0;

  const rows = [
    { type: "boss", count: 4, hp: 2, offset: 0 },
    { type: "escort", count: 6, hp: 1, offset: 0 },
    { type: "escort", count: 6, hp: 1, offset: 1 },
    { type: "grunt", count: 8, hp: 1, offset: 0 },
    { type: "mothership", count: 1, hp: 4, offset: 0 }
  ];

  let y = 86;

  rows.forEach((row, rowIndex) => {
    const spacing = 44;
    const totalWidth = (row.count - 1) * spacing;
    const startX = W / 2 - totalWidth / 2;

    for (let i = 0; i < row.count; i += 1) {
      const homeX = startX + i * spacing + row.offset * 12;
      const homeY = y;

      enemies.push({
        id: `${row.type}-${rowIndex}-${i}-${level}`,
        type: row.type,
        hp: row.hp + (row.type === "boss" && level >= 4 ? 1 : 0),
        x: homeX,
        y: homeY,
        homeX,
        homeY,
        row: rowIndex,
        state: "formation",
        diveT: 0,
        diveDuration: 2.8,
        returnT: 0,
        returnX: homeX,
        returnY: homeY,
        curve: i % 2 === 0 ? -1 : 1,
        fireCooldown: Math.random() * 0.8
      });
    }

    y += 48;
  });
}

function createExplosion(x, y, color, amount) {
  for (let i = 0; i < amount; i += 1) {
    const speed = 30 + Math.random() * 170;
    const angle = Math.random() * Math.PI * 2;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.35 + Math.random() * 0.45,
      ttl: 0.35 + Math.random() * 0.45,
      color
    });
  }
}

function spawnPlayerBullet() {
  playerBullets.push({
    x: player.x,
    y: player.y - player.h / 2 - 4,
    vy: -510
  });
}

function spawnEnemyBullet(enemy) {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const len = Math.hypot(dx, dy) || 1;
  const speed = 170 + game.level * 14;

  enemyBullets.push({
    x: enemy.x,
    y: enemy.y + 8,
    vx: (dx / len) * speed * 0.35,
    vy: speed
  });
}

function startDive(enemy) {
  enemy.state = "diving";
  enemy.diveT = 0;
  enemy.diveDuration = 2.9 - Math.min(0.9, game.level * 0.08);
  enemy.returnT = 0;
  enemy.entryX = enemy.x;
  enemy.entryY = enemy.y;
  enemy.curve = enemy.x < W / 2 ? 1 : -1;
  activeDivers += 1;
}

function forceReturn(enemy) {
  enemy.state = "returning";
  enemy.returnT = 0;
  enemy.returnX = enemy.x;
  enemy.returnY = enemy.y;
}

function updatePlayer(dt) {
  const left = keyState.ArrowLeft || keyState.a || keyState.A || touchState.left;
  const right = keyState.ArrowRight || keyState.d || keyState.D || touchState.right;
  const fire = keyState[" "] || keyState.Spacebar || keyState.Space || touchState.fire;

  let axis = 0;
  if (left) axis -= 1;
  if (right) axis += 1;

  player.x += axis * player.speed * dt;
  player.x = clamp(player.x, 20, W - 20);

  if (player.cooldown > 0) player.cooldown -= dt;
  if (player.invuln > 0) player.invuln -= dt;

  if (fire && player.cooldown <= 0) {
    spawnPlayerBullet();
    player.cooldown = 0.15;
  }
}

function updateStars(dt) {
  for (const star of stars) {
    star.y += star.speed * 46 * dt;
    if (star.y > H + 2) {
      star.y = -2;
      star.x = Math.random() * W;
    }
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.97;
    p.vy *= 0.97;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function updateBullets(dt) {
  for (let i = playerBullets.length - 1; i >= 0; i -= 1) {
    const b = playerBullets[i];
    b.y += b.vy * dt;
    if (b.y < -16) playerBullets.splice(i, 1);
  }

  for (let i = enemyBullets.length - 1; i >= 0; i -= 1) {
    const b = enemyBullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y > H + 16 || b.x < -20 || b.x > W + 20) enemyBullets.splice(i, 1);
  }
}

function updateEnemies(dt) {
  formationTime += dt * (0.85 + game.level * 0.05);
  const xWave = Math.sin(formationTime) * (54 + Math.min(36, game.level * 3));
  const yWave = Math.sin(formationTime * 2.1) * 7;
  const maxDivers = Math.min(4, 1 + Math.floor(game.level / 2));

  for (const enemy of enemies) {
    enemy.fireCooldown -= dt;

    if (enemy.state === "formation") {
      const laneMod = 1 - enemy.row * 0.07;
      enemy.x = enemy.homeX + xWave * laneMod;
      enemy.y = enemy.homeY + yWave + Math.sin(formationTime * 3 + enemy.homeX * 0.03) * 2;

      const diveChance = dt * (0.11 + game.level * 0.017);
      if (activeDivers < maxDivers && Math.random() < diveChance) startDive(enemy);

      if (
        enemy.fireCooldown <= 0 &&
        Math.abs(player.x - enemy.x) < 150 &&
        Math.random() < dt * (1.2 + game.level * 0.05)
      ) {
        spawnEnemyBullet(enemy);
        enemy.fireCooldown = 1.1 + Math.random() * 1.5;
      }
    } else if (enemy.state === "diving") {
      enemy.diveT += dt / enemy.diveDuration;
      const t = enemy.diveT;

      if (t < 0.22) {
        const u = t / 0.22;
        enemy.x = enemy.entryX + enemy.curve * 150 * Math.sin(u * Math.PI * 0.5);
        enemy.y = enemy.entryY + 130 * u + Math.sin(u * Math.PI) * 16;
      } else if (t < 0.82) {
        const u = (t - 0.22) / 0.6;
        enemy.x =
          enemy.entryX +
          enemy.curve * (170 * Math.cos(u * Math.PI * 1.25) + 70 * Math.sin(u * Math.PI * 2.1));
        enemy.y = enemy.entryY + 130 + (H - enemy.entryY + 110) * u;
      } else {
        const u = (t - 0.82) / 0.18;
        enemy.x += enemy.curve * 30 * (1 - u) * dt * 5.5;
        enemy.y = lerp(H + 10, H + 75, clamp(u, 0, 1));
      }

      if (enemy.fireCooldown <= 0 && Math.random() < dt * 3.8) {
        spawnEnemyBullet(enemy);
        enemy.fireCooldown = 0.35 + Math.random() * 0.45;
      }

      if (enemy.diveT >= 1) forceReturn(enemy);
    } else if (enemy.state === "returning") {
      enemy.returnT += dt / 1.15;

      const laneMod = 1 - enemy.row * 0.07;
      const targetX = enemy.homeX + xWave * laneMod;
      const targetY = enemy.homeY + yWave;
      const u = clamp(enemy.returnT, 0, 1);
      const eased = easeInOut(u);

      enemy.x = lerp(enemy.returnX, targetX, eased);
      enemy.y = lerp(enemy.returnY, targetY, eased);

      if (u >= 1) {
        enemy.state = "formation";
        activeDivers = Math.max(0, activeDivers - 1);
      }
    }
  }
}

function damagePlayer() {
  if (player.invuln > 0 || game.mode !== "playing") return;

  game.lives -= 1;
  createExplosion(player.x, player.y, "#8fe7ff", 18);
  enemyBullets.length = 0;

  if (game.lives <= 0) {
    game.mode = "gameover";
    hiScore = Math.max(hiScore, game.score);
    localStorage.setItem("starstrike_hiscore", String(hiScore));
    setOverlay("GAME OVER", "Press Enter or Start to launch again", "Try Again");
    showOverlay();
    return;
  }

  resetPlayer();
}

function isHit(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

function handleCollisions() {
  for (let i = playerBullets.length - 1; i >= 0; i -= 1) {
    const b = playerBullets[i];
    let hit = false;

    for (let j = enemies.length - 1; j >= 0; j -= 1) {
      const e = enemies[j];
      const radius = e.type === "mothership" ? 18 : e.type === "boss" ? 14 : 12;

      if (isHit(b.x, b.y, 4, e.x, e.y, radius)) {
        e.hp -= 1;
        hit = true;

        if (e.hp <= 0) {
          createExplosion(
            e.x,
            e.y,
            e.type === "mothership" ? "#ff38a1" : e.type === "boss" ? "#ffd76b" : e.type === "escort" ? "#ff6f85" : "#7efcff",
            e.type === "mothership" ? 20 : 12
          );
          game.score += scoreMap[e.type];
          enemies.splice(j, 1);
          if (e.state === "diving" || e.state === "returning") {
            activeDivers = Math.max(0, activeDivers - 1);
          }
        } else {
          createExplosion(e.x, e.y, "#fffa9a", 4);
          game.score += 35;
        }
        break;
      }
    }

    if (hit) playerBullets.splice(i, 1);
  }

  for (let i = enemyBullets.length - 1; i >= 0; i -= 1) {
    const b = enemyBullets[i];
    if (isHit(b.x, b.y, 4, player.x, player.y, 11)) {
      enemyBullets.splice(i, 1);
      damagePlayer();
      break;
    }
  }

  for (const e of enemies) {
    if (isHit(e.x, e.y, 13, player.x, player.y, 11)) {
      createExplosion(e.x, e.y, "#ff8ba5", 10);
      damagePlayer();
      break;
    }
  }
}

function drawStars() {
  for (const s of stars) {
    ctx.fillStyle = s.size === 2 ? "rgba(180,220,255,0.95)" : "rgba(150,170,220,0.7)";
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
}

function drawPlayer() {
  const blink = player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0;
  if (blink) return;

  ctx.save();
  ctx.translate(player.x, player.y);

  ctx.fillStyle = "#77fef8";
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(12, 12);
  ctx.lineTo(4, 7);
  ctx.lineTo(0, 12);
  ctx.lineTo(-4, 7);
  ctx.lineTo(-12, 12);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#effbff";
  ctx.fillRect(-2, -6, 4, 7);
  ctx.fillStyle = "#ff7684";
  ctx.fillRect(-7, 8, 4, 5);
  ctx.fillRect(3, 8, 4, 5);

  ctx.restore();
}

function drawEnemy(enemy) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);

  if (enemy.type === "boss") {
    ctx.fillStyle = "#ffcd6e";
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9d4e2f";
    ctx.fillRect(-10, -2, 20, 3);
    ctx.fillStyle = "#4b1920";
    ctx.fillRect(-3, -6, 6, 5);
  } else if (enemy.type === "mothership") {
    ctx.fillStyle = "#e8428f";
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(16, -8);
    ctx.lineTo(20, 0);
    ctx.lineTo(16, 8);
    ctx.lineTo(0, 16);
    ctx.lineTo(-16, 8);
    ctx.lineTo(-20, 0);
    ctx.lineTo(-16, -8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#b91e5c";
    ctx.fillRect(-12, -4, 24, 6);
    ctx.fillStyle = "#ff9ec7";
    ctx.fillRect(-4, -10, 8, 4);
    ctx.fillRect(-6, 6, 12, 3);
  } else if (enemy.type === "escort") {
    ctx.fillStyle = "#ff6f87";
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(11, -1);
    ctx.lineTo(8, 10);
    ctx.lineTo(0, 6);
    ctx.lineTo(-8, 10);
    ctx.lineTo(-11, -1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffe9f1";
    ctx.fillRect(-2, -5, 4, 4);
  } else {
    ctx.fillStyle = "#79f8ff";
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(10, 1);
    ctx.lineTo(4, 10);
    ctx.lineTo(-4, 10);
    ctx.lineTo(-10, 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ddfcff";
    ctx.fillRect(-2, -4, 4, 3);
  }

  if (enemy.hp > 1) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawBullets() {
  ctx.fillStyle = "#fffd93";
  for (const b of playerBullets) {
    ctx.fillRect(b.x - 1.5, b.y - 8, 3, 10);
  }

  ctx.fillStyle = "#ff6b79";
  for (const b of enemyBullets) {
    ctx.fillRect(b.x - 2, b.y - 4, 4, 8);
  }
}

function drawParticles() {
  for (const p of particles) {
    const alpha = clamp(p.life / p.ttl, 0, 1);
    ctx.fillStyle = p.color.replace(")", `, ${alpha})`).replace("rgb(", "rgba(");

    if (!ctx.fillStyle.startsWith("rgba")) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(p.x, p.y, 2, 2);
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.fillRect(p.x, p.y, 2, 2);
  }
}

function drawHud() {
  ctx.fillStyle = "#dff4ff";
  ctx.font = "12px 'Press Start 2P', monospace";
  ctx.fillText(`SCORE ${String(game.score).padStart(6, "0")}`, 14, 20);
  ctx.fillText(`HI ${String(hiScore).padStart(6, "0")}`, W - 170, 20);
  ctx.fillText(`LV ${game.level}`, 14, 40);
  ctx.fillText(`SHIPS ${Math.max(0, game.lives)}`, W - 160, 40);
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#050913");
  grad.addColorStop(1, "#020206");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  drawStars();
  drawBullets();

  for (const e of enemies) drawEnemy(e);
  drawPlayer();
  drawParticles();
  drawHud();
}

function update(dt) {
  updateStars(dt);
  updateParticles(dt);

  if (game.mode !== "playing") return;

  updatePlayer(dt);
  updateBullets(dt);
  updateEnemies(dt);
  handleCollisions();

  if (enemies.length === 0) {
    game.level += 1;
    createWave(game.level);
    player.invuln = 1.25;
  }

  hiScore = Math.max(hiScore, game.score);
}

function loop(ts) {
  const dt = clamp((ts - previousTs) / 1000, 0, 0.033);
  previousTs = ts;
  update(dt);
  draw();
  animationId = requestAnimationFrame(loop);
}

function beginGame() {
  game.mode = "playing";
  game.level = 1;
  game.score = 0;
  game.lives = 3;
  playerBullets.length = 0;
  enemyBullets.length = 0;
  particles.length = 0;
  formationTime = 0;
  resetPlayer();
  createWave(game.level);
  hideOverlay();
}

function startOrRestart() {
  if (game.mode === "title" || game.mode === "gameover") beginGame();
}

window.addEventListener("keydown", (event) => {
  keyState[event.key] = true;

  if (event.key === " " || event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
  }

  if (event.key === "Enter") startOrRestart();
  if (event.key === " " && game.mode !== "playing") startOrRestart();
});

window.addEventListener("keyup", (event) => {
  keyState[event.key] = false;
});

function bindTouchButton(button, key) {
  const press = (event) => {
    event.preventDefault();
    touchState[key] = true;
  };

  const release = (event) => {
    event.preventDefault();
    touchState[key] = false;
  };

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
}

bindTouchButton(controls.leftBtn, "left");
bindTouchButton(controls.rightBtn, "right");
bindTouchButton(controls.fireBtn, "fire");

startBtn.addEventListener("click", startOrRestart);

setOverlay("READY", "Arrow keys / A-D move, Space fires", "Start Mission");
draw();
previousTs = performance.now();
animationId = requestAnimationFrame(loop);

window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(animationId);
});
