/* ----------------------------------------------------------
   FIREBASE CONFIG  (Compat version) - update if needed
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
   UI references
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
const excelBtn = document.getElementById('excelBtn');
const stockTableBody = document.querySelector('#stockTable tbody');
const historyDiv = document.getElementById('history');

const managerUI = document.getElementById('manager-ui');
const counterUI = document.getElementById('counter-ui');

const viewFloor = document.getElementById('viewFloor');
const viewCounter = document.getElementById('viewCounter');
const refreshView = document.getElementById('refreshView');
const allEntries = document.getElementById('allEntries');
const fromDate = document.getElementById('fromDate');
const toDate = document.getElementById('toDate');
const downloadFilteredExcel = document.getElementById('downloadFilteredExcel');

const newFloorName = document.getElementById('newFloorName');
const createFloorBtn = document.getElementById('createFloorBtn');
const selectFloorForCounter = document.getElementById('selectFloorForCounter');
const newCounterNameField = document.getElementById('newCounterNameField');
const createCounterBtn = document.getElementById('createCounterBtn');
const nodeMsg = document.getElementById('nodeMsg');

const newEmail = document.getElementById('newEmail');
const newPassword = document.getElementById('newPassword');
const newRole = document.getElementById('newRole');
const newFloor = document.getElementById('newFloor');
const newAssignCounter = document.getElementById('newAssignCounter');
const createUserBtn = document.getElementById('createUserBtn');
const createMsg = document.getElementById('createMsg');

/* ----------------------------------------------------------
   INIT
----------------------------------------------------------- */
(async function init(){
  await ensureDefaults();
  await loadFloorsAndCountersToUI();
  entryDate.value = new Date().toISOString().slice(0,10);
  addEmptyRow(); addEmptyRow();
})();

/* ----------------------------------------------------------
   Ensure default floors & counters exist
----------------------------------------------------------- */
async function ensureDefaults(){
  const floorSnap = await db.collection('floors').limit(1).get();
  if (floorSnap.empty) {
    await db.collection('floors').add({ name: '1st' });
    await db.collection('floors').add({ name: '6th' });
  }
  const countersSnap = await db.collection('counters').limit(1).get();
  if (countersSnap.empty) {
    const defaults = [
      { name: 'Kitchen', floor: '1st' },
      { name: 'Chana & Corn', floor: '1st' },
      { name: 'Juice', floor: '1st' },
      { name: 'Tea', floor: '1st' },
      { name: 'Bread', floor: '1st' },
      { name: 'Chat', floor: '1st' },
      { name: 'Shawarma', floor: '1st' },
      { name: 'Kitchen', floor: '6th' },
      { name: 'Tea', floor: '6th' },
      { name: 'Muntha Masala', floor: '6th' }
    ];
    for (const c of defaults) await db.collection('counters').add(c);
  }
}

/* ----------------------------------------------------------
   Load floors & counters into UI selects reliably
----------------------------------------------------------- */
async function loadFloorsAndCountersToUI() {
  // Load floors
  const floorSnap = await db.collection("floors").orderBy("name").get();
  const floors = floorSnap.docs.map(d => d.data().name);

  // Update all floor dropdowns
  const floorDropdowns = [floorSelect, viewFloor, newFloor, selectFloorForCounter];
  floorDropdowns.forEach(sel => {
    sel.innerHTML = "";
    if (sel === viewFloor) sel.appendChild(new Option('All Floors','all'));
    floors.forEach(f => sel.appendChild(new Option(f, f)));
  });

  // Defaults
  if (!floorSelect.value && floors[0]) floorSelect.value = floors[0];
  if (!newFloor.value && floors[0]) newFloor.value = floors[0];
  if (!selectFloorForCounter.value && floors[0]) selectFloorForCounter.value = floors[0];

  // Load counters for current selections
  await populateCountersForFloor(floorSelect.value);
  await populateViewCounterOptions();
  await populateAssignCounterOptions(newFloor.value);
  await populateAssignCounterOptionsForAdminCounterCreate(selectFloorForCounter.value);
}

/* populate counters for a floor into counterSelect */
async function populateCountersForFloor(floor){
  counterSelect.innerHTML = '';
  const snap = await db.collection('counters').where('floor','==',floor).orderBy('name').get();
  snap.forEach(d => counterSelect.appendChild(new Option(d.data().name, d.data().name)));
}

