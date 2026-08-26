(() => {
  const cfg = window.DNJ_CONFIG || {};
  const base = cfg.apiUrl || "/api";
  let client = null;

  function sb() {
    if (client) return client;
    if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
      client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    }
    return client;
  }

  function fail(error, data, status) {
    const err = new Error(error?.message || data?.message || data?.error || "Falha na comunicação com o banco.");
    err.status = status || 400;
    err.data = data;
    return err;
  }

  function adminHeaders(email, password) {
    return {
      "X-Admin-Email": email || "",
      "X-Admin-Password": password || "",
    };
  }

  async function request(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const response = await fetch(`${base}${path}`, { ...options, headers });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw fail(null, data, response.status);
    return data;
  }

  async function adminRpc(name, email, password, extra = {}) {
    const s = sb();
    if (!s) throw fail({ message: "Supabase não configurado." });
    const { data, error } = await s.rpc(name, { p_email: email, p_pin: password, ...extra });
    if (error) throw fail({ message: friendlyError(error) }, null, /unauthorized/i.test(error.message || "") ? 401 : 400);
    return data;
  }

  function mapPerson(row, onibus, faixas) {
    const bus = (onibus || []).find((o) => o.id === row.onibus_id);
    const faixa = (faixas || []).find((f) => f.id === row.faixa_etaria_id);
    return {
      ...row,
      onibus_nome: row.onibus_nome || bus?.nome || null,
      faixa_nome: row.faixa_nome || faixa?.nome || null,
    };
  }

  function assemble(inscricoes, onibus, faixas, config, espera) {
    const people = (inscricoes || []).map((i) => mapPerson(i, onibus, faixas));
    const confirmadas = people.filter((i) => i.status === "confirmada");
    const caps = (onibus || []).reduce((sum, o) => sum + Math.max((o.capacidade || 0) - (o.capacidade_reservada || 0), 0), 0);
    const hour = new Date().getHours();
    const saudacao = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
    const onibusView = (onibus || []).sort((a, b) => a.ordem - b.ordem).map((o) => {
      const pax = confirmadas.filter((i) => i.onibus_id === o.id);
      const cap = Math.max((o.capacidade || 0) - (o.capacidade_reservada || 0), 0);
      return {
        ...o,
        capacidade: o.capacidade,
        ocupados: pax.length,
        livres: cap - pax.length,
        percentual: cap ? Math.round((100 * pax.length) / cap) : 0,
        faixas: (faixas || []).map((f) => ({ id: f.id, nome: f.nome, cor: f.cor, total: pax.filter((i) => i.faixa_etaria_id === f.id).length })),
        passageiros: pax,
      };
    });
    const matriz = (faixas || []).map((f) => ({
      faixa: f.nome,
      cor: f.cor,
      valores: onibusView.map((o) => confirmadas.filter((i) => i.faixa_etaria_id === f.id && i.onibus_id === o.id).length),
    }));
    const cidadesMap = {};
    const diasMap = {};
    people.forEach((i) => {
      if (i.cidade) cidadesMap[i.cidade] = (cidadesMap[i.cidade] || 0) + 1;
      const dia = String(i.criado_em || "").slice(0, 10);
      if (dia) diasMap[dia] = (diasMap[dia] || 0) + 1;
    });
    const hoje = new Date().toISOString().slice(0, 10);
    return {
      saudacao: `${saudacao}, administrador!`,
      configuracoes: config || {},
      faixas: faixas || [],
      onibus: onibusView,
      matriz,
      espera: espera || [],
      logs: [],
      inscricoes: people.sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em))),
      graficos: {
        faixas: (faixas || []).map((f) => ({ nome: f.nome, cor: f.cor, total: people.filter((i) => i.faixa_etaria_id === f.id).length })),
        cidades: Object.keys(cidadesMap).map((nome) => ({ nome, total: cidadesMap[nome] })),
        dias: Object.keys(diasMap).map((dia) => ({ dia, total: diasMap[dia] })),
        checkins: { presentes: people.filter((i) => i.presente).length, total: confirmadas.length },
      },
      stats: {
        total: people.length,
        confirmadas: confirmadas.length,
        presentes: people.filter((i) => i.presente).length,
        espera: (espera || []).length,
        vagas: Math.max(caps - confirmadas.length, 0),
        capacidade: caps,
        hoje: people.filter((i) => String(i.criado_em).startsWith(hoje)).length,
      },
    };
  }

  function friendlyError(error) {
    const raw = error?.message || "";
    if (/duplicate|23505/i.test(raw)) return "Este WhatsApp já possui inscrição. Consulte pelo código ou pelo número.";
    if (/fechadas/i.test(raw)) return "As inscrições estão temporariamente fechadas.";
    if (/lotados/i.test(raw)) return "Os ônibus estão lotados e a lista de espera não está ativa.";
    if (/Termos/i.test(raw)) return "É necessário autorizar o uso das informações para confirmar.";
    if (/lotado/i.test(raw)) return "Esse ônibus está lotado.";
    if (/not_found/i.test(raw)) return "Inscrição não encontrada.";
    if (/Senha fraca/i.test(raw)) return raw;
    if (/unauthorized/i.test(raw)) return "E-mail ou senha incorretos.";
    return raw || "Não foi possível concluir agora. Tente novamente.";
  }

  async function loadDashboard(email, password) {
    const remote = await adminRpc("admin_dashboard", email, password);
    if (!remote || typeof remote !== "object") throw fail({ message: "Dashboard indisponível. Tente entrar de novo." });
    return assemble(remote.inscricoes, remote.onibus, remote.faixas, remote.config, remote.espera);
  }

  window.DNJApi = {
    client: sb,
    async create(payload) {
      const s = sb();
      if (s) {
        const { data, error } = await s.rpc("registrar_inscricao", { p: payload });
        if (error) {
          const duplicate = /duplicate|23505/i.test(error.message || "");
          throw fail({ message: friendlyError(error) }, { error: duplicate ? "duplicate" : error.message }, duplicate ? 409 : 400);
        }
        return data;
      }
      return request("/inscricoes", { method: "POST", body: JSON.stringify(payload) });
    },
    async getByCode(code, nascimento) {
      const s = sb();
      if (s) {
        const { data, error } = await s.rpc("consultar_inscricao", { p_codigo: code, p_nascimento: nascimento });
        if (error || !data) throw fail({ message: "Inscrição não encontrada." }, null, 404);
        return data;
      }
      const qs = nascimento ? `?nascimento=${encodeURIComponent(nascimento)}` : "";
      return request(`/inscricoes/${encodeURIComponent(code)}${qs}`);
    },
    async getByWhatsapp(phone, nascimento) {
      const s = sb();
      if (s) {
        const { data, error } = await s.rpc("consultar_por_whatsapp", { p_whatsapp: phone, p_nascimento: nascimento });
        if (error || !data) throw fail({ message: "Inscrição não encontrada." }, null, 404);
        return data;
      }
      const qs = nascimento ? `?nascimento=${encodeURIComponent(nascimento)}` : "";
      return request(`/inscricoes/${encodeURIComponent(phone)}${qs}`);
    },
    async lookup(query, nascimento) {
      const q = String(query || "").trim();
      if (!nascimento) throw fail({ message: "Informe a data de nascimento." }, null, 400);
      if (/^DNJ26/i.test(q) || q.includes("-")) return this.getByCode(q.toUpperCase(), nascimento);
      return this.getByWhatsapp(q, nascimento);
    },
    async vagas() {
      const s = sb();
      if (s) {
        const { data, error } = await s.rpc("vagas_resumo");
        if (error) throw fail(error);
        return data;
      }
      return null;
    },
    async login(email, password) {
      const s = sb();
      if (s) {
        const data = await adminRpc("admin_login", email, password);
        return data || { ok: true };
      }
      return request("/admin/login", { method: "POST", body: JSON.stringify({ email, password }) });
    },
    async dashboard(email, password) {
      const s = sb();
      if (s) return loadDashboard(email, password);
      return request("/dashboard", { headers: adminHeaders(email, password) });
    },
    async adminLookup(email, password, codigo) {
      const s = sb();
      if (s) return adminRpc("admin_obter_inscricao", email, password, { p_codigo: codigo });
      return request(`/inscricoes/${encodeURIComponent(codigo)}`, { headers: adminHeaders(email, password) });
    },
    async update(email, password, id, body) {
      const s = sb();
      if (s) return adminRpc("admin_update_inscricao", email, password, { p_id: id, p: body });
      return request(`/inscricoes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { ...adminHeaders(email, password), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    async remove(email, password, id) {
      const s = sb();
      if (s) return adminRpc("admin_excluir_inscricao", email, password, { p_id: id });
      return request(`/inscricoes/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: adminHeaders(email, password),
      });
    },
    async transfer(email, password, inscricaoId, onibusId) {
      const s = sb();
      if (s) return adminRpc("admin_transfer", email, password, { p_inscricao: inscricaoId, p_onibus: onibusId });
      return request("/transferir", {
        method: "POST",
        headers: { ...adminHeaders(email, password), "Content-Type": "application/json" },
        body: JSON.stringify({ inscricao_id: inscricaoId, onibus_id: onibusId }),
      });
    },
    async checkin(email, password, codigo) {
      const s = sb();
      if (s) {
        const data = await adminRpc("admin_checkin", email, password, { p_codigo: codigo });
        return { already: data.already, message: data.already ? "CHECK-IN JA REALIZADO" : "CHECK-IN REALIZADO", inscricao: data.inscricao, checkin: data.checkin };
      }
      return request("/checkin", {
        method: "POST",
        headers: { ...adminHeaders(email, password), "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
    },
    async saveConfig(email, password, body) {
      const s = sb();
      if (s) {
        const data = await adminRpc("admin_save_config", email, password, { p: body });
        return data ?? body;
      }
      return request("/config", { method: "POST", headers: { ...adminHeaders(email, password), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    },
    async promover(email, password, onibusId) {
      const s = sb();
      if (s) return adminRpc("admin_promover", email, password, { p_onibus: onibusId || null });
      return request("/espera/promover", {
        method: "POST",
        headers: { ...adminHeaders(email, password), "Content-Type": "application/json" },
        body: JSON.stringify({ onibus_id: onibusId || null }),
      });
    },
    exportUrl(filtro = "todos") { return `${base}/export.csv?filtro=${encodeURIComponent(filtro)}`; },
  };
})();
