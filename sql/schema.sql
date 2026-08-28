-- DNJ 2026 - schema da caravana (Supabase / PostgreSQL)
-- Evento: Setor Juventude — Arquidiocese de Niterói
-- Caravana: Geração Eucarística | Paróquia Santo Antônio — Bacaxá

create extension if not exists pgcrypto;

-- =====================================================
-- CONFIGURAÇÕES
-- =====================================================
create table if not exists public.configuracoes_evento (
  id uuid primary key default gen_random_uuid(),
  nome_evento text not null default 'Caravana Geração Eucarística ao DNJ',
  data_evento date not null default '2026-10-18',
  local_evento text not null default 'Orla do Marine — Maricá',
  paroquia text not null default 'Paróquia Santo Antônio — Bacaxá',
  grupo text not null default 'Grupo Jovem Geração Eucarística',
  inscricoes_abertas boolean not null default true,
  lista_espera_ativa boolean not null default true,
  limite_maximo integer,
  modo_distribuicao text not null default 'equilibrado_faixa',
  admin_pin text not null default '',
  atualizado_em timestamptz not null default now(),
  constraint modo_valido check (modo_distribuicao in (
    'equilibrado',
    'equilibrado_faixa',
    'por_faixa',
    'manual'
  ))
);

alter table public.configuracoes_evento
  add column if not exists admin_pin text not null default '';
create table if not exists public.faixas_etarias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  idade_minima integer not null,
  idade_maxima integer not null,
  cor text not null default '#c45c26',
  prioridade integer not null default 1,
  ativo boolean not null default true,
  onibus_preferido_id uuid
);

-- =====================================================
-- ÔNIBUS
-- =====================================================
create table if not exists public.onibus (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  numero integer not null unique,
  capacidade integer not null default 50,
  capacidade_reservada integer not null default 0,
  ativo boolean not null default true,
  descricao text,
  cor text not null default '#c45c26',
  ordem integer not null default 1
);

alter table public.onibus add column if not exists faixa_etaria_id uuid references public.faixas_etarias(id);

alter table public.faixas_etarias drop constraint if exists faixas_onibus_pref;
alter table public.faixas_etarias
  add constraint faixas_onibus_pref
  foreign key (onibus_preferido_id) references public.onibus(id);

-- =====================================================
-- INSCRIÇÕES
-- =====================================================
create table if not exists public.inscricoes (
  id uuid primary key default gen_random_uuid(),
  codigo_inscricao text unique not null,
  nome_completo text not null,
  data_nascimento date not null,
  idade integer not null,
  sexo text,
  cpf text,
  whatsapp text not null,
  email text,
  paroquia text,
  comunidade text,
  grupo_movimento text,
  cidade text,
  bairro text,
  membro_geracao_eucaristica boolean not null default false,
  ja_participou_dnj boolean not null default false,
  como_conheceu text,
  necessidade_especifica text,
  observacoes text,
  aceitou_termos boolean not null default false,
  status text not null default 'confirmada',
  presente boolean not null default false,
  qr_code text unique not null,
  onibus_id uuid references public.onibus(id),
  faixa_etaria_id uuid references public.faixas_etarias(id),
  assento integer,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint status_valido check (status in (
    'pendente', 'confirmada', 'lista_espera', 'cancelada'
  ))
);

create table if not exists public.assentos (
  id uuid primary key default gen_random_uuid(),
  onibus_id uuid not null references public.onibus(id) on delete cascade,
  numero integer not null,
  inscricao_id uuid references public.inscricoes(id),
  unique (onibus_id, numero)
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  inscricao_id uuid not null references public.inscricoes(id) on delete cascade,
  realizado_em timestamptz not null default now(),
  realizado_por uuid,
  tipo text not null default 'qr',
  observacao text,
  unique (inscricao_id)
);

create table if not exists public.lista_espera (
  id uuid primary key default gen_random_uuid(),
  inscricao_id uuid not null references public.inscricoes(id) on delete cascade,
  prioridade integer not null default 1,
  posicao integer not null,
  criado_em timestamptz not null default now(),
  status text not null default 'aguardando',
  constraint espera_status check (status in ('aguardando', 'promovida', 'cancelada'))
);

