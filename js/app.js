(() => {
  const KEY = "dnj2026_ticket";
  const hero = document.getElementById("hero");
  const formView = document.getElementById("form-view");
  const confirmView = document.getElementById("confirm");
  const ticket = document.getElementById("ticket");
  const lookup = document.getElementById("lookup");
  const cfg = window.DNJ_CONFIG || {};
  let current = null;

  function show(view) {
    hero.hidden = view !== "hero";
    formView.hidden = view !== "form";
    confirmView.hidden = view !== "confirm";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function shareText(record) {
    const wait = record?.status === "lista_espera";
    return [
      "Estou inscrito no DNJ 2026!",
      "“Vinho novo em odres novos.” Lc 5,37",
      wait ? "Lista de espera" : [record?.onibus_nome, record?.assento ? `Assento ${record.assento}` : ""].filter(Boolean).join(" · "),
      `Código: ${record?.codigo_inscricao || ""}`,
      "18 de outubro · saída às 7h · Orla do Marine — Maricá",
    ].filter(Boolean).join("\n");
  }

  async function copyCode(code) {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch (_) {
      const box = document.createElement("textarea");
      box.value = code;
      document.body.appendChild(box);
      box.select();
      document.execCommand("copy");
      box.remove();
    }
    const msg = document.getElementById("copied-msg");
    if (msg) {
      msg.hidden = false;
      setTimeout(() => { msg.hidden = true; }, 1800);
    }
  }

  function remember(record) {
    try { localStorage.setItem(KEY, JSON.stringify(record)); } catch (_) {}
  }

  function fillTicket(record) {
    current = record;
    remember(record);
    const wait = record.status === "lista_espera";
    document.getElementById("confirm-code").textContent = record.codigo_inscricao;
    document.getElementById("confirm-lead").textContent = wait
      ? "Os ônibus estão lotados. Você entrou na lista de espera e será avisado quando surgir vaga."
      : "Sua inscrição no DNJ 2026 está confirmada.";
    document.getElementById("confirm-bus").textContent = wait
      ? "Lista de espera"
      : [record.onibus_nome, record.assento ? `Assento ${record.assento}` : "", record.idade ? `${record.idade} anos` : ""]
          .filter(Boolean).join(" · ");
    document.getElementById("ticket-name").textContent = record.nome_completo;
    document.getElementById("ticket-code").textContent = record.codigo_inscricao;
    document.getElementById("ticket-whatsapp").textContent = record.whatsapp || "—";
    document.getElementById("ticket-idade").textContent = record.idade ? `${record.idade} anos` : "—";
    document.getElementById("ticket-onibus").textContent = record.onibus_nome || "Lista de espera";
    document.getElementById("ticket-assento").textContent = record.assento || "—";
    const qr = document.getElementById("ticket-qr");
    qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=168x168&data=${encodeURIComponent(record.codigo_inscricao)}`;
    qr.alt = `QR Code ${record.codigo_inscricao}`;
    window.DNJTermo?.fill(record);
  }

  function tickCountdown() {
    const el = document.getElementById("countdown");
    if (!el) return;
    const target = new Date(cfg.event?.departureIso || "2026-10-18T07:00:00-03:00");
    const diff = target - new Date();
    if (diff <= 0) {
      el.innerHTML = `<p class="countdown-head">É hoje. Saímos às 7h.</p><p class="countdown-live">Vinho novo em odres novos.</p>`;
      return;
    }
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    const cell = (n, label) => `<span class="count-cell"><b>${String(n).padStart(2, "0")}</b><small>${label}</small></span>`;
    el.innerHTML = `<p class="countdown-head">Faltam para a saída às 7h</p><div class="countdown-grid">${cell(days, "dias")}${cell(hours, "horas")}${cell(mins, "min")}${cell(secs, "seg")}</div>`;
  }

  async function loadInscricoesStatus() {
    if (!window.DNJApi?.vagas) return;
    try {
      const data = await window.DNJApi.vagas();
      if (data?.abertas === false) {
        document.getElementById("btn-start").disabled = true;
      }
    } catch (_) {}
  }

  function printTicket() {
    ticket.showModal();
    setTimeout(() => window.print(), 250);
  }

  async function shareWhatsapp() {
    const text = shareText(current);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  document.getElementById("btn-start").addEventListener("click", () => { window.DNJForm.reset(); show("form"); });
  document.getElementById("btn-back-hero").addEventListener("click", () => show("hero"));
  document.getElementById("btn-home").addEventListener("click", () => { show("hero"); loadInscricoesStatus(); });
  document.getElementById("btn-view").addEventListener("click", () => ticket.showModal());
  document.getElementById("btn-close-ticket").addEventListener("click", () => ticket.close());
  document.getElementById("btn-lookup").addEventListener("click", () => lookup.showModal());
  document.getElementById("btn-close-lookup").addEventListener("click", () => lookup.close());
  document.getElementById("confirm-code").addEventListener("click", () => copyCode(current?.codigo_inscricao));
  document.getElementById("btn-copy-ticket").addEventListener("click", () => copyCode(current?.codigo_inscricao));
  document.getElementById("btn-share").addEventListener("click", shareWhatsapp);
  document.getElementById("btn-print").addEventListener("click", printTicket);
  document.getElementById("btn-print-ticket").addEventListener("click", () => window.print());
  document.getElementById("btn-print-termo").addEventListener("click", () => window.DNJTermo.print());
  document.getElementById("lookup-termo").addEventListener("click", () => window.DNJTermo.print());

  document.getElementById("lookup-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorBox = document.getElementById("lookup-error");
    const result = document.getElementById("lookup-result");
    const btn = event.target.querySelector("button[type=submit]");
    errorBox.hidden = true;
    btn.disabled = true;
    try {
      const row = await window.DNJApi.lookup(event.target.codigo.value, event.target.nascimento.value);
      current = row;
      remember(row);
      fillTicket(row);
      result.hidden = false;
      document.getElementById("lookup-name").textContent = row.nome_completo;
      document.getElementById("lookup-code").textContent = row.codigo_inscricao;
      document.getElementById("lookup-meta").textContent = [
        row.idade ? `${row.idade} anos` : "",
        row.onibus_nome || row.status,
        row.assento ? `Assento ${row.assento}` : "",
        row.presente ? "Check-in realizado" : "Aguardando o dia",
      ].filter(Boolean).join(" · ");
      const lookupTermo = document.getElementById("lookup-termo");
      lookupTermo.hidden = !window.DNJTermo.isMinor(row);
    } catch (_) {
      result.hidden = true;
      errorBox.hidden = false;
      errorBox.textContent = "Não encontramos essa inscrição. Confira o código ou WhatsApp e a data de nascimento.";
    } finally {
      btn.disabled = false;
    }
  });

  window.DNJForm.element.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = window.DNJForm.payload();
    if (!data.aceitou_termos) {
      window.DNJForm.showError("É necessário autorizar o uso das informações para confirmar.");
      return;
    }
    if (!window.DNJForm.validateMinor()) return;
    const submit = document.getElementById("btn-submit");
    const label = submit.querySelector(".btn-cta-label");
    submit.disabled = true;
    label.textContent = "CONFIRMANDO…";
    try {
      const record = await window.DNJApi.create(data);
      const merged = {
        ...data,
        ...record,
        idade: record.idade ?? window.DNJForm.calcAge(data.data_nascimento),
      };
      fillTicket(merged);
      show("confirm");
    } catch (error) {
      window.DNJForm.showError(error?.message || "Não foi possível confirmar agora. Tente de novo em instantes.");
      submit.disabled = false;
      label.textContent = "CONFIRMAR INSCRIÇÃO";
    }
  });

  tickCountdown();
  setInterval(tickCountdown, 1000);
  loadInscricoesStatus();
  show("hero");
})();
