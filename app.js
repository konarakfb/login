// app.js
// Self-contained front-end data + UI logic using localStorage.
// Replace saving/loading with backend calls where noted below.

const STORAGE_KEY = "cafeteriaData_v1";

// Seed data (used when no data in localStorage)
const seedData = {
  admins: [
    {
      id: "admin-1",
      name: "Cognizant Hyderabad",
      floors: [
        { id: "floor-1", name: "Ground Floor", counters: [{ id: "counter-1", name: "Main Counter" }, { id: "counter-2", name: "Beverages" }] },
        { id: "floor-2", name: "First Floor", counters: [{ id: "counter-3", name: "Snacks" }] }
      ]
    },
    {
      id: "admin-2",
      name: "CBRE Office",
      floors: [
        { id: "floor-3", name: "Floor A", counters: [{ id: "counter-4", name: "Stall 1" }] }
      ]
    }
  ],
  users: []
};

let data = {};

// Utility helpers
function genId(prefix="id") {
  return `${prefix}-${Math.random().toString(36).slice(2,9)}`;
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  console.info("Data saved to localStorage.");
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    data = JSON.parse(JSON.stringify(seedData));
    saveData();
  } else {
    try {
      data = JSON.parse(raw);
    } catch(e) {
      data = JSON.parse(JSON.stringify(seedData));
      saveData();
    }
  }
}

// DOM refs
const adminSelect = document.getElementById("adminSelect");
const floorSelect = document.getElementById("floorSelect");
const counterSelect = document.getElementById("counterSelect");
const createFloorBtn = document.getElementById("createFloorBtn");
const createCounterBtn = document.getElementById("createCounterBtn");
const newFloorName = document.getElementById("newFloorName");
const newCounterName = document.getElementById("newCounterName");
const addAdminBtn = document.getElementById("addAdminBtn");

const roleSelect = document.getElementById("roleSelect");
const managerAssignment = document.getElementById("managerAssignment");
const mgrFloorSelect = document.getElementById("mgrFloorSelect");
const mgrCounterSelect = document.getElementById("mgrCounterSelect");

const createUserForm = document.getElementById("createUserForm");

const dumpDataBtn = document.getElementById("dumpDataBtn");
const resetDataBtn = document.getElementById("resetDataBtn");

// Render functions
function clearSelect(sel) {
  sel.innerHTML = "";
}

function renderAdminDropdown() {
  clearSelect(adminSelect);
  data.admins.forEach(admin => {
    const opt = document.createElement("option");
    opt.value = admin.id;
    opt.textContent = admin.name;
    adminSelect.appendChild(opt);
  });
  // Select first by default
  if (adminSelect.options.length > 0) adminSelect.selectedIndex = 0;
  // propagate selection
  renderFloorDropdown();
  renderMgrFloorDropdown();
}

function getCurrentAdmin() {
  const adminId = adminSelect.value;
  return data.admins.find(a => a.id === adminId);
}

function renderFloorDropdown() {
  clearSelect(floorSelect);
  const admin = getCurrentAdmin();
  if (!admin) return;
  admin.floors.forEach(floor => {
    const opt = document.createElement("option");
    opt.value = floor.id;
    opt.textContent = floor.name;
    floorSelect.appendChild(opt);
  });
  if (floorSelect.options.length > 0) floorSelect.selectedIndex = 0;
  renderCounterDropdown();
  renderMgrFloorDropdown(); // keep manager assignment lists in sync
}

function getCurrentFloor() {
  const admin = getCurrentAdmin();
  if (!admin) return null;
  return admin.floors.find(f => f.id === floorSelect.value);
}

function renderCounterDropdown() {
  clearSelect(counterSelect);
  const admin = getCurrentAdmin();
  if (!admin) return;
  const floor = admin.floors.find(f => f.id === floorSelect.value) || admin.floors[0];
  if (!floor) return;
  floor.counters.forEach(counter => {
    const opt = document.createElement("option");
    opt.value = counter.id;
    opt.textContent = counter.name;
    counterSelect.appendChild(opt);
  });
  if (counterSelect.options.length > 0) counterSelect.selectedIndex = 0;
  renderMgrCounterDropdown(); // keep manager assignment lists in sync
}

// Manager assignment lists (separate selects in Create User area)
function renderMgrFloorDropdown() {
  clearSelect(mgrFloorSelect);
  const admin = getCurrentAdmin();
  if (!admin) {
    const opt = document.createElement("option");
    opt.textContent = "Select admin first";
    mgrFloorSelect.appendChild(opt);
    return;
  }
  admin.floors.forEach(f => {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.name;
    mgrFloorSelect.appendChild(opt);
  });
  if (mgrFloorSelect.options.length > 0) mgrFloorSelect.selectedIndex = 0;
  renderMgrCounterDropdown();
}

