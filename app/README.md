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
| 3. Legenda | O empresário escolhe o objetivo e escreve do jeito dele o que quer dizer. A IA (Claude) olha as fotos e cria 3 opções de legenda, hashtags, sugestão de horário e uma dica. |
| 4. Agendar | Escolhe dia e hora, vê a prévia como no Instagram e salva como rascunho ou pronto. |
| Postar | "Postar agora" copia a legenda e abre o compartilhamento do celular com as fotos. Depois, "Já publiquei" marca o post como publicado. |
| Início | Próximos posts (com aviso de atrasado), publicados e resumo do mês. |

## Rodar no computador

Requer Node.js 22.13 ou mais novo.

```bash
cd app
npm install
cp .env.example .env   # coloque a ANTHROPIC_API_KEY para ligar a IA
npm start
```

- Site de vendas: http://localhost:3000
- App: http://localhost:3000/app

Sem `ANTHROPIC_API_KEY`, o app funciona em **modo demonstração**: as legendas vêm de modelos prontos, montados com os dados do negócio.

Para testar no celular na mesma rede Wi-Fi, abra `http://IP-DO-COMPUTADOR:3000/app`. A câmera e o "instalar na tela inicial" exigem HTTPS fora do `localhost`, então para uso real o app precisa estar publicado num endereço com HTTPS.

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
```

## Detalhes técnicos

- **IA:** modelo `claude-opus-5-5`, com resposta em formato estruturado (JSON), esforço baixo para responder rápido e troca automática de modelo caso o principal recuse o pedido (`fallbacks: "default"`).
- **Fotos:** o tratamento roda no celular. Só a imagem final (1080 px de largura) vai para o servidor. Para a IA, vai uma versão reduzida.
- **Segurança:** senhas com scrypt, sessão em cookie `HttpOnly` + `SameSite=Strict`, limite de tentativas de login e de gerações de legenda, verificação do tipo real da imagem e política de segurança de conteúdo (CSP) no app.

## Próximas fases

- **Fase 2:** conectar Instagram e Facebook (API oficial da Meta) e publicar sozinho no horário marcado. Exige criar o app na Meta, verificar a empresa e passar pela análise de permissões.
- **Fase 3:** assistente por conversa (no app e no WhatsApp), calendário do mês e relatório de resultados.
- **Antes de abrir para clientes:** hospedagem com HTTPS e backup do banco, termos de uso e política de privacidade (LGPD), recuperação de senha por e-mail e cobrança dos planos.
