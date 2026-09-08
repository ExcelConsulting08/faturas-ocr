import "server-only";

import { isSharePointConfigured } from "@/lib/sharepoint/drive";
import { sharePointStorage } from "@/lib/storage/sharepoint-storage";
import { supabaseStorage } from "@/lib/storage/supabase-storage";
import type { StorageBackend, StorageProvider } from "@/lib/storage/types";

export type { StoredFile, StorageProvider } from "@/lib/storage/types";

/**
 * Escolhe o fornecedor de armazenamento a partir da configuração do ambiente.
 * O SharePoint tem precedência quando está configurado; caso contrário fica o
 * Supabase Storage, que não exige infraestrutura Microsoft nenhuma.
 */
export function getStorage(): StorageBackend {
  return isSharePointConfigured() ? sharePointStorage : supabaseStorage;
}

/** Fornecedor de um ficheiro já guardado, para o ler no sítio certo. */
export function getStorageFor(provider: StorageProvider | null): StorageBackend | null {
  if (provider === "sharepoint") return sharePointStorage;
  if (provider === "supabase") return supabaseStorage;
  return null;
}

export function storageProviderName(): string {
  return isSharePointConfigured() ? "SharePoint" : "Supabase Storage";
}
