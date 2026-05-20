// Shared mutable state — imported by every module
export const state = {
  token:      localStorage.getItem("token") || "",
  me:         JSON.parse(localStorage.getItem("me") || "null"),
  users:      [],
  clockTimer: null,
  current:    "dashboard",
};

export const API = location.origin;

export async function api(path, opt = {}) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 30000);

  let res;
  try {
    res = await fetch(API + path, {
      ...opt,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + state.token,
        ...(opt.headers || {})
      }
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") throw new Error("Хүсэлт хэтэрхий удаан боллоо. Холболтоо шалгана уу.");
    throw new Error("Сервертэй холбогдож чадсангүй. Сүлжээний холболтоо шалгана уу.");
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await res.text();

  if (text.trim().startsWith("<")) {
    if (res.status === 401) {
      localStorage.clear();
      state.token = "";
      state.me = null;
      window.renderLogin?.();
      return;
    }
    throw new Error(`HTTP ${res.status}: Сервер HTML буцааж байна — route олдсонгүй`);
  }

  let data;
  try { data = JSON.parse(text); } catch (e) {
    throw new Error(`JSON parse алдаа: ${text.slice(0, 60)}`);
  }

  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export function toast(t) {
  const d = document.createElement("div");
  d.className = "toast";
  d.textContent = t;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2200);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

export function table(headers, rows) {
  return `
  <table>
    <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>
      ${rows.length
        ? rows.map(r => `<tr>${r.map(c => `<td>${c ?? ""}</td>`).join("")}</tr>`).join("")
        : `<tr><td colspan="${headers.length}" class="muted">Одоогоор мэдээлэл алга</td></tr>`
      }
    </tbody>
  </table>`;
}

export function userOptions(sel) {
  return state.users.map(u => `
    <option value="${u.id}" ${sel == u.id ? "selected" : ""}>
      ${u.full_name} — ${u.position || ""}
    </option>
  `).join("");
}
