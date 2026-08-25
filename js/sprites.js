(() => {
  function px(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  const palettes = [
    { hair: "#3d2214", hair2: "#2c1a12", skin: "#d49264", skin2: "#c47a4a", shirt: "#c45c26", shirt2: "#a84c1e", pants: "#4a2a18", shoe: "#2c1a12", accent: "#e8b84a" },
    { hair: "#1a100c", hair2: "#0e0907", skin: "#e0a070", skin2: "#c47a4a", shirt: "#6b1c28", shirt2: "#4a121c", pants: "#3d2a1f", shoe: "#1a100c", accent: "#f5c84c" },
    { hair: "#5a3a28", hair2: "#3d2214", skin: "#c47a4a", skin2: "#8b4a2a", shirt: "#e8b84a", shirt2: "#c49a3a", pants: "#4a3a28", shoe: "#2c1a12", accent: "#fff4c8" },
    { hair: "#2c1a12", hair2: "#1a100c", skin: "#8b4a2a", skin2: "#6b3520", shirt: "#4a6b3a", shirt2: "#3d5a32", pants: "#3d2214", shoe: "#1a100c", accent: "#c45c26" },
  ];

  function shadow(ctx, x, y) {
    px(ctx, x + 2, y + 23, 12, 3, "rgba(44, 26, 18, 0.28)");
  }

  function headDown(ctx, x, y, p) {
    px(ctx, x + 4, y, 8, 2, p.hair2);
    px(ctx, x + 3, y + 1, 10, 4, p.hair);
    px(ctx, x + 4, y + 4, 8, 5, p.skin);
    px(ctx, x + 4, y + 5, 8, 1, p.skin2);
    px(ctx, x + 5, y + 5, 2, 2, "#1a100c");
    px(ctx, x + 9, y + 5, 2, 2, "#1a100c");
    px(ctx, x + 5, y + 7, 1, 1, "#c45c26");
    px(ctx, x + 10, y + 7, 1, 1, "#c45c26");
    px(ctx, x + 7, y + 8, 2, 1, p.skin2);
  }

  function headUp(ctx, x, y, p) {
    px(ctx, x + 3, y, 10, 7, p.hair);
    px(ctx, x + 4, y + 1, 8, 5, p.hair2);
    px(ctx, x + 5, y + 6, 6, 3, p.skin);
  }

  function headSide(ctx, x, y, p) {
    px(ctx, x + 5, y, 8, 3, p.hair);
    px(ctx, x + 4, y + 1, 4, 5, p.hair2);
    px(ctx, x + 5, y + 3, 8, 6, p.skin);
    px(ctx, x + 11, y + 5, 2, 2, "#1a100c");
    px(ctx, x + 13, y + 7, 2, 1, p.skin);
    px(ctx, x + 10, y + 8, 2, 1, "#c45c26");
  }

  function body(ctx, x, y, p, arm) {
    px(ctx, x + 4, y + 9, 8, 7, p.shirt);
    px(ctx, x + 5, y + 10, 6, 2, p.accent);
    px(ctx, x + 4, y + 12, 8, 2, p.shirt2);
    if (arm === "left") {
      px(ctx, x + 2, y + 10, 2, 5, p.skin);
      px(ctx, x + 12, y + 10, 2, 4, p.skin2);
    } else if (arm === "right") {
      px(ctx, x + 12, y + 10, 2, 5, p.skin);
      px(ctx, x + 2, y + 10, 2, 4, p.skin2);
    } else {
      px(ctx, x + 2, y + 10, 2, 4, p.skin);
      px(ctx, x + 12, y + 10, 2, 4, p.skin);
    }
  }

  function legsDown(ctx, x, y, p, frame) {
    const step = frame % 4;
    if (step === 1) {
      px(ctx, x + 4, y + 16, 3, 6, p.pants);
      px(ctx, x + 9, y + 16, 3, 4, p.pants);
      px(ctx, x + 4, y + 21, 4, 2, p.shoe);
      px(ctx, x + 9, y + 19, 4, 2, p.shoe);
    } else if (step === 3) {
      px(ctx, x + 4, y + 16, 3, 4, p.pants);
      px(ctx, x + 9, y + 16, 3, 6, p.pants);
      px(ctx, x + 4, y + 19, 4, 2, p.shoe);
      px(ctx, x + 9, y + 21, 4, 2, p.shoe);
    } else {
      px(ctx, x + 4, y + 16, 3, 6, p.pants);
      px(ctx, x + 9, y + 16, 3, 6, p.pants);
      px(ctx, x + 4, y + 21, 4, 2, p.shoe);
      px(ctx, x + 9, y + 21, 4, 2, p.shoe);
    }
  }

  function legsSide(ctx, x, y, p, frame) {
    const step = frame % 4;
    if (step === 1) {
      px(ctx, x + 5, y + 16, 3, 6, p.pants);
      px(ctx, x + 9, y + 17, 3, 4, p.pants);
      px(ctx, x + 5, y + 21, 5, 2, p.shoe);
    } else if (step === 3) {
      px(ctx, x + 4, y + 17, 3, 4, p.pants);
      px(ctx, x + 8, y + 16, 3, 6, p.pants);
      px(ctx, x + 8, y + 21, 5, 2, p.shoe);
    } else {
      px(ctx, x + 6, y + 16, 4, 6, p.pants);
      px(ctx, x + 6, y + 21, 5, 2, p.shoe);
    }
  }

  function farmer(ctx, x, y, dir, frame, pal) {
    const p = pal || palettes[0];
    const bob = frame === 1 || frame === 3 ? 1 : 0;
    const fx = Math.round(x);
    const fy = Math.round(y) - bob;
    shadow(ctx, fx, Math.round(y));
    if (dir === "up") {
      body(ctx, fx, fy, p, "none");
      legsDown(ctx, fx, fy, p, frame);
      headUp(ctx, fx, fy, p);
      return;
    }
    if (dir === "left" || dir === "right") {
      ctx.save();
      if (dir === "left") {
        ctx.translate(fx + 16, fy);
        ctx.scale(-1, 1);
        headSide(ctx, 0, 0, p);
        body(ctx, 0, 0, p, frame === 1 ? "right" : frame === 3 ? "left" : "right");
        legsSide(ctx, 0, 0, p, frame);
      } else {
        headSide(ctx, fx, fy, p);
        body(ctx, fx, fy, p, frame === 1 ? "right" : frame === 3 ? "left" : "right");
        legsSide(ctx, fx, fy, p, frame);
      }
      ctx.restore();
      return;
    }
    headDown(ctx, fx, fy, p);
    body(ctx, fx, fy, p, frame === 1 ? "left" : frame === 3 ? "right" : "none");
    legsDown(ctx, fx, fy, p, frame);
  }

  function treeSmall(ctx, x, y) {
    tree(ctx, x - 6, y - 8);
  }

  function tree(ctx, x, y) {
    px(ctx, x + 14, y + 30, 5, 12, "#5a381c");
    px(ctx, x + 15, y + 28, 3, 14, "#6b4423");
    px(ctx, x + 16, y + 32, 1, 6, "#3d2414");
    px(ctx, x + 4, y + 10, 24, 16, "#2f5528");
    px(ctx, x + 6, y + 6, 20, 16, "#3d6b32");
    px(ctx, x + 8, y + 3, 16, 14, "#4a7a3a");
    px(ctx, x + 10, y + 1, 12, 8, "#6bb85a");
    px(ctx, x + 12, y + 8, 4, 3, "#fff4c8");
    px(ctx, x + 18, y + 14, 3, 2, "#2f5528");
  }

  function bush(ctx, x, y, grapes) {
    px(ctx, x + 1, y + 7, 16, 8, "#2f5528");
    px(ctx, x + 3, y + 5, 12, 8, "#3d6b32");
    px(ctx, x + 5, y + 3, 8, 6, "#5a8f48");
    if (grapes) {
      px(ctx, x + 6, y + 8, 3, 3, "#6b1c28");
      px(ctx, x + 9, y + 9, 3, 3, "#8b1e2d");
      px(ctx, x + 7, y + 11, 3, 3, "#5a1520");
      px(ctx, x + 10, y + 7, 2, 2, "#c45c26");
    }
  }

  function flower(ctx, x, y) {
    px(ctx, x + 2, y + 5, 1, 4, "#3d6b32");
    px(ctx, x + 1, y + 3, 3, 2, "#c45c26");
    px(ctx, x + 2, y + 2, 1, 1, "#e8b84a");
  }

  function chicken(ctx, x, y, frame) {
    const bob = frame % 2;
    px(ctx, x + 1, y + 4 + bob, 7, 4, "#fff8ea");
    px(ctx, x + 2, y + 3 + bob, 5, 2, "#fff8ea");
    px(ctx, x + 8, y + 5 + bob, 3, 2, "#c45c26");
    px(ctx, x + 3, y + 4 + bob, 1, 1, "#2c1a12");
    px(ctx, x + 2, y + 8, 2, 2, "#c45c26");
    px(ctx, x + 6, y + 8, 2, 2, "#c45c26");
    px(ctx, x + 4, y + 2 + bob, 2, 1, "#8b1e2d");
  }

  function barrel(ctx, x, y) {
    px(ctx, x, y + 3, 11, 12, "#6b3520");
    px(ctx, x + 1, y + 1, 9, 15, "#a85a32");
    px(ctx, x + 2, y + 2, 7, 2, "#d49264");
    px(ctx, x + 1, y + 6, 9, 2, "#6b3520");
    px(ctx, x + 1, y + 11, 9, 2, "#6b3520");
    px(ctx, x + 4, y + 4, 3, 2, "#6b1c28");
  }

  function tileGrass(ctx, x, y, variant) {
    px(ctx, x, y, 16, 16, variant ? "#5aad4c" : "#4d9a42");
    px(ctx, x + (variant ? 3 : 11), y + (variant ? 4 : 9), 1, 3, "#7ec86a");
    px(ctx, x + (variant ? 9 : 2), y + (variant ? 12 : 3), 1, 2, "#3d7034");
    if (variant) px(ctx, x + 6, y + 7, 1, 1, "#e8b84a");
  }

  function tilePath(ctx, x, y, variant) {
    px(ctx, x, y, 16, 16, variant ? "#d4b57a" : "#e0c48c");
    px(ctx, x + 1, y + 1, 14, 14, variant ? "#c9a66a" : "#d4b57a");
    px(ctx, x + 3, y + 5, 2, 1, "#b08c52");
    px(ctx, x + 10, y + 11, 2, 1, "#f0e0b8");
  }

  function tileRoad(ctx, x, y, variant) {
    px(ctx, x, y, 16, 16, variant ? "#5c5854" : "#4a4642");
    px(ctx, x, y, 16, 2, "#3d3a36");
    px(ctx, x, y + 14, 16, 2, "#3d3a36");
    px(ctx, x + 3, y + 7, 4, 2, "#e8b84a");
    px(ctx, x + 10, y + 7, 3, 2, "#e8b84a");
  }

  function tileSand(ctx, x, y, variant) {
    px(ctx, x, y, 16, 16, variant ? "#ecd8b0" : "#e0c894");
    px(ctx, x + 4, y + 6, 1, 1, "#c4a86a");
    px(ctx, x + 11, y + 12, 2, 1, "#fff4c8");
    px(ctx, x + 7, y + 3, 1, 1, "#d4b57a");
  }

  function tileWater(ctx, x, y, variant) {
    px(ctx, x, y, 16, 16, variant ? "#4a9cc4" : "#3d88b0");
    px(ctx, x + 2, y + 3, 7, 1, "#8ed4ec");
    px(ctx, x + 7, y + 9, 6, 1, "#7ec8e3");
    px(ctx, x + 1, y + 13, 4, 1, "#2f6a8c");
  }

  function banner(ctx, x, y) {
    px(ctx, x, y, 2, 22, "#5a381c");
    px(ctx, x + 30, y, 2, 22, "#5a381c");
    px(ctx, x + 2, y + 2, 28, 14, "#6b1c28");
    px(ctx, x + 4, y + 4, 24, 10, "#c45c26");
    px(ctx, x + 6, y + 6, 20, 6, "#e8b84a");
    px(ctx, x + 8, y + 7, 2, 4, "#6b1c28");
    px(ctx, x + 11, y + 7, 2, 4, "#6b1c28");
    px(ctx, x + 15, y + 7, 2, 4, "#6b1c28");
    px(ctx, x + 20, y + 7, 4, 4, "#6b1c28");
  }

  function chapel(ctx, x, y) {
    px(ctx, x + 12, y, 3, 8, "#6b1c28");
    px(ctx, x + 11, y + 1, 5, 2, "#e8b84a");
    px(ctx, x + 2, y + 10, 28, 5, "#8b1e2d");
    px(ctx, x + 4, y + 14, 24, 20, "#fff4e8");
    px(ctx, x + 6, y + 16, 6, 6, "#7ec8e3");
    px(ctx, x + 20, y + 16, 6, 6, "#7ec8e3");
    px(ctx, x + 7, y + 17, 4, 4, "#fff8ea");
    px(ctx, x + 13, y + 24, 6, 10, "#6b4423");
    px(ctx, x + 15, y + 26, 2, 3, "#e8b84a");
  }

  function bus(ctx, x, y, wheel, doorOpen) {
    const fx = Math.round(x);
    const fy = Math.round(y);
    const spin = wheel % 2;
    px(ctx, fx + 6, fy + 30, 22, 4, "rgba(44,26,18,0.28)");
    px(ctx, fx + 48, fy + 30, 22, 4, "rgba(44,26,18,0.28)");
    px(ctx, fx + 4, fy + 8, 74, 6, "#4a121c");
    px(ctx, fx + 6, fy + 6, 70, 4, "#8b1e2d");
    px(ctx, fx + 6, fy + 10, 70, 18, "#c45c26");
    px(ctx, fx + 6, fy + 16, 70, 3, "#e8b84a");
    px(ctx, fx + 72, fy + 12, 10, 14, "#6b1c28");
    px(ctx, fx + 74, fy + 14, 7, 6, "#ffe9a8");
    px(ctx, fx + 76, fy + 16, 2, 2, "#fff");
    if (doorOpen) {
      px(ctx, fx + 10, fy + 12, 9, 16, "#1a100c");
      px(ctx, fx + 12, fy + 14, 5, 10, "#3d2214");
    } else {
      px(ctx, fx + 10, fy + 12, 9, 16, "#8b1e2d");
      px(ctx, fx + 12, fy + 14, 5, 10, "#4a2218");
      px(ctx, fx + 16, fy + 18, 1, 4, "#e8b84a");
    }
    px(ctx, fx + 22, fy + 12, 11, 7, "#9ad4ec");
    px(ctx, fx + 36, fy + 12, 11, 7, "#9ad4ec");
    px(ctx, fx + 50, fy + 12, 11, 7, "#9ad4ec");
    px(ctx, fx + 24, fy + 14, 7, 3, "#fff8ea");
    px(ctx, fx + 28, fy + 20, 3, 3, "#fff8ea");
    px(ctx, fx + 34, fy + 20, 3, 3, "#fff8ea");
    px(ctx, fx + 42, fy + 20, 3, 3, "#fff8ea");
    px(ctx, fx + 12, fy + 26, 12, 8, "#1a100c");
    px(ctx, fx + 54, fy + 26, 12, 8, "#1a100c");
    px(ctx, fx + 14 + spin, fy + 28, 8, 5, "#4a4a4a");
    px(ctx, fx + 56 + spin, fy + 28, 8, 5, "#4a4a4a");
    px(ctx, fx + 16 + spin, fy + 29, 4, 3, "#ead9b6");
    px(ctx, fx + 58 + spin, fy + 29, 4, 3, "#ead9b6");
  }

  function cloud(ctx, x, y) {
    px(ctx, x + 6, y + 4, 18, 6, "#fff8ea");
    px(ctx, x + 2, y + 6, 26, 5, "#fff4dc");
    px(ctx, x + 10, y + 2, 10, 4, "#ffffff");
  }

  function hill(ctx, x, y, w, color) {
    px(ctx, x, y, w, 40, color);
    px(ctx, x + 8, y - 8, Math.max(12, w - 20), 10, color);
  }

  function fence(ctx, x, y) {
    px(ctx, x, y + 4, 16, 2, "#8b5a32");
    px(ctx, x + 2, y, 2, 10, "#6b4423");
    px(ctx, x + 12, y, 2, 10, "#6b4423");
  }

  function dust(ctx, x, y, frame) {
    const n = frame % 3;
    px(ctx, x + n, y, 2, 2, "rgba(196, 154, 90, 0.45)");
    px(ctx, x + 3 - n, y + 2, 1, 1, "rgba(196, 154, 90, 0.3)");
  }

  window.DNJSprites = {
    palettes,
    farmer,
    tree,
    treeSmall,
    bush,
    flower,
    chicken,
    barrel,
    tileGrass,
    tilePath,
    tileRoad,
    tileSand,
    tileWater,
    banner,
    chapel,
    bus,
    cloud,
    hill,
    fence,
    dust,
  };
})();