create table if not exists public.administradores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  nome text not null,
  email text unique not null,
  senha_hash text not null default '',
  papel text not null default 'administrador',
  ativo boolean not null default true,
  constraint papel_valido check (papel in ('administrador', 'coordenador', 'checkin'))
);

alter table public.administradores
  add column if not exists senha_hash text not null default '';

create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid,
  acao text not null,
  entidade text,
  entidade_id text,
  dados_anteriores jsonb,
  dados_novos jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists idx_inscricoes_codigo on public.inscricoes (codigo_inscricao);
create index if not exists idx_inscricoes_whatsapp on public.inscricoes (whatsapp);
create index if not exists idx_inscricoes_onibus on public.inscricoes (onibus_id);
create index if not exists idx_inscricoes_faixa on public.inscricoes (faixa_etaria_id);
create index if not exists idx_inscricoes_status on public.inscricoes (status);

-- =====================================================
-- FUNÇÕES
-- =====================================================
create or replace function public.calcular_idade(nasc date)
returns integer
language sql
immutable
as $$
  select date_part('year', age(current_date, nasc))::int;
$$;

create or replace function public.gerar_codigo_inscricao()
returns trigger
language plpgsql
as $$
begin
  if new.codigo_inscricao is null or new.codigo_inscricao = '' then
    new.codigo_inscricao := 'DNJ26-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  end if;
  new.qr_code := coalesce(nullif(new.qr_code, ''), new.codigo_inscricao);
  new.idade := public.calcular_idade(new.data_nascimento);
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trigger_codigo_inscricao on public.inscricoes;
create trigger trigger_codigo_inscricao
before insert on public.inscricoes
for each row execute function public.gerar_codigo_inscricao();

create or replace function public.atualizar_data()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trigger_atualizado_em on public.inscricoes;
create trigger trigger_atualizado_em
before update on public.inscricoes
for each row execute function public.atualizar_data();

create or replace function public.faixa_por_idade(p_idade integer)
returns uuid
language sql
stable
as $$
  select id from public.faixas_etarias
  where ativo = true
    and p_idade between idade_minima and idade_maxima
  order by prioridade
  limit 1;
$$;

create or replace function public.capacidade_util(p_onibus uuid)
returns integer
language sql
stable
as $$
  select greatest(capacidade - coalesce(capacidade_reservada, 0), 0)
  from public.onibus where id = p_onibus;
$$;

create or replace function public.ocupacao_onibus(p_onibus uuid)
returns integer
language sql
stable
as $$
  select count(*)::int from public.inscricoes
  where onibus_id = p_onibus and status = 'confirmada';
$$;

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

create or replace function public.proximo_assento(p_onibus uuid)
returns integer
language plpgsql
as $$
declare
  v_n integer;
begin
  select min(a.numero) into v_n
  from public.assentos a
  where a.onibus_id = p_onibus and a.inscricao_id is null;
  if v_n is null then
    select coalesce(max(assento), 0) + 1 into v_n
    from public.inscricoes
    where onibus_id = p_onibus and status = 'confirmada';
  end if;
  return v_n;
end;
$$;

create or replace function public.recalcular_faixas()
returns void
language plpgsql
security definer
as $$
begin
  update public.inscricoes
  set faixa_etaria_id = public.faixa_por_idade(idade)
  where status <> 'cancelada';
