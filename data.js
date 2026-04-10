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

// sbInsertWorker — см. ниже (единственное определение)

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
    onlyCut:         r.only_cut || false,
    reworkData:      r.rework_data || {},
    clientPayments:  r.client_payments || [],
    supplierPayments:r.supplier_payments || [],
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
    only_cut:         o.onlyCut || false,
    rework_data:      o.reworkData || {},
    client_payments:  o.clientPayments || [],
    supplier_payments:o.supplierPayments || [],
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
// SALARY_CONFIG — единственное место где задаются условия ЗП.
//
// Структура записи:
//   base            — фикс. ставка за каждый заказ (₴)
//   baseIfResp      — ставка только если сотрудник ответственный (не помощник)
//   glassMarginPct  — % от маржи стекла (income − purchase), число 0–1
//   servicesPct     — % от суммы услуг (mount+molding+extraWork+tatu+toning), число 0–1
//   tatuBonusPct    — % от tatu как отдельный бонус (начисляется поверх)
//
// Специальные ключи:
//   _senior  — дефолт для всех senior/extra которых нет в списке
//   _junior  — дефолт для всех junior которых нет в списке
//   _manager — дефолт для manager (используется в _calcManagerSalary)
//
// ЗП = base + baseIfResp(если responsible) + glassMargin*glassMarginPct + services*servicesPct
// Тату-бонус (tatuBonusPct) начисляется отдельно через _calcTatuBonus и не входит в calcOrderSalary.

const SALARY_CONFIG = {
  // ── Старшие специалисты ──────────────────────────────────
  'Костя':      { base: 800, glassMarginPct: 0.10, servicesPct: 0.20 },
  'Саша Смоков':{ base: 800, glassMarginPct: 0.10, servicesPct: 0.20 },

  // ── Младшие специалисты ───────────────────────────────────
  'Рома':       { base: 500, servicesPct: 0.20, tatuBonusPct: 0.20 },
  'Артём':      { baseIfResp: 500, servicesPct: 0.20 },
  'Лёша':       { servicesPct: 0.20 },
  'Серёжа':     { servicesPct: 0.15 },
  'Витя':       { servicesPct: 0.15 },
  'Саша Дога':  { servicesPct: 0.15 },

  // ── Менеджеры ─────────────────────────────────────────────
  'Саша Менеджер': { base: 800, glassMarginPct: 0.10 },

  // ── Дефолты по роли ──────────────────────────────────────
  _senior:  { glassMarginPct: 0.10, servicesPct: 0.20 },
  _junior:  { base: 500 },
  _manager: { base: 800, glassMarginPct: 0.10 },
};

// Возвращает конфиг ЗП для сотрудника с учётом дефолта по роли
function getSalaryRule(workerName) {
  if (SALARY_CONFIG[workerName]) return SALARY_CONFIG[workerName];
  const w = workers.find(x => x.name === workerName);
  if (!w) return SALARY_CONFIG._junior;
  if (w.systemRole === 'senior' || w.systemRole === 'extra') return SALARY_CONFIG._senior;
  if (w.systemRole === 'manager') return SALARY_CONFIG._manager;
  return SALARY_CONFIG._junior;
}

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

function _workerParticipatesInOrder(order, workerName) {
  if (!order || !workerName) return false;
  return order.responsible === workerName
      || order.assistant === workerName
      || order.manager === workerName
      || order.reworkData?.responsible === workerName
      || order.reworkData?.assistant === workerName;
}

function _workerIsResponsibleInOrder(order, workerName) {
  if (!order || !workerName) return false;
  return order.responsible === workerName || order.reworkData?.responsible === workerName;
}

function _getCompletedOrdersForWorkerDate(workerName, date) {
  return orders.filter(o =>
    o.workerDone &&
    !o.isCancelled &&
    o.date === date &&
    _workerParticipatesInOrder(o, workerName)
  );
}

function calcDailyBaseSalary(workerName, date) {
  const rule = getSalaryRule(workerName);
  const dayOrders = _getCompletedOrdersForWorkerDate(workerName, date);
  if (!dayOrders.length) return 0;

  let amount = rule.base || 0;
  if ((rule.baseIfResp || 0) > 0 && dayOrders.some(o => _workerIsResponsibleInOrder(o, workerName))) {
    amount += rule.baseIfResp || 0;
  }
  return amount;
}

