-- 50 inscricoes de TESTE para apresentacao do dashboard
-- Cole no SQL Editor do Supabase e clique em Run.
-- Depois da apresentacao, rode o bloco LIMPAR no final deste arquivo.

-- Remove uma rodada anterior desses testes (se existir)
update public.assentos
set inscricao_id = null
where inscricao_id in (
  select id from public.inscricoes where observacoes = '[TESTE APRESENTACAO]'
);
delete from public.checkins
where inscricao_id in (
  select id from public.inscricoes where observacoes = '[TESTE APRESENTACAO]'
);
delete from public.lista_espera
where inscricao_id in (
  select id from public.inscricoes where observacoes = '[TESTE APRESENTACAO]'
);
delete from public.inscricoes
where observacoes = '[TESTE APRESENTACAO]';

do $$
declare
  v_nomes text[] := array[
    'Ana Clara Souza','Beatriz Mendes Lima','Carlos Eduardo Rocha','Daniela Alves Costa',
    'Eduarda Ferreira Dias','Felipe Martins Silva','Gabriela Nunes Barbosa','Henrique Oliveira Santos',
    'Isabela Ribeiro Gomes','João Pedro Carvalho','Larissa Almeida Pinto','Marcos Vinicius Teixeira',
    'Natália Araujo Melo','Otávio Barbosa Lima','Patrícia Gomes Ferreira','Rafael Costa Andrade',
    'Sofia Martins Rocha','Thiago Pereira Dias','Vitória Santos Oliveira','William Alves Cardoso',
    'Amanda Rodrigues Silva','Bruno Henrique Castro','Camila Lopes Freitas','Diego Nascimento Ramos',
    'Elena Cristina Moreira','Fábio Augusto Vieira','Giovana Pires Machado','Hugo Leonardo Correia',
    'Ingrid Fernanda Souza','Júlio César Batista','Karina Aparecida Moura','Lucas Gabriel Fernandes',
    'Marina Duarte Azevedo','Nicolas Henrique Lopes','Olívia Cristina Reis','Pedro Henrique Campos',
    'Renata Oliveira Cunha','Samuel Pinto Araujo','Tainá Cristina Melo','Ulisses Barbosa Neto',
    'Vanessa Ribeiro Lima','Wagner Santos Junior','Yasmin Ferreira Costa','Caio Augusto Nogueira',
    'Letícia Ramos Silveira','Mateus Oliveira Prado','Fernanda Alves Monteiro','Rodrigo Cunha Barbosa',
    'Júlia Mendes Carvalho','Enzo Gabriel Pereira'
  ];
  v_bairros text[] := array['Bacaxá','Centro','Itaúna','Jacone','Rio da Areia','Sampaio Correia','Vilatur','Barra Nova'];
  v_cidades text[] := array['Saquarema','Saquarema','Saquarema','Maricá','Araruama','Niterói','Rio Bonito','Saquarema'];
  v_comunidades text[] := array[
    'Comunidade São Pedro','Comunidade Nossa Senhora','Pastoral da Juventude',
    'Grupo de Oração','Catequese','Coroinhas','Grupo Jovem','PASCOM'
  ];
  v_i int;
  v_nome text;
  v_sexo text;
  v_idade int;
  v_nasc date;
  v_faixa uuid;
  v_onibus uuid;
  v_assento int;
  v_id uuid;
  v_phone text;
begin
  if not exists (select 1 from public.onibus where ativo) then
    raise exception 'Nenhum ônibus ativo no sistema.';
  end if;

  for v_i in 1..50 loop
    v_nome := v_nomes[v_i];
    v_sexo := case when v_i % 2 = 0 then 'Feminino' else 'Masculino' end;
    v_idade := 13 + ((v_i * 5) % 27);
    v_nasc := (current_date - ((v_idade * 365) + (v_i * 3)))::date;
    v_faixa := public.faixa_por_idade(v_idade);
    v_phone := format('(22) 99000-%s', lpad(v_i::text, 4, '0'));

    select o.id into v_onibus
    from public.onibus o
    where o.ativo = true
      and public.ocupacao_onibus(o.id) < public.capacidade_util(o.id)
    order by random()
    limit 1;

    insert into public.inscricoes (
      nome_completo, data_nascimento, idade, sexo, whatsapp, email,
      paroquia, comunidade, grupo_movimento, cidade, bairro,
      membro_geracao_eucaristica, ja_participou_dnj, como_conheceu,
      observacoes, aceitou_termos, status, faixa_etaria_id, onibus_id
    ) values (
      v_nome,
      v_nasc,
      v_idade,
      v_sexo,
      v_phone,
      format('teste%s@apresentacao.dnj', lpad(v_i::text, 2, '0')),
      'Paróquia Santo Antônio — Bacaxá',
      v_comunidades[1 + ((v_i - 1) % array_length(v_comunidades, 1))],
      'Geração Eucarística',
      v_cidades[1 + ((v_i - 1) % array_length(v_cidades, 1))],
      v_bairros[1 + ((v_i - 1) % array_length(v_bairros, 1))],
      (v_i % 3 = 0),
      (v_i % 4 = 0),
      'teste apresentação',
      '[TESTE APRESENTACAO]',
      true,
      case when v_onibus is null then 'lista_espera' else 'confirmada' end,
      v_faixa,
      v_onibus
    ) returning id into v_id;

    if v_onibus is not null then
      v_assento := public.proximo_assento(v_onibus);
      update public.inscricoes
      set assento = v_assento
      where id = v_id;
      insert into public.assentos (onibus_id, numero, inscricao_id)
      values (v_onibus, v_assento, v_id)
      on conflict (onibus_id, numero) do update set inscricao_id = excluded.inscricao_id;
    else
      insert into public.lista_espera (inscricao_id, posicao)
      values (
        v_id,
        coalesce((select max(posicao) from public.lista_espera where status = 'aguardando'), 0) + 1
      );
    end if;

    -- uns 12 ja com check-in, para o painel nao ficar zerado
    if v_i <= 12 and v_onibus is not null then
      update public.inscricoes set presente = true where id = v_id;
      insert into public.checkins (inscricao_id, tipo, observacao)
      values (v_id, 'qr', 'teste apresentação')
      on conflict (inscricao_id) do nothing;
    end if;
  end loop;
end $$;

-- Resumo para voce conferir
select
  coalesce(o.nome, 'Lista de espera') as onibus,
  count(*) as pessoas,
  count(*) filter (where i.presente) as presentes
from public.inscricoes i
left join public.onibus o on o.id = i.onibus_id
where i.observacoes = '[TESTE APRESENTACAO]'
group by coalesce(o.nome, 'Lista de espera')
order by 1;

-- =====================================================
-- LIMPAR depois da apresentacao (rode so este bloco)
-- =====================================================
-- update public.assentos
-- set inscricao_id = null
-- where inscricao_id in (
--   select id from public.inscricoes where observacoes = '[TESTE APRESENTACAO]'
-- );
-- delete from public.checkins
-- where inscricao_id in (
--   select id from public.inscricoes where observacoes = '[TESTE APRESENTACAO]'
-- );
-- delete from public.lista_espera
-- where inscricao_id in (
--   select id from public.inscricoes where observacoes = '[TESTE APRESENTACAO]'
-- );
-- delete from public.inscricoes
-- where observacoes = '[TESTE APRESENTACAO]';
