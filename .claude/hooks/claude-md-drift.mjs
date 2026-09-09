/**
 * Avisa quando se mexe num ficheiro que costuma tornar o CLAUDE.md falso.
 *
 * O CLAUDE.md descreve comandos, stack e decisões. Quando o package.json ganha
 * um script, uma migração muda o esquema, ou o agendamento muda, é aí que as
 * afirmações se partem — e é aí que se corrige, no mesmo commit, não numa
 * limpeza mais tarde que nunca acontece.
 *
 * Não bloqueia nada: injeta uma nota no contexto e segue.
 *
 * Recebe o JSON do hook em stdin. Usa Node por o jq não existir em Windows.
 */

/** Ficheiros cujas alterações costumam contradizer o CLAUDE.md. */
const GATILHOS = [
  { padrao: /(^|[/\\])package\.json$/, motivo: "os comandos npm podem ter mudado" },
  { padrao: /(^|[/\\])supabase[/\\]migrations[/\\]/, motivo: "o esquema da base de dados mudou" },
  { padrao: /(^|[/\\])vercel\.json$/, motivo: "o agendamento mudou" },
  { padrao: /(^|[/\\])\.github[/\\]workflows[/\\]/, motivo: "a automação mudou" },
];

let entrada = "";
process.stdin.on("data", (pedaco) => (entrada += pedaco));
process.stdin.on("end", () => {
  let caminho = "";
  try {
    caminho = JSON.parse(entrada)?.tool_input?.file_path ?? "";
  } catch {
    // JSON inesperado: não é motivo para incomodar ninguém.
    process.exit(0);
  }

  const gatilho = GATILHOS.find((entrada) => entrada.padrao.test(caminho));
  if (!gatilho) process.exit(0);

  const nome = caminho.split(/[/\\]/).pop();

  process.stdout.write(
    JSON.stringify({
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext:
          `Acabaste de alterar ${nome} — ${gatilho.motivo}. Verifica se o CLAUDE.md ` +
          `continua verdadeiro e, se não continuar, corrige-o no mesmo commit. ` +
          `Se nada mudou do que lá está escrito, ignora esta nota e não a menciones.`,
      },
    }),
  );
});
