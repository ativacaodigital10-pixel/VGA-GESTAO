# VGA App: gestão de redes sociais pelo celular

Aplicativo web (abre no navegador do celular e pode ser instalado na tela inicial) para o empresário montar e organizar as redes sociais do próprio negócio.

**Fase 1 (esta versão):** o empresário tira as fotos, o app trata, cria a arte e escreve a legenda. O post fica pronto e agendado. Na hora de postar, um toque abre o Instagram (ou outro app) com as fotos, e a legenda já fica copiada.

## O que o app faz

| Etapa | Como funciona |
|---|---|
| Conta | Cadastro com e-mail e senha. Cada empresário só vê os próprios posts. |
| Meu negócio | Nome, ramo, cidade, público, diferenciais, jeito de falar, @ do Instagram, WhatsApp, hashtags e cores da marca. |
| 1. Fotos | Tira a foto pela câmera ou escolhe da galeria (até 10, vira carrossel). Formatos: Feed 4:5, Quadrado 1:1, Stories/Reels 9:16. |
| 2. Tratamento | Melhoria automática de luz e cor, filtros, brilho, contraste, cor, temperatura, zoom e arrastar para enquadrar. Texto sobre a foto e etiqueta com o @ da marca, nas cores do negócio. Tudo feito no próprio celular. |
| 3. Legenda | A IA (Claude) olha todas as fotos do post (até 10, já tratadas), diz o que viu nelas e cria 3 opções de legenda que citam detalhes das fotos, além de hashtags, sugestão de horário e uma dica. O empresário pode escrever do jeito dele o que quer dizer, ou deixar em branco para a IA partir só das fotos. No modo demonstração (sem chave), as fotos não são analisadas. |
| 4. Agendar | Escolhe dia e hora, vê a prévia como no Instagram e salva como rascunho ou pronto. |
| Postar | "Postar agora" copia a legenda e abre o compartilhamento do celular com as fotos. Depois, "Já publiquei" marca o post como publicado. |
| Início | Próximos posts (com aviso de atrasado), publicados e resumo do mês. |

## Rodar no Windows (passo a passo)

### 1. Instalar o que precisa (só na primeira vez)

1. **Node.js:** baixe a versão **LTS** em https://nodejs.org e instale com as opções padrão. Precisa ser a 22.13 ou mais nova.
2. **Git:** baixe em https://git-scm.com/download/win e instale com as opções padrão.
3. Feche e abra de novo o **PowerShell** (menu Iniciar → digite "PowerShell"). Confira:

```powershell
node -v
```

Deve aparecer `v22.13.0` ou um número maior.

### 2. Baixar o projeto (só na primeira vez)

```powershell
cd $HOME
```

```powershell
git clone https://github.com/ativacaodigital10-pixel/VGA-GESTAO.git
```

```powershell
cd VGA-GESTAO
```

```powershell
git checkout claude/jolly-allen-5qo49g
```

Como o repositório é privado, o Git pode abrir uma janela pedindo login no GitHub. Entre com a sua conta.

### 3. Instalar as dependências do app (só na primeira vez)

```powershell
cd app
```

```powershell
npm install
```

```powershell
copy .env.example .env
```

### 4. (Opcional) Ligar a IA das legendas

```powershell
notepad .env
```

