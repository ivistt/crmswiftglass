// ============================================================
// DATA.JS — глобальное хранилище + запросы через Worker
// ============================================================

const WORKER_URL = 'https://swiftglass-crm.skifchaqwerty.workers.dev';

// Session token хранится в памяти (и localStorage для автологина)
let sessionToken = null;

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Session-Token': sessionToken || '',
  };
}

// ── ORDERS ───────────────────────────────────────────────────

async function sbFetchOrders() {
  const res = await fetch(`${WORKER_URL}/api/orders`, { headers: getHeaders() });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows.map(rowToOrder);
}

async function sbInsertOrder(o) {
  const res = await fetch(`${WORKER_URL}/api/orders`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(orderToRow(o)),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rowToOrder(rows[0]);
}

async function sbUpdateOrder(o) {
  const res = await fetch(`${WORKER_URL}/api/orders/${encodeURIComponent(o.id)}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(orderToRow(o)),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows[0] ? rowToOrder(rows[0]) : o;
}

async function sbDeleteOrder(id) {
  const res = await fetch(`${WORKER_URL}/api/orders/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function sbDeleteDoneOrders() {
  const res = await fetch(`${WORKER_URL}/api/orders/done`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

// ── WORKERS ──────────────────────────────────────────────────

async function sbFetchWorkers() {
  const res = await fetch(`${WORKER_URL}/api/workers`, { headers: getHeaders() });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows.map(rowToWorker);
}

async function sbInsertWorker(w) {
  const res = await fetch(`${WORKER_URL}/api/workers`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(workerToRow(w)),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rowToWorker(rows[0]);
}

async function sbDeleteWorker(id) {
  const res = await fetch(`${WORKER_URL}/api/workers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

// Установка PIN сотруднику (хешируется на стороне Worker)
async function sbSetWorkerPin(workerId, pin) {
  const res = await fetch(`${WORKER_URL}/api/workers/set-pin`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ workerId, pin }),
  });
  if (!res.ok) throw new Error(await res.text());
}

// ── REF DATA ─────────────────────────────────────────────────

async function sbFetchRef(table) {
  const res = await fetch(`${WORKER_URL}/api/ref/${table}`, { headers: getHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadRefData() {
  try {
    const [cars, wh, eq, svc, ps, part, ss] = await Promise.all([
      sbFetchRef('ref_cars'),
      sbFetchRef('ref_warehouses'),
      sbFetchRef('ref_equipment'),
      sbFetchRef('ref_services'),
      sbFetchRef('ref_payment_statuses'),
      sbFetchRef('ref_partners'),
      sbFetchRef('ref_supplier_statuses'),
    ]);
    refCars             = cars;
    refWarehouses       = wh;
    refEquipment        = eq;
    refServices         = svc;
    refPaymentStatuses  = ps.map(s => s.name === 'Борг' ? { ...s, name: 'Долг' } : s);
    refPartners         = part;
    refSupplierStatuses = ss;
  } catch (e) {
    showToast('Ошибка загрузки справочников: ' + e.message, 'error');
  }
}

// ── MAPPERS ──────────────────────────────────────────────────

function rowToOrder(r) {
  const paymentStatus = r.payment_status === 'Борг' ? 'Долг' : r.payment_status;
  return {
    id:              r.id,
    date:            r.date,
    responsible:     r.responsible,
    client:          r.client,
    phone:           r.phone,
    car:             r.car,
    code:            r.code,
    coding:          r.coding,
    warehouse:       r.warehouse,
    equipment:       r.equipment,
    notes:           r.notes,
    mount:           r.mount,
    serviceType:     r.service_type,
    glass:           r.glass,
    molding:         r.molding,
    extraWork:       r.extra_work,
    tatu:            r.tatu,
    toning:          r.toning,
    delivery:        r.delivery       || 0,
    author:          r.author,
    selection:       r.selection,
    paymentStatus:   paymentStatus,
    check:           r.check_sum      || 0,
    debt:            r.debt           || 0,
    total:           r.total          || 0,
    percent10:       r.percent10      || 0,
    percent20:       r.percent20      || 0,
    moldingAuthor:   r.molding_author,
    partner:         r.partner,
    supplierStatus:  r.supplier_status,
    purchase:        r.purchase       || 0,
    income:          r.income         || 0,
    remainder:       r.remainder      || 0,
    paymentMethod:   r.payment_method,
    warehouseDelta:  r.warehouse_delta,
    priceLocked:     r.price_locked,
    time:            r.time,
    statusDone:      r.status_done || false,
    inWork:          r.in_work || false,
  };
}

function orderToRow(o) {
  return {
    id:               o.id,
    date:             o.date,
    responsible:      o.responsible,
    client:           o.client,
    phone:            o.phone,
    car:              o.car,
    code:             o.code,
    coding:           o.coding,
    warehouse:        o.warehouse,
    equipment:        o.equipment,
    notes:            o.notes,
    mount:            Number(o.mount)     || 0,
    service_type:     o.serviceType,
    glass:            Number(o.glass)     || 0,
    molding:          Number(o.molding)   || 0,
    extra_work:       Number(o.extraWork) || 0,
    tatu:             Number(o.tatu)      || 0,
    toning:           Number(o.toning)    || 0,
    delivery:         o.delivery          || 0,
    author:           o.author,
    selection:        o.selection,
    payment_status:   o.paymentStatus,
    check_sum:        o.check             || 0,
    debt:             o.debt              || 0,
    total:            o.total             || 0,
    percent10:        o.percent10         || 0,
    percent20:        o.percent20         || 0,
    molding_author:   o.moldingAuthor,
    partner:          o.partner,
    supplier_status:  o.supplierStatus,
    purchase:         o.purchase          || 0,
    income:           o.income            || 0,
    remainder:        o.remainder         || 0,
    payment_method:   o.paymentMethod,
    warehouse_delta:  o.warehouseDelta,
    price_locked:     o.priceLocked,
    time:             o.time,
    status_done:      o.statusDone || false,
    in_work:          o.inWork     || false,
  };
}

function rowToWorker(r) {
  return {
    id:         r.id,
    name:       r.name,
    role:       r.role       || '',
    systemRole: r.system_role || 'junior',
    note:       r.note       || '',
  };
}

function workerToRow(w) {
  return {
    name:        w.name,
    role:        w.role        || '',
    system_role: w.systemRole  || 'junior',
    note:        w.note        || '',
  };
}

// ── GLOBAL STATE ─────────────────────────────────────────────

const ROLE_LABELS = {
  owner:  '👑 Maks',
  senior: '🔧 Старший специалист',
  junior: '👤 Младший специалист',
};

let currentRole = null;
let currentWorkerName = null;
let workers     = [];
let orders      = [];

let refCars             = [];
let refWarehouses       = [];
let refEquipment        = [];
let refServices         = [];
let refPaymentStatuses  = [];
let refPartners         = [];
let refSupplierStatuses = [];

// ── HELPERS ──────────────────────────────────────────────────

function generateOrderId() {
  const nums = orders.map(o => {
    const m = (o.id || '').match(/SG-(\d+)/);
    return m ? parseInt(m[1]) : 0;
  });
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return 'SG-' + String(next).padStart(4, '0');
}

function canCreateOrder()    { return currentRole === 'owner' || currentRole === 'senior'; }
function canEditPrice(order) {
  if (currentRole === 'owner') return true;
  if (currentRole === 'senior') return !order.priceLocked;
  return false;
}
function canViewClients() { return currentRole === 'owner'; }
function canViewWorkers() { return currentRole === 'owner'; }
function canDeleteOrder() { return currentRole === 'owner'; }

function getClients() {
  const map = {};
  for (const o of orders) {
    if (!o.client) continue;
    const key = o.phone || o.client;
    if (!map[key]) map[key] = { name: o.client, phone: o.phone, orders: [] };
    map[key].orders.push(o);
  }
  if (typeof manualClients !== 'undefined') {
    for (const c of manualClients) {
      const key = c.phone || c.name;
      if (!map[key]) map[key] = { name: c.name, phone: c.phone, orders: [] };
    }
  }
  return Object.values(map);
}

function showToast(msg, type = 'success') {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.style.cssText = `
      position:fixed; bottom:28px; left:50%; transform:translateX(-50%);
      padding:12px 22px; border-radius:12px; font-size:14px; font-weight:600;
      color:#fff; z-index:9999; opacity:0; transition:opacity 0.2s;
      white-space:nowrap; box-shadow:0 4px 16px rgba(0,0,0,0.25);
      font-family:'Manrope',sans-serif;
    `;
    document.body.appendChild(toast);
  }
  toast.style.background = type === 'error' ? '#DC2626' : '#16A34A';
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 2800);
}
