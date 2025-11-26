/* FINAL robust app.js
   - defensive initialization
   - debug log panel
   - resilient Firestore reads/writes
   - reliable floor/counter loading and user creation
*/

/* ----------------------------- DEBUG HELPERS ------------------------------ */
function debug(msg) {
  console.log(msg);
  try {
    const el = document.getElementById('debugLog');
    if (el) {
      const time = new Date().toLocaleTimeString();
      el.textContent = `${time} — ${msg}\n` + el.textContent;
    }
  } catch (e) { console.log('debug panel write failed', e); }
}

function showErrorUI(fieldId, msg) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  el.textContent = msg;
}

/* ----------------------------- DOM READY --------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  debug('DOM ready — initializing app');
  main().catch(err => {
    debug('Fatal init error: ' + (err && err.message ? err.message : String(err)));
    console.error(err);
  });
});

/* ----------------------------- MAIN -------------------------------------- */
async function main() {
  // Validate Firebase available
  if (typeof firebase === 'undefined') {
    debug('Firebase SDK not found. Did you include firebase compat scripts in index.html?');
    throw new Error('Firebase SDK missing');
  }

  // Firebase config (ensure this is your project)
  const firebaseConfig = {
    apiKey: "AIzaSyDFBaRe6jDJwbSoRMpGZiQUB8PNXak0o8E",
    authDomain: "konarak-dry-store.firebaseapp.com",
    projectId: "konarak-dry-store",
    storageBucket: "konarak-dry-store.firebasestorage.app",
    messagingSenderId: "796844296062",
    appId: "1:796844296062:web:addf9694564505f914552f"
  };

  try {
    firebase.initializeApp(firebaseConfig);
  } catch (e) {
    // if already initialized, firebase.initializeApp will throw; that's OK
    debug('Firebase initializeApp: ' + e.message);
  }

  window.auth = firebase.auth();
  window.db = firebase.firestore();

  // wire UI references
  const refs = {};
  [
    'auth-section','app-section','loginBtn','logoutBtn','email','password','loginError',
    'who','floorSelect','counterSelect','entryDate','addRowBtn','saveEntryBtn','pdfBtn','excelBtn',
    'stockTable','history','manager-ui','counter-ui','viewFloor','viewCounter','refreshView','allEntries',
    'fromDate','toDate','downloadFilteredExcel','newFloorName','createFloorBtn','selectFloorForCounter',
    'newCounterNameField','createCounterBtn','nodeMsg','newEmail','newPassword','newRole','newFloor','newAssignCounter','createUserBtn','createMsg'
  ].forEach(id => { refs[id] = document.getElementById(id); });

  // minimal sanity checks
  if (!refs['loginBtn'] || !refs['auth-section']) {
    debug('Critical UI elements missing; check index.html includes correct IDs.');
    throw new Error('UI missing required IDs');
  }

  // wire login
  refs['loginBtn'].addEventListener('click', async () => {
    showErrorUI('loginError', '');
    const email = document.getElementById('email').value.trim();
    const pass = document.getElementById('password').value;
    try {
      await auth.signInWithEmailAndPassword(email, pass);
      debug('Login success for ' + email);
    } catch (e) {
      debug('Login failed: ' + e.message);
      showErrorUI('loginError', e.message);
    }
  });

  refs['logoutBtn'].addEventListener('click', () => {
    auth.signOut().then(()=> debug('Signed out')).catch(e=> debug('Sign out error: '+e.message));
  });

  // safe init: create defaults if needed (wrapped)
  await ensureDefaultsSafe();

  // attach event listeners that require db
  refs['addRowBtn'].addEventListener('click', () => addEmptyRowToTbody());
  refs['saveEntryBtn'].addEventListener('click', saveEntryHandler);
  refs['pdfBtn'].addEventListener('click', exportPdfFromUI);
  refs['excelBtn'].addEventListener('click', exportExcelFromUI);

  refs['createFloorBtn'].addEventListener('click', createFloorHandler);
  refs['createCounterBtn'].addEventListener('click', createCounterHandler);
  refs['createUserBtn'].addEventListener('click', createUserHandler);

  refs['viewFloor'].addEventListener('change', async () => { await reloadViewCounters(); loadAllEntries(); });
  refs['newRole'].addEventListener('change', () => toggleCreateUserRoleUI());

  // when page loads, populate lists (defensive)
  await loadFloorsAndCountersToUI();

  // auth state handling (guarded)
  auth.onAuthStateChanged(async (user) => {
    try {
      debug('auth.onAuthStateChanged → user: ' + (user ? user.email : 'null'));
      // show login first
      document.getElementById('auth-section').classList.remove('hidden');
      document.getElementById('app-section').classList.add('hidden');

      if (!user) return;

      // fetch user meta
      const metaDoc = await db.collection('users').doc(user.uid).get();
      if (!metaDoc.exists) {
        debug('No users/{uid} doc found — showing manager UI so admin can create profile.');
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');
        await showManagerUI();
        return;
      }

      const meta = metaDoc.data();
      document.getElementById('who').textContent = `${meta.role.toUpperCase()} — ${meta.counter||''} (${meta.floor||''})`;

      // now show app and appropriate UI
      document.getElementById('auth-section').classList.add('hidden');
      document.getElementById('app-section').classList.remove('hidden');

      if (meta.role === 'counter') await showCounterUI(meta);
      else await showManagerUI();

    } catch (err) {
      debug('Error in onAuthStateChanged: ' + (err.message || err));
      console.error(err);
    }
  });

  debug('Initialization complete. Waiting for user interaction.');
}

