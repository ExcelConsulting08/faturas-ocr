/**
 * Copia os tokens para o dist como styles.css.
 *
 * Ficheiro próprio em vez de um `node -e` inline no tsup.config: em Windows as
 * barras invertidas dos caminhos eram interpretadas como escapes (`\t` virava
 * tabulação) e a cópia falhava.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const destino = join(raiz, "dist", "styles.css");

mkdirSync(dirname(destino), { recursive: true });
copyFileSync(join(raiz, "src", "tokens.css"), destino);

console.log("tokens copiados para dist/styles.css");
