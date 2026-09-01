-- Fila da lista de espera em ordem de chegada (FIFO).
-- Rode no SQL Editor do Supabase.

-- Corrige posicoes existentes conforme quem entrou primeiro.
with ranked as (
  select id, row_number() over (order by criado_em asc, posicao asc) as new_pos
  from public.lista_espera
  where status = 'aguardando'
)
update public.lista_espera le
set posicao = r.new_pos
from ranked r
where le.id = r.id;

create or replace function public.admin_transfer(p_email text, p_pin text, p_inscricao uuid, p_onibus uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.inscricoes;
  v_first uuid;
  cap int;
  occ int;
  seat int;
begin
  perform public.assert_admin_session(p_email, p_pin);
  select * into v from public.inscricoes where id = p_inscricao;
  if v.id is null then raise exception 'not_found'; end if;

  if v.status = 'lista_espera' then
    select e.inscricao_id into v_first
    from public.lista_espera e
    where e.status = 'aguardando'
    order by e.criado_em asc, e.posicao asc
    limit 1;
    if v_first is distinct from v.id then
      raise exception 'Proximo da fila';
    end if;
  end if;

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
  select * into e
  from public.lista_espera
  where status = 'aguardando'
  order by criado_em asc, posicao asc
  limit 1;
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
    'espera', (
      select coalesce(jsonb_agg(to_jsonb(e) order by e.criado_em asc, e.posicao asc), '[]'::jsonb)
      from public.lista_espera e
      where e.status = 'aguardando'
    ),
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

grant execute on function public.admin_transfer(text, text, uuid, uuid) to anon, authenticated;
grant execute on function public.admin_promover(text, text, uuid) to anon, authenticated;
grant execute on function public.admin_dashboard(text, text) to anon, authenticated;
