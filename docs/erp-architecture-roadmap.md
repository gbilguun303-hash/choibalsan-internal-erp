# ЧХ ERP суурийн архитектурын зураглал ба үе шаттай сайжруулалт

Огноо: 2026-05-28

## Зорилго

Одоогийн ажиллаж байгаа ERP-г дахин бичихгүй. Харин одоо байгаа өгөгдөл, дэлгэц, workflow-г хадгалж, бүх модулийг нэг үндсэн нуруунд аажмаар уяна.

Үндсэн зарчим:

```text
Asset -> Work Order -> Execution -> Evidence -> Approval -> Report -> Audit
```

Энэ зарчим зөв тогтвол гэрэлтүүлэг, камер, гэрлэн дохио, тоолуур, LoRa, материал, ХАБЭА, тайлан бүгд нэг хэлээр ярьдаг болно.

## Одоогийн суурь

### Core

Одоо байгаа үндсэн хэсгүүд:

- `users`
- `permissions` JSON field on `users`
- `audit_logs`
- `password_reset_tokens`
- `middleware/roles.js`
- login/auth in `server.js`
- upload helper in `db.js`

Сайн тал:

- Role/permission matrix тусдаа `middleware/roles.js` файлд төвлөрсөн.
- Audit helper `db.js` дотор нэг функц болсон.
- Ихэнх route чухал үйлдэл дээр audit бичиж байна.

Анхаарах зүйл:

- Department тусдаа master table хэлбэрээр албан ёсоор байхгүй.
- Permission нэршил ерөнхийдөө сайн боловч зарим route дээр role шууд шалгасан хэвээр байна.
- Notification суурь хараахан нэг төвтэй биш.

### Asset Registry

Одоогийн гол хүснэгт:

- `assets`
- `asset_files`
- `asset_categories`
- `asset_flags`
- `asset_inventory_sessions`
- `asset_inventory_items`

Asset-той холбоотой domain хүснэгтүүд:

- `sl_points`
- `sl_ger_inventory`
- `meter_points`
- `lora_devices`
- `vehicles`
- `traffic_signal_status_logs`
- `electricity_bill_points`

Сайн тал:

- `assets` хүснэгт аль хэдийн хөрөнгийн нэгдсэн registry болох боломжтой.
- `asset_events.asset_id` холбоос байна.
- Камер, гэрлэн дохио зэрэг asset category ашиглаж эхэлсэн.
- Asset passport дээр work history татаж байна.

Анхаарах зүйл:

- Гэрэлтүүлгийн `sl_points`, `sl_ger_inventory` нь `assets`-тай бүрэн нэгтгэгдээгүй.
- Зарим domain тусдаа registry болж давхар амьдарч байна.
- `assets` дээр category/sub_category/specs/notes байгаа ч asset type metadata стандарт болоогүй.

### Work Order System

Одоогийн гол хүснэгт:

- `asset_events`

Дагалдах хүснэгтүүд:

- `work_executions`
- `work_photos`
- `execution_photos`
- `safety_reports`
- `engineer_monthly_reports`

Одоогийн workflow:

```text
Ажил үүснэ
-> ХАБЭА pre зөвшөөрөл
-> гүйцэтгэл/зураг
-> Дууссан гэж илгээсэн
-> ХАБЭА post шалгалт
-> Ерөнхий инженер эцэслэн батална
-> Хаагдсан
```

Сайн тал:

- `asset_events` нь Work Order-ийн үүргийг аль хэдийн гүйцэтгэж байна.
- `asset_id`, `sl_point_id`, `ger_inventory_id` холбоосууд байна.
- Гүйцэтгэл, зураг, ХАБЭА, баталгаа бүгд ажилтай холбогдож байна.
- Ерөнхий инженерийн самбар Work Order дээр төвлөрч эхэлсэн.

Анхаарах зүйл:

- Нэршил `asset_events` хэвээр байгаа. Дотоод ойлголтод `Work Order` гэж авч үзэх хэрэгтэй.
- Work category, asset category, department заримдаа давхцаж хэрэглэгдэж байна.
- Материал зарцуулалт Work Order-той бүрэн холбоогүй байна.

### Planning & Reporting

Одоо байгаа хэсгүүд:

- `plans`
- `plan_items`
- `report_schedules`
- `/api/reports/summary`
- HSE snapshots: `hse_report_snapshots`
- Lighting snapshots: `sl_daily_status`
- Camera daily status: `camera_daily_status`
- Engineer monthly notes: `engineer_monthly_reports`