/* populate viewCounter options for manager filter */
async function populateViewCounterOptions(){
  viewCounter.innerHTML = '<option value="all">All Counters</option>';
  const snap = await db.collection('counters').orderBy('floor').orderBy('name').get();
  snap.forEach(d => {
    const c = d.data();
    viewCounter.appendChild(new Option(`${c.name} (${c.floor})`, c.name));
  });
}

/* populate newAssignCounter for Create User form */
async function populateAssignCounterOptions(floor) {
  newAssignCounter.innerHTML = '';
  const snap = await db.collection('counters')
    .where('floor','==',floor)
    .orderBy('name').get();
  snap.forEach(d => newAssignCounter.appendChild(new Option(d.data().name, d.data().name)));
}

/* populate counters for admin "create counter" UI */
async function populateAssignCounterOptionsForAdminCounterCreate(floor) {
  // used for the selectFloorForCounter -> no reuse of newAssignCounter here
  // but keep selectFloorForCounter listing updated elsewhere
  // (function kept for clarity)
  // nothing to fill here (we use selectFloorForCounter + newCounterNameField)
}

/* reload view counters according to viewFloor filter */
async function reloadViewCounters(){
  if (viewFloor.value === 'all') return populateViewCounterOptions();
  viewCounter.innerHTML = '<option value="all">All Counters</option>';
  const snap = await db.collection('counters').where('floor','==',viewFloor.value).orderBy('name').get();
  snap.forEach(d => viewCounter.appendChild(new Option(d.data().name, d.data().name)));
}

/* wire events for floor changes */
floorSelect.addEventListener('change', async ()=> await populateCountersForFloor(floorSelect.value));
newFloor.addEventListener('change', async ()=> await populateAssignCounterOptions(newFloor.value));
selectFloorForCounter.addEventListener('change', async ()=> {
  // no extra counters list required; just keep UI consistent
});
viewFloor.addEventListener('change', async ()=> { await reloadViewCounters(); loadAllEntries(); });

/* ----------------------------------------------------------
   Table helpers
----------------------------------------------------------- */
function addEmptyRow(){
  const tr = document.createElement('tr');
  for (let i=0;i<9;i++){
    const td = document.createElement('td');
    td.contentEditable = true;
    td.innerHTML = '';
    tr.appendChild(td);
  }
  stockTableBody.appendChild(tr);
}
addRowBtn.addEventListener('click', addEmptyRow);

function readTableRows(){
  const rows = [];
  const trs = stockTableBody.querySelectorAll('tr');
  let sno = 1;
  trs.forEach(tr=>{
    const cells = [...tr.children].map(td => td.textContent.trim());
    if (cells.every(c=>c==='')) return;
    rows.push({
      sno: sno++,
      item: cells[1] || cells[0] || '',
      batch: cells[2] || '',
      receivingDate: cells[3] || '',
      mfgDate: cells[4] || '',
      expiryDate: cells[5] || '',
      shelfLife: cells[6] || '',
      qty: cells[7] || '',
      remarks: cells[8] || ''
    });
  });
  return rows;
}

/* ----------------------------------------------------------
   Authentication and safe onAuthStateChanged
----------------------------------------------------------- */
loginBtn.addEventListener('click', async ()=>{
  loginError.textContent = '';
  const email = document.getElementById('email').value.trim();
  const pass = document.getElementById('password').value;
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (e) {
    loginError.textContent = e.message;
  }
});
logoutBtn.addEventListener('click', ()=> auth.signOut());

auth.onAuthStateChanged(async (user) => {
  // Always show login initially
  authSection.classList.remove('hidden');
  appSection.classList.add('hidden');

  if (!user) return; // user not signed in

  // Signed in -> fetch user meta
  const metaDoc = await db.collection('users').doc(user.uid).get();
  if (!metaDoc.exists) {
    who.textContent = `${user.email} (no role)`;
    authSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    await showManagerUI(); // allow admin to create their user doc
    return;
  }

  const meta = metaDoc.data();
  who.textContent = `${meta.role.toUpperCase()} — ${meta.counter || ''} (${meta.floor || ''})`;

  authSection.classList.add('hidden');
  appSection.classList.remove('hidden');

  if (meta.role === 'counter') await showCounterUI(meta);
  else await showManagerUI();
});

