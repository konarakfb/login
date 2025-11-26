/* ----------------------------------------------------------
   FIREBASE CONFIG  (Compat version for your website)
----------------------------------------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyDFBaRe6jDJwbSoRMpGZiQUB8PNXak0o8E",
  authDomain: "konarak-dry-store.firebaseapp.com",
  projectId: "konarak-dry-store",
  storageBucket: "konarak-dry-store.firebasestorage.app",
  messagingSenderId: "796844296062",
  appId: "1:796844296062:web:addf9694564505f914552f"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Auth & Firestore
const auth = firebase.auth();
const db   = firebase.firestore();

/* ----------------------------------------------------------
   COUNTERS LIST
----------------------------------------------------------- */
const COUNTERS = {
  "1st": [
    "Kitchen (1st Floor)",
    "Chana & Corn",
    "Juice",
    "Tea (1st Floor)",
    "Bread",
    "Chat",
    "Shawarma"
  ],
  "6th": [
    "Kitchen (6th Floor)",
    "Tea (6th Floor)",
    "Muntha Masala"
  ]
};

/* ----------------------------------------------------------
   GET UI ELEMENTS
----------------------------------------------------------- */
const authSection = document.getElementById('auth-section');
const appSection  = document.getElementById('app-section');
const loginBtn    = document.getElementById('loginBtn');
const logoutBtn   = document.getElementById('logoutBtn');
const loginError  = document.getElementById('loginError');
const who         = document.getElementById('who');

const floorSelect = document.getElementById('floorSelect');
const counterSelect = document.getElementById('counterSelect');
const entryDate   = document.getElementById('entryDate');
const addRowBtn   = document.getElementById('addRowBtn');
const saveEntryBtn = document.getElementById('saveEntryBtn');
const pdfBtn      = document.getElementById('pdfBtn');
const stockTableBody = document.querySelector('#stockTable tbody');
const historyDiv  = document.getElementById('history');

const managerUI   = document.getElementById('manager-ui');
const counterUI   = document.getElementById('counter-ui');

const viewFloor   = document.getElementById('viewFloor');
const viewCounter = document.getElementById('viewCounter');
const refreshView = document.getElementById('refreshView');
const allEntries  = document.getElementById('allEntries');

const newEmail     = document.getElementById('newEmail');
const newPassword  = document.getElementById('newPassword');
const newRole      = document.getElementById('newRole');
const newFloor     = document.getElementById('newFloor');
const newCounterName = document.getElementById('newCounterName');
const createUserBtn = document.getElementById('createUserBtn');
const createMsg     = document.getElementById('createMsg');

/* ----------------------------------------------------------
   HELPER FUNCTIONS
----------------------------------------------------------- */
function populateCounterSelect() {
  counterSelect.innerHTML = "";
  COUNTERS[floorSelect.value].forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    counterSelect.appendChild(opt);
  });
}

function addEmptyRow() {
  const tr = document.createElement('tr');
  for (let i = 0; i < 8; i++) {
    const td = document.createElement('td');
    td.contentEditable = true;
    tr.appendChild(td);
  }
  stockTableBody.appendChild(tr);
}

function readTableRows() {
  const rows = [];
  for (const tr of stockTableBody.querySelectorAll('tr')) {
    const cells = [...tr.children].map(td => td.textContent.trim());
    if (cells.every(val => val === "")) continue;
    rows.push({
      item: cells[0],
      batch: cells[1],
      receivingDate: cells[2],
      mfgDate: cells[3],
      expiryDate: cells[4],
      shelfLife: cells[5],
      qty: cells[6],
      remarks: cells[7]
    });
  }
  return rows;
}

/* ----------------------------------------------------------
   LOGIN / LOGOUT
----------------------------------------------------------- */
loginBtn.addEventListener('click', async () => {
  loginError.textContent = "";
  try {
    await auth.signInWithEmailAndPassword(
      document.getElementById('email').value.trim(),
      document.getElementById('password').value
    );
  } catch (e) {
    loginError.textContent = e.message;
  }
});

logoutBtn.addEventListener('click', () => auth.signOut());

/* ----------------------------------------------------------
   AUTH STATE CHANGE
----------------------------------------------------------- */
auth.onAuthStateChanged(async user => {
  if (!user) {
    authSection.classList.remove('hidden');
    appSection.classList.add('hidden');
    return;
  }

  const uDoc = await db.collection('users').doc(user.uid).get();
  const u = uDoc.data();

  who.textContent = `${u.role.toUpperCase()} — ${u.counter} (${u.floor})`;

  authSection.classList.add('hidden');
  appSection.classList.remove('hidden');

  if (u.role === "counter") showCounterUI(u);
  else showManagerUI(u);
});

/* ----------------------------------------------------------
   UI SWITCHING
----------------------------------------------------------- */
function showCounterUI(u) {
  managerUI.classList.add('hidden');
  counterUI.classList.remove('hidden');

  floorSelect.value = u.floor;
  populateCounterSelect();
  counterSelect.value = u.counter;

  entryDate.value = new Date().toISOString().substring(0, 10);

  stockTableBody.innerHTML = "";
  addEmptyRow(); 
  addEmptyRow();

  loadMyEntries();
}

