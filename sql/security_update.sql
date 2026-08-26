-- Reforço de segurança — execute no Supabase (SQL Editor) após admin_rpc.sql
-- 1) Senha inicial com hash bcrypt
-- 2) E-mails da coordenação
-- 3) Funções internas sem acesso público

update public.configuracoes_evento
set admin_pin = crypt('geracao2026', gen_salt('bf'::text))
where true;

insert into public.administradores (nome, email, papel)
values
  ('Beatriz', 'beatriz@geucaristica.com.br', 'coordenador'),
  ('Lavínia', 'lavinia@geucaristica.com.br', 'administrador'),
  ('Duda', 'duda@geucaristica.com.br', 'administrador'),
  ('João Gabriel', 'joaogabriel@geucaristica.com.br', 'administrador'),
  ('Eduardo', 'eduardo@geucaristica.com.br', 'administrador')
on conflict (email) do update set
  nome = excluded.nome,
  papel = excluded.papel,
  ativo = true;

-- Remove assinaturas antigas (só senha)
drop function if exists public.admin_dashboard(text);
drop function if exists public.admin_checkin(text, text);
drop function if exists public.admin_transfer(text, uuid, uuid);
drop function if exists public.admin_update_inscricao(text, uuid, jsonb);
drop function if exists public.admin_excluir_inscricao(text, uuid);
drop function if exists public.admin_promover(text, uuid);
drop function if exists public.admin_save_config(text, jsonb);

revoke execute on function public.assert_admin_email(text) from public, anon, authenticated;
revoke execute on function public.assert_admin(text) from public, anon, authenticated;
revoke execute on function public.assert_admin_session(text, text) from public, anon, authenticated;

revoke all on table public.administradores from public, anon, authenticated;
revoke all on table public.checkins from public, anon, authenticated;
revoke all on table public.assentos from public, anon, authenticated;
revoke all on table public.logs from public, anon, authenticated;

-- Reaplica admin_rpc.sql depois deste arquivo, ou rode admin_rpc.sql inteiro por último.
