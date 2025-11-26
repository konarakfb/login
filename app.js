/* ----------------------------------------------------------
   FIREBASE CONFIG  (Compat version)
----------------------------------------------------------- */
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

/* ----------------------------------------------------------
   COUNTERS LIST (no "(1st Floor)" suffixes)
----------------------------------------------------------- */
const COUNTERS = {
  "1st": ["Kitchen","Chana & Corn","Juice","Tea","Bread","Chat","Shawarma"],
  "6th": ["Kitchen","Tea","Muntha Masala"]
};

/* ----------------------------------------------------------
   UI ELEMENTS
----------------------------------------------------------- */
const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginError = document.getElementById('loginError');
const who = document.getElementById('who');

const floorSelect = document.getElementById('floorSelect');
const counterSelect = document.getElementById('counterSelect');
const entryDate = document.getElementById('entryDate');
const addRowBtn = document.getElementById('addRowBtn');
const saveEntryBtn = document.getElementById('saveEntryBtn');
const pdfBtn = document.getElementById('pdfBtn');
const stockTableBody = document.querySelector('#stockTable tbody');
const historyDiv = document.getElementById('history');

const managerUI = document.getElementById('manager-ui');
const counterUI = document.getElementById('counter-ui');

const viewFloor = document.getElementById('viewFloor');
const viewCounter = document.getElementById('viewCounter');
const refreshView = document.getElementById('refreshView');
const allEntries = document.getElementById('allEntries');

const newEmail = document.getElementById('newEmail');
const newPassword = document.getElementById('newPassword');
const newRole = document.getElementById('newRole');
const newFloor = document.getElementById('newFloor');
const newAssignCounter = document.getElementById('newAssignCounter');
const createUserBtn = document.getElementById('createUserBtn');
const createMsg = document.getElementById('createMsg');

/* ----------------------------------------------------------
   HELPERS
----------------------------------------------------------- */
function populateCounterSelect() {
  const floor = floorSelect.value;
  counterSelect.innerHTML = "";
  COUNTERS[floor].forEach(c => {
    const opt = document.createElement('option'); opt.value = c; opt.textContent = c;
    counterSelect.appendChild(opt);
  });
}

function populateAssignCounterSelect(floor) {
  newAssignCounter.innerHTML = "";
  (COUNTERS[floor] || []).forEach(c => {
    const opt = document.createElement('option'); opt.value = c; opt.textContent = c;
    newAssignCounter.appendChild(opt);
  });
}

function addEmptyRow() {
  const tr = document.createElement('tr');
  for (let i=0;i<8;i++){
    const td = document.createElement('td'); td.contentEditable = true; td.innerHTML = "";
    tr.appendChild(td);
  }
  stockTableBody.appendChild(tr);
}

function readTableRows() {
  const rows = [];
  for (const tr of stockTableBody.querySelectorAll('tr')) {
    const cells = [...tr.children].map(td => td.textContent.trim());
    if (cells.every(v => v === "")) continue;
    rows.push({
      item: cells[0]||"",
      batch: cells[1]||"",
      receivingDate: cells[2]||"",
      mfgDate: cells[3]||"",
      expiryDate: cells[4]||"",
      shelfLife: cells[5]||"",
      qty: cells[6]||"",
      remarks: cells[7]||""
    });
  }
  return rows;
}

/* ----------------------------------------------------------
   AUTH (login/logout)
----------------------------------------------------------- */
loginBtn.addEventListener('click', async ()=>{
  loginError.textContent = "";
  const email = document.getElementById('email').value.trim();
  const pass = document.getElementById('password').value;
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (e) {
    loginError.textContent = e.message;
  }
});
logoutBtn.addEventListener('click', ()=>auth.signOut());

/* ----------------------------------------------------------
   AUTH STATE CHANGE
----------------------------------------------------------- */
auth.onAuthStateChanged(async user=>{
  if (!user) {
    authSection.classList.remove('hidden'); appSection.classList.add('hidden');
    return;
  }

  // fetch user metadata
  const meta = await db.collection('users').doc(user.uid).get();
  if (!meta.exists) {
    who.textContent = `${user.email} (no role)`;
    // default to counter UI so admin can create their user doc if needed
    showManagerUI();
    return;
  }
  const u = meta.data();
  who.textContent = `${u.role.toUpperCase()} — ${u.counter} (${u.floor})`;

  authSection.classList.add('hidden'); appSection.classList.remove('hidden');

  if (u.role === 'counter') {
    showCounterUI(u);
  } else {
    showManagerUI();
  }
});

