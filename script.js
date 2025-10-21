// ====== KONFIGURACIJA ======
const WORKER_ENDPOINT = "https://cybercroatia-upload.leonoramilisa.workers.dev/";

// ====== UPLOAD ======
document.getElementById("uploadForm")?.addEventListener("submit", async function(e) {
  e.preventDefault();

  const text = document.getElementById("iocText")?.value.trim();
  const file = document.getElementById("iocFile")?.files[0];

  if (!text && !file) {
    alert("Molimo unesite IOC/IOA ili dodajte datoteku.");
    return;
  }

  let rawData = text;
  if (file) rawData = await file.text();

  // Parsiranje IOC/IOA redaka
  const items = rawData
    .split(/\r?\n|,|;/)
    .map(x => x.trim())
    .filter(Boolean)
    .map(x => ({ value: x }));

  try {
    const response = await fetch(WORKER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    alert("Podaci su uspješno poslani i pohranjeni na GitHub.");
    document.getElementById("uploadForm").reset();
  } catch (error) {
    alert("Došlo je do pogreške pri slanju podataka: " + error.message);
  }
});

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

    // Sortiraj batch-eve po datumu
    const batches = data
      .slice()
      .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

    // Izravnaj u pojedinačne stavke
    const flat = [];
    for (const b of batches) {
      for (const it of (b.items || [])) {
        flat.push({
          value: String(it.value || "").slice(0, 120),
          type: it.type || "text",
          submittedAt: b.submittedAt || b.timestamp || null
        });
      }
    }

    // Uzmi zadnjih 6
    const latest = flat.slice(0, 6);

    // Render
    wrap.innerHTML = latest.map(item => {
      const when = item.submittedAt ? formatTime(item.submittedAt) : "";
      const label = item.type ? item.type.toUpperCase() : "";
      return `
        <div class="bg-gray-900 p-6 rounded-xl border border-gray-800">
          <div class="flex justify-between items-center mb-2">
            <span class="text-xs text-gray-500">${when}</span>
            <span class="text-[10px] px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">${label}</span>
          </div>
          <p class="font-mono text-sm text-blue-400 break-all">${escapeHTML(item.value)}</p>
        </div>
      `;
    }).join("");

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

// ====== POMOĆNE FUNKCIJE ======
function formatTime(iso) {
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "prije nekoliko s";
    if (diff < 3600) return `prije ${Math.floor(diff/60)} min`;
    if (diff < 86400) return `prije ${Math.floor(diff/3600)} h`;
    return d.toLocaleString();
  } catch { return ""; }
}

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
  );
}

// ====== INIT ======
loadRecentIoc();
