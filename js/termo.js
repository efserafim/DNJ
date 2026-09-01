(() => {
  const cfg = window.DNJ_CONFIG || {};
  const coord = cfg.coordinator || {
    name: "Ana Beatriz Moreira dos Santos",
    cpf: "119.876.987-46",
  };
  const govUrl = cfg.govSignUrl || "https://assinador.iti.br/";

  function generateCodigo() {
    const raw = (globalThis.crypto?.randomUUID?.() || `${Date.now()}${Math.random()}`)
      .replace(/-/g, "")
      .slice(0, 8)
      .toUpperCase();
    return `DNJ26-${raw}`;
  }

  function setText(id, value, fallback) {
    const text = value || fallback || "—";
    const el = document.getElementById(id);
    if (el) el.textContent = text;
    const preview = document.getElementById(`preview-${id}`);
    if (preview) preview.textContent = text;
  }

  function ageFromBirth(iso) {
    if (!iso) return null;
    const born = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(born.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - born.getFullYear();
    const m = today.getMonth() - born.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < born.getDate())) age -= 1;
    return age;
  }

  function recordFromForm(data) {
    const age = ageFromBirth(data?.data_nascimento);
    const codigo = data?.codigo_inscricao || window.DNJForm?.ensureCodigo?.() || generateCodigo();
    return {
      ...data,
      idade: age,
      codigo_inscricao: codigo,
    };
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const [y, m, d] = String(iso).slice(0, 10).split("-");
    if (!d) return iso;
    return `${d}/${m}/${y}`;
  }

  function parseGuardian(record) {
    const fromFields = {
      nome: record.nome_responsavel,
      cpf: record.cpf_responsavel,
      parentesco: record.parentesco_responsavel,
      whatsapp: record.whatsapp_responsavel,
    };
    if (fromFields.nome) return fromFields;
    const note = String(record.observacoes || "");
    const nome = (note.match(/Responsável:\s*([^|]+)/i) || [])[1];
    const cpf = (note.match(/CPF:\s*([^|]+)/i) || [])[1];
    const parentesco = (note.match(/Parentesco:\s*([^|]+)/i) || [])[1];
    const whatsapp = (note.match(/WhatsApp resp\.:\s*([^|]+)/i) || [])[1];
    return {
      nome: (nome || "").trim(),
      cpf: (cpf || "").trim(),
      parentesco: (parentesco || "").trim(),
      whatsapp: (whatsapp || "").trim(),
    };
  }

  function isMinor(record) {
    const age = Number(record?.idade);
    if (Number.isFinite(age) && age > 0) return age < 18;
    return false;
  }

  function fill(record) {
    const g = parseGuardian(record || {});
    const age = record?.idade ? `${record.idade} anos` : "";
    const nasc = formatDate(record?.data_nascimento);
    setText("termo-resp-nome", g.nome, "________________________________");
    setText("termo-resp-cpf", g.cpf, "________________");
    setText("termo-resp-parentesco", g.parentesco, "responsável legal");
    setText("termo-menor-nome", record?.nome_completo);
    setText("termo-menor-nasc", [nasc, age].filter(Boolean).join(" · "));
    setText("termo-menor-cpf", record?.cpf, "não informado");
    setText("termo-menor-whatsapp", record?.whatsapp);
    setText("termo-codigo", record?.codigo_inscricao, "—");
    setText("termo-coord-nome", coord.name);
    setText("termo-coord-cpf", coord.cpf);
    setText("termo-sign-name", g.nome, "");
    document.querySelectorAll(".termo-gov-link").forEach((link) => {
      link.href = govUrl;
    });
  }

  function print() {
    document.body.classList.add("print-termo");
    const termo = document.getElementById("termo");
    if (termo) termo.hidden = false;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      document.body.classList.remove("print-termo");
      if (termo) termo.hidden = true;
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    setTimeout(() => window.print(), 80);
  }

  function noteFromForm(data) {
    if (!data?.nome_responsavel) return null;
    return [
      "Responsável:", data.nome_responsavel,
      "| CPF:", data.cpf_responsavel || "—",
      "| Parentesco:", data.parentesco_responsavel || "—",
      "| WhatsApp resp.:", data.whatsapp_responsavel || "—",
    ].join(" ");
  }

  function fillPreview(data) {
    fill(recordFromForm(data || {}));
  }

  function printDraft(data) {
    fill(recordFromForm(data || {}));
    print();
  }

  window.DNJTermo = {
    isMinor,
    fill,
    fillPreview,
    printDraft,
    print,
    parseGuardian,
    noteFromForm,
    ageFromBirth,
    generateCodigo,
  };
})();