/* ----------------------------------------------------------
   Show manager UI
----------------------------------------------------------- */
async function showManagerUI(){
  managerUI.classList.remove('hidden');
  counterUI.classList.add('hidden');

  await loadFloorsAndCountersToUI();
  viewFloor.value = 'all';
  await populateViewCounterOptions();
  loadAllEntries();
}

/* ----------------------------------------------------------
   Show counter UI (lock floor/counter)
----------------------------------------------------------- */
async function showCounterUI(meta){
  managerUI.classList.add('hidden');
  counterUI.classList.remove('hidden');

  await loadFloorsAndCountersToUI();

  if (meta.floor) floorSelect.value = meta.floor;
  await populateCountersForFloor(floorSelect.value);
  if (meta.counter) counterSelect.value = meta.counter;

  floorSelect.disabled = true;
  counterSelect.disabled = true;

  stockTableBody.innerHTML = '';
  addEmptyRow(); addEmptyRow();
  entryDate.value = new Date().toISOString().slice(0,10);
  loadMyEntries();
}

/* ----------------------------------------------------------
   Save entry (counter)
----------------------------------------------------------- */
saveEntryBtn.addEventListener('click', async ()=>{
  const user = auth.currentUser;
  if (!user) return alert('Not signed in');
  const metaDoc = await db.collection('users').doc(user.uid).get();
  if (!metaDoc.exists) return alert('User metadata missing');

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
   Load my entries (counter)
----------------------------------------------------------- */
async function loadMyEntries(){
  historyDiv.innerHTML = '';
  const user = auth.currentUser;
  const snap = await db.collection('entries').where('createdBy','==',user.uid)
    .orderBy('timestamp','desc').limit(50).get();
  snap.forEach(doc=>{
    const d = doc.data();
    const div = document.createElement('div'); div.className = 'entry';
    div.innerHTML = `<strong>${d.counter} — ${d.date}</strong><br>${d.rows.length} items
      <div style="margin-top:6px"><button onclick="downloadEntryPdf('${doc.id}')">Download PDF</button>
      <button onclick="downloadEntryExcel('${doc.id}')">Download Excel</button></div>`;
    historyDiv.appendChild(div);
  });
}

/* ----------------------------------------------------------
   PDF generation (try to match sheet)
----------------------------------------------------------- */
async function downloadEntryPdf(id){
  const docRef = await db.collection('entries').doc(id).get();
  if (!docRef.exists) return alert('Entry not found');
  generatePdfFromEntry(docRef.data());
}

function generatePdfFromEntry(entry){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p','pt','a4');
  const margin = 36;
  const pageWidth = doc.internal.pageSize.getWidth();
  const usableWidth = pageWidth - margin*2;

  const img = new Image();
  img.src = './logo.png';

  img.onload = function(){
    doc.setDrawColor(0);
    doc.setLineWidth(1);
    doc.rect(margin, 18, usableWidth, 70);
    doc.rect(margin+6, 24, 140, 56);
    doc.addImage(img,'PNG', margin+10, 28, 132, 48);

    doc.setFontSize(12);
    doc.setFont('helvetica','bold');
    doc.text('Dry Store Stock Record - Dry Store Stock Record', margin+160, 36);
    doc.setFontSize(9);
    doc.setFont('helvetica','normal');
    doc.text('Project: Konarak F&B — Cognizant 12A, Mindspace, Hyderabad', margin+160, 52);
    doc.text(`Date: ${entry.date}`, margin, 100);
    doc.text('Vendor Name:', margin+180, 100);
    doc.text('Vendor Supervisor Name:', margin+420, 100);

    const columns = [
      { header: 'S.No', dataKey: 'sno' },
      { header: 'Items', dataKey: 'item' },
      { header: 'Batch No', dataKey: 'batch' },
      { header: 'Receiving Date', dataKey: 'receivingDate' },
      { header: 'Manufacturing Date', dataKey: 'mfgDate' },
      { header: 'Expiry Date', dataKey: 'expiryDate' },
      { header: 'Shelf Life', dataKey: 'shelfLife' },
      { header: 'Stock Quantity', dataKey: 'qty' },
      { header: 'Remarks', dataKey: 'remarks' }
    ];

    const rows = entry.rows.map((r,i)=>({
      sno: i+1,
      item: r.item||'',
      batch: r.batch||'',
      receivingDate: r.receivingDate||'',
      mfgDate: r.mfgDate||'',
      expiryDate: r.expiryDate||'',
      shelfLife: r.shelfLife||'',
      qty: r.qty||'',
      remarks: r.remarks||''
    }));

    doc.autoTable({
      startY: 120,
      margin: { left: margin, right: margin },
      head: [columns.map(c => c.header)],
      body: rows.map(rr => columns.map(c => rr[c.dataKey])),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [230,230,230] },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 150 },
        2: { cellWidth: 70 },
        3: { cellWidth: 70 },
        4: { cellWidth: 70 },
        5: { cellWidth: 70 },
        6: { cellWidth: 60 },
        7: { cellWidth: 60 },
        8: { cellWidth: 120 }
      },
      didDrawPage: function (data) {
        const finalY = doc.internal.pageSize.height - 72;
        doc.setLineWidth(0.8);
        doc.line(margin, finalY, pageWidth - margin, finalY);
        doc.setFontSize(10);
        doc.text('Vendor PoC:', margin, finalY + 16);
        doc.text('Verified by F&B team:', pageWidth - margin - 170, finalY + 16);
      },
      tableWidth: 'auto'
    });

    doc.save(`DryStore_${entry.counter.replace(/\s+/g,'')}_${entry.date}.pdf`);
  };

  img.onerror = function(){
    alert('logo.png not found in repo root. Upload logo.png to include logo in PDF.');
  };
}

