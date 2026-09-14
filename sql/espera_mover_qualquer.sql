-- Permite promover qualquer pessoa da lista de espera, não só a primeira da fila.
-- Rode no SQL Editor do Supabase.

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
