-- ============================================================================
-- Um documento pode conter várias faturas
--
-- Chega frequentemente um único PDF com um lote de faturas do mesmo fornecedor,
-- ou o resultado de digitalizar vários documentos de uma vez. Cada fatura passa
-- a dar origem ao seu próprio registo, com o seu próprio ficheiro — para se
-- comportar em tudo como uma fatura que chegou sozinha: renomeia quando o
-- número muda, muda de pasta quando a data muda, é descartada isoladamente.
--
-- Estas colunas guardam a proveniência, para se poder sempre voltar ao
-- documento como ele chegou.
-- ============================================================================

-- Partilhado por todos os registos extraídos do mesmo ficheiro de origem.
-- Null quando o documento só tinha uma fatura: o caso simples não paga nada
-- pela existência do caso composto.
alter table invoices add column source_group_id uuid;

-- Páginas do documento de origem que deram esta fatura, ex. '3-4'. Null em
-- imagens e em documentos de fatura única.
alter table invoices add column source_pages text;

-- Quantas faturas saíram do documento de origem. 1 (ou null) no caso simples.
alter table invoices add column source_invoice_count int;

-- Para carregar os "irmãos" de uma fatura sem varrer a organização inteira.
create index invoices_source_group_idx
  on invoices (source_group_id)
  where source_group_id is not null;
