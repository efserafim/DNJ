(() => {
  const root = document.getElementById("journey");
  const canvas = document.getElementById("journey-canvas");
  const caption = document.getElementById("journey-caption");
  const skip = document.getElementById("btn-skip");
  const S = window.DNJSprites;
  const captions = [
    "Você caminha até o ônibus",
    "Embarque! A viagem começa",
    "Rumo à Orla do Marine",
    "Chegamos. O DNJ te espera",
  ];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TILE = 16;
  const COLS = 78;
  const ROWS = 16;
  const HERO_Y = 120;
  const BUS_Y = 110;
  const START_BUS = 17 * TILE;
  const END_BUS = 54 * TILE;
  const DURATION = 12500;

  let raf = 0;
  let timers = [];
  let playing = false;
  let closing = false;
  let onDone = null;
  let startAt = 0;
  let camX = 0;
  let camY = 0;

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function story(t) {
    const doorX = (busX) => busX + 10;
    if (t < 0.28) {
      const p = easeInOut(t / 0.28);
      const x = lerp(3 * TILE, doorX(START_BUS) - 2, p);
      return { heroX: x, heroY: HERO_Y, dir: "right", walking: true, showHero: true, busX: START_BUS, doorOpen: true, moving: false, follow: "hero" };
    }
    if (t < 0.36) {
      const p = (t - 0.28) / 0.08;
      const x = lerp(doorX(START_BUS) - 2, doorX(START_BUS) + 8, p);
      return { heroX: x, heroY: HERO_Y, dir: "right", walking: p < 0.7, showHero: p < 0.85, busX: START_BUS, doorOpen: p < 0.9, moving: false, follow: "hero" };
    }
    if (t < 0.78) {
      const p = easeInOut((t - 0.36) / 0.42);
      const busX = lerp(START_BUS, END_BUS, p);
      return { heroX: doorX(busX), heroY: HERO_Y, dir: "right", walking: false, showHero: false, busX, doorOpen: false, moving: true, follow: "bus" };
    }
    const p = easeInOut((t - 0.78) / 0.22);
    const x = lerp(END_BUS + 78, END_BUS + 118, p);
    return { heroX: x, heroY: HERO_Y, dir: "right", walking: p < 0.92, showHero: true, busX: END_BUS, doorOpen: true, moving: false, follow: "hero" };
  }

  function tileKind(c, r) {
    if (r < 6) return "sky";
    if (c >= 48 && r >= 12) return "water";
    if (c >= 46 && r >= 11 && r < 12) return "sand";
    if (c >= 50 && r >= 8 && r <= 10) return "sand";
    if (r === 9 || r === 10) return "road";
    if (r === 8 && c < 48) return "path";
    return "grass";
  }

  function setCaption(text) {
    if (!caption) return;
    caption.style.animation = "none";
    caption.textContent = text;
    caption.offsetHeight;
    caption.style.animation = "";
  }

  function clearTimers() {
    timers.forEach((id) => clearTimeout(id));
    timers = [];
    cancelAnimationFrame(raf);
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  }

  function drawSky(ctx, w, h, time, nearSea) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (nearSea) {
      g.addColorStop(0, "#7eb8d8");
      g.addColorStop(0.42, "#c8e4f0");
      g.addColorStop(1, "#f6ead2");
    } else {
      g.addColorStop(0, "#8ec8e8");
      g.addColorStop(0.38, "#d4ecf6");
      g.addColorStop(1, "#f8eedc");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const sunX = Math.floor(w * 0.78);
    const sunY = Math.floor(h * 0.12);
    ctx.fillStyle = "rgba(255, 236, 170, 0.45)";
    ctx.fillRect(sunX - 18, sunY - 18, 52, 52);
    ctx.fillStyle = "#ffe9a8";
    ctx.fillRect(sunX, sunY, 22, 22);
    ctx.fillStyle = "#fff8ea";
    ctx.fillRect(sunX + 4, sunY + 4, 10, 10);
    const drift = (time / 40) % (w + 80);
    S.cloud(ctx, Math.floor(w * 0.08 - drift * 0.04), Math.floor(h * 0.08));
    S.cloud(ctx, Math.floor(w * 0.42 + drift * 0.03), Math.floor(h * 0.14));
    S.cloud(ctx, Math.floor(w * 0.7 - drift * 0.02), Math.floor(h * 0.1));
  }

  function drawWorld(ctx, time, st) {
    const w = canvas.width;
    const h = canvas.height;
    const scale = Math.max(4, Math.min(6, Math.floor(Math.min(w / 170, h / 120))));
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawSky(ctx, w, h, time, st.busX > 40 * TILE);

    const followX = st.follow === "bus" ? st.busX + 42 : st.heroX;
    const targetX = w / 2 - followX * scale;
    const targetY = h / 2 - (HERO_Y + 6) * scale;
    camX += (targetX - camX) * 0.1;
    camY += (targetY - camY) * 0.1;
    ctx.setTransform(scale, 0, 0, scale, Math.round(camX), Math.round(camY));
    ctx.imageSmoothingEnabled = false;

    S.hill(ctx, -20, 72, 420, "#3d7a48");
    S.hill(ctx, 200, 80, 380, "#4a8a52");
    S.hill(ctx, 480, 76, 420, "#3d7a48");

    const left = clamp(Math.floor((-camX) / scale / TILE) - 1, 0, COLS);
    const top = clamp(Math.floor((-camY) / scale / TILE) - 1, 0, ROWS);
    const right = clamp(left + Math.ceil(w / scale / TILE) + 3, 0, COLS);
    const bottom = clamp(top + Math.ceil(h / scale / TILE) + 3, 0, ROWS);

    for (let r = top; r < bottom; r += 1) {
      for (let c = left; c < right; c += 1) {
        const x = c * TILE;
        const y = r * TILE;
        const kind = tileKind(c, r);
        if (kind === "sky") continue;
        if (kind === "road") S.tileRoad(ctx, x, y, (c + r) % 2);
        else if (kind === "sand") S.tileSand(ctx, x, y, (c + r) % 2);
        else if (kind === "water") S.tileWater(ctx, x, y, (c + Math.floor(time / 380)) % 2);
        else if (kind === "path") S.tilePath(ctx, x, y, (c + r) % 2);
        else S.tileGrass(ctx, x, y, (c * 3 + r * 7) % 2);
      }
    }

    const props = [];
    props.push({ y: 7 * TILE + 34, draw: () => S.chapel(ctx, 2 * TILE, 5.1 * TILE) });
    for (let c = 8; c < 46; c += 5) {
      props.push({ y: 7 * TILE + 40, draw: () => S.tree(ctx, c * TILE - 4, 4.15 * TILE + (c % 2) * 3) });
    }
    for (let c = 6; c < 46; c += 2) {
      props.push({ y: 8 * TILE + 2, draw: () => S.fence(ctx, c * TILE, 7.55 * TILE) });
    }
    props.push({ y: 8 * TILE, draw: () => S.bush(ctx, 10 * TILE, 7 * TILE, true) });
    props.push({ y: 8 * TILE, draw: () => S.bush(ctx, 14 * TILE, 7.15 * TILE, false) });
    props.push({ y: 8 * TILE, draw: () => S.bush(ctx, 22 * TILE, 7.05 * TILE, true) });
    [9, 16, 24, 31, 38].forEach((c) => {
      props.push({ y: 8 * TILE, draw: () => S.flower(ctx, c * TILE + 4, 7.7 * TILE) });
    });
    props.push({ y: 8 * TILE, draw: () => S.banner(ctx, 58 * TILE, 4.8 * TILE) });
    props.push({ y: 8 * TILE, draw: () => S.barrel(ctx, 56 * TILE, 7.25 * TILE) });
    props.push({ y: 8 * TILE, draw: () => S.barrel(ctx, 63 * TILE, 7.35 * TILE) });
    const chick = Math.floor(time / 220);
    props.push({ y: 8 * TILE, draw: () => S.chicken(ctx, 18 * TILE + (chick % 8), 7.6 * TILE, chick) });
    props.push({ y: 8 * TILE, draw: () => S.chicken(ctx, 27 * TILE, 7.7 * TILE, chick + 1) });

    const actors = [];
    const waiters = [
      { x: 13 * TILE, pal: 1 },
      { x: 15 * TILE, pal: 2 },
      { x: 12.4 * TILE, pal: 3 },
    ];
    waiters.forEach((p, i) => {
      const idle = Math.floor(time / 420 + i) % 2 === 0 ? 0 : 2;
      if (st.busX < START_BUS + 8) {
        actors.push({ y: HERO_Y + 24, draw: () => S.farmer(ctx, p.x, HERO_Y + 2, "right", idle, S.palettes[p.pal]) });
      }
    });
    const crowd = [
      { x: 57 * TILE, pal: 1, dir: "left" },
      { x: 59 * TILE, pal: 2, dir: "down" },
      { x: 61 * TILE, pal: 3, dir: "left" },
      { x: 63 * TILE, pal: 0, dir: "down" },
      { x: 60 * TILE, pal: 1, dir: "right" },
    ];
    crowd.forEach((p, i) => {
      const idle = Math.floor(time / 480 + i) % 2 === 0 ? 0 : 2;
      actors.push({ y: HERO_Y + 22, draw: () => S.farmer(ctx, p.x, HERO_Y - 2, p.dir, idle, S.palettes[p.pal]) });
    });

    const wheel = st.moving ? Math.floor(time / 70) : 0;
    actors.push({ y: BUS_Y + 36, draw: () => S.bus(ctx, st.busX, BUS_Y, wheel, st.doorOpen) });

    if (st.showHero) {
      const frame = st.walking ? 1 + Math.floor(time / 105) % 3 : 0;
      actors.push({
        y: st.heroY + 24,
        draw: () => S.farmer(ctx, Math.round(st.heroX), Math.round(st.heroY), st.dir, frame, S.palettes[0]),
      });
      if (st.walking) {
        actors.push({
          y: st.heroY + 26,
          draw: () => S.dust(ctx, Math.round(st.heroX) - 2, Math.round(st.heroY) + 22, Math.floor(time / 90)),
        });
      }
    }

    [...props, ...actors].sort((a, b) => a.y - b.y).forEach((item) => item.draw());
  }

  function tick(now) {
    if (!playing) return;
    const ctx = canvas.getContext("2d");
    const t = Math.min((now - startAt) / DURATION, 1);
    drawWorld(ctx, now, story(t));
    if (playing && !closing) raf = requestAnimationFrame(tick);
  }

  function finish() {
    if (closing) return;
    closing = true;
    playing = false;
    clearTimers();
    document.body.style.overflow = "";
    root.classList.add("is-exiting");
    timers.push(setTimeout(() => {
      root.hidden = true;
      root.className = "journey";
      onDone?.();
    }, 500));
  }

  function play(done) {
    onDone = done;
    closing = false;
    playing = true;
    clearTimers();
    document.body.style.overflow = "hidden";
    root.hidden = false;
    root.className = "journey is-playing";
    setCaption(captions[0]);
    resize();
    camX = canvas.width / 2 - 80;
    camY = canvas.height / 2 - 200;
    startAt = performance.now();

    if (reduced) {
      finish();
      return;
    }

    raf = requestAnimationFrame(tick);
    timers.push(setTimeout(() => setCaption(captions[1]), 3400));
    timers.push(setTimeout(() => setCaption(captions[2]), 5000));
    timers.push(setTimeout(() => setCaption(captions[3]), 9600));
    timers.push(setTimeout(finish, DURATION + 700));
  }

  skip?.addEventListener("click", finish);
  window.addEventListener("resize", () => { if (playing) resize(); });
  window.DNJJourney = { play };
})();
