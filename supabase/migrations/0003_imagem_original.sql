-- ============================================================================
-- Guardar também a imagem original, além da que foi enviada para extração
--
-- As fotografias são comprimidas no browser antes do envio (o limite do corpo
-- dos Server Actions são 4 MB). Guardar o original permite confirmar que a
-- compressão não perdeu nada relevante — e é o original que tem valor de prova
-- para efeitos de arquivo.
-- ============================================================================

alter table invoices add column storage_original_id text;
alter table invoices add column storage_original_path text;
