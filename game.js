(() => {
  const W = 600;
  const H = 150;
  const GROUND = 130;
  const FOX_H = 34;
  const FOX_Y = GROUND - FOX_H;
  const GRAVITY = 2200;
  const JUMP_V = -640;
  const START_SPEED = 360;
  const MAX_SPEED = 780;
  const ACCEL = 6;
  const NIGHT_EVERY = 700;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const wrap = document.getElementById("wrap");
  const jumpBtn = document.getElementById("jump");
  const duckBtn = document.getElementById("duck");
  const muteBtn = document.getElementById("mute");

  const DAY = {
    sky: [247, 247, 247],
    fg: [83, 83, 83],
    cloud: [222, 222, 222],
    ground: [83, 83, 83],
    rock: [110, 118, 130],
    rockLight: [152, 160, 172],
    bat: [75, 58, 107],
  };
  const NIGHT = {
    sky: [20, 25, 40],
    fg: [225, 228, 240],
    cloud: [48, 56, 80],
    ground: [200, 205, 220],
    rock: [140, 148, 165],
    rockLight: [182, 190, 206],
    bat: [175, 155, 225],
  };

  let phase = "ready";
  let paused = false;
  let speed = START_SPEED;
  let distance = 0;
  let score = 0;
  let hi = 0;
  let runTime = 0;
  let nightT = 0;
  let flash = 0;
  let lastMilestone = 0;
  let overAt = 0;
  let holdDown = false;
  let obstacles = [];
  let clouds = [];
  let dashes = [];

  const fox = { x: 40, y: FOX_Y, vy: 0, jumping: false, ducking: false, t: 0 };
  const stars = Array.from({ length: 18 }, () => ({
    x: Math.random() * W,
    y: Math.random() * 70,
  }));

  try {
    hi = Number(localStorage.getItem("foxrun-hi")) || 0;
  } catch {
    hi = 0;
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  const col = (name) => {
    const a = DAY[name];
    const b = NIGHT[name];
    return `rgb(${Math.round(lerp(a[0], b[0], nightT))},${Math.round(lerp(a[1], b[1], nightT))},${Math.round(lerp(a[2], b[2], nightT))})`;
  };

  function box(color, x, y, w, h) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  let audio = null;
  let muted = false;

  function initAudio() {
    if (!audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audio = new AC();
    }
    if (audio && audio.state === "suspended") audio.resume();
  }

  function tone(freq, dur, type = "square", vol = 0.05, slide = 0) {
    if (!audio || muted) return;
    const now = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, now + dur);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(now);
    osc.stop(now + dur);
  }

  function toggleMute() {
    muted = !muted;
    muteBtn.textContent = muted ? "🔇" : "🔊";
  }

  function reset() {
    speed = START_SPEED;
    distance = 0;
    score = 0;
    runTime = 0;
    flash = 0;
    lastMilestone = 0;
    nightT = 0;
    fox.y = FOX_Y;
    fox.vy = 0;
    fox.jumping = false;
    fox.ducking = false;
    fox.t = 0;
    obstacles = [];
    clouds = Array.from({ length: 3 }, (_, i) => ({
      x: 150 + i * 220 + Math.random() * 60,
      y: 14 + Math.random() * 40,
    }));
    dashes = Array.from({ length: 22 }, (_, i) => ({
      x: i * 28 + Math.random() * 20,
      y: GROUND + 5 + Math.random() * 12,
      w: 2 + Math.random() * 10,
    }));
  }

  function jump() {
    if (phase !== "run" || fox.jumping) return;
    fox.jumping = true;
    fox.ducking = false;
    fox.vy = JUMP_V;
    tone(420, 0.14, "square", 0.05, 240);
  }

  function press() {
    initAudio();
    if (phase === "ready") {
      reset();
      phase = "run";
      jump();
    } else if (phase === "over") {
      if (performance.now() - overAt > 350) {
        reset();
        phase = "run";
        jump();
      }
    } else {
      jump();
    }
  }

  function die() {
    phase = "over";
    overAt = performance.now();
    if (score > hi) {
      hi = score;
      try {
        localStorage.setItem("foxrun-hi", String(Math.floor(hi)));
      } catch {
        hi = score;
      }
    }
    tone(180, 0.35, "sawtooth", 0.07, -120);
  }

  function spawn() {
    const flying = score > 200 && Math.random() < 0.3;
    let o;
    if (flying) {
      const heights = [100, 84, 58];
      o = {
        type: "bat",
        x: W + 10,
        y: heights[Math.floor(Math.random() * heights.length)],
        w: 36,
        h: 22,
        t: 0,
        frame: 0,
        offset: (Math.random() < 0.5 ? -1 : 1) * 40,
      };
    } else {
      const kinds = [
        { type: "rock", w: 22, h: 24 },
        { type: "rocks", w: 46, h: 24 },
        { type: "stump", w: 20, h: 40 },
      ];
      const k = kinds[Math.floor(Math.random() * kinds.length)];
      o = { type: k.type, x: W + 10, y: GROUND - k.h, w: k.w, h: k.h, offset: 0 };
    }
    const base = o.w * (speed / 60) + 72;
    o.gap = base + Math.random() * base * 0.5;
    obstacles.push(o);
  }

  function foxBox() {
    if (fox.ducking) return { x: fox.x + 4, y: GROUND - 22, w: 44, h: 20 };
    return { x: fox.x + 8, y: fox.y + 3, w: 34, h: 31 };
  }

  function hits(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function update(dt) {
    if (phase !== "run") return;

    runTime += dt;
    speed = Math.min(MAX_SPEED, speed + ACCEL * dt);
    distance += speed * dt;
    score = distance * 0.025;
    fox.t += dt;

    fox.ducking = holdDown && !fox.jumping;
    if (fox.jumping) {
      const g = GRAVITY * (holdDown ? 2.5 : 1);
      fox.vy += g * dt;
      fox.y += fox.vy * dt;
      if (fox.y >= FOX_Y) {
        fox.y = FOX_Y;
        fox.vy = 0;
        fox.jumping = false;
      }
    }

    for (const o of obstacles) {
      o.x -= (speed + o.offset) * dt;
      if (o.type === "bat") {
        o.t += dt;
        o.frame = Math.floor(o.t / 0.15) % 2;
      }
    }
    obstacles = obstacles.filter((o) => o.x + o.w > -10);

    const last = obstacles[obstacles.length - 1];
    if (runTime > 1 && (!last || W - (last.x + last.w) > last.gap)) spawn();

    const fb = foxBox();
    for (const o of obstacles) {
      const ob = { x: o.x + 3, y: o.y + 3, w: o.w - 6, h: o.h - 5 };
      if (hits(fb, ob)) {
        die();
        break;
      }
    }

    for (const c of clouds) {
      c.x -= speed * 0.15 * dt;
      if (c.x < -50) {
        c.x = W + Math.random() * 100;
        c.y = 14 + Math.random() * 40;
      }
    }
    for (const d of dashes) {
      d.x -= speed * dt;
      if (d.x + d.w < 0) {
        d.x += W + Math.random() * 40;
        d.y = GROUND + 5 + Math.random() * 12;
        d.w = 2 + Math.random() * 10;
      }
    }

    const target = Math.floor(score / NIGHT_EVERY) % 2 === 1 ? 1 : 0;
    const diff = target - nightT;
    nightT += Math.sign(diff) * Math.min(Math.abs(diff), dt * 0.6);

    const milestone = Math.floor(score / 100);
    if (milestone > lastMilestone) {
      lastMilestone = milestone;
      flash = 0.9;
      tone(880, 0.08);
      setTimeout(() => tone(1100, 0.1), 90);
    }
    if (flash > 0) flash -= dt;
  }

  function drawFox(x, y, mode, frame) {
    const O = "#e8731a";
    const D = "#3a2a22";
    const T = "#fff4e6";

    if (mode === "duck") {
      box(O, x, y + 10, 10, 7);
      box(T, x, y + 10, 4, 7);
      box(O, x + 8, y + 8, 26, 12);
      box(O, x + 34, y + 8, 14, 11);
      box(O, x + 46, y + 12, 5, 5);
      box(D, x + 50, y + 12, 2, 2);
      box(T, x + 34, y + 16, 12, 3);
      box(O, x + 36, y + 3, 4, 6);
      box(O, x + 43, y + 3, 4, 6);
      box(D, x + 36, y + 3, 4, 2);
      box(D, x + 43, y + 3, 4, 2);
      box(D, x + 41, y + 11, 2, 2);
      if (frame === 0) {
        box(D, x + 12, y + 20, 4, 4);
        box(D, x + 28, y + 20, 4, 4);
      } else {
        box(D, x + 17, y + 20, 4, 4);
        box(D, x + 23, y + 20, 4, 4);
      }
      return;
    }

    box(O, x, y + 12, 10, 8);
    box(T, x, y + 12, 4, 8);
    box(O, x + 8, y + 12, 24, 12);
    box(T, x + 14, y + 21, 14, 3);
    box(O, x + 28, y + 4, 14, 13);
    box(O, x + 40, y + 9, 6, 6);
    box(D, x + 44, y + 9, 2, 2);
    box(T, x + 30, y + 14, 10, 3);
    box(O, x + 29, y, 4, 5);
    box(O, x + 36, y, 4, 5);
    box(D, x + 29, y, 4, 2);
    box(D, x + 36, y, 4, 2);

    if (mode === "dead") {
      box(D, x + 35, y + 6, 1, 1);
      box(D, x + 37, y + 6, 1, 1);
      box(D, x + 36, y + 7, 1, 1);
      box(D, x + 35, y + 8, 1, 1);
      box(D, x + 37, y + 8, 1, 1);
    } else {
      box(D, x + 36, y + 7, 2, 2);
    }

    if (mode === "run") {
      if (frame === 0) {
        box(D, x + 24, y + 24, 4, 10);
        box(D, x + 10, y + 24, 4, 5);
      } else {
        box(D, x + 24, y + 24, 4, 5);
        box(D, x + 10, y + 24, 4, 10);
      }
    } else if (mode === "jump") {
      box(D, x + 24, y + 24, 4, 6);
      box(D, x + 10, y + 24, 4, 6);
    } else {
      box(D, x + 24, y + 24, 4, 10);
      box(D, x + 10, y + 24, 4, 10);
    }
  }

  function drawObstacle(o) {
    if (o.type === "bat") {
      const c = col("bat");
      box(c, o.x + 14, o.y + 8, 8, 8);
      box(c, o.x + 14, o.y + 4, 2, 4);
      box(c, o.x + 20, o.y + 4, 2, 4);
      if (o.frame === 0) {
        box(c, o.x, o.y + 4, 14, 4);
        box(c, o.x + 22, o.y + 4, 14, 4);
        box(c, o.x + 4, o.y + 8, 10, 3);
        box(c, o.x + 22, o.y + 8, 10, 3);
      } else {
        box(c, o.x, o.y + 14, 14, 4);
        box(c, o.x + 22, o.y + 14, 14, 4);
        box(c, o.x + 4, o.y + 10, 10, 4);
        box(c, o.x + 22, o.y + 10, 10, 4);
      }
      return;
    }

    if (o.type === "stump") {
      box("#8a5a2b", o.x, o.y + 6, o.w, o.h - 6);
      box("#b07a40", o.x - 2, o.y, o.w + 4, 7);
      box("#5c3a1a", o.x + o.w / 2 - 1, o.y + 12, 2, o.h - 16);
      return;
    }

    const count = o.type === "rocks" ? 2 : 1;
    const each = o.w / count;
    for (let i = 0; i < count; i++) {
      const rx = o.x + i * each;
      box(col("rock"), rx + 1, o.y + 10, each - 2, o.h - 10);
      box(col("rock"), rx + 4, o.y + 3, each - 8, 9);
      box(col("rockLight"), rx + 6, o.y + 5, 5, 3);
    }
  }

  function drawScene() {
    box(col("sky"), 0, 0, W, H);

    if (nightT > 0.01) {
      ctx.globalAlpha = nightT * 0.85;
      for (const s of stars) box("#ffffff", s.x, s.y, 2, 2);
      ctx.globalAlpha = nightT;
      ctx.fillStyle = "#f1f1e6";
      ctx.beginPath();
      ctx.arc(500, 36, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col("sky");
      ctx.beginPath();
      ctx.arc(505, 33, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    for (const c of clouds) {
      box(col("cloud"), c.x + 6, c.y + 6, 34, 8);
      box(col("cloud"), c.x + 12, c.y + 2, 22, 6);
      box(col("cloud"), c.x, c.y + 9, 46, 5);
    }

    box(col("ground"), 0, GROUND, W, 2);
    ctx.globalAlpha = 0.5;
    for (const d of dashes) box(col("ground"), d.x, d.y, d.w, 1);
    ctx.globalAlpha = 1;

    for (const o of obstacles) drawObstacle(o);

    let mode;
    if (phase === "over") mode = "dead";
    else if (phase === "ready") mode = "idle";
    else if (fox.jumping) mode = "jump";
    else if (fox.ducking) mode = "duck";
    else mode = "run";

    const frame = Math.floor(fox.t / 0.09) % 2;
    const y = mode === "duck" ? GROUND - 24 : fox.y;
    drawFox(fox.x, y, mode, frame);
  }

  function drawHud() {
    ctx.textBaseline = "top";
    ctx.textAlign = "right";
    ctx.font = "bold 12px monospace";

    const current = String(Math.floor(score)).padStart(5, "0");
    const best = String(Math.floor(hi)).padStart(5, "0");
    const blink = flash > 0 && Math.floor(flash * 6) % 2 === 1;

    ctx.fillStyle = col("fg");
    if (!blink) ctx.fillText(current, W - 12, 10);
    ctx.globalAlpha = 0.55;
    ctx.fillText("HI " + best, W - 66, 10);
    ctx.globalAlpha = 1;
  }

  function drawOverlay() {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = col("fg");

    if (phase === "ready") {
      ctx.font = "bold 20px monospace";
      ctx.fillText("FOX RUN", W / 2, 50);
      ctx.font = "12px monospace";
      ctx.fillText("Pulsa espacio o toca para empezar", W / 2, 76);
    } else if (phase === "over") {
      ctx.font = "bold 22px monospace";
      ctx.fillText("GAME OVER", W / 2, 50);
      ctx.font = "12px monospace";
      ctx.fillText("Pulsa espacio o toca para reiniciar", W / 2, 76);
    }
  }

  function draw() {
    const s = canvas.width / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    drawScene();
    drawHud();
    drawOverlay();
  }

  function resize() {
    const w = wrap.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = w + "px";
    canvas.style.height = (w * H) / W + "px";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round((w * dpr * H) / W);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    if (!paused) update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      e.preventDefault();
      if (!e.repeat) press();
    } else if (e.code === "ArrowDown" || e.code === "KeyS") {
      e.preventDefault();
      holdDown = true;
    } else if (e.code === "KeyM") {
      toggleMute();
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowDown" || e.code === "KeyS") holdDown = false;
  });

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    press();
  });

  jumpBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    press();
  });

  const duckOn = (e) => {
    e.preventDefault();
    holdDown = true;
  };
  const duckOff = () => {
    holdDown = false;
  };
  duckBtn.addEventListener("pointerdown", duckOn);
  duckBtn.addEventListener("pointerup", duckOff);
  duckBtn.addEventListener("pointerleave", duckOff);
  duckBtn.addEventListener("pointercancel", duckOff);

  muteBtn.addEventListener("click", () => {
    toggleMute();
    muteBtn.blur();
  });

  document.addEventListener("visibilitychange", () => {
    paused = document.hidden;
    last = performance.now();
  });

  window.addEventListener("resize", resize);

  reset();
  resize();
  requestAnimationFrame(frame);
})();
