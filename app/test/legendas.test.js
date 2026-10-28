import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

// Servidor falso no lugar da API do Claude: guarda o pedido e devolve uma resposta pronta.
let servidor;
let ultimoPedido;
const RESPOSTA = {
  fotos_descricao: "Pães de fermentação natural numa bancada de madeira.",
  opcoes: [
    { estilo: "Direta", legenda: "Pão de casca crocante saindo agora!" },
    { estilo: "Conversa", legenda: "b" },
    { estilo: "Curta", legenda: "c" },
  ],
  hashtags: ["padaria", "#Pao", "#pao"],
  titulo_arte: "Pão quentinho",
  melhor_horario: "Sábado às 8h",
  dica: "Responda os comentários",
};

before(async () => {
  servidor = http.createServer((req, res) => {
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      ultimoPedido = JSON.parse(corpo);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        id: "msg_teste", type: "message", role: "assistant", model: ultimoPedido.model, stop_reason: "end_turn",
        content: [{ type: "text", text: JSON.stringify(RESPOSTA) }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }));
    });
  });
  await new Promise((ok) => servidor.listen(0, ok));
  process.env.ANTHROPIC_API_KEY = "chave-de-teste";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => servidor.close());

test("envia todas as fotos do carrossel, numeradas, e devolve o que a IA viu", async () => {
  const { gerarLegendas, MAX_FOTOS_IA } = await import("../src/legendas.js");
  const fotos = Array.from({ length: 12 }, (_, i) => Buffer.from(`foto${i}`).toString("base64"));

  const r = await gerarLegendas({
    negocio: { nome: "Padaria Sol" }, objetivo: "produto", briefing: "", formato: "feed", imagens: fotos,
  });

  const conteudo = ultimoPedido.messages[0].content;
  const imagens = conteudo.filter((b) => b.type === "image");
  assert.equal(imagens.length, MAX_FOTOS_IA, "manda até o limite de fotos");
  assert.equal(imagens[0].source.data, fotos[0]);
  assert.ok(conteudo.some((b) => b.type === "text" && b.text === `Foto 1 de ${MAX_FOTOS_IA}:`), "numera as fotos");
  assert.equal(conteudo.at(-1).type, "text", "o pedido vem depois das fotos");
  assert.match(conteudo.at(-1).text, /Fotos enviadas: 10 \(carrossel/);
  assert.match(ultimoPedido.system, /detalhe concreto que aparece nas fotos/);
  assert.ok(ultimoPedido.output_config.format.schema.required.includes("fotos_descricao"));

  assert.equal(r.origem, "ia");
  assert.equal(r.fotos_descricao, RESPOSTA.fotos_descricao);
  assert.deepEqual(r.hashtags, ["#padaria", "#Pao"], "hashtags sem repetição");
});

test("com uma foto só, não numera nem fala em carrossel", async () => {
  const { gerarLegendas } = await import("../src/legendas.js");
  await gerarLegendas({ negocio: {}, objetivo: "", briefing: "pão", formato: "feed", imagens: ["QUJD"] });
  const conteudo = ultimoPedido.messages[0].content;
  assert.equal(conteudo.filter((b) => b.type === "image").length, 1);
  assert.ok(!conteudo.some((b) => b.type === "text" && b.text.startsWith("Foto 1 de")));
  assert.match(conteudo.at(-1).text, /Fotos enviadas: 1\n/);
});
