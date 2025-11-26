/* =========================================================
   Konarak F&B — Dry Store
   FINAL app.js (vertical staff form, admin filtered list,
   combined PDF for filtered entries, Excel export).
   Replace your existing app.js with this file.
   ========================================================= */

/* ---------------- DEBUG Helpers ---------------- */
function debug(msg) {
  try {
    const ts = new Date().toLocaleTimeString();
    const el = document.getElementById('debugLog');
    if (el) el.textContent = `${ts} — ${msg}\n` + el.textContent;
    console.log(msg);
  } catch (e) { console.log('debug error', e); }
}
function setText(id, text, color = 'red') {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.color = color;
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
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* ---------------- Global state ---------------- */
let IN_MEMORY_FLOORS = null;
let IN_MEMORY_COUNTERS = null;
let CURRENT_USER_META = null;

/* ---------------- Utility confirm ---------------- */
function confirmAction(message) {
  return window.confirm(message);
}

/* ================== UI MODE FUNCTIONS ================== */

/* showManagerUI */
async function showManagerUI() {
  debug('showManagerUI called');
  try {
    const counterUi = document.getElementById('counter-ui');
    const managerUi = document.getElementById('manager-ui');
    if (counterUi) counterUi.classList.add('hidden');
    if (managerUi) managerUi.classList.remove('hidden');

    await loadFloorsAndCountersToUI();
    await renderAdminLists();
    await loadAllEntries();
  } catch (e) {
    debug('showManagerUI error: ' + (e?.message || e));
  }
}

/* showCounterUI */
async function showCounterUI(meta, uid) {
  debug('showCounterUI called for ' + (meta?.counter || uid));
  try {
    const managerUi = document.getElementById('manager-ui');
    const counterUi = document.getElementById('counter-ui');
    if (managerUi) managerUi.classList.add('hidden');
    if (counterUi) counterUi.classList.remove('hidden');

    // Lock floor & counter
    const floorSel = document.getElementById('floorSelect');
    const counterSel = document.getElementById('counterSelect');

    if (floorSel) {
      floorSel.value = meta.floor;
      floorSel.disabled = true;
    }

    await populateCountersForFloor(meta.floor);
    if (counterSel) {
      counterSel.value = meta.counter;
      counterSel.disabled = true;
    }

    clearStaffForm();
    await loadMyEntries(uid);

  } catch (e) {
    debug('showCounterUI error: ' + (e?.message || e));
  }
}

/* ================== DOM READY ================== */
document.addEventListener('DOMContentLoaded', () => {
  debug('DOM ready — waiting for login');
  wireEvents();
  try {
    const ed = document.getElementById('entryDate');
    if (ed) ed.value = new Date().toISOString().slice(0,10);
  } catch {}
});

/* ================== SAFE DEFAULTS ================== */
async function ensureDefaults() {
  try {
    const fSnap = await db.collection('floors').limit(1).get();
    const cSnap = await db.collection('counters').limit(1).get();

    if (fSnap.empty || cSnap.empty) {
      debug('Using fallback floors/counters');
      IN_MEMORY_FLOORS = ['1st','3rd','6th'];
      IN_MEMORY_COUNTERS = [
        {name:'Kitchen', floor:'1st'},
        {name:'Chana & Corn', floor:'1st'},
        {name:'Juice', floor:'1st'},
        {name:'Tea', floor:'1st'},
        {name:'Bread', floor:'1st'},
        {name:'Chat', floor:'1st'},
        {name:'Shawarma', floor:'1st'},
        {name:'Kitchen', floor:'3rd'},
        {name:'Kitchen', floor:'6th'},
        {name:'Tea', floor:'6th'},
        {name:'Muntha Masala', floor:'6th'}
      ];
    } else {
      IN_MEMORY_FLOORS = null;
      IN_MEMORY_COUNTERS = null;
    }

  } catch (e) {
    debug('ensureDefaults error: ' + (e?.message || e));
  }
}

/* ================== AUTH STATE ================== */
auth.onAuthStateChanged(async (user) => {
  debug('onAuthStateChanged → ' + (user ? user.email : 'null'));

  document.getElementById('auth-section').classList.remove('hidden');
  document.getElementById('app-section').classList.add('hidden');

  if (!user) { CURRENT_USER_META = null; return; }

  try {
    await ensureDefaults();
    await loadFloorsAndCountersToUI();

    const metaDoc = await db.collection('users').doc(user.uid).get();

    if (!metaDoc.exists) {
      debug("User doc missing → treating as admin");
      CURRENT_USER_META = { role:'admin', floor:'NA', counter:'Admin' };
      document.getElementById('auth-section').classList.add('hidden');
      document.getElementById('app-section').classList.remove('hidden');
      return showManagerUI();
    }

    CURRENT_USER_META = metaDoc.data();

    document.getElementById('who').textContent =
      `${CURRENT_USER_META.role.toUpperCase()} — ${CURRENT_USER_META.counter} (${CURRENT_USER_META.floor})`;

    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('app-section').classList.remove('hidden');

    if (CURRENT_USER_META.role === 'counter') {
      return showCounterUI(CURRENT_USER_META, user.uid);
    } else {
      return showManagerUI();
    }

  } catch (e) {
    debug("Auth error: " + (e?.message || e));
  }
});

/* ================== LOAD FLOORS & COUNTERS ================== */
async function loadFloorsAndCountersToUI() {
  try {
    debug('Loading floors & counters…');
    let floors = [];
    let counters = [];

    if (IN_MEMORY_FLOORS) {
      floors = IN_MEMORY_FLOORS.slice();
      counters = IN_MEMORY_COUNTERS.slice();
    } else {
      const fSnap = await db.collection('floors').orderBy('name').get();
      floors = fSnap.docs.map(d => d.data().name);

      const cSnap = await db.collection('counters')
        .orderBy('floor').orderBy('name').get();

      counters = cSnap.docs.map(d => ({
        name: d.data().name,
        floor: d.data().floor
      }));
    }

    // populate floor selects
    ['floorSelect','viewFloor','newFloor','selectFloorForCounter']
      .forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '';
        if (id === 'viewFloor')
          sel.appendChild(new Option('All','all'));
        floors.forEach(f => sel.appendChild(new Option(f,f)));
      });

    // default values
    if (floors.length) {
      if (document.getElementById('floorSelect')) 
        document.getElementById('floorSelect').value = floors[0];
      if (document.getElementById('newFloor'))
        document.getElementById('newFloor').value = floors[0];
    }

    await populateViewCounterOptions();
    await populateAssignCounterOptions(
      document.getElementById('newFloor')?.value || floors[0]
    );

    debug('Floors & counters loaded');
  } catch (e) {
    debug('loadFloorsAndCountersToUI error: ' + (e?.message || e));
  }
}