function renderMgrCounterDropdown() {
  clearSelect(mgrCounterSelect);
  const admin = getCurrentAdmin();
  if (!admin) return;
  const floorId = mgrFloorSelect.value || (admin.floors[0] && admin.floors[0].id);
  const floor = admin.floors.find(f => f.id === floorId);
  if (!floor || floor.counters.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = "No counters";
    mgrCounterSelect.appendChild(opt);
    return;
  }
  floor.counters.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    mgrCounterSelect.appendChild(opt);
  });
  if (mgrCounterSelect.options.length > 0) mgrCounterSelect.selectedIndex = 0;
}

// Create handlers
function onCreateFloor() {
  const name = newFloorName.value.trim();
  if (!name) {
    alert("Enter floor name");
    return;
  }
  const admin = getCurrentAdmin();
  if (!admin) return alert("Select admin/site first");

  const newFloor = { id: genId("floor"), name, counters: [] };
  admin.floors.push(newFloor);
  saveData();
  renderFloorDropdown();
  newFloorName.value = "";
  alert(`Floor "${name}" created under ${admin.name}`);
}

function onCreateCounter() {
  const name = newCounterName.value.trim();
  if (!name) {
    alert("Enter counter name");
    return;
  }
  const admin = getCurrentAdmin();
  if (!admin) return alert("Select admin/site first");

  // choose floor to add counter to (use selected floor)
  const floor = admin.floors.find(f => f.id === floorSelect.value) || admin.floors[0];
  if (!floor) return alert("No floor available. Create a floor first.");

  const newCounter = { id: genId("counter"), name };
  floor.counters.push(newCounter);
  saveData();
  renderCounterDropdown();
  renderMgrCounterDropdown();
  newCounterName.value = "";
  alert(`Counter "${name}" created on ${floor.name}`);
}

function onAddAdmin() {
  const name = prompt("Enter new admin/site name:");
  if (!name) return;
  const newAdmin = { id: genId("admin"), name: name.trim(), floors: [] };
  data.admins.push(newAdmin);
  saveData();
  renderAdminDropdown();
  alert(`Admin/site "${name}" added`);
}

// Create user
function onRoleChange() {
  const role = roleSelect.value;
  if (role === "Manager") {
    managerAssignment.classList.remove("hidden");
    renderMgrFloorDropdown();
  } else {
    managerAssignment.classList.add("hidden");
  }
}

function onMgrFloorChange() {
  renderMgrCounterDropdown();
}

function onCreateUser(e) {
  e.preventDefault();
  const name = document.getElementById("userName").value.trim();
  const email = document.getElementById("userEmail").value.trim();
  const role = roleSelect.value;

  if (!name || !email) return alert("Name and email required");

  const user = { id: genId("user"), name, email, role };

  // If manager, attach admin/floor/counter
  if (role === "Manager") {
    const admin = getCurrentAdmin();
    if (!admin) return alert("Select admin/site first");
    const floorId = mgrFloorSelect.value;
    const counterId = mgrCounterSelect.value;
    user.adminId = admin.id;
    user.floorId = floorId;
    user.counterId = counterId;
  }

  data.users.push(user);
  saveData();
  createUserForm.reset();
  managerAssignment.classList.add("hidden");
  alert(`User "${name}" created as ${role}`);
  console.log("Users:", data.users);
}

// Debug handlers
function dumpData() {
  console.log("Current data:", data);
  alert("Data dumped to console (open devtools)");
}

function resetToSeed() {
  if (!confirm("Reset local data to default seed? This will overwrite local changes.")) return;
  data = JSON.parse(JSON.stringify(seedData));
  saveData();
  renderAll();
  alert("Reset done.");
}

// Initialize all UI
function renderAll() {
  renderAdminDropdown();
  renderFloorDropdown();
  renderCounterDropdown();
  onRoleChange();
}

function init() {
  loadData();
  // Initial renders
  renderAll();

  // Event listeners
  adminSelect.addEventListener("change", () => {
    renderFloorDropdown();
    renderCounterDropdown();
    renderMgrFloorDropdown();
  });

  floorSelect.addEventListener("change", () => {
    renderCounterDropdown();
  });

  createFloorBtn.addEventListener("click", onCreateFloor);
  createCounterBtn.addEventListener("click", onCreateCounter);
  addAdminBtn.addEventListener("click", onAddAdmin);

  roleSelect.addEventListener("change", onRoleChange);
  mgrFloorSelect.addEventListener("change", onMgrFloorChange);

  createUserForm.addEventListener("submit", onCreateUser);

  dumpDataBtn.addEventListener("click", dumpData);
  resetDataBtn.addEventListener("click", resetToSeed);

  // Make sure manager assignment is correct on load
  onRoleChange();
}

init();

/* ===== Integration points =====
If you want these actions to call a backend (e.g. Firebase), replace:
 - saveData() -> call backend save and then update local data
 - loadData() -> fetch from backend
 - when creating floor/counter/user -> send create request and then re-fetch data

Example (pseudocode):
firebase.collection('sites').doc(adminId).update({ floors: firebase.firestore.FieldValue.arrayUnion(newFloor) })
Then re-run render functions after success.
================================*/
