export type Role = "admin" | "membro" | "leitor";
export type MemberStatus = "ativo" | "inativo";

export type InvoiceStatus =
  | "a_processar"
  | "auto_confirmada"
  | "confirmada"
  | "por_rever"
  | "falhada";

export type PaymentStatus = "por_pagar" | "paga";
export type InvoiceOrigin = "upload" | "email";
export type ExtractionMode = "automatico" | "semi_automatico" | "manual";
export type ConnectionStatus = "ligada" | "desligada" | "erro";

export interface Organization {
  id: string;
  nome: string;
  nif: string;
  created_at: string;
}

export interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  nome: string | null;
  role: Role;
  status: MemberStatus;
  invited_by: string | null;
  invited_at: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface Supplier {
  id: string;
  organization_id: string;
  nome: string;
  nif: string | null;
  iban: string | null;
  created_at: string;
}

export interface CostCenter {
  id: string;
  organization_id: string;
  nome: string;
  cor: string | null;
  created_at: string;
}

export interface Tag {
  id: string;
  organization_id: string;
  nome: string;
  cor: string | null;
  created_at: string;
}

export interface ValidationFlags {
  nif_valid?: boolean;
  iban_valid?: boolean;
  dates_valid?: boolean;
  /** Base + IVA fecham com o total lido. */
  totals_match?: boolean;
  /** Base e total foram encontrados impressos no documento. */
  totals_present?: boolean;
}

export interface Invoice {
  id: string;
  organization_id: string;
  supplier_id: string | null;
  cost_center_id: string | null;

  storage_provider: "supabase" | "sharepoint" | null;
  storage_container: string | null;
  storage_id: string | null;
  storage_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;

  origin: InvoiceOrigin;
  pais: string | null;
  status: InvoiceStatus;
  payment_status: PaymentStatus;

  numero: string | null;
  is_credit_note: boolean;
  moeda: string;
  data_emissao: string | null;
  data_vencimento: string | null;
  entrada_at: string;

  nome_extracted: string | null;
  nif_extracted: string | null;
  iban_extracted: string | null;

  base_tributavel: number;
  iva_total: number;
  total: number;
  total_eur: number | null;
  fx_rate_used: number | null;

  confidence_score: number | null;
  extraction_raw: unknown;
  extraction_error: string | null;
  validation_flags: ValidationFlags;

  is_possible_duplicate: boolean;
  duplicate_of_invoice_id: string | null;

  discarded_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  organization_id: string;
  posicao: number;
  descricao: string | null;
  quantidade: number;
  preco_unitario: number;
  iva_percentagem: number;
  desconto: number;
  outro_imposto: number;
  total_linha: number;
  created_at: string;
}

export interface InvoiceWithRelations extends Invoice {
  supplier: Supplier | null;
  cost_center: CostCenter | null;
  line_items: InvoiceLineItem[];
  tags: Tag[];
}

export interface CountryMailbox {
  id: string;
  organization_id: string;
  pais: string;
  empresa: string;
  idioma: string;
  email_address: string;
  graph_user_id: string | null;
  delta_token: string | null;
  ativo: boolean;
  connection_status: ConnectionStatus;
  last_polled_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface CollectionSettings {
  organization_id: string;
  loop_ativo: boolean;
  intervalo_segundos: number;
  updated_at: string;
}

export interface CollectionRun {
  id: string;
  organization_id: string;
  mailbox_id: string | null;
  trigger: "loop" | "manual";
  started_at: string;
  finished_at: string | null;
  messages_seen: number;
  invoices_created: number;
  skipped: number;
  error_message: string | null;
}

export interface ExtractionPreferences {
  organization_id: string;
  modo: ExtractionMode;
  limiar_alto: number;
  limiar_baixo: number;
  updated_at: string;
}

export interface ErpIntegrationSettings {
  organization_id: string;
  webhook_url: string | null;
  envio_automatico: boolean;
  secret: string;
  updated_at: string;
}

export interface OrgContext {
  organization: Organization;
  member: OrgMember;
  userEmail: string;
}
