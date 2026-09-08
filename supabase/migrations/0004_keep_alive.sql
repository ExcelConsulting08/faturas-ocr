-- ============================================================================
-- Registo dos pings de manutenção da base de dados
--
-- Os projetos Supabase no plano gratuito entram em pausa ao fim de alguns dias
-- sem atividade. Um ping diário evita isso. Esta tabela guarda o resultado de
-- cada tentativa, e é ela própria o alvo do ping: ler e escrever aqui É a
-- atividade que mantém o projeto acordado.
-- ============================================================================

create table db_pings (
  id uuid primary key default gen_random_uuid(),
  dia date not null default current_date,
  tentativa int not null,
  sucesso boolean not null,
  erro text,
  duracao_ms int,
  created_at timestamptz not null default now()
);

-- A consulta quente é "já houve sucesso hoje?" e "quantas tentativas hoje?".
create index db_pings_dia_idx on db_pings (dia desc, tentativa desc);

alter table db_pings enable row level security;

-- Sem políticas de escrita: só a rota de manutenção lhe toca, com a
-- service-role. A leitura fica disponível a qualquer utilizador autenticado
-- para se poder consultar o histórico.
create policy db_pings_select on db_pings
  for select to authenticated using (true);
