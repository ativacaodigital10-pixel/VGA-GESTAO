import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// Abre (ou cria) o banco SQLite e garante que as tabelas existam.
export function abrirBanco(pastaDados) {
  fs.mkdirSync(pastaDados, { recursive: true });
  const db = new DatabaseSync(path.join(pastaDados, "vga.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessoes (
      token TEXT PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      expira_em TEXT NOT NULL
    );

    -- Perfil do negócio: base para as legendas e para as artes.
    CREATE TABLE IF NOT EXISTS negocios (
      usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
      nome TEXT NOT NULL DEFAULT '',
      segmento TEXT NOT NULL DEFAULT '',
      cidade TEXT NOT NULL DEFAULT '',
      publico TEXT NOT NULL DEFAULT '',
      tom TEXT NOT NULL DEFAULT 'amigável',
      diferenciais TEXT NOT NULL DEFAULT '',
      instagram TEXT NOT NULL DEFAULT '',
      whatsapp TEXT NOT NULL DEFAULT '',
      hashtags TEXT NOT NULL DEFAULT '',
      cor_primaria TEXT NOT NULL DEFAULT '#39ff14',
      cor_secundaria TEXT NOT NULL DEFAULT '#ff7a1a',
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      formato TEXT NOT NULL DEFAULT 'feed',
      objetivo TEXT NOT NULL DEFAULT '',
      briefing TEXT NOT NULL DEFAULT '',
      legenda TEXT NOT NULL DEFAULT '',
      hashtags TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'rascunho',
      agendado_para TEXT,
      publicado_em TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_posts_usuario ON posts(usuario_id, agendado_para);

    CREATE TABLE IF NOT EXISTS imagens (
      id TEXT PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      ordem INTEGER NOT NULL DEFAULT 0,
      arquivo TEXT NOT NULL,
      tamanho INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_imagens_post ON imagens(post_id, ordem);
  `);
  return db;
}
