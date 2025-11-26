/* =========================================================
   KONARAK F&B — DRY STORE
   FINAL UPDATED app.js (Fixed startup permissions)
   ========================================================= */

/* ---------------- DEBUG LOG ---------------- */
function debug(msg) {
  console.log(msg);
  try {
    const el = document.getElementById("debugLog");
    if (!el) return;
    const time = new Date().toLocaleTimeString();
    el.textContent = `${time} — ${msg}\n` + el.textContent;
  } catch {}
}

function setText(id, text, color = "red") {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
    el.style.color = color;
  }
}

/* ---------------- FIREBASE CONFIG ---------------- */
const firebaseConfig = {
  apiKey: "AIzaSyDFBaRe6jDJwbSoRMpGZiQUB8PNXak0o8E",
  authDomain: "konarak-dry-store.firebaseapp.com",
  projectId: "konarak-dry-store",
  storageBucket: "konarak-dry-store.firebasestorage.app",
  messagingSenderId: "796844296062",
  appId: "1:796844296062:web:addf9694564505f914552f"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* ---------------- DOM READY ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  debug("DOM ready — waiting for login");
  wireEvents();

  try {
    document.getElementById("entryDate").value =
      new Date().toISOString().slice(0, 10);
  } catch {}
});

/* =========================================================
   GLOBAL FALLBACKS (used only if DB not readable)
   ========================================================= */
let IN_MEMORY_FLOORS = null;
let IN_MEMORY_COUNTERS = null;

/* =========================================================
   ENSURE DEFAULTS — runs ONLY AFTER LOGIN
   ========================================================= */
async function ensureDefaults() {
  try {
    const fSnap = await db.collection("floors").limit(1).get();
    const cSnap = await db.collection("counters").limit(1).get();

    if (fSnap.empty || cSnap.empty) {
      debug("Firestore empty — using fallback lists");
      IN_MEMORY_FLOORS = ["1st", "6th"];
      IN_MEMORY_COUNTERS = [
        { name: "Kitchen", floor: "1st" },
        { name: "Chana & Corn", floor: "1st" },
        { name: "Juice", floor: "1st" },
        { name: "Tea", floor: "1st" },
        { name: "Bread", floor: "1st" },
        { name: "Chat", floor: "1st" },
        { name: "Shawarma", floor: "1st" },
        { name: "Kitchen", floor: "6th" },
        { name: "Tea", floor: "6th" },
        { name: "Muntha Masala", floor: "6th" }
      ];
    } else {
      IN_MEMORY_FLOORS = null;
      IN_MEMORY_COUNTERS = null;
    }
  } catch (e) {
    debug("ensureDefaults error — fallback mode: " + e.message);
    IN_MEMORY_FLOORS = ["1st", "6th"];
    IN_MEMORY_COUNTERS = [
      { name: "Kitchen", floor: "1st" },
      { name: "Chana & Corn", floor: "1st" },
      { name: "Juice", floor: "1st" },
      { name: "Tea", floor: "1st" },
      { name: "Bread", floor: "1st" },
      { name: "Chat", floor: "1st" },
      { name: "Shawarma", floor: "1st" },
      { name: "Kitchen", floor: "6th" },
      { name: "Tea", floor: "6th" },
      { name: "Muntha Masala", floor: "6th" }
    ];
  }
}

/* =========================================================
   LOGIN AFTER-LOAD FIX — onAuthStateChanged
   ========================================================= */
auth.onAuthStateChanged(async (user) => {
  debug("onAuthStateChanged → " + (user ? user.email : "null"));

  document.getElementById("auth-section").classList.remove("hidden");
  document.getElementById("app-section").classList.add("hidden");

  if (!user) return; // Not logged in → stop here (NO Firestore reads)

  try {
    // ⭐ Load floors & counters ONLY AFTER user logs in
    await ensureDefaults();
    await loadFloorsAndCountersToUI();

    const metaDoc = await db.collection("users").doc(user.uid).get();

    if (!metaDoc.exists) {
      debug("User doc missing → showing admin UI");
      document.getElementById("auth-section").classList.add("hidden");
      document.getElementById("app-section").classList.remove("hidden");
      return await showManagerUI();
    }

    const meta = metaDoc.data();
    document.getElementById("who").textContent =
      `${meta.role.toUpperCase()} — ${meta.counter} (${meta.floor})`;

    document.getElementById("auth-section").classList.add("hidden");
    document.getElementById("app-section").classList.remove("hidden");

    if (meta.role === "counter") {
      await showCounterUI(meta, user.uid);
    } else {
      await showManagerUI();
    }

  } catch (e) {
    debug("Auth error: " + e.message);
  }
});

