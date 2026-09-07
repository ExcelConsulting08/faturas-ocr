-- ============================================================================
-- Esquema inicial: gestão de faturas com extração OCR
-- ============================================================================

-- No Supabase as extensões vivem no schema `extensions`, já presente no
-- search_path da base de dados. gen_random_bytes() vem daqui.
create extension if not exists "pgcrypto" with schema extensions;

-- ---------------------------------------------------------------------------
-- Organizações e membros
-- ---------------------------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  nif text not null,
  created_at timestamptz not null default now()
);

create table org_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text,
  role text not null default 'membro' check (role in ('admin', 'membro', 'leitor')),
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  invited_by uuid references auth.users(id),
  invited_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index org_members_user_idx on org_members (user_id) where status = 'ativo';

-- Helpers usados pelas políticas RLS.
-- SECURITY DEFINER + search_path fixo: evita recursão de políticas e shadowing de tabelas.
create or replace function auth_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select organization_id from org_members
  where user_id = auth.uid() and status = 'ativo';
$$;

create or replace function auth_can_write(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from org_members
    where user_id = auth.uid()
      and organization_id = org
      and status = 'ativo'
      and role in ('admin', 'membro')
  );
$$;

create or replace function auth_is_admin(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from org_members
    where user_id = auth.uid()
      and organization_id = org
      and status = 'ativo'
      and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Fornecedores, centros de custo e regras
-- ---------------------------------------------------------------------------

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  nome text not null,
  nif text,
  iban text,
  created_at timestamptz not null default now()
);

create unique index suppliers_org_nif_idx
  on suppliers (organization_id, nif) where nif is not null;
create index suppliers_org_nome_idx on suppliers (organization_id, nome);

create table cost_centers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  nome text not null,
  cor text,
  created_at timestamptz not null default now(),
  unique (organization_id, nome)
);

create table cost_center_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  cost_center_id uuid not null references cost_centers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (organization_id, supplier_id)
);

-- ---------------------------------------------------------------------------
-- Faturas
-- ---------------------------------------------------------------------------

create table invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  cost_center_id uuid references cost_centers(id) on delete set null,

  -- Ficheiro no SharePoint. O item_id é a referência estável: sobrevive a
  -- renomeações e mudanças de pasta, ao contrário do caminho.
  sharepoint_drive_id text,
  sharepoint_item_id text,
  sharepoint_path text,
  file_name text,
  file_size bigint,
  mime_type text,

  origin text not null default 'upload' check (origin in ('upload', 'email')),
  pais text,
  status text not null default 'por_rever'
    check (status in ('a_processar', 'auto_confirmada', 'confirmada', 'por_rever', 'falhada')),
  payment_status text not null default 'por_pagar' check (payment_status in ('por_pagar', 'paga')),

  numero text,
  is_credit_note boolean not null default false,
  moeda text not null default 'EUR',
  data_emissao date,
  data_vencimento date,
  entrada_at timestamptz not null default now(),

  nome_extracted text,
  nif_extracted text,
  iban_extracted text,

  base_tributavel numeric(14, 2) not null default 0,
  iva_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  total_eur numeric(14, 2),
  fx_rate_used numeric(14, 6),

  confidence_score numeric(5, 4),
  extraction_raw jsonb,
  extraction_error text,
  validation_flags jsonb not null default '{}'::jsonb,

  is_possible_duplicate boolean not null default false,
  duplicate_of_invoice_id uuid references invoices(id) on delete set null,

  discarded_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_org_status_idx on invoices (organization_id, status);
create index invoices_org_emissao_idx on invoices (organization_id, data_emissao desc);
create index invoices_org_entrada_idx on invoices (organization_id, entrada_at desc);
create index invoices_dup_lookup_idx on invoices (organization_id, supplier_id, numero);
create index invoices_org_pais_idx on invoices (organization_id, pais);

create table invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  posicao int not null default 0,
  descricao text,
  quantidade numeric(14, 3) not null default 1,
  preco_unitario numeric(14, 4) not null default 0,
  iva_percentagem numeric(5, 2) not null default 0,
  desconto numeric(14, 2) not null default 0,
  outro_imposto numeric(14, 2) not null default 0,
  total_linha numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index invoice_line_items_invoice_idx on invoice_line_items (invoice_id, posicao);

