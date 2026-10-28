import crypto from "node:crypto";

const DIAS_SESSAO = 30;
const NOME_COOKIE = "vga_sessao";

export function gerarHash(senha) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha, sal, 64);
  return `scrypt$${sal.toString("hex")}$${hash.toString("hex")}`;
}

export function conferirSenha(senha, guardado) {
  const [tipo, salHex, hashHex] = String(guardado).split("$");
  if (tipo !== "scrypt" || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, "hex");
  const calculado = crypto.scryptSync(senha, Buffer.from(salHex, "hex"), esperado.length);
  return crypto.timingSafeEqual(esperado, calculado);
}

export function criarSessao(db, usuarioId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expira = new Date(Date.now() + DIAS_SESSAO * 864e5).toISOString();
  db.prepare("INSERT INTO sessoes (token, usuario_id, expira_em) VALUES (?, ?, ?)").run(token, usuarioId, expira);
  return token;
}

export function encerrarSessao(db, token) {
  if (token) db.prepare("DELETE FROM sessoes WHERE token = ?").run(token);
}

export function definirCookie(res, token, seguro) {
  res.cookie(NOME_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: seguro,
    maxAge: DIAS_SESSAO * 864e5,
    path: "/",
  });
}

export function limparCookie(res) {
  res.clearCookie(NOME_COOKIE, { path: "/" });
}

function lerCookie(req) {
  const bruto = req.headers.cookie || "";
  for (const parte of bruto.split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === NOME_COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

// Middleware: exige login e coloca o usuário em req.usuario.
export function exigirLogin(db) {
  const buscar = db.prepare(`
    SELECT u.id, u.nome, u.email, s.token FROM sessoes s
    JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token = ? AND s.expira_em > ?
  `);
  return (req, res, next) => {
    const token = lerCookie(req);
    const linha = token ? buscar.get(token, new Date().toISOString()) : null;
    if (!linha) return res.status(401).json({ erro: "Faça login para continuar." });
    req.usuario = { id: linha.id, nome: linha.nome, email: linha.email };
    req.tokenSessao = linha.token;
    next();
  };
}

export { lerCookie };

// Limitador simples em memória (por chave), para login e geração de legendas.
export function criarLimitador({ maximo, janelaMs }) {
  const contagens = new Map();
  return (chave) => {
    const agora = Date.now();
    const atual = contagens.get(chave);
    if (!atual || atual.inicio + janelaMs < agora) {
      contagens.set(chave, { inicio: agora, total: 1 });
      return true;
    }
    atual.total += 1;
    return atual.total <= maximo;
  };
}
