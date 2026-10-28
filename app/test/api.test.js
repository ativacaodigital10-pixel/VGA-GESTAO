import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { criarApp } from "../server.js";
import { legendasModelo } from "../src/legendas.js";

let servidor, base, pasta;
const chamadasGerador = [];

before(async () => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), "vga-teste-"));
  const { app } = criarApp({
    pastaDados: pasta,
    gerador: async (dados) => {
      chamadasGerador.push(dados);
      return { ...legendasModelo(dados), origem: "teste" };
    },
  });
  await new Promise((ok) => { servidor = app.listen(0, ok); });
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => {
  servidor.close();
  fs.rmSync(pasta, { recursive: true, force: true });
});

// Cliente simples que guarda o cookie de sessão.
function cliente() {
  let cookie = "";
  return async (metodo, url, corpo, tipo) => {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    let body;
    if (Buffer.isBuffer(corpo)) { body = corpo; headers["content-type"] = tipo; }
    else if (corpo !== undefined) { body = JSON.stringify(corpo); headers["content-type"] = "application/json"; }
    const r = await fetch(base + url, { method: metodo, headers, body });
    const sc = r.headers.get("set-cookie");
    if (sc) cookie = sc.split(";")[0];
    const ct = r.headers.get("content-type") || "";
    return { status: r.status, dados: ct.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()), headers: r.headers };
  };
}

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);

test("cadastro, login e perfil do negócio", async () => {
  const c = cliente();
  assert.equal((await c("GET", "/api/eu")).status, 401);
  assert.equal((await c("POST", "/api/cadastro", { nome: "Ana", email: "x", senha: "12345678" })).status, 400);
  assert.equal((await c("POST", "/api/cadastro", { nome: "Ana", email: "ana@ex.com", senha: "123" })).status, 400);

  const cad = await c("POST", "/api/cadastro", { nome: "Ana", email: "Ana@Ex.com", senha: "senha-forte" });
  assert.equal(cad.status, 201);
  assert.match(cad.headers.get("set-cookie"), /HttpOnly/i);
  assert.equal((await c("POST", "/api/cadastro", { nome: "Ana", email: "ana@ex.com", senha: "senha-forte" })).status, 409);

  const eu = await c("GET", "/api/eu");
  assert.equal(eu.status, 200);
  assert.equal(eu.dados.usuario.email, "ana@ex.com");

  const salvo = await c("PUT", "/api/negocio", {
    nome: "Padaria Sol", segmento: "padaria", cidade: "Centro", instagram: "@padariasol",
    whatsapp: "(11) 99999-0000", cor_primaria: "javascript:alert(1)", tom: "amigável",
  });
  assert.equal(salvo.dados.negocio.instagram, "padariasol");
  assert.equal(salvo.dados.negocio.whatsapp, "11999990000");
  assert.equal(salvo.dados.negocio.cor_primaria, "#39ff14", "cor inválida volta ao padrão");

  assert.equal((await c("POST", "/api/sair")).status, 200);
  assert.equal((await c("GET", "/api/eu")).status, 401);

  const outro = cliente();
  assert.equal((await outro("POST", "/api/entrar", { email: "ana@ex.com", senha: "errada" })).status, 401);
  assert.equal((await outro("POST", "/api/entrar", { email: "ana@ex.com", senha: "senha-forte" })).status, 200);
  assert.equal((await outro("GET", "/api/eu")).dados.negocio.nome, "Padaria Sol");
});

