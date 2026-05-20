const sqlite3 = require("sqlite3").verbose();
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");

const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_THIS_SECRET_2026_CHOIBALSAN";
const DB_FILE = path.join(__dirname, "data", "app.db");
const UPLOAD_DIR = path.join(__dirname, "uploads");

const db = new sqlite3.Database(DB_FILE);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Нэвтрэх шаардлагатай" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token буруу байна" });
  }
}

async function audit(userId, action, entity, entityId, detail) {
  await run(
    "INSERT INTO audit_logs(user_id, action, entity, entity_id, detail) VALUES(?,?,?,?,?)",
    [userId, action, entity, entityId, detail || ""]
  );
}

const ALLOWED_MIME = new Set([
  "image/jpeg","image/png","image/gif","image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain","text/csv",
]);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname || ".jpg");
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error("Зөвшөөрөгдөхгүй файлын төрөл. Зөвшөөрөгдөх: зураг, PDF, Word, Excel"));
  }
});

module.exports = { db, run, all, get, auth, audit, upload, UPLOAD_DIR };