/* =========================================================
   LOAD FLOORS + COUNTERS (supports fallback mode)
   ========================================================= */
async function loadFloorsAndCountersToUI() {
  try {
    debug("Loading floors & counters…");

    let floors = [];
    let counters = [];

    if (IN_MEMORY_FLOORS) {
      floors = IN_MEMORY_FLOORS;
      counters = IN_MEMORY_COUNTERS;
      debug("Using fallback floors/counters");
    } else {
      const fSnap = await db.collection("floors").orderBy("name").get();
      floors = fSnap.docs.map(d => d.data().name);

      const cSnap = await db.collection("counters")
        .orderBy("floor")
        .orderBy("name")
        .get();

      counters = cSnap.docs.map(d => ({
        name: d.data().name,
        floor: d.data().floor
      }));
    }

    // Populate all dropdowns
    const selectsFloors = [
      "floorSelect",
      "viewFloor",
      "newFloor",
      "selectFloorForCounter"
    ].map(id => document.getElementById(id));

    selectsFloors.forEach(sel => {
      if (!sel) return;
      sel.innerHTML = "";
      if (sel.id === "viewFloor") sel.append(new Option("All", "all"));
      floors.forEach(f => sel.append(new Option(f, f)));
    });

    // Select defaults
    if (floors.length > 0) {
      if (document.getElementById("floorSelect"))
        document.getElementById("floorSelect").value = floors[0];
      if (document.getElementById("newFloor"))
        document.getElementById("newFloor").value = floors[0];
      if (document.getElementById("selectFloorForCounter"))
        document.getElementById("selectFloorForCounter").value = floors[0];
    }

    // Populate counters
    const curFloor = document.getElementById("floorSelect").value;
    if (IN_MEMORY_COUNTERS) {
      const floorCounters = IN_MEMORY_COUNTERS.filter(c => c.floor === curFloor);
      const cSel = document.getElementById("counterSelect");
      cSel.innerHTML = "";
      floorCounters.forEach(c => cSel.append(new Option(c.name, c.name)));

      // View counters
      const vc = document.getElementById("viewCounter");
      vc.innerHTML = "<option value='all'>All</option>";
      IN_MEMORY_COUNTERS.forEach(c =>
        vc.append(new Option(`${c.name} (${c.floor})`, c.name))
      );

      // New assign counter
      const nf = document.getElementById("newFloor").value;
      const na = document.getElementById("newAssignCounter");
      na.innerHTML = "";
      IN_MEMORY_COUNTERS.filter(c => c.floor === nf)
        .forEach(c => na.append(new Option(c.name, c.name)));

    } else {
      await populateCountersForFloor(curFloor);
      await populateViewCounterOptions();
      await populateAssignCounterOptions(document.getElementById("newFloor").value);
    }

  } catch (e) {
    debug("loadFloorsAndCountersToUI error: " + e.message);
  }
}

async function populateCountersForFloor(floor) {
  const sel = document.getElementById("counterSelect");
  sel.innerHTML = "";
  const snap = await db.collection("counters")
    .where("floor", "==", floor)
    .orderBy("name")
    .get();
  snap.forEach(d => sel.append(new Option(d.data().name, d.data().name)));
}

async function populateViewCounterOptions() {
  const sel = document.getElementById("viewCounter");
  sel.innerHTML = "<option value='all'>All</option>";

  const snap = await db.collection("counters")
    .orderBy("floor")
    .orderBy("name")
    .get();

  snap.forEach(d =>
    sel.append(new Option(`${d.data().name} (${d.data().floor})`, d.data().name))
  );
}

async function populateAssignCounterOptions(floor) {
  const sel = document.getElementById("newAssignCounter");
  sel.innerHTML = "";
  const snap = await db.collection("counters")
    .where("floor", "==", floor)
    .orderBy("name")
    .get();
  snap.forEach(d => sel.append(new Option(d.data().name, d.data().name)));
}

