-- Impede ônibus desativado de receber inscrição nova ou transferência.
-- Cole no SQL Editor do Supabase e clique em Run.
-- O interruptor em Ajustes já grava o campo ativo; este arquivo
-- só reforça a regra no banco.

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
    if v_pref is not null
      and exists (select 1 from public.onibus o where o.id = v_pref and o.ativo)
      and public.ocupacao_onibus(v_pref) < public.capacidade_util(v_pref) then
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
  if v.onibus_id is distinct from p_onibus and not exists (
    select 1 from public.onibus o where o.id = p_onibus and o.ativo
  ) then
    raise exception 'Onibus desativado';
  end if;
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

grant execute on function public.admin_transfer(text, text, uuid, uuid) to anon, authenticated;
