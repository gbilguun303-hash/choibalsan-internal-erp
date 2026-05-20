# Deprecated Endpoints

Routes listed here are **superseded** — a direct replacement exists with identical or better
functionality. The handlers are kept alive to avoid breaking any external caller (e.g. a mobile
client, a curl script, or a test suite) but must not be used in new frontend code.

**Do not remove a handler until every removal condition for that entry is met.**

---

## POST /api/org-contracts/:id/scan

| Field | Value |
|---|---|
| **Backend file** | `routes/admin_hub.js` |
| **Replacement** | `POST /api/org-contracts/:id/scans` (same file) |
| **Reason deprecated** | Original endpoint stores a single scan URL in `org_contracts.scan_url`. Replacement uses the `contract_scans` table, which supports multiple scans per contract and tracks uploader + filename. |
| **Removal condition** | (1) No external client calls this path. (2) All existing `org_contracts.scan_url` values have been migrated into `contract_scans` rows, or confirmed empty. |
| **Removal risk** | `org_contracts.scan_url` may hold legacy scan URLs that were uploaded before the multi-scan system was introduced. Deleting the handler without migrating those URLs would not delete the files themselves (they remain in `uploads/`), but the references in the DB column would be orphaned permanently. Run `SELECT id, scan_url FROM org_contracts WHERE scan_url IS NOT NULL AND scan_url != ''` before removal. |

---

## GET /api/employee-files/:userId

| Field | Value |
|---|---|
| **Backend file** | `routes/hr.js` |
| **Replacement** | `GET /api/users/:id/files` (same file) |
| **Reason deprecated** | Replaced by the `/users/:id/files` URL convention used by the current frontend. The successor returns the same `employee_files` rows with added field aliases (`filename`, `original_name`, `uploaded_at`) for frontend convenience. |
| **Removal condition** | No client calls `/employee-files/:userId`. Confirm with access logs or a search across all frontend modules and any known external integrations. |
| **Removal risk** | Low. Both routes query the same `employee_files` table with the same filter. No data loss risk — only the URL changes. |

---

## POST /api/employee-files/:userId

| Field | Value |
|---|---|
| **Backend file** | `routes/hr.js` |
| **Replacement** | `POST /api/users/:id/files` (same file) |
| **Reason deprecated** | Same rationale as `GET /employee-files/:userId`. Both endpoints write an identical `INSERT INTO employee_files` row. |
| **Removal condition** | No client calls `/employee-files/:userId` with method POST. |
| **Removal risk** | Low. Same table, same INSERT. No data migration needed. |

---

## DELETE /api/employee-files/:id

| Field | Value |
|---|---|
| **Backend file** | `routes/hr.js` |
| **Replacement** | `DELETE /api/users/:id/files/:fileId` (same file) |
| **Reason deprecated** | Same rationale as above. Both handlers delete the same `employee_files` row and unlink the file from disk. |
| **Removal condition** | No client calls `/employee-files/:id` with method DELETE. |
| **Removal risk** | Low. Functionally identical to the replacement. |

---

## GET /api/vehicles/:id/daily-inspections

| Field | Value |
|---|---|
| **Backend file** | `routes/vehicle.js` |
| **Replacement** | `GET /api/vehicle-daily-inspections?vehicle_id=:id` (same file) |
| **Reason deprecated** | The flat `/vehicle-daily-inspections` route was introduced to support both "all vehicles" and "one vehicle" from a single endpoint. It returns the same rows plus `vehicle_type`, which the replacement omits. The URL-param style (`/vehicles/:id/...`) is inconsistent with the rest of the vehicle routes. |
| **Removal condition** | No client calls `/vehicles/:id/daily-inspections`. The habea.js frontend already uses the flat route exclusively. |
| **Removal risk** | Low. The replacement covers the same data. If any caller relied on the LIMIT 30 cap (vs LIMIT 60 in the replacement), results may differ in high-volume scenarios — verify before removing. |
