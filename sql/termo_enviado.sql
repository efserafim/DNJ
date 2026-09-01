-- Termo obrigatório (menores) + código pré-gerado no formulário
-- Rode no SQL Editor do Supabase após os scripts anteriores.

alter table public.inscricoes
  add column if not exists termo_enviado boolean not null default false;

create or replace function public.gerar_codigo_inscricao()
returns trigger
language plpgsql
as $$
declare
  v_try int := 0;
begin
  if new.codigo_inscricao is not null
     and new.codigo_inscricao <> ''
     and new.codigo_inscricao ~ '^DNJ26-[A-F0-9]{8}$'
     and not exists (
       select 1 from public.inscricoes
       where codigo_inscricao = new.codigo_inscricao
     ) then
    null;
  else
    loop
      new.codigo_inscricao := 'DNJ26-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      exit when not exists (
        select 1 from public.inscricoes where codigo_inscricao = new.codigo_inscricao
      );
      v_try := v_try + 1;
      if v_try > 20 then
        raise exception 'codigo indisponivel';
      end if;
    end loop;
  end if;
  new.qr_code := coalesce(nullif(new.qr_code, ''), new.codigo_inscricao);
  new.idade := public.calcular_idade(new.data_nascimento);
  new.atualizado_em := now();
  return new;
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
    termo_enviado = coalesce((p->>'termo_enviado')::boolean, termo_enviado),
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

grant execute on function public.admin_update_inscricao(text, text, uuid, jsonb) to anon, authenticated;

drop function if exists public.registrar_inscricao(jsonb);

create or replace function public.registrar_inscricao(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg public.configuracoes_evento;
  v_row public.inscricoes;
  v_idade int;
  v_faixa uuid;
  v_onibus uuid;
  v_assento int;
  v_pos int;
  v_total int;
  v_phone text;
  v_obs text;
  v_tag constant text := 'Caravana com preferência por jovens (13–34 anos). Inscrição na lista de espera por idade.';
begin
  select * into v_cfg from public.configuracoes_evento limit 1;
  if not coalesce(v_cfg.inscricoes_abertas, true) then
    raise exception 'Inscricoes fechadas';
  end if;
  if coalesce((p->>'aceitou_termos')::boolean, false) is not true then
    raise exception 'Termos obrigatorios';
  end if;

  v_phone := regexp_replace(coalesce(p->>'whatsapp',''), '\D', '', 'g');
  if exists (
    select 1 from public.inscricoes
    where regexp_replace(whatsapp, '\D', '', 'g') = v_phone
      and status <> 'cancelada'
  ) then
    raise exception 'duplicate' using errcode = '23505';
  end if;

  v_idade := public.calcular_idade((p->>'data_nascimento')::date);
  v_faixa := public.faixa_por_idade(v_idade);
  v_obs := nullif(trim(p->>'observacoes'), '');
  if v_idade >= 35 then
    v_obs := trim(both from coalesce(v_obs || ' ', '') || v_tag);
  end if;
  v_onibus := public.escolher_onibus(v_faixa);
  if v_idade >= 35 then
    v_onibus := null;
  end if;

  select count(*) into v_total from public.inscricoes where status = 'confirmada';
  if v_cfg.limite_maximo is not null and v_total >= v_cfg.limite_maximo then
    v_onibus := null;
  end if;

  insert into public.inscricoes (
    codigo_inscricao,
    nome_completo, data_nascimento, idade, sexo, cpf, whatsapp, email,
    paroquia, comunidade, grupo_movimento, cidade, bairro,
    membro_geracao_eucaristica, ja_participou_dnj, como_conheceu,
    necessidade_especifica, observacoes, aceitou_termos,
    status, faixa_etaria_id, onibus_id
  ) values (
    nullif(trim(p->>'codigo_inscricao'), ''),
    p->>'nome_completo',
    (p->>'data_nascimento')::date,
    v_idade,
    p->>'sexo',
    nullif(p->>'cpf',''),
    p->>'whatsapp',
    nullif(p->>'email',''),
    nullif(p->>'paroquia',''),
    nullif(p->>'comunidade',''),
    nullif(p->>'grupo_movimento',''),
    nullif(p->>'cidade',''),
    nullif(p->>'bairro',''),
    coalesce((p->>'membro_geracao_eucaristica')::boolean, false),
    coalesce((p->>'ja_participou_dnj')::boolean, false),
    nullif(p->>'como_conheceu',''),
    nullif(p->>'necessidade_especifica',''),
    v_obs,
    true,
    case when v_onibus is null then 'lista_espera' else 'confirmada' end,
    v_faixa,
    v_onibus
  ) returning * into v_row;

  if v_onibus is null then
    if not coalesce(v_cfg.lista_espera_ativa, true) then
      delete from public.inscricoes where id = v_row.id;
      raise exception 'Onibus lotados';
    end if;
    select coalesce(max(posicao),0)+1 into v_pos from public.lista_espera where status = 'aguardando';
    insert into public.lista_espera (inscricao_id, posicao) values (v_row.id, v_pos);
  else
    v_assento := public.proximo_assento(v_onibus);
    update public.inscricoes set assento = v_assento where id = v_row.id;
    insert into public.assentos (onibus_id, numero, inscricao_id)
      values (v_onibus, v_assento, v_row.id)
      on conflict (onibus_id, numero) do update set inscricao_id = excluded.inscricao_id;
  end if;

  select * into v_row from public.inscricoes where id = v_row.id;

  insert into public.logs (acao, entidade, entidade_id, dados_novos)
  values ('inscricao_criada', 'inscricoes', v_row.id::text, to_jsonb(v_row));

  return to_jsonb(v_row) || jsonb_build_object(
    'onibus_nome', (select nome from public.onibus where id = v_row.onibus_id),
    'faixa_nome', (select nome from public.faixas_etarias where id = v_row.faixa_etaria_id)
  );
end;
$$;

grant execute on function public.registrar_inscricao(jsonb) to anon, authenticated;