async function populateCountersForFloor(floor) {
  try {
    const sel = document.getElementById('counterSelect');
    if (!sel) return;
    sel.innerHTML = '';
    const snap = await db.collection('counters')
      .where('floor','==',floor).orderBy('name').get();
    snap.forEach(d => sel.appendChild(new Option(d.data().name, d.data().name)));
  } catch (e) {
    debug('populateCountersForFloor error: ' + (e?.message || e));
  }
}

async function populateViewCounterOptions() {
  try {
    const sel = document.getElementById('viewCounter');
    if (!sel) return;

    sel.innerHTML = '<option value="all">All Counters</option>';

    const snap = await db.collection('counters')
      .orderBy('floor').orderBy('name').get();

    snap.forEach(d => {
      const data = d.data();
      sel.appendChild(
        new Option(
          `${data.name} (${data.floor})`,
          `${data.floor}|||${data.name}`
        )
      );
    });
  } catch (e) { debug('populateViewCounterOptions error: ' + (e?.message || e)); }
}

async function populateAssignCounterOptions(floor) {
  try {
    const sel = document.getElementById('newAssignCounter');
    if (!sel) return;

    sel.innerHTML = '';
    const snap = await db.collection('counters')
      .where('floor','==',floor).orderBy('name').get();

    snap.forEach(d => sel.appendChild(new Option(d.data().name, d.data().name)));
  } catch (e) { debug('populateAssignCounterOptions error: ' + (e?.message || e)); }
}

