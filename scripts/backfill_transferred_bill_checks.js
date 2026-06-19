const { run, all } = require("../db");

(async () => {
  const rows = await all(`
    SELECT ebi.id import_id, ebp.id bill_point_id, ebp.meter_no
    FROM electricity_bill_points ebp
    JOIN electricity_bill_imports ebi ON ebi.id = ebp.import_id
    WHERE (ebp.owner_status = 'TRANSFERRED' OR ebp.mp_status = 'TRANSFERRED')
      AND NOT EXISTS (
        SELECT 1 FROM electricity_bill_checks c
        WHERE c.import_id = ebp.import_id
          AND c.bill_point_id = ebp.id
          AND c.check_code = 'TRANSFERRED_BUT_BILLED'
      )
  `);

  for (const r of rows) {
    await run(`
      INSERT INTO electricity_bill_checks
        (import_id,bill_point_id,check_code,check_name,severity,message,meter_no,is_resolved)
      VALUES(?,?,?,?,?,?,?,0)
    `, [
      r.import_id,
      r.bill_point_id,
      "TRANSFERRED_BUT_BILLED",
      "Шилжүүлсэн боловч тооцсон",
      "WARNING",
      `Тоолуур ${r.meter_no} шилжүүлсэн төлөвтэй боловч тооцоонд орсон`,
      r.meter_no,
    ]);
  }

  console.log(JSON.stringify({ inserted: rows.length, rows }, null, 2));
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
