# Gestão de Faturas com OCR

Aplicação de gestão de faturas de fornecedores com extração automática de dados, arquivo em
SharePoint e recolha automática a partir de caixas de correio por país.

## O que faz

- **Upload manual** de faturas (PDF, JPG, PNG, WebP, HEIC, TIFF até 20MB)
- **Recolha automática por email**: uma caixa Microsoft 365 por país; a caixa determina o país da
  fatura. A frequência depende do agendador (ver [Agendamento da recolha](#agendamento-da-recolha))
- **Extração por OCR** com Gemini Flash: fornecedor, NIF, IBAN, número, datas, linhas e totais
- **Validação determinística**: checksum de NIF português, IBAN (mod-97) e coerência de datas,
  combinados com a confiança do modelo para decidir se a fatura segue automaticamente ou vai para
  revisão
- **Vários documentos num só ficheiro**: um PDF com um lote de faturas dá origem a um registo por
  fatura, cada um com o seu próprio ficheiro (ver [Ficheiros com várias faturas](#ficheiros-com-várias-faturas))
- **Deteção de duplicados** por fornecedor + número + total
- **Centros de custo** com regras automáticas por fornecedor
- **Dashboard** com gastos por mês, por estado, por centro de custo, por país e resumo de IVA
- **Arquivo dos documentos** organizado por organização / país / ano / mês, no Supabase Storage
  por omissão ou no SharePoint da empresa quando este estiver configurado
- **Integração ERP** por webhook assinado (HMAC-SHA256)
- **Gestão de utilizadores própria**, independente do Microsoft: papéis admin/membro/leitor

## Arranque rápido

### 1. Base de dados (Supabase)

Crie um projeto em [supabase.com](https://supabase.com) (o plano gratuito chega para começar).

No painel do projeto, abra **SQL Editor**, cole o conteúdo de
`supabase/migrations/0001_init.sql` e execute.

Em **Project Settings → API** copie:

- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (nunca partilhar nem versionar)

Em **Authentication → Providers**, confirme que o **Email** está ativo. Para testar sem servidor de
email, desligue a confirmação de email em **Authentication → Sign In / Providers → Email →
Confirm email**.

### 2. Variáveis de ambiente

```bash
cp .env.example .env.local
```

Preencha pelo menos as três variáveis do Supabase. As restantes são opcionais:

- **Sem `GEMINI_API_KEY`** a aplicação corre em **modo simulado** — o fluxo completo funciona,
  mas os dados extraídos são fictícios. Útil para experimentar sem custos.
  A chave obtém-se em [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
- **Sem as variáveis do Microsoft Graph / SharePoint**, os documentos são guardados no **Supabase
  Storage** (bucket `faturas`, privado) e tudo funciona — upload, extração e visualizador. Só a
  recolha automática por email fica indisponível, por depender das caixas Microsoft 365.

### 3. Correr

```bash
npm run dev
```

Abra http://localhost:3000, crie conta e siga para a criação da organização.

## Configuração do Microsoft 365 (opcional)

Necessária para a recolha de faturas por email e para trocar o armazenamento do Supabase Storage
pelo SharePoint da empresa. Quando `SHAREPOINT_DRIVE_ID` e as credenciais do Graph estão presentes,
os documentos novos passam a ser guardados no SharePoint; os antigos permanecem onde foram
gravados, porque cada fatura regista o seu fornecedor de armazenamento.

1. **Registar a aplicação** no Azure AD (Microsoft Entra ID) → App registrations → New registration.
2. Em **Certificates & secrets**, criar um client secret → `MS_GRAPH_CLIENT_SECRET`.
   O Directory (tenant) ID e o Application (client) ID vão para `MS_GRAPH_TENANT_ID` e
   `MS_GRAPH_CLIENT_ID`.
3. Em **API permissions**, adicionar permissões de **aplicação** (não delegadas):
   - `Mail.Read` e `Mail.ReadWrite` — ler as caixas e marcar mensagens como lidas
   - `Sites.Selected` (recomendado) ou `Sites.ReadWrite.All` — arquivo dos ficheiros
   Depois, **Grant admin consent**.
4. **Restringir o acesso ao correio** (importante): sem isto a aplicação consegue ler todas as
   caixas do tenant. No Exchange Online PowerShell:

   ```powershell
   New-ApplicationAccessPolicy -AppId <CLIENT_ID> `
     -PolicyScopeGroupId grupo-caixas-faturas@empresa.pt `
     -AccessRight RestrictAccess `
     -Description "Acesso apenas às caixas de faturas"
   ```

5. **SharePoint**: criar (ou escolher) o site e a biblioteca de documentos onde as faturas ficam
   arquivadas. Obter os identificadores via Graph:

   ```
   GET https://graph.microsoft.com/v1.0/sites/{hostname}:/sites/{site}    → SHAREPOINT_SITE_ID
   GET https://graph.microsoft.com/v1.0/sites/{site-id}/drives            → SHAREPOINT_DRIVE_ID
   ```

6. Na aplicação, em **Mailboxes**, adicionar uma caixa por país (código de 2 letras, empresa,
   idioma e endereço) e iniciar o loop de recolha.

### Como os ficheiros ficam organizados

```
/Faturas/{organization_id}/{PAÍS}/{ANO}/{MÊS}/{NÚMERO_DA_FATURA}__{invoice_id}.pdf
```

O nome junta o número original da fatura (reconhecível por quem navega o SharePoint) ao
identificador do registo (correspondência inequívoca com a base de dados, sem colisões).

Enquanto a extração não corre, o ficheiro fica em `_Entrada` e é movido/renomeado assim que o
número e a data são conhecidos. **Se um utilizador corrigir o número, a data ou o país, o ficheiro é
renomeado e movido em conformidade** — a ligação nunca se parte, porque é feita pelo
`sharepoint_item_id` e não pelo caminho. Faturas descartadas são movidas para `_Descartadas` em vez
de eliminadas, por causa da retenção legal.

## Ficheiros com várias faturas

Um ficheiro — carregado à mão ou recebido por email — pode trazer mais do que uma fatura: um lote
enviado pelo fornecedor, ou uma digitalização de vários documentos de uma vez. Cada fatura dá
origem ao **seu próprio registo, com o seu próprio ficheiro**, para depois se comportar em tudo como
uma fatura que chegou sozinha: renomeia quando o número muda, muda de pasta quando a data muda, é
confirmada ou descartada isoladamente.

A separação é feita pelo modelo, que indica as páginas de cada fatura. Esses intervalos são depois
validados: têm de existir, estar dentro do documento, não se sobrepor, e não podem ser mais do que
as páginas disponíveis.

- **Intervalos válidos** → o PDF é dividido e cada registo fica com as suas páginas.
- **Intervalos inválidos**, ou uma imagem (que não se divide) → cada registo fica com uma **cópia do
  documento completo**, nenhum se auto-confirma, e todos ficam com uma nota a explicar porquê.

Perder a divisão é um incómodo; cortar uma fatura ao meio ou dar-lhe as páginas de outra é um erro
que ninguém deteta a olhar para o registo. Na dúvida, não se divide.

O documento como chegou é sempre preservado e fica acessível em cada registo, no separador
**Documento completo** do visualizador. Na lista, estas faturas trazem a etiqueta `LOTE`; no
detalhe, uma barra indica a posição no lote e liga às restantes.

Um ficheiro lido como tendo mais de 25 faturas é rejeitado — a essa altura é mais provável ser um
erro de leitura do que um lote real.

## Agendamento da recolha

A rota `/api/cron/poll-mailboxes` faz a recolha e é protegida por `CRON_SECRET`.

- **Vercel**: o `vercel.json` agenda a execução **uma vez por dia** (07:00 UTC). O plano Hobby
  permite 2 cron jobs por projeto, com um disparo diário cada — a recolha ao minuto descrita acima
  exige o plano Pro, que suporta a granularidade `* * * * *`.
- **Recolha mais frequente sem mudar de plano**: qualquer agendador externo (GitHub Actions, cron de
  um servidor, Task Scheduler) a chamar:

  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://a-sua-app/api/cron/poll-mailboxes
  ```

Entretanto, o botão **Recolher agora** na página Mailboxes dispara a recolha à mão, pelo mesmo
caminho de código, sem depender de agendador nenhum.

### Manter a base de dados acordada

Os projetos Supabase no plano gratuito entram em pausa ao fim de alguns dias sem atividade. O
workflow `.github/workflows/keep-alive.yml` faz um pedido por dia à API do Supabase para o evitar.
Corre no GitHub Actions, e não na Vercel, porque os 2 cron jobs do plano Hobby já estão ocupados.
Requer a variável `SUPABASE_URL` e o segredo `SUPABASE_ANON_KEY` no repositório.

A recolha só corre para organizações com o loop ativo (ligado na página **Mailboxes**). A tabela
`email_ingest_log` garante que a mesma mensagem/anexo nunca é processada duas vezes, mesmo que duas
execuções se sobreponham.

## Integração ERP

Em **Definições → Integração ERP** define-se o URL do webhook e se o envio é automático quando uma
fatura fica confirmada. Cada pedido inclui:

```
X-Faturas-Signature: sha256=<hmac-sha256(corpo, segredo)>
```

Para validar no sistema recetor, calcule o HMAC-SHA256 sobre os **bytes exatos** do corpo recebido
(antes de qualquer reserialização de JSON) com o segredo mostrado nas definições.

## Papéis de utilizador

| Papel | Pode |
|---|---|
| **Administrador** | Tudo: utilizadores, definições, caixas de email, integração ERP |
| **Membro** | Carregar, editar, confirmar e descartar faturas; gerir centros de custo |
| **Leitor** | Consultar e exportar |

Os utilizadores são criados na página **Utilizadores**, por convite por email ou por password
temporária. Não dependem do Azure AD: pode dar acesso a contabilistas ou consultores externos que
não existem no diretório da empresa.

## Stack

Next.js (App Router) · TypeScript · Tailwind · Supabase (Postgres + RLS + Auth) · Gemini Flash
(Google Gemini) · Microsoft Graph (correio + SharePoint) · Recharts