/* ================== EVENT WIRING ================== */
function wireEvents() {
  try {
    document.getElementById('loginBtn').addEventListener('click', loginHandler);
    document.getElementById('logoutBtn').addEventListener('click', () => auth.signOut());
    document.getElementById('saveEntryBtn').addEventListener('click', saveEntryHandler);

    document.getElementById('refreshView').addEventListener('click', loadAllEntries);
    document.getElementById('viewFloor').addEventListener('change', async ()=>{
      await reloadViewCounters();
      await loadAllEntries();
    });

    document.getElementById('downloadFilteredPdf')
      .addEventListener('click', downloadFilteredPdf);
    document.getElementById('downloadFilteredExcel')
      .addEventListener('click', downloadFilteredExcel);

    document.getElementById('createFloorBtn')
      .addEventListener('click', createFloorHandler);
    document.getElementById('createCounterBtn')
      .addEventListener('click', createCounterHandler);
    document.getElementById('createUserBtn')
      .addEventListener('click', createCounterUserHandler);

    document.getElementById('newFloor')
      .addEventListener('change', ()=>{
        populateAssignCounterOptions(document.getElementById('newFloor').value);
      });

    document.getElementById('selectFloorForCounter')
      .addEventListener('change', ()=> populateCountersList());

  } catch (e) {
    debug('wireEvents error: ' + (e?.message || e));
  }
}

/* ================== LOGIN HANDLER ================== */
async function loginHandler() {
  setText('loginError','');
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    await auth.signInWithEmailAndPassword(email, password);
    debug('Login success: ' + email);
  } catch (e) {
    const msg = e?.message || 'Login failed';
    setText('loginError', msg);
    debug('Login failed: ' + msg);
  }
}

/* ================== STAFF FORM ================== */
function clearStaffForm() {
  ['item','batch','receivingDate','mfgDate','expiryDate','shelfLife','qty','remarks']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
}

