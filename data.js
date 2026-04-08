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
  const body = await res.json();
  const rows = Array.isArray(body) ? body : (body.data ?? body.orders ?? []);
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
  const body = await res.json();
  const rows = Array.isArray(body) ? body : (body.data ?? body.workers ?? []);
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

async function sbInsertWorker(entry) {
  const res = await fetch(`${WORKER_URL}/api/workers`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows && rows.length ? rowToWorker(rows[0]) : null;
}

// Обновление данных сотрудника (роль, формула, пароль)
async function sbUpdateWorker(workerId, updates) {
  const body = {};
  if (updates.systemRole !== undefined) body.system_role    = updates.systemRole;
  if (updates.salaryFormula !== undefined) body.salary_formula = updates.salaryFormula || '';
  if (updates.assistant !== undefined) body.assistant = updates.assistant || '';
  // Пароль обновляется через set-pin если передан
  if (updates.password) {
    await sbSetWorkerPin(workerId, updates.password);
  }
  if (Object.keys(body).length === 0) return;
  const res = await fetch(`${WORKER_URL}/api/workers/${encodeURIComponent(workerId)}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows[0] ? rowToWorker(rows[0]) : null;
}

// ── WORKER PROBLEMS ──────────────────────────────────────────

async function sbFetchWorkerProblems(workerName) {
  const res = await fetch(
    `${WORKER_URL}/api/problems?worker=${encodeURIComponent(workerName)}`,
    { headers: getHeaders() }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbFetchAllProblems() {
  const res = await fetch(`${WORKER_URL}/api/problems/all`, { headers: getHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbInsertWorkerProblem(entry) {
  const res = await fetch(`${WORKER_URL}/api/problems`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows[0];
}

async function sbDeleteWorkerProblem(id) {
  const res = await fetch(`${WORKER_URL}/api/problems/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

// ── WORKER SALARIES ──────────────────────────────────────────

async function sbFetchWorkerSalaries(workerName) {
  const res = await fetch(
    `${WORKER_URL}/api/salaries?worker=${encodeURIComponent(workerName)}`,
    { headers: getHeaders() }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbFetchAllSalaries() {
  const res = await fetch(`${WORKER_URL}/api/salaries/all`, { headers: getHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbFetchSalariesByOrder(orderId) {
  const res = await fetch(
    `${WORKER_URL}/api/salaries/by-order/${encodeURIComponent(orderId)}`,
    { headers: getHeaders() }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbInsertWorkerSalary(entry) {
  const res = await fetch(`${WORKER_URL}/api/salaries`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows[0];
}

async function sbUpdateWorkerSalary(id, amount) {
  const res = await fetch(`${WORKER_URL}/api/salaries/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ amount }),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows[0];
}

async function sbDeleteWorkerSalary(id) {
  const res = await fetch(`${WORKER_URL}/api/salaries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

// ── CASH LOG ─────────────────────────────────────────────────

async function sbFetchCashLog(workerName) {
  const res = await fetch(
    `${WORKER_URL}/api/cash?worker=${encodeURIComponent(workerName)}`,
    { headers: getHeaders() }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbFetchAllCashLog() {
  const res = await fetch(`${WORKER_URL}/api/cash/all`, { headers: getHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbInsertCashEntry(entry) {
  const res = await fetch(`${WORKER_URL}/api/cash`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows[0];
}

// ── REF DATA ─────────────────────────────────────────────────

async function sbFetchRef(table) {
  const res = await fetch(`${WORKER_URL}/api/ref/${table}`, { headers: getHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbFetchRefOptional(table) {
  try {
    return await sbFetchRef(table);
  } catch (e) {
    // если таблица ещё не проксируется воркером — молча возвращаем пустой список
    return [];
  }
}

// -- CAR DIRECTORY --------------------------------------------------
async function sbFetchCarDirectory() {
  const res = await fetch(`${WORKER_URL}/api/car-directory`, { headers: getHeaders() });
  if (!res.ok) throw new Error(await res.text());
  const body = await res.json();
  return Array.isArray(body) ? body : (body.data ?? []);
}

async function sbUpsertCarDirectory(model, eurocode) {
  const res = await fetch(`${WORKER_URL}/api/car-directory`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ model, eurocode }),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows[0];
}

async function sbUpdateCarDirectory(id, model, eurocode) {
  const res = await fetch(`${WORKER_URL}/api/car-directory/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ model, eurocode }),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows[0];
}

async function sbDeleteCarDirectory(id) {
  const res = await fetch(`${WORKER_URL}/api/car-directory/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function loadRefData() {
  try {
    const [cars, wh, eq, svc, ps, part, ss, carDir, drops] = await Promise.all([
      sbFetchRefOptional('ref_cars'),
      sbFetchRefOptional('ref_warehouses'),
      sbFetchRefOptional('ref_equipment'),
      sbFetchRefOptional('ref_services'),
      sbFetchRefOptional('ref_payment_statuses'),
      sbFetchRefOptional('ref_partners'),
      sbFetchRefOptional('ref_supplier_statuses'),
      sbFetchCarDirectory().catch(() => []),
      sbFetchRefOptional('ref_dropshippers'),
    ]);
    refCars             = cars;
    refWarehouses       = wh;
    refEquipment        = eq;
    refServices         = svc;
    refPaymentStatuses  = ps.map(s => s.name === 'Борг' ? { ...s, name: 'Долг' } : s);
    refPartners         = part;
    refSupplierStatuses = ss;
    carDirectory        = carDir;
    refDropshippers     = drops;
  } catch (e) {
    showToast('Ошибка загрузки справочников: ' + e.message, 'error');
  }
}

// ── MAPPERS ──────────────────────────────────────────────────

function rowToOrder(r) {
  if (!r) return {};
  let paymentStatus = r.payment_status || '';
  if (paymentStatus === 'Борг') paymentStatus = 'Не оплачено';
  if (paymentStatus === 'Рассчитано') paymentStatus = 'Оплачено';
  return {
    id:              r.id,
    date:            r.date,
    responsible:     r.responsible,
    client:          r.client,
    phone:           r.phone,
    address:         r.address || '',
    car:             r.car,
    code:            r.code,
    notes:           r.notes,
    mount:           r.mount,
    serviceType:     r.service_type,
    molding:         r.molding,
    extraWork:       r.extra_work,
    tatu:            r.tatu,
    toning:          r.toning,
    delivery:        r.delivery       || 0,
    author:          r.author,
    selection:       r.selection, // legacy, column может отсутствовать
    paymentStatus:   paymentStatus,
    check:           r.check_sum      || 0,
    debt:            r.debt           || 0,
    debtDate:        r.debt_date      || '',
    total:           r.total          || 0,
    percent10:       r.percent10      || 0, // legacy
    percent20:       r.percent20      || 0, // legacy
    moldingAuthor:   r.molding_author,
    partner:         r.partner,
    supplierStatus:  r.supplier_status,
    purchase:        r.purchase       || 0,
    income:          r.income         || 0,
    remainder:       r.remainder      || 0,
    paymentMethod:   r.payment_method,
    warehouse:       r.warehouse,
    warehouseCode:   r.warehouse_code,
    configuration:   r.configuration,
    warehouseDelta:  r.warehouse_delta,
    dropshipper:     r.drop_shipper,
    dropshipperPayout: r.drop_shipper_payout || 0,
    toningExternal:  r.toning_external || false,
    marginTotal:     r.margin_total || 0,
    payoutManagerGlass:   r.payout_manager_glass || 0,
    payoutRespGlass:      r.payout_resp_glass || 0,
    payoutLesha:          r.payout_lesha || 0,
    payoutRoma:           r.payout_roma || 0,
    payoutExtraResp:      r.payout_extra_resp || 0,
    payoutExtraAssist:    r.payout_extra_assist || 0,
    payoutMoldingResp:    r.payout_molding_resp || 0,
    payoutMoldingAssist:  r.payout_molding_assist || 0,
    priceLocked:     r.price_locked,
    time:            r.time,
    statusDone:      r.status_done || false,
    inWork:          r.in_work || false,
    workerDone:      r.worker_done || false,
    assistant:       r.assistant || '',
    isCancelled:     r.is_cancelled || false,
    manager:         r.manager || '',
  };
}

function orderToRow(o) {
  return {
    id:               o.id,
    date:             o.date,
    responsible:      o.responsible,
    client:           o.client,
    phone:            o.phone,
    address:          o.address || null,
    car:              o.car,
    code:             o.code,
    notes:            o.notes,
    mount:            Number(o.mount)     || 0,
    service_type:     o.serviceType,
    molding:          Number(o.molding)   || 0,
    extra_work:       Number(o.extraWork) || 0,
    tatu:             Number(o.tatu)      || 0,
    toning:           Number(o.toning)    || 0,
    delivery:         o.delivery          || 0,
    author:           o.author,
    payment_status:   o.paymentStatus,
    check_sum:        o.check             || 0,
    debt:             o.debt              || 0,
    debt_date:        o.debtDate          || null,
    total:            o.total             || 0,
    molding_author:   o.moldingAuthor,
    partner:          o.partner,
    supplier_status:  o.supplierStatus,
    purchase:         o.purchase          || 0,
    income:           o.income            || 0,
    remainder:         o.remainder          || 0,
    payment_method:    o.paymentMethod,
    warehouse:         o.warehouse,
    warehouse_code:    o.warehouseCode,
    configuration:     o.configuration,
    drop_shipper:      o.dropshipper || null,
    drop_shipper_payout: o.dropshipperPayout || 0,
    toning_external:    o.toningExternal || false,
    margin_total:       o.marginTotal || 0,
    payout_manager_glass:   o.payoutManagerGlass || 0,
    payout_resp_glass:      o.payoutRespGlass || 0,
    payout_lesha:          o.payoutLesha || 0,
    payout_roma:           o.payoutRoma || 0,
    payout_extra_resp:     o.payoutExtraResp || 0,
    payout_extra_assist:   o.payoutExtraAssist || 0,
    payout_molding_resp:   o.payoutMoldingResp || 0,
    payout_molding_assist: o.payoutMoldingAssist || 0,
    price_locked:      o.priceLocked,
    time:              o.time,
    status_done:      o.statusDone || false,
    in_work:          o.inWork     || false,
    worker_done:      o.workerDone || false,
    assistant:        o.assistant  || null,
    is_cancelled:     o.isCancelled || false,
    manager:          o.manager    || null,
  };
}

function rowToWorker(r) {
  return {
    id:            r.id,
    name:          r.name,
    role:          r.role          || '',
    systemRole:    r.system_role   || 'junior',
    note:          r.note          || '',
    salaryFormula: r.salary_formula || '',
    assistant:     r.assistant     || '',
  };
}

function workerToRow(w) {
  return {
    name:           w.name,
    role:           w.role          || '',
    system_role:    w.systemRole    || 'junior',
    note:           w.note          || '',
    salary_formula: w.salaryFormula || '',
    assistant:      w.assistant     || '',
  };
}

// ── WORKER FORMULA API ───────────────────────────────────────

async function sbUpdateWorkerFormula(workerId, formula) {
  const res = await fetch(`${WORKER_URL}/api/workers/${encodeURIComponent(workerId)}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ salary_formula: formula }),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows[0] ? rowToWorker(rows[0]) : null;
}

// ── РАСЧЁТ ЗАРПЛАТ ───────────────────────────────────────────
//
// Услуги = mount + molding + extraWork + tatu + toning
// Маржа стекла = income - purchase  (income = продажная цена стекла)
//
// Именованные правила (имя сотрудника → логика):
//
//   Костя, Саша Смоков (senior):
//     800 ставка + 10% от маржи стекла + 20% от услуг
//
//   Прочие senior/extra (без ставки):
//     10% от маржи стекла + 20% от услуг
//
//   Рома (junior особый):
//     500 ставка + 20% от услуг
//     + если в заказе есть тату → ещё 20% от tatu (даже если его нет в заказе)
//     ВАЖНО: начисление Роме за тату обрабатывается отдельно в _upsertOrderSalaries
//
//   Артём (junior):
//     500 ставка + 20% от услуг у Артёма (как ответственного)
//     У других: 20% от услуг (без ставки у Артёма как ассистента)
//     → по факту: 500 + 20% если он responsible, 20% если assistant
//
//   Лёша (junior):
//     20% от услуг
//
//   Серёжа, Витя, Саша Дога (junior):
//     15% от услуг
//
//   Саша Менеджер (manager):
//     800 ставка + 10% от маржи стекла (если он указан в поле manager заказа)
//     ВАЖНО: обрабатывается отдельно в _upsertOrderSalaries
//
//   Остальные junior (дефолт):
//     500 ставка

// Вычисляет «услуги» заказа — без стекла и доставки
function _orderServices(order) {
  return (Number(order.mount)     || 0)
       + (Number(order.molding)   || 0)
       + (Number(order.extraWork) || 0)
       + (Number(order.tatu)      || 0)
       + (Number(order.toning)    || 0);
}

// Вычисляет маржу стекла: продажная минус закупочная
function _orderGlassMargin(order) {
  const income   = Number(order.income)   || 0;
  const purchase = Number(order.purchase) || 0;
  return Math.max(0, income - purchase);
}

// ЗП за заказ для конкретного участника (responsible или assistant).
// Для Ромы тату-бонус считается отдельно (_calcRomaTatuBonus).
function calcOrderSalary(workerName, order) {
  const services    = _orderServices(order);
  const glassMargin = _orderGlassMargin(order);
  const isResp      = order.responsible === workerName;

  // ── Старшие специалисты ──────────────────────────────────
  // Костя и Саша Смоков — ставка 800 + 10% маржа стекла + 20% услуги
  if (['Костя', 'Саша Смоков'].includes(workerName)) {
    return 800 + Math.round(glassMargin * 0.10) + Math.round(services * 0.20);
  }

  // Прочие senior/extra — 10% маржа стекла + 20% услуги (без ставки)
  const w = workers.find(x => x.name === workerName);
  if (w && (w.systemRole === 'senior' || w.systemRole === 'extra')) {
    return Math.round(glassMargin * 0.10) + Math.round(services * 0.20);
  }

  // ── Младшие специалисты ───────────────────────────────────

  // Рома: 500 ставка + 20% от услуг (тату-бонус считается отдельно)
  if (workerName === 'Рома') {
    return 500 + Math.round(services * 0.20);
  }

  // Артём: 500 ставка если responsible, + 20% от услуг у Артёма
  if (workerName === 'Артём') {
    const base = isResp ? 500 : 0;
    return base + Math.round(services * 0.20);
  }

  // Лёша: 20% от услуг
  if (workerName === 'Лёша') {
    return Math.round(services * 0.20);
  }

  // Серёжа, Витя, Саша Дога: 15% от услуг
  if (['Серёжа', 'Витя', 'Саша Дога'].includes(workerName)) {
    return Math.round(services * 0.15);
  }

  // Дефолт junior: 500 ставка
  return 500;
}

// Тату-бонус Роме: 20% от tatu, начисляется всегда если tatu > 0
function _calcRomaTatuBonus(order) {
  const tatu = Number(order.tatu) || 0;
  if (tatu <= 0) return 0;
  return Math.round(tatu * 0.20);
}

// ЗП менеджера (Саша Менеджер): 800 ставка + 10% от маржи стекла
// Начисляется только если он указан в поле order.manager
function _calcManagerSalary(order) {
  const glassMargin = _orderGlassMargin(order);
  return 800 + Math.round(glassMargin * 0.10);
}

// Итоговая зп за день (используется в profile для совместимости)
function calcDaySalary(workerName, date) {
  return orders
    .filter(o => o.workerDone && !o.isCancelled && o.date === date && (o.responsible === workerName || o.assistant === workerName))
    .reduce((sum, o) => sum + calcOrderSalary(workerName, o), 0);
}

// ── GLOBAL STATE ─────────────────────────────────────────────

const ROLE_LABELS = {
  owner:   '👑 Владелец',
  manager: '📋 Менеджер',
  senior:  '🔧 Старший специалист',
  junior:  '👤 Младший специалист',
  extra:   '⭐ Экстра специалист',
};

let currentRole = null;
let currentWorkerName = null;
let workers     = [];
let orders      = [];

let refCars             = [];
let refWarehouses       = [];
let refDropshippers     = [];
let carDirectory        = []; // справочник авто
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

function canCreateOrder()    { return currentRole === 'owner' || currentRole === 'manager'; }
function canEditPrice(order) {
  if (currentRole === 'owner') return true;
  if (currentRole === 'manager') return true;
  if (currentRole === 'extra') {
    if (order && (order.responsible === currentWorkerName || order.assistant === currentWorkerName)) return true;
    return !order.priceLocked;
  }
  if (currentRole === 'senior') return !order.priceLocked;
  return false;
}
function canViewClients()  { return currentRole === 'owner' || currentRole === 'manager'; }
function canViewWorkers()  { return currentRole === 'owner'; }
function canDeleteOrder()  { return currentRole === 'owner'; }
function canViewFinance()  { return currentRole === 'owner'; }
function canMarkWorkerDone() { return currentRole === 'senior' || currentRole === 'extra'; }

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
      position:fixed; bottom:96px; left:50%; transform:translateX(-50%);
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