/* ------------------------ SAFELY ENSURE DEFAULTS ------------------------- */
async function ensureDefaultsSafe() {
  try {
    const floorsSnap = await db.collection('floors').limit(1).get();
    if (floorsSnap.empty) {
      debug('No floors found — creating defaults (1st, 6th).');
      await db.collection('floors').add({ name: '1st' });
      await db.collection('floors').add({ name: '6th' });
    }
    const countersSnap = await db.collection('counters').limit(1).get();
    if (countersSnap.empty) {
      debug('No counters found — creating default counters.');
      const defaults = [
        { name: 'Kitchen', floor: '1st' }, { name: 'Chana & Corn', floor: '1st' }, { name: 'Juice', floor: '1st' },
        { name: 'Tea', floor: '1st' }, { name: 'Bread', floor: '1st' }, { name: 'Chat', floor: '1st' }, { name: 'Shawarma', floor: '1st' },
        { name: 'Kitchen', floor: '6th' }, { name: 'Tea', floor: '6th' }, { name: 'Muntha Masala', floor: '6th' }
      ];
      for (const c of defaults) await db.collection('counters').add(c);
    }
  } catch (e) {
    debug('ensureDefaultsSafe error: ' + e.message);
  }
}

/* ------------------------ UI helpers & population ------------------------ */
async function loadFloorsAndCountersToUI() {
  try {
    debug('Loading floors & counters...');
    const floorSnap = await db.collection('floors').orderBy('name').get();
    const floors = floorSnap.docs.map(d => d.data().name || d.id);

    const floorDropdowns = [
      document.getElementById('floorSelect'),
      document.getElementById('viewFloor'),
      document.getElementById('newFloor'),
      document.getElementById('selectFloorForCounter')
    ];

    floorDropdowns.forEach(sel => {
      if (!sel) return;
      sel.innerHTML = '';
      if (sel.id === 'viewFloor') sel.appendChild(new Option('All Floors', 'all'));
      floors.forEach(f => sel.appendChild(new Option(f, f)));
    });

    // defaults
    if (floors.length > 0) {
      if (!document.getElementById('floorSelect').value) document.getElementById('floorSelect').value = floors[0];
      if (!document.getElementById('newFloor').value) document.getElementById('newFloor').value = floors[0];
      if (!document.getElementById('selectFloorForCounter').value) document.getElementById('selectFloorForCounter').value = floors[0];
    }

    // populate counters for currently selected floor
    await populateCountersForFloor(document.getElementById('floorSelect').value);
    await populateViewCounterOptions();
    await populateAssignCounterOptions(document.getElementById('newFloor').value);

    // attach change handlers (idempotent)
    document.getElementById('floorSelect').onchange = async () => { await populateCountersForFloor(document.getElementById('floorSelect').value); };
    document.getElementById('newFloor').onchange = async () => { await populateAssignCounterOptions(document.getElementById('newFloor').value); };
    document.getElementById('selectFloorForCounter').onchange = () => {};

    debug('Floors & counters loaded.');
  } catch (err) {
    debug('loadFloorsAndCountersToUI error: ' + (err.message || err));
    console.error(err);
  }
}

