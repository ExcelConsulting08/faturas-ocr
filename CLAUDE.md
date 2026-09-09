@AGENTS.md

# Gestão de faturas com OCR

Faturas de fornecedores entram por upload manual ou por caixas de correio por país,
são lidas por OCR, validadas e arquivadas. Produto original — a app de referência
serviu só de inspiração de UX; nada de código, dados ou marca de terceiros.

## Comandos

| | |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | compila o kit de UI e depois a aplicação |
| `npm run lint` | ESLint |
| `npm run verify` | asserções de lógica pura (validadores, nomes de ficheiro, estados, intervalos de páginas) |

Não há `npm test`: a suite é o `verify`. Há ainda `npx tsx --conditions=react-server
scripts/verify-pdf-split.ts` para a divisão de PDFs, que precisa dessa condição por
importar `server-only`.

No Windows use `npm.cmd` — o `npm.ps1` está bloqueado pela política de execução.

## Stack

Next.js (App Router) · TypeScript estrito · Tailwind · Supabase (Postgres, RLS, Auth,
Storage) · Gemini para OCR · Microsoft Graph para correio e SharePoint · Recharts.
Monorepo com npm workspaces: a app na raiz, o kit de interface em `packages/ui`.

## Arquitetura

**Server Actions para tudo o que a interface muda.** Route Handlers só para o que não
vem da UI: alvos de cron, exportações e o callback de autenticação.

**Um único caminho de ingestão.** O upload manual e a recolha por email passam pela
mesma função; só diferem na origem e no país. Qualquer melhoria ao OCR ou às regras
aplica-se às duas sem duplicação — não abrir um segundo caminho.

**A identidade é independente do Microsoft.** O Graph serve correio e ficheiros, nunca
autenticação. A app tem de continuar a funcionar para quem não existe no Azure AD.

**O armazenamento é abstrato.** O pipeline fala com uma interface, não com o SharePoint
nem com o Supabase Storage. Trocar de fornecedor não deve tocar no pipeline.

**Cada fatura é dona do seu ficheiro.** É o que permite renomear quando o número muda e
mover quando a data muda, sem dois registos a disputar o mesmo ficheiro.

## Invariantes de domínio

**Nunca calcular valores — transcrever o que está impresso.** Somar as linhas dá uma
base tributável errada sempre que os preços já incluem IVA, como nos talões
portugueses. Se o documento traz um resumo, é ele que manda.

**Nada é apagado.** Descartar uma fatura arquiva-a (retenção legal de 10 anos);
desativar um utilizador preserva o histórico de quem confirmou o quê.

**Na dúvida, não automatizar.** Valores que não fecham, ou um lote que não se consegue
separar com segurança, vão a revisão humana por muito confiante que o modelo diga estar.

**Falhas de armazenamento não invalidam dados.** A gravação em base de dados vale; o
ficheiro reconcilia-se depois.

## Segurança

- Toda a Server Action começa por resolver o contexto e verificar o papel, e filtra por
  `organization_id` **além** do id do registo — mesmo com RLS ativa.
- A RLS é a fronteira real de isolamento; o acesso a ficheiros é sempre mediado pelo
  servidor com URLs assinados. O browser nunca fala diretamente com o armazenamento.
- A service-role só em código de servidor que age em nome do sistema. Nunca com prefixo
  `NEXT_PUBLIC_`, nunca em resposta a input não validado.
- `.env*` nunca é versionado. Segredos são colados pelo utilizador, nunca por mim.
- Seeds, fixtures e testes usam apenas dados fictícios.

## Convenções

Domínio em português (`fatura`, `fornecedor`, `numero`, `pais`); APIs e tipos técnicos
em inglês. Os comentários explicam o **porquê**, não o quê — a decisão, a armadilha, a
razão de não ser do modo óbvio. Sem comentários que repitam o código.

## Manter este ficheiro verdadeiro

Escrito de propósito com decisões e invariantes, não com números de versão, contagens
nem listas de ficheiros — essas ficam falsas sozinhas. Quando uma alteração contradiz
algo aqui, corrigir **no mesmo commit**. Um ficheiro de instruções errado é pior do que
nenhum, porque é lido como verdade.
