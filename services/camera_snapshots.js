const { run, get } = require("../db");

function dayOnly(value) {
  return String(value || new Date().toISOString().slice(0, 10)).slice(0, 10);
}

function availability(total, broken) {
  total = Number(total || 0);
  broken = Number(broken || 0);
  return total > 0 ? Math.max(0, (total - broken) / total * 100) : 100;
}

async function ensureCameraSnapshotSchema() {
  await run(`CREATE TABLE IF NOT EXISTS camera_daily_status (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date    TEXT NOT NULL UNIQUE,
    total_points     INTEGER NOT NULL DEFAULT 0,
    total_cameras    INTEGER NOT NULL DEFAULT 0,
    broken_cameras   INTEGER NOT NULL DEFAULT 0,
    open_work_count  INTEGER NOT NULL DEFAULT 0,
    availability_pct REAL NOT NULL DEFAULT 100,
    calc_basis       TEXT DEFAULT '',
    source           TEXT DEFAULT 'auto',
    created_at       TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at       TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(`ALTER TABLE camera_daily_status ADD COLUMN broken_cameras INTEGER NOT NULL DEFAULT 0`).catch(() => {});
  await run(`ALTER TABLE camera_daily_status ADD COLUMN calc_basis TEXT DEFAULT ''`).catch(() => {});
}

async function saveCameraDailySnapshot(date = null, source = "auto") {
  await ensureCameraSnapshotSchema();
  const snapshotDate = dayOnly(date);
  const totals = await get(`SELECT COUNT(*) points,
                                   COALESCE(SUM(COALESCE(camera_count,1)),0) cameras,
                                   COALESCE(SUM(COALESCE(camera_broken_count,0)),0) broken_cameras
                            FROM assets WHERE category='Камер'`);
  const open = await get(`SELECT COUNT(*) count FROM asset_events
                          WHERE category='Камер засвар'
                            AND status NOT IN ('Дууссан','Хаагдсан')`);
  const totalCameras = Number(totals?.cameras || 0);
  const brokenCameras = Number(totals?.broken_cameras || 0);
  const openCount = Number(open?.count || 0);
  await run(
    `INSERT INTO camera_daily_status(snapshot_date,total_points,total_cameras,broken_cameras,open_work_count,availability_pct,calc_basis,source)
     VALUES(?,?,?,?,?,?,?,?)
     ON CONFLICT(snapshot_date) DO UPDATE SET
       total_points=excluded.total_points,
       total_cameras=excluded.total_cameras,
       broken_cameras=excluded.broken_cameras,
       open_work_count=excluded.open_work_count,
       availability_pct=excluded.availability_pct,
       calc_basis=excluded.calc_basis,
       source=excluded.source,
       updated_at=CURRENT_TIMESTAMP`,
    [snapshotDate, Number(totals?.points || 0), totalCameras, brokenCameras, openCount, availability(totalCameras, brokenCameras), "broken_cameras", source]
  );
}

module.exports = { saveCameraDailySnapshot, ensureCameraSnapshotSchema };
