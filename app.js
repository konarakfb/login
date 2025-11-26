// Final app.js — production-ready for your Firestore rules
// Features:
// - Admin creates floors, counters, and counter users
// - Counter users locked to assigned floor+counter, can only add entries for themselves
// - Admin/manager can view all entries
// - PDF & Excel export
// - Debug log panel

/* ---------------- DEBUG HELPERS ---------------- */
function debug(msg) {
  console.log(msg);
  try {
    const el = document.getElementById('debugLog');
    if (el) {
      const time = new Date().toLocaleTimeString();
      el.textContent = `${time} — ${msg}\n` + el.textContent;
    }
  } catch (e) { console.log('debug write failed', e); }
}

function setText(id, text, color) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.color = color || 'red';
  el.textContent = text || '';
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

/* Initialize firebase (compat) */
try { firebase.initializeApp(firebaseConfig); } catch(e) { debug('firebase init: ' + e.message); }
const auth = firebase.auth();
const db = firebase.firestore();

/* ---------------- DOMContentLoaded ---------------- */
document.addEventListener('DOMContentLoaded', async () => {
  debug('DOM ready — initializing app');
  try {
    await ensureDefaults();          
    await loadFloorsAndCountersToUI();
    wireEvents();
    document.getElementById('entryDate').value = new Date().toISOString().slice(0,10);
  } catch (e) {
    debug('Init error: ' + (e.message || e));
  }
});

/* ---------------- Ensure defaults ---------------- */
async function ensureDefaults() {
  try {
    const fSnap = await db.collection('floors').limit(1).get();
    if (fSnap.empty) {
      debug('Creating default floors');
      await db.collection('floors').add({ name: '1st' }).catch(e => debug('floors create denied: ' + e.message));
      await db.collection('floors').add({ name: '6th' }).catch(e => debug('floors create denied: ' + e.message));
    }

    const cSnap = await db.collection('counters').limit(1).get();
    if (cSnap.empty) {
      debug('Creating default counters');
      const defaults = [
        { name: 'Kitchen', floor: '1st' }, { name: 'Chana & Corn', floor: '1st' },
        { name: 'Juice', floor: '1st' }, { name: 'Tea', floor: '1st' },
        { name: 'Bread', floor: '1st' }, { name: 'Chat', floor: '1st' },
        { name: 'Shawarma', floor: '1st' }, { name: 'Kitchen', floor: '6th' },
        { name: 'Tea', floor: '6th' }, { name: 'Muntha Masala', floor: '6th' }
      ];
      for (const c of defaults) {
        await db.collection('counters').add(c).catch(e => debug('counters create denied: ' + e.message));
      }
    }

  } catch (e) {
    debug('ensureDefaults read error: ' + e.message);
  }
}

/* ---------------- Wire UI events ---------------- */
function wireEvents() {
  document.getElementById('loginBtn').addEventListener('click', loginHandler);
  document.getElementById('logoutBtn').addEventListener('click', ()=> auth.signOut().then(()=> debug('Signed out')));

  document.getElementById('addRowBtn').addEventListener('click', addEmptyRow);
  document.getElementById('saveEntryBtn').addEventListener('click', saveEntryHandler);
  document.getElementById('pdfBtn').addEventListener('click', exportPdfFromUI);
  document.getElementById('excelBtn').addEventListener('click', exportExcelFromUI);

  document.getElementById('createFloorBtn').addEventListener('click', createFloorHandler);
  document.getElementById('createCounterBtn').addEventListener('click', createCounterHandler);
  document.getElementById('createUserBtn').addEventListener('click', createCounterUserHandler);

  document.getElementById('viewFloor').addEventListener('change', async () => { 
    await reloadViewCounters(); 
    await loadAllEntries(); 
  });

  document.getElementById('refreshView').addEventListener('click', async ()=> loadAllEntries());
  document.getElementById('downloadFilteredExcel').addEventListener('click', async ()=> downloadFilteredExcel());
  document.getElementById('newFloor').addEventListener('change', async ()=> populateAssignCounterOptions(document.getElementById('newFloor').value));
}

/* ---------------- Auth state listener ---------------- */
auth.onAuthStateChanged(async (user) => {
  debug('onAuthStateChanged → ' + (user ? user.email : 'null'));

  document.getElementById('auth-section').classList.remove('hidden');
  document.getElementById('app-section').classList.add('hidden');

  if (!user) return;

  try {
    const metaDoc = await db.collection('users').doc(user.uid).get();

    if (!metaDoc.exists) {
      debug('users/{uid} missing → showing admin UI to create doc');
      document.getElementById('auth-section').classList.add('hidden');
      document.getElementById('app-section').classList.remove('hidden');
      await showManagerUI();
      return;
    }

    const meta = metaDoc.data();
    document.getElementById('who').textContent = `${meta.role.toUpperCase()} — ${meta.counter} (${meta.floor})`;

    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('app-section').classList.remove('hidden');

    if (meta.role === 'counter') {
      await showCounterUI(meta, user.uid);
    } else {
      await showManagerUI();
    }

  } catch (e) {
    debug('Auth error: ' + e.message);
  }
});

