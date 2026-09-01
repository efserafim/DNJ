(() => {
  const ambient = document.getElementById("ambient-canvas");
  if (!ambient) return;

  let width = 0;
  let height = 0;
  const bits = [];

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    ambient.width = width;
    ambient.height = height;
    const ctx = ambient.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }

  const ctx = resize();

  function spawn(count) {
    for (let i = 0; i < count; i += 1) {
      bits.push({
        x: Math.random() * width,
        y: Math.random() * height,
        s: 2 + Math.floor(Math.random() * 3),
        v: 0.12 + Math.random() * 0.28,
        sway: Math.random() * Math.PI * 2,
        wine: Math.random() > 0.7,
        tw: Math.random(),
      });
    }
  }
  spawn(28);

  function loop(now) {
    ctx.clearRect(0, 0, width, height);
    bits.forEach((p) => {
      p.y -= p.v;
      p.x += Math.sin((now / 900) + p.sway) * 0.15;
      if (p.y < -8) {
        p.y = height + 6;
        p.x = Math.random() * width;
      }
      const pulse = 0.18 + Math.abs(Math.sin(now / 700 + p.tw * 6)) * 0.22;
      ctx.globalAlpha = pulse;
      const x = Math.floor(p.x);
      const y = Math.floor(p.y);
      if (p.wine) {
        ctx.fillStyle = "#8b1e2d";
        ctx.fillRect(x, y, 2, 3);
        ctx.fillRect(x - 1, y + 1, 4, 2);
        ctx.fillStyle = "#c45c26";
        ctx.fillRect(x, y + 1, 2, 1);
      } else {
        ctx.fillStyle = "#e8b84a";
        ctx.fillRect(x, y, p.s, 1);
        ctx.fillRect(x + Math.floor(p.s / 2), y - 1, 1, p.s + 1);
        ctx.fillStyle = "#fff4c8";
        ctx.fillRect(x + 1, y, 1, 1);
      }
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(loop);
  }

  window.addEventListener("resize", resize);
  window.DNJParticles = {
    startJourney() {},
    stopJourney() {},
  };

  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    requestAnimationFrame(loop);
  }
})();