// ЗП за заказ для конкретного участника (responsible или assistant).
// Тату-бонус (tatuBonusPct) считается отдельно через _calcTatuBonus.
function calcOrderSalary(workerName, order) {
  const rule        = getSalaryRule(workerName);
  const services    = _orderServices(order);
  const glassMargin = _orderGlassMargin(order);
  const fromGlass   = Math.round(glassMargin * (rule.glassMarginPct || 0));
  const fromServ    = Math.round(services    * (rule.servicesPct    || 0));

  let finalSalary = fromGlass + fromServ;
  if (order.onlyCut) finalSalary = Math.round(finalSalary / 2);

  return finalSalary;
}

// ЗП за доработку
function calcReworkSalary(workerName, reworkData) {
  if (!reworkData) return 0;
  const rule = getSalaryRule(workerName);
  const services = (Number(reworkData.mount) || 0)
                 + (Number(reworkData.molding) || 0)
                 + (Number(reworkData.extraWork) || 0)
                 + (Number(reworkData.tatu) || 0)
                 + (Number(reworkData.toning) || 0);

  let finalSalary = Math.round(services * (rule.servicesPct || 0));
  return finalSalary;
}

// Тату-бонус: начисляется если в конфиге есть tatuBonusPct и в заказе есть tatu
function _calcTatuBonus(workerName, order) {
  const rule = getSalaryRule(workerName);
  if (!rule.tatuBonusPct) return 0;
  
  const tatu = Number(order.tatu) || 0;
  const tatuBonusMain = (tatu > 0) ? Math.round(tatu * rule.tatuBonusPct) : 0;
  
  const reworkTatu = Number(order.reworkData?.tatu) || 0;
  const tatuBonusRework = (reworkTatu > 0) ? Math.round(reworkTatu * rule.tatuBonusPct) : 0;
  
  return tatuBonusMain + tatuBonusRework;
}

// Обратная совместимость — старое имя функции
function _calcRomaTatuBonus(order) {
  return _calcTatuBonus('Рома', order);
}

// ЗП менеджера: ставка + % от маржи стекла
// Начисляется только если он указан в поле order.manager
function _calcManagerSalary(order) {
  const rule = SALARY_CONFIG._manager;
  const glassMargin = _orderGlassMargin(order);
  return Math.round(glassMargin * (rule.glassMarginPct || 0));
}

// Итоговая зп за день (используется в profile для совместимости)
function calcDaySalary(workerName, date) {
  return calcDailyBaseSalary(workerName, date)
    + orders
      .filter(o => o.workerDone && !o.isCancelled && o.date === date &&
              (o.responsible === workerName || o.assistant === workerName || o.manager === workerName || o.reworkData?.responsible === workerName || o.reworkData?.assistant === workerName))
      .reduce((sum, o) => {
        let total = sum;
        if (o.responsible === workerName || o.assistant === workerName) {
          total += calcOrderSalary(workerName, o);
        }
        if (o.reworkData?.responsible === workerName || o.reworkData?.assistant === workerName) {
          total += calcReworkSalary(workerName, o.reworkData);
        }
        if (o.manager === workerName) {
          total += _calcManagerSalary(o);
        }
        return total;
      }, 0);
}

const MANUAL_SALARY_REPORT_ORDER_ID = 'DAY_REPORT';
const SALARY_WITHDRAWAL_ORDER_ID = 'Выплата';

function getOrderClientTotalAmount(order) {
  return (Number(order?.total) || 0)
       + (Number(order?.income) || 0)
       + (Number(order?.delivery) || 0);
}

function isManualSalaryReportEntry(entry) {
  return !!entry && entry.order_id === MANUAL_SALARY_REPORT_ORDER_ID && Number(entry.amount) > 0;
}

function isSalaryWithdrawalEntry(entry) {
  return !!entry && entry.order_id === SALARY_WITHDRAWAL_ORDER_ID;
}

function isRelevantSalaryEntry(entry) {
  return isManualSalaryReportEntry(entry) || isSalaryWithdrawalEntry(entry);
}

function getWorkerCompletedOrdersSummary(workerName, date) {
  const dayOrders = _getCompletedOrdersForWorkerDate(workerName, date);
  return {
    date,
    count: dayOrders.length,
    totalAmount: dayOrders.reduce((sum, order) => sum + getOrderClientTotalAmount(order), 0),
    orders: dayOrders.map(order => ({
      id: order.id,
      car: order.car || order.client || '—',
    })),
  };
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
