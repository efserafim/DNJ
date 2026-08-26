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
  const camLoading = document.getElementById("cam-loading");

  let scanner = null;
  let cameras = [];
  let cameraIndex = 0;
  let torchOn = false;
  let torchTimer = 0;
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

  function extractCode(text) {
    const raw = String(text || "").trim();
    if (!raw) return "";
    const match = raw.toUpperCase().match(/DNJ26-[A-Z0-9]+/);
    return match ? match[0] : raw.toUpperCase();
  }

  async function lookup(code) {
    const value = extractCode(code);
    if (!value || busy) return;
    busy = true;
    found.hidden = false;
    found.className = "checkin-result";
    found.innerHTML = `<p class="admin-kicker">Lendo</p><p>Código ${value}…</p>`;
    try {
      const row = await window.DNJApi.adminLookup(adminEmail, password, value);
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
    const code = extractCode(text);
    if (!code) return;
    const now = Date.now();
    if (code === lastCode && now - lastAt < 2500) return;
    lastCode = code;
    lastAt = now;
    lookup(code);
  }

  async function stopScanner() {
    if (!scanner) return;
    const old = scanner;
    scanner = null;
    try { await old.stop(); } catch (_) {}
    try { old.clear(); } catch (_) {}
  }

  function waitFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  async function waitForLibrary() {
    if (window.Html5Qrcode) return true;
    for (let i = 0; i < 40; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (window.Html5Qrcode) return true;
    }
    return false;
  }

  function scanConfig() {
    return {
      fps: 16,
      qrbox: (width, height) => {
        const min = Math.min(width, height);
        const size = Math.max(180, Math.floor((min || 240) * 0.72));
        const edge = Math.min(size, min || size);
        return { width: edge, height: edge };
      },
      disableFlip: false,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    };
  }

  function armVideo() {
    const video = document.querySelector("#reader video");
    if (!video) return;
    video.setAttribute("playsinline", "true");
    video.setAttribute("muted", "true");
    video.muted = true;
    video.playsInline = true;
  }

  // A capacidade de lanterna só aparece alguns instantes depois do vídeo ficar ativo.
  function watchTorchSupport() {
    clearInterval(torchTimer);
    let tries = 0;
    torchTimer = setInterval(() => {
      tries += 1;
      if (torchSupported()) {
        torchBtn.hidden = false;
        clearInterval(torchTimer);
      } else if (tries >= 16) {
        clearInterval(torchTimer);
      }
    }, 200);
  }

  // Depois da permissão concedida, listar câmeras não custa outro stream.
  async function listCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      cameras = devices.filter((d) => d.kind === "videoinput").map((d) => ({ id: d.deviceId, label: d.label }));
    } catch (_) {
      cameras = [];
    }
    switchBtn.hidden = cameras.length < 2;
    const activeId = videoTrack()?.getSettings?.().deviceId;
    const index = cameras.findIndex((c) => c.id && c.id === activeId);
    if (index >= 0) cameraIndex = index;
  }

  async function startCamera(preferredId) {
    if (!(await waitForLibrary())) {
      camLoading.hidden = true;
      camError.hidden = false;
      camError.textContent = "Não foi possível carregar o leitor de QR.";
      return;
    }
    camError.hidden = true;
    camLoading.hidden = false;
    torchOn = false;
    torchBtn.hidden = true;
    torchBtn.classList.remove("is-on");
    torchLabel.textContent = "Lanterna";

    await stopScanner();
    await waitFrame();

    const reader = document.getElementById("reader");
    if (reader) reader.replaceChildren();
    scanner = new window.Html5Qrcode("reader", { verbose: false });
    const config = scanConfig();

    const tryStart = (camera) => scanner.start(camera, config, onScan);

    try {
      if (preferredId) {
        await tryStart(preferredId);
      } else {
        try {
          await tryStart({ facingMode: "environment" });
        } catch (_) {
          const list = await window.Html5Qrcode.getCameras();
          const back = [...list].reverse().find((c) => /back|rear|traseira|environment|posterior/i.test(c.label || ""))
            || list.find((c) => c.id)
            || list[list.length - 1];
          if (!back?.id) throw new Error("sem camera");
          await tryStart(back.id);
        }
      }
    } catch (_) {
      camLoading.hidden = true;
      camError.hidden = false;
      camError.textContent = "Permita o acesso à câmera para ler o QR Code. Você ainda pode digitar o código abaixo.";
      return;
    }
    camLoading.hidden = true;
    armVideo();
    watchTorchSupport();
    listCameras();
  }

  function openScan() {
    document.getElementById("gate").hidden = true;
    document.getElementById("scan").hidden = false;
    const warn = document.getElementById("pwd-warn");
    if (warn) warn.hidden = String(password || "").trim().toLowerCase() !== "geracao2026";
    startCamera();
  }

  function closeScan() {
    clearInterval(torchTimer);
    stopScanner();
    document.getElementById("scan").hidden = true;
    document.getElementById("gate").hidden = false;
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
    // A câmera não depende da sessão: abre já e valida o login em paralelo.
    openScan();
    window.DNJApi.login(adminEmail, password).catch(() => {
      sessionStorage.removeItem(KEY);
      sessionStorage.removeItem(EMAIL_KEY);
      password = "";
      adminEmail = "";
      closeScan();
    });
  }
})();
