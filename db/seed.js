#!/usr/bin/env node
"use strict";

const sqlite3 = require("sqlite3").verbose();
const bcrypt  = require("bcryptjs");
const path    = require("path");

const DB_FILE  = path.join(__dirname, "..", "data", "app.db");
const PASSWORD = process.env.SEED_USER_PASSWORD;
if (!PASSWORD || PASSWORD.length < 12) {
  throw new Error("SEED_USER_PASSWORD (minimum 12 characters) is required.");
}

const USERS = [
  { username: "director",   full_name: "Батсүх Гэрэлт-Од",       role: "director",      position: "Захирал",               register_no: "ПЮ80061073", address: "10-р баг 26-54 тоот",    phone: "99582070", department: "Захиргаа"   },
  { username: "engineer",   full_name: "Ганболд Билгүүн",          role: "chief_engineer",position: "Ерөнхий инженер",        register_no: "ЖЮ97050218", address: "6-р баг 25-55",          phone: "89961997", department: "Инженер"    },
  { username: "hr",         full_name: "Болд Ундраа",              role: "hr",            position: "Хүний нөөцийн ажилтан", register_no: "ЖЗ86061607", address: "6-р баг 70-23 тоот",    phone: "88304224", department: "Хүний нөөц" },
  { username: "safety",     full_name: "Батболд Энхболор",         role: "safety",        position: "ХАБЭА-н ажилтан",       register_no: "ЖЬ87121868", address: "8-р баг 58-49 тоот",    phone: "80824303", department: "ХАБЭА"      },
  { username: "accountant", full_name: "Цэрэнжав Тунгалаг",        role: "accountant",    position: "Нягтлан бодогч",         register_no: "ЖЯ81050100", address: "9-р баг 17-23",          phone: "99006010", department: "Санхүү"     },
  { username: "network",    full_name: "Балданпүрэв Мөнх-Эрдэнэ", role: "engineer",      position: "Сүлжээний инженер",      register_no: "ЖЯ94051213", address: "7-р баг 31-10 тоот",    phone: "99588085", department: "Камер"      },
  { username: "electric",   full_name: "Амаржаргал Цэлмэг",        role: "engineer",      position: "Цахилгааны инженер",     register_no: "ТБ99121004", address: "10-р баг, зангиат 1-25",phone: "80990144", department: "Цахилгаан"  },
  { username: "store",      full_name: "Дамдинжав Пүрэвсүрэн",    role: "storekeeper",   position: "Нярав",                  register_no: "ЖЛ82031809", address: "7-р баг Гарден 217-4",  phone: "91111762", department: "Аж ахуй"    },
];

const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) { console.error("Cannot open database:", err.message); process.exit(1); }
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

async function seed() {
  const hash = bcrypt.hashSync(PASSWORD, 10);
  let inserted = 0;
  let skipped  = 0;

  for (const u of USERS) {
    const existing = await get("SELECT id FROM users WHERE username=?", [u.username]);
    if (existing) {
      console.log(`  skip  ${u.username} (already exists)`);
      skipped++;
      continue;
    }

    await run(
      `INSERT INTO users
         (username, password_hash, full_name, role, position,
          register_no, address, phone, department, active)
       VALUES (?,?,?,?,?,?,?,?,?,1)`,
      [u.username, hash, u.full_name, u.role, u.position,
       u.register_no, u.address, u.phone, u.department]
    );

    console.log(`  insert ${u.username} — ${u.full_name} (${u.role})`);
    inserted++;
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} skipped.`);
}

seed()
  .catch((err) => { console.error("Seed failed:", err.message); process.exit(1); })
  .finally(() => db.close());