/* ---------------- Load floors/counters into UI ---------------- */
async function loadFloorsAndCountersToUI() {
  try {
    debug('Loading floors & counters');

    const floorsSnap = await db.collection('floors').orderBy('name').get();
    const floors = floorsSnap.docs.map(d => d.data().name);

    const floorSelect = document.getElementById('floorSelect');
    const viewFloor = document.getElementById('viewFloor');
    const newFloor = document.getElementById('newFloor');
    const selectFloorForCounter = document.getElementById('selectFloorForCounter');

    [floorSelect, viewFloor, newFloor, selectFloorForCounter].forEach(sel => {
      sel.innerHTML = '';
      if (sel.id === 'viewFloor') sel.appendChild(new Option('All Floors','all'));
      floors.forEach(f => sel.appendChild(new Option(f, f)));
    });

    if (floors.length) {
      if (!floorSelect.value) floorSelect.value = floors[0];
      if (!newFloor.value) newFloor.value = floors[0];
      if (!selectFloorForCounter.value) selectFloorForCounter.value = floors[0];
    }

    await populateCountersForFloor(floorSelect.value);
    await populateViewCounterOptions();
    await populateAssignCounterOptions(newFloor.value);

  } catch (e) {
    debug('loadFloorsAndCounters error: ' + e.message);
  }
}

async function populateCountersForFloor(floor) {
  const sel = document.getElementById('counterSelect');
  sel.innerHTML = '';
  const snap = await db.collection('counters').where('floor','==',floor).orderBy('name').get();
  snap.forEach(d => sel.appendChild(new Option(d.data().name, d.data().name)));
}

async function populateViewCounterOptions() {
  const sel = document.getElementById('viewCounter');
  sel.innerHTML = '<option value="all">All Counters</option>';
  const snap = await db.collection('counters').orderBy('floor').orderBy('name').get();
  snap.forEach(d => sel.appendChild(new Option(`${d.data().name} (${d.data().floor})`, d.data().name)));
}

async function populateAssignCounterOptions(floor) {
  const sel = document.getElementById('newAssignCounter');
  sel.innerHTML = '';
  const snap = await db.collection('counters').where('floor','==',floor).orderBy('name').get();
  snap.forEach(d => sel.appendChild(new Option(d.data().name, d.data().name)));
}

async function reloadViewCounters() {
  const vf = document.getElementById('viewFloor').value;
  if (vf === 'all') return populateViewCounterOptions();
  const sel = document.getElementById('viewCounter');
  sel.innerHTML = '<option value="all">All Counters</option>';
  const snap = await db.collection('counters').where('floor','==',vf).orderBy('name').get();
  snap.forEach(d => sel.appendChild(new Option(d.data().name, d.data().name)));
}

/* ---------------- Table helpers ---------------- */
function addEmptyRow() {
  const tbody = document.querySelector('#stockTable tbody');
  const tr = document.createElement('tr');
  for (let i=0;i<9;i++) {
    const td = document.createElement('td');
    td.contentEditable = true;
    td.innerHTML = '';
    tr.appendChild(td);
  }
  tbody.appendChild(tr);
}

