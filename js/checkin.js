(() => {
  const KEY = "dnj2026_admin";
  let password = sessionStorage.getItem(KEY) || "";
  const found = document.getElementById("found");
  let lastCode = "";

  function showPerson(row, extra) {
    found.hidden = false;
    found.innerHTML = `
      <p class="admin-kicker">${extra.title}</p>
      <h2>${row.nome_completo}</h2>
      <p>Idade: ${row.idade || "—"} anos</p>
      <p>Ônibus: ${row.onibus_nome || "—"}</p>
      <p>Código: <b>${row.codigo_inscricao}</b></p>
      ${extra.body || ""}
      ${extra.canConfirm ? `<button class="btn-cta" id="btn-confirm" type="button"><span class="btn-cta-fill"></span><span class="btn-cta-label">CONFIRMAR PRESENÇA</span></button>` : ""}
    `;
    const btn = document.getElementById("btn-confirm");
    if (btn) btn.onclick = () => confirm(row.codigo_inscricao);
  }

  async function lookup(code) {
    const row = await window.DNJApi.getByCode(code);
    if (row.presente) {
      showPerson(row, { title: "CHECK-IN JÁ REALIZADO", body: "<p>Esta inscrição já teve presença registrada.</p>", canConfirm: false });
      return;
    }
    showPerson(row, { title: "INSCRIÇÃO ENCONTRADA", canConfirm: true });
  }

  async function confirm(code) {
    const r = await window.DNJApi.checkin(password, code);
    const row = r.inscricao;
    if (r.already) {
      const when = r.checkin?.realizado_em ? new Date(r.checkin.realizado_em).toLocaleString("pt-BR") : "";
      showPerson(row, { title: "CHECK-IN JÁ REALIZADO", body: `<p>${when}</p>`, canConfirm: false });
      return;
    }
    showPerson(row, { title: "✓ CHECK-IN REALIZADO", body: "<p>Presença registrada com data e hora.</p>", canConfirm: false });
  }

  function startCamera() {
    if (!window.Html5Qrcode) return;
    const qr = new window.Html5Qrcode("reader");
    qr.start({ facingMode: "environment" }, { fps: 8, qrbox: 220 }, (text) => {
      if (text && text !== lastCode) {
        lastCode = text;
        lookup(text.trim().toUpperCase()).catch(() => {
          found.hidden = false;
          found.innerHTML = "<p>QR Code não encontrado.</p>";
        });
      }
    }).catch(() => {});
  }

  function openScan() {
    document.getElementById("gate").hidden = true;
    document.getElementById("scan").hidden = false;
    startCamera();
  }

  document.getElementById("gate-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await window.DNJApi.login(e.target.password.value);
      password = e.target.password.value;
      sessionStorage.setItem(KEY, password);
      openScan();
    } catch (_) {
      document.getElementById("gate-error").hidden = false;
      document.getElementById("gate-error").textContent = "Senha incorreta.";
    }
  });
  document.getElementById("manual").addEventListener("submit", (e) => {
    e.preventDefault();
    lookup(e.target.codigo.value.trim().toUpperCase()).catch(() => {
      found.hidden = false;
      found.innerHTML = "<p>Código não encontrado.</p>";
    });
  });
  if (password) {
    window.DNJApi.login(password).then(openScan).catch(() => sessionStorage.removeItem(KEY));
  }
})();