test("criar post com fotos, editar, publicar e excluir", async () => {
  const c = cliente();
  await c("POST", "/api/cadastro", { nome: "Bia", email: "bia@ex.com", senha: "senha-forte" });

  const quando = new Date(Date.now() + 864e5).toISOString();
  const criado = await c("POST", "/api/posts", { formato: "story", legenda: "Olá!", hashtags: "#a", status: "pronto", agendado_para: quando });
  assert.equal(criado.status, 201);
  const id = criado.dados.post.id;
  assert.equal(criado.dados.post.formato, "story");
  assert.equal(criado.dados.post.agendado_para, quando);

  assert.equal((await c("POST", `/api/posts/${id}/imagens`, Buffer.from("<svg onload=alert(1)>"), "image/png")).status, 400, "rejeita arquivo que não é imagem");
  const img = await c("POST", `/api/posts/${id}/imagens?ordem=0`, JPEG, "image/jpeg");
  assert.equal(img.status, 201);

  const lido = await c("GET", `/api/posts/${id}`);
  assert.equal(lido.dados.post.imagens.length, 1);
  const arquivo = await c("GET", lido.dados.post.imagens[0]);
  assert.equal(arquivo.status, 200);
  assert.deepEqual(arquivo.dados, JPEG);

  const pub = await c("PUT", `/api/posts/${id}`, { status: "publicado" });
  assert.equal(pub.dados.post.status, "publicado");
  assert.ok(pub.dados.post.publicado_em);
  assert.equal(pub.dados.post.legenda, "Olá!", "campos não enviados continuam iguais");

  const volta = await c("PUT", `/api/posts/${id}`, { status: "pronto" });
  assert.equal(volta.dados.post.publicado_em, null);

  assert.equal((await c("DELETE", `/api/posts/${id}`)).status, 200);
  assert.equal((await c("GET", `/api/posts/${id}`)).status, 404);
  assert.equal((await c("GET", lido.dados.post.imagens[0])).status, 404);
  assert.equal(fs.readdirSync(path.join(pasta, "imagens")).filter((f) => f.startsWith(lido.dados.post.imagens[0].split("/").pop())).length, 0);
});

test("um cliente não enxerga nem mexe nos posts de outro", async () => {
  const dono = cliente();
  const intruso = cliente();
  await dono("POST", "/api/cadastro", { nome: "Dono", email: "dono@ex.com", senha: "senha-forte" });
  await intruso("POST", "/api/cadastro", { nome: "Intruso", email: "intruso@ex.com", senha: "senha-forte" });

  const { dados } = await dono("POST", "/api/posts", { legenda: "segredo" });
  const id = dados.post.id;
  const { dados: im } = await dono("POST", `/api/posts/${id}/imagens`, JPEG, "image/jpeg");

  assert.equal((await intruso("GET", "/api/posts")).dados.posts.length, 0);
  assert.equal((await intruso("GET", `/api/posts/${id}`)).status, 404);
  assert.equal((await intruso("PUT", `/api/posts/${id}`, { legenda: "hack" })).status, 404);
  assert.equal((await intruso("DELETE", `/api/posts/${id}`)).status, 404);
  assert.equal((await intruso("POST", `/api/posts/${id}/imagens`, JPEG, "image/jpeg")).status, 404);
  assert.equal((await intruso("GET", im.url)).status, 404);
  assert.equal((await dono("GET", `/api/posts/${id}`)).dados.post.legenda, "segredo");
});

test("legendas usam o perfil do negócio e o pedido do empresário", async () => {
  const c = cliente();
  await c("POST", "/api/cadastro", { nome: "Caio", email: "caio@ex.com", senha: "senha-forte" });
  await c("PUT", "/api/negocio", { nome: "Açaí do Caio", cidade: "Santos", segmento: "açaiteria", whatsapp: "13999990000" });

  const r = await c("POST", "/api/legendas", { objetivo: "promocao", briefing: "Açaí 500ml por 15 reais no sábado", imagens: ["abc=", "não-é-base64"] });
  assert.equal(r.status, 200);
  assert.equal(r.dados.opcoes.length, 3);
  assert.ok(r.dados.opcoes[0].legenda.includes("Açaí 500ml por 15 reais"));
  assert.ok(r.dados.hashtags.includes("#santos"));
  const chamada = chamadasGerador.at(-1);
  assert.equal(chamada.negocio.nome, "Açaí do Caio");
  assert.deepEqual(chamada.imagens, ["abc="], "descarta imagem inválida");
});

test("site e app são servidos", async () => {
  const site = await fetch(base + "/");
  assert.equal(site.status, 200);
  assert.match(await site.text(), /VGA Gestão de Negócios/);
  const app = await fetch(base + "/app/");
  assert.equal(app.status, 200);
  assert.ok(app.headers.get("content-security-policy"));
});
