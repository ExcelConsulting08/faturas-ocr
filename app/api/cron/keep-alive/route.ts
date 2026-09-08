import { NextResponse, type NextRequest } from "next/server";

import { decidirTentativa, MAX_TENTATIVAS, pingConfirmado } from "@/lib/keep-alive/decide";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Mantém o projeto Supabase acordado.
 *
 * O plano gratuito do Supabase põe o projeto em pausa ao fim de alguns dias sem
 * atividade, e reativá-lo é manual. Um pedido por dia evita isso.
 *
 * A repetição pedida ("se falhar, tenta uma hora depois") não pode viver dentro
 * de uma única invocação — uma função serverless não fica uma hora à espera. Em
 * vez disso, o cron dispara três vezes por dia, com uma hora de intervalo, e o
 * estado de cada dia fica em `db_pings`: assim que houver sucesso, os disparos
 * seguintes não fazem nada, e ao fim de três falhas o dia dá-se por perdido.
 * O resultado é exatamente o comportamento pedido, sem a função bloquear.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 500 });
  }

  const authorized =
    request.headers.get("authorization") === `Bearer ${secret}` ||
    request.nextUrl.searchParams.get("secret") === secret;

  if (!authorized) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // Dia em UTC, o mesmo fuso que o agendador da Vercel usa — para o "hoje" da
  // consulta e o "hoje" da gravação nunca divergirem à meia-noite.
  const dia = new Date().toISOString().slice(0, 10);
  const supabase = createAdminClient();

  // Ler o histórico do dia é, em si, o primeiro contacto com a base de dados:
  // se isto falhar, a base de dados não respondeu e a tentativa conta como falha.
  const { data: hoje, error: erroHistorico } = await supabase
    .from("db_pings")
    .select("tentativa, sucesso")
    .eq("dia", dia)
    .order("tentativa", { ascending: false })
    .returns<{ tentativa: number; sucesso: boolean }[]>();

  if (erroHistorico) {
    return NextResponse.json(
      {
        ok: false,
        dia,
        estado: "erro",
        motivo: "Não foi possível ler o histórico de pings",
        erro: erroHistorico.message,
      },
      { status: 503 },
    );
  }

  const decisao = decidirTentativa(hoje ?? []);

  if (decisao.acao === "ignorar") {
    const confirmado = decisao.estado === "ja_confirmado";
    return NextResponse.json({
      ok: confirmado,
      dia,
      estado: decisao.estado,
      tentativas: decisao.tentativas,
      motivo: confirmado
        ? undefined
        : `${MAX_TENTATIVAS} tentativas falhadas hoje; nova tentativa só amanhã`,
    });
  }

  const { tentativa } = decisao;
  const inicio = Date.now();

  // O ping propriamente dito: uma contagem sobre uma tabela real da aplicação.
  // Não usa `db_pings` de propósito — tocar numa tabela do domínio confirma que
  // a base de dados está a servir a app, não só a si própria.
  const { count, error: erroPing } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true });

  const duracaoMs = Date.now() - inicio;

  // Confirmação explícita: só conta como sucesso se não houve erro *e* a
  // resposta trouxe efetivamente uma contagem. Um `count` nulo sem erro
  // significa que a resposta não é utilizável — trata-se como falha.
  const sucesso = pingConfirmado(erroPing?.message ?? null, count);
  const erro = sucesso
    ? null
    : (erroPing?.message ?? "A base de dados respondeu sem devolver uma contagem");

  // Gravar o resultado é a segunda metade do ping: garante uma escrita real,
  // porque a Supabase considera o projeto ativo por qualquer pedido, mas uma
  // escrita é a prova mais forte de que a base de dados está operacional.
  const { error: erroRegisto } = await supabase.from("db_pings").insert({
    dia,
    tentativa,
    sucesso,
    erro,
    duracao_ms: duracaoMs,
  });

  if (erroRegisto) {
    return NextResponse.json(
      {
        ok: false,
        dia,
        tentativa,
        estado: "erro",
        motivo: "O ping correu mas o resultado não pôde ser gravado",
        erro: erroRegisto.message,
      },
      { status: 503 },
    );
  }

  if (sucesso) {
    return NextResponse.json({ ok: true, dia, tentativa, estado: "confirmado", duracaoMs });
  }

  const restantes = MAX_TENTATIVAS - tentativa;
  return NextResponse.json(
    {
      ok: false,
      dia,
      tentativa,
      estado: restantes > 0 ? "falhou_vai_repetir" : "esgotado",
      erro,
      duracaoMs,
      proximaTentativa: restantes > 0 ? "dentro de uma hora" : null,
    },
    { status: 503 },
  );
}
