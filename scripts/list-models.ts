/**
 * Lista os modelos Gemini disponíveis para a chave configurada.
 * Uso: npx tsx --env-file=.env.local scripts/list-models.ts
 */
async function main() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("GEMINI_API_KEY em falta em .env.local");
    process.exit(1);
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`,
  );

  if (!response.ok) {
    console.error(`Erro ${response.status}:`, (await response.text()).slice(0, 500));
    process.exit(1);
  }

  const data = (await response.json()) as {
    models: { name: string; displayName: string; supportedGenerationMethods?: string[] }[];
  };

  const usaveis = data.models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .filter((m) => m.name.includes("flash"))
    .map((m) => m.name.replace("models/", ""));

  console.log("Modelos Flash disponíveis:");
  for (const name of usaveis) console.log(" -", name);
}

main();