/* =========================================================
   EVENT HANDLERS
   ========================================================= */
function wireEvents() {
  document.getElementById("loginBtn").addEventListener("click", loginHandler);
  document.getElementById("logoutBtn").addEventListener("click", () => auth.signOut());

  document.getElementById("addRowBtn").addEventListener("click", addEmptyRow);
  document.getElementById("saveEntryBtn").addEventListener("click", saveEntryHandler);
  document.getElementById("pdfBtn").addEventListener("click", exportPdfFromUI);
  document.getElementById("excelBtn").addEventListener("click", exportExcelFromUI);

  document.getElementById("createFloorBtn").addEventListener("click", createFloorHandler);
  document.getElementById("createCounterBtn").addEventListener("click", createCounterHandler);
  document.getElementById("createUserBtn").addEventListener("click", createCounterUserHandler);

  document.getElementById("viewFloor").addEventListener("change", async () => {
    await reloadViewCounters();
    await loadAllEntries();
  });

  document.getElementById("refreshView").addEventListener("click", loadAllEntries);
  document.getElementById("downloadFilteredExcel").addEventListener("click", downloadFilteredExcel);

  document.getElementById("newFloor").addEventListener("change", () =>
    populateAssignCounterOptions(document.getElementById("newFloor").value)
  );
}

/* =========================================================
   LOGIN
   ========================================================= */
async function loginHandler() {
  setText("loginError", "");
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value;

  try {
    await auth.signInWithEmailAndPassword(email, pass);
    debug("Login success");
  } catch (e) {
    setText("loginError", e.message);
  }
}

/* =========================================================
   COUNTER UI
   ========================================================= */
async function showCounterUI(meta, uid) {
  document.getElementById("manager-ui").classList.add("hidden");
  document.getElementById("counter-ui").classList.remove("hidden");

  document.getElementById("floorSelect").value = meta.floor;
  await populateCountersForFloor(meta.floor);
  document.getElementById("counterSelect").value = meta.counter;

  document.getElementById("floorSelect").disabled = true;
  document.getElementById("counterSelect").disabled = true;

  document.querySelector("#stockTable tbody").innerHTML = "";
  addEmptyRow();
  addEmptyRow();

  await loadMyEntries(uid);
}

/* =========================================================
   ADMIN UI
   ========================================================= */
async function showManagerUI() {
  document.getElementById("counter-ui").classList.add("hidden");
  document.getElementById("manager-ui").classList.remove("hidden");

  await loadFloorsAndCountersToUI();
  await loadAllEntries();
}

/* =========================================================
   TABLE
   ========================================================= */
function addEmptyRow() {
  const tbody = document.querySelector("#stockTable tbody");
  const tr = document.createElement("tr");

  for (let i = 0; i < 9; i++) {
    const td = document.createElement("td");
    td.contentEditable = true;
    tr.appendChild(td);
  }
  tbody.appendChild(tr);
}

function readTableRows() {
  const rows = [];
  const trs = document.querySelectorAll("#stockTable tbody tr");
  let sno = 1;

  trs.forEach(tr => {
    const cells = [...tr.children].map(td => td.textContent.trim());
    if (cells.every(c => c === "")) return;

    rows.push({
      sno: sno++,
      item: cells[1],
      batch: cells[2],
      receivingDate: cells[3],
      mfgDate: cells[4],
      expiryDate: cells[5],
      shelfLife: cells[6],
      qty: cells[7],
      remarks: cells[8]
    });
  });

  return rows;
}

/* =========================================================
   SAVE ENTRY
   ========================================================= */
async function saveEntryHandler() {
  const user = auth.currentUser;
  if (!user) return alert("Not logged in");

  const metaDoc = await db.collection("users").doc(user.uid).get();
  const meta = metaDoc.data();

  const rows = readTableRows();
  if (!rows.length) return alert("Add at least one row");

  const floor = document.getElementById("floorSelect").value;
  const counter = document.getElementById("counterSelect").value;

  if (meta.role === "counter") {
    if (floor !== meta.floor || counter !== meta.counter) {
      return alert("You can only submit entries for your assigned counter.");
    }
  }

  await db.collection("entries").add({
    createdBy: user.uid,
    creatorEmail: user.email,
    floor,
    counter,
    date: document.getElementById("entryDate").value,
    rows,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });

  alert("Saved");
  await loadMyEntries(user.uid);
}

