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

  async function request(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const response = await fetch(`${base}${path}`, { ...options, headers });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw fail(null, data, response.status);
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
    return raw || "Não foi possível concluir agora. Tente novamente.";
  }

  async function loadDashboard(pin) {
    const s = sb();
    const remote = await s.rpc("admin_dashboard", { p_pin: pin });
    if (!remote.error && remote.data) {
      return assemble(remote.data.inscricoes, remote.data.onibus, remote.data.faixas, remote.data.config, remote.data.espera);
    }
    const { error } = await s.rpc("admin_login", { p_pin: pin });
    if (error) throw fail({ message: friendlyError(error) }, null, 401);
    const [insc, buses, faixas, config, espera] = await Promise.all([
      s.from("inscricoes").select("*").order("criado_em", { ascending: false }),
      s.from("onibus").select("*").order("ordem"),
      s.from("faixas_etarias").select("*").order("prioridade"),
      s.from("configuracoes_evento").select("id,nome_evento,data_evento,local_evento,paroquia,grupo,inscricoes_abertas,lista_espera_ativa,limite_maximo,modo_distribuicao,atualizado_em").limit(1).maybeSingle(),
      s.from("lista_espera").select("*").eq("status", "aguardando"),
    ]);
    const firstErr = insc.error || buses.error || faixas.error || config.error || espera.error;
    if (firstErr) throw fail(firstErr);
    return assemble(insc.data, buses.data, faixas.data, config.data, espera.data);
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
    async getByCode(code) {
      const s = sb();
      if (s) {
        const { data, error } = await s.rpc("consultar_inscricao", { p_codigo: code });
        if (error || !data) throw fail({ message: "Inscrição não encontrada." }, null, 404);
        return data;
      }
      return request(`/inscricoes/${encodeURIComponent(code)}`);
    },
    async getByWhatsapp(phone) {
      const s = sb();
      if (s) {
        const { data, error } = await s.rpc("consultar_por_whatsapp", { p_whatsapp: phone });
        if (error || !data) throw fail({ message: "Inscrição não encontrada." }, null, 404);
        return data;
      }
      return request(`/inscricoes?whatsapp=${encodeURIComponent(phone)}`);
    },
    async lookup(query) {
      const q = String(query || "").trim();
      if (/^DNJ26/i.test(q) || q.includes("-")) return this.getByCode(q.toUpperCase());
      return this.getByWhatsapp(q);
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
    async login(password) {
      const s = sb();
      if (s) {
        const { error } = await s.rpc("admin_login", { p_pin: password });
        if (error) throw fail({ message: friendlyError(error) }, null, 401);
        return { ok: true };
      }
      return request("/admin/login", { method: "POST", body: JSON.stringify({ password }) });
    },
    async dashboard(password) {
      const s = sb();
      if (s) return loadDashboard(password);
      return request("/dashboard", { headers: { "X-Admin-Password": password } });
    },
    async update(password, id, body) {
      const s = sb();
      if (s) {
        const { data, error } = await s.rpc("admin_update_inscricao", { p_pin: password, p_id: id, p: body });
        if (error) throw fail(error);
        return data;
      }
      return request(`/inscricoes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "X-Admin-Password": password },
        body: JSON.stringify(body),
      });
    },
    async remove(password, id) {
      const s = sb();
      if (s) {
        const { data, error } = await s.rpc("admin_excluir_inscricao", { p_pin: password, p_id: id });
        if (error) throw fail(error);
        return data;
      }
      return request(`/inscricoes/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "X-Admin-Password": password },
      });
    },
    async transfer(password, inscricaoId, onibusId) {
      const s = sb();
      if (s) {
        const { data, error } = await s.rpc("admin_transfer", { p_pin: password, p_inscricao: inscricaoId, p_onibus: onibusId });
        if (error) throw fail(error);
        return data;
      }
      return request("/transferir", {
        method: "POST",
        headers: { "X-Admin-Password": password },
        body: JSON.stringify({ inscricao_id: inscricaoId, onibus_id: onibusId }),
      });
    },
    async checkin(password, codigo) {
      const s = sb();
      if (s) {
        const { data, error } = await s.rpc("admin_checkin", { p_pin: password, p_codigo: codigo });
        if (error) throw fail(error);
        return { already: data.already, message: data.already ? "CHECK-IN JA REALIZADO" : "CHECK-IN REALIZADO", inscricao: data.inscricao, checkin: data.checkin };
      }
      return request("/checkin", {
        method: "POST",
        headers: { "X-Admin-Password": password },
        body: JSON.stringify({ codigo }),
      });
    },
    async saveConfig(password, body) {
      const s = sb();
      if (s) {
        const { data, error } = await s.rpc("admin_save_config", { p_pin: password, p: body });
        if (error) throw fail({ message: friendlyError(error) });
        return data ?? body;
      }
      return request("/config", { method: "POST", headers: { "X-Admin-Password": password }, body: JSON.stringify(body) });
    },
    async promover(password, onibusId) {
      const s = sb();
      if (s) {
        const { data, error } = await s.rpc("admin_promover", { p_pin: password, p_onibus: onibusId || null });
        if (error) throw fail(error);
        return data;
      }
      return request("/espera/promover", { method: "POST", headers: { "X-Admin-Password": password }, body: JSON.stringify({ onibus_id: onibusId || null }) });
    },
    exportUrl(filtro = "todos") { return `${base}/export.csv?filtro=${encodeURIComponent(filtro)}`; },
  };
})();