function showManagerUI() {
  managerUI.classList.remove('hidden');
  counterUI.classList.add('hidden');

  loadAllEntries();
}

/* ----------------------------------------------------------
   SAVE ENTRY (COUNTER)
----------------------------------------------------------- */
saveEntryBtn.addEventListener('click', async () => {
  const user = auth.currentUser;
  const uDoc = await db.collection('users').doc(user.uid).get();
  const u = uDoc.data();

  const rows = readTableRows();
  if (rows.length === 0) return alert("Please add at least one item row.");

  await db.collection('entries').add({
    createdBy: user.uid,
    creatorEmail: user.email,
    floor: u.floor,
    counter: u.counter,
    date: entryDate.value,
    rows: rows,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });

  alert("Saved successfully!");
  loadMyEntries();
});

/* ----------------------------------------------------------
   LOAD USER ENTRIES
----------------------------------------------------------- */
async function loadMyEntries() {
  historyDiv.innerHTML = "";
  const user = auth.currentUser;

  const snap = await db.collection('entries')
    .where('createdBy', '==', user.uid)
    .orderBy('timestamp', 'desc')
    .limit(20)
    .get();

  snap.forEach(doc => {
    const d = doc.data();
    const div = document.createElement('div');
    div.className = "entry";
    div.innerHTML = `
      <strong>${d.counter} (${d.floor}) — ${d.date}</strong><br/>
      ${d.rows.length} items
      <br><button onclick="downloadEntryPdf('${doc.id}')">Download PDF</button>
    `;
    historyDiv.appendChild(div);
  });
}

/* ----------------------------------------------------------
   PDF GENERATION
----------------------------------------------------------- */
async function downloadEntryPdf(id) {
  const docRef = await db.collection('entries').doc(id).get();
  generatePdfFromEntry(docRef.data());
}

pdfBtn.addEventListener('click', () => {
  const entry = {
    floor: floorSelect.value,
    counter: counterSelect.value,
    date: entryDate.value,
    rows: readTableRows(),
    creatorEmail: auth.currentUser.email
  };
  generatePdfFromEntry(entry);
});

function generatePdfFromEntry(entry) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'pt', 'a4');

  const img = new Image();
  img.src = "./logo.png";

  img.onload = function () {
    doc.addImage(img, 'PNG', 40, 20, 120, 40);
    createTable();
  };

  img.onerror = function () {
    createTable();
  };

  function createTable() {
    doc.setFontSize(14);
    doc.text("Dry Store Stock Record", 220, 60);

    doc.setFontSize(10);
    doc.text(`Floor: ${entry.floor}   Counter: ${entry.counter}`, 40, 100);
    doc.text(`Date: ${entry.date}`, 40, 120);

    const columns = [
      "Item","Batch No","Receiving Date","Mfg Date","Expiry","Shelf Life","Qty","Remarks"
    ];

    const rows = entry.rows.map(r => [
      r.item, r.batch, r.receivingDate, r.mfgDate, r.expiryDate, r.shelfLife, r.qty, r.remarks
    ]);

    doc.autoTable({
      head: [columns],
      body: rows,
      startY: 150,
      styles: { fontSize: 9 }
    });

    doc.text(`Prepared by: ${entry.creatorEmail}`, 40, doc.lastAutoTable.finalY + 30);

    doc.save(`DryStore_${entry.counter}_${entry.date}.pdf`);
  }
}

/* ----------------------------------------------------------
   MANAGER VIEW
----------------------------------------------------------- */
refreshView.addEventListener('click', loadAllEntries);

async function loadAllEntries() {
  allEntries.innerHTML = "";

  const snap = await db.collection('entries')
    .orderBy('timestamp', 'desc')
    .limit(200)
    .get();

  snap.forEach(doc => {
    const d = doc.data();
    const div = document.createElement('div');
    div.className = "entry";
    div.innerHTML = `
      <strong>${d.counter} (${d.floor}) — ${d.date}</strong>
      <br>${d.rows.length} items
      <br><button onclick="downloadEntryPdf('${doc.id}')">Download PDF</button>
    `;
    allEntries.appendChild(div);
  });
}

/* ----------------------------------------------------------
   CREATE ROW BUTTON
----------------------------------------------------------- */
addRowBtn.addEventListener('click', addEmptyRow);

/* ----------------------------------------------------------
   ADMIN: CREATE USER
----------------------------------------------------------- */
createUserBtn.addEventListener('click', async () => {
  try {
    const cred = await auth.createUserWithEmailAndPassword(
      newEmail.value.trim(),
      newPassword.value.trim()
    );

    await db.collection('users').doc(cred.user.uid).set({
      email: newEmail.value.trim(),
      role: newRole.value,
      floor: newFloor.value,
      counter: newCounterName.value.trim(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    createMsg.textContent = "User created successfully!";
  } catch (e) {
    createMsg.textContent = e.message;
  }
});

/* ----------------------------------------------------------
   INITIAL LOAD
----------------------------------------------------------- */
populateCounterSelect();
addEmptyRow();
addEmptyRow();
