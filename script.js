// ====== KONFIGURACIJA ======
const WORKER_ENDPOINT = "https://cybercroatia-upload.leonoramilisa.workers.dev/";

// ====== UPLOAD ======
document.getElementById("uploadForm")?.addEventListener("submit", async function (e) {
  e.preventDefault();

  const text = document.getElementById("iocText")?.value.trim() || "";
  const files = Array.from(document.getElementById("iocFile")?.files || []);

  if (!text && files.length === 0) {
    alert("Molimo unesite IOC/IOA ili dodajte datoteku.");
    return;
  }

  try {
    const items = [];

    // 1) Ručni unos (podržava "ioc | opis" i heuristiku "ioc opis...")
    if (text) {
      items.push(...parseLines(text));
    }

    // 2) Datoteke (TXT/CSV/JSON, podržano više)
    for (const f of files) {
      const raw = await f.text();
      const lower = f.name.toLowerCase();

      if (lower.endsWith(".json")) {
        items.push(...parseJsonSafe(raw));
      } else {
        items.push(...parseLines(raw));
      }
    }

    // Klijentska sanitarizacija/limiti (radimo i na serveru)
    const safeItems = items
      .filter((it) => it && typeof it.value === "string" && it.value.trim())
      .slice(0, 500)
      .map((it) => {
        const value = it.value.trim().slice(0, 500);
        const description = it.description ? String(it.description).trim().slice(0, 300) : "";
        return description ? { value, description } : { value };
      });

    if (safeItems.length === 0) {
      alert("Nema valjanih unosa nakon obrade.");
      return;
    }

    const response = await fetch(WORKER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: safeItems }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    alert("Podaci su uspješno poslani i pohranjeni.");
    document.getElementById("uploadForm").reset();
  } catch (error) {
    alert("Došlo je do pogreške pri slanju podataka: " + error.message);
  }
});

/**
 * Parsira plain tekst u stavke {value, description?}
 * Podržava:
 *  - linije "IOC | opis" ili tab "IOC\topis"
 *  - heuristiku: prvi IOC u liniji = value, ostatak linije = opis
 *  - zarez/; kao više vrijednosti u jednoj liniji
 *  - JSON objekt/array po liniji (ako je tko zalijepio)
 */
function parseLines(raw) {
  const IOC_RE = {
    url: /\b(?:(?:hxxps?|https?):\/\/)[^\s]+/i,
    ip: /(?:^|\s)(\d{1,3}(?:\.\d{1,3}){3})(?=\s|$)/,
    sha256: /\b[a-f0-9]{64}\b/i,
    sha1: /\b[a-f0-9]{40}\b/i,
    md5: /\b[a-f0-9]{32}\b/i,
    // domena i defang domena (example[.]com)
    domain: /\b(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}\b|\b(?!-)(?:[a-z0-9-]{1,63}\[\.\])+(?:[a-z]{2,63})\b/i,
  };
  const ORDER = ["url", "ip", "sha256", "sha1", "md5", "domain"];

  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("//"))
    .flatMap((line) => {
      // Ako je JSON po liniji
      if (
        (line.startsWith("{") && line.endsWith("}")) ||
        (line.startsWith("[") && line.endsWith("]"))
      ) {
        try {
          const j = JSON.parse(line);
          if (Array.isArray(j)) return j.map((x) => normalizeItem(x)).filter(Boolean);
          const one = normalizeItem(j);
          return one ? [one] : [];
        } catch {}
      }

      // "IOC | opis" ili tab
      const sep = line.includes("|") ? "|" : line.includes("\t") ? "\t" : null;
      if (sep) {
        const [v, d] = line.split(sep);
        const val = (v || "").trim();
        const desc = (d || "").trim();
        if (val) return [{ value: val, ...(desc ? { description: desc } : {}) }];
      }

      // Heuristika: pronađi prvi IOC u liniji, ostatak je opis
      for (const key of ORDER) {
        const m = line.match(IOC_RE[key]);
        if (m) {
          const val = m[0].trim();
          const rest = (line.slice(0, m.index) + line.slice(m.index + val.length)).trim();
          return [{ value: val, ...(rest ? { description: rest } : {}) }];
        }
      }

      // Fallback: više vrijednosti odvojene zarezom/;
      const chunked = line.split(/[;,]/).map((x) => x.trim()).filter(Boolean);
      if (chunked.length > 1) return chunked.map((x) => ({ value: x }));

      // Kao zadnje, uzmi cijelu liniju kao vrijednost
      return [{ value: line }];
    });
}

/**
 * Sigurno parsira JSON sadržaj datoteke u {value, description?}
 * Podržava:
 *  - ["ioc1","ioc2"]
 *  - [{"value":"...", "description":"..."}, ...]
 */
function parseJsonSafe(raw) {
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j)) return j.map((x) => normalizeItem(x)).filter(Boolean);
    const one = normalizeItem(j);
    return one ? [one] : [];
  } catch {
    return [];
  }
}

/**
 * Normalizira različite ulazne oblike u {value, description?}
 */
function normalizeItem(x) {
  if (!x) return null;
  if (typeof x === "string") {
    const s = x.trim();
    return s ? { value: s } : null;
    }
  if (typeof x === "object") {
    const v = (x.value ?? x.ioc ?? x.indicator ?? "").toString().trim();
    if (!v) return null;
    const d = (x.description ?? x.note ?? x.desc ?? "").toString().trim();
    return d ? { value: v, description: d } : { value: v };
  }
  return null;
}

