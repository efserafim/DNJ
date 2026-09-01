-- Senha pessoal por administrador (nao e mais compartilhada).
-- Cole no SQL Editor do Supabase e clique em Run.
--
-- Depois disto:
--   1. Cada pessoa entra com o e-mail dela e a senha atual (geracao2026,
--      ou a senha coletiva se ja tiver sido trocada).
--   2. No primeiro acesso, cria a senha dela.
--   3. A senha de Beatriz nao altera a de Lavinia, Duda, Joao Gabriel ou Eduardo.

create extension if not exists pgcrypto with schema extensions;

alter table public.administradores
  add column if not exists senha_hash text not null default '';

insert into public.administradores (nome, email, papel, ativo)
values
  ('Beatriz', 'beatriz@geucaristica.com.br', 'coordenador', true),
  ('Lavínia', 'lavinia@geucaristica.com.br', 'administrador', true),
  ('Duda', 'duda@geucaristica.com.br', 'administrador', true),
  ('João Gabriel', 'joaogabriel@geucaristica.com.br', 'administrador', true),
  ('Eduardo', 'eduardo@geucaristica.com.br', 'administrador', true)
on conflict (email) do update set
  nome = excluded.nome,
  papel = excluded.papel,
  ativo = true;

-- Quem ainda nao tem senha pessoal herda a senha coletiva atual.
update public.administradores a
set senha_hash = c.admin_pin
from public.configuracoes_evento c
where coalesce(nullif(trim(a.senha_hash), ''), '') = ''
  and coalesce(nullif(trim(c.admin_pin), ''), '') <> '';

do $$
begin
  begin
    update public.administradores
    set senha_hash = extensions.crypt('geracao2026', extensions.gen_salt('bf'::text))
    where coalesce(nullif(trim(senha_hash), ''), '') = '';
  exception when undefined_function then
    update public.administradores
    set senha_hash = crypt('geracao2026', gen_salt('bf'::text))
    where coalesce(nullif(trim(senha_hash), ''), '') = '';
  end;
end $$;

create or replace function public.admin_pin_ok(p_stored text, p_pin text)
returns boolean
language plpgsql
stable
set search_path = public, extensions
as $$
begin
  if p_stored is null or length(trim(p_stored)) = 0 or p_pin is null then
    return false;
  end if;
  if p_stored like '$2%' then
    begin
      return p_stored = crypt(trim(p_pin), p_stored);
    exception when undefined_function then
      return false;
    end;
  end if;
  return p_stored = trim(p_pin);
end;
$$;

create or replace function public.assert_admin_session(p_email text, p_pin text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_nome text;
  v_hash text;
  v_shared text;
begin
  if p_email is null or p_pin is null or length(trim(p_pin)) = 0 then
    raise exception 'unauthorized';
  end if;
  select nome, senha_hash into v_nome, v_hash
  from public.administradores
  where lower(trim(email)) = lower(trim(p_email))
    and ativo = true
  limit 1;
  if v_nome is null then
    raise exception 'unauthorized';
  end if;
  if coalesce(v_hash, '') <> '' then
    if public.admin_pin_ok(v_hash, p_pin) then
      return v_nome;
    end if;
    raise exception 'unauthorized';
  end if;
  select admin_pin into v_shared from public.configuracoes_evento limit 1;
  if public.admin_pin_ok(v_shared, p_pin) then
    return v_nome;
  end if;
  raise exception 'unauthorized';
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
  return jsonb_build_object(
    'ok', true,
    'nome', v_nome,
    'email', lower(trim(p_email)),
    'senha_inicial', lower(trim(p_pin)) = 'geracao2026'
  );
end;
$$;

drop function if exists public.admin_save_config(text, jsonb);

create or replace function public.admin_save_config(p_email text, p_pin text, p jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
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
    update public.administradores set
      senha_hash = crypt(v_nova, gen_salt('bf'::text))
    where lower(trim(email)) = lower(trim(p_email))
      and ativo = true;
    if not found then
      raise exception 'unauthorized';
    end if;
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

grant execute on function public.admin_login(text, text) to anon, authenticated;
grant execute on function public.admin_save_config(text, text, jsonb) to anon, authenticated;
revoke execute on function public.admin_pin_ok(text, text) from public, anon, authenticated;
revoke execute on function public.assert_admin_session(text, text) from public, anon, authenticated;

-- Conferencia: cada linha deve ter hash proprio (tamanho > 0)
select nome, email, papel, length(senha_hash) as tamanho_hash
from public.administradores
order by nome;
