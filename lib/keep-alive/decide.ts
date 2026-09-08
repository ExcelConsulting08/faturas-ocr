/** Tentativas por dia antes de desistir até ao dia seguinte. */
export const MAX_TENTATIVAS = 3;

export type RegistoPing = { tentativa: number; sucesso: boolean };

export type Decisao =
  | { acao: "ignorar"; estado: "ja_confirmado"; tentativas: number }
  | { acao: "ignorar"; estado: "esgotado"; tentativas: number }
  | { acao: "pingar"; tentativa: number };

/**
 * Decide o que fazer num disparo do cron, a partir dos pings já registados hoje.
 *
 * Isto é o coração da repetição: o cron dispara várias vezes por dia com uma
 * hora de intervalo, e é esta função que faz os disparos seguintes não fazerem
 * nada quando o dia já foi confirmado — ou quando já se falhou vezes que cheguem.
 */
export function decidirTentativa(registosDeHoje: RegistoPing[], max = MAX_TENTATIVAS): Decisao {
  if (registosDeHoje.some((r) => r.sucesso)) {
    return { acao: "ignorar", estado: "ja_confirmado", tentativas: registosDeHoje.length };
  }

  if (registosDeHoje.length >= max) {
    return { acao: "ignorar", estado: "esgotado", tentativas: registosDeHoje.length };
  }

  return { acao: "pingar", tentativa: registosDeHoje.length + 1 };
}

/**
 * O ping só conta como bem-sucedido se a base de dados respondeu *e* devolveu
 * algo utilizável. Uma resposta sem erro mas sem contagem não prova nada.
 */
export function pingConfirmado(erro: string | null, count: number | null): boolean {
  return erro === null && typeof count === "number";
}