async function populateCountersForFloor(floor) {
  try {
    const sel = document.getElementById('counterSelect');
    sel.innerHTML = '';
    const snap = await db.collection('counters').where('floor','==',floor).orderBy('name').get();
    snap.forEach(d => sel.appendChild(new Option(d.data().name, d.data().name)));
    debug(`populateCountersForFloor(${floor}) loaded ${snap.size} counters.`);
  } catch (e) {
    debug('populateCountersForFloor error: ' + e.message);
  }
}

async function populateViewCounterOptions(){
  try {
    const sel = document.getElementById('viewCounter');
    sel.innerHTML = '<option value="all">All Counters</option>';
    const snap = await db.collection('counters').orderBy('floor').orderBy('name').get();
    snap.forEach(d => {
      const c = d.data();
      sel.appendChild(new Option(`${c.name} (${c.floor})`, c.name));
    });
  } catch (e) { debug('populateViewCounterOptions error: ' + e.message); }
}

async function populateAssignCounterOptions(floor){
  try {
    const sel = document.getElementById('newAssignCounter');
    sel.innerHTML = '';
    const snap = await db.collection('counters').where('floor','==',floor).orderBy('name').get();
    snap.forEach(d => sel.appendChild(new Option(d.data().name, d.data().name)));
  } catch (e) { debug('populateAssignCounterOptions error: ' + e.message); }
}

/* ------------------------ Rows table helpers ----------------------------- */
function addEmptyRowToTbody() {
  const tbody = document.querySelector('#stockTable tbody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  for (let i=0;i<9;i++){
    const td = document.createElement('td');
    td.contentEditable = true;
    td.innerHTML = '';
    tr.appendChild(td);
  }
  tbody.appendChild(tr);
}

