document.getElementById("uploadForm")?.addEventListener("submit", function(e) {
  e.preventDefault();
  const text = document.getElementById("iocText").value.trim();
  const file = document.getElementById("iocFile")?.files[0];
  
  if (!text && !file) {
    alert("Molimo unesite IOC/IOA ili dodajte datoteku.");
    return;
  }

  if (file) {
    alert(`Datoteka "${file.name}" je spremna za slanje (demo način).`);
  } else {
    alert("Uneseni IOC/IOA podaci su zaprimljeni (demo način).");
  }

  document.getElementById("uploadForm").reset();
});
