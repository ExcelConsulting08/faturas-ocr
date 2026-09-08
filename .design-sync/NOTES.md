# Notas de sincronização — @faturas/ui

## Contexto

O repositório é uma **aplicação Next.js**, não um design system. O kit
`packages/ui` foi extraído dela para tornar a sincronização possível: contém só
os primitivos genéricos. Os componentes acoplados ao domínio (tabela de faturas,
modal de upload, vista de mailboxes) ficam na app de propósito — dependem de
Server Actions e de tipos do Supabase e não renderizariam fora dela.

## O que se aprendeu nesta sincronização

- **O pacote tinha de compilar o seu próprio CSS.** Os componentes usam classes
  utilitárias do Tailwind, mas o pacote só publicava os tokens. Dentro da app
  funcionava (o Tailwind da app varre `packages/ui/src`), mas no bundle do design
  system os componentes renderizavam completamente sem estilo — botões nativos do
  browser. Resolvido com `src/styles.css` + o script `build:css`, que compila as
  utilidades para `dist/styles.css`. **`cfg.cssEntry` tem de apontar para
  `dist/styles.css`, nunca para `src/tokens.css`** (esse só traz as variáveis).

- **As composições de exemplo entram no varrimento do Tailwind.** O
  `@source "../../../.design-sync/previews"` em `src/styles.css` não é acidental:
  sem ele, o CSS traz apenas o que os componentes usam por dentro, e qualquer
  layout à volta deles (`flex`, `justify-between`, `gap`) fica sem efeito. Isto
  vale tanto para as pré-visualizações como para os ecrãs que o agente de design
  compõe. Sintoma quando falta: texto colado, elementos sem espaçamento.

- **Utilidades da marca via `@source inline(...)`.** `bg-background` não existia
  porque nenhum componente o usa internamente — mas quem compõe ecrãs precisa
  dele. A linha `@source inline(...)` garante que todas as utilidades de token
  são geradas independentemente do uso interno.

- **Sem provider.** Nenhum componente lê contexto, por isso `cfg.provider` não é
  necessário. Se isso mudar, é a primeira coisa a verificar quando as
  pré-visualizações renderizarem vazias.

## Ordem de build

O `npm run build:ui` faz `tsup` (JS + tipos) **e depois** `build:css` (Tailwind).
Correr só o `tsup` deixa o `dist/styles.css` desatualizado e as pré-visualizações
saem com estilos antigos, sem qualquer erro visível.

## Riscos para futuras sincronizações

- **O CSS depende de duas pastas fora do pacote.** `src/styles.css` varre
  `.design-sync/previews`. Se essa pasta for renomeada ou movida, o CSS compila à
  mesma mas perde utilidades — falha silenciosa. O sintoma é layout colapsado nas
  pré-visualizações.

- **Componentes novos no kit não entram sozinhos.** São descobertos pelos exports
  do `dist/index.d.ts`; se um componente for acrescentado ao `src/` mas não
  exportado no `index.ts`, não aparece na sincronização.

- **`bg-*` da marca só existem enquanto a linha `@source inline(...)` existir.**
  Se alguém a remover por parecer supérflua, as utilidades desaparecem do CSS
  compilado e os ecrãs construídos com o kit perdem os fundos.

- **Só o Playwright foi instalado em `.ds-sync/`**, que é ignorado pelo git. Numa
  máquina nova é preciso reinstalar antes de validar renders.

## Avisos conhecidos de render

Nenhum. Na última sincronização os 10 componentes renderizaram limpos, sem
avisos. Um aviso numa próxima execução é novo — investigar, não ignorar.
