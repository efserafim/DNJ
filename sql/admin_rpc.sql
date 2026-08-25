-- Funcoes administrativas (SECURITY DEFINER + PIN)
-- O frontend usa a chave publica; o PIN nao viaja como senha do banco.

alter table public.onibus add column if not exists faixa_etaria_id uuid references public.faixas_etarias(id);

create or replace function public.escolher_onibus(p_faixa uuid)
returns uuid
language plpgsql
as $$
declare
  v_modo text;
  v_pref uuid;
  v_id uuid;
begin
  select modo_distribuicao into v_modo from public.configuracoes_evento limit 1;
  v_modo := coalesce(v_modo, 'equilibrado_faixa');

  if v_modo = 'manual' then
    return null;
  end if;

  if v_modo = 'por_faixa' then
    select o.id into v_id
    from public.onibus o
    where o.ativo = true
      and o.faixa_etaria_id = p_faixa
      and public.ocupacao_onibus(o.id) < public.capacidade_util(o.id)
    order by public.ocupacao_onibus(o.id), o.ordem
    limit 1;
    if v_id is not null then return v_id; end if;
    select onibus_preferido_id into v_pref from public.faixas_etarias where id = p_faixa;
    if v_pref is not null and public.ocupacao_onibus(v_pref) < public.capacidade_util(v_pref) then
      return v_pref;
    end if;
  end if;

  select o.id into v_id
  from public.onibus o
  where o.ativo = true
    and public.ocupacao_onibus(o.id) < public.capacidade_util(o.id)
  order by
    case when v_modo in ('equilibrado_faixa', 'por_faixa') and p_faixa is not null then
      case when o.faixa_etaria_id = p_faixa then 0 else 1 end
    else 0 end,
    case when v_modo in ('equilibrado_faixa', 'por_faixa') then (
      select count(*) from public.inscricoes i
      where i.onibus_id = o.id and i.faixa_etaria_id = p_faixa and i.status = 'confirmada'
    ) else 0 end,
    public.ocupacao_onibus(o.id),
    o.ordem
  limit 1;

  return v_id;
end;
$$;

