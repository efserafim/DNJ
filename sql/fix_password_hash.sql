-- Cole no SQL Editor do Supabase e rode (Run).
-- Corrige o erro: function gen_salt(unknown) does not exist
-- No Supabase o pgcrypto vive no schema extensions, e as funções
-- administrativas só enxergavam public.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.assert_admin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
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
    update public.configuracoes_evento set
      admin_pin = crypt(v_nova, gen_salt('bf'::text)),
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

revoke execute on function public.assert_admin(text) from public, anon, authenticated;
grant execute on function public.admin_save_config(text, text, jsonb) to anon, authenticated;
