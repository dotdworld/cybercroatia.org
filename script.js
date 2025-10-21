const WORKER_ENDPOINT = "https://cybercroatia-upload.leonoramilisa.workers.dev/";

document.getElementById("uploadForm")?.addEventListener("submit", async function(e) {
  e.preventDefault();
  
  const text = document.getElementById("iocText").value.trim();
  const file = document.getElementById("iocFile")?.files[0];
  
  if (!text && !file) {
    alert("Molimo unesite IOC/IOA ili dodajte datoteku.");
    return;
  }

  let rawData = text;

  if (file) {
    rawData = await file.text();
  }

  // parsiranje IOC/IOA redaka
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
