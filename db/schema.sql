-- db/schema.sql  –  canonical schema for Choibalsan Internal App
-- Legacy names: work_logs → asset_events, materials → warehouse_items

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL,
  position      TEXT,
  register_no   TEXT,
  address       TEXT,
  phone         TEXT,
  department    TEXT,
  avatar_url    TEXT,
  active        INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS asset_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  category      TEXT NOT NULL,
  department    TEXT,
  location      TEXT,
  description   TEXT,
  status        TEXT DEFAULT 'Явцтай',
  progress      INTEGER DEFAULT 0,
  assigned_to   INTEGER,
  created_by    INTEGER NOT NULL,
  work_date     TEXT NOT NULL,
  start_date    TEXT,
  end_date      TEXT,
  start_time    TEXT,
  end_time      TEXT,
  cost_amount   REAL DEFAULT 0,
  material_note TEXT,
  asset_id      INTEGER,
  asset_ids     TEXT DEFAULT '[]',
  asset_code    TEXT,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(created_by)  REFERENCES users(id),
  FOREIGN KEY(assigned_to) REFERENCES users(id),
  FOREIGN KEY(asset_id)    REFERENCES assets(id)
);

CREATE TABLE IF NOT EXISTS work_executions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  work_log_id INTEGER NOT NULL,
  title       TEXT NOT NULL,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  status      TEXT DEFAULT 'Явцтай',
  progress    INTEGER DEFAULT 0,
  note        TEXT,
  workers     TEXT,
  safety_note TEXT,
  created_by  INTEGER NOT NULL,
  created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(work_log_id) REFERENCES asset_events(id),
  FOREIGN KEY(created_by)  REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS execution_photos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER NOT NULL,
  file_path    TEXT NOT NULL,
  stamp_text   TEXT,
  uploaded_by  INTEGER NOT NULL,
  uploaded_at  TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(execution_id) REFERENCES work_executions(id)
);

CREATE TABLE IF NOT EXISTS work_photos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  work_log_id INTEGER NOT NULL,
  file_path   TEXT NOT NULL,
  stamp_text  TEXT,
  uploaded_by INTEGER NOT NULL,
  uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(work_log_id) REFERENCES asset_events(id)
);

CREATE TABLE IF NOT EXISTS warehouse_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  item_name     TEXT NOT NULL,
  unit          TEXT,
  balance       REAL DEFAULT 0,
  warning_level REAL DEFAULT 5,
  price         REAL DEFAULT 0,
  note          TEXT,
  created_by    INTEGER,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS material_moves (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  move_type      TEXT NOT NULL,
  item_name      TEXT NOT NULL,
  qty            REAL NOT NULL,
  unit           TEXT,
  unit_price     REAL DEFAULT 0,
  related_work_id INTEGER,
  receiver       TEXT,
  note           TEXT,
  created_by     INTEGER NOT NULL,
  move_date      TEXT NOT NULL,
  created_at     TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_date    TEXT NOT NULL,
  type            TEXT NOT NULL,
  amount          REAL NOT NULL,
  related_work_id INTEGER,
  note            TEXT,
  created_by      INTEGER NOT NULL,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hr_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  record_type TEXT NOT NULL,
  start_date  TEXT NOT NULL,
  end_date    TEXT,
  work_hours  REAL,
  leave_hours REAL,
  overtime_hours REAL,
  note        TEXT,
  created_by  INTEGER NOT NULL,
  created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_message_reactions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  emoji      TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, user_id),
  FOREIGN KEY(message_id) REFERENCES chat_messages(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Renamed from "documents" (was: incoming/outgoing correspondence)
CREATE TABLE IF NOT EXISTS correspondence (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_type    TEXT NOT NULL,
  doc_no      TEXT,
  doc_date    TEXT NOT NULL,
  source_org  TEXT,
  subject     TEXT NOT NULL,
  assigned_to INTEGER,
  due_date    TEXT,
  status      TEXT DEFAULT 'Шинэ',
  decision    TEXT,
  created_by  INTEGER NOT NULL,
  created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Organizational compliance documents (licenses, permits, certificates)
CREATE TABLE IF NOT EXISTS documents (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_type            TEXT NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  issued_by           TEXT,
  issued_date         TEXT,
  valid_from          TEXT,
  valid_until         TEXT,
  notify_days_before  INTEGER DEFAULT 30,
  file_path           TEXT,
  status              TEXT DEFAULT 'Хүчинтэй',
  created_by          INTEGER,
  created_at          TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS safety_reports (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date      TEXT NOT NULL,
  title            TEXT NOT NULL,
  risk_level       TEXT NOT NULL,
  location         TEXT,
  risk_description TEXT,
  action_taken     TEXT,
  status           TEXT DEFAULT 'Нээлттэй',
  created_by       INTEGER NOT NULL,
  created_at       TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_type  TEXT NOT NULL,
  year       INTEGER NOT NULL,
  month      INTEGER,
  title      TEXT NOT NULL,
  department TEXT,
  budget     REAL DEFAULT 0,
  status     TEXT DEFAULT 'Төлөвлөсөн',
  created_by INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plan_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id             INTEGER NOT NULL,
  title               TEXT NOT NULL,
  target_qty          REAL DEFAULT 1,
  unit                TEXT,
  estimated_cost      REAL DEFAULT 0,
  responsible_user    INTEGER,
  due_date            TEXT,
  status              TEXT DEFAULT 'Төлөвлөсөн',
  performance_percent INTEGER DEFAULT 0,
  note                TEXT,
  FOREIGN KEY(plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  INTEGER,
  detail     TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assets (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_code        TEXT UNIQUE,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL,
  sub_category      TEXT,
  location          TEXT,
  gps_lat           REAL,
  gps_lng           REAL,
  status            TEXT DEFAULT 'Идэвхтэй',
  condition         TEXT DEFAULT 'Хэвийн',
  assigned_to       INTEGER,
  installed_date    TEXT,
  warranty_until    TEXT,
  purchase_price    REAL DEFAULT 0,
  current_value     REAL DEFAULT 0,
  useful_life_years INTEGER DEFAULT 10,
  description       TEXT,
  specs             TEXT,
  notes             TEXT,
  created_by        INTEGER NOT NULL,
  created_at        TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at        TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(assigned_to) REFERENCES users(id),
  FOREIGN KEY(created_by)  REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS asset_files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id    INTEGER NOT NULL,
  file_type   TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  file_name   TEXT,
  description TEXT,
  uploaded_by INTEGER NOT NULL,
  uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(asset_id)    REFERENCES assets(id),
  FOREIGN KEY(uploaded_by) REFERENCES users(id)
);