-- ---------------------------------------------------------------------------
-- Etiquetas
-- ---------------------------------------------------------------------------

create table tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  nome text not null,
  cor text,
  created_at timestamptz not null default now(),
  unique (organization_id, nome)
);

create table invoice_tags (
  invoice_id uuid not null references invoices(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  primary key (invoice_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- Preferências de extração e integração ERP
-- ---------------------------------------------------------------------------

create table extraction_preferences (
  organization_id uuid primary key references organizations(id) on delete cascade,
  modo text not null default 'automatico'
    check (modo in ('automatico', 'semi_automatico', 'manual')),
  limiar_alto numeric(4, 3) not null default 0.900,
  limiar_baixo numeric(4, 3) not null default 0.600,
  updated_at timestamptz not null default now(),
  constraint limiares_coerentes check (limiar_alto >= limiar_baixo)
);

create table erp_integration_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,
  webhook_url text,
  envio_automatico boolean not null default false,
  secret text not null,
  updated_at timestamptz not null default now()
);

create table webhook_delivery_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete cascade,
  attempt_number int not null default 1,
  request_body jsonb,
  response_status int,
  response_body text,
  succeeded boolean not null default false,
  error_message text,
  created_at timestamptz not null default now()
);

create index webhook_delivery_log_pending_idx
  on webhook_delivery_log (organization_id, invoice_id, created_at desc)
  where succeeded = false;

-- ---------------------------------------------------------------------------
-- Caixas de correio por país e recolha automática
-- ---------------------------------------------------------------------------

create table country_mailboxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  pais text not null,
  empresa text not null,
  idioma text not null default 'pt',
  email_address text not null unique,
  graph_user_id text,
  delta_token text,
  ativo boolean not null default true,
  connection_status text not null default 'desligada'
    check (connection_status in ('ligada', 'desligada', 'erro')),
  last_polled_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (organization_id, pais)
);

create table collection_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  mailbox_id uuid references country_mailboxes(id) on delete cascade,
  trigger text not null default 'loop' check (trigger in ('loop', 'manual')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  messages_seen int not null default 0,
  invoices_created int not null default 0,
  skipped int not null default 0,
  error_message text
);

create index collection_runs_org_idx on collection_runs (organization_id, started_at desc);

create table collection_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,
  loop_ativo boolean not null default false,
  intervalo_segundos int not null default 60 check (intervalo_segundos between 5 and 3600),
  updated_at timestamptz not null default now()
);

create table email_ingest_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  mailbox_id uuid references country_mailboxes(id) on delete cascade,
  graph_message_id text not null,
  attachment_id text not null,
  invoice_id uuid references invoices(id) on delete set null,
  status text not null check (status in ('ingerido', 'ignorado', 'erro')),
  motivo text,
  processed_at timestamptz not null default now(),
  unique (graph_message_id, attachment_id)
);

-- ---------------------------------------------------------------------------
-- Câmbios
-- ---------------------------------------------------------------------------

create table fx_rates (
  id uuid primary key default gen_random_uuid(),
  currency text not null,
  -- Unidades de `currency` por 1 EUR. Ex.: SEK 11.20 => 1 EUR = 11.20 SEK.
  rate numeric(14, 6) not null check (rate > 0),
  as_of date not null,
  unique (currency, as_of)
);

-- ---------------------------------------------------------------------------
-- Trigger: manter updated_at
-- ---------------------------------------------------------------------------

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger invoices_touch_updated_at
  before update on invoices
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table organizations enable row level security;
alter table org_members enable row level security;
alter table suppliers enable row level security;
alter table cost_centers enable row level security;
alter table cost_center_rules enable row level security;
alter table invoices enable row level security;
alter table invoice_line_items enable row level security;
alter table tags enable row level security;
alter table invoice_tags enable row level security;
alter table extraction_preferences enable row level security;
alter table erp_integration_settings enable row level security;
alter table webhook_delivery_log enable row level security;
alter table country_mailboxes enable row level security;
alter table collection_runs enable row level security;
alter table collection_settings enable row level security;
alter table email_ingest_log enable row level security;
alter table fx_rates enable row level security;

