-- ============================================================================
-- Armazenamento agnóstico ao fornecedor
-- Os documentos deixam de estar presos ao SharePoint: passam a poder ficar no
-- Supabase Storage ou no SharePoint, conforme a configuração do ambiente.
-- ============================================================================

alter table invoices rename column sharepoint_drive_id to storage_container;
alter table invoices rename column sharepoint_item_id to storage_id;
alter table invoices rename column sharepoint_path to storage_path;

-- 'supabase' ou 'sharepoint'. Guardado por fatura porque o fornecedor pode
-- mudar ao longo do tempo e os ficheiros antigos continuam onde estavam.
alter table invoices
  add column storage_provider text
  check (storage_provider in ('supabase', 'sharepoint'));

-- Documentos existentes ficaram sem ficheiro (SharePoint nunca foi configurado).
update invoices set storage_provider = null where storage_id is null;

-- ---------------------------------------------------------------------------
-- Bucket privado para os documentos originais
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'faturas',
  'faturas',
  false,
  20971520,  -- 20 MB, o mesmo limite aplicado na aplicação
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/tiff'
  ]
)
on conflict (id) do nothing;

-- Sem políticas de acesso: o bucket é privado e todas as operações passam pelo
-- servidor com a service-role, depois de este validar as permissões do
-- utilizador. O browser nunca fala diretamente com o storage.