/* ----------------------------------------------------------
   SHOW UIs
----------------------------------------------------------- */
function showCounterUI(u) {
  managerUI.classList.add('hidden'); counterUI.classList.remove('hidden');

  // set selects and lock them
  floorSelect.value = u.floor || '1st';
  populateCounterSelect();
  counterSelect.value = u.counter || COUNTERS[floorSelect.value][0];

  floorSelect.disabled = true;
  counterSelect.disabled = true;

  entryDate.value = new Date().toISOString().slice(0,10);

  stockTableBody.innerHTML = "";
  addEmptyRow(); addEmptyRow();

  loadMyEntries();
}

function showManagerUI() {
  managerUI.classList.remove('hidden'); counterUI.classList.add('hidden');

  // enable selects for manager/admin
  floorSelect.disabled = false;
  counterSelect.disabled = false;

  // populate manager filter dropdowns
  viewCounter.innerHTML = '<option value="all">All Counters</option>';
  Object.keys(COUNTERS).forEach(f=>{
    COUNTERS[f].forEach(c=>{
      const o = document.createElement('option'); o.value = c; o.textContent = `${c} (${f})`;
      viewCounter.appendChild(o);
    });
  });

  populateAssignCounterSelect(newFloor.value);
  loadAllEntries();
}

/* ----------------------------------------------------------
   SAVE ENTRY (counter)
----------------------------------------------------------- */
saveEntryBtn.addEventListener('click', async ()=>{
  const user = auth.currentUser;
  if (!user) return alert('Not signed in');

  const meta = await db.collection('users').doc(user.uid).get();
  if (!meta.exists) return alert('User metadata missing');

  const rows = readTableRows();
  if (rows.length === 0) return alert('Add at least one row');

  const entry = {
    createdBy: user.uid,
    creatorEmail: user.email,
    floor: floorSelect.value,
    counter: counterSelect.value,
    date: entryDate.value || new Date().toISOString().slice(0,10),
    rows,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  await db.collection('entries').add(entry);
  alert('Saved');
  loadMyEntries();
});

/* ----------------------------------------------------------
   LOAD MY ENTRIES (counter)
----------------------------------------------------------- */
async function loadMyEntries(){
  historyDiv.innerHTML = "";
  const user = auth.currentUser;
  const snap = await db.collection('entries').where('createdBy','==',user.uid)
    .orderBy('timestamp','desc').limit(50).get();
  snap.forEach(doc=>{
    const d = doc.data();
    const div = document.createElement('div'); div.className='entry';
    div.innerHTML = `<strong>${d.counter} — ${d.date}</strong><br>${d.rows.length} items
      <div style="margin-top:6px"><button onclick="downloadEntryPdf('${doc.id}')">Download PDF</button></div>`;
    historyDiv.appendChild(div);
  });
}

/* ----------------------------------------------------------
   PDF FUNCTIONS (improved formatting)
----------------------------------------------------------- */
async function downloadEntryPdf(id) {
  const docRef = await db.collection('entries').doc(id).get();
  if (!docRef.exists) return alert('Entry not found');
  generatePdfFromEntry(docRef.data());
}

pdfBtn.addEventListener('click', ()=>{
  const entry = {
    floor: floorSelect.value,
    counter: counterSelect.value,
    date: entryDate.value || new Date().toISOString().slice(0,10),
    rows: readTableRows(),
    creatorEmail: auth.currentUser ? auth.currentUser.email : 'unknown'
  };
  if (entry.rows.length === 0) return alert('Add at least one row to export');
  generatePdfFromEntry(entry);
});

function generatePdfFromEntry(entry) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p','pt','a4');
  const margin = 40;

  // load logo (logo.png in repo root)
  const img = new Image();
  img.src = './logo.png';

  img.onload = function(){
    doc.addImage(img,'PNG',margin,18,120,36);
    addHeaderAndTable();
  };
  img.onerror = function(){ addHeaderAndTable(); };

  function addHeaderAndTable(){
    // Title
    doc.setFontSize(14);
    doc.setFont('helvetica','bold');
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.text('Dry Store Stock Record', pageWidth/2, 60, { align: 'center' });

    // Project / meta
    doc.setFontSize(10);
    doc.setFont('helvetica','normal');
    doc.text('Project: Konarak F&B — Cognizant 12A, Mindspace, Hyderabad', margin, 90);
    doc.text(`Floor: ${entry.floor}    Counter: ${entry.counter}    Date: ${entry.date}`, margin, 108);

    // Table
    const columns = [
      { header: 'Item', dataKey: 'item' },
      { header: 'Batch No', dataKey: 'batch' },
      { header: 'Receiving Date', dataKey: 'receivingDate' },
      { header: 'Mfg Date', dataKey: 'mfgDate' },
      { header: 'Expiry', dataKey: 'expiryDate' },
      { header: 'Shelf Life', dataKey: 'shelfLife' },
      { header: 'Stock Qty', dataKey: 'qty' },
      { header: 'Remarks', dataKey: 'remarks' }
    ];

    const rows = entry.rows.map(r=>({
      item: r.item || '',
      batch: r.batch || '',
      receivingDate: r.receivingDate || '',
      mfgDate: r.mfgDate || '',
      expiryDate: r.expiryDate || '',
      shelfLife: r.shelfLife || '',
      qty: r.qty || '',
      remarks: r.remarks || ''
    }));

    doc.autoTable({
      startY: 130,
      margin: { left: margin, right: margin },
      head: [columns.map(c=>c.header)],
      body: rows.map(rr => columns.map(c => rr[c.dataKey])),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [230,230,230], halign:'left' },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { cellWidth: 60 },
        2: { cellWidth: 70 },
        3: { cellWidth: 60 },
        4: { cellWidth: 60 },
        5: { cellWidth: 60 },
        6: { cellWidth: 40 },
        7: { cellWidth: 100 }
      },
      tableWidth: 'auto'
    });

    const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 160;
    doc.setFontSize(10);
    doc.text(`Prepared by: ${entry.creatorEmail}`, margin, finalY + 30);

    // save
    const safeName = `DryStore_${entry.counter.replace(/\s+/g,'')}_${entry.date}.pdf`;
    doc.save(safeName);
  }
}