async function saveEntryHandler() {
  try {
    const user = auth.currentUser;
    if (!user) return alert('Not signed in');

    const metaDoc = await db.collection('users').doc(user.uid).get();
    if (!metaDoc.exists) return alert('User metadata missing');

    const userMeta = metaDoc.data();

    const floor = document.getElementById('floorSelect').value;
    const counter = document.getElementById('counterSelect').value;

    const item = document.getElementById('item').value.trim();
    const batch = document.getElementById('batch').value.trim();
    const receivingDate = document.getElementById('receivingDate').value;
    const mfgDate = document.getElementById('mfgDate').value;
    const expiryDate = document.getElementById('expiryDate').value;
    const shelfLife = document.getElementById('shelfLife').value.trim();
    const qty = document.getElementById('qty').value.trim();
    const remarks = document.getElementById('remarks').value.trim();
    const date = document.getElementById('entryDate').value || new Date().toISOString().slice(0,10);

    if (!item) return alert('Enter Item name');

    // prevent cross-floor submissions
    if (userMeta.role === 'counter' &&
        (userMeta.floor !== floor || userMeta.counter !== counter)) {
      return alert('You can only submit entries for your assigned floor & counter.');
    }

    const row = { item, batch, receivingDate, mfgDate, expiryDate, shelfLife, qty, remarks };

    const entry = {
      createdBy: user.uid,
      creatorEmail: user.email,
      floor,
      counter,
      date,
      rows: [row],
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('entries').add(entry);
    debug('Entry saved by ' + user.email);

    clearStaffForm();
    await loadMyEntries(user.uid);

  } catch (e) {
    debug('saveEntryHandler error: ' + (e?.message || e));
    alert('Save failed: ' + (e?.message || e));
  }
}

/* ================== STAFF HISTORY ================== */
async function loadMyEntries(uid) {
  try {
    const div = document.getElementById('history');
    if (!div) return;
    div.innerHTML = '';

    const snap = await db.collection('entries')
      .where('createdBy','==',uid)
      .orderBy('timestamp','desc')
      .limit(50)
      .get();

    snap.forEach(doc => {
      const d = doc.data();
      const item = d.rows?.[0]?.item || '';
      const card = document.createElement('div');
      card.className = 'staff-card';
      card.innerHTML =
        `<div class="staff-top">
            <strong>${item}</strong>
            <span>${d.date}</span>
         </div>
         <div>${d.counter} (${d.floor})</div>`;
      div.appendChild(card);
    });

    debug('loadMyEntries: ' + snap.size);

  } catch (e) {
    debug('loadMyEntries error: ' + (e?.message || e));
  }
}

/* ================== ADMIN: LOAD ALL ENTRIES ================== */
async function loadAllEntries() {
  try {
    const container = document.getElementById('allEntries');
    if (!container) return;
    container.innerHTML = '';

    const selFloor = document.getElementById('viewFloor').value;
    const selCounterComp = document.getElementById('viewCounter').value;

    const from = document.getElementById('fromDate').value;
    const to = document.getElementById('toDate').value;

    let q = db.collection('entries').orderBy('timestamp', 'desc');

    if (selFloor !== 'all') {
      q = q.where('floor','==',selFloor);

      if (selCounterComp !== 'all') {
        const [cfloor, ccounter] = selCounterComp.split('|||');
        if (cfloor === selFloor) {
          q = q.where('counter','==',ccounter);
        } else return alert('Floor and counter mismatch');
      }
    } else if (selCounterComp !== 'all') {
      return alert('Select floor first');
    }

    const snap = await q.get();

    snap.forEach(d => {
      const data = d.data();
      if (from && data.date < from) return;
      if (to && data.date > to) return;

      const item = data.rows?.[0]?.item || '—';
      const box = document.createElement('div');
      box.className = 'entry';
      box.innerHTML =
        `<strong>${item}</strong>
         <div>${data.counter} (${data.floor}) — ${data.date}</div>
         <div>${data.rows.length} item(s)</div>`;
      container.appendChild(box);
    });

    debug('loadAllEntries: ' + snap.size);

  } catch (e) {
    debug('loadAllEntries error: ' + (e?.message || e));
  }
}

/* ================== PDF EXPORT (SINGLE FILE) ================== */
async function downloadFilteredPdf() {
  try {
    const selFloor = document.getElementById('viewFloor').value;
    const selCounter = document.getElementById('viewCounter').value;
    const from = document.getElementById('fromDate').value;
    const to = document.getElementById('toDate').value;

    let q = db.collection('entries').orderBy('timestamp','desc');

    if (selFloor !== 'all') {
      q = q.where('floor','==',selFloor);

      if (selCounter !== 'all') {
        const [cfloor, ccounter] = selCounter.split('|||');
        if (cfloor === selFloor) q = q.where('counter','==',ccounter);
      }

    } else if (selCounter !== 'all') {
      return alert('Select floor first');
    }

    const snap = await q.get();

    const entries = [];
    snap.forEach(doc => {
      const d = doc.data();
      if (from && d.date < from) return;
      if (to && d.date > to) return;
      entries.push(d);
    });

    if (!entries.length) return alert('No records found');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p','pt','a4');

    const margin = 36;
    const pageWidth = doc.internal.pageSize.getWidth();
    const usableWidth = pageWidth - margin*2;

    const img = new Image();
    img.src = './logo.png';

    function addEntry(entry) {
      doc.setDrawColor(0);
      doc.setLineWidth(1);
      doc.rect(margin, 18, usableWidth, 70);

      try {
        if (img.complete && img.naturalWidth) {
          const w = 120;
          const h = (img.height/img.width)*w;
          doc.addImage(img,'PNG', margin+8, 22 + (70-h)/2, w, h);
        }
      } catch {}

      doc.setFontSize(12);
      doc.setFont('helvetica','bold');
      doc.text('Dry Store Stock Record', margin+140, 36);

      doc.setFontSize(9);
      doc.setFont('helvetica','normal');
      doc.text('Konarak F&B — Cognizant 12A, Mindspace, Hyderabad', margin+140, 52);

      const rx = margin + usableWidth - 160;
      doc.text(`Floor: ${entry.floor}`, rx, 36);
      doc.text(`Counter: ${entry.counter}`, rx, 52);
      doc.text(`Date: ${entry.date}`, rx, 68);

      const columns = ['S.No','Item','Batch No','Receiving','Mfg','Expiry','Shelf Life','Stock','Remarks'];
      const rows = entry.rows.map((r,i)=>[
        i+1, r.item||'', r.batch||'', r.receivingDate||'', r.mfgDate||'',
        r.expiryDate||'', r.shelfLife||'', r.qty||'', r.remarks||''
      ]);

      doc.autoTable({
        head:[columns],
        body:rows,
        startY:120,
        margin:{left:margin, right:margin},
        styles:{fontSize:9}
      });
    }

    for (let i=0;i<entries.length;i++) {
      if (i>0) doc.addPage();
      addEntry(entries[i]);
    }

    const first = entries[0];
    const fileName = `DryStore_${first.counter.replace(/\s+/g,'')}_${from || first.date}_to_${to || first.date}.pdf`;
    doc.save(fileName);

  } catch (e) {
    debug('downloadFilteredPdf error: ' + (e?.message || e));
    alert('PDF failed: ' + (e?.message || e));
  }
}

/* ================== EXCEL EXPORT ================== */
async function downloadFilteredExcel() {
  try {
    const selFloor = document.getElementById('viewFloor').value;
    const selCounter = document.getElementById('viewCounter').value;
    const from = document.getElementById('fromDate').value;
    const to = document.getElementById('toDate').value;

    let q = db.collection('entries').orderBy('timestamp','desc');
    if (selFloor !== 'all') {
      q = q.where('floor','==',selFloor);
      if (selCounter !== 'all') {
        const [cfloor, ccounter] = selCounter.split('|||');
        if (cfloor === selFloor) q = q.where('counter','==',ccounter);
      }
    } else if (selCounter !== 'all') {
      return alert('Select floor first');
    }

    const snap = await q.get();
    const out = [];

    snap.forEach(doc => {
      const d = doc.data();
      if (from && d.date < from) return;
      if (to && d.date > to) return;

      d.rows.forEach((r,i)=>{
        out.push({
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
          'Qty': r.qty,
          'Remarks': r.remarks,
          'Created By': d.creatorEmail
        });
      });
    });

    if (!out.length) return alert('No records');

    const ws = XLSX.utils.json_to_sheet(out);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const filename =
      `DryStore_Export_${selFloor==='all'?'All':selFloor}_${selCounter==='all'?'All':selCounter.replace('|||','_')}.xlsx`;

    XLSX.writeFile(wb, filename);

  } catch (e) {
    debug('downloadFilteredExcel error: ' + (e?.message || e));
    alert('Excel failed');
  }
}

/* ================== ADMIN CRUD ================== */
async function renderAdminLists() {
  try {
    await loadFloorsAndCountersToUI();

    // Floors
    const floorsList = document.getElementById('floorsList');
    floorsList.innerHTML = '';

    const fSnap = await db.collection('floors').orderBy('name').get();
    fSnap.forEach(doc => {
      const f = doc.data().name;
      const id = doc.id;

      const node = document.createElement('div');
      node.className = 'node-item';
      node.innerHTML = `
        <div><strong>${f}</strong></div>
        <div><button class="delFloorBtn" data-floor="${f}" data-floorid="${id}">Delete</button></div>
      `;
      floorsList.appendChild(node);
    });

    document.querySelectorAll('.delFloorBtn')
      .forEach(btn => btn.addEventListener('click', handleDeleteFloor));

    // Counters
    const countersList = document.getElementById('countersList');
    countersList.innerHTML = '';

    const cSnap = await db.collection('counters')
      .orderBy('floor').orderBy('name').get();

    cSnap.forEach(doc => {
      const d = doc.data(); const id = doc.id;
      const node = document.createElement('div');
      node.className = 'node-item';

      node.innerHTML = `
        <div>${d.name} <small>(${d.floor})</small></div>
        <div><button class="delCounterBtn" data-counterid="${id}" data-name="${d.name}" data-floor="${d.floor}">Delete</button></div>
      `;
      countersList.appendChild(node);
    });

    document.querySelectorAll('.delCounterBtn')
      .forEach(btn => btn.addEventListener('click', handleDeleteCounter));

    // Staff
    const staffList = document.getElementById('staffList');
    staffList.innerHTML = '';

    const uSnap = await db.collection('users')
      .orderBy('role').orderBy('email').get();

    uSnap.forEach(doc => {
      const u = doc.data(); const uid = doc.id;
      const card = document.createElement('div');
      card.className = 'staff-card';

      card.innerHTML = `
        <div class="staff-top">
          <strong>${u.email}</strong>
          <span>${u.role}</span>
        </div>
        <div>Floor: ${u.floor}<br/>Counter: ${u.counter}</div>
        <button class="delUserBtn" data-uid="${uid}">Delete Staff</button>
      `;

      staffList.appendChild(card);
    });

    document.querySelectorAll('.delUserBtn')
      .forEach(btn => btn.addEventListener('click', handleDeleteUser));

  } catch (e) {
    debug('renderAdminLists error: ' + (e?.message || e));
  }
}

/* CREATE FLOOR */
async function createFloorHandler() {
  try {
    setText('nodeMsg','');
    const name = document.getElementById('newFloorName').value.trim();
    if (!name) return setText('nodeMsg','Enter floor name');

    const exists = await db.collection('floors').where('name','==', name).get();
    if (!exists.empty) return setText('nodeMsg','Floor already exists');

    await db.collection('floors').add({ name });
    setText('nodeMsg','Floor created','green');
    document.getElementById('newFloorName').value = '';

    await renderAdminLists();
  } catch (e) {
    setText('nodeMsg','Error: ' + (e?.message || e));
  }
}

/* DELETE FLOOR */
async function handleDeleteFloor(ev) {
  try {
    const btn = ev.currentTarget;
    const floor = btn.dataset.floor;
    const floorId = btn.dataset.floorid;

    if (!confirmAction(`Delete floor "${floor}"?`)) return;

    // block if staff exist
    const usersSnap = await db.collection('users')
      .where('floor','==',floor).limit(1).get();

    if (!usersSnap.empty) {
      alert(`Cannot delete floor "${floor}" — staff assigned exists.`);
      return;
    }

    // delete counters then floor
    const countersSnap = await db.collection('counters')
      .where('floor','==',floor).get();

    const batch = db.batch();
    countersSnap.forEach(d => batch.delete(db.collection('counters').doc(d.id)));
    batch.delete(db.collection('floors').doc(floorId));
    await batch.commit();

    debug(`Floor "${floor}" deleted`);
    await renderAdminLists();
    await loadFloorsAndCountersToUI();

  } catch (e) {
    debug('handleDeleteFloor error: ' + (e?.message || e));
    alert('Delete failed');
  }
}

/* CREATE COUNTER */
async function createCounterHandler() {
  try {
    setText('nodeMsg','');
    const floor = document.getElementById('selectFloorForCounter').value;
    const name = document.getElementById('newCounterNameField').value.trim();

    if (!name) return setText('nodeMsg','Enter counter name');

    const exist = await db.collection('counters')
      .where('floor','==',floor).where('name','==',name).get();

    if (!exist.empty) return setText('nodeMsg','Counter exists');

    await db.collection('counters').add({ floor, name });

    setText('nodeMsg','Counter created','green');
    document.getElementById('newCounterNameField').value = '';

    await renderAdminLists();
    await loadFloorsAndCountersToUI();

  } catch (e) {
    setText('nodeMsg','Error: ' + (e?.message || e));
  }
}

/* DELETE COUNTER (blocked if entries exist) */
async function handleDeleteCounter(ev) {
  try {
    const btn = ev.currentTarget;
    const counter = btn.dataset.name;
    const floor = btn.dataset.floor;
    const counterId = btn.dataset.counterid;

    if (!confirmAction(`Delete counter "${counter}" on ${floor}?`)) return;

    const entriesSnap = await db.collection('entries')
      .where('counter','==',counter).limit(10).get();

    let found = false;
    entriesSnap.forEach(d => {
      if (d.data().floor === floor) found = true;
    });

    if (found) {
      return alert(`Cannot delete counter "${counter}" — entries exist.`);
    }

    await db.collection('counters').doc(counterId).delete();

    debug(`Counter "${counter}" deleted`);
    await renderAdminLists();
    await loadFloorsAndCountersToUI();

  } catch (e) {
    debug('handleDeleteCounter error: ' + (e?.message || e));
    alert('Delete counter failed');
  }
}

/* CREATE COUNTER USER */
async function createCounterUserHandler() {
  try {
    setText('createMsg','');
    const email = document.getElementById('newEmail').value.trim();
    const password = document.getElementById('newPassword').value.trim();
    const floor = document.getElementById('newFloor').value;
    const counter = document.getElementById('newAssignCounter').value;

    if (!email || !password) return setText('createMsg','Enter email & password');
    if (!floor || !counter) return setText('createMsg','Assign floor & counter');

    // Create Auth user via signup API
    const apiKey = firebaseConfig.apiKey;
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ email, password, returnSecureToken:true })
      }
    );

    const d = await r.json();
    if (d.error) throw new Error(d.error.message);

    await db.collection('users').doc(d.localId).set({
      email,
      role:'counter',
      floor,
      counter,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    setText('createMsg', 'User created: ' + email,'green');
    document.getElementById('newEmail').value = '';
    document.getElementById('newPassword').value = '';

    await renderAdminLists();

  } catch (e) {
    setText('createMsg','Error: ' + (e?.message || e));
  }
}

/* DELETE USER */
async function handleDeleteUser(ev) {
  try {
    const uid = ev.currentTarget.dataset.uid;

    if (!confirmAction('Delete this staff user record?')) return;

    await db.collection('users').doc(uid).delete();
    debug('User deleted: ' + uid);
    await renderAdminLists();

  } catch (e) {
    debug('handleDeleteUser error: ' + (e?.message || e));
    alert('Delete staff failed');
  }
}

/* viewCounter reload */
async function reloadViewCounters() {
  try {
    const vf = document.getElementById('viewFloor').value;
    const sel = document.getElementById('viewCounter');
    sel.innerHTML = '<option value="all">All Counters</option>';

    if (vf === 'all') {
      return populateViewCounterOptions();
    }

    const snap = await db.collection('counters')
      .where('floor','==',vf).orderBy('name').get();

    snap.forEach(d => {
      const data = d.data();
      sel.appendChild(
        new Option(`${data.name} (${data.floor})`, `${data.floor}|||${data.name}`)
      );
    });

  } catch (e) {
    debug('reloadViewCounters error: ' + (e?.message || e));
  }
}

async function populateCountersList() {
  await renderAdminLists();
}

/* ================== END OF FILE ================== */