No Bloco de Notas, cole a sua chave depois de `ANTHROPIC_API_KEY=` (a chave é criada em https://console.anthropic.com), salve e feche. Sem a chave, o app funciona em modo demonstração.

### 5. Rodar

```powershell
npm start
```

Abra no navegador do computador:

- App: http://localhost:3000/app
- Site de vendas: http://localhost:3000

Para parar o app, volte ao PowerShell e aperte **Ctrl + C**.

### Nas próximas vezes

```powershell
cd $HOME\VGA-GESTAO\app
```

```powershell
git pull
```

```powershell
npm install
```

```powershell
npm start
```

### Se der erro

| Mensagem | O que fazer |
|---|---|
| `node` ou `git` não é reconhecido | Feche e abra o PowerShell de novo. Se continuar, reinstale marcando "Add to PATH". |
| `npm.ps1 não pode ser carregado porque a execução de scripts foi desabilitada` | Rode `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, responda `S` e tente de novo. |
| `No such built-in module: node:sqlite` | O Node está velho. Instale a versão LTS mais nova em nodejs.org. |
| `EADDRINUSE` (porta em uso) | Rode `$env:PORT=3001; npm start` e abra http://localhost:3001/app. |

**Testar pelo celular na mesma rede Wi-Fi:** rode `ipconfig` no PowerShell, anote o "Endereço IPv4" (ex.: `192.168.0.15`) e abra `http://192.168.0.15:3000/app` no celular. Se o Windows perguntar sobre o Firewall, permita em "Redes privadas". Sem HTTPS, o app não pode ser instalado na tela inicial. Para o teste completo, use a publicação abaixo.

Os dados (contas, posts e fotos) ficam na pasta `app\data`.

## Publicar com HTTPS (Render ou Railway)

O projeto já tem tudo pronto para publicar: `Dockerfile` (a receita que monta o app), `railway.json` e `render.yaml`. O app publicado fica num endereço `https://...`, com câmera e instalação na tela inicial funcionando no celular.

Os dados ficam numa pasta `/data`. **Ela precisa de um disco persistente**, senão contas, posts e fotos somem toda vez que o serviço reinicia.

| | Railway (recomendado) | Render |
|---|---|---|
| Disco persistente | Sim (volume) | Só em plano pago (Starter) |
| Grátis para testar | Crédito inicial de teste | Plano Free, mas os dados se perdem e o app "dorme" após 15 min sem uso |
| Custo depois | Plano Hobby, cobrado por uso | Starter + disco |

Os preços mudam: confira no site de cada um antes de assinar.

> O código está na branch `claude/jolly-allen-5qo49g`. Escolha essa branch na hospedagem, ou junte-a à `main` primeiro (por um pull request).

### Opção A: Railway

1. Entre em https://railway.com e faça login com o GitHub.
2. **New Project → Deploy from GitHub repo** → autorize o acesso e escolha `VGA-GESTAO`.
3. Clique no serviço criado → **Settings → Source → Branch** → escolha `claude/jolly-allen-5qo49g`.
4. **Volume:** no quadro do projeto, clique com o botão direito no serviço → **Attach volume** → em *Mount path* digite `/data`.
5. **Variables** → adicione:
   - `PORT` = `3000`
   - `ANTHROPIC_API_KEY` = sua chave (opcional; sem ela, as legendas ficam em modo demonstração)
6. **Settings → Networking → Generate Domain** (se pedir a porta, use `3000`). Vai aparecer um endereço como `https://vga-app-production.up.railway.app`.
7. Espere a publicação ficar verde (**Deployments → Active**) e abra `https://SEU-ENDERECO/app` no celular.

### Opção B: Render

**Com disco (dados guardados, plano pago):**

1. Entre em https://render.com e faça login com o GitHub.
2. **New → Blueprint** → escolha o repositório `VGA-GESTAO` e a branch `claude/jolly-allen-5qo49g`.
3. O Render lê o `render.yaml` e já cria o serviço com o disco em `/data`. Quando pedir `ANTHROPIC_API_KEY`, cole a chave (ou deixe vazio).
4. Confirme. No fim aparece o endereço `https://vga-app-xxxx.onrender.com`.

**Só para testar de graça (dados se perdem):**

1. **New → Web Service** → escolha o repositório e a branch `claude/jolly-allen-5qo49g`.
2. Em *Language*, deixe **Docker**. Em *Instance Type*, escolha **Free**.
3. Em *Health Check Path* (em *Advanced*), coloque `/api/saude`.
4. **Deploy Web Service**.

### Testar pelo celular

1. Abra `https://SEU-ENDERECO/app` e crie uma conta.
2. Preencha **Meu negócio**.
3. Toque em **+** → **Tirar foto**: a câmera do celular abre.
4. Siga os 4 passos e toque em **Postar agora** no post pronto.
5. Para instalar como app:
   - **Android (Chrome):** menu ⋮ → **Instalar app** (ou **Adicionar à tela inicial**).
   - **iPhone (Safari):** botão Compartilhar → **Adicionar à Tela de Início**.

Para conferir se está no ar, abra `https://SEU-ENDERECO/api/saude`. Deve aparecer `{"ok":true}`.

## Testes

```bash
npm test
```

Cobrem cadastro e login, perfil do negócio, criação e edição de posts, envio de fotos, isolamento entre clientes e geração de legendas.

## Estrutura

```
server.js              servidor (API + arquivos do site e do app)
src/db.js              banco de dados SQLite (usuários, negócios, posts, imagens)
src/auth.js            senhas, sessões e limite de tentativas
src/legendas.js        legendas com o Claude + modelos prontos
public/app/            o aplicativo (HTML, CSS, JS, ícones, modo offline)
public/app/editor.js   tratamento das fotos e criação da arte
test/                  testes automáticos
data/                  banco e fotos (criado ao rodar; fora do git)

Na raiz do repositório:
Dockerfile             receita para publicar (site + app)
railway.json           configuração do Railway
render.yaml            configuração do Render
```

## Detalhes técnicos

- **IA:** modelo `claude-opus-5-5`, com resposta em formato estruturado (JSON), esforço baixo para responder rápido e troca automática de modelo caso o principal recuse o pedido (`fallbacks: "default"`).
- **Fotos:** o tratamento roda no celular. Só a imagem final (1080 px de largura) vai para o servidor. Para a IA, vai uma versão reduzida.
- **Segurança:** senhas com scrypt, sessão em cookie `HttpOnly` + `SameSite=Strict`, limite de tentativas de login e de gerações de legenda, verificação do tipo real da imagem e política de segurança de conteúdo (CSP) no app.

## Próximas fases

- **Fase 2:** conectar Instagram e Facebook (API oficial da Meta) e publicar sozinho no horário marcado. Exige criar o app na Meta, verificar a empresa e passar pela análise de permissões.
- **Fase 3:** assistente por conversa (no app e no WhatsApp), calendário do mês e relatório de resultados.
- **Antes de abrir para clientes:** backup do banco e das fotos, termos de uso e política de privacidade (LGPD), recuperação de senha por e-mail e cobrança dos planos.