function readTableRowsFromUI() {
  const tbody = document.querySelector('#stockTable tbody');
  const rows = [];
  if (!tbody) return rows;
  const trs = tbody.querySelectorAll('tr');
  let sno = 1;
  trs.forEach(tr => {
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

/* ------------------------- Entry save / exports -------------------------- */
async function saveEntryHandler() {
  try {
    const user = auth.currentUser;
    if (!user) { alert('Not signed in'); return; }
    const meta = await db.collection('users').doc(user.uid).get();
    if (!meta.exists) { alert('User metadata missing'); return; }

    const rows = readTableRowsFromUI();
    if (rows.length === 0) { alert('Add at least one row'); return; }

    const entry = {
      createdBy: user.uid,
      creatorEmail: user.email,
      floor: document.getElementById('floorSelect').value,
      counter: document.getElementById('counterSelect').value,
      date: document.getElementById('entryDate').value || new Date().toISOString().slice(0,10),
      rows,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('entries').add(entry);
    debug('Entry saved for ' + entry.counter + ' on ' + entry.date);
    alert('Saved');
    loadMyEntries();
  } catch (e) {
    debug('saveEntryHandler error: ' + e.message);
    alert('Save failed: ' + e.message);
  }
}

async function loadMyEntries() {
  try {
    const div = document.getElementById('history');
    div.innerHTML = '';
    const user = auth.currentUser;
    if (!user) return;
    const snap = await db.collection('entries').where('createdBy','==',user.uid).orderBy('timestamp','desc').limit(50).get();
    snap.forEach(doc => {
      const d = doc.data();
      const wrapper = document.createElement('div');
      wrapper.className = 'entry';
      wrapper.innerHTML = `<strong>${d.counter} — ${d.date}</strong><br>${d.rows.length} items
        <div style="margin-top:6px"><button onclick="window.downloadEntryPdf('${doc.id}')">Download PDF</button>
        <button onclick="window.downloadEntryExcel('${doc.id}')">Download Excel</button></div>`;
      div.appendChild(wrapper);
    });
    debug('Loaded my entries: ' + snap.size);
  } catch (e) {
    debug('loadMyEntries error: ' + e.message);
  }
}

/* --------------------------- PDF & Excel -------------------------------- */
async function exportPdfFromUI() {
  const entry = {
    floor: document.getElementById('floorSelect').value,
    counter: document.getElementById('counterSelect').value,
    date: document.getElementById('entryDate').value || new Date().toISOString().slice(0,10),
    rows: readTableRowsFromUI(),
    creatorEmail: auth.currentUser ? auth.currentUser.email : 'unknown'
  };
  if (entry.rows.length === 0) return alert('Add at least one row to export');
  generatePdfFromEntry(entry);
}

function generatePdfFromEntry(entry) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p','pt','a4');
    const margin = 36;
    const pageWidth = doc.internal.pageSize.getWidth();
    const usableWidth = pageWidth - margin*2;

    const img = new Image();
    img.src = './logo.png';
    img.onload = function() {
      doc.setDrawColor(0);
      doc.setLineWidth(1);
      doc.rect(margin, 18, usableWidth, 70);
      doc.rect(margin+6, 24, 140, 56);
      doc.addImage(img,'PNG', margin+10, 28, 132, 48);

      doc.setFontSize(12);
      doc.setFont('helvetica','bold');
      doc.text('Dry Store Stock Record', margin+160, 36);
      doc.setFontSize(9);
      doc.setFont('helvetica','normal');
      doc.text('Project: Konarak F&B — Cognizant 12A, Mindspace, Hyderabad', margin+160, 52);
      doc.text(`Date: ${entry.date}`, margin, 100);

      const columns = [
        'S.No','Items','Batch No','Receiving Date','Manufacturing Date','Expiry Date','Shelf Life','Stock Quantity','Remarks'
      ];
      const rows = entry.rows.map((r,i) => [
        i+1, r.item||'', r.batch||'', r.receivingDate||'', r.mfgDate||'', r.expiryDate||'', r.shelfLife||'', r.qty||'', r.remarks||''
      ]);

      doc.autoTable({
        head: [columns],
        body: rows,
        startY: 120,
        margin: { left: margin, right: margin },
        styles: { fontSize: 9 },
        tableWidth: 'auto',
        didDrawPage: function(data) {
          const finalY = doc.internal.pageSize.height - 72;
          doc.setLineWidth(0.8);
          doc.line(margin, finalY, pageWidth - margin, finalY);
        }
      });

      doc.save(`DryStore_${entry.counter.replace(/\s+/g,'')}_${entry.date}.pdf`);
    };

    img.onerror = function() {
      debug('logo.png not found; continuing without logo.');
      // fallback: generate without logo
      doc.setFontSize(12);
      doc.text('Dry Store Stock Record', 40, 40);
      doc.save(`DryStore_${entry.counter.replace(/\s+/g,'')}_${entry.date}.pdf`);
    };

  } catch (e) {
    debug('generatePdfFromEntry error: ' + e.message);
    alert('PDF export failed: ' + e.message);
  }
}

function exportJsonToExcel(jsonRows, filename) {
  try {
    const ws = XLSX.utils.json_to_sheet(jsonRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, filename);
  } catch (e) {
    debug('exportJsonToExcel error: ' + e.message);
    alert('Excel export failed: ' + e.message);
  }
}

async function exportExcelFromUI() {
  const rows = readTableRowsFromUI().map(r => ({
    'S.No': r.sno, 'Item': r.item, 'Batch No': r.batch, 'Receiving Date': r.receivingDate,
    'Mfg Date': r.mfgDate, 'Expiry Date': r.expiryDate, 'Shelf Life': r.shelfLife,
    'Stock Qty': r.qty, 'Remarks': r.remarks
  }));
  if (rows.length === 0) return alert('Add at least one row to export');
  exportJsonToExcel(rows, `DryStore_${document.getElementById('counterSelect').value}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

/* ------------------------ Manager / Admin features ----------------------- */
async function loadAllEntries() {
  try {
    const container = document.getElementById('allEntries');
    container.innerHTML = '';
    let q = db.collection('entries').orderBy('timestamp','desc').limit(200);
    const floor = document.getElementById('viewFloor').value;
    const counter = document.getElementById('viewCounter').value;
    if (floor && floor !== 'all') q = q.where('floor','==',floor);
    if (counter && counter !== 'all') q = q.where('counter','==',counter);
    const snap = await q.get();
    snap.forEach(doc => {
      const d = doc.data();
      const div = document.createElement('div'); div.className = 'entry';
      div.innerHTML = `<strong>${d.counter} (${d.floor}) — ${d.date}</strong><br>${d.rows.length} items
        <div style="margin-top:6px"><button onclick="window.downloadEntryPdf('${doc.id}')">Download PDF</button>
        <button onclick="window.downloadEntryExcel('${doc.id}')">Download Excel</button></div>`;
      container.appendChild(div);
    });
    debug('loadAllEntries loaded ' + snap.size + ' records');
  } catch (e) {
    debug('loadAllEntries error: ' + e.message);
  }
}

/* filtered download for manager */
document.addEventListener('click', (e)=>{
  // no-op placeholder just to keep event system active
});

/* download filtered */
document.getElementById('downloadFilteredExcel')?.addEventListener('click', async ()=>{
  try {
    const floor = document.getElementById('viewFloor').value;
    const counter = document.getElementById('viewCounter').value;
    const from = document.getElementById('fromDate').value;
    const to = document.getElementById('toDate').value;

    let q = db.collection('entries').orderBy('timestamp','desc');
    if (floor && floor !== 'all') q = q.where('floor','==',floor);
    if (counter && counter !== 'all') q = q.where('counter','==',counter);

    const snap = await q.get();
    const results = [];
    snap.forEach(doc => {
      const d = doc.data();
      const entryDateVal = d.date || '';
      if (from && entryDateVal < from) return;
      if (to && entryDateVal > to) return;
      d.rows.forEach((r,i) => {
        results.push({
          'Entry Date': d.date, 'Floor': d.floor, 'Counter': d.counter, 'S.No': i+1,
          'Item': r.item, 'Batch No': r.batch, 'Receiving Date': r.receivingDate,
          'Mfg Date': r.mfgDate, 'Expiry Date': r.expiryDate, 'Shelf Life': r.shelfLife,
          'Stock Qty': r.qty, 'Remarks': r.remarks, 'Created By': d.creatorEmail
        });
      });
    });
    if (results.length === 0) return alert('No records for selected filters');
    exportJsonToExcel(results, `DryStore_Filtered_${floor}_${counter}.xlsx`);
  } catch (e) {
    debug('downloadFilteredExcel error: ' + e.message);
  }
});

/* ------------------------ Create floors/counters ------------------------ */
async function createFloorHandler() {
  try {
    const name = (document.getElementById('newFloorName').value||'').trim();
    if (!name) { document.getElementById('nodeMsg').textContent = 'Enter floor name'; return; }
    const existing = await db.collection('floors').where('name','==',name).get();
    if (!existing.empty) { document.getElementById('nodeMsg').textContent = 'Floor exists'; return; }
    await db.collection('floors').add({ name });
    document.getElementById('nodeMsg').style.color = 'green';
    document.getElementById('nodeMsg').textContent = 'Floor created';
    document.getElementById('newFloorName').value = '';
    await loadFloorsAndCountersToUI();
  } catch (e) {
    debug('createFloorHandler error: ' + e.message);
    document.getElementById('nodeMsg').textContent = 'Error: ' + e.message;
  }
}

async function createCounterHandler() {
  try {
    const floor = document.getElementById('selectFloorForCounter').value;
    const name = (document.getElementById('newCounterNameField').value||'').trim();
    if (!name) { document.getElementById('nodeMsg').textContent = 'Enter counter name'; return; }
    const existing = await db.collection('counters').where('name','==',name).where('floor','==',floor).get();
    if (!existing.empty) { document.getElementById('nodeMsg').textContent = 'Counter exists for this floor'; return; }
    await db.collection('counters').add({ name, floor });
    document.getElementById('nodeMsg').style.color = 'green';
    document.getElementById('nodeMsg').textContent = 'Counter created';
    document.getElementById('newCounterNameField').value = '';
    await loadFloorsAndCountersToUI();
  } catch (e) {
    debug('createCounterHandler error: ' + e.message);
    document.getElementById('nodeMsg').textContent = 'Error: ' + e.message;
  }
}

/* ----------------------- Create user (Identity REST) -------------------- */
function toggleCreateUserRoleUI(){
  const role = document.getElementById('newRole').value;
  if (role === 'manager' || role === 'admin') {
    document.querySelector('.assignFloorLabel').style.display = 'none';
    document.querySelector('.assignCounterLabel').style.display = 'none';
    document.getElementById('newFloor').style.display = 'none';
    document.getElementById('newAssignCounter').style.display = 'none';
  } else {
    document.querySelector('.assignFloorLabel').style.display = '';
    document.querySelector('.assignCounterLabel').style.display = '';
    document.getElementById('newFloor').style.display = '';
    document.getElementById('newAssignCounter').style.display = '';
  }
}

async function createUserHandler() {
  try {
    document.getElementById('createMsg').textContent = '';
    const email = (document.getElementById('newEmail').value||'').trim();
    const password = (document.getElementById('newPassword').value||'').trim();
    const role = document.getElementById('newRole').value;
    const floor = document.getElementById('newFloor').value;
    const counter = document.getElementById('newAssignCounter').value;

    if (!email || !password) { document.getElementById('createMsg').textContent = 'Provide email & password'; return; }
    if (role === 'counter' && (!floor || !counter)) { document.getElementById('createMsg').textContent = 'Assign floor & counter'; return; }

    const apiKey = (firebase && firebase.apps && firebase.apps.length) ? firebase.apps[0].options.apiKey : null;
    if (!apiKey) throw new Error('Firebase API key missing');

    const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message || 'User create failed');

    const uid = data.localId;
    await db.collection('users').doc(uid).set({
      email, role,
      floor: role === 'counter' ? floor : '',
      counter: role === 'counter' ? counter : '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById('createMsg').style.color = 'green';
    document.getElementById('createMsg').textContent = `User created: ${email}`;
    document.getElementById('newEmail').value = '';
    document.getElementById('newPassword').value = '';
    debug('User created: ' + email + ' (uid=' + uid + ')');
  } catch (e) {
    document.getElementById('createMsg').style.color = 'red';
    document.getElementById('createMsg').textContent = e.message || 'Create user failed';
    debug('createUserHandler error: ' + (e.message || e));
  }
}

/* ----------------------- Expose helpers for dynamic buttons ------------- */
window.downloadEntryPdf = async function(id) {
  try {
    const docRef = await db.collection('entries').doc(id).get();
    if (!docRef.exists) return alert('Entry not found');
    generatePdfFromEntry(docRef.data());
  } catch (e) { debug('downloadEntryPdf error: ' + e.message); }
};

window.downloadEntryExcel = async function(id) {
  try {
    const docRef = await db.collection('entries').doc(id).get();
    if (!docRef.exists) return alert('Entry not found');
    const d = docRef.data();
    const rows = d.rows.map((r,i)=>({
      'S.No': i+1, 'Item': r.item, 'Batch No': r.batch, 'Receiving Date': r.receivingDate,
      'Mfg Date': r.mfgDate, 'Expiry Date': r.expiryDate, 'Shelf Life': r.shelfLife,
      'Stock Qty': r.qty, 'Remarks': r.remarks
    }));
    exportJsonToExcel(rows, `DryStore_${d.counter.replace(/\s+/g,'')}_${d.date}.xlsx`);
  } catch (e) { debug('downloadEntryExcel error: ' + e.message); }
};

/* --------------------------- End of app.js ------------------------------- */