/* =========================================================
   LOAD ENTRIES
   ========================================================= */
async function loadMyEntries(uid) {
  const div = document.getElementById("history");
  div.innerHTML = "";

  const snap = await db.collection("entries")
    .where("createdBy", "==", uid)
    .orderBy("timestamp", "desc")
    .get();

  snap.forEach(doc => {
    const d = doc.data();
    const e = document.createElement("div");
    e.className = "entry";

    e.innerHTML = `
      <strong>${d.counter} — ${d.date}</strong><br>${d.rows.length} items
      <br><button onclick="downloadEntryPdf('${doc.id}')">PDF</button>
      <button onclick="downloadEntryExcel('${doc.id}')">Excel</button>
    `;

    div.appendChild(e);
  });
}

async function loadAllEntries() {
  const div = document.getElementById("allEntries");
  div.innerHTML = "";

  let q = db.collection("entries").orderBy("timestamp", "desc");

  const f = document.getElementById("viewFloor").value;
  const c = document.getElementById("viewCounter").value;

  if (f !== "all") q = q.where("floor", "==", f);
  if (c !== "all") q = q.where("counter", "==", c);

  const snap = await q.get();

  snap.forEach(doc => {
    const d = doc.data();

    const e = document.createElement("div");
    e.className = "entry";

    e.innerHTML = `
      <strong>${d.counter} (${d.floor}) — ${d.date}</strong>
      <br>${d.rows.length} items
      <br><button onclick="downloadEntryPdf('${doc.id}')">PDF</button>
      <button onclick="downloadEntryExcel('${doc.id}')">Excel</button>
    `;

    div.appendChild(e);
  });
}

/* =========================================================
   PDF EXPORT
   ========================================================= */
function generatePdfFromEntry(entry) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "pt", "a4");
  const margin = 36;

  const logo = new Image();
  logo.src = "./logo.png";

  logo.onload = () => {
    doc.rect(margin, 20, 520, 70);
    doc.addImage(logo, "PNG", margin + 10, 28, 130, 50);

    doc.setFontSize(12);
    doc.text("Dry Store Stock Record", margin + 160, 36);
    doc.setFontSize(9);
    doc.text("Konarak F&B — Cognizant 12A, Mindspace Hyderabad", margin + 160, 52);
    doc.text("Date: " + entry.date, margin, 110);

    const columns = [
      "S.No","Items","Batch","Receiving Date",
      "Mfg","Expiry","Shelf Life","Stock","Remarks"
    ];

    const body = entry.rows.map((r, i) => [
      i + 1, r.item, r.batch, r.receivingDate,
      r.mfgDate, r.expiryDate, r.shelfLife, r.qty, r.remarks
    ]);

    doc.autoTable({
      head: [columns],
      body: body,
      startY: 130,
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 }
    });

    doc.save(`DryStore_${entry.counter}_${entry.date}.pdf`);
  };
}

async function downloadEntryPdf(id) {
  const docSnap = await db.collection("entries").doc(id).get();
  generatePdfFromEntry(docSnap.data());
}

function exportPdfFromUI() {
  const rows = readTableRows();
  if (!rows.length) return alert("Add at least one row");

  const entry = {
    date: document.getElementById("entryDate").value,
    counter: document.getElementById("counterSelect").value,
    rows
  };

  generatePdfFromEntry(entry);
}

/* =========================================================
   EXCEL EXPORT
   ========================================================= */
function exportJsonToExcel(json, filename) {
  const ws = XLSX.utils.json_to_sheet(json);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, filename);
}

async function downloadEntryExcel(id) {
  const docSnap = await db.collection("entries").doc(id).get();
  const d = docSnap.data();

  const rows = d.rows.map((r, i) => ({
    "S.No": i + 1,
    "Item": r.item,
    "Batch": r.batch,
    "Receiving Date": r.receivingDate,
    "Mfg Date": r.mfgDate,
    "Expiry": r.expiryDate,
    "Shelf Life": r.shelfLife,
    "Qty": r.qty,
    "Remarks": r.remarks
  }));

  exportJsonToExcel(rows, `DryStore_${d.counter}_${d.date}.xlsx`);
}

