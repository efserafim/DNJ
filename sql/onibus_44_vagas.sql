-- Define 44 vagas em todos os ônibus.
-- Rode no SQL Editor do Supabase.

alter table public.onibus alter column capacidade set default 44;

update public.onibus set capacidade = 44;

insert into public.assentos (onibus_id, numero)
select o.id, gs
from public.onibus o
cross join generate_series(1, o.capacidade) gs
on conflict (onibus_id, numero) do nothing;

delete from public.assentos
where numero > 44
  and inscricao_id is null;
