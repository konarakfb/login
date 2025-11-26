/* FINAL app.js — includes showManagerUI (declared early) */

/* ---------------- DEBUG HELPERS ---------------- */
function debug(msg) {
  console.log(msg);
  try {
    const el = document.getElementById('debugLog');
    if (!el) return;
    const time = new Date().toLocaleTimeString();
    el.textContent = `${time} — ${msg}\n` + el.textContent;
  } catch (e) { console.log('debug write failed', e); }
}
function setText(id, text, color='red') {
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

/* ---------------- DOM Ready ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  debug('DOM ready — waiting for login');
  wireEvents();
  try { document.getElementById('entryDate').value = new Date().toISOString().slice(0,10); } catch {}
});

/* ---------------- GLOBAL FALLBACKS ---------------- */
let IN_MEMORY_FLOORS = null;
let IN_MEMORY_COUNTERS = null;
let CURRENT_USER_META = null;

/* ---------------- showManagerUI FUNCTION (defined early) ---------------- */
async function showManagerUI() {
  debug('Entering admin (manager) UI');
  // hide counter UI, show manager UI
  const counterUi = document.getElementById('counter-ui');
  const managerUi = document.getElementById('manager-ui');
  if (counterUi) counterUi.classList.add('hidden');
  if (managerUi) managerUi.classList.remove('hidden');

  // load floors/counters and entries
  try {
    await loadFloorsAndCountersToUI();
    await loadAllEntries();
  } catch (e) {
    debug('showManagerUI error: ' + e.message);
  }
}

/* ---------------- ensureDefaults (safe) ---------------- */
async function ensureDefaults() {
  try {
    const fSnap = await db.collection('floors').limit(1).get();
    const cSnap = await db.collection('counters').limit(1).get();

    if (fSnap.empty || cSnap.empty) {
      debug('Firestore empty — using fallback lists');
      IN_MEMORY_FLOORS = ['1st','6th'];
      IN_MEMORY_COUNTERS = [
        { name: 'Kitchen', floor: '1st' }, { name: 'Chana & Corn', floor: '1st' },
        { name: 'Juice', floor: '1st' }, { name: 'Tea', floor: '1st' },
        { name: 'Bread', floor: '1st' }, { name: 'Chat', floor: '1st' },
        { name: 'Shawarma', floor: '1st' }, { name: 'Kitchen', floor: '6th' },
        { name: 'Tea', floor: '6th' }, { name: 'Muntha Masala', floor: '6th' }
      ];
    } else {
      IN_MEMORY_FLOORS = null;
      IN_MEMORY_COUNTERS = null;
    }
  } catch (e) {
    debug('ensureDefaults read error (fallback): ' + e.message);
    IN_MEMORY_FLOORS = ['1st','6th'];
    IN_MEMORY_COUNTERS = [
      { name: 'Kitchen', floor: '1st' }, { name: 'Chana & Corn', floor: '1st' },
      { name: 'Juice', floor: '1st' }, { name: 'Tea', floor: '1st' },
      { name: 'Bread', floor: '1st' }, { name: 'Chat', floor: '1st' },
      { name: 'Shawarma', floor: '1st' }, { name: 'Kitchen', floor: '6th' },
      { name: 'Tea', floor: '6th' }, { name: 'Muntha Masala', floor: '6th' }
    ];
  }
}

/* ---------------- onAuthStateChanged (loads FLOORS after login) ---------------- */
auth.onAuthStateChanged(async (user) => {
  debug('onAuthStateChanged → ' + (user ? user.email : 'null'));

  document.getElementById('auth-section').classList.remove('hidden');
  document.getElementById('app-section').classList.add('hidden');

  if (!user) {
    CURRENT_USER_META = null;
    return;
  }

  try {
    await ensureDefaults();
    await loadFloorsAndCountersToUI();

    const metaDoc = await db.collection('users').doc(user.uid).get();
    if (!metaDoc.exists) {
      debug('User doc missing → showing admin UI');
      CURRENT_USER_META = { role: 'admin', floor: 'NA', counter: 'Admin' };
      document.getElementById('auth-section').classList.add('hidden');
      document.getElementById('app-section').classList.remove('hidden');
      return await showManagerUI();
    }

    CURRENT_USER_META = metaDoc.data();
    document.getElementById('who').textContent = `${CURRENT_USER_META.role.toUpperCase()} — ${CURRENT_USER_META.counter || ''} (${CURRENT_USER_META.floor || ''})`;

    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('app-section').classList.remove('hidden');

    if (CURRENT_USER_META.role === 'counter') {
      await showCounterUI(CURRENT_USER_META, user.uid);
    } else {
      await showManagerUI();
    }

  } catch (e) {
    debug('Auth error: ' + e.message);
  }
});

/* ---------------- LOAD FLOORS & COUNTERS TO UI ---------------- */
async function loadFloorsAndCountersToUI() {
  try {
    debug('Loading floors & counters…');
    let floors = [], counters = [];

    if (IN_MEMORY_FLOORS) {
      floors = IN_MEMORY_FLOORS.slice();
      counters = IN_MEMORY_COUNTERS.slice();
    } else {
      const fSnap = await db.collection('floors').orderBy('name').get();
      floors = fSnap.docs.map(d => d.data().name);
      const cSnap = await db.collection('counters').orderBy('floor').orderBy('name').get();
      counters = cSnap.docs.map(d => ({ name: d.data().name, floor: d.data().floor }));
    }

    // populate floors selects
    ['floorSelect','viewFloor','newFloor','selectFloorForCounter'].forEach(id=>{
      const sel = document.getElementById(id);
      if (!sel) return;
      sel.innerHTML = '';
      if (id === 'viewFloor') sel.appendChild(new Option('All','all'));
      floors.forEach(f=> sel.appendChild(new Option(f,f)));
    });

    if (floors.length) {
      if (document.getElementById('floorSelect')) document.getElementById('floorSelect').value = floors[0];
      if (document.getElementById('newFloor')) document.getElementById('newFloor').value = floors[0];
      if (document.getElementById('selectFloorForCounter')) document.getElementById('selectFloorForCounter').value = floors[0];
    }

    // populate counters for selected floor and viewCounter composite values
    const curFloor = (document.getElementById('floorSelect') && document.getElementById('floorSelect').value) || floors[0] || '';
    if (IN_MEMORY_COUNTERS) {
      const sel = document.getElementById('counterSelect'); sel.innerHTML = '';
      IN_MEMORY_COUNTERS.filter(c=>c.floor===curFloor).forEach(c=>sel.appendChild(new Option(c.name,c.name)));

      const vc = document.getElementById('viewCounter'); vc.innerHTML = '<option value="all">All Counters</option>';
      IN_MEMORY_COUNTERS.forEach(c=>vc.appendChild(new Option(`${c.name} (${c.floor})`, `${c.floor}|||${c.name}`)));

      const nf = document.getElementById('newFloor').value;
      const na = document.getElementById('newAssignCounter'); na.innerHTML = '';
      IN_MEMORY_COUNTERS.filter(c=>c.floor===nf).forEach(c=>na.appendChild(new Option(c.name,c.name)));
    } else {
      await populateCountersForFloor(curFloor);
      await populateViewCounterOptions();
      await populateAssignCounterOptions(document.getElementById('newFloor').value);
    }

  } catch (e) {
    debug('loadFloorsAndCountersToUI error: ' + e.message);
  }
}

/* ---------------- helper population functions ---------------- */
async function populateCountersForFloor(floor) {
  try {
    const sel = document.getElementById('counterSelect'); sel.innerHTML = '';
    const snap = await db.collection('counters').where('floor','==',floor).orderBy('name').get();
    snap.forEach(d=> sel.appendChild(new Option(d.data().name, d.data().name)));
  } catch (e) { debug('populateCountersForFloor error: ' + e.message); }
}
async function populateViewCounterOptions() {
  try {
    const sel = document.getElementById('viewCounter'); sel.innerHTML = '<option value="all">All Counters</option>';
    const snap = await db.collection('counters').orderBy('floor').orderBy('name').get();
    snap.forEach(d=> sel.appendChild(new Option(`${d.data().name} (${d.data().floor})`, `${d.data().floor}|||${d.data().name}`)));
  } catch (e) { debug('populateViewCounterOptions error: ' + e.message); }
}
async function populateAssignCounterOptions(floor) {
  try {
    const sel = document.getElementById('newAssignCounter'); sel.innerHTML = '';
    const snap = await db.collection('counters').where('floor','==',floor).orderBy('name').get();
    snap.forEach(d=> sel.appendChild(new Option(d.data().name, d.data().name)));
  } catch (e) { debug('populateAssignCounterOptions error: ' + e.message); }
}

/* ---------------- UI wiring ---------------- */
function wireEvents() {
  document.getElementById('loginBtn').addEventListener('click', loginHandler);
  document.getElementById('logoutBtn').addEventListener('click', ()=> auth.signOut());
  document.getElementById('addRowBtn').addEventListener('click', addEmptyRow);
  document.getElementById('saveEntryBtn').addEventListener('click', saveEntryHandler);
  document.getElementById('pdfBtn').addEventListener('click', exportPdfFromUI);
  document.getElementById('excelBtn').addEventListener('click', exportExcelFromUI);
  document.getElementById('createFloorBtn').addEventListener('click', createFloorHandler);
  document.getElementById('createCounterBtn').addEventListener('click', createCounterHandler);
  document.getElementById('createUserBtn').addEventListener('click', createCounterUserHandler);
  document.getElementById('viewFloor').addEventListener('change', async ()=> { await reloadViewCounters(); await loadAllEntries(); });
  document.getElementById('refreshView').addEventListener('click', loadAllEntries);
  document.getElementById('downloadFilteredExcel').addEventListener('click', downloadFilteredExcel);
  document.getElementById('newFloor').addEventListener('change', ()=> populateAssignCounterOptions(document.getElementById('newFloor').value));
}

/* ---------------- auth actions ---------------- */
async function loginHandler() {
  setText('loginError','');
  const email = document.getElementById('email').value.trim();
  const pass = document.getElementById('password').value;
  try { await auth.signInWithEmailAndPassword(email, pass); debug('Login success'); }
  catch (e) { setText('loginError', e.message); debug('Login failed: '+e.message); }
}

/* ---------------- table helpers ---------------- */
function addEmptyRow() {
  const tbody = document.querySelector('#stockTable tbody');
  const tr = document.createElement('tr');
  for (let i=0;i<9;i++){
    const td = document.createElement('td'); td.contentEditable = true; td.innerHTML = ''; tr.appendChild(td);
  }
  tbody.appendChild(tr);
}
function clearTable() { document.querySelector('#stockTable tbody').innerHTML = ''; addEmptyRow(); addEmptyRow(); }
function readTableRows(){
  const rows=[]; const trs = document.querySelectorAll('#stockTable tbody tr'); let s=1;
  trs.forEach(tr=>{
    const cells=[...tr.children].map(t=>t.textContent.trim());
    if (cells.every(c=>c==='')) return;
    rows.push({sno:s++, item:cells[1]||'', batch:cells[2]||'', receivingDate:cells[3]||'', mfgDate:cells[4]||'', expiryDate:cells[5]||'', shelfLife:cells[6]||'', qty:cells[7]||'', remarks:cells[8]||''});
  });
  return rows;
}

/* ---------------- save entry ---------------- */
async function saveEntryHandler() {
  try {
    const user = auth.currentUser; if (!user) return alert('Not signed in');
    const userDoc = await db.collection('users').doc(user.uid).get(); if (!userDoc.exists) return alert('User metadata missing');
    const userMeta = userDoc.data();
    const rows = readTableRows(); if (rows.length===0) return alert('Add at least one row');

    const selFloor = document.getElementById('floorSelect').value; const selCounter = document.getElementById('counterSelect').value;
    if (userMeta.role === 'counter' && (userMeta.floor !== selFloor || userMeta.counter !== selCounter)) return alert('You can only submit entries for your assigned floor and counter.');

    const entry = { createdBy:user.uid, creatorEmail:user.email, floor:selFloor, counter:selCounter, date:document.getElementById('entryDate').value || new Date().toISOString().slice(0,10), rows, timestamp: firebase.firestore.FieldValue.serverTimestamp() };
    await db.collection('entries').add(entry);
    debug('Entry saved for '+selCounter+' by '+user.email);
    await loadMyEntries(user.uid);
    clearTable();
  } catch (e) { debug('saveEntryHandler error: '+e.message); alert('Save failed: '+e.message); }
}

/* ---------------- load my entries (staff) ---------------- */
async function loadMyEntries(uid) {
  try {
    const div = document.getElementById('history'); div.innerHTML = '';
    const snap = await db.collection('entries').where('createdBy','==',uid).orderBy('timestamp','desc').limit(50).get();
    snap.forEach(doc => {
      const d = doc.data(); const wrapper = document.createElement('div'); wrapper.className='entry';
      wrapper.innerHTML = `<strong>${d.counter} — ${d.date}</strong><br>${d.rows.length} items`;
      div.appendChild(wrapper);
    });
  } catch (e) { debug('loadMyEntries error: '+e.message); }
}

/* ---------------- load all entries (admin) ---------------- */
async function loadAllEntries(){
  try {
    const container = document.getElementById('allEntries'); container.innerHTML = '';
    const selFloor = document.getElementById('viewFloor').value;
    const selCounterRaw = document.getElementById('viewCounter').value; // composite
    let q = db.collection('entries').orderBy('timestamp','desc');

    if (selFloor && selFloor !== 'all') {
      q = q.where('floor','==',selFloor);
      if (selCounterRaw && selCounterRaw !== 'all') {
        const parts = selCounterRaw.split('|||'); if (parts[0] === selFloor) q = q.where('counter','==',parts[1]);
        else { debug('Selected counter does not match floor — ignoring counter filter'); }
      }
    } else {
      if (selCounterRaw && selCounterRaw !== 'all') { alert('Please select a floor first to filter by a specific counter.'); return; }
    }

    const snap = await q.get();
    snap.forEach(doc => {
      const d = doc.data(); const div = document.createElement('div'); div.className='entry';
      div.innerHTML = `<strong>${d.counter} (${d.floor}) — ${d.date}</strong><br>${d.rows.length} items
        <div style="margin-top:6px"><button onclick="downloadEntryPdf('${doc.id}')">Download PDF</button>
        <button onclick="downloadEntryExcel('${doc.id}')">Download Excel</button></div>`;
      container.appendChild(div);
    });
    debug('loadAllEntries: ' + snap.size);
  } catch (e) { debug('loadAllEntries error: '+e.message); }
}

/* ---------------- PDF & EXCEL ---------------- */
function generatePdfFromEntry(entry){
  try {
    const { jsPDF } = window.jspdf; const doc = new jsPDF('p','pt','a4'); const margin=36;
    const img = new Image(); img.src='./logo.png';
    img.onload = function(){
      const pageWidth = doc.internal.pageSize.getWidth(); const usableWidth = pageWidth - margin*2;
      doc.rect(margin,18,usableWidth,70);
      const logoW = 120; const logoH = (img.height/img.width)*logoW;
      doc.addImage(img,'PNG', margin+8, 22 + (70-logoH)/2, logoW, logoH);
      doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.text('Dry Store Stock Record', margin+logoW+18, 36);
      doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.text('Konarak F&B — Cognizant 12A, Mindspace, Hyderabad', margin+logoW+18, 52);
      doc.setFontSize(9); doc.text(`Floor: ${entry.floor}`, margin + usableWidth - 160, 36);
      doc.text(`Counter: ${entry.counter}`, margin + usableWidth - 160, 50);
      doc.text(`Date: ${entry.date}`, margin + usableWidth - 160, 64);

      const columns = ['S.No','Items','Batch No','Receiving Date','Mfg Date','Expiry','Shelf Life','Stock Qty','Remarks'];
      const rows = entry.rows.map((r,i)=>[i+1, r.item||'', r.batch||'', r.receivingDate||'', r.mfgDate||'', r.expiryDate||'', r.shelfLife||'', r.qty||'', r.remarks||'']);
      doc.autoTable({ head:[columns], body:rows, startY:120, margin:{left:margin,right:margin}, styles:{fontSize:9} });
      doc.save(`DryStore_${entry.counter}_${entry.date}.pdf`);
    };
    img.onerror = function(){ doc.setFontSize(12); doc.text('Dry Store Stock Record', 40, 40); doc.save(`DryStore_${entry.counter}_${entry.date}.pdf`); };
  } catch (e) { debug('generatePdfFromEntry error: '+e.message); alert('PDF failed: '+e.message); }
}
async function downloadEntryPdf(id){ try { const docRef = await db.collection('entries').doc(id).get(); if (!docRef.exists) return alert('Entry not found'); generatePdfFromEntry(docRef.data()); } catch(e){ debug('downloadEntryPdf error: '+e.message); } }

function exportJsonToExcel(jsonRows, filename){ const ws = XLSX.utils.json_to_sheet(jsonRows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1'); XLSX.writeFile(wb, filename); }
async function downloadEntryExcel(id){ try { const docRef = await db.collection('entries').doc(id).get(); if (!docRef.exists) return alert('Entry not found'); const d = docRef.data(); const rows = d.rows.map((r,i)=>({'S.No':i+1,'Item':r.item,'Batch No':r.batch,'Receiving Date':r.receivingDate,'Mfg Date':r.mfgDate,'Expiry':r.expiryDate,'Shelf Life':r.shelfLife,'Stock Qty':r.qty,'Remarks':r.remarks})); exportJsonToExcel(rows, `DryStore_${d.counter}_${d.date}.xlsx`); } catch(e){ debug('downloadEntryExcel error: '+e.message); } }

function exportPdfFromUI(){ const rows = readTableRows(); if (!rows.length) return alert('Add at least one row'); const entry = { date: document.getElementById('entryDate').value, floor: document.getElementById('floorSelect').value, counter: document.getElementById('counterSelect').value, rows }; generatePdfFromEntry(entry); }
function exportExcelFromUI(){ const rows = readTableRows(); if (!rows.length) return alert('Add at least one row'); const mapped = rows.map((r,i)=>({'S.No':r.sno,'Item':r.item,'Batch No':r.batch,'Receiving Date':r.receivingDate,'Mfg Date':r.mfgDate,'Expiry':r.expiryDate,'Shelf Life':r.shelfLife,'Stock Qty':r.qty,'Remarks':r.remarks})); exportJsonToExcel(mapped,'DryStore_Table.xlsx'); }

/* ---------------- admin filtered export ---------------- */
async function downloadFilteredExcel(){
  try {
    const floor = document.getElementById('viewFloor').value;
    const counterRaw = document.getElementById('viewCounter').value;
    const from = document.getElementById('fromDate').value; const to = document.getElementById('toDate').value;
    let q = db.collection('entries').orderBy('timestamp','desc');
    if (floor && floor !== 'all') q = q.where('floor','==',floor);
    if (counterRaw && counterRaw !== 'all') { const parts = counterRaw.split('|||'); if (parts.length===2 && parts[0]===floor) q = q.where('counter','==',parts[1]); }
    const snap = await q.get(); const results=[]; snap.forEach(doc=>{ const d=doc.data(); if (from && d.date < from) return; if (to && d.date > to) return; d.rows.forEach((r,i)=> results.push({'Entry Date':d.date,'Floor':d.floor,'Counter':d.counter,'S.No':i+1,'Item':r.item,'Batch No':r.batch,'Receiving Date':r.receivingDate,'Mfg Date':r.mfgDate,'Expiry Date':r.expiryDate,'Shelf Life':r.shelfLife,'Stock Qty':r.qty,'Remarks':r.remarks,'Created By':d.creatorEmail})); });
    if (!results.length) return alert('No records found for selected filters');
    exportJsonToExcel(results, `DryStore_Export_${floor==='all'?'AllFloors':floor}_${counterRaw==='all'?'All':counterRaw.replace('|||','_')}.xlsx`);
  } catch(e){ debug('downloadFilteredExcel error: '+e.message); }
}

/* ---------------- admin create floor/counter/user ---------------- */
async function createFloorHandler(){ try{ setText('nodeMsg',''); const name=(document.getElementById('newFloorName').value||'').trim(); if (!name){ setText('nodeMsg','Enter floor name'); return; } const exist = await db.collection('floors').where('name','==',name).get(); if (!exist.empty){ setText('nodeMsg','Floor already exists'); return; } await db.collection('floors').add({ name }); setText('nodeMsg','Floor created','green'); document.getElementById('newFloorName').value=''; await loadFloorsAndCountersToUI(); } catch(e){ debug('createFloorHandler error:'+e.message); setText('nodeMsg','Error: '+e.message); } }
async function createCounterHandler(){ try{ setText('nodeMsg',''); const floor=document.getElementById('selectFloorForCounter').value; const name=(document.getElementById('newCounterNameField').value||'').trim(); if(!name){ setText('nodeMsg','Enter counter name'); return; } const exist = await db.collection('counters').where('name','==',name).where('floor','==',floor).get(); if(!exist.empty){ setText('nodeMsg','Counter exists for this floor'); return; } await db.collection('counters').add({ name, floor }); setText('nodeMsg','Counter created','green'); document.getElementById('newCounterNameField').value=''; await loadFloorsAndCountersToUI(); } catch(e){ debug('createCounterHandler error:'+e.message); setText('nodeMsg','Error: '+e.message); } }
async function createCounterUserHandler(){ try{ setText('createMsg',''); const email=(document.getElementById('newEmail').value||'').trim(); const password=(document.getElementById('newPassword').value||'').trim(); const floor=document.getElementById('newFloor').value; const counter=document.getElementById('newAssignCounter').value; if(!email||!password){ setText('createMsg','Provide email & password'); return; } if(!floor||!counter){ setText('createMsg','Assign floor & counter'); return; } const apiKey=firebaseConfig.apiKey; const resp=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password, returnSecureToken: true }) }); const data=await resp.json(); if (data.error) throw new Error(data.error.message||'Could not create user'); const uid=data.localId; await db.collection('users').doc(uid).set({ email, role:'counter', floor, counter, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); setText('createMsg', `Counter user created: ${email}`, 'green'); document.getElementById('newEmail').value=''; document.getElementById('newPassword').value=''; debug('Counter user created: '+email+' (uid='+uid+')'); } catch(e){ debug('createCounterUserHandler error: '+(e.message||e)); setText('createMsg', e.message||'Error creating user'); } }

/* ---------------- expose downloads ---------------- */
window.downloadEntryPdf = downloadEntryPdf; window.downloadEntryExcel = downloadEntryExcel;

/* END OF FILE */