/* ----------------------------------------------------------
   Excel export (SheetJS)
----------------------------------------------------------- */
function exportJsonToExcel(jsonRows, filename) {
  const ws = XLSX.utils.json_to_sheet(jsonRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filename);
}

async function downloadEntryExcel(id) {
  const docRef = await db.collection('entries').doc(id).get();
  if (!docRef.exists) return alert('Entry not found');
  const d = docRef.data();
  const rows = d.rows.map((r,i)=>({
    'S.No': i+1, 'Item': r.item, 'Batch No': r.batch, 'Receiving Date': r.receivingDate,
    'Mfg Date': r.mfgDate, 'Expiry Date': r.expiryDate, 'Shelf Life': r.shelfLife,
    'Stock Qty': r.qty, 'Remarks': r.remarks
  }));
  exportJsonToExcel(rows, `DryStore_${d.counter.replace(/\s+/g,'')}_${d.date}.xlsx`);
}

/* ----------------------------------------------------------
   Manager: load & filtered Excel
----------------------------------------------------------- */
refreshView.addEventListener('click', loadAllEntries);
downloadFilteredExcel.addEventListener('click', async ()=>{
  const floor = viewFloor.value;
  const counter = viewCounter.value;
  const from = fromDate.value;
  const to = toDate.value;

  let q = db.collection('entries').orderBy('timestamp','desc');
  if (floor && floor !== 'all') q = q.where('floor','==',floor);
  if (counter && counter !== 'all') q = q.where('counter','==',counter);

  const snap = await q.get();
  const results = [];
  snap.forEach(doc=>{
    const d = doc.data();
    const entryDateVal = d.date || '';
    if (from && entryDateVal < from) return;
    if (to && entryDateVal > to) return;
    d.rows.forEach((r,i)=>{
      results.push({
        'Entry Date': d.date,
        'Floor': d.floor,
        'Counter': d.counter,
        'S.No': i+1,
        'Item': r.item,
        'Batch No': r.batch,
        'Receiving Date': r.receivingDate,
        'Mfg Date': r.mfgDate,
        'Expiry Date': r.expiryDate,
        'Shelf Life': r.shelfLife,
        'Stock Qty': r.qty,
        'Remarks': r.remarks,
        'Created By': d.creatorEmail
      });
    });
  });
  if (results.length === 0) return alert('No records found for selected filters');
  exportJsonToExcel(results, `DryStore_Export_${floor === 'all' ? 'AllFloors': floor}_${counter || 'All'}.xlsx`);
});

