# Como construir com este kit

Kit de interface da aplicação de gestão de faturas. Dez componentes de composição
(sem lógica de domínio), estilizados com Tailwind e tokens de marca.

## Sem provider, sem tema

Nenhum componente lê contexto. Importa e usa — não há wrapper obrigatório, não há
`ThemeProvider`, nada a inicializar. Basta que `styles.css` esteja carregado.

## O idioma: classes Tailwind sobre tokens de marca

O kit usa classes utilitárias do Tailwind. Para cor, usa **sempre as utilidades de
marca** em vez de cores literais (`bg-indigo-600`) — é o que mantém os ecrãs
coerentes e permite mudar a paleta num sítio só:

| Utilidade | Valor | Usar para |
|---|---|---|
| `bg-background` | `#f7f8fa` | Fundo da página |
| `bg-surface` | `#ffffff` | Fundo de cartões e painéis |
| `bg-primary` | `#4f46e5` | Preenchimento da ação principal |
| `text-foreground` | `#16181d` | Texto principal |
| `text-muted` | `#6b7280` | Texto secundário, rótulos, ajudas |
| `text-primary` | `#4f46e5` | Ligações e destaques |
| `text-primary-foreground` | `#ffffff` | Texto sobre `bg-primary` |
| `border-border` | `#e5e7eb` | Todas as linhas e contornos |

Para espaçamento, tipografia e layout, usa as escalas normais do Tailwind
(`gap-3`, `p-4`, `text-sm`, `flex`, `grid`). Não inventes nomes: o `styles.css`
gerado contém as utilidades efetivamente disponíveis.

## Os componentes

`Card` · `CardHeader` · `CardBody` — o contentor de tudo. `CardHeader` traz a
linha de separação; `CardBody` traz o espaçamento interno. Podes empilhar vários
`CardBody` com `border-t border-border` para criar secções.

`Button` — `variant` comunica a intenção, não a cor: `primary` (ação principal),
`secondary` (padrão), `warning` (ação reversível), `danger` (destrutiva),
`ghost` (terciária). Aceita ícones como filhos; o espaçamento já está tratado.

`Input` · `Select` · `Label` · `Field` — `Field` junta rótulo e campo com o
espaçamento certo, e aceita um `hint` ao lado do rótulo para estados de validação.
Prefere `Field` a compor `Label` + `Input` à mão.

`Badge` — `tone` comunica gravidade: `neutral`, `green` (sucesso), `amber`
(atenção), `red` (erro), `indigo` (em curso), `sky` (informação).

`EmptyState` — `title` e `description` opcional, dentro de um `Card`.

## Onde está a verdade

Lê `_ds/<pasta>/styles.css` (e o que ele importa) para o conjunto real de
utilidades disponíveis, e o `.prompt.md` de cada componente para a sua API.
Os ficheiros reais valem mais do que este resumo.

## Exemplo idiomático

```jsx
<Card className="max-w-md">
  <CardHeader className="flex items-center justify-between">
    <h2 className="font-medium">Fornecedor</h2>
    <Badge tone="green">Confirmada</Badge>
  </CardHeader>
  <CardBody className="grid gap-4 sm:grid-cols-2">
    <Field label="NIF" hint={<span className="text-xs text-emerald-600">✓ válido</span>}>
      <Input defaultValue="513317171" />
    </Field>
    <Field label="Moeda">
      <Input defaultValue="EUR" />
    </Field>
  </CardBody>
  <CardBody className="border-t border-border">
    <Button variant="primary">Confirmar</Button>
  </CardBody>
</Card>
```

O controlo vem do kit; o layout à volta (`grid`, `gap-4`, `flex`) é Tailwind
normal. É assim que se compõe.
