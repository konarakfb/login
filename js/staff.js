// staff.js
document.addEventListener('DOMContentLoaded', ()=>{ if (location.pathname.endsWith('staff.html')) initStaffPage(); });
async function initStaffPage(){
  document.getElementById('logoutBtn').addEventListener('click', ()=>auth.signOut());
  document.getElementById('saveEntryBtn').addEventListener('click', saveEntry);
  auth.onAuthStateChanged(async user=>{ if(!user) return window.location='index.html'; const metaDoc=await db.collection('users').doc(user.uid).get(); if(!metaDoc.exists) return alert('User meta missing'); const meta=metaDoc.data(); document.getElementById('buildingSelect').innerHTML=`<option>${meta.building||''}</option>`; document.getElementById('floorSelect').innerHTML=`<option>${meta.floor||''}</option>`; document.getElementById('counterSelect').innerHTML=`<option>${meta.counter||''}</option>`; await loadStaffEntries(user.uid); });
}
async function saveEntry(){
  const user=auth.currentUser; if(!user) return alert('login');
  const meta=(await db.collection('users').doc(user.uid).get()).data();
  const row={ item:document.getElementById('item').value.trim(), batch:document.getElementById('batch').value.trim(), receivingDate:document.getElementById('receivingDate').value||'', mfgDate:document.getElementById('mfgDate').value||'', expiryDate:document.getElementById('expiryDate').value||'', shelfLife:document.getElementById('shelfLife').value||'', qty:document.getElementById('qty').value||'', remarks:document.getElementById('remarks').value||'' };
  if(!row.item) return alert('Enter item');
  const entry={ createdBy:user.uid, creatorEmail:user.email, building:meta.building||'', floor:meta.floor||'', counter:meta.counter||'', date: new Date().toISOString().slice(0,10), rows:[row], timestamp: firebase.firestore.FieldValue.serverTimestamp() };
  await db.collection('entries').add(entry);
  alert('Saved'); clearForm(); await loadStaffEntries(user.uid);
}
function clearForm(){ ['item','batch','receivingDate','mfgDate','expiryDate','shelfLife','qty','remarks'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; }); }
async function loadStaffEntries(uid){ const container=document.getElementById('staffEntries'); container.innerHTML=''; const snap=await db.collection('entries').where('createdBy','==',uid).orderBy('timestamp','desc').get(); const cutoff=new Date(Date.now()-7*24*60*60*1000).toISOString().slice(0,10); const rows=[]; snap.forEach(d=>{ const data=d.data(); if(data.date<cutoff) return; (data.rows||[]).forEach(r=>rows.push({Date:data.date,Item:r.item,'Batch No':r.batch,'Receiving Date':r.receivingDate,'Mfg Date':r.mfgDate,'Expiry Date':r.expiryDate,'Shelf Life':r.shelfLife,'Qty':r.qty,'Remarks':r.remarks})); }); if(rows.length) container.appendChild(createTableFromArray(Object.keys(rows[0]).map(k=>({key:k,label:k})), rows)); else container.textContent='No entries in last 7 days'; }
