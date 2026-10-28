import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abrirBanco } from "./src/db.js";
import {
  gerarHash, conferirSenha, criarSessao, encerrarSessao, definirCookie, limparCookie,
  exigirLogin, criarLimitador, lerCookie,
} from "./src/auth.js";
import { gerarLegendas, iaDisponivel, OBJETIVOS } from "./src/legendas.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));

const CAMPOS_NEGOCIO = [
  "nome", "segmento", "cidade", "publico", "tom", "diferenciais",
  "instagram", "whatsapp", "hashtags", "cor_primaria", "cor_secundaria",
];
const FORMATOS = ["feed", "quadrado", "story"];
const STATUS = ["rascunho", "pronto", "publicado"];
const MAX_IMAGENS = 10;
const MAX_BYTES_IMAGEM = 12 * 1024 * 1024;

function texto(v, max = 2000) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function corValida(v, padrao) {
  return /^#[0-9a-fA-F]{6}$/.test(v || "") ? v : padrao;
}

function dataValida(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Confere os primeiros bytes para aceitar só JPEG, PNG ou WebP de verdade.
function tipoImagem(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

export function criarApp({ pastaDados = path.join(aqui, "data"), gerador = gerarLegendas } = {}) {
  const db = abrirBanco(pastaDados);
  const pastaImagens = path.join(pastaDados, "imagens");
  fs.mkdirSync(pastaImagens, { recursive: true });

  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
    });
    if (req.path.startsWith("/app") || req.path.startsWith("/api")) {
      res.set(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
    }
    next();
  });

  const login = exigirLogin(db);
  const limiteLogin = criarLimitador({ maximo: 10, janelaMs: 15 * 60e3 });
  const limiteLegendas = criarLimitador({ maximo: 40, janelaMs: 60 * 60e3 });
  const json = express.json({ limit: "100kb" });

  // Usado pela hospedagem para saber se o app está no ar.
  app.get("/api/saude", (req, res) => {
    db.prepare("SELECT 1").get();
    res.json({ ok: true });
  });

  // ---------- Contas ----------
  app.post("/api/cadastro", json, (req, res) => {
    const nome = texto(req.body?.nome, 120);
    const email = texto(req.body?.email, 200).toLowerCase();
    const senha = typeof req.body?.senha === "string" ? req.body.senha : "";
    if (!nome) return res.status(400).json({ erro: "Informe seu nome." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ erro: "E-mail inválido." });
    if (senha.length < 8) return res.status(400).json({ erro: "A senha precisa ter pelo menos 8 caracteres." });
    if (db.prepare("SELECT 1 FROM usuarios WHERE email = ?").get(email)) {
      return res.status(409).json({ erro: "Já existe uma conta com esse e-mail." });
    }
    const { lastInsertRowid } = db
      .prepare("INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)")
      .run(nome, email, gerarHash(senha));
    const id = Number(lastInsertRowid);
    db.prepare("INSERT INTO negocios (usuario_id) VALUES (?)").run(id);
    definirCookie(res, criarSessao(db, id), req.secure);
    res.status(201).json({ ok: true });
  });

  app.post("/api/entrar", json, (req, res) => {
    const email = texto(req.body?.email, 200).toLowerCase();
    const senha = typeof req.body?.senha === "string" ? req.body.senha : "";
    if (!limiteLogin(`${req.ip}|${email}`)) {
      return res.status(429).json({ erro: "Muitas tentativas. Aguarde alguns minutos." });
    }
    const u = db.prepare("SELECT id, senha_hash FROM usuarios WHERE email = ?").get(email);
    if (!u || !conferirSenha(senha, u.senha_hash)) {
      return res.status(401).json({ erro: "E-mail ou senha incorretos." });
    }
    definirCookie(res, criarSessao(db, u.id), req.secure);
    res.json({ ok: true });
  });

  app.post("/api/sair", (req, res) => {
    encerrarSessao(db, lerCookie(req));
    limparCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/eu", login, (req, res) => {
    const negocio = db.prepare("SELECT * FROM negocios WHERE usuario_id = ?").get(req.usuario.id);
    res.json({ usuario: req.usuario, negocio, ia: iaDisponivel(), objetivos: OBJETIVOS });
  });

  app.put("/api/negocio", login, json, (req, res) => {
    const b = req.body || {};
    const v = {};
    for (const c of CAMPOS_NEGOCIO) v[c] = texto(b[c], c === "diferenciais" || c === "publico" ? 600 : 200);
    v.cor_primaria = corValida(v.cor_primaria, "#39ff14");
    v.cor_secundaria = corValida(v.cor_secundaria, "#ff7a1a");
    v.instagram = v.instagram.replace(/^@/, "");
    v.whatsapp = v.whatsapp.replace(/\D/g, "").slice(0, 15);
    db.prepare(`
      UPDATE negocios SET ${CAMPOS_NEGOCIO.map((c) => `${c} = ?`).join(", ")}, atualizado_em = datetime('now')
      WHERE usuario_id = ?
    `).run(...CAMPOS_NEGOCIO.map((c) => v[c]), req.usuario.id);
    res.json({ negocio: db.prepare("SELECT * FROM negocios WHERE usuario_id = ?").get(req.usuario.id) });
  });

  // ---------- Posts ----------
  const imagensDoPost = db.prepare("SELECT id, ordem FROM imagens WHERE post_id = ? ORDER BY ordem, rowid");
  const comImagens = (p) => ({ ...p, imagens: imagensDoPost.all(p.id).map((i) => `/api/imagens/${i.id}`) });
  const buscarPost = db.prepare("SELECT * FROM posts WHERE id = ? AND usuario_id = ?");

  function dadosPost(b, atual = {}) {
    const formato = FORMATOS.includes(b.formato) ? b.formato : atual.formato || "feed";
    const status = STATUS.includes(b.status) ? b.status : atual.status || "rascunho";
    return {
      formato,
      objetivo: b.objetivo !== undefined ? texto(b.objetivo, 40) : atual.objetivo || "",
      briefing: b.briefing !== undefined ? texto(b.briefing, 2000) : atual.briefing || "",
      legenda: b.legenda !== undefined ? texto(b.legenda, 2200) : atual.legenda || "",
      hashtags: b.hashtags !== undefined ? texto(b.hashtags, 1000) : atual.hashtags || "",
      status,
      agendado_para: b.agendado_para !== undefined ? dataValida(b.agendado_para) : atual.agendado_para ?? null,
      publicado_em: status === "publicado" ? atual.publicado_em || new Date().toISOString() : null,
    };
  }

  app.get("/api/posts", login, (req, res) => {
    const posts = db
      .prepare(`
        SELECT * FROM posts WHERE usuario_id = ?
        ORDER BY CASE status WHEN 'publicado' THEN 1 ELSE 0 END,
                 CASE WHEN status = 'publicado' THEN publicado_em END DESC,
                 agendado_para IS NULL, agendado_para, id DESC
      `)
      .all(req.usuario.id);
    res.json({ posts: posts.map(comImagens) });
  });

  app.post("/api/posts", login, json, (req, res) => {
    const d = dadosPost(req.body || {});
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO posts (usuario_id, formato, objetivo, briefing, legenda, hashtags, status, agendado_para, publicado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.usuario.id, d.formato, d.objetivo, d.briefing, d.legenda, d.hashtags, d.status, d.agendado_para, d.publicado_em);
    res.status(201).json({ post: comImagens(buscarPost.get(Number(lastInsertRowid), req.usuario.id)) });
  });

  app.get("/api/posts/:id", login, (req, res) => {
    const p = buscarPost.get(Number(req.params.id), req.usuario.id);
    if (!p) return res.status(404).json({ erro: "Post não encontrado." });
    res.json({ post: comImagens(p) });
  });

  app.put("/api/posts/:id", login, json, (req, res) => {
    const atual = buscarPost.get(Number(req.params.id), req.usuario.id);
    if (!atual) return res.status(404).json({ erro: "Post não encontrado." });
    const d = dadosPost(req.body || {}, atual);
    db.prepare(`
      UPDATE posts SET formato = ?, objetivo = ?, briefing = ?, legenda = ?, hashtags = ?, status = ?,
        agendado_para = ?, publicado_em = ?, atualizado_em = datetime('now')
      WHERE id = ? AND usuario_id = ?
    `).run(d.formato, d.objetivo, d.briefing, d.legenda, d.hashtags, d.status, d.agendado_para, d.publicado_em, atual.id, req.usuario.id);
    res.json({ post: comImagens(buscarPost.get(atual.id, req.usuario.id)) });
  });

  function apagarArquivos(linhas) {
    for (const l of linhas) fs.rm(path.join(pastaImagens, l.arquivo), { force: true }, () => {});
  }

  app.delete("/api/posts/:id", login, (req, res) => {
    const p = buscarPost.get(Number(req.params.id), req.usuario.id);
    if (!p) return res.status(404).json({ erro: "Post não encontrado." });
    const arquivos = db.prepare("SELECT arquivo FROM imagens WHERE post_id = ?").all(p.id);
    db.prepare("DELETE FROM posts WHERE id = ? AND usuario_id = ?").run(p.id, req.usuario.id);
    apagarArquivos(arquivos);
    res.json({ ok: true });
  });

  // ---------- Imagens ----------
  app.post(
    "/api/posts/:id/imagens",
    login,
    express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_BYTES_IMAGEM }),
    (req, res) => {
      const p = buscarPost.get(Number(req.params.id), req.usuario.id);
      if (!p) return res.status(404).json({ erro: "Post não encontrado." });
      const buf = Buffer.isBuffer(req.body) ? req.body : null;
      const ext = buf && tipoImagem(buf);
      if (!ext) return res.status(400).json({ erro: "Envie uma imagem JPG, PNG ou WebP." });
      const total = db.prepare("SELECT COUNT(*) AS n FROM imagens WHERE post_id = ?").get(p.id).n;
      if (total >= MAX_IMAGENS) return res.status(400).json({ erro: `Máximo de ${MAX_IMAGENS} imagens por post.` });
      const id = crypto.randomUUID();
      const arquivo = `${id}.${ext}`;
      fs.writeFileSync(path.join(pastaImagens, arquivo), buf);
      const ordem = Number.isInteger(Number(req.query.ordem)) ? Number(req.query.ordem) : total;
      db.prepare("INSERT INTO imagens (id, post_id, usuario_id, ordem, arquivo, tamanho) VALUES (?, ?, ?, ?, ?, ?)")
        .run(id, p.id, req.usuario.id, ordem, arquivo, buf.length);
      res.status(201).json({ url: `/api/imagens/${id}` });
    },
  );

  // Remove todas as imagens do post (usado ao salvar de novo após editar).
  app.delete("/api/posts/:id/imagens", login, (req, res) => {
    const p = buscarPost.get(Number(req.params.id), req.usuario.id);
    if (!p) return res.status(404).json({ erro: "Post não encontrado." });
    const linhas = db.prepare("SELECT arquivo FROM imagens WHERE post_id = ?").all(p.id);
    db.prepare("DELETE FROM imagens WHERE post_id = ?").run(p.id);
    apagarArquivos(linhas);
    res.json({ ok: true });
  });

  app.get("/api/imagens/:id", login, (req, res) => {
    const img = db.prepare("SELECT arquivo FROM imagens WHERE id = ? AND usuario_id = ?").get(String(req.params.id), req.usuario.id);
    if (!img) return res.status(404).end();
    res.set("Cache-Control", "private, max-age=31536000, immutable");
    res.sendFile(path.join(pastaImagens, img.arquivo));
  });

  // ---------- Legendas ----------
  app.post("/api/legendas", login, express.json({ limit: "8mb" }), async (req, res) => {
    if (!limiteLegendas(req.usuario.id)) {
      return res.status(429).json({ erro: "Limite de gerações por hora atingido. Tente mais tarde." });
    }
    const b = req.body || {};
    const imagens = Array.isArray(b.imagens)
      ? b.imagens.filter((s) => typeof s === "string" && /^[A-Za-z0-9+/=]+$/.test(s) && s.length < 2_000_000).slice(0, 4)
      : [];
    const negocio = db.prepare("SELECT * FROM negocios WHERE usuario_id = ?").get(req.usuario.id) || {};
    try {
      const r = await gerador({
        negocio,
        objetivo: texto(b.objetivo, 40),
        briefing: texto(b.briefing, 2000),
        formato: FORMATOS.includes(b.formato) ? b.formato : "feed",
        imagens,
      });
      res.json(r);
    } catch (e) {
      console.error("Erro ao gerar legendas:", e?.status || "", e?.message || e);
      res.status(502).json({ erro: "Não foi possível gerar as legendas agora. Tente de novo em instantes." });
    }
  });

  app.use("/api", (req, res) => res.status(404).json({ erro: "Rota não encontrada." }));

  // ---------- Arquivos do site ----------
  app.use("/app", express.static(path.join(aqui, "public", "app"), { index: "index.html" }));
  app.use("/", express.static(path.join(aqui, "..", "site")));

  app.use((err, req, res, _next) => {
    if (err?.type === "entity.too.large") return res.status(413).json({ erro: "Arquivo grande demais." });
    if (err?.type === "entity.parse.failed") return res.status(400).json({ erro: "Dados inválidos." });
    console.error(err);
    res.status(500).json({ erro: "Erro inesperado." });
  });

  return { app, db };
}

// No Windows a letra do disco pode vir em maiúscula ou minúscula; compara sem diferenciar.
function mesmoArquivo(a, b) {
  const norm = (x) => (process.platform === "win32" ? path.resolve(x).toLowerCase() : path.resolve(x));
  return norm(a) === norm(b);
}

if (process.argv[1] && mesmoArquivo(process.argv[1], fileURLToPath(import.meta.url))) {
  const porta = Number(process.env.PORT) || 3000;
  // Caminho relativo em PASTA_DADOS conta a partir da pasta app/.
  const pastaDados = path.resolve(aqui, process.env.PASTA_DADOS || "data");
  const { app, db } = criarApp({ pastaDados });
  const servidor = app.listen(porta, () => {
    console.log(`VGA rodando em http://localhost:${porta}  (app em /app)`);
    console.log(`Dados em ${pastaDados}`);
    if (!iaDisponivel()) console.log("Sem ANTHROPIC_API_KEY: legendas em modo demonstração (modelos prontos).");
  });
  // A hospedagem manda SIGTERM ao reiniciar: fecha o banco com calma para não perder dados.
  const encerrar = () => {
    servidor.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on("SIGTERM", encerrar);
  process.on("SIGINT", encerrar);
}
