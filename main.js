(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayDesc = document.getElementById("overlayDesc");
  const menuButtons = document.getElementById("menuButtons");
  const startBtn = document.getElementById("startBtn");

  const levelText = document.getElementById("levelText");
  const timeText = document.getElementById("timeText");
  const bulletText = document.getElementById("bulletText");
  const destroyText = document.getElementById("destroyText");

  const bulletButtonsWrap = document.getElementById("bulletButtons");
  const musicBtn = document.getElementById("musicBtn");
  const sfxBtn = document.getElementById("sfxBtn");
  const restartBtn = document.getElementById("restartBtn");
  const hintBubble = document.getElementById("hintBubble");

  const DPR_CAP = 2;
  const PASS_THRESHOLD = 0.85;
  const TOTAL_LEVELS = 30;
  const GROUND_HEIGHT = 92;
  const GRAVITY = 1500;
  const SHOT_COOLDOWN = 0.36;
  const BUILDING_GRID_COLS = 14;
  const BUILDING_GRID_ROWS_BASE = 18;
  const BUILDING_MIN_W = 72;
  const BUILDING_MAX_W = 124;
  const CRACK_LIFE = 0.7;

  let width = 360;
  let height = 640;
  let lastTime = 0;
  let hintTimer = 0;
  let inactiveTime = 0;

  const state = {
    screen: "menu",
    levelIndex: 0,
    selectedBullet: "heavy",
    dragging: false,
    dragStart: null,
    dragCurrent: null,
    canShoot: true,
    cooldown: 0,
    shots: [],
    buildings: [],
    particles: [],
    explosions: [],
    cracks: [],
    destructionRatio: 0,
    totalArea: 0,
    destroyedArea: 0,
    cameraShake: 0,
    cameraX: 0,
    cameraY: 0,
    clearDelay: 0,
    levelTime: 45,
    timeLeft: 45,
    startedAudio: false,
    musicOn: true,
    sfxOn: true,
    cannon: { x: 70, y: 0, angle: -0.75, power: 0 },
  };

  // 調弱子彈威力，避免一炮整棟爆掉
  const bulletTypes = {
    heavy: {
      name: "重砲彈",
      color: "#363a48",
      ring: "#f5c458",
      radius: 11,
      speedScale: 1.0,
      damageRadius: 18,
      damagePower: 0.32,
      shock: 0.05,
      trail: "#f9f2d6",
    },
    blast: {
      name: "爆裂彈",
      color: "#892dff",
      ring: "#ff94eb",
      radius: 12,
      speedScale: 0.92,
      damageRadius: 28,
      damagePower: 0.42,
      shock: 0.12,
      trail: "#ffd7fb",
    },
    pierce: {
      name: "穿甲彈",
      color: "#0b2337",
      ring: "#7be0ff",
      radius: 9,
      speedScale: 1.22,
      damageRadius: 12,
      damagePower: 0.22,
      shock: 0.04,
      pierceLine: 42,
      trail: "#d9fbff",
    },
    shock: {
      name: "震波彈",
      color: "#33a8ff",
      ring: "#c5f6ff",
      radius: 11,
      speedScale: 0.95,
      damageRadius: 22,
      damagePower: 0.24,
      shock: 0.22,
      trail: "#c9f6ff",
    },
  };

  const buildingStyles = [
    {
      name: "glassTower",
      body: "#8ed8ff",
      body2: "#d5f4ff",
      trim: "#eafaff",
      window: "#f6fdff",
      accent: "#60b8ff",
      roof: "#d8f1ff",
      base: "#8bcf6f",
    },
    {
      name: "officeBlue",
      body: "#8699c2",
      body2: "#ced7ef",
      trim: "#eff3fb",
      window: "#f8fbff",
      accent: "#5f7ae9",
      roof: "#d8e0f3",
      base: "#8bd195",
    },
    {
      name: "toyOrange",
      body: "#ffaf68",
      body2: "#ffd8b3",
      trim: "#fff2df",
      window: "#fffaf4",
      accent: "#ff7a38",
      roof: "#ffe2c7",
      base: "#9ad587",
    },
    {
      name: "cityGray",
      body: "#b7bcc7",
      body2: "#e0e5ec",
      trim: "#ffffff",
      window: "#f9fbff",
      accent: "#8a95ad",
      roof: "#edf2f7",
      base: "#8fd17a",
    },
  ];

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    width = rect.width;
    height = rect.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.cannon.y = getGroundY() - 16;
  }

  function getGroundY() {
    return height - GROUND_HEIGHT;
  }

  function makeBulletButtons() {
    bulletButtonsWrap.innerHTML = "";
    Object.entries(bulletTypes).forEach(([key, data]) => {
      const btn = document.createElement("button");
      btn.className = "bulletBtn";
      btn.textContent = data.name;
      btn.addEventListener("click", () => {
        state.selectedBullet = key;
        inactiveTime = 0;
        updateBulletButtons();
        playClick();
      });
      bulletButtonsWrap.appendChild(btn);
    });
    updateBulletButtons();
  }

  function updateBulletButtons() {
    const buttons = [...bulletButtonsWrap.children];
    const keys = Object.keys(bulletTypes);
    buttons.forEach((btn, i) => {
      btn.classList.toggle("active", keys[i] === state.selectedBullet);
    });
    bulletText.textContent = bulletTypes[state.selectedBullet].name;
  }

  function updateHUD() {
    levelText.textContent = `${state.levelIndex + 1}/${TOTAL_LEVELS}`;
    timeText.textContent = `${Math.max(0, Math.ceil(state.timeLeft))}`;
    bulletText.textContent = bulletTypes[state.selectedBullet].name;
    destroyText.textContent = `${Math.round(state.destructionRatio * 100)}%`;
    musicBtn.textContent = `音樂：${state.musicOn ? "開" : "關"}`;
    sfxBtn.textContent = `音效：${state.sfxOn ? "開" : "關"}`;
  }

  function buildLevel(index) {
    resize();

    state.levelIndex = index;
    state.dragging = false;
    state.dragStart = null;
    state.dragCurrent = null;
    state.canShoot = true;
    state.cooldown = 0;
    state.shots = [];
    state.buildings = [];
    state.particles = [];
    state.explosions = [];
    state.cracks = [];
    state.destructionRatio = 0;
    state.totalArea = 0;
    state.destroyedArea = 0;
    state.cameraShake = 0;
    state.clearDelay = 0;
    state.screen = "playing";
    inactiveTime = 0;

    const config = generateLevel(index + 1);
    state.levelTime = config.timeLimit;
    state.timeLeft = config.timeLimit;

    config.buildings.forEach((b) => {
      const building = createBuilding(b);
      state.buildings.push(building);
    });

    recalcDestroyedRatio();
    updateHUD();
    showHint();
  }

  function generateLevel(levelNumber) {
    const tier = levelNumber - 1;

    let count;
    if (levelNumber <= 4) count = 1;
    else if (levelNumber <= 10) count = 2;
    else if (levelNumber <= 18) count = 3;
    else if (levelNumber <= 24) count = 4;
    else count = 5;

    const buildings = [];
    const playableX = width * 0.42;
    const rightMargin = 16;
    const usableWidth = width - playableX - rightMargin;
    const gap = count === 1 ? 0 : 8 + Math.max(0, 12 - Math.floor(levelNumber / 4));
    const slotWidth = (usableWidth - gap * (count - 1)) / count;

    for (let i = 0; i < count; i++) {
      const progress = tier / (TOTAL_LEVELS - 1);
      const style = buildingStyles[(levelNumber + i) % buildingStyles.length];

      const floors = clamp(
        Math.floor(5 + progress * 12 + i * 0.6 + (levelNumber > 20 ? 2 : 0)),
        5,
        20
      );

      const w = clamp(slotWidth * (0.82 + Math.random() * 0.15), BUILDING_MIN_W, BUILDING_MAX_W);
      const floorH = 22 + ((levelNumber + i) % 3);
      const h = floors * floorH + 26;
      const x = playableX + slotWidth * i + gap * i + (slotWidth - w) * 0.5;
      const y = getGroundY() - h;

      buildings.push({
        x,
        y,
        w,
        h,
        style,
        floors,
        floorH,
        // 拉高耐久
        toughness: 2.4 + progress * 1.2 + i * 0.18,
        capShape: ["flat", "round", "crown"][(levelNumber + i) % 3],
        sign: (levelNumber + i) % 4 === 0,
      });
    }

    return {
      timeLimit: clamp(34 + Math.floor(levelNumber * 0.9), 34, 60),
      buildings,
    };
  }

  function createBuilding(config) {
    const cols = BUILDING_GRID_COLS;
    const rows = clamp(Math.ceil(config.h / 12), BUILDING_GRID_ROWS_BASE, 28);
    const damage = Array.from({ length: rows }, () => Array(cols).fill(0));
    const initialCellArea = (config.w / cols) * (config.h / rows);

    const building = {
      x: config.x,
      y: config.y,
      w: config.w,
      h: config.h,
      style: config.style,
      floors: config.floors,
      floorH: config.floorH,
      toughness: config.toughness,
      capShape: config.capShape,
      sign: config.sign,
      tilt: 0,
      tiltVel: 0,
      collapseBias: 0,
      destroyed: false,
      damage,
      rows,
      cols,
      cellArea: initialCellArea,
      totalArea: config.w * config.h,
      destroyedArea: 0,
      cracks: [],
    };

    state.totalArea += building.totalArea;
    return building;
  }

  function recalcDestroyedRatio() {
    let total = 0;
    let destroyed = 0;
    state.buildings.forEach((b) => {
      total += b.totalArea;
      destroyed += b.destroyedArea;
    });
    state.totalArea = Math.max(total, 1);
    state.destroyedArea = destroyed;
    state.destructionRatio = clamp(destroyed / state.totalArea, 0, 1);
  }

  function showMenu() {
    state.screen = "menu";
    overlay.classList.add("visible");
    overlayTitle.textContent = "崩崩樂園";
    overlayDesc.innerHTML =
      "單指拖曳瞄準，放開發射。<br>子彈無限，限時內把建築轟到 85% 即可過關。";
    menuButtons.innerHTML = "";
    menuButtons.appendChild(startBtn);
    startBtn.textContent = "開始遊戲";
  }

  function showResult(success) {
    state.screen = "result";
    overlay.classList.add("visible");

    const percent = Math.round(state.destructionRatio * 100);
    overlayTitle.textContent = success ? "過關！" : "時間到";
    overlayDesc.innerHTML =
      `摧毀率：<b>${percent}%</b><br>` +
      `目標：<b>85%</b><br>` +
      `第 <b>${state.levelIndex + 1}</b> 關`;

    menuButtons.innerHTML = "";

    const retry = makeMenuButton("重新挑戰", "secondaryBtn", () => {
      playClick();
      overlay.classList.remove("visible");
      buildLevel(state.levelIndex);
    });

    const next = makeMenuButton(
      success
        ? (state.levelIndex < TOTAL_LEVELS - 1 ? "下一關" : "查看結果")
        : "回到首頁",
      "primaryBtn",
      () => {
        playClick();
        overlay.classList.remove("visible");
        if (success) {
          if (state.levelIndex < TOTAL_LEVELS - 1) buildLevel(state.levelIndex + 1);
          else showComplete();
        } else {
          showMenu();
          overlay.classList.add("visible");
        }
      }
    );

    menuButtons.appendChild(next);
    menuButtons.appendChild(retry);
  }

  function showComplete() {
    state.screen = "complete";
    overlay.classList.add("visible");
    overlayTitle.textContent = "全部通關！";
    overlayDesc.innerHTML =
      "你已經把整座玩具城市轟到天翻地覆。<br>要不要從第一關再來一次？";
    menuButtons.innerHTML = "";

    const again = makeMenuButton("從第一關再玩一次", "primaryBtn", () => {
      playClick();
      overlay.classList.remove("visible");
      buildLevel(0);
    });

    const back = makeMenuButton("回到首頁", "secondaryBtn", () => {
      playClick();
      showMenu();
      overlay.classList.add("visible");
    });

    menuButtons.appendChild(again);
    menuButtons.appendChild(back);
  }

  function makeMenuButton(text, cls, onClick) {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.className = cls;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function fireShot() {
    if (state.screen !== "playing" || !state.canShoot) return;
    if (!state.dragStart || !state.dragCurrent) return;

    const dx = state.dragStart.x - state.dragCurrent.x;
    const dy = state.dragStart.y - state.dragCurrent.y;
    const len = Math.hypot(dx, dy);
    if (len < 10) return;

    const clamped = Math.min(len, 130);
    const angle = Math.atan2(dy, dx);
    const type = bulletTypes[state.selectedBullet];
    const speed = (340 + clamped * 5) * type.speedScale;

    state.cannon.angle = angle;
    state.cannon.power = clamped;

    state.shots.push({
      x: state.cannon.x + Math.cos(angle) * 30,
      y: state.cannon.y + Math.sin(angle) * 30,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: type.radius,
      type: state.selectedBullet,
      alive: true,
      ttl: 4.8,
      pierceLeft: state.selectedBullet === "pierce" ? 3 : 0,
    });

    state.canShoot = false;
    state.cooldown = SHOT_COOLDOWN;
    inactiveTime = 0;
    state.cameraShake += 4.5;

    if (navigator.vibrate) navigator.vibrate(16);
    playShoot(state.selectedBullet);
    spawnMuzzleFlash(
      state.cannon.x + Math.cos(angle) * 30,
      state.cannon.y + Math.sin(angle) * 30,
      type.trail
    );
    updateHUD();
  }

  function spawnMuzzleFlash(x, y, color) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 70 + Math.random() * 90;
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.24 + Math.random() * 0.2,
        maxLife: 0.45,
        size: 2 + Math.random() * 4,
        color,
      });
    }
  }

  function spawnExplosion(x, y, radius, color) {
    state.explosions.push({
      x,
      y,
      r: 10,
      maxR: radius,
      life: 0.28,
      maxLife: 0.28,
      color,
    });

    const count = Math.min(42, Math.floor(radius * 0.7));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 80 + Math.random() * 220;
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 10,
        life: 0.45 + Math.random() * 0.45,
        maxLife: 0.85,
        size: 2 + Math.random() * 5.5,
        color,
      });
    }
  }

  function applyShotDamage(building, hitX, hitY, shot) {
    const type = bulletTypes[shot.type];
    const localX = hitX - building.x;
    const localY = hitY - building.y;
    const cellW = building.w / building.cols;
    const cellH = building.h / building.rows;
    const radius = type.damageRadius * (shot.type === "blast" ? 1.2 : 1);
    const radiusSq = radius * radius;

    let destroyedCells = 0;
    let totalDamage = 0;

    for (let r = 0; r < building.rows; r++) {
      for (let c = 0; c < building.cols; c++) {
        const cx = (c + 0.5) * cellW;
        const cy = (r + 0.5) * cellH;

        const dx = cx - localX;
        const dy = cy - localY;
        const distSq = dx * dx + dy * dy;

        if (distSq > radiusSq) continue;

        const dist = Math.sqrt(distSq);
        const power = clamp(1 - dist / radius, 0, 1);
        const old = building.damage[r][c];

        let add = power * type.damagePower / building.toughness * 0.65;

        if (shot.type === "pierce") {
          add *= 0.95;
          if (Math.abs(dx) < type.pierceLine * 0.22) add += 0.05;
        }

        if (shot.type === "shock") {
          add *= 0.7;
          if (localY > building.h * 0.72) building.collapseBias += 0.015 * power;
        }

        building.damage[r][c] = clamp(old + add, 0, 1);

        if (old < 1 && building.damage[r][c] >= 1) {
          destroyedCells += 1;
          totalDamage += 1 - old;
        } else {
          totalDamage += building.damage[r][c] - old;
        }
      }
    }

    if (shot.type === "pierce") {
      const lineR = Math.round(localY / cellH);
      for (let c = 0; c < building.cols; c++) {
        const rr = clamp(lineR, 0, building.rows - 1);
        const old = building.damage[rr][c];
        const delta = 0.03 / building.toughness;
        building.damage[rr][c] = clamp(old + delta, 0, 1);
        totalDamage += building.damage[rr][c] - old;
      }
    }

    const addedArea = totalDamage * building.cellArea;
    building.destroyedArea = clamp(building.destroyedArea + addedArea, 0, building.totalArea);

    const force = type.shock + type.damagePower * 0.03;
    const relative = (localX / Math.max(building.w, 1)) - 0.5;
    building.tiltVel += relative * force * 0.4;
    building.tilt += relative * force * 0.02;

    building.cracks.push({
      x: localX,
      y: localY,
      r: radius * (0.9 + Math.random() * 0.25),
      life: CRACK_LIFE,
      maxLife: CRACK_LIFE,
    });

    if (destroyedCells > 0) {
      spawnDebrisFromBuilding(building, hitX, hitY, destroyedCells, shot.type);
    }

    if (buildingBaseWeakness(building) > 0.55) {
      building.collapseBias += 0.01;
      building.tiltVel += (Math.random() - 0.5) * 0.004;
    }

    playBuildingHit(shot.type);
    recalcDestroyedRatio();
  }

  function buildingBaseWeakness(building) {
    const checkRows = Math.max(2, Math.floor(building.rows * 0.18));
    let total = 0;
    let damage = 0;
    for (let r = building.rows - checkRows; r < building.rows; r++) {
      for (let c = 0; c < building.cols; c++) {
        total += 1;
        damage += building.damage[r][c];
      }
    }
    return total ? damage / total : 0;
  }

  function spawnDebrisFromBuilding(building, x, y, count, shotType) {
    const style = building.style;
    const pCount = Math.min(18, 4 + count);

    for (let i = 0; i < pCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 140;
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 15,
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
        size: 2 + Math.random() * 4,
        color: Math.random() > 0.5 ? building.style.body2 : building.style.trim,
      });
    }

    if (shotType === "blast") {
      spawnExplosion(x, y, 30, "#ff9ff1");
      playExplosion("blast");
      state.cameraShake += 5;
      if (navigator.vibrate) navigator.vibrate(20);
    } else if (shotType === "shock") {
      spawnExplosion(x, y, 24, "#c1f8ff");
      playExplosion("shock");
      state.cameraShake += 4;
      if (navigator.vibrate) navigator.vibrate(16);
    } else {
      spawnExplosion(x, y, 18, "#fff1b5");
      playImpact("wall", true);
    }
  }

  function updateShots(dt) {
    state.shots.forEach((shot) => {
      if (!shot.alive) return;

      shot.ttl -= dt;
      if (shot.ttl <= 0) {
        shot.alive = false;
        return;
      }

      shot.vy += GRAVITY * 0.55 * dt;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;

      if (shot.y + shot.radius >= getGroundY()) {
        shot.y = getGroundY() - shot.radius;
        spawnExplosion(shot.x, shot.y, 20, "#fef0b5");
        playExplosion("ground");
        shot.alive = false;
        return;
      }

      for (const building of state.buildings) {
        if (building.destroyed) continue;
        if (shotHitsBuilding(shot, building)) {
          applyShotDamage(building, shot.x, shot.y, shot);

          if (shot.type === "pierce" && shot.pierceLeft > 0) {
            shot.pierceLeft -= 1;
            shot.vx *= 0.95;
            shot.vy *= 0.96;
            shot.x += shot.vx * 0.015;
            continue;
          } else {
            shot.alive = false;
            break;
          }
        }
      }

      if (shot.x < -120 || shot.x > width + 120 || shot.y < -120 || shot.y > height + 120) {
        shot.alive = false;
      }
    });

    state.shots = state.shots.filter((s) => s.alive);
  }

  function shotHitsBuilding(shot, building) {
    if (
      shot.x + shot.radius < building.x ||
      shot.x - shot.radius > building.x + building.w ||
      shot.y + shot.radius < building.y ||
      shot.y - shot.radius > building.y + building.h
    ) {
      return false;
    }

    const localX = shot.x - building.x;
    const localY = shot.y - building.y;
    const cell = cellAt(building, localX, localY);

    if (!cell) return false;

    const [r, c] = cell;
    return building.damage[r][c] < 0.98;
  }

  function cellAt(building, localX, localY) {
    if (localX < 0 || localX > building.w || localY < 0 || localY > building.h) return null;
    const c = Math.floor((localX / building.w) * building.cols);
    const r = Math.floor((localY / building.h) * building.rows);
    if (r < 0 || r >= building.rows || c < 0 || c >= building.cols) return null;
    return [r, c];
  }

  function updateBuildings(dt) {
    state.buildings.forEach((b) => {
      if (b.destroyed) return;

      const baseWeak = buildingBaseWeakness(b);
      const totalRatio = clamp(b.destroyedArea / b.totalArea, 0, 1);

      b.tiltVel += (b.collapseBias + baseWeak * 0.22 + totalRatio * 0.08) * 0.00035;
      b.tilt *= 0.995;
      b.tiltVel *= 0.985;
      b.tilt += b.tiltVel;

      if (Math.abs(b.tilt) > 0.6 || totalRatio > 0.985) {
        destroyBuildingCompletely(b);
      }

      b.cracks.forEach((c) => {
        c.life -= dt;
      });
      b.cracks = b.cracks.filter((c) => c.life > 0);
    });

    recalcDestroyedRatio();

    state.cooldown -= dt;
    if (state.cooldown <= 0) {
      state.cooldown = 0;
      state.canShoot = true;
    }

    state.timeLeft -= dt;
  }

  function destroyBuildingCompletely(building) {
    if (building.destroyed) return;

    const remaining = building.totalArea - building.destroyedArea;
    building.destroyedArea = building.totalArea;
    building.destroyed = true;
    building.tilt = 0.42 * (Math.random() > 0.5 ? 1 : -1);

    for (let r = 0; r < building.rows; r++) {
      for (let c = 0; c < building.cols; c++) {
        building.damage[r][c] = 1;
      }
    }

    spawnExplosion(
      building.x + building.w * 0.5,
      building.y + building.h * 0.52,
      Math.max(40, building.w * 0.45),
      "#fff2c8"
    );

    for (let i = 0; i < 30; i++) {
      const px = building.x + Math.random() * building.w;
      const py = building.y + Math.random() * building.h;
      state.particles.push({
        x: px,
        y: py,
        vx: (Math.random() - 0.5) * 220,
        vy: -50 - Math.random() * 140,
        life: 0.6 + Math.random() * 0.7,
        maxLife: 1.1,
        size: 3 + Math.random() * 4,
        color: Math.random() > 0.5 ? building.style.body2 : building.style.trim,
      });
    }

    state.destroyedArea += Math.max(0, remaining);
    state.cameraShake += 10;
    if (navigator.vibrate) navigator.vibrate(28);
    playFall();
    recalcDestroyedRatio();
  }

  function updateParticles(dt) {
    state.particles.forEach((p) => {
      p.life -= dt;
      p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.99;
    });
    state.particles = state.particles.filter((p) => p.life > 0);

    state.explosions.forEach((e) => {
      e.life -= dt;
      e.r += (e.maxR - e.r) * 0.24;
    });
    state.explosions = state.explosions.filter((e) => e.life > 0);
  }

  function updateCamera(dt) {
    state.cameraShake *= Math.pow(0.87, dt * 60);
    if (state.cameraShake < 0.05) state.cameraShake = 0;
    state.cameraX = (Math.random() - 0.5) * state.cameraShake;
    state.cameraY = (Math.random() - 0.5) * state.cameraShake;
  }

  function updateGame(dt) {
    if (state.screen !== "playing") return;

    updateShots(dt);
    updateBuildings(dt);
    updateParticles(dt);
    updateCamera(dt);

    if (state.destructionRatio >= PASS_THRESHOLD) {
      state.clearDelay += dt;
      if (state.clearDelay > 0.6) {
        playWin();
        showResult(true);
      }
    } else if (state.timeLeft <= 0) {
      state.clearDelay += dt;
      if (state.clearDelay > 0.35) {
        showResult(false);
      }
    } else {
      state.clearDelay = 0;
    }

    inactiveTime += dt;
    if (inactiveTime > 4.5 && !state.dragging && state.shots.length === 0) {
      showHint();
      inactiveTime = 0;
    }

    updateHUD();
  }

  function render() {
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(state.cameraX, state.cameraY);

    drawBackground();
    drawGround();
    drawDecor();
    drawAimGuide();
    drawBuildings();
    drawShots();
    drawExplosions();
    drawParticles();
    drawCannon();

    ctx.restore();
  }

  function drawBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, "#7fc8ff");
    grad.addColorStop(0.5, "#d0f0ff");
    grad.addColorStop(1, "#eef9ff");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    drawCloud(76, 88, 44);
    drawCloud(244, 118, 34);
    drawCloud(width - 90, 84, 40);
  }

  function drawCloud(x, y, size) {
    ctx.beginPath();
    ctx.arc(x, y, size * 0.46, 0, Math.PI * 2);
    ctx.arc(x + size * 0.28, y - size * 0.12, size * 0.34, 0, Math.PI * 2);
    ctx.arc(x + size * 0.58, y, size * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGround() {
    const groundY = getGroundY();
    const grad = ctx.createLinearGradient(0, groundY - 20, 0, height);
    grad.addColorStop(0, "#98e57d");
    grad.addColorStop(1, "#4fb14e");
    ctx.fillStyle = grad;
    ctx.fillRect(0, groundY, width, height - groundY);
    ctx.fillStyle = "#e8f7a3";
    ctx.fillRect(0, groundY, width, 10);
  }

  function drawDecor() {
    const groundY = getGroundY();

    for (let i = 0; i < width; i += 36) {
      ctx.fillStyle = i % 72 === 0 ? "#d0d4df" : "#c4c9d6";
      ctx.fillRect(i, groundY - 24, 18, 24);
    }

    ctx.fillStyle = "#f5cd75";
    for (let i = 0; i < width; i += 25) {
      ctx.fillRect(i + 6, groundY + 18, 10, 3);
    }
  }

  function drawCannon() {
    const { x, y, angle } = state.cannon;

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "#6d7c93";
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(angle);
    ctx.fillStyle = "#2f405c";
    roundRectPath(-8, -8, 54, 16, 8);
    ctx.fill();

    ctx.fillStyle = "#9eb2d4";
    roundRectPath(-6, -6, 50, 12, 6);
    ctx.fill();

    ctx.restore();

    ctx.fillStyle = "#404a5a";
    ctx.beginPath();
    ctx.arc(x, y + 18, 30, Math.PI, 0);
    ctx.lineTo(x + 30, y + 18);
    ctx.lineTo(x - 30, y + 18);
    ctx.closePath();
    ctx.fill();
  }

  function drawAimGuide() {
    if (!state.dragging || !state.dragStart || !state.dragCurrent) return;

    const dx = state.dragStart.x - state.dragCurrent.x;
    const dy = state.dragStart.y - state.dragCurrent.y;
    const length = Math.min(Math.hypot(dx, dy), 130);
    if (length < 6) return;

    const angle = Math.atan2(dy, dx);
    const points = 7;
    ctx.save();
    for (let i = 1; i <= points; i++) {
      const t = i / points;
      const px = state.cannon.x + Math.cos(angle) * (20 + length * 0.55 * t);
      const py = state.cannon.y + Math.sin(angle) * (20 + length * 0.55 * t) + (t * t) * 10;
      ctx.globalAlpha = 1 - t * 0.75;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(px, py, 5 - t * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawBuildings() {
    state.buildings.forEach((b) => {
      if (b.destroyed && b.destroyedArea >= b.totalArea) return;

      ctx.save();
      const pivotX = b.x + b.w * 0.5;
      const pivotY = b.y + b.h;
      ctx.translate(pivotX, pivotY);
      ctx.rotate(b.tilt);
      ctx.translate(-pivotX, -pivotY);

      drawSingleBuilding(b);
      ctx.restore();
    });
  }

  function drawSingleBuilding(b) {
    const style = b.style;
    drawBuildingShell(b, style);
    drawBuildingWindows(b, style);
    drawBuildingRoof(b, style);
    if (b.sign) drawBuildingSign(b, style);
    drawDamageHoles(b);
    drawCracks(b);
  }

  function drawBuildingShell(b, style) {
    const bodyGrad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
    bodyGrad.addColorStop(0, style.body2);
    bodyGrad.addColorStop(0.35, style.body);
    bodyGrad.addColorStop(1, shadeColor(style.body, -18));

    ctx.fillStyle = bodyGrad;
    roundRectPath(b.x, b.y, b.w, b.h, 14);
    ctx.fill();

    ctx.fillStyle = hexToRgba(style.trim, 0.55);
    roundRectPath(b.x + 4, b.y + 4, b.w - 8, b.h - 8, 10);
    ctx.fill();

    ctx.fillStyle = hexToRgba(style.accent, 0.24);
    ctx.fillRect(b.x + 6, b.y + 8, 8, b.h - 16);

    ctx.fillStyle = hexToRgba("#000000", 0.08);
    ctx.fillRect(b.x + b.w * 0.78, b.y + 4, b.w * 0.12, b.h - 8);

    ctx.fillStyle = style.base;
    ctx.fillRect(b.x - 2, b.y + b.h - 12, b.w + 4, 12);
  }

  function drawBuildingWindows(b, style) {
    const cols = Math.max(3, Math.floor(b.w / 20));
    const rows = Math.max(4, Math.floor((b.h - 28) / 24));
    const padX = 12;
    const padY = 16;
    const winGapX = 8;
    const winGapY = 8;
    const usableW = b.w - padX * 2;
    const usableH = b.h - padY * 2 - 10;
    const winW = (usableW - winGapX * (cols - 1)) / cols;
    const winH = (usableH - winGapY * (rows - 1)) / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = b.x + padX + c * (winW + winGapX);
        const y = b.y + padY + r * (winH + winGapY);

        ctx.fillStyle = hexToRgba(style.window, 0.92);
        roundRectPath(x, y, winW, winH, 4);
        ctx.fill();

        ctx.fillStyle = hexToRgba(style.accent, 0.18);
        roundRectPath(x + 1.2, y + 1.2, winW - 2.4, winH * 0.46, 3);
        ctx.fill();
      }
    }
  }

  function drawBuildingRoof(b, style) {
    ctx.fillStyle = style.roof;

    if (b.capShape === "flat") {
      roundRectPath(b.x + 8, b.y - 8, b.w - 16, 14, 6);
      ctx.fill();
    } else if (b.capShape === "round") {
      ctx.beginPath();
      ctx.moveTo(b.x + 12, b.y + 2);
      ctx.quadraticCurveTo(b.x + b.w * 0.5, b.y - 18, b.x + b.w - 12, b.y + 2);
      ctx.lineTo(b.x + b.w - 12, b.y + 10);
      ctx.lineTo(b.x + 12, b.y + 10);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(b.x + 10, b.y + 4);
      ctx.lineTo(b.x + b.w * 0.3, b.y - 10);
      ctx.lineTo(b.x + b.w * 0.5, b.y + 2);
      ctx.lineTo(b.x + b.w * 0.7, b.y - 10);
      ctx.lineTo(b.x + b.w - 10, b.y + 4);
      ctx.lineTo(b.x + b.w - 10, b.y + 10);
      ctx.lineTo(b.x + 10, b.y + 10);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawBuildingSign(b, style) {
    const signW = Math.min(44, b.w * 0.42);
    const signH = 16;
    const x = b.x + b.w * 0.5 - signW * 0.5;
    const y = b.y + b.h - 30;

    ctx.fillStyle = style.accent;
    roundRectPath(x, y, signW, signH, 6);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BOOM", x + signW / 2, y + signH / 2 + 0.5);
  }

  function drawDamageHoles(b) {
    const cellW = b.w / b.cols;
    const cellH = b.h / b.rows;

    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        const dmg = b.damage[r][c];
        if (dmg < 0.34) continue;

        const x = b.x + c * cellW;
        const y = b.y + r * cellH;
        const cx = x + cellW * 0.5;
        const cy = y + cellH * 0.5;
        const rr = Math.min(cellW, cellH) * (0.24 + dmg * 0.42);

        ctx.fillStyle = dmg >= 1 ? "#000000" : hexToRgba("#19212a", 0.55 + dmg * 0.35);
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.fill();

        if (dmg >= 1) {
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.beginPath();
          ctx.arc(cx - rr * 0.15, cy - rr * 0.1, rr * 0.72, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawCracks(b) {
    ctx.strokeStyle = "rgba(40, 50, 60, 0.55)";
    ctx.lineWidth = 2;

    b.cracks.forEach((crack) => {
      const alpha = clamp(crack.life / crack.maxLife, 0, 1);
      ctx.globalAlpha = alpha;

      const startX = b.x + crack.x;
      const startY = b.y + crack.y;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(startX + crack.r * 0.35, startY - crack.r * 0.1);
      ctx.lineTo(startX + crack.r * 0.55, startY + crack.r * 0.22);

      ctx.moveTo(startX, startY);
      ctx.lineTo(startX - crack.r * 0.28, startY + crack.r * 0.12);
      ctx.lineTo(startX - crack.r * 0.48, startY + crack.r * 0.34);

      ctx.moveTo(startX, startY);
      ctx.lineTo(startX + crack.r * 0.1, startY - crack.r * 0.34);
      ctx.lineTo(startX - crack.r * 0.12, startY - crack.r * 0.52);
      ctx.stroke();
    });

    ctx.globalAlpha = 1;
  }

  function drawShots() {
    state.shots.forEach((shot) => {
      const type = bulletTypes[shot.type];

      const trail = ctx.createRadialGradient(
        shot.x,
        shot.y,
        2,
        shot.x,
        shot.y,
        shot.radius * 3
      );
      trail.addColorStop(0, type.trail);
      trail.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = trail;
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.radius * 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = type.ring;
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.radius + 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = type.color;
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawExplosions() {
    state.explosions.forEach((e) => {
      const alpha = clamp(e.life / e.maxLife, 0, 1);
      const grad = ctx.createRadialGradient(e.x, e.y, 2, e.x, e.y, e.r);
      grad.addColorStop(0, hexToRgba(e.color, 0.96 * alpha));
      grad.addColorStop(0.42, hexToRgba("#fff5cb", 0.68 * alpha));
      grad.addColorStop(1, hexToRgba(e.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawParticles() {
    state.particles.forEach((p) => {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function roundRect(x, y, w, h, r) {
    roundRectPath(x, y, w, h, r);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function hexToRgba(hex, a) {
    const h = hex.replace("#", "");
    const n = parseInt(h, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${a})`;
  }

  function shadeColor(hex, amount) {
    const h = hex.replace("#", "");
    const num = parseInt(h, 16);
    let r = (num >> 16) & 255;
    let g = (num >> 8) & 255;
    let b = num & 255;
    r = clamp(r + amount, 0, 255);
    g = clamp(g + amount, 0, 255);
    b = clamp(b + amount, 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  }

  function onPointerDown(e) {
    if (state.screen !== "playing") return;

    ensureAudioStarted();
    inactiveTime = 0;

    const p = pointerPos(e);
    const dx = p.x - state.cannon.x;
    const dy = p.y - state.cannon.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 90 && state.canShoot) {
      state.dragging = true;
      state.dragStart = { x: state.cannon.x, y: state.cannon.y };
      state.dragCurrent = p;
      hideHint();
      e.preventDefault();
    }
  }

  function onPointerMove(e) {
    if (!state.dragging) return;

    const p = pointerPos(e);
    state.dragCurrent = p;
    const dx = state.dragStart.x - state.dragCurrent.x;
    const dy = state.dragStart.y - state.dragCurrent.y;
    const angle = Math.atan2(dy, dx);
    state.cannon.angle = clamp(angle, -2.5, -0.15);
    inactiveTime = 0;
    e.preventDefault();
  }

  function onPointerUp(e) {
    if (!state.dragging) return;
    fireShot();
    state.dragging = false;
    state.dragStart = null;
    state.dragCurrent = null;
    e.preventDefault();
  }

  function showHint() {
    clearTimeout(hintTimer);
    hintBubble.classList.add("show");
    hintTimer = setTimeout(() => hintBubble.classList.remove("show"), 2200);
  }

  function hideHint() {
    hintBubble.classList.remove("show");
  }

  let audioCtx = null;
  let musicGain = null;
  let sfxGain = null;
  let musicNodes = [];

  function ensureAudioStarted() {
    if (state.startedAudio) return;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    musicGain = audioCtx.createGain();
    sfxGain = audioCtx.createGain();
    musicGain.connect(audioCtx.destination);
    sfxGain.connect(audioCtx.destination);
    musicGain.gain.value = state.musicOn ? 0.13 : 0;
    sfxGain.gain.value = state.sfxOn ? 0.22 : 0;

    startMusicLoop();
    state.startedAudio = true;
  }

  function setMusicEnabled(enabled) {
    state.musicOn = enabled;
    if (musicGain) {
      musicGain.gain.linearRampToValueAtTime(enabled ? 0.13 : 0, audioCtx.currentTime + 0.08);
    }
    updateHUD();
  }

  function setSfxEnabled(enabled) {
    state.sfxOn = enabled;
    if (sfxGain) {
      sfxGain.gain.linearRampToValueAtTime(enabled ? 0.22 : 0, audioCtx.currentTime + 0.06);
    }
    updateHUD();
  }

  function startMusicLoop() {
    if (!audioCtx) return;
    stopMusicLoop();

    const tempo = 110;
    const beat = 60 / tempo;
    const startAt = audioCtx.currentTime + 0.05;
    const progression = [261.63, 329.63, 392.0, 440.0, 349.23, 392.0, 293.66, 329.63];

    for (let bar = 0; bar < 16; bar++) {
      const root = progression[bar % progression.length];
      const t = startAt + bar * beat * 2;

      scheduleTone(root, t, beat * 1.7, "triangle", 0.075, musicGain);
      scheduleTone(root * 2, t + beat * 0.25, beat * 0.28, "sine", 0.045, musicGain);
      scheduleTone(root * 1.5, t + beat * 0.85, beat * 0.24, "sine", 0.04, musicGain);
      scheduleTone(root * 2.5, t + beat * 1.25, beat * 0.26, "sine", 0.04, musicGain);

      scheduleKick(t, 0.05, 0.18, musicGain, true);
      scheduleKick(t + beat, 0.04, 0.15, musicGain, true);
    }

    const totalLength = beat * 2 * 16;
    setTimeout(() => {
      if (state.startedAudio) startMusicLoop();
    }, Math.max(100, totalLength * 1000 - 120));
  }

  function stopMusicLoop() {
    musicNodes.forEach((n) => {
      try {
        n.stop && n.stop();
        n.disconnect && n.disconnect();
      } catch (_) {}
    });
    musicNodes = [];
  }

  function scheduleTone(freq, time, duration, type, volume, output) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    gain.connect(output);
    osc.start(time);
    osc.stop(time + duration + 0.04);
    musicNodes.push(osc, gain);
  }

  function scheduleKick(time, duration, volume, output, soft = false) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = soft ? "sine" : "triangle";
    osc.frequency.setValueAtTime(105, time);
    osc.frequency.exponentialRampToValueAtTime(44, time + duration);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain);
    gain.connect(output);
    osc.start(time);
    osc.stop(time + duration + 0.02);
    musicNodes.push(osc, gain);
  }

  function oneShot(freq, duration, type, volume, attack, output, pitchDrop = 1, atTime = null) {
    const time = atTime ?? audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    if (pitchDrop !== 1) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(35, freq * pitchDrop), time + duration);
    }

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    gain.connect(output);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  function playShoot(type) {
    if (!audioCtx || !state.sfxOn) return;
    const now = audioCtx.currentTime;
    const freqMap = { heavy: 120, blast: 165, pierce: 240, shock: 198 };
    oneShot(freqMap[type] || 150, 0.12, "triangle", 0.18, 0.03, sfxGain, 0.72);
    oneShot((freqMap[type] || 150) * 0.52, 0.16, "sine", 0.13, 0.01, sfxGain, 0.72, now + 0.01);
  }

  function playImpact(_material, destroyed) {
    if (!audioCtx || !state.sfxOn) return;
    oneShot(
      destroyed ? 260 : 340,
      destroyed ? 0.12 : 0.08,
      "triangle",
      destroyed ? 0.11 : 0.07,
      0.002,
      sfxGain,
      1
    );
  }

  function playBuildingHit(shotType) {
    if (!audioCtx || !state.sfxOn) return;

    const now = audioCtx.currentTime;

    if (shotType === "blast") {
      oneShot(180, 0.08, "triangle", 0.09, 0.002, sfxGain, 0.9, now);
      oneShot(110, 0.14, "sawtooth", 0.11, 0.002, sfxGain, 0.65, now + 0.01);
    } else if (shotType === "heavy") {
      oneShot(140, 0.1, "triangle", 0.1, 0.002, sfxGain, 0.78, now);
      oneShot(90, 0.12, "sine", 0.08, 0.002, sfxGain, 0.7, now + 0.01);
    } else if (shotType === "pierce") {
      oneShot(280, 0.06, "square", 0.08, 0.002, sfxGain, 0.92, now);
      oneShot(180, 0.08, "triangle", 0.05, 0.002, sfxGain, 0.85, now + 0.005);
    } else if (shotType === "shock") {
      oneShot(220, 0.08, "sine", 0.08, 0.002, sfxGain, 0.88, now);
      oneShot(120, 0.12, "triangle", 0.07, 0.002, sfxGain, 0.75, now + 0.01);
    }
  }

  function playExplosion(type) {
    if (!audioCtx || !state.sfxOn) return;
    oneShot(type === "blast" ? 90 : 125, 0.25, "sawtooth", 0.18, 0.001, sfxGain, 0.45);
    oneShot(58, 0.28, "triangle", 0.12, 0.002, sfxGain, 0.45, audioCtx.currentTime + 0.02);
  }

  function playFall() {
    if (!audioCtx || !state.sfxOn) return;
    oneShot(96, 0.11, "triangle", 0.1, 0.002, sfxGain, 0.55);
  }

  function playWin() {
    if (!audioCtx || !state.sfxOn) return;
    const now = audioCtx.currentTime;
    oneShot(523.25, 0.18, "triangle", 0.12, 0.002, sfxGain, 1, now);
    oneShot(659.25, 0.18, "triangle", 0.12, 0.002, sfxGain, 1, now + 0.12);
    oneShot(783.99, 0.28, "triangle", 0.16, 0.002, sfxGain, 1, now + 0.24);
  }

  function playClick() {
    if (!audioCtx || !state.sfxOn) return;
    oneShot(620, 0.05, "sine", 0.07, 0.002, sfxGain, 1);
  }

  function loop(t) {
    const now = t * 0.001;
    const dt = Math.min(0.033, lastTime ? now - lastTime : 0.016);
    lastTime = now;

    updateGame(dt);
    render();

    requestAnimationFrame(loop);
  }

  startBtn.addEventListener("click", () => {
    ensureAudioStarted();
    playClick();
    overlay.classList.remove("visible");
    buildLevel(0);
  });

  musicBtn.addEventListener("click", () => {
    ensureAudioStarted();
    setMusicEnabled(!state.musicOn);
    playClick();
  });

  sfxBtn.addEventListener("click", () => {
    ensureAudioStarted();
    const next = !state.sfxOn;
    setSfxEnabled(next);
    if (next) playClick();
  });

  restartBtn.addEventListener("click", () => {
    ensureAudioStarted();
    playClick();
    if (state.screen === "playing" || state.screen === "result") {
      overlay.classList.remove("visible");
      buildLevel(state.levelIndex);
    } else if (state.screen === "complete") {
      overlay.classList.remove("visible");
      buildLevel(0);
    }
  });

  canvas.addEventListener("mousedown", onPointerDown);
  canvas.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerUp);

  canvas.addEventListener("touchstart", onPointerDown, { passive: false });
  canvas.addEventListener("touchmove", onPointerMove, { passive: false });
  window.addEventListener("touchend", onPointerUp, { passive: false });
  window.addEventListener("touchcancel", onPointerUp, { passive: false });

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);

  resize();
  makeBulletButtons();
  showMenu();
  updateHUD();
  requestAnimationFrame(loop);
})();
