(() => {
  const cfg = window.DNJ_CONFIG || {};
  const coord = cfg.coordinator || {
    name: "Ana Beatriz Moreira dos Santos",
    cpf: "119.876.987-46",
  };
  const wa = cfg.termoWhatsapp || "5522920050790";

  function setText(id, value, fallback) {
    const el = document.getElementById(id);
    if (el) el.textContent = value || fallback || "—";
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
    setText("termo-codigo", record?.codigo_inscricao);
    setText("termo-coord-nome", coord.name);
    setText("termo-coord-cpf", coord.cpf);
    setText("termo-sign-name", g.nome, "");
    const card = document.getElementById("minor-card");
    const alertBox = document.getElementById("minor-alert");
    const send = document.getElementById("btn-send-termo");
    const minor = isMinor(record);
    if (card) card.hidden = !minor;
    if (alertBox) alertBox.hidden = !minor;
    if (send) {
      const msg = [
        "Olá, Beatriz! Segue a autorização do menor de 18 anos da Caravana Geração Eucarística ao DNJ.",
        record?.nome_completo ? `Participante: ${record.nome_completo}` : "",
        record?.codigo_inscricao ? `Código: ${record.codigo_inscricao}` : "",
        g.nome ? `Responsável: ${g.nome}` : "",
        "Vou enviar a foto (ou o PDF assinado) do termo.",
      ].filter(Boolean).join("\n");
      send.href = `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
    }
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

  window.DNJTermo = { isMinor, fill, print, parseGuardian, noteFromForm };
})();
