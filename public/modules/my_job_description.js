import { state, api, escapeHtml } from "./common.js";

function jobDescriptionDate(value) {
  if (!value) return "Огноо оруулаагүй";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("mn-MN", { year: "numeric", month: "long", day: "numeric" });
}

function jobDescriptionFileIcon(fileName = "") {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "PDF";
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return "IMG";
  if (["doc", "docx"].includes(ext)) return "DOC";
  return "FILE";
}

function closeJobDescriptionPreview() {
  document.getElementById("myJobPreview")?.remove();
  document.body.style.overflow = "";
}

function openJobDescriptionFile(url, fileName = "") {
  if (!url) return;
  closeJobDescriptionPreview();

  const safeUrl = escapeHtml(url);
  const safeName = escapeHtml(fileName || "Ажлын байрны тодорхойлолт");
  const isImage = /\.(jpg|jpeg|png|gif|webp)(?:$|\?)/i.test(url);
  const isPdf = /\.pdf(?:$|\?)/i.test(url);
  const previewUrl = isPdf && !url.includes("#")
    ? `${safeUrl}#toolbar=1&navpanes=0&scrollbar=1`
    : safeUrl;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="myJobPreview" class="my-job-preview" onclick="if(event.target===this)closeJobDescriptionPreview()">
      <div class="my-job-preview-head">
        <div>
          <strong>${safeName}</strong>
          <small>Ажлын байрны тодорхойлолт</small>
        </div>
        <div class="my-job-preview-actions">
          <a href="${safeUrl}" target="_blank" rel="noopener">Шинэ цонх</a>
          <a href="${safeUrl}" download>Татах</a>
          <button type="button" onclick="closeJobDescriptionPreview()">Хаах</button>
        </div>
      </div>
      <div class="my-job-preview-body">
        ${isImage
          ? `<img src="${safeUrl}" alt="${safeName}">`
          : isPdf
            ? `<iframe src="${previewUrl}" title="${safeName}"></iframe>`
            : `<div class="my-job-preview-unsupported">
                <p>Энэ төрлийн файлыг утасны дэлгэц дээр шууд харуулах боломжгүй байна.</p>
                <a href="${safeUrl}" target="_blank" rel="noopener">Файлыг нээх</a>
                <a href="${safeUrl}" download>Файлыг татах</a>
              </div>`}
      </div>
    </div>`);
  document.body.style.overflow = "hidden";
}

async function my_job_description() {
  const main = document.getElementById("main");
  if (!main) return;

  main.innerHTML = `
    <div class="my-job-page">
      <div class="my-job-loading">Уншиж байна...</div>
    </div>`;

  try {
    const documents = await api("/api/my-job-description");
    if (!documents.length) {
      main.innerHTML = `
        <div class="my-job-page">
          <div class="my-job-header">
            <div class="my-job-header-icon">АБТ</div>
            <div>
              <h1>Миний ажлын байрны тодорхойлолт</h1>
              <p>${escapeHtml(state.me.position || "Албан тушаал")}</p>
            </div>
          </div>
          <div class="my-job-empty">
            <div class="my-job-empty-icon">i</div>
            <h2>Тодорхойлолт бүртгэгдээгүй байна</h2>
            <p>Хүний нөөцийн ажилтанд хандаж өөрийн албан тушаалын тодорхойлолтыг холбоно уу.</p>
          </div>
        </div>`;
      return;
    }

    main.innerHTML = `
      <div class="my-job-page">
        <div class="my-job-header">
          <div class="my-job-header-icon">АБТ</div>
          <div>
            <h1>Миний ажлын байрны тодорхойлолт</h1>
            <p>${escapeHtml(state.me.full_name || "")} · ${escapeHtml(state.me.position || "Албан тушаал")}</p>
          </div>
        </div>
        <div class="my-job-list">
          ${documents.map((document, index) => `
            <section class="my-job-card">
              <div class="my-job-card-top">
                <div>
                  <span class="my-job-status">Хүчинтэй</span>
                  ${documents.length > 1 && index === 0 ? '<span class="my-job-latest">Сүүлийн хувилбар</span>' : ""}
                </div>
                <span class="my-job-date">${jobDescriptionDate(document.doc_date)}</span>
              </div>
              <h2>${escapeHtml(document.title || "Албан тушаалын тодорхойлолт")}</h2>
              ${document.doc_no ? `<div class="my-job-number">Дугаар: ${escapeHtml(document.doc_no)}</div>` : ""}
              ${document.description ? `<div class="my-job-description">${escapeHtml(document.description).replace(/\n/g, "<br>")}</div>` : ""}
              <div class="my-job-files">
                <div class="my-job-files-title">Хавсралт файл</div>
                ${document.attachments?.length ? document.attachments.map(file => `
                  <button type="button" class="my-job-file"
                    onclick="openJobDescriptionFile(decodeURIComponent('${encodeURIComponent(file.file_url || "")}'),decodeURIComponent('${encodeURIComponent(file.file_name || "Ажлын байрны тодорхойлолт")}'))">
                    <span class="my-job-file-type">${jobDescriptionFileIcon(file.file_name)}</span>
                    <span class="my-job-file-info">
                      <strong>${escapeHtml(file.file_name || "Тодорхойлолт харах")}</strong>
                      <small>${escapeHtml(file.note || "Файлыг утсан дээр харах")}</small>
                    </span>
                    <span class="my-job-file-open">Харах</span>
                  </button>`).join("") : '<div class="my-job-no-file">Хавсралт файл оруулаагүй байна.</div>'}
              </div>
            </section>`).join("")}
        </div>
      </div>`;
  } catch (error) {
    main.innerHTML = `
      <div class="my-job-page">
        <div class="my-job-empty">
          <div class="my-job-empty-icon">!</div>
          <h2>Мэдээлэл ачаалж чадсангүй</h2>
          <p>${escapeHtml(error.message || "Дахин оролдоно уу.")}</p>
          <button class="btn" onclick="my_job_description()">Дахин ачаалах</button>
        </div>
      </div>`;
  }
}

Object.assign(window, {
  my_job_description,
  openJobDescriptionFile,
  closeJobDescriptionPreview,
});