async function loadAllEntries(){
  allEntries.innerHTML = '';
  let q = db.collection('entries').orderBy('timestamp','desc').limit(200);
  if (viewFloor.value && viewFloor.value !== 'all') q = q.where('floor','==',viewFloor.value);
  if (viewCounter.value && viewCounter.value !== 'all') q = q.where('counter','==',viewCounter.value);

  const snap = await q.get();
  snap.forEach(doc=>{
    const d = doc.data();
    const div = document.createElement('div'); div.className = 'entry';
    div.innerHTML = `<strong>${d.counter} (${d.floor}) — ${d.date}</strong><br>${d.rows.length} items
      <div style="margin-top:6px"><button onclick="downloadEntryPdf('${doc.id}')">Download PDF</button>
      <button onclick="downloadEntryExcel('${doc.id}')">Download Excel</button></div>`;
    allEntries.appendChild(div);
  });
}

/* ----------------------------------------------------------
   Create Floor & Counter (Admin)
----------------------------------------------------------- */
createFloorBtn.addEventListener('click', async ()=>{
  nodeMsg.textContent = '';
  const name = (newFloorName.value||'').trim();
  if (!name) { nodeMsg.textContent = 'Enter floor name'; return; }
  const snap = await db.collection('floors').where('name','==',name).get();
  if (!snap.empty) { nodeMsg.textContent = 'Floor already exists'; return; }
  await db.collection('floors').add({ name });
  nodeMsg.style.color = 'green';
  nodeMsg.textContent = 'Floor created';
  newFloorName.value = '';
  await loadFloorsAndCountersToUI();
});

createCounterBtn.addEventListener('click', async ()=>{
  nodeMsg.textContent = '';
  const floor = selectFloorForCounter.value;
  const name = (newCounterNameField.value||'').trim();
  if (!name) { nodeMsg.textContent = 'Enter counter name'; return; }
  const snap = await db.collection('counters').where('name','==',name).where('floor','==',floor).get();
  if (!snap.empty) { nodeMsg.textContent = 'Counter already exists for this floor'; return; }
  await db.collection('counters').add({ name, floor });
  nodeMsg.style.color = 'green';
  nodeMsg.textContent = 'Counter created';
  newCounterNameField.value = '';
  await loadFloorsAndCountersToUI();
});

/* ----------------------------------------------------------
   Create user (admin) WITHOUT changing current session
   - managers/admins do not need floor/counter
   - counters must have floor & counter
----------------------------------------------------------- */
newRole.addEventListener('change', ()=>{
  const role = newRole.value;
  if (role === 'manager' || role === 'admin') {
    // hide selects (visually)
    newFloor.parentElement.style.display = 'none';
    newAssignCounter.parentElement.style.display = 'none';
  } else {
    newFloor.parentElement.style.display = 'block';
    newAssignCounter.parentElement.style.display = 'block';
  }
});

createUserBtn.addEventListener('click', async ()=>{
  createMsg.textContent = '';
  const email = (newEmail.value||'').trim();
  const password = (newPassword.value||'').trim();
  const role = newRole.value;
  const floor = newFloor.value;
  const counter = newAssignCounter.value;

  if (!email || !password) { createMsg.textContent = 'Provide email & password'; return; }
  if (role === 'counter' && (!floor || !counter)) { createMsg.textContent = 'Assign floor & counter for counter role'; return; }

  try {
    // Identity Toolkit REST signUp so current admin session remains
    const apiKey = firebaseConfig.apiKey;
    const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message || 'Could not create user');
    const uid = data.localId;
    await db.collection('users').doc(uid).set({
      email,
      role,
      floor: role === 'counter' ? floor : '',
      counter: role === 'counter' ? counter : '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    createMsg.style.color = 'green';
    createMsg.textContent = `User created: ${email}`;
    newEmail.value = ''; newPassword.value = '';
  } catch (e) {
    createMsg.style.color = 'red';
    createMsg.textContent = e.message || 'Error creating user';
  }
});

/* ----------------------------------------------------------
   Expose helpers
----------------------------------------------------------- */
window.downloadEntryPdf = downloadEntryPdf;
window.downloadEntryExcel = downloadEntryExcel;
