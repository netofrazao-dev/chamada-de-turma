# Challenger Presença

Sistema de chamadas e frequência da **Challenger Language School**.
Funciona no navegador e pode ser **instalado como aplicativo** no celular (Android e iPhone) e no computador.

🔗 Site: https://netofrazao-dev.github.io/chamada-de-turma/

---

## O que o sistema faz

**Professor**
- Vê as **aulas de hoje** e quais chamadas ainda faltam.
- Faz a chamada com um toque por aluno (✓ presente / ✗ falta), botão **Todos presentes**, contadores e aviso se sair sem salvar.
- Registra **reforço** e **reposição** (só quem participou conta; valem 1h), **substituições** (professor do sistema ou de fora) e **aula que não aconteceu** (ninguém leva falta).
- Cadastra alunos (um por vez ou **vários de uma vez**), edita nome e data de entrada, transfere de turma (com histórico).
- **Relatório da turma**: frequência por aluno (destaque abaixo de 75%), calendário do mês (dias com chamada, incompletos, com substituto, dias de aula sem chamada) e exportação em **PDF** e **Excel**.
- **Meu relatório**: horas do mês, aulas próprias e como substituto, em PDF e Excel.
- Define os **dias de aula** de cada turma.

**Coordenação (admin)**
- Painel com números gerais e lista de professores → turmas de cada um.
- **Chamadas** por turma e mês (calendário + lista).
- **Horas por professor** em qualquer período (Excel).
- **Relatório mensal** de cada professor (PDF/Excel).
- **Acessos**: emails autorizados a criar conta.

Outros: tema claro/escuro, funciona bem em celular/tablet/computador, botão “voltar” do Android funciona dentro do app, aviso quando fica sem internet, recuperação de senha por email.

---

## 📱 Instalar no celular

### Android (gera um app de verdade)
1. Abra o site no **Google Chrome**.
2. Toque em **Instalar app** (aparece um aviso na parte de baixo, ou no botão 📱 do topo).
3. Confirme. O app **Presença** aparece na gaveta de aplicativos.

> No Android, o Chrome transforma o site em um **WebAPK**: um APK assinado pelo próprio Google, que aparece na lista de apps, nas configurações do celular e abre em tela cheia. Não precisa baixar nada da Play Store.

### iPhone / iPad
1. Abra o site no **Safari**.
2. Toque em **Compartilhar** (quadrado com seta para cima).
3. Toque em **Adicionar à Tela de Início** → **Adicionar**.

O app também mostra esse passo a passo quando a pessoa toca em **Instalar app**.

### Computador
No Chrome ou Edge, clique no ícone de instalar na barra de endereço (ou no botão **Instalar app** do topo).

### Quero um arquivo .apk para mandar por WhatsApp / publicar na Play Store
1. Acesse https://www.pwabuilder.com e cole o endereço do site.
2. Clique em **Package for stores → Android → Generate**.
3. Baixe o pacote: ele traz o `.apk` (para instalar direto) e o `.aab` (para a Play Store), além das instruções de assinatura.

---

## 🟢 Supabase sempre ligado (keep-alive)

No plano grátis o Supabase **pausa o projeto depois de 7 dias sem uso**. Para isso não acontecer, o repositório tem uma automação no GitHub:

- Arquivo: `.github/workflows/keep-alive.yml`
- Roda **sozinha todos os dias** (09:23, horário de Brasília) e faz consultas no banco.
- Não cria commits, não muda dados do app e não precisa de ninguém mexer em nada.
- Ela mesma se mantém ligada (o GitHub desliga agendamentos de repositórios parados há 60 dias; o workflow renova isso a cada execução).
- Se o banco não responder, a execução fica vermelha e o GitHub manda um email avisando.

**Importante:** agendamentos só rodam a partir da branch principal (`main`). Depois de juntar estas mudanças na `main`, vá em **Actions → Manter Supabase ativo → Run workflow** para rodar a primeira vez e conferir que ficou verde.

### Recomendado (1 minuto, uma vez só)
Para o ping também **gravar** no banco (atividade mais forte), rode o arquivo [`supabase/keep_alive.sql`](supabase/keep_alive.sql):
Supabase → **SQL Editor** → **New query** → cole o conteúdo → **Run**.
Ele cria uma tabela de uma linha (fechada para o público) e a função `keep_alive()`.

### Se o projeto já estiver pausado
A automação não consegue “despausar”. Entre em https://supabase.com/dashboard, abra o projeto e clique em **Restore project**. A partir daí o keep-alive mantém ele ativo.

---

## Publicação (GitHub Pages)

O site é estático (HTML, CSS e JavaScript puro, sem etapa de build). Qualquer commit na `main` é publicado pelo GitHub Pages em alguns minutos.

Depois de publicar uma versão nova, **não é preciso limpar cache**: o service worker sempre busca os arquivos novos quando há internet. Ao lançar uma versão, se quiser, aumente `APP_VERSAO` em `js/config.js` e `VERSION` em `service-worker.js`.

### Configuração
Os dados do Supabase ficam em `js/config.js`. A chave `anon` é pública por natureza; quem protege os dados são as políticas **RLS** do banco.

Para o link de **“Esqueci minha senha”** funcionar, confira no Supabase em **Authentication → URL Configuration** se o endereço do site está em *Site URL* / *Redirect URLs*.

---

## Estrutura

```
index.html              página única do app
manifest.json           dados do app instalável (nome, ícones, cores)
service-worker.js       cache e funcionamento offline
css/app.css             visual (tema claro/escuro, celular e computador)
js/app.js               início do app, menu e rotas
js/config.js            configurações (Supabase, nome, versão)
js/api.js               todas as consultas ao banco
js/stats.js             cálculos de frequência e resumos
js/reports.js           PDF e Excel
js/pwa.js               instalação do app e aviso offline
js/views/...            telas (login, turmas, chamada, alunos, relatórios, admin)
icons/, imagens/        ícones do app e logo
supabase/keep_alive.sql função opcional do keep-alive
.github/workflows/      automação do keep-alive
```

O banco de dados continua exatamente o mesmo (mesmas tabelas e colunas): a atualização não exige nenhuma alteração no Supabase.