Сайн тал:

- Сарын snapshot ойлголт ХАБЭА дээр орж эхэлсэн.
- Гэрэлтүүлэг дээр өдөр тутмын snapshot байна.
- Ерөнхий инженер өөрийн тайлбар, дүгнэлтээ хадгалах боломжтой болсон.

Анхаарах зүйл:

- Байгууллагын нэгдсэн сарын тайлан нэг canonical report model-той болоогүй.
- Тайлангууд олон module-д тархсан.
- Snapshot, live query, manual note гурвыг нэг report pipeline болгох хэрэгтэй.

### AI / Automation

Одоо байгаа хэсгүүд:

- `assistant_logs`
- `assistant_feedback`
- `assistant_dev_requests`
- `kb_articles`
- `services/assistant/*`
- `services/cron.js`
- `services/hse_snapshots.js`
- `services/lighting_snapshots.js`

Сайн тал:

- AI assistant өөрийн audit/log-той.
- Cron суурь байна.
- HSE monthly auto snapshot эхэлсэн.

Анхаарах зүйл:

- AI зөвхөн өгөгдөл уншиж тайлбарлах түвшинд байх ёстой; шууд workflow өөрчлөхийг дараагийн шатанд маш болгоомжтой нээнэ.
- n8n/Telegram automation хийхээс өмнө event/notification model тодорхой болгох хэрэгтэй.

## Архитектурын шийдвэр

### 1. `assets` бол бүх хөрөнгийн үндсэн registry

Гэрэлтүүлэг, камер, гэрлэн дохио, тоолуур, шкаф, кабель, PLC, LoRa, router, switch, UPS бүгд эцэстээ `assets` дээр паспорттай байна.

Domain хүснэгтүүдийг шууд устгахгүй. Харин тэдгээрийг `assets`-тай холбоно.

Жишээ:

```text
sl_points -> assets.id
sl_ger_inventory -> assets.id
meter_points -> assets.id or panel_asset_id
lora_devices -> assets.id
vehicles -> assets.id (дараагийн шат)
```

### 2. `asset_events` бол Work Order

Code дээр нэрийг шууд солихгүй. Харин баримт, API, UI дээр “Work Order / Ажлын захиалга” гэж ойлгоно.

Цаашдын бүх шинэ ажил дараах холбоостой байх ёстой:

- `asset_id` эсвэл domain reference (`sl_point_id`, `ger_inventory_id`)
- `category`
- `department`
- `assigned_to`
- `start_date`, `end_date`
- `status`
- `priority` буюу яаралтай эсэх
- material usage холбоос
- evidence photos
- approval/audit trail

### 3. Гэрэлтүүлэг, камерын дэлгэцүүд хэвээр үлдэнэ

Тэдгээр нь тусдаа систем биш, тухайн engineer-ийн ажлын талбар байна.

```text
Гэрэлтүүлгийн төв -> assets/work orders дээр ажиллана
Камерын төв -> assets/work orders дээр ажиллана
Ерөнхий инженер -> бүх work order-ийг нэгтгэж харна
ХАБЭА -> эрсдэл, зөвшөөрөл, шалгалт хийнэ
```

### 4. Тайлан live data + snapshot + manual note гэсэн 3 эхтэй байна

Сарын тайлан үүсэхдээ:

- live work order stats
- saved snapshot
- engineer/safety/accountant manual notes

гэсэн 3 эхээс бүрдэнэ.

### 5. Audit log бүх чухал үйлдлийн доод стандарт

Заавал audit бичих үйлдлүүд:

- create/update/delete asset
- create/update/delete work order
- execution add/update/delete
- photo upload/delete
- HSE pre/post
- engineer confirm/reject
- material issue/return
- report snapshot save
- import/commit
- permission/user change

## Эвдэхгүй migration plan

### Phase 1: Одоогийн нурууг албан ёсоор тогтоох

Зорилго:

- `assets` = Asset Registry
- `asset_events` = Work Orders
- `work_executions` = Execution logs
- `work_photos` / `execution_photos` = Evidence
- `audit_logs` = Audit trail

Хийх ажил:

- Developer docs-д naming convention нэмэх.
- Work Order status list-ийг нэг constant/service болгох. Эхэлсэн:
  - backend: `services/work_order_constants.js`
  - frontend: `public/modules/work_order_constants.js`
- Work Order category ба Asset category-г ялгаж баримтжуулах.
- Existing route/API-г эвдэхгүй.

Эрсдэл: бага.

### Phase 2: Asset холбоосыг чангаруулах

