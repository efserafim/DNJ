(() => {
  const form = document.getElementById("form-inscricao");
  const panels = [...form.querySelectorAll(".step-panel")];
  const indicators = [...document.querySelectorAll("#steps-indicator li")];
  const errorBox = document.getElementById("form-error");
  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");
  const btnSubmit = document.getElementById("btn-submit");
  const kicker = document.getElementById("step-kicker");
  const idadeEl = document.getElementById("idade_display");
  const kickers = [
    "A caminhada começa",
    "Sua comunidade caminha com você",
    "O encontro está próximo",
    "Confirme e entre no caminho",
  ];
  let step = 1;
  let pendingCodigo = null;

  function ensureCodigo() {
    if (!pendingCodigo) pendingCodigo = window.DNJTermo?.generateCodigo?.() || `DNJ26-${Date.now().toString(16).slice(-8).toUpperCase()}`;
    return pendingCodigo;
  }

  function resetCodigo() {
    pendingCodigo = null;
  }

  function calcAge(value) {
    if (!value) return null;
    const [y, m, d] = value.split("-").map(Number);
    const birth = new Date(y, m - 1, d);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const md = now.getMonth() - birth.getMonth();
    if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age -= 1;
    return age;
  }

  function maskPhone(value) {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 10) return digits.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
    return digits.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
  }
  function maskCpf(value) {
    const d = value.replace(/\D/g, "").slice(0, 11);
    return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }

  form.whatsapp.addEventListener("input", (e) => { e.target.value = maskPhone(e.target.value); });
  form.cpf.addEventListener("input", (e) => { e.target.value = maskCpf(e.target.value); });
  form.cpf_responsavel.addEventListener("input", (e) => { e.target.value = maskCpf(e.target.value); });
  form.whatsapp_responsavel.addEventListener("input", (e) => { e.target.value = maskPhone(e.target.value); });
  function toggleMinor(age) {
    const box = document.getElementById("bloco-menor");
    const minor = age != null && age < 18;
    box.hidden = !minor;
    ["nome_responsavel", "cpf_responsavel", "parentesco_responsavel", "whatsapp_responsavel"].forEach((name) => {
      form[name].required = minor;
    });
    form.ciente_termo_menor.required = minor;
  }

  function isWaitlistAge(age) {
    const minAge = window.DNJ_CONFIG?.waitlistFromAge ?? 35;
    return age != null && age >= minAge;
  }

  function toggleYouthWaitlist(age) {
    const note = document.getElementById("youth-pref-note");
    const stepAlert = document.getElementById("waitlist-step-alert");
    const on = isWaitlistAge(age);
    if (note) note.hidden = !on;
    if (stepAlert) stepAlert.hidden = !(on && step === 4);
  }

  function updateTermPreview() {
    if (!window.DNJTermo?.fillPreview) return;
    const age = calcAge(form.data_nascimento.value);
    if (age == null || age >= 18) return;
    window.DNJTermo.fillPreview({ ...window.DNJForm.payload(), codigo_inscricao: ensureCodigo() });
  }

  form.data_nascimento.addEventListener("input", () => {
    const age = calcAge(form.data_nascimento.value);
    idadeEl.value = age == null || age < 0 ? "—" : `${age} anos`;
    toggleYouthWaitlist(age);
    if (step === 4) {
      toggleMinor(age);
      updateTermPreview();
    }
  });

  ["nome_completo", "data_nascimento", "cpf", "whatsapp", "nome_responsavel", "cpf_responsavel", "parentesco_responsavel", "whatsapp_responsavel"].forEach((name) => {
    const field = form[name];
    if (!field) return;
    field.addEventListener("input", updateTermPreview);
    field.addEventListener("change", updateTermPreview);
  });

  document.getElementById("btn-preview-termo")?.addEventListener("click", () => {
    window.DNJTermo?.printDraft(window.DNJForm.payload());
  });

  function showError(message) {
    errorBox.hidden = !message;
    errorBox.textContent = message || "";
  }
  function requiredFields(panel) {
    return [...panel.querySelectorAll("[required]")].filter((field) => {
      if (field.type === "checkbox") return !field.checked;
      return !String(field.value || "").trim();
    });
  }
  function markInvalid(fields) {
    form.querySelectorAll(".field.is-invalid, .terms.is-invalid").forEach((el) => el.classList.remove("is-invalid"));
    fields.forEach((field) => {
      const box = field.closest(".field, .terms");
      if (box) box.classList.add("is-invalid");
    });
  }
  function validEmail(value) {
    if (!value) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
  function paint(opts = {}) {
    panels.forEach((panel) => {
      const active = Number(panel.dataset.step) === step;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    indicators.forEach((item, index) => {
      item.classList.toggle("is-active", index === step - 1);
      item.classList.toggle("is-done", index < step - 1);
    });
    kicker.textContent = kickers[step - 1];
    btnPrev.hidden = step === 1;
    btnNext.hidden = step === 4;
    btnSubmit.hidden = step !== 4;
    showError("");
    toggleMinor(calcAge(form.data_nascimento.value));
    toggleYouthWaitlist(calcAge(form.data_nascimento.value));
    if (step === 4) {
      ensureCodigo();
      const age = calcAge(form.data_nascimento.value);
      toggleYouthWaitlist(age);
      const p = window.DNJForm.payload();
      const review = document.getElementById("review-box");
      const esc = (v) => String(v ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
      review.classList.toggle("is-waitlist", isWaitlistAge(age));
      review.innerHTML = [
        ["Nome", p.nome_completo],
        ["Nascimento", p.data_nascimento.split("-").reverse().join("/")],
        ["WhatsApp", p.whatsapp],
        ["Paróquia", p.paroquia || "—"],
        ["Comunidade", p.comunidade || "—"],
        ["Cidade", [p.cidade, p.bairro].filter(Boolean).join(" · ") || "—"],
        p.nome_responsavel ? ["Responsável", `${p.nome_responsavel} · ${p.parentesco_responsavel || ""}`] : null,
      ].filter(Boolean).map(([k, v]) => `<p><strong>${esc(k)}</strong> ${esc(v)}</p>`).join("");
      updateTermPreview();
    }
    if (opts.focus) {
      const first = panels[step - 1].querySelector("input:not([readonly]), select, textarea");
      if (first) setTimeout(() => first.focus(), 40);
    }
  }

  btnNext.addEventListener("click", () => {
    const missing = requiredFields(panels[step - 1]);
    if (missing.length) {
      markInvalid(missing);
      showError("Preencha os campos obrigatórios desta etapa para seguir.");
      missing[0].focus();
      return;
    }
    markInvalid([]);
    if (step === 1) {
      const age = calcAge(form.data_nascimento.value);
      if (age == null || age < 13) {
        showError("A inscrição é para jovens a partir de 13 anos.");
        form.data_nascimento.focus();
        return;
      }
      if (!validEmail(form.email.value)) {
        showError("Informe um e-mail válido ou deixe em branco.");
        form.email.focus();
        return;
      }
      if (form.whatsapp.value.replace(/\D/g, "").length < 10) {
        showError("Informe um WhatsApp válido com DDD.");
        form.whatsapp.focus();
        return;
      }
    }
    step += 1;
    paint({ focus: true });
  });
  btnPrev.addEventListener("click", () => { step = Math.max(1, step - 1); paint({ focus: true }); });
  form.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.target.tagName === "TEXTAREA") return;
    if (step < 4) { event.preventDefault(); btnNext.click(); }
  });
  function bool(name) { return form[name].value === "true"; }

  function isMinorNow() {
    const age = calcAge(form.data_nascimento.value);
    return age != null && age < 18;
  }

  function validateMinor() {
    if (!isMinorNow()) return true;
    if (!form.nome_responsavel.value.trim() || !form.parentesco_responsavel.value) {
      showError("Para menores de 18 anos, preencha os dados do responsável.");
      form.nome_responsavel.focus();
      return false;
    }
    if (form.cpf_responsavel.value.replace(/\D/g, "").length !== 11) {
      showError("Informe o CPF completo do responsável.");
      form.cpf_responsavel.focus();
      return false;
    }
    if (form.whatsapp_responsavel.value.replace(/\D/g, "").length < 10) {
      showError("Informe o WhatsApp do responsável com DDD.");
      form.whatsapp_responsavel.focus();
      return false;
    }
    if (!form.ciente_termo_menor.checked) {
      showError("Confirme que o responsável vai assinar o termo e enviar para a Beatriz no WhatsApp.");
      return false;
    }
    return true;
  }

  window.DNJForm = {
    reset() { form.reset(); idadeEl.value = "—"; btnSubmit.disabled = false; step = 1; resetCodigo(); paint(); },
    ensureCodigo,
    resetCodigo,
    validateMinor,
    isMinorNow,
    calcAge,
    payload() {
      const data = {
        nome_completo: form.nome_completo.value.trim(),
        data_nascimento: form.data_nascimento.value,
        sexo: form.sexo.value,
        cpf: form.cpf.value.trim() || null,
        whatsapp: form.whatsapp.value.trim(),
        email: form.email.value.trim() || null,
        paroquia: form.paroquia.value.trim() || null,
        comunidade: form.comunidade.value.trim() || null,
        grupo_movimento: form.grupo_movimento.value.trim() || null,
        cidade: form.cidade.value.trim() || null,
        bairro: form.bairro.value.trim() || null,
        membro_geracao_eucaristica: bool("membro_geracao_eucaristica"),
        ja_participou_dnj: bool("ja_participou_dnj"),
        como_conheceu: form.como_conheceu.value || null,
        necessidade_especifica: form.necessidade_especifica.value.trim() || null,
        aceitou_termos: form.aceitou_termos.checked,
        nome_responsavel: form.nome_responsavel.value.trim() || null,
        cpf_responsavel: form.cpf_responsavel.value.trim() || null,
        parentesco_responsavel: form.parentesco_responsavel.value || null,
        whatsapp_responsavel: form.whatsapp_responsavel.value.trim() || null,
      };
      data.observacoes = window.DNJTermo?.noteFromForm(data) || null;
      data.codigo_inscricao = ensureCodigo();
      return data;
    },
    showError,
    element: form,
  };
  paint();
})();
