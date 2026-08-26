(() => {
  const KEY = "dnj2026_admin";
  const EMAIL_KEY = "dnj2026_admin_email";
  const NAME_KEY = "dnj2026_admin_nome";
  let password = sessionStorage.getItem(KEY) || "";
  let adminEmail = sessionStorage.getItem(EMAIL_KEY) || "";
  let adminName = sessionStorage.getItem(NAME_KEY) || "";
  let data = null;
  let view = "home";
  let timer = 0;
  let pendingTransfer = null;
  let currentBusId = null;
  let askResolve = null;
  let sort = { key: "criado", dir: "asc" };
  const DEFAULT_PASSWORD = "geracao2026";
  const loginView = document.getElementById("login");
  const firstAccess = document.getElementById("first-access");
  const dash = document.getElementById("dashboard");

  const isDefaultPassword = (value) => String(value || "").trim().toLowerCase() === DEFAULT_PASSWORD;

  const qs = (id) => document.getElementById(id);
  function esc(value) {
    return String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function when(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function toast(message, kind = "ok") {
    const box = qs("toasts");
    if (!box) return;
    const el = document.createElement("div");
    el.className = `toast toast-${kind}`;
    el.textContent = message;
    box.appendChild(el);
    setTimeout(() => {
      el.classList.add("is-out");
      setTimeout(() => el.remove(), 320);
    }, 3200);
  }

  function ask(text, { title = "Confirmar", ok = "CONFIRMAR", danger = false } = {}) {
    return new Promise((resolve) => {
      askResolve = resolve;
      qs("ask-title").textContent = title;
      qs("ask-text").textContent = text;
      const yes = qs("ask-yes");
      yes.querySelector(".btn-cta-label").textContent = ok;
      yes.classList.toggle("is-danger", danger);
      qs("ask").showModal();
    });
  }

  function closeAsk(value) {
    const resolve = askResolve;
    askResolve = null;
    if (qs("ask").open) qs("ask").close();
    if (resolve) resolve(value);
  }

  function waCell(phone) {
    const raw = String(phone || "").trim();
    if (!raw) return "—";
    const digits = raw.replace(/\D/g, "");
    if (!digits) return esc(raw);
    const full = digits.length <= 11 ? `55${digits}` : digits;
    return `<a class="wa-link" href="https://wa.me/${full}" target="_blank" rel="noopener">${esc(raw)}</a>`;
  }

  function stampNow() {
    const box = qs("dash-updated");
    if (box) box.textContent = `Atualizado ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  }
  function sortValue(i) {
    switch (sort.key) {
      case "nome": return String(i.nome_completo || "").toLowerCase();
      case "idade": return Number(i.idade || 0);
      case "faixa": return String(i.faixa_nome || "").toLowerCase();
      case "onibus": return String(i.onibus_nome || "").toLowerCase();
      case "codigo": return String(i.codigo_inscricao || "");
      case "status": return String(i.status || "");
      case "presente": return i.presente ? 1 : 0;
      default: return String(i.criado_em || "");
    }
  }

  function filteredPeople() {
    const q = (qs("search")?.value || "").toLowerCase().trim();
    const st = qs("f-status")?.value;
    const pr = qs("f-presente")?.value;
    const ob = qs("f-onibus")?.value;
    const fx = qs("f-faixa")?.value;
    const list = (data.inscricoes || []).filter((i) => {
      const blob = `${i.nome_completo} ${i.codigo_inscricao} ${i.whatsapp} ${i.cidade} ${i.comunidade} ${i.grupo_movimento}`.toLowerCase();
      if (q && !blob.includes(q)) return false;
      if (st && i.status !== st) return false;
      if (pr === "1" && !i.presente) return false;
      if (pr === "0" && i.presente) return false;
      if (ob && i.onibus_id !== ob) return false;
      if (fx && i.faixa_etaria_id !== fx) return false;
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      const x = sortValue(a);
      const y = sortValue(b);
      if (x < y) return -dir;
      if (x > y) return dir;
      return 0;
    });
  }

  function faixaDoOnibus(o) {
    return (data.faixas || []).find((f) => f.id === o.faixa_etaria_id) || null;
  }
  function busOptions(exceptId, selectedId) {
    return (data.onibus || [])
      .filter((o) => o.id !== exceptId)
      .map((o) => `<option value="${o.id}" ${o.id === selectedId ? "selected" : ""}>${esc(o.nome)}${o.livres <= 0 ? " (lotado)" : ""}</option>`)
      .join("");
  }
  function moveBox(person) {
    if (person.status === "cancelada") return "";
    return `<select class="admin-select" aria-label="Mover ${esc(person.nome_completo)}" data-move-sel="${person.id}">
        <option value="">Mover para…</option>
        ${busOptions(person.onibus_id)}
      </select>
      <button class="btn-admin" data-move="${person.id}" type="button">Mover</button>`;
  }
  async function moverInscrito(id, destId) {
    if (!id || !destId) {
      if (id && !destId) toast("Escolha o ônibus de destino.", "warn");
      return;
    }
    const person = data.inscricoes.find((i) => i.id === id);
    const dest = data.onibus.find((o) => o.id === destId);
    if (!person || !dest) return;
    if (person.onibus_id === destId) return;
    if (dest.livres <= 0 && person.onibus_id !== destId) {
      toast(`${dest.nome} está lotado.`, "warn");
      return;
    }
    const yes = await ask(`Mover ${person.nome_completo} para o ${dest.nome}?`, { title: "Trocar de ônibus", ok: "MOVER" });
    if (!yes) return;
    await window.DNJApi.transfer(adminEmail, password, id, destId);
    await refresh();
    if (view === "buses" && currentBusId) openBus(currentBusId);
    toast(`${person.nome_completo} agora está no ${dest.nome}.`);
  }

  function busCard(o) {
    const dots = Array.from({ length: Math.min(o.capacidade, 40) }, (_, n) => `<i class="${n < o.ocupados ? "on" : ""}"></i>`).join("");
    const faixa = faixaDoOnibus(o);
    return `<article class="bus-card" data-bus="${o.id}" style="background:linear-gradient(160deg, ${o.cor}, #3d1018)">
      <h3>ÔNIBUS ${String(o.numero).padStart(2, "0")}</h3>
      <p class="muted">${esc(o.nome)}</p>
      <p class="muted">${faixa ? esc(faixa.nome) : "Faixa não definida"}</p>
      <div class="bus-seats">${dots}</div>
      <p><b>${o.ocupados} / ${o.capacidade}</b> · ${o.livres} livres</p>
      <div class="bar"><span style="width:${o.percentual}%"></span></div>
      <span class="chip">${o.percentual}% ocupado</span>
      <span class="bus-wheel a"></span><span class="bus-wheel b"></span>
    </article>`;
  }

  function renderStats() {
    const s = data.stats || {};
    const hour = new Date().getHours();
    const greet = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
    const cap = s.capacidade ?? 0;
    const conf = s.confirmadas ?? 0;
    const pres = s.presentes ?? 0;
    qs("hello").textContent = adminName ? `${greet}, ${adminName}!` : (data.saudacao || "Olá, administrador!");
    qs("stats").innerHTML = [
      ["Inscritos", s.total ?? 0, "Cadastros no sistema", "ink"],
      ["Confirmados", conf, cap ? `${cap} lugares no total` : "Com assento garantido", "leaf"],
      ["Presentes", pres, conf ? `${Math.round((100 * pres) / conf)}% dos confirmados` : "Check-ins feitos", "gold"],
      ["Vagas livres", s.vagas ?? 0, "Assentos disponíveis", "orange"],
      ["Lista de espera", s.espera ?? 0, "Aguardando vaga", "wine"],
      ["Novos hoje", s.hoje ?? 0, "Inscrições de hoje", "ink"],
    ].map(([label, value, hint, tone]) =>
      `<article class="stat is-${tone}"><b>${value}</b><span>${label}</span><i>${esc(hint)}</i></article>`).join("");

    const box = qs("occupancy");
    if (box) {
      const pct = cap ? Math.round((100 * conf) / cap) : 0;
      box.innerHTML = `<div class="occ-line"><span>Ocupação geral da caravana</span><b>${conf}/${cap || 0} · ${pct}%</b></div>
        <div class="occ-bar"><span style="width:${Math.min(pct, 100)}%"></span></div>`;
    }
  }
  function renderBuses() {
    const buses = data.onibus || [];
    qs("bus-cards").innerHTML = buses.map((o) => busCard(o)).join("") || "<p class='empty'>Nenhum ônibus cadastrado.</p>";
    qs("bus-detail-cards").innerHTML = buses.map((o) => busCard(o)).join("");
    qs("bus-detail-cards").querySelectorAll(".bus-card").forEach((el) => {
      el.addEventListener("dragover", (e) => e.preventDefault());
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/inscricao");
        const person = data.inscricoes.find((i) => i.id === id);
        if (!person) return;
        const dest = data.onibus.find((o) => o.id === el.dataset.bus);
        pendingTransfer = { id, dest };
        qs("transfer-text").textContent = `Deseja transferir ${person.nome_completo} para o ${dest.nome}?`;
        qs("transfer").showModal();
      });
    });
  }
  function renderMatrix() {
    const heads = (data.onibus || []).map((o) => `<th>${esc(o.nome)}</th>`).join("");
    const rows = (data.matriz || []).map((m) => `<tr><th>${esc(m.faixa)}</th>${m.valores.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("");
    qs("matrix").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Faixa</th>${heads}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function renderCharts() {
    const h = (list, max) => list.map((i) => {
      const t = i.total || 0;
      const w = max ? Math.max(6, (100 * t) / max) : 0;
      return `<div class="hbar"><span>${esc(i.nome || i.dia)}</span><em style="width:${w}%;background:${i.cor || "var(--orange)"}"></em><b>${t}</b></div>`;
    }).join("");
    const g = data.graficos || {};
    const buses = data.onibus || [];
    const maxF = Math.max(1, ...(g.faixas || []).map((x) => x.total), 0);
    const maxC = Math.max(1, ...(g.cidades || []).map((x) => x.total), 0);
    const maxD = Math.max(1, ...(g.dias || []).map((x) => x.total), 0);
    const ck = g.checkins || { presentes: 0, total: 1 };
    const maxB = Math.max(1, ...buses.map((o) => o.ocupados || 0), 0);
    qs("charts").innerHTML = `
      <article class="chart"><h3>Por faixa etária</h3>${h(g.faixas || [], maxF)}</article>
      <article class="chart"><h3>Por cidade</h3>${h(g.cidades || [], maxC) || "<p>Sem dados</p>"}</article>
      <article class="chart"><h3>Por ônibus</h3>${h(buses.map((o) => ({ nome: o.nome, total: o.ocupados, cor: o.cor })), maxB)}</article>
      <article class="chart"><h3>Check-ins</h3><div class="bar"><span style="width:${ck.total ? (100 * ck.presentes) / ck.total : 0}%"></span></div><p>${ck.presentes} de ${ck.total}</p></article>
      <article class="chart"><h3>Por dia</h3>${h(g.dias || [], maxD) || "<p>Sem dados</p>"}</article>`;
  }
  function syncFilterOptions() {
    const ob = qs("f-onibus");
    const fx = qs("f-faixa");
    const busSign = data.onibus.map((o) => `${o.id}:${o.nome}`).join("|");
    const fxSign = data.faixas.map((f) => `${f.id}:${f.nome}`).join("|");
    if (ob.dataset.sign !== busSign) {
      const keep = ob.value;
      ob.innerHTML = `<option value="">Ônibus</option>` + data.onibus.map((o) => `<option value="${o.id}">${esc(o.nome)}</option>`).join("");
      ob.value = keep;
      ob.dataset.sign = busSign;
    }
    if (fx.dataset.sign !== fxSign) {
      const keep = fx.value;
      fx.innerHTML = `<option value="">Faixa etária</option>` + data.faixas.map((f) => `<option value="${f.id}">${esc(f.nome)}</option>`).join("");
      fx.value = keep;
      fx.dataset.sign = fxSign;
    }
  }

  function renderPeople(force) {
    // Evita trocar a tabela embaixo do dedo de quem está com um seletor de ônibus aberto.
    const active = document.activeElement;
    if (!force && active?.tagName === "SELECT" && active.closest("#rows")) return;
    const list = filteredPeople();
    const count = qs("people-count");
    const total = data.inscricoes.length;
    if (count) count.textContent = list.length === total ? `${total} pessoas` : `${list.length} de ${total} pessoas`;
    qs("empty").hidden = list.length > 0;
    syncFilterOptions();
    document.querySelectorAll(".th-sort").forEach((th) => {
      const on = th.dataset.sort === sort.key;
      th.classList.toggle("is-sorted", on);
      th.dataset.dir = on ? sort.dir : "";
    });
    const statusClass = (st) => (st === "confirmada" ? "badge-ok" : st === "lista_espera" ? "badge-wait" : "badge-off");
    qs("rows").innerHTML = list.map((i, n) => `<tr draggable="true" data-id="${i.id}" class="${i.presente ? "is-present" : ""}">
      <td data-label="Nº">${n + 1}</td>
      <td data-label="Nome"><strong>${esc(i.nome_completo)}</strong></td>
      <td data-label="Idade">${i.idade || "—"}</td>
      <td data-label="Faixa">${esc(i.faixa_nome || "—")}</td>
      <td data-label="Ônibus">${esc(i.onibus_nome || "—")}</td>
      <td data-label="WhatsApp">${waCell(i.whatsapp)}</td>
      <td data-label="Código" class="code-cell">${esc(i.codigo_inscricao)}</td>
      <td data-label="Status"><span class="badge ${statusClass(i.status)}">${esc(String(i.status || "").replace("_", " "))}</span></td>
      <td data-label="Presença"><button class="pill ${i.presente ? "is-on" : "is-off"}" data-check="${esc(i.codigo_inscricao)}" type="button">${i.presente ? "Presente" : "Check-in"}</button></td>
      <td class="cell-actions" data-label="Ações">
        <div class="row-actions">
          ${moveBox(i)}
          ${i.status === "cancelada" ? "" : `<button class="btn-admin" data-cancel="${i.id}" type="button">Cancelar</button>`}
          <button class="btn-admin btn-danger" data-del="${i.id}" data-nome="${esc(i.nome_completo)}" type="button">Excluir</button>
        </div>
      </td>
    </tr>`).join("");
    qs("rows").querySelectorAll("tr[draggable]").forEach((tr) => {
      tr.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/inscricao", tr.dataset.id));
    });
  }
  function renderWait() {
    const ids = (data.espera || []).map((e) => e.inscricao_id);
    const people = ids.map((id) => data.inscricoes.find((i) => i.id === id)).filter(Boolean);
    qs("wait-alert").textContent = people.length ? `${people.length} pessoa(s) aguardando vaga.` : "Lista de espera vazia.";
    qs("wait-rows").innerHTML = people.length
      ? people.map((i, n) => `<tr>
          <td data-label="Posição">${n + 1}º</td>
          <td data-label="Nome"><strong>${esc(i.nome_completo)}</strong></td>
          <td data-label="Idade">${i.idade || "—"}</td>
          <td data-label="Código" class="code-cell">${esc(i.codigo_inscricao)}</td>
          <td data-label="Desde">${when(i.criado_em)}</td>
          <td data-label="Ações" class="cell-actions"><button class="btn-admin btn-danger" data-del="${i.id}" data-nome="${esc(i.nome_completo)}" type="button">Excluir</button></td>
        </tr>`).join("")
      : `<tr><td colspan="6" class="empty">Ninguém na espera agora.</td></tr>`;
  }
  function renderSettings() {
    const c = data.configuracoes || {};
    const form = qs("cfg-form");
    form.nome_evento.value = c.nome_evento || "Caravana Geração Eucarística ao DNJ";
    form.data_evento.value = String(c.data_evento || "").slice(0, 10);
    form.local_evento.value = c.local_evento || "";
    form.modo_distribuicao.value = c.modo_distribuicao || "equilibrado_faixa";
    form.limite_maximo.value = c.limite_maximo ?? "";
    form.inscricoes_abertas.checked = c.inscricoes_abertas !== false;
    form.lista_espera_ativa.checked = c.lista_espera_ativa !== false;
    qs("cfg-buses").innerHTML = data.onibus.map((o, i) => `<div class="cfg-grid">
      <label class="field"><span>Nome ônibus ${o.numero}</span><input name="bus_nome_${i}" value="${esc(o.nome)}" data-id="${o.id}" /></label>
      <label class="field"><span>Capacidade</span><input type="number" min="1" name="bus_cap_${i}" value="${o.capacidade}" data-id="${o.id}" /></label>
      <label class="field"><span>Faixa etária deste ônibus</span>
        <select name="bus_faixa_${i}">
          <option value="">Sem faixa definida</option>
          ${data.faixas.map((fx) => `<option value="${fx.id}" ${fx.id === o.faixa_etaria_id ? "selected" : ""}>${esc(fx.nome)}</option>`).join("")}
        </select>
      </label>
    </div>`).join("");
    qs("cfg-faixas").innerHTML = data.faixas.map((f, i) => `<div class="cfg-grid">
      <label class="field"><span>Nome da faixa</span><input name="fx_nome_${i}" value="${esc(f.nome)}" data-id="${f.id}" /></label>
      <label class="field"><span>Idade mínima</span><input type="number" name="fx_min_${i}" value="${f.idade_minima}" /></label>
      <label class="field"><span>Idade máxima</span><input type="number" name="fx_max_${i}" value="${f.idade_maxima}" /></label>
    </div>`).join("");
  }
  function openBus(id) {
    const o = data.onibus.find((b) => b.id === id);
    if (!o) return;
    currentBusId = id;
    const faixa = faixaDoOnibus(o);
    const seats = [];
    for (let n = 1; n <= o.capacidade; n += 1) {
      const p = (o.passageiros || []).find((i) => Number(i.assento) === n);
      const cls = p ? (p.presente ? "here" : "occ") : "";
      const title = p ? `${esc(p.nome_completo)} · ${p.idade} anos · ${esc(p.faixa_nome || "")} · ${esc(p.codigo_inscricao)}` : "Disponível";
      seats.push(`<button class="seat ${cls}" title="${title}" type="button">${p ? esc(p.nome_completo.split(" ")[0]) : n}</button>`);
    }
    qs("bus-interior").hidden = false;
    qs("bus-interior").innerHTML = `<h2>${esc(o.nome)}</h2>
      <p>${o.ocupados}/${o.capacidade} passageiros · ${faixa ? esc(faixa.nome) : "sem faixa definida"} · use Mover para trocar de ônibus</p>
      <div class="seat-map">${seats.join("")}</div>
      <div class="table-wrap" style="margin-top:16px"><table>
        <thead><tr><th>Assento</th><th>Nome</th><th>Idade</th><th>Faixa</th><th>WhatsApp</th><th>Código</th><th>Presença</th><th>Mover</th></tr></thead>
        <tbody>${(o.passageiros || []).map((p) => `<tr>
          <td>${p.assento || "—"}</td>
          <td>${esc(p.nome_completo)}</td>
          <td>${p.idade}</td>
          <td>${esc(p.faixa_nome || "")}</td>
          <td>${esc(p.whatsapp || "")}</td>
          <td class="code-cell">${esc(p.codigo_inscricao)}</td>
          <td>${p.presente ? "Sim" : "Não"}</td>
          <td class="cell-actions"><div class="row-actions">${moveBox(p)}</div></td>
        </tr>`).join("") || `<tr><td colspan="8" class="empty">Nenhum ocupante neste ônibus.</td></tr>`}</tbody>
      </table></div>`;
  }

  function paint(opts = {}) {
    if (!data) return;
    const run = (fn) => { try { fn(); } catch (err) { console.error(err); } };
    run(renderStats);
    run(renderBuses);
    run(renderMatrix);
    run(renderCharts);
    run(renderPeople);
    run(renderWait);
    if (view !== "settings" || opts.settings) run(renderSettings);
    document.querySelectorAll(".dash-view").forEach((el) => { el.hidden = el.id !== `view-${view}`; });
    document.querySelectorAll("[data-view]").forEach((btn) => btn.classList.toggle("is-on", btn.dataset.view === view));
  }

  async function refresh() {
    data = await window.DNJApi.dashboard(adminEmail, password);
    paint();
    stampNow();
  }

  function go(name) {
    view = name;
    paint({ settings: name === "settings" });
    if (name === "buses") {
      if (currentBusId) openBus(currentBusId);
      else qs("bus-interior").hidden = true;
    }
  }

  function showCfg(ok, text) {
    const box = qs("cfg-msg");
    if (!box) return;
    box.hidden = false;
    box.textContent = text;
    box.style.color = ok ? "var(--leaf)" : "var(--wine)";
  }

  document.querySelectorAll("[data-view]").forEach((btn) => btn.addEventListener("click", () => go(btn.dataset.view)));
  qs("bus-detail-cards").addEventListener("click", (e) => {
    const card = e.target.closest(".bus-card");
    if (card) openBus(card.dataset.bus);
  });
  qs("bus-interior").addEventListener("click", async (e) => {
    const mover = e.target.closest("[data-move]");
    if (!mover) return;
    const sel = qs("bus-interior").querySelector(`[data-move-sel="${mover.dataset.move}"]`);
    try {
      await moverInscrito(mover.dataset.move, sel?.value);
    } catch (err) {
      toast(err?.message || "Não foi possível mover.", "err");
    }
  });
  qs("search").addEventListener("input", () => renderPeople(true));
  ["f-status","f-presente","f-onibus","f-faixa"].forEach((id) => qs(id).addEventListener("change", () => renderPeople(true)));
  qs("btn-clear").addEventListener("click", () => {
    qs("search").value = "";
    ["f-status","f-presente","f-onibus","f-faixa"].forEach((id) => { qs(id).value = ""; });
    renderPeople(true);
  });
  document.querySelectorAll(".th-sort").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      sort = sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" };
      renderPeople(true);
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || dash.hidden) return;
    const el = document.activeElement;
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    if (view !== "people") go("people");
    e.preventDefault();
    qs("search").focus();
  });
  qs("btn-refresh").addEventListener("click", async () => {
    const btn = qs("btn-refresh");
    btn.disabled = true;
    try {
      await refresh();
      toast("Dados atualizados.");
    } catch (err) {
      toast(err?.message || "Não foi possível atualizar agora.", "err");
    } finally {
      btn.disabled = false;
    }
  });

  qs("rows").addEventListener("click", async (e) => {
    const check = e.target.closest("[data-check]");
    const cancel = e.target.closest("[data-cancel]");
    const del = e.target.closest("[data-del]");
    try {
      if (check) {
        await window.DNJApi.checkin(adminEmail, password, check.dataset.check);
        await refresh();
        toast("Presença registrada.");
      }
      if (cancel) {
        const yes = await ask("O assento será liberado na hora, mas o cadastro da pessoa continua salvo.", { title: "Cancelar inscrição", ok: "CANCELAR INSCRIÇÃO", danger: true });
        if (yes) {
          await window.DNJApi.update(adminEmail, password, cancel.dataset.cancel, { status: "cancelada" });
          await refresh();
          toast("Inscrição cancelada.");
        }
      }
      if (del) {
        const yes = await ask(`Excluir ${del.dataset.nome}? A inscrição some da lista, a vaga do ônibus é liberada e a pessoa pode se inscrever de novo.`, { title: "Excluir inscrição", ok: "EXCLUIR", danger: true });
        if (yes) {
          await window.DNJApi.remove(adminEmail, password, del.dataset.del);
          await refresh();
          toast("Inscrição excluída.");
        }
      }
      const mover = e.target.closest("[data-move]");
      if (mover) {
        const sel = qs("rows").querySelector(`[data-move-sel="${mover.dataset.move}"]`);
        await moverInscrito(mover.dataset.move, sel?.value);
      }
    } catch (err) {
      toast(err?.message || "Não foi possível concluir a ação.", "err");
    }
  });
  qs("wait-rows").addEventListener("click", async (e) => {
    const del = e.target.closest("[data-del]");
    if (!del) return;
    try {
      const yes = await ask(`Excluir ${del.dataset.nome} da lista de espera?`, { title: "Excluir da espera", ok: "EXCLUIR", danger: true });
      if (yes) {
        await window.DNJApi.remove(adminEmail, password, del.dataset.del);
        await refresh();
        toast("Removido da lista de espera.");
      }
    } catch (err) {
      toast(err?.message || "Não foi possível excluir.", "err");
    }
  });
  qs("btn-promote").addEventListener("click", async () => {
    const btn = qs("btn-promote");
    btn.disabled = true;
    try {
      const r = await window.DNJApi.promover(adminEmail, password, null);
      await refresh();
      toast(r?.alerta || (r ? "Próximo da fila foi promovido." : "Ninguém na espera ou sem vaga."), r ? "ok" : "warn");
    } catch (err) {
      toast(err?.message || "Não foi possível promover.", "err");
    } finally {
      btn.disabled = false;
    }
  });
  qs("ask-no").addEventListener("click", () => closeAsk(false));
  qs("ask-yes").addEventListener("click", () => closeAsk(true));
  qs("ask").addEventListener("close", () => closeAsk(false));
  qs("transfer-no").addEventListener("click", () => qs("transfer").close());
  qs("transfer-yes").addEventListener("click", async () => {
    try {
      if (pendingTransfer) await window.DNJApi.transfer(adminEmail, password, pendingTransfer.id, pendingTransfer.dest.id);
      qs("transfer").close();
      await refresh();
      toast("Passageiro transferido.");
    } catch (err) {
      qs("transfer").close();
      toast(err?.message || "Não foi possível transferir.", "err");
    }
  });
  qs("cfg-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button[type="submit"]');
    const nova = f.nova_senha.value;
    const conf = f.nova_senha_conf.value;
    if (nova || conf) {
      if (nova.length < 10) {
        showCfg(false, "A nova senha deve ter pelo menos 10 caracteres.");
        return;
      }
      if (nova.toLowerCase() === "geracao2026") {
        showCfg(false, "Escolha uma senha diferente da senha inicial.");
        return;
      }
      if (nova !== conf) {
        showCfg(false, "As senhas não coincidem.");
        return;
      }
    }
    btn.disabled = true;
    showCfg(true, "Salvando...");
    try {
      const payload = {
        nome_evento: f.nome_evento.value.trim(),
        data_evento: f.data_evento.value || null,
        local_evento: f.local_evento.value.trim(),
        modo_distribuicao: f.modo_distribuicao.value,
        limite_maximo: f.limite_maximo.value ? Number(f.limite_maximo.value) : null,
        inscricoes_abertas: f.inscricoes_abertas.checked,
        lista_espera_ativa: f.lista_espera_ativa.checked,
        onibus: data.onibus.map((o, i) => ({
          id: o.id,
          nome: f[`bus_nome_${i}`].value.trim(),
          capacidade: Number(f[`bus_cap_${i}`].value),
          faixa_etaria_id: f[`bus_faixa_${i}`].value || null,
        })),
        faixas: data.faixas.map((fx, i) => ({
          id: fx.id,
          nome: f[`fx_nome_${i}`].value.trim(),
          idade_minima: Number(f[`fx_min_${i}`].value),
          idade_maxima: Number(f[`fx_max_${i}`].value),
        })),
      };
      if (nova) payload.nova_senha = nova;
      await window.DNJApi.saveConfig(adminEmail, password, payload);
      if (nova) {
        password = nova;
        sessionStorage.setItem(KEY, password);
        f.nova_senha.value = "";
        f.nova_senha_conf.value = "";
      }
      data = await window.DNJApi.dashboard(adminEmail, password);
      paint({ settings: true });
      showCfg(true, "Configurações salvas.");
    } catch (err) {
      showCfg(false, err?.message || "Não foi possível salvar. Tente de novo.");
    } finally {
      btn.disabled = false;
    }
  });

  function exportRows(kind) {
    const list = filteredPeople();
    const rows = list.map((i) => ({
      codigo: i.codigo_inscricao, nome: i.nome_completo, idade: i.idade, faixa: i.faixa_nome,
      onibus: i.onibus_nome, whatsapp: i.whatsapp, cidade: i.cidade, status: i.status, presente: i.presente ? "sim" : "nao",
    }));
    if (kind === "csv") {
      const header = Object.keys(rows[0] || { codigo: "", nome: "" }).join(",");
      const body = rows.map((r) => Object.values(r).map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + header + "\n" + body], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "dnj-2026.csv";
      a.click();
      return;
    }
    if (kind === "xlsx" && window.XLSX) {
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(rows), "Inscritos");
      window.XLSX.writeFile(wb, "dnj-2026.xlsx");
      return;
    }
    const stamp = new Date().toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" });
    const bodyRows = rows.length
      ? rows.map((r) => `<tr>
          <td class="code">${esc(r.codigo)}</td>
          <td>${esc(r.nome)}</td>
          <td>${esc(r.idade)}</td>
          <td>${esc(r.faixa)}</td>
          <td>${esc(r.onibus)}</td>
          <td>${esc(r.whatsapp)}</td>
          <td>${esc(r.cidade)}</td>
          <td>${esc(r.status)}</td>
          <td>${esc(r.presente)}</td>
        </tr>`).join("")
      : `<tr><td colspan="9" class="empty">Nenhum inscrito neste filtro.</td></tr>`;
    const win = window.open("", "_blank");
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Caravana Geração Eucarística ao DNJ · Inscritos</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cormorant+Garamond:ital,wght@0,600;1,500&family=Great+Vibes&family=Outfit:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>
  :root{--cream:#f6ead2;--orange:#c45c26;--wine:#6b1c28;--gold:#e8b84a;--ink:#2c1a12;--ink-soft:#5a3d2e}
  *{box-sizing:border-box}
  html,body{margin:0;background:var(--cream);color:var(--ink);font-family:Outfit,system-ui,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sheet{min-height:100vh;display:flex;flex-direction:column}
  header{padding:28px 32px 20px;background:linear-gradient(180deg,#8b1e2d,#6b1c28);color:#f8eedc;border-bottom:4px solid var(--gold)}
  .org{margin:0;letter-spacing:.16em;text-transform:uppercase;font-size:.68rem;color:var(--gold);font-weight:700}
  h1{margin:4px 0 0;font-family:"Bebas Neue",sans-serif;font-size:3rem;letter-spacing:.08em;line-height:.85}
  h1 span{color:var(--gold)}
  .verse{margin:8px 0 0;font-family:"Cormorant Garamond",serif;font-style:italic;color:#f5c84c}
  .meta{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:14px 32px;background:rgba(255,248,234,.7);border-bottom:1px solid rgba(196,92,38,.15);font-size:.88rem;color:var(--ink-soft)}
  .meta b{color:var(--orange);font-family:"Bebas Neue",sans-serif;letter-spacing:.06em;font-size:1.15rem;font-weight:400}
  main{flex:1;padding:18px 24px 32px}
  table{width:100%;border-collapse:collapse;background:#fff8ea;border-radius:12px;overflow:hidden}
  th{background:var(--wine);color:#f8eedc;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;padding:10px 8px;text-align:left}
  td{padding:9px 8px;border-bottom:1px solid rgba(196,92,38,.12);font-size:.84rem}
  tr:nth-child(even) td{background:rgba(245,200,76,.1)}
  td.code{font-family:"Bebas Neue",sans-serif;letter-spacing:.06em;color:var(--wine);font-size:1rem}
  td.empty{text-align:center;padding:28px;color:var(--ink-soft)}
  footer{margin-top:auto;background:linear-gradient(180deg,#8b1e2d,#6b1c28);color:#f8eedc;padding:18px 32px 14px;border-top:3px solid var(--gold)}
  .foot-grid{display:grid;grid-template-columns:1.2fr 1fr 1.4fr;gap:16px;font-size:.82rem}
  .foot-kicker{margin:0;font-family:"Bebas Neue",sans-serif;font-size:1.8rem;letter-spacing:.08em;color:var(--gold)}
  .script{margin:0;font-family:"Great Vibes",cursive;font-size:1.6rem;color:#f5c84c}
  .contacts{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px}
  .contacts span{display:block;opacity:.75;font-size:.72rem}
  .bar{margin:14px -32px -14px;padding:8px 32px;text-align:center;font-size:.72rem;letter-spacing:.08em;background:#3d1018}
  @media print{@page{size:A4 landscape;margin:8mm} header,footer,.meta{break-inside:avoid} tr{break-inside:avoid}}
</style></head><body><div class="sheet">
<header>
  <p class="org">Caravana Geração Eucarística ao DNJ · Santo Antônio — Bacaxá</p>
  <h1>DNJ <span>2026</span></h1>
  <p class="verse">“Vinho novo em odres novos” · Lc 5,37</p>
</header>
<div class="meta"><span><b>Lista de inscritos</b><br>18 de outubro de 2026 · Orla do Marine — Maricá</span><span>Gerado em ${esc(stamp)}<br>${rows.length} registro(s)</span></div>
<main><table>
  <thead><tr><th>Código</th><th>Nome</th><th>Idade</th><th>Faixa</th><th>Ônibus</th><th>WhatsApp</th><th>Cidade</th><th>Status</th><th>Presente</th></tr></thead>
  <tbody>${bodyRows}</tbody>
</table></main>
<footer>
  <div class="foot-grid">
    <div><p class="foot-kicker">Caravana ao DNJ</p><p class="script">novos.</p></div>
    <div>Paróquia Santo Antônio — Bacaxá<br>Saquarema/RJ</div>
    <div class="contacts">
      <div><span>Beatriz Moreira</span>22 92005-0790</div>
      <div><span>Maria Eduarda Alves</span>22 99287-5757</div>
      <div><span>João Gabriel</span>22 99738-4117</div>
      <div><span>Lavínia</span>22 99818-7602</div>
    </div>
  </div>
  <p class="bar">Setor Juventude — Arquidiocese de Niterói · DNJ 2026</p>
</footer>
</div>
<script>setTimeout(function(){window.print();},400);</script>
</body></html>`);
    win.document.close();
  }
  function runExport(kind, label) {
    const list = filteredPeople();
    if (!list.length) {
      toast("Nenhum inscrito nos filtros atuais para exportar.", "warn");
      return;
    }
    try {
      exportRows(kind);
      toast(`${label} gerado com ${list.length} registro(s).`);
    } catch (err) {
      toast(err?.message || "Não foi possível exportar.", "err");
    }
  }
  qs("btn-csv").addEventListener("click", () => runExport("csv", "CSV"));
  qs("btn-xlsx").addEventListener("click", () => runExport("xlsx", "Excel"));
  qs("btn-pdf").addEventListener("click", () => runExport("pdf", "PDF"));
  qs("btn-logout").addEventListener("click", () => {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(EMAIL_KEY);
    sessionStorage.removeItem(NAME_KEY);
    document.body.classList.remove("dash-on");
    window.location.reload();
  });

  function showFirstAccess() {
    loginView.hidden = true;
    dash.hidden = true;
    document.body.classList.remove("dash-on");
    firstAccess.hidden = false;
    qs("first-access-error").hidden = true;
    qs("first-access-form").reset();
    qs("first-access-form").nova_senha.focus();
  }

  async function enter() {
    const errBox = qs("login-error");
    const dashErr = qs("dash-error");
    if (dashErr) dashErr.hidden = true;
    if (isDefaultPassword(password)) {
      showFirstAccess();
      return;
    }
    firstAccess.hidden = true;
    try {
      await refresh();
      loginView.hidden = true;
      dash.hidden = false;
      document.body.classList.add("dash-on");
      clearInterval(timer);
      timer = setInterval(() => {
        if (!document.hidden) refresh().catch(() => {});
      }, 6000);
      const s = window.DNJApi.client?.();
      if (s?.channel) {
        s.channel("dnj-live")
          .on("postgres_changes", { event: "*", schema: "public", table: "inscricoes" }, () => refresh())
          .on("postgres_changes", { event: "*", schema: "public", table: "checkins" }, () => refresh())
          .subscribe();
      }
    } catch (err) {
      loginView.hidden = false;
      dash.hidden = true;
      document.body.classList.remove("dash-on");
      if (errBox) {
        errBox.hidden = false;
        errBox.textContent = err?.message || "Não foi possível carregar o dashboard. Confira a conexão e tente de novo.";
      }
    }
  }
  qs("first-access-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const errBox = qs("first-access-error");
    const btn = form.querySelector('button[type="submit"]');
    const label = btn.querySelector(".btn-cta-label");
    const nova = form.nova_senha.value;
    const conf = form.nova_senha_conf.value;
    const stop = (text) => {
      errBox.hidden = false;
      errBox.textContent = text;
    };
    errBox.hidden = true;
    if (nova.length < 10) return stop("A nova senha deve ter pelo menos 10 caracteres.");
    if (isDefaultPassword(nova)) return stop("Escolha uma senha diferente da senha inicial.");
    if (nova !== conf) return stop("As senhas não coincidem.");
    btn.disabled = true;
    label.textContent = "SALVANDO…";
    try {
      await window.DNJApi.saveConfig(adminEmail, password, { nova_senha: nova });
      password = nova;
      sessionStorage.setItem(KEY, password);
      firstAccess.hidden = true;
      await enter();
      toast("Senha atualizada. Avise a coordenação.");
    } catch (err) {
      stop(err?.message || "Não foi possível salvar a senha agora. Tente de novo.");
    } finally {
      btn.disabled = false;
      label.textContent = "SALVAR E ENTRAR";
    }
  });

  qs("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const label = btn?.querySelector(".btn-cta-label");
    if (btn) btn.disabled = true;
    if (label) label.textContent = "ENTRANDO…";
    try {
      const email = e.target.email.value.trim().toLowerCase();
      const result = await window.DNJApi.login(email, e.target.password.value);
      password = e.target.password.value;
      adminEmail = email;
      adminName = result?.nome || "";
      sessionStorage.setItem(KEY, password);
      sessionStorage.setItem(EMAIL_KEY, adminEmail);
      sessionStorage.setItem(NAME_KEY, adminName);
      await enter();
    } catch (_) {
      qs("login-error").hidden = false;
      qs("login-error").textContent = "E-mail ou senha incorretos.";
    } finally {
      if (btn) btn.disabled = false;
      if (label) label.textContent = "ENTRAR";
    }
  });
  if (password && adminEmail) {
    window.DNJApi.login(adminEmail, password).then((result) => {
      adminName = result?.nome || adminName;
      if (adminName) sessionStorage.setItem(NAME_KEY, adminName);
      return enter();
    }).catch(() => {
      sessionStorage.removeItem(KEY);
      sessionStorage.removeItem(EMAIL_KEY);
      sessionStorage.removeItem(NAME_KEY);
    });
  }
})();
