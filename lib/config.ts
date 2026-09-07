/** Variáveis sem as quais a aplicação não consegue arrancar. */
export function missingCoreEnvVars(): string[] {
  return ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"].filter(
    (name) => !process.env[name],
  );
}

export function isConfigured(): boolean {
  return missingCoreEnvVars().length === 0;
}