// ====== HOMEPAGE: učitaj i prikaži najnovije IOC-ove ======
async function loadRecentIoc() {
  const wrap = document.getElementById("recentIoc");
  if (!wrap) return; // nije index.html

  const fallback = document.getElementById("recentIocFallback");
  try {
    const resp = await fetch("data/ioc.json?t=" + Date.now(), { cache: "no-store" });
    if (!resp.ok) throw new Error("Ne mogu učitati ioc.json");
    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) {
      if (fallback) fallback.textContent = "Još nema unosa. Budi prvi – pošalji indikator.";
      return;
    }

    const batches = data
      .slice()
      .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

    const flat = [];
    for (const b of batches) {
      for (const it of b.items || []) {
        flat.push({
          value: String(it.value || "").slice(0, 200),
          description: it.description ? String(it.description).slice(0, 200) : "",
          type: it.type || "text",
          submittedAt: b.submittedAt || b.timestamp || null,
        });
      }
    }

    const latest = flat.slice(0, 6);

    wrap.innerHTML = latest
      .map((item) => {
        const when = item.submittedAt ? formatTime(item.submittedAt) : "";
        const label = item.type ? item.type.toUpperCase() : "";
        const descHtml = item.description
          ? `<p class="text-xs text-gray-400 mt-2 break-words">${escapeHTML(item.description)}</p>`
          : "";
        return `
        <div class="bg-gray-900 p-6 rounded-xl border border-gray-800">
          <div class="flex justify-between items-center mb-2">
            <span class="text-xs text-gray-500">${when}</span>
            <span class="text-[10px] px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">${label}</span>
          </div>
          <p class="font-mono text-sm text-blue-400 break-all">${escapeHTML(item.value)}</p>
          ${descHtml}
        </div>
      `;
      })
      .join("");

    if (latest.length === 0 && fallback) {
      fallback.textContent = "Još nema unosa. Budi prvi – pošalji indikator.";
    }
  } catch (e) {
    if (fallback) {
      fallback.textContent = "Greška pri učitavanju najnovijih indikatora.";
      fallback.classList.add("text-red-400");
    }
    console.error(e);
  }
}

// ====== BROWSE: učitaj sve i prikaži + brza pretraga ======
async function loadBrowse() {
  const list = document.getElementById("browseList");
  if (!list) return; // nije browse.html

  const fallback = document.getElementById("browseFallback");
  const q = document.getElementById("browseSearch");
  const typeSel = document.getElementById("browseType");

  let all = []; // {value,type,submittedAt,description?}

  try {
    const resp = await fetch("data/ioc.json?t=" + Date.now(), { cache: "no-store" });
    if (!resp.ok) throw new Error("Ne mogu učitati ioc.json");
    const data = await resp.json();

    const batches = (Array.isArray(data) ? data : [])
      .slice()
      .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

    for (const b of batches) {
      for (const it of b.items || []) {
        all.push({
          value: String(it.value || "").slice(0, 500),
          description: it.description ? String(it.description).slice(0, 500) : "",
          type: it.type || "text",
          submittedAt: b.submittedAt || b.timestamp || null,
        });
      }
    }

    render(all);
    q?.addEventListener("input", () => render(all));
    typeSel?.addEventListener("change", () => render(all));
  } catch (e) {
    if (fallback) {
      fallback.textContent = "Greška pri učitavanju.";
      fallback.classList.add("text-red-400");
    }
    console.error(e);
  }

  function render(items) {
    const query = (q?.value || "").toLowerCase().trim();
    const typ = (typeSel?.value || "").toLowerCase().trim();

    const filtered = items.filter((x) => {
      const hay = (x.value + " " + (x.description || "") + " " + (x.type || "")).toLowerCase();
      const matchQ = !query || hay.includes(query);
      const matchT = !typ || (x.type || "").toLowerCase() === typ;
      return matchQ && matchT;
    });

    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-6 text-gray-500 col-span-full">
          Nema rezultata za zadane filtre.
        </div>`;
      return;
    }

    list.innerHTML = filtered
      .slice(0, 120)
      .map((item) => {
        const when = item.submittedAt ? formatTime(item.submittedAt) : "";
        const label = item.type ? item.type.toUpperCase() : "";
        const descHtml = item.description
          ? `<p class="text-xs text-gray-400 mt-2 break-words">${escapeHTML(item.description)}</p>`
          : "";
        return `
        <div class="bg-gray-900 p-6 rounded-xl border border-gray-800">
          <div class="flex justify-between items-center mb-2">
            <span class="text-xs text-gray-500">${when}</span>
            <span class="text-[10px] px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">${label}</span>
          </div>
          <p class="font-mono text-sm text-blue-400 break-all">${escapeHTML(item.value)}</p>
          ${descHtml}
        </div>
      `;
      })
      .join("");
  }
}

// ====== POMOĆNE FUNKCIJE ======
function formatTime(iso) {
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "prije nekoliko s";
    if (diff < 3600) return `prije ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `prije ${Math.floor(diff / 3600)} h`;
    return d.toLocaleString();
  } catch {
    return "";
  }
}

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ====== INIT ======
loadRecentIoc();
loadBrowse();
