"use strict";
const { get, all } = require("../../db");
const { KB_SEED_ARTICLES } = require("../../scripts/seed_kb");
const { cyrillize } = require("./normalize");

const LOCAL_GUIDES = KB_SEED_ARTICLES.map(a => ({
  title: a.title,
  answer: a.body,
  module: a.module,
  keys: String(a.keywords || "").split(",").map(k => k.trim()).filter(Boolean),
}));

const KB_STOP_WORDS = new Set([
  "хэрхэн", "яаж", "яах", "вэ", "уу", "юм", "бол", "болох", "гаргах", "хийх",
  "харуулах", "өгөөч", "надад", "дэлгэрэнгүй",
]);

function matchLocalGuide(question) {
  const q = cyrillize(String(question || "").toLowerCase());
  let best = null;
  for (const guide of LOCAL_GUIDES) {
    const score = guide.keys.reduce((s, k) => s + (q.includes(k) ? 1 : 0), 0);
    if (score && (!best || score > best.score)) best = { ...guide, score };
  }
  return best;
}

async function matchGuide(question) {
  const q = cyrillize(String(question || "").toLowerCase()).trim();
  if (!q) return matchLocalGuide(question);

  const words = q.split(/\s+/)
    .map(w => w.replace(/[^\wЀ-ӿ]/g, "").trim())
    .filter(w => w.length > 1 && !KB_STOP_WORDS.has(w));

  if (words.length) {
    try {
      const ftsQuery = words.map(w => `"${w}"`).join(" OR ");
      const row = await get(
        `SELECT a.*, bm25(kb_fts) score
         FROM kb_fts
         JOIN kb_articles a ON a.id=kb_fts.rowid
         WHERE a.active=1
           AND kb_fts MATCH ?
         ORDER BY score, a.sort_order ASC
         LIMIT 1`,
        [ftsQuery]
      );
      if (row) return { title: row.title, answer: row.body, module: row.module };
    } catch (_) {
      const first = words[0];
      const row = await get(
        `SELECT * FROM kb_articles WHERE active=1
          AND (keywords LIKE ? OR title LIKE ? OR body LIKE ?) LIMIT 1`,
        [`%${first}%`, `%${first}%`, `%${first}%`]
      ).catch(() => null);
      if (row) return { title: row.title, answer: row.body, module: row.module };
    }
  }

  return matchLocalGuide(question);
}

module.exports = { LOCAL_GUIDES, KB_STOP_WORDS, matchGuide, matchLocalGuide };