create or replace function public.assert_admin_email(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
begin
  if p_email is null or length(trim(p_email)) = 0 then
    raise exception 'unauthorized';
  end if;
  select nome into v_nome
  from public.administradores
  where lower(trim(email)) = lower(trim(p_email))
    and ativo = true
  limit 1;
  if v_nome is null then
    raise exception 'unauthorized';
  end if;
  return v_nome;
end;
$$;

create or replace function public.assert_admin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stored text;
begin
  if p_pin is null or length(trim(p_pin)) = 0 then
    raise exception 'unauthorized';
  end if;
  select admin_pin into v_stored from public.configuracoes_evento limit 1;
  if v_stored is null or length(v_stored) = 0 then
    raise exception 'unauthorized';
  end if;
  if v_stored like '$2%' then
    if v_stored = crypt(trim(p_pin), v_stored) then
      return;
    end if;
  elsif v_stored = trim(p_pin) then
    return;
  end if;
  raise exception 'unauthorized';
end;
$$;

create or replace function public.assert_admin_session(p_email text, p_pin text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
begin
  v_nome := public.assert_admin_email(p_email);
  perform public.assert_admin(p_pin);
  return v_nome;
end;
$$;

drop function if exists public.admin_login(text);

create or replace function public.admin_login(p_email text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
begin
  v_nome := public.assert_admin_session(p_email, p_pin);
  return jsonb_build_object('ok', true, 'nome', v_nome, 'email', lower(trim(p_email)));
end;
$$;

drop function if exists public.admin_checkin(text, text);
drop function if exists public.admin_obter_inscricao(text, text, text);

create or replace function public.admin_obter_inscricao(p_email text, p_pin text, p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.inscricoes;
begin
  perform public.assert_admin_session(p_email, p_pin);
  select * into v from public.inscricoes
  where upper(codigo_inscricao) = upper(trim(p_codigo))
     or upper(qr_code) = upper(trim(p_codigo))
     or id::text = trim(p_codigo)
  limit 1;
  if v.id is null then
    raise exception 'not_found';
  end if;
  return to_jsonb(v) || jsonb_build_object(
    'onibus_nome', (select nome from public.onibus where id = v.onibus_id),
    'faixa_nome', (select nome from public.faixas_etarias where id = v.faixa_etaria_id)
  );
end;
$$;

create or replace function public.admin_checkin(p_email text, p_pin text, p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.inscricoes;
  c public.checkins;
begin
  perform public.assert_admin_session(p_email, p_pin);
  select * into v from public.inscricoes
  where codigo_inscricao = p_codigo or qr_code = p_codigo or id::text = p_codigo
  limit 1;
  if v.id is null then
    raise exception 'not_found';
  end if;
  select * into c from public.checkins where inscricao_id = v.id;
  if c.id is not null or v.presente then
    return jsonb_build_object('already', true, 'inscricao', to_jsonb(v), 'checkin', to_jsonb(c));
  end if;
  insert into public.checkins (inscricao_id, tipo)
  values (v.id, 'qr') returning * into c;
  update public.inscricoes set presente = true, atualizado_em = now() where id = v.id;
  select * into v from public.inscricoes where id = v.id;
  insert into public.logs (acao, entidade, entidade_id) values ('checkin_realizado', 'checkins', v.id::text);
  return jsonb_build_object('already', false, 'inscricao', to_jsonb(v), 'checkin', to_jsonb(c));
end;
$$;

drop function if exists public.admin_transfer(text, uuid, uuid);

create or replace function public.admin_transfer(p_email text, p_pin text, p_inscricao uuid, p_onibus uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.inscricoes;
  cap int;
  occ int;
  seat int;
begin
  perform public.assert_admin_session(p_email, p_pin);
  select * into v from public.inscricoes where id = p_inscricao;
  if v.id is null then raise exception 'not_found'; end if;
  cap := public.capacidade_util(p_onibus);
  occ := public.ocupacao_onibus(p_onibus);
  if v.onibus_id is distinct from p_onibus and occ >= cap then
    raise exception 'Onibus lotado';
  end if;
  update public.assentos set inscricao_id = null where inscricao_id = v.id;
  seat := public.proximo_assento(p_onibus);
  update public.inscricoes
    set onibus_id = p_onibus, assento = seat, status = 'confirmada', atualizado_em = now()
    where id = v.id;
  insert into public.assentos (onibus_id, numero, inscricao_id)
    values (p_onibus, seat, v.id)
    on conflict (onibus_id, numero) do update set inscricao_id = excluded.inscricao_id;
  update public.lista_espera set status = 'promovida' where inscricao_id = v.id and status = 'aguardando';
  select * into v from public.inscricoes where id = v.id;
  insert into public.logs (acao, entidade, entidade_id) values ('participante_transferido', 'inscricoes', v.id::text);
  return to_jsonb(v);
end;
$$;

drop function if exists public.admin_update_inscricao(text, uuid, jsonb);

create or replace function public.admin_update_inscricao(p_email text, p_pin text, p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v public.inscricoes;
begin
  perform public.assert_admin_session(p_email, p_pin);
  update public.inscricoes set
    nome_completo = coalesce(p->>'nome_completo', nome_completo),
    status = coalesce(p->>'status', status),
    observacoes = coalesce(p->>'observacoes', observacoes),
    atualizado_em = now()
  where id = p_id;
  if (p->>'status') = 'cancelada' then
    update public.assentos set inscricao_id = null where inscricao_id = p_id;
    update public.inscricoes set onibus_id = null, assento = null where id = p_id;
  end if;
  select * into v from public.inscricoes where id = p_id;
  insert into public.logs (acao, entidade, entidade_id) values ('inscricao_editada', 'inscricoes', p_id::text);
  return to_jsonb(v);
end;
$$;

drop function if exists public.admin_excluir_inscricao(text, uuid);

create or replace function public.admin_excluir_inscricao(p_email text, p_pin text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin_session(p_email, p_pin);
  if not exists (select 1 from public.inscricoes where id = p_id) then
    raise exception 'Inscricao nao encontrada';
  end if;
  update public.assentos set inscricao_id = null where inscricao_id = p_id;
  delete from public.lista_espera where inscricao_id = p_id;
  delete from public.checkins where inscricao_id = p_id;
  delete from public.inscricoes where id = p_id;
  begin
    insert into public.logs (acao, entidade, entidade_id) values ('inscricao_excluida', 'inscricoes', p_id::text);
  exception when others then null;
  end;
  return true;
end;
$$;

drop function if exists public.admin_promover(text, uuid);

create or replace function public.admin_promover(p_email text, p_pin text, p_onibus uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.lista_espera;
  v public.inscricoes;
  dest uuid;
begin
  perform public.assert_admin_session(p_email, p_pin);
  select * into e from public.lista_espera where status = 'aguardando' order by posicao limit 1;
  if e.id is null then return null; end if;
  select * into v from public.inscricoes where id = e.inscricao_id;
  dest := coalesce(p_onibus, public.escolher_onibus(v.faixa_etaria_id));
  if dest is null then raise exception 'Sem vaga'; end if;
  perform public.admin_transfer(p_email, p_pin, v.id, dest);
  select * into v from public.inscricoes where id = v.id;
  return jsonb_build_object(
    'alerta', 'Uma vaga foi liberada no ' || (select nome from public.onibus where id = dest),
    'inscricao', to_jsonb(v)
  );
end;
$$;

create or replace function public.ficha_publica(i public.inscricoes, o public.onibus, f public.faixas_etarias)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'codigo_inscricao', i.codigo_inscricao,
    'nome_completo', i.nome_completo,
    'idade', i.idade,
    'status', i.status,
    'assento', i.assento,
    'onibus_nome', o.nome,
    'faixa_nome', f.nome
  );
$$;

create or replace function public.consultar_inscricao(p_codigo text, p_nascimento date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.ficha_publica(i, o, f)
  from public.inscricoes i
  left join public.onibus o on o.id = i.onibus_id
  left join public.faixas_etarias f on f.id = i.faixa_etaria_id
  where p_nascimento is not null
    and i.data_nascimento = p_nascimento
    and i.status <> 'cancelada'
    and (
      upper(i.codigo_inscricao) = upper(trim(p_codigo))
      or upper(i.qr_code) = upper(trim(p_codigo))
    )
  limit 1;
$$;

create or replace function public.consultar_por_whatsapp(p_whatsapp text, p_nascimento date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_phone text;
  v jsonb;
begin
  if p_nascimento is null then
    return null;
  end if;
  v_phone := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  if length(v_phone) < 10 then
    return null;
  end if;
  select public.ficha_publica(i, o, f) into v
  from public.inscricoes i
  left join public.onibus o on o.id = i.onibus_id
  left join public.faixas_etarias f on f.id = i.faixa_etaria_id
  where regexp_replace(i.whatsapp, '\D', '', 'g') = v_phone
    and i.data_nascimento = p_nascimento
    and i.status <> 'cancelada'
  order by i.criado_em desc
  limit 1;
  return v;
end;
$$;

create or replace function public.vagas_resumo()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'capacidade', (select coalesce(sum(greatest(capacidade - coalesce(capacidade_reservada, 0), 0)), 0) from public.onibus where ativo),
    'confirmadas', (select count(*) from public.inscricoes where status = 'confirmada'),
    'espera', (select count(*) from public.lista_espera where status = 'aguardando'),
    'abertas', (select coalesce(inscricoes_abertas, true) from public.configuracoes_evento limit 1),
    'onibus', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'nome', o.nome,
        'livres', greatest(public.capacidade_util(o.id) - public.ocupacao_onibus(o.id), 0),
        'capacidade', public.capacidade_util(o.id)
      ) order by o.ordem), '[]'::jsonb)
      from public.onibus o
      where o.ativo
    )
  );
$$;

drop function if exists public.admin_dashboard(text);

create or replace function public.admin_dashboard(p_email text, p_pin text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg jsonb;
begin
  perform public.assert_admin_session(p_email, p_pin);
  select to_jsonb(c) - 'admin_pin' into cfg from public.configuracoes_evento c limit 1;
  return jsonb_build_object(
    'config', cfg,
    'onibus', (select coalesce(jsonb_agg(to_jsonb(o) order by o.ordem), '[]'::jsonb) from public.onibus o),
    'faixas', (select coalesce(jsonb_agg(to_jsonb(f) order by f.prioridade), '[]'::jsonb) from public.faixas_etarias f),
    'espera', (select coalesce(jsonb_agg(to_jsonb(e) order by e.posicao), '[]'::jsonb) from public.lista_espera e where e.status = 'aguardando'),
    'inscricoes', (
      select coalesce(jsonb_agg(x.j order by x.criado_em desc), '[]'::jsonb)
      from (
        select i.criado_em,
          to_jsonb(i) || jsonb_build_object('onibus_nome', o.nome, 'faixa_nome', f.nome) as j
        from public.inscricoes i
        left join public.onibus o on o.id = i.onibus_id
        left join public.faixas_etarias f on f.id = i.faixa_etaria_id
      ) x
    )
  );
end;
$$;

grant execute on function public.admin_login(text, text) to anon, authenticated;
grant execute on function public.admin_obter_inscricao(text, text, text) to anon, authenticated;
grant execute on function public.admin_checkin(text, text, text) to anon, authenticated;
grant execute on function public.admin_transfer(text, text, uuid, uuid) to anon, authenticated;
grant execute on function public.admin_update_inscricao(text, text, uuid, jsonb) to anon, authenticated;
grant execute on function public.admin_excluir_inscricao(text, text, uuid) to anon, authenticated;
grant execute on function public.admin_promover(text, text, uuid) to anon, authenticated;
grant execute on function public.consultar_inscricao(text, date) to anon, authenticated;
grant execute on function public.consultar_por_whatsapp(text, date) to anon, authenticated;
grant execute on function public.vagas_resumo() to anon, authenticated;
grant execute on function public.admin_dashboard(text, text) to anon, authenticated;
drop function if exists public.admin_save_config(text, jsonb);

create or replace function public.admin_save_config(p_email text, p_pin text, p jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare r jsonb;
        v_nova text;
begin
  perform public.assert_admin_session(p_email, p_pin);
  update public.configuracoes_evento set
    nome_evento = coalesce(nullif(p->>'nome_evento', ''), nome_evento),
    data_evento = coalesce(nullif(p->>'data_evento', '')::date, data_evento),
    local_evento = coalesce(nullif(p->>'local_evento', ''), local_evento),
    modo_distribuicao = coalesce(nullif(p->>'modo_distribuicao', ''), modo_distribuicao),
    limite_maximo = case when p ? 'limite_maximo' then nullif(p->>'limite_maximo', '')::int else limite_maximo end,
    inscricoes_abertas = case when p ? 'inscricoes_abertas' then (p->>'inscricoes_abertas')::boolean else inscricoes_abertas end,
    lista_espera_ativa = case when p ? 'lista_espera_ativa' then (p->>'lista_espera_ativa')::boolean else lista_espera_ativa end,
    atualizado_em = now()
  where id in (select c.id from public.configuracoes_evento c);
  v_nova := nullif(trim(p->>'nova_senha'), '');
  if v_nova is not null then
    if length(v_nova) < 10 then
      raise exception 'Senha fraca: use pelo menos 10 caracteres';
    end if;
    if lower(v_nova) in ('geracao2026', 'admin', '12345678', '1234567890') then
      raise exception 'Senha fraca: escolha outra senha';
    end if;
    update public.configuracoes_evento set
      admin_pin = crypt(v_nova, gen_salt('bf')),
      atualizado_em = now()
    where id in (select c.id from public.configuracoes_evento c);
  end if;
  if jsonb_typeof(p->'onibus') = 'array' then
    for r in select * from jsonb_array_elements(p->'onibus') loop
      if coalesce(r->>'id', '') <> '' then
        update public.onibus set
          nome = coalesce(nullif(r->>'nome', ''), nome),
          capacidade = coalesce(nullif(r->>'capacidade', '')::int, capacidade),
          descricao = coalesce(r->>'descricao', descricao),
          ativo = coalesce((r->>'ativo')::boolean, ativo),
          faixa_etaria_id = nullif(r->>'faixa_etaria_id', '')::uuid
        where id = (r->>'id')::uuid;
      end if;
    end loop;
  end if;
  if jsonb_typeof(p->'faixas') = 'array' then
    for r in select * from jsonb_array_elements(p->'faixas') loop
      if coalesce(r->>'id', '') <> '' then
        update public.faixas_etarias set
          nome = coalesce(nullif(r->>'nome', ''), nome),
          idade_minima = coalesce(nullif(r->>'idade_minima', '')::int, idade_minima),
          idade_maxima = coalesce(nullif(r->>'idade_maxima', '')::int, idade_maxima),
          ativo = coalesce((r->>'ativo')::boolean, ativo)
        where id = (r->>'id')::uuid;
      end if;
    end loop;
    perform public.recalcular_faixas();
  end if;
  begin
    insert into public.logs (acao, entidade) values ('configuracao_alterada', 'configuracoes');
  exception when others then null;
  end;
  return true;
end;
$$;

grant execute on function public.admin_save_config(text, text, jsonb) to anon, authenticated;

revoke execute on function public.assert_admin_email(text) from public, anon, authenticated;
revoke execute on function public.assert_admin(text) from public, anon, authenticated;
revoke execute on function public.assert_admin_session(text, text) from public, anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on table public.onibus to anon, authenticated;
grant select on table public.faixas_etarias to anon, authenticated;
revoke all on table public.inscricoes from public, anon, authenticated;
revoke all on table public.lista_espera from public, anon, authenticated;
revoke all on table public.administradores from public, anon, authenticated;
revoke all on table public.checkins from public, anon, authenticated;
revoke all on table public.assentos from public, anon, authenticated;
revoke all on table public.logs from public, anon, authenticated;
drop policy if exists "publico le espera" on public.lista_espera;
drop policy if exists "consulta por codigo" on public.inscricoes;

revoke all on table public.configuracoes_evento from public, anon, authenticated;
grant select (
  id, nome_evento, data_evento, local_evento, paroquia, grupo,
  inscricoes_abertas, lista_espera_ativa, limite_maximo, modo_distribuicao, atualizado_em
) on table public.configuracoes_evento to anon, authenticated;
grant all on table public.configuracoes_evento to service_role;
