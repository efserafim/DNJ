(() => {
  const KEY = "dnj2026_admin";
  const EMAIL_KEY = "dnj2026_admin_email";
  let password = sessionStorage.getItem(KEY) || "";
  let adminEmail = sessionStorage.getItem(EMAIL_KEY) || "";
  const found = document.getElementById("found");
  const torchBtn = document.getElementById("btn-torch");
  const torchLabel = document.getElementById("torch-label");
  const switchBtn = document.getElementById("btn-switch");
  const camError = document.getElementById("cam-error");

  let scanner = null;
  let cameras = [];
  let cameraIndex = 0;
  let torchOn = false;
  let lastCode = "";
  let lastAt = 0;
  let busy = false;

  function videoTrack() {
    const video = document.querySelector("#reader video");
    return video?.srcObject?.getVideoTracks?.()[0] || null;
  }

  function torchSupported() {
    try {
      const caps = videoTrack()?.getCapabilities?.() || {};
      return Boolean(caps.torch);
    } catch (_) {
      return false;
    }
  }

  async function setTorch(on) {
    const track = videoTrack();
    if (!track) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: on }] });
      torchOn = on;
      torchBtn.classList.toggle("is-on", on);
      torchLabel.textContent = on ? "Lanterna ligada" : "Lanterna";
      return true;
    } catch (_) {
      return false;
    }
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 880;
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (_) {}
  }

  function showPerson(row, extra) {
    found.hidden = false;
    found.className = `checkin-result ${extra.ok ? "is-ok" : extra.warn ? "is-warn" : ""}`;
    found.innerHTML = `
      <p class="admin-kicker">${extra.title}</p>
      <h2>${row.nome_completo}</h2>
      <p>Idade: ${row.idade || "—"} anos</p>
      <p>Ônibus: ${row.onibus_nome || "—"} · Assento ${row.assento || "—"}</p>
      <p>Código: <b>${row.codigo_inscricao}</b></p>
      ${extra.body || ""}
      ${extra.canConfirm ? `<button class="btn-cta" id="btn-confirm" type="button"><span class="btn-cta-fill"></span><span class="btn-cta-label">CONFIRMAR PRESENÇA</span></button>` : ""}
    `;
    const btn = document.getElementById("btn-confirm");
    if (btn) btn.onclick = () => confirm(row.codigo_inscricao);
  }

  function showError(message) {
    found.hidden = false;
    found.className = "checkin-result is-warn";
    found.innerHTML = `<p class="admin-kicker">Não encontrado</p><p>${message}</p>`;
  }

  async function lookup(code) {
    if (busy) return;
    busy = true;
    try {
      const row = await window.DNJApi.adminLookup(adminEmail, password, code);
      if (row.presente) {
        showPerson(row, { title: "CHECK-IN JÁ REALIZADO", body: "<p>Esta inscrição já teve presença registrada.</p>", canConfirm: false, warn: true });
        return;
      }
      showPerson(row, { title: "INSCRIÇÃO ENCONTRADA", canConfirm: true, ok: true });
    } catch (_) {
      showError("QR ou código não encontrado. Confira o ingresso.");
    } finally {
      busy = false;
    }
  }

  async function confirm(code) {
    if (busy) return;
    busy = true;
    try {
      const r = await window.DNJApi.checkin(adminEmail, password, code);
      const row = r.inscricao;
      if (r.already) {
        const when = r.checkin?.realizado_em ? new Date(r.checkin.realizado_em).toLocaleString("pt-BR") : "";
        showPerson(row, { title: "CHECK-IN JÁ REALIZADO", body: `<p>${when}</p>`, canConfirm: false, warn: true });
        return;
      }
      beep();
      if (navigator.vibrate) navigator.vibrate(80);
      showPerson(row, { title: "✓ CHECK-IN REALIZADO", body: "<p>Presença registrada com data e hora.</p>", canConfirm: false, ok: true });
    } catch (_) {
      showError("Não foi possível registrar o check-in agora.");
    } finally {
      busy = false;
    }
  }

  function onScan(text) {
    const code = String(text || "").trim().toUpperCase();
    if (!code) return;
    const now = Date.now();
    if (code === lastCode && now - lastAt < 4000) return;
    lastCode = code;
    lastAt = now;
    lookup(code);
  }

  async function stopScanner() {
    if (!scanner) return;
    try { await scanner.stop(); } catch (_) {}
    try { scanner.clear(); } catch (_) {}
  }

  async function startCamera(preferredId) {
    if (!window.Html5Qrcode) {
      camError.hidden = false;
      camError.textContent = "Não foi possível carregar o leitor de QR.";
      return;
    }
    camError.hidden = true;
    torchOn = false;
    torchBtn.hidden = true;
    torchBtn.classList.remove("is-on");
    torchLabel.textContent = "Lanterna";

    await stopScanner();
    scanner = new window.Html5Qrcode("reader", { verbose: false });

    const config = {
      fps: 12,
      qrbox: (w, h) => {
        const edge = Math.floor(Math.min(w, h) * 0.7);
        return { width: edge, height: edge };
      },
      aspectRatio: 1.333,
      disableFlip: false,
      videoConstraints: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    };

    try {
      cameras = await window.Html5Qrcode.getCameras();
    } catch (_) {
      cameras = [];
    }
    switchBtn.hidden = cameras.length < 2;

    const back = cameras.find((c) => /back|rear|traseira|environment/i.test(c.label || ""));
    const startId = preferredId || back?.id || cameras[cameras.length - 1]?.id;

    try {
      if (startId) await scanner.start(startId, config, onScan);
      else await scanner.start({ facingMode: "environment" }, config, onScan);
      setTimeout(() => {
        if (torchSupported()) torchBtn.hidden = false;
      }, 400);
    } catch (_) {
      try {
        await scanner.start({ facingMode: "environment" }, config, onScan);
        setTimeout(() => {
          if (torchSupported()) torchBtn.hidden = false;
        }, 400);
      } catch (err) {
        camError.hidden = false;
        camError.textContent = "Permita o acesso à câmera para ler o QR Code. Você ainda pode digitar o código abaixo.";
      }
    }
  }

  function openScan() {
    document.getElementById("gate").hidden = true;
    document.getElementById("scan").hidden = false;
    startCamera();
  }

  torchBtn.addEventListener("click", async () => {
    if (torchBtn.hidden) return;
    const ok = await setTorch(!torchOn);
    if (!ok) {
      torchBtn.hidden = true;
      camError.hidden = false;
      camError.textContent = "A lanterna não está disponível neste aparelho ou navegador.";
    }
  });

  switchBtn.addEventListener("click", async () => {
    if (cameras.length < 2) return;
    cameraIndex = (cameraIndex + 1) % cameras.length;
    await setTorch(false);
    startCamera(cameras[cameraIndex].id);
  });

  document.getElementById("gate-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const email = e.target.email.value.trim().toLowerCase();
      await window.DNJApi.login(email, e.target.password.value);
      password = e.target.password.value;
      adminEmail = email;
      sessionStorage.setItem(KEY, password);
      sessionStorage.setItem(EMAIL_KEY, adminEmail);
      openScan();
    } catch (_) {
      document.getElementById("gate-error").hidden = false;
      document.getElementById("gate-error").textContent = "E-mail ou senha incorretos.";
    }
  });

  document.getElementById("manual").addEventListener("submit", (e) => {
    e.preventDefault();
    lookup(e.target.codigo.value.trim().toUpperCase());
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) setTorch(false);
  });

  if (password && adminEmail) {
    window.DNJApi.login(adminEmail, password).then(openScan).catch(() => {
      sessionStorage.removeItem(KEY);
      sessionStorage.removeItem(EMAIL_KEY);
    });
  }
})();