/* ----------------------------------------------------------
   MANAGER: load all entries
----------------------------------------------------------- */
refreshView.addEventListener('click', loadAllEntries);
async function loadAllEntries(){
  allEntries.innerHTML = "";
  let q = db.collection('entries').orderBy('timestamp','desc').limit(200);
  if (viewFloor.value && viewFloor.value !== 'all') q = q.where('floor','==',viewFloor.value);
  if (viewCounter.value && viewCounter.value !== 'all') {
    q = q.where('counter','==',viewCounter.value);
  }
  const snap = await q.get();
  snap.forEach(doc=>{
    const d = doc.data();
    const div = document.createElement('div'); div.className='entry';
    div.innerHTML = `<strong>${d.counter} (${d.floor}) — ${d.date}</strong><br>${d.rows.length} items
      <div style="margin-top:6px"><button onclick="downloadEntryPdf('${doc.id}')">Download PDF</button></div>`;
    allEntries.appendChild(div);
  });
}

/* ----------------------------------------------------------
   CREATE USER (admin) -- uses Identity Toolkit REST so current session is NOT changed
   This avoids the SDK createUserWithEmailAndPassword which signs in the created user.
----------------------------------------------------------- */
createUserBtn.addEventListener('click', async ()=>{
  createMsg.textContent = "";
  const email = (newEmail.value || "").trim();
  const password = (newPassword.value || "").trim();
  const role = newRole.value;
  const floor = newFloor.value;
  const counter = newAssignCounter.value;

  if (!email || !password) { createMsg.textContent = "Provide email and password"; return; }
  if (!role) { createMsg.textContent = "Select role"; return; }
  if (role === 'counter' && (!floor || !counter)) { createMsg.textContent = "Assign floor & counter for counter role"; return; }

  try {
    // call REST API to create user without modifying client auth state
    const apiKey = firebaseConfig.apiKey;
    const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message || 'Failed to create user');

    const uid = data.localId; // returned UID
    // create users doc
    await db.collection('users').doc(uid).set({
      email, role, floor: floor || '', counter: counter || '', createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    createMsg.style.color = 'green';
    createMsg.textContent = 'User created successfully';
    newEmail.value = ''; newPassword.value = '';
  } catch (e) {
    createMsg.style.color = 'red';
    createMsg.textContent = e.message || 'Error creating user';
  }
});

/* ----------------------------------------------------------
   INIT: populate selects, add initial rows
----------------------------------------------------------- */
floorSelect.addEventListener('change', populateCounterSelect);
newFloor.addEventListener('change', ()=> populateAssignCounterSelect(newFloor.value));
viewFloor.addEventListener('change', loadAllEntries);

function init() {
  // populate selects
  populateCounterSelect();
  populateAssignCounterSelect(newFloor.value);
  // add initial editable rows
  addEmptyRow(); addEmptyRow();
  // set today's date default in entryDate
  entryDate.value = new Date().toISOString().slice(0,10);
}
init();

/* ----------------------------------------------------------
   Expose helpers for buttons created dynamically
----------------------------------------------------------- */
window.downloadEntryPdf = downloadEntryPdf;
window.generatePdfFromEntry = generatePdfFromEntry;