Зорилго:

- Шинээр үүсэх Work Order бүр боломжтой бол asset/domain reference-тэй байх.
- Гэрэлтүүлэг, камер, гэрлэн дохионы ажлууд asset passport дээр бүрэн харагдах.

Хийх ажил:

- `sl_points` болон `sl_ger_inventory` дээр `asset_id` холбоос нэмэх migration төлөвлөх.
- Одоогийн `sl_point_id`, `ger_inventory_id` холбоосыг хадгалж, asset bridge гаргах.
- Камер asset-аас ажил үүсгэхэд `asset_id` заавал дамжуулах. Эхэлсэн:
  - `Камер засвар` work order үүсгэх/засахад `asset_id` заавал.
  - Backend дээр сонгосон asset-ийн category `Камер` эсэхийг шалгана.
  - `Гэрэлтүүлэг засвар` дээр `sl_point_id` эсвэл `ger_inventory_id` reference шаарддаг хамгаалалт нэмэгдсэн.

Эрсдэл: дунд. Өмнөх өгөгдлийг backfill хийхдээ болгоомжтой.

### Phase 3: Material usage-г Work Order-той уях

Зорилго:

- Засвар дээр ямар материал зарцуулсныг сарын тайлан, няравын тайлан, ажлын акт дээр нэгэн зэрэг харах.

Хийх ажил:

- `wh_transactions` эсвэл `material_moves` дээр `work_log_id` нэмэх. Эхэлсэн:
  - `wh_transactions.work_log_id` нэмэгдсэн.
  - Няравын зарлага үүсгэхдээ ажил/гүйцэтгэл сонговол `work_log_id` хадгална.
  - Work Order дэлгэрэнгүй modal дээр зарцуулсан материалын жагсаалт харагдана.
- Ажлын дэлгэрэнгүй дээр материал зарцуулалт харуулах. Эхэлсэн.
- Няравын зарлага үүсгэхдээ work order сонгох боломжтой болгох. Эхэлсэн.

Эрсдэл: дунд. Санхүү/няравын бүртгэлд нөлөөлөх тул эхлээд optional холбоос байна.

### Phase 4: Unified reporting

Зорилго:

- Захирал, Ерөнхий инженер, ХАБЭА, Нягтлан тус бүрийн сарын тайлан нэг дата эхээс гарна.

Хийх ажил:

- Report builder service үүсгэх.
- HSE, Engineer, Lighting, Camera, Finance summary-г нэг report contract-д оруулах.
- Saved monthly report snapshot-уудыг immutable болгох буюу overwrite хийх хамгаалалтыг сайжруулах.

Эрсдэл: дунд.

### Phase 5: Mobile field workflow

Зорилго:

- Цахилгаанчин/камерын инженер талбай дээр утсаар ажлаа хаадаг болно.

Хийх ажил:

- Work Order mobile view.
- Зураг upload, GPS, тайлбар, material request.
- Offline/poor connection fallback дараагийн шатанд.

Эрсдэл: дунд.

### Phase 6: AI + Automation

Зорилго:

- AI нь байгууллагын ажлын явцыг тайлбарлаж, сануулж, ноорог тайлан гаргана.
- n8n/Telegram нь баталгаатай event дээр мэдэгдэл явуулна.

Хийх ажил:

- Notification/event table нэмэх.
- Daily summary cron.
- Overdue work alert.
- HSE monthly auto snapshot status alert.
- AI assistant-д report summary fetcher нэмэх.

Эрсдэл: бага-дунд. Workflow өөрчлөх эрхийг шууд AI-д өгөхгүй.

## Ойрын дараагийн алхам

1. Work Order status/category constants гаргах.
2. `asset_events` route дээр priority/location/asset reference validation зөөлөн нэмэх.
3. Камер засвар болон гэрэлтүүлэг засвар үүсгэх UI дээр asset/reference заавал сонгох чиглэл рүү аажмаар шилжүүлэх.
4. Няравын material transaction дээр optional `work_log_id` холбоос нэмэх төлөвлөгөө гаргах.
5. Director/Chief Engineer dashboard-уудыг unified work order stats дээр суурилуулах.

## Хийхгүй зүйл

- Одоогийн route-уудыг шууд rename хийхгүй.
- `asset_events` хүснэгтийг шууд `work_orders` болгож rename хийхгүй.
- Гэрэлтүүлэг/камерын тусгай дэлгэцүүдийг устгахгүй.
- Өмнөх өгөгдөл дээр destructive migration хийхгүй.