-- Organizações: qualquer membro ativo lê; só admin altera.
create policy organizations_select on organizations
  for select using (id in (select auth_org_ids()));
create policy organizations_update on organizations
  for update using (auth_is_admin(id)) with check (auth_is_admin(id));

-- Membros: qualquer membro ativo vê a equipa; só admin gere.
create policy org_members_select on org_members
  for select using (organization_id in (select auth_org_ids()));
create policy org_members_insert on org_members
  for insert with check (auth_is_admin(organization_id));
create policy org_members_update on org_members
  for update using (auth_is_admin(organization_id))
  with check (auth_is_admin(organization_id));
create policy org_members_delete on org_members
  for delete using (auth_is_admin(organization_id));

-- Tabelas de trabalho: leitura para todos os membros, escrita para admin/membro.
-- `leitor` fica limitado a consulta e exportação.
do $$
declare
  t text;
begin
  foreach t in array array[
    'suppliers', 'cost_centers', 'cost_center_rules', 'invoices',
    'invoice_line_items', 'tags', 'invoice_tags'
  ]
  loop
    execute format(
      'create policy %1$s_select on %1$s for select using (organization_id in (select auth_org_ids()))', t);
    execute format(
      'create policy %1$s_insert on %1$s for insert with check (auth_can_write(organization_id))', t);
    execute format(
      'create policy %1$s_update on %1$s for update using (auth_can_write(organization_id)) with check (auth_can_write(organization_id))', t);
    execute format(
      'create policy %1$s_delete on %1$s for delete using (auth_can_write(organization_id))', t);
  end loop;
end;
$$;

-- Configuração sensível: leitura para membros, escrita exclusiva de admin.
do $$
declare
  t text;
begin
  foreach t in array array[
    'extraction_preferences', 'erp_integration_settings', 'country_mailboxes',
    'collection_settings'
  ]
  loop
    execute format(
      'create policy %1$s_select on %1$s for select using (organization_id in (select auth_org_ids()))', t);
    execute format(
      'create policy %1$s_insert on %1$s for insert with check (auth_is_admin(organization_id))', t);
    execute format(
      'create policy %1$s_update on %1$s for update using (auth_is_admin(organization_id)) with check (auth_is_admin(organization_id))', t);
    execute format(
      'create policy %1$s_delete on %1$s for delete using (auth_is_admin(organization_id))', t);
  end loop;
end;
$$;

-- Registos de auditoria: só leitura pela app; escrita apenas via service-role.
create policy webhook_delivery_log_select on webhook_delivery_log
  for select using (organization_id in (select auth_org_ids()));
create policy collection_runs_select on collection_runs
  for select using (organization_id in (select auth_org_ids()));
create policy email_ingest_log_select on email_ingest_log
  for select using (organization_id in (select auth_org_ids()));

-- Câmbios: leitura para qualquer utilizador autenticado; escrita via service-role.
create policy fx_rates_select on fx_rates
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Criação atómica de organização
-- Contorna o problema do ovo/galinha: sem esta RPC, o primeiro utilizador não
-- conseguiria inserir a organização (a política exige pertença que ainda não existe).
-- ---------------------------------------------------------------------------

-- `extensions` tem de constar do search_path: é onde vive gen_random_bytes().
create or replace function create_organization_with_owner(p_nome text, p_nif text, p_user_nome text default null)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_org_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Sem sessão autenticada';
  end if;

  if exists (select 1 from org_members where user_id = v_user_id) then
    raise exception 'Este utilizador já pertence a uma organização';
  end if;

  insert into organizations (nome, nif) values (p_nome, p_nif) returning id into v_org_id;

  insert into org_members (organization_id, user_id, nome, role, status)
  values (v_org_id, v_user_id, p_user_nome, 'admin', 'ativo');

  insert into extraction_preferences (organization_id) values (v_org_id);
  insert into collection_settings (organization_id) values (v_org_id);
  insert into erp_integration_settings (organization_id, secret)
  values (v_org_id, encode(gen_random_bytes(32), 'hex'));

  return v_org_id;
end;
$$;

revoke all on function create_organization_with_owner(text, text, text) from public;
grant execute on function create_organization_with_owner(text, text, text) to authenticated;