function readTableRows() {
  const rows = [];
  const trs = document.querySelectorAll('#stockTable tbody tr');
  let sno = 1;

  trs.forEach(tr => {
    const cells = [...tr.children].map(td => td.textContent.trim());
    if (cells.every(c => c === '')) return;

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

/* ---------------- Login ---------------- */
async function loginHandler() {
  setText('loginError','');
  const email = document.getElementById('email').value.trim();
  const pass = document.getElementById('password').value;

  try {
    await auth.signInWithEmailAndPassword(email, pass);
    debug('Login success: ' + email);
  } catch (e) {
    debug('Login error: ' + e.message);
    setText('loginError', e.message);
  }
}

/* ---------------- SHOW UI ---------------- */
async function showManagerUI() {
  debug('Showing admin UI');
  document.getElementById('counter-ui').classList.add('hidden');
  document.getElementById('manager-ui').classList.remove('hidden');
  await loadFloorsAndCountersToUI();
  document.getElementById('viewFloor').value = 'all';
  await populateViewCounterOptions();
  await loadAllEntries();
}

async function showCounterUI(meta, uid) {
  debug('Showing counter UI for ' + meta.counter);
  document.getElementById('manager-ui').classList.add('hidden');
  document.getElementById('counter-ui').classList.remove('hidden');

  await loadFloorsAndCountersToUI();

  document.getElementById('floorSelect').value = meta.floor;
  await populateCountersForFloor(meta.floor);
  document.getElementById('counterSelect').value = meta.counter;

  document.getElementById('floorSelect').disabled = true;
  document.getElementById('counterSelect').disabled = true;

  document.querySelector('#stockTable tbody').innerHTML = '';
  addEmptyRow(); addEmptyRow();
  await loadMyEntries(uid);
}

/* ---------------- SAVE ENTRY ---------------- */
async function saveEntryHandler() {
  try {
    const user = auth.currentUser;
    if (!user) return alert('Not signed in');

    const userDoc = await db.collection('users').doc(user.uid).get();
    if (!userDoc.exists) return alert('User metadata missing');

    const u = userDoc.data();

    const rows = readTableRows();
    if (rows.length === 0) return alert('Add at least one row');

    const selFloor = document.getElementById('floorSelect').value;
    const selCounter = document.getElementById('counterSelect').value;

    if (u.role === 'counter' && (u.floor !== selFloor || u.counter !== selCounter)) {
      return alert('You can only submit entries for your assigned floor & counter.');
    }

    await db.collection('entries').add({
      createdBy: user.uid,
      creatorEmail: user.email,
      floor: selFloor,
      counter: selCounter,
      date: document.getElementById('entryDate').value || new Date().toISOString().slice(0,10),
      rows,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert('Saved');
    await loadMyEntries(user.uid);

  } catch (e) {
    debug('saveEntryHandler: ' + e.message);
    alert('Save failed: ' + e.message);
  }
}

/* ---------------- LOAD ENTRIES ---------------- */
async function loadMyEntries(uid) {
  const div = document.getElementById('history');
  div.innerHTML = '';

  const snap = await db.collection('entries')
    .where('createdBy','==',uid)
    .orderBy('timestamp','desc')
    .limit(50)
    .get();

  snap.forEach(doc => {
    const d = doc.data();
    const el = document.createElement('div');
    el.className = 'entry';
    el.innerHTML = `
      <strong>${d.counter} — ${d.date}</strong><br>${d.rows.length} items
      <div style="margin-top:6px">
        <button onclick="window.downloadEntryPdf('${doc.id}')">Download PDF</button>
        <button onclick="window.downloadEntryExcel('${doc.id}')">Download Excel</button>
      </div>
    `;
    div.appendChild(el);
  });
}

async function loadAllEntries() {
  const container = document.getElementById('allEntries');
  container.innerHTML = '';

  let q = db.collection('entries').orderBy('timestamp','desc');
  const floor = document.getElementById('viewFloor').value;
  const counter = document.getElementById('viewCounter').value;

  if (floor !== 'all') q = q.where('floor','==',floor);
  if (counter !== 'all') q = q.where('counter','==',counter);

  const snap = await q.get();

  snap.forEach(doc => {
    const d = doc.data();
    const el = document.createElement('div');
    el.className = 'entry';
    el.innerHTML = `
      <strong>${d.counter} (${d.floor}) — ${d.date}</strong><br>${d.rows.length} items
      <div style="margin-top:6px">
        <button onclick="window.downloadEntryPdf('${doc.id}')">Download PDF</button>
        <button onclick="window.downloadEntryExcel('${doc.id}')">Download Excel</button>
      </div>
    `;
    container.appendChild(el);
  });
}

/* ---------------- PDF EXPORT ---------------- */
function generatePdfFromEntry(entry) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p','pt','a4');
    const margin = 36;

    const img = new Image();
    img.src = './logo.png';

    img.onload = function() {
      doc.setDrawColor(0);
      doc.setLineWidth(1);

      doc.rect(margin, 18, 523, 70);
      doc.rect(margin+6, 24, 140, 56);
      doc.addImage(img, 'PNG', margin+10, 28, 132, 48);

      doc.setFontSize(12);
      doc.text('Dry Store Stock Record', margin+160, 36);
      doc.setFontSize(9);
      doc.text('Project: Konarak F&B — Cognizant 12A, Mindspace, Hyderabad', margin+160, 52);
      doc.text(`Date: ${entry.date}`, margin, 100);

      const columns = ['S.No','Items','Batch No','Receiving Date','Mfg Date','Expiry Date','Shelf Life','Stock Quantity','Remarks'];
      const rows = entry.rows.map((r,i)=>[i+1, r.item || '', r.batch || '', r.receivingDate || '', r.mfgDate || '', r.expiryDate || '', r.shelfLife || '', r.qty || '', r.remarks || '']);

      doc.autoTable({
        head: [columns],
        body: rows,
        startY: 120,
        margin: {left:margin, right:margin},
        styles: {fontSize: 9}
      });

      doc.save(`DryStore_${entry.counter}_${entry.date}.pdf`);
    };

    img.onerror = function() {
      debug('logo missing — plain PDF');
      doc.text('Dry Store Stock Record', 40, 40);
      doc.save(`DryStore_${entry.counter}_${entry.date}.pdf`);
    };

  } catch (e) {
    debug('PDF error: ' + e.message);
  }
}

async function downloadEntryPdf(id) {
  const docSnap = await db.collection('entries').doc(id).get();
  if (!docSnap.exists) return alert('Entry not found');
  generatePdfFromEntry(docSnap.data());
}

/* ---------------- EXCEL EXPORT ---------------- */
function exportJsonToExcel(jsonRows, filename) {
  const ws = XLSX.utils.json_to_sheet(jsonRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filename);
}

async function downloadEntryExcel(id) {
  const docSnap = await db.collection('entries').doc(id).get();
  if (!docSnap.exists) return alert('Entry not found');
  const d = docSnap.data();
  const rows = d.rows.map((r,i)=>({
    'S.No': i+1,
    'Item': r.item,
    'Batch No': r.batch,
    'Receiving Date': r.receivingDate,
    'Mfg Date': r.mfgDate,
    'Expiry Date': r.expiryDate,
    'Shelf Life': r.shelfLife,
    'Stock Qty': r.qty,
    'Remarks': r.remarks
  }));
  exportJsonToExcel(rows, `DryStore_${d.counter}_${d.date}.xlsx`);
}

async function downloadFilteredExcel() {
  const floor = document.getElementById('viewFloor').value;
  const counter = document.getElementById('viewCounter').value;
  const from = document.getElementById('fromDate').value;
  const to = document.getElementById('toDate').value;

  let q = db.collection('entries').orderBy('timestamp','desc');
  if (floor !== 'all') q = q.where('floor','==',floor);
  if (counter !== 'all') q = q.where('counter','==',counter);

  const snap = await q.get();
  const rows = [];

  snap.forEach(doc => {
    const d = doc.data();
    if (from && d.date < from) return;
    if (to && d.date > to) return;

    d.rows.forEach((r,i)=> {
      rows.push({
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

  if (rows.length === 0) return alert('No matching records');

  exportJsonToExcel(rows,
    `DryStore_Export_${floor === 'all' ? 'AllFloors' : floor}_${counter}.xlsx`
  );
}

/* ---------------- CREATE FLOOR / COUNTER / USER ---------------- */
async function createFloorHandler() {
  try {
    setText('nodeMsg','');
    const name = document.getElementById('newFloorName').value.trim();
    if (!name) return setText('nodeMsg','Enter floor name');

    const exist = await db.collection('floors').where('name','==',name).get();
    if (!exist.empty) return setText('nodeMsg','Floor already exists');

    await db.collection('floors').add({ name });
    setText('nodeMsg','Floor created','green');
    document.getElementById('newFloorName').value = '';
    await loadFloorsAndCountersToUI();
  } catch (e) {
    setText('nodeMsg','Error: '+e.message);
  }
}

async function createCounterHandler() {
  try {
    setText('nodeMsg','');
    const floor = document.getElementById('selectFloorForCounter').value;
    const name = document.getElementById('newCounterNameField').value.trim();
    if (!name) return setText('nodeMsg','Enter counter name');

    const exist = await db.collection('counters')
      .where('name','==',name)
      .where('floor','==',floor)
      .get();

    if (!exist.empty) return setText('nodeMsg','Counter exists for this floor');

    await db.collection('counters').add({ name, floor });
    setText('nodeMsg','Counter created','green');
    document.getElementById('newCounterNameField').value = '';
    await loadFloorsAndCountersToUI();

  } catch (e) {
    setText('nodeMsg','Error: '+e.message);
  }
}

async function createCounterUserHandler() {
  try {
    setText('createMsg','');

    const email = document.getElementById('newEmail').value.trim();
    const password = document.getElementById('newPassword').value.trim();
    const floor = document.getElementById('newFloor').value;
    const counter = document.getElementById('newAssignCounter').value;

    if (!email || !password) return setText('createMsg','Provide email & password');
    if (!floor || !counter) return setText('createMsg','Select floor & counter');

    const apiKey = firebaseConfig.apiKey;

    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true })
      }
    );

    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    const uid = data.localId;

    await db.collection('users').doc(uid).set({
      email,
      role: 'counter',
      floor,
      counter,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    setText('createMsg','Counter user created','green');
    document.getElementById('newEmail').value = '';
    document.getElementById('newPassword').value = '';

  } catch (e) {
    setText('createMsg','Error: '+e.message);
  }
}

/* ---------------- Expose PDF/Excel functions ---------------- */
window.downloadEntryPdf = downloadEntryPdf;
window.downloadEntryExcel = downloadEntryExcel;

/* ---------------- END OF FILE ---------------- */