function exportExcelFromUI() {
  const rows = readTableRows();
  if (!rows.length) return alert("Add at least one row");

  const mapped = rows.map(r => ({
    "S.No": r.sno,
    "Item": r.item,
    "Batch": r.batch,
    "Receiving Date": r.receivingDate,
    "Mfg Date": r.mfgDate,
    "Expiry": r.expiryDate,
    "Shelf Life": r.shelfLife,
    "Qty": r.qty,
    "Remarks": r.remarks
  }));

  exportJsonToExcel(mapped, "DryStore_Table.xlsx");
}

async function downloadFilteredExcel() {
  const f = document.getElementById("viewFloor").value;
  const c = document.getElementById("viewCounter").value;
  const from = document.getElementById("fromDate").value;
  const to = document.getElementById("toDate").value;

  let q = db.collection("entries").orderBy("timestamp", "desc");

  if (f !== "all") q = q.where("floor", "==", f);
  if (c !== "all") q = q.where("counter", "==", c);

  const snap = await q.get();
  const out = [];

  snap.forEach(doc => {
    const d = doc.data();
    if (from && d.date < from) return;
    if (to && d.date > to) return;

    d.rows.forEach((r, i) =>
      out.push({
        "Date": d.date,
        "Floor": d.floor,
        "Counter": d.counter,
        "S.No": i + 1,
        "Item": r.item,
        "Batch": r.batch,
        "Receiving Date": r.receivingDate,
        "Mfg Date": r.mfgDate,
        "Expiry": r.expiryDate,
        "Shelf Life": r.shelfLife,
        "Qty": r.qty,
        "Remarks": r.remarks,
        "Created By": d.creatorEmail
      })
    );
  });

  if (!out.length) return alert("No matching entries found");

  exportJsonToExcel(out, "DryStore_Filtered.xlsx");
}

/* =========================================================
   ADMIN — CREATE FLOOR
   ========================================================= */
async function createFloorHandler() {
  const name = document.getElementById("newFloorName").value.trim();
  if (!name) return setText("nodeMsg", "Enter floor name");

  const exists = await db.collection("floors").where("name", "==", name).get();
  if (!exists.empty) return setText("nodeMsg", "Floor already exists");

  await db.collection("floors").add({ name });
  setText("nodeMsg", "Floor created", "green");
  document.getElementById("newFloorName").value = "";

  await loadFloorsAndCountersToUI();
}

/* =========================================================
   ADMIN — CREATE COUNTER
   ========================================================= */
async function createCounterHandler() {
  const floor = document.getElementById("selectFloorForCounter").value;
  const name = document.getElementById("newCounterNameField").value.trim();
  if (!name) return setText("nodeMsg", "Enter counter name");

  const exists = await db.collection("counters")
    .where("floor", "==", floor)
    .where("name", "==", name)
    .get();

  if (!exists.empty) return setText("nodeMsg", "Counter already exists");

  await db.collection("counters").add({ floor, name });
  setText("nodeMsg", "Counter created", "green");
  document.getElementById("newCounterNameField").value = "";

  await loadFloorsAndCountersToUI();
}

/* =========================================================
   ADMIN — CREATE COUNTER USER (REST API)
   ========================================================= */
async function createCounterUserHandler() {
  setText("createMsg", "");

  const email = document.getElementById("newEmail").value.trim();
  const password = document.getElementById("newPassword").value.trim();
  const floor = document.getElementById("newFloor").value;
  const counter = document.getElementById("newAssignCounter").value;

  if (!email || !password)
    return setText("createMsg", "Email & password required");

  const apiKey = firebaseConfig.apiKey;

  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }
  );

  const data = await resp.json();
  if (data.error) return setText("createMsg", data.error.message);

  const uid = data.localId;

  await db.collection("users").doc(uid).set({
    email,
    role: "counter",
    floor,
    counter,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  setText("createMsg", "Counter user created", "green");
  document.getElementById("newEmail").value = "";
  document.getElementById("newPassword").value = "";
}

/* =========================================================
   EXPORT FUNCTIONS (public)
   ========================================================= */
window.downloadEntryPdf = downloadEntryPdf;
window.downloadEntryExcel = downloadEntryExcel;

/* END OF FILE */
