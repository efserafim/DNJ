(() => {
  const KEY = "dnj2026_ticket";
  const hero = document.getElementById("hero");
  const formView = document.getElementById("form-view");
  const confirmView = document.getElementById("confirm");
  const ticket = document.getElementById("ticket");
  const lookup = document.getElementById("lookup");
  const cfg = window.DNJ_CONFIG || {};
  let current = null;
  let mine = null;

  function isWaitlist(record) {
    return record?.status === "lista_espera";
  }

  function isConfirmed(record) {
    return record?.status === "confirmada";
  }

  function closeDialogs() {
    if (ticket.open) ticket.close();
    if (lookup.open) lookup.close();
  }

  function openDialog(dialog) {
    if (dialog !== ticket && ticket.open) ticket.close();
    if (dialog !== lookup && lookup.open) lookup.close();
    if (!dialog.open) dialog.showModal();
  }

  function show(view) {
    hero.hidden = view !== "hero";
    formView.hidden = view !== "form";
    confirmView.hidden = view !== "confirm";
    if (view === "hero" || view === "form") closeDialogs();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function shareText(record) {
    const wait = isWaitlist(record);
    const waitByAge = wait && Number(record?.idade) >= (cfg.waitlistFromAge ?? 35);
    return [
      wait ? "Estou na lista de espera do DNJ 2026." : "Estou inscrito no DNJ 2026!",
      "“Vinho novo em odres novos.” Lc 5,37",
      wait
        ? (waitByAge ? "Lista de espera · prioridade jovens 13–34" : "Lista de espera · aguardando vaga")
        : [record?.onibus_nome, record?.assento ? `Assento ${record.assento}` : ""].filter(Boolean).join(" · "),
      `Código: ${record?.codigo_inscricao || ""}`,
      "18 de outubro · saída às 6h · Orla do Marine — Maricá",
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

  function fillTicketModal(record) {
    document.getElementById("ticket-name").textContent = record.nome_completo;
    document.getElementById("ticket-code").textContent = record.codigo_inscricao;
    document.getElementById("ticket-whatsapp").textContent = record.whatsapp || "—";
    document.getElementById("ticket-idade").textContent = record.idade ? `${record.idade} anos` : "—";
    document.getElementById("ticket-onibus").textContent = record.onibus_nome || "—";
    document.getElementById("ticket-assento").textContent = record.assento || "—";
    const qr = document.getElementById("ticket-qr");
    const code = String(record.codigo_inscricao);
    qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&ecc=H&margin=8&data=${encodeURIComponent(code)}`;
    qr.alt = `QR Code ${code}`;
  }

  function updateConfirmActions(record) {
    const wait = isWaitlist(record);
    const btnView = document.getElementById("btn-view");
    const btnPrint = document.getElementById("btn-print");
    const codeLabel = document.getElementById("confirm-code-label");
    const waitHint = document.getElementById("confirm-wait-hint");
    if (btnView) btnView.hidden = wait;
    if (btnPrint) btnPrint.hidden = wait;
    if (waitHint) waitHint.hidden = !wait;
    if (codeLabel) {
      codeLabel.textContent = wait
        ? "Código para consultar · toque para copiar"
        : "Código · toque para copiar";
    }
  }

  function fillTicket(record, persist = false) {
    if (!record?.codigo_inscricao) return;
    current = record;
    if (persist) {
      mine = record;
      remember(record);
    }
    const wait = isWaitlist(record);
    const waitByAge = wait && Number(record.idade) >= (cfg.waitlistFromAge ?? 35);
    const confirmInner = document.querySelector(".confirm-inner");
    const confirmTitle = document.getElementById("confirm-title");
    const waitAlert = document.getElementById("waitlist-alert");
    const waitKicker = document.getElementById("waitlist-alert-kicker");
    const waitTitle = document.getElementById("waitlist-alert-title");
    const waitText = document.getElementById("waitlist-alert-text");
    const ticketCard = document.querySelector(".ticket-card");

    confirmInner?.classList.toggle("is-waitlist", wait);
    confirmInner?.classList.toggle("is-waitlist-age", waitByAge);
    ticketCard?.classList.toggle("is-waitlist", false);

    if (waitAlert) waitAlert.hidden = !wait;

    if (wait) {
      if (confirmTitle) confirmTitle.textContent = "Lista de espera";
      if (waitKicker) waitKicker.textContent = waitByAge ? "Lista de espera · prioridade jovens" : "Lista de espera";
      if (waitTitle) {
        waitTitle.textContent = waitByAge
          ? "Com 35 anos ou mais, você entra na fila"
          : "Os ônibus estão lotados no momento";
      }
      if (waitText) {
        waitText.innerHTML = waitByAge
          ? "Esta caravana do <strong>Grupo Jovem Geração Eucarística</strong> prioriza jovens de <strong>13 a 34 anos</strong>. Você está registrado na fila, mas <strong>ainda não tem ingresso</strong>. Se surgir vaga, a coordenação avisa pelo WhatsApp e libera seu ingresso com QR Code."
          : "Você está na fila, mas <strong>ainda não tem ingresso</strong>. Se surgir vaga, a coordenação entra em contato pelo WhatsApp e libera seu ingresso com QR Code.";
      }
    } else if (confirmTitle) {
      confirmTitle.textContent = "Inscrição confirmada!";
    }

    document.getElementById("confirm-code").textContent = record.codigo_inscricao;
    document.getElementById("confirm-lead").textContent = wait
      ? (waitByAge
        ? "Você está na fila, aguardando possível vaga na caravana."
        : "Você está na fila, aguardando vaga no ônibus.")
      : "Sua inscrição no DNJ 2026 está confirmada.";
    document.getElementById("confirm-bus").textContent = wait
      ? (waitByAge ? "Sem ingresso · fila por idade (35+)" : "Sem ingresso · aguardando vaga")
      : [record.onibus_nome, record.assento ? `Assento ${record.assento}` : "", record.idade ? `${record.idade} anos` : ""]
          .filter(Boolean).join(" · ");

    updateConfirmActions(record);

    if (isConfirmed(record)) fillTicketModal(record);
    window.DNJTermo?.fill(record);
  }

  function openTicket(record) {
    const row = record || current || mine;
    if (!row?.codigo_inscricao || isWaitlist(row)) return;
    fillTicketModal(row);
    openDialog(ticket);
  }

  function showMyTicketShortcut() {
    const btn = document.getElementById("btn-my-ticket");
    const link = document.getElementById("btn-lookup");
    const hasConfirmed = Boolean(mine?.codigo_inscricao && isConfirmed(mine));
    const hasWait = Boolean(mine?.codigo_inscricao && isWaitlist(mine));
    if (btn) btn.hidden = !hasConfirmed;
    if (link) {
      if (hasConfirmed) link.textContent = "Consultar outra inscrição";
      else if (hasWait) link.textContent = "Consultar minha lista de espera";
      else link.textContent = "Já me inscrevi · ver meu ingresso";
    }
  }

  function restoreSaved() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) {}
    if (!saved?.codigo_inscricao) {
      showMyTicketShortcut();
      return;
    }
    mine = saved;
    fillTicket(saved);
    showMyTicketShortcut();
  }

  function resetLookup() {
    const form = document.getElementById("lookup-form");
    form?.reset();
    document.getElementById("lookup-error").hidden = true;
    document.getElementById("lookup-result").hidden = true;
  }

  function updateLookupResult(row) {
    const lookupTicketBtn = document.getElementById("lookup-open-ticket");
    const lookupWaitNote = document.getElementById("lookup-wait-note");
    const wait = isWaitlist(row);
    if (lookupTicketBtn) lookupTicketBtn.hidden = wait;
    if (lookupWaitNote) lookupWaitNote.hidden = !wait;
  }

  function tickCountdown() {
    const el = document.getElementById("countdown");
    if (!el) return;
    const target = new Date(cfg.event?.departureIso || "2026-10-18T06:00:00-03:00");
    const diff = target - new Date();
    if (diff <= 0) {
      el.innerHTML = `<p class="countdown-head">É hoje. Saímos às 6h.</p><p class="countdown-live">Vinho novo em odres novos.</p>`;
      return;
    }
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    const cell = (n, label) => `<span class="count-cell"><b>${String(n).padStart(2, "0")}</b><small>${label}</small></span>`;
    el.innerHTML = `<p class="countdown-head">Faltam para a saída às 6h</p><div class="countdown-grid">${cell(days, "dias")}${cell(hours, "horas")}${cell(mins, "min")}${cell(secs, "seg")}</div>`;
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
    const row = current || mine;
    if (!row?.codigo_inscricao || isWaitlist(row)) return;
    fillTicketModal(row);
    openDialog(ticket);
    setTimeout(() => window.print(), 250);
  }

  async function shareWhatsapp() {
    const text = shareText(current);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  document.getElementById("btn-start").addEventListener("click", () => { window.DNJForm.reset(); show("form"); });
  document.getElementById("btn-back-hero").addEventListener("click", () => show("hero"));
  document.getElementById("btn-home").addEventListener("click", () => { show("hero"); loadInscricoesStatus(); });
  document.getElementById("btn-view").addEventListener("click", () => openTicket(current || mine));
  document.getElementById("btn-my-ticket").addEventListener("click", () => openTicket(mine));
  document.getElementById("lookup-open-ticket").addEventListener("click", () => openTicket(current));
  document.getElementById("btn-close-ticket").addEventListener("click", () => ticket.close());
  document.getElementById("btn-lookup").addEventListener("click", () => {
    resetLookup();
    openDialog(lookup);
  });
  document.getElementById("btn-close-lookup").addEventListener("click", () => lookup.close());
  document.getElementById("confirm-code").addEventListener("click", () => copyCode(current?.codigo_inscricao));
  document.getElementById("btn-copy-ticket").addEventListener("click", () => copyCode(current?.codigo_inscricao));
  document.getElementById("btn-share").addEventListener("click", shareWhatsapp);
  document.getElementById("btn-print").addEventListener("click", printTicket);
  document.getElementById("btn-print-ticket").addEventListener("click", () => window.print());
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
      fillTicket(row);
      result.hidden = false;
      document.getElementById("lookup-name").textContent = row.nome_completo;
      document.getElementById("lookup-code").textContent = row.codigo_inscricao;
      document.getElementById("lookup-meta").textContent = [
        row.idade ? `${row.idade} anos` : "",
        isWaitlist(row) ? "Lista de espera" : (row.onibus_nome || row.status),
        row.assento ? `Assento ${row.assento}` : "",
        row.presente ? "Check-in realizado" : (isWaitlist(row) ? "Sem ingresso ainda" : "Aguardando o dia"),
      ].filter(Boolean).join(" · ");
      updateLookupResult(row);
      const lookupTermo = document.getElementById("lookup-termo");
      const lookupNote = document.getElementById("lookup-minor-note");
      const isMinor = window.DNJTermo.isMinor(row);
      lookupTermo.hidden = !isMinor;
      if (lookupNote) lookupNote.hidden = !isMinor;
      if (isConfirmed(row)) {
        mine = row;
        remember(row);
        showMyTicketShortcut();
      }
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
      fillTicket(merged, true);
      showMyTicketShortcut();
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
  restoreSaved();
  show("hero");
})();