end;
$$;

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
  v_onibus := public.escolher_onibus(v_faixa);

  select count(*) into v_total from public.inscricoes where status = 'confirmada';
  if v_cfg.limite_maximo is not null and v_total >= v_cfg.limite_maximo then
    v_onibus := null;
  end if;

  insert into public.inscricoes (
    nome_completo, data_nascimento, idade, sexo, cpf, whatsapp, email,
    paroquia, comunidade, grupo_movimento, cidade, bairro,
    membro_geracao_eucaristica, ja_participou_dnj, como_conheceu,
    necessidade_especifica, observacoes, aceitou_termos,
    status, faixa_etaria_id, onibus_id
  ) values (
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
    nullif(p->>'observacoes',''),
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

-- =====================================================
-- RLS
-- =====================================================
alter table public.inscricoes enable row level security;
alter table public.faixas_etarias enable row level security;
alter table public.onibus enable row level security;
alter table public.assentos enable row level security;
alter table public.checkins enable row level security;
alter table public.lista_espera enable row level security;
alter table public.administradores enable row level security;
alter table public.configuracoes_evento enable row level security;
alter table public.logs enable row level security;

drop policy if exists "publico le onibus" on public.onibus;
drop policy if exists "publico le faixas" on public.faixas_etarias;
drop policy if exists "publico le config" on public.configuracoes_evento;
drop policy if exists "consulta por codigo" on public.inscricoes;
drop policy if exists "admins leem tudo inscricoes" on public.inscricoes;
drop policy if exists "auth checkins" on public.checkins;
drop policy if exists "auth espera" on public.lista_espera;
drop policy if exists "auth assentos" on public.assentos;
drop policy if exists "auth admin" on public.administradores;
drop policy if exists "auth logs" on public.logs;
drop policy if exists "auth config upd" on public.configuracoes_evento;
drop policy if exists "auth onibus upd" on public.onibus;
drop policy if exists "auth faixas upd" on public.faixas_etarias;
create policy "publico le onibus" on public.onibus for select to anon, authenticated using (true);
create policy "publico le faixas" on public.faixas_etarias for select to anon, authenticated using (true);
create policy "publico le config" on public.configuracoes_evento for select to anon, authenticated using (true);
create policy "admins leem tudo inscricoes" on public.inscricoes for all to authenticated using (true) with check (true);
create policy "auth checkins" on public.checkins for all to authenticated using (true) with check (true);
create policy "auth espera" on public.lista_espera for all to authenticated using (true) with check (true);
create policy "auth assentos" on public.assentos for all to authenticated using (true) with check (true);
create policy "auth admin" on public.administradores for all to authenticated using (true) with check (true);
create policy "auth logs" on public.logs for all to authenticated using (true) with check (true);
create policy "auth config upd" on public.configuracoes_evento for update to authenticated using (true);
create policy "auth onibus upd" on public.onibus for all to authenticated using (true) with check (true);
create policy "auth faixas upd" on public.faixas_etarias for all to authenticated using (true) with check (true);

-- =====================================================
-- SEED
-- =====================================================
insert into public.configuracoes_evento (admin_pin)
select 'geracao2026'
where not exists (select 1 from public.configuracoes_evento);

insert into public.administradores (nome, email, papel)
values
  ('Beatriz', 'beatriz@geucaristica.com.br', 'coordenador'),
  ('Lavínia', 'lavinia@geucaristica.com.br', 'administrador'),
  ('Duda', 'duda@geucaristica.com.br', 'administrador'),
  ('João Gabriel', 'joaogabriel@geucaristica.com.br', 'administrador'),
  ('Eduardo', 'eduardo@geucaristica.com.br', 'administrador')
on conflict (email) do nothing;

insert into public.onibus (nome, numero, capacidade, cor, ordem, descricao)
select * from (values
  ('Ônibus São Pedro', 1, 50, '#c45c26', 1, 'Caminhada com São Pedro'),
  ('Ônibus São Paulo', 2, 50, '#6b1c28', 2, 'Caminhada com São Paulo'),
  ('Ônibus São João', 3, 50, '#e8b84a', 3, 'Caminhada com São João')
) as v(nome, numero, capacidade, cor, ordem, descricao)
where not exists (select 1 from public.onibus);

insert into public.faixas_etarias (nome, idade_minima, idade_maxima, cor, prioridade)
select * from (values
  ('13 a 17 anos', 13, 17, '#c45c26', 1),
  ('18 a 24 anos', 18, 24, '#6b1c28', 2),
  ('25 anos ou mais', 25, 99, '#e8b84a', 3)
) as v(nome, idade_minima, idade_maxima, cor, prioridade)
where not exists (select 1 from public.faixas_etarias);

insert into public.assentos (onibus_id, numero)
select o.id, gs
from public.onibus o
cross join generate_series(1, o.capacidade) gs
on conflict (onibus_id, numero) do nothing;

do $$ begin
  alter publication supabase_realtime add table public.inscricoes;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.checkins;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.onibus;
exception when duplicate_object then null; end $$;
