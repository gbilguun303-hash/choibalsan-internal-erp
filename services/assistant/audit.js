"use strict";
const { run } = require("../../db");

async function logQuery(userId, question, intent, mode) {
  try {
    const result = await run(
      `INSERT INTO assistant_logs(user_id,question,intent,mode,created_at)
       VALUES(?,?,?,?,datetime('now','localtime'))`,
      [userId, question.slice(0, 500), intent, mode]
    );
    return result?.id || null;
  } catch (_) {
    return null;
  }
}

module.exports = { logQuery };
