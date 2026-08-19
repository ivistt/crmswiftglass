// ============================================================
// DATA.JS — глобальное хранилище + запросы через Worker
// ============================================================

const WORKER_URL = 'https://swiftglass-crm.skifchaqwerty.workers.dev';
const WORKER_PERMISSIONS_META_PREFIX = '[[CRM_PERMS:';
const WORKER_PERMISSIONS_META_SUFFIX = ']]';
const WORKER_PERMISSION_PRESETS = {
  owner: {
    orders_view_all: true,
    orders_create: true,
    orders_edit: true,
    orders_delete: true,
    orders_comment_view: true,
    clients_view: true,
    workers_view: true,
    car_directory_view: true,
    warehouses_view: true,
    dropshippers_manage: true,
    calendar_view: true,
    groups_view: true,
    selectable_as_manager: false,
    personal_cash_view: true,
    cash_add_entries: true,
    finance_view: true,
    owner_cash_view: true,
    owner_expenses_view: true,
    owner_payments_view: true,
    order_payments_manage: true,
    order_services_edit: true,
    fill_missing_service_prices: true,
    order_complete: true,
    special_service_status: true,
    special_service_tatu: true,
    special_service_toning: true,
    own_warehouse_view: true,
    action_panel_view: true,
    action_panel_reminders: true,
    action_panel_client_data: true,
    client_statement_print: true,
  },
  manager: {
    orders_view_all: true,
    orders_create: true,
    orders_edit: true,
    orders_delete: false,
    orders_comment_view: true,
    clients_view: true,
    workers_view: false,
    car_directory_view: false,
    warehouses_view: true,
    dropshippers_manage: false,
    calendar_view: false,
    groups_view: false,
    selectable_as_manager: true,
    personal_cash_view: true,
    cash_add_entries: true,
    finance_view: false,
    owner_cash_view: false,
    owner_expenses_view: false,
    owner_payments_view: false,
    order_payments_manage: true,
    order_services_edit: true,
    fill_missing_service_prices: true,
    order_complete: false,
    special_service_status: false,
    special_service_tatu: false,
    special_service_toning: false,
    own_warehouse_view: false,
    action_panel_view: false,
    action_panel_reminders: false,
    action_panel_client_data: false,
    client_statement_print: false,
  },
  senior: {
    orders_view_all: false,
    orders_create: false,
    orders_edit: true,
    orders_delete: false,
    orders_comment_view: true,
    clients_view: false,
    workers_view: false,
    car_directory_view: false,
    warehouses_view: false,
    dropshippers_manage: false,
    calendar_view: false,
    groups_view: false,
    selectable_as_manager: false,
    personal_cash_view: true,
    cash_add_entries: true,
    finance_view: false,
    owner_cash_view: false,
    owner_expenses_view: false,
    owner_payments_view: false,
    order_payments_manage: true,
    order_services_edit: true,
    fill_missing_service_prices: true,
    order_complete: true,
    special_service_status: false,
    special_service_tatu: false,
    special_service_toning: false,
    own_warehouse_view: false,
    action_panel_view: false,
    action_panel_reminders: false,
    action_panel_client_data: false,
    client_statement_print: false,
  },
  junior: {
    orders_view_all: false,
    orders_create: false,
    orders_edit: false,
    orders_delete: false,
    orders_comment_view: true,
    clients_view: false,
    workers_view: false,
    car_directory_view: false,
    warehouses_view: false,
    dropshippers_manage: false,
    calendar_view: false,
    groups_view: false,
    selectable_as_manager: false,
    personal_cash_view: false,
    cash_add_entries: false,
    finance_view: false,
    owner_cash_view: false,
    owner_expenses_view: false,
    owner_payments_view: false,
    order_payments_manage: false,
    order_services_edit: false,
    fill_missing_service_prices: false,
    order_complete: false,
    special_service_status: false,
    special_service_tatu: false,
    special_service_toning: false,
    own_warehouse_view: false,
    action_panel_view: false,
    action_panel_reminders: false,
    action_panel_client_data: false,
    client_statement_print: false,
  },
  extra: {
    orders_view_all: false,
    orders_create: false,
    orders_edit: true,
    orders_delete: false,
    orders_comment_view: true,
    clients_view: false,
    workers_view: false,
    car_directory_view: false,
    warehouses_view: false,
    dropshippers_manage: false,
    calendar_view: false,
    groups_view: false,
    selectable_as_manager: false,
    personal_cash_view: true,
    cash_add_entries: true,
    finance_view: false,
    owner_cash_view: false,
    owner_expenses_view: false,
    owner_payments_view: false,
    order_payments_manage: true,
    order_services_edit: true,
    fill_missing_service_prices: true,
    order_complete: true,
    special_service_status: false,
    special_service_tatu: false,
    special_service_toning: false,
    own_warehouse_view: false,
    action_panel_view: false,
    action_panel_reminders: false,
    action_panel_client_data: false,
    client_statement_print: false,
  },
};

if (typeof window !== 'undefined' && window.fetch && !window.fetch.__crmNetworkGuard) {
  const nativeFetch = window.fetch.bind(window);
  const guardedFetch = async (...args) => {
    try {
      return await nativeFetch(...args);
    } catch (e) {
      const msg = String(e?.message || e || '');
      if (!navigator.onLine || e instanceof TypeError || /failed to fetch|network|load failed/i.test(msg)) {
        throw new Error('Проблемы с сетью: проверьте интернет или подключение к базе данных');
      }
      throw e;
    }
  };
  guardedFetch.__crmNetworkGuard = true;
  window.fetch = guardedFetch;
}

// Session token хранится в памяти (и localStorage для автологина)
let sessionToken = null;

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Session-Token': sessionToken || '',
  };
}

function getFriendlyApiErrorMessage(raw, status = 0) {
  const text = String(raw || '').trim();
  let code = text;
  try {
    const parsed = JSON.parse(text);
    if (parsed?.telegram_response) {
      return `Telegram: ${parsed.telegram_response}`;
    }
    code = parsed?.error || parsed?.message || text;
  } catch (e) {
    // plain text response
  }

  const normalized = String(code || '').trim();
  if (normalized === 'Forbidden') return 'Нет доступа к этому действию';
  if (normalized === 'Unauthorized') return 'Сессия устарела, войдите заново';
  if (normalized === 'Comment required') return 'Комментарий обязателен';
  if (normalized === 'Payment method required') return 'Выберите способ оплаты';
  if (normalized === 'Invalid cash account') return 'Некорректный тип кассы';
  if (normalized === 'Invalid manual salary entry') return 'Заполните сотрудника, заказ, сумму и комментарий';
  if (normalized === 'Salary already withdrawn') return 'Эта зарплата уже снята, редактировать нельзя';
  if (normalized === 'Service type required') return 'Выберите услуги перед выполнением заказа';
  if (normalized === 'Invalid special service') return 'Эту услугу нельзя подтвердить по этому заказу';
  if (normalized === 'Service is not selected') return 'Эта услуга не выбрана в заказе';
  if (normalized === 'Invalid service price') return 'Укажите цену больше нуля';
  if (normalized === 'Special service worker required') return 'Сначала назначьте ответственного за услугу';
  if (normalized === 'Special service worker has no permission') return 'У ответственного нет права выполнять эту услугу';
  if (normalized === 'Special service salary rate required') return 'У ответственного не настроен процент за услугу';
  if (normalized === 'Forbidden cash entry') return 'Нет доступа к этой кассовой записи';
  if (normalized === 'Forbidden cash worker') return 'Нет доступа к кассе этого сотрудника';
  if (normalized === 'Order is not active') return 'Заказ не в работе или отменён';
  if (normalized === 'Order not found') return 'Заказ не найден';
  if (normalized === 'Cash entry not found') return 'Запись кассы не найдена';
  if (status === 403) return 'Нет доступа к этому действию';
  if (status === 401) return 'Сессия устарела, войдите заново';
  return normalized || `Ошибка сервера${status ? ' ' + status : ''}`;
}

async function throwApiError(res) {
  const raw = await res.text().catch(() => '');
  throw new Error(getFriendlyApiErrorMessage(raw, res.status));
}

function icon(name, className = 'svg-icon') {
  return `<span class="${className}" style="--icon-url:url('images/ico/${name}.svg');" aria-hidden="true"></span>`;
}

function getWorkerDisplayName(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const workerAlias = (workers || []).find(w => w.name === raw)?.alias;
  const staticNames = {
    Maksim: 'Макс',
    'Карты владельца': 'Карты владельца',
  };
  return workerAlias || staticNames[raw] || raw;
}

function getWorkerDisplayPair(responsible, assistant) {
  const lead = getWorkerDisplayName(responsible) || '—';
  return assistant ? `${lead} + ${getWorkerDisplayName(assistant)}` : lead;
}

function getOrderMainWorkerNames(order) {
  if (!order) return [];
  return [...new Set([order.responsible, order.assistant, order.extraAssistant].filter(Boolean))];
}

function parseWorkerNoteMeta(rawNote) {
  const source = String(rawNote || '');
  const start = source.indexOf(WORKER_PERMISSIONS_META_PREFIX);
  if (start === -1) {
    return { note: source.trim(), permissions: {}, telegramNick: '', orderCardLayout: null, clientCopyFields: null };
  }
  const end = source.indexOf(WORKER_PERMISSIONS_META_SUFFIX, start);
  if (end === -1) {
    return { note: source.trim(), permissions: {}, telegramNick: '', orderCardLayout: null, clientCopyFields: null };
  }
  const encoded = source.slice(start + WORKER_PERMISSIONS_META_PREFIX.length, end);
  const note = (source.slice(0, start) + source.slice(end + WORKER_PERMISSIONS_META_SUFFIX.length)).trim();
  try {
    const decoded = JSON.parse(decodeWorkerMetaPayload(encoded));
    const meta = decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? decoded : {};
    const isLegacyPermissionsOnly = !Object.prototype.hasOwnProperty.call(meta, 'permissions')
      && !Object.prototype.hasOwnProperty.call(meta, 'telegramNick')
      && !Object.prototype.hasOwnProperty.call(meta, 'orderCardLayout')
      && !Object.prototype.hasOwnProperty.call(meta, 'clientCopyFields');
    return {
      note,
      permissions: isLegacyPermissionsOnly
        ? meta
        : ((meta.permissions && typeof meta.permissions === 'object' && !Array.isArray(meta.permissions)) ? meta.permissions : {}),
      telegramNick: String(isLegacyPermissionsOnly ? '' : (meta.telegramNick || '')).trim().replace(/^@+/, ''),
      orderCardLayout: isLegacyPermissionsOnly ? null : (meta.orderCardLayout && typeof meta.orderCardLayout === 'object' ? meta.orderCardLayout : null),
      clientCopyFields: isLegacyPermissionsOnly ? null : (meta.clientCopyFields && typeof meta.clientCopyFields === 'object' ? meta.clientCopyFields : null),
    };
  } catch (e) {
    return { note, permissions: {}, telegramNick: '', orderCardLayout: null, clientCopyFields: null };
  }
}

function decodeWorkerMetaPayload(encoded) {
  const binary = atob(String(encoded || ''));
  try {
    if (typeof TextDecoder !== 'undefined') {
      const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
  } catch (e) {}
  try {
    return decodeURIComponent(escape(binary));
  } catch (e) {
    return binary;
  }
}

function buildWorkerNoteWithMeta(note, permissions, telegramNick = '', orderCardLayout = null, clientCopyFields = null) {
  const cleanNote = String(note || '').trim();
  const cleanPermissions = permissions && typeof permissions === 'object' ? permissions : {};
  const cleanTelegramNick = String(telegramNick || '').trim().replace(/^@+/, '');
  const cleanOrderCardLayout = orderCardLayout && typeof orderCardLayout === 'object' && !Array.isArray(orderCardLayout)
    ? orderCardLayout
    : null;
  const cleanClientCopyFields = clientCopyFields && typeof clientCopyFields === 'object' && !Array.isArray(clientCopyFields)
    ? clientCopyFields
    : null;
  const meta = {};
  if (Object.keys(cleanPermissions).length) meta.permissions = cleanPermissions;
  if (cleanTelegramNick) meta.telegramNick = cleanTelegramNick;
  if (cleanOrderCardLayout) meta.orderCardLayout = cleanOrderCardLayout;
  if (cleanClientCopyFields) meta.clientCopyFields = cleanClientCopyFields;
  if (!Object.keys(meta).length) return cleanNote;
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(meta))));
  return `${cleanNote}${cleanNote ? '\n' : ''}${WORKER_PERMISSIONS_META_PREFIX}${encoded}${WORKER_PERMISSIONS_META_SUFFIX}`;
}

function getWorkerPermissionPreset(systemRole) {
  return { ...(WORKER_PERMISSION_PRESETS[systemRole] || WORKER_PERMISSION_PRESETS.junior) };
}

function hasExplicitWorkerPermissions(workerLike) {
  const permissions = workerLike?.permissions;
  return !!(permissions && typeof permissions === 'object' && !Array.isArray(permissions) && Object.keys(permissions).length);
}

function applyLegacyWorkerPermissionFallback(state, workerLike) {
  const next = { ...(state || {}) };
  const role = String(workerLike?.systemRole || workerLike?.system_role || workerLike?.role || '').trim();
  if (role === 'senior' || role === 'extra') {
    next.personal_cash_view = true;
    next.cash_add_entries = true;
    next.order_payments_manage = true;
    next.order_services_edit = true;
    next.fill_missing_service_prices = true;
    next.order_complete = true;
  }
  if (role === 'manager') {
    next.orders_create = true;
    next.orders_edit = true;
    next.clients_view = true;
    next.warehouses_view = true;
  }
  return next;
}

function resolveWorkerPermissionState(workerLike) {
  const systemRole = workerLike?.systemRole || workerLike?.system_role || workerLike?.role || 'junior';
  const preset = getWorkerPermissionPreset(systemRole);
  const explicit = workerLike?.permissions && typeof workerLike.permissions === 'object' && !Array.isArray(workerLike.permissions)
    ? workerLike.permissions
    : {};
  if (!Object.keys(explicit).length) {
    return applyLegacyWorkerPermissionFallback(preset, workerLike);
  }
  return { ...preset, ...explicit };
}

function getCurrentWorkerRecord() {
  return (workers || []).find(item => item.name === currentWorkerName || item.alias === currentWorkerName) || {
    name: currentWorkerName,
    systemRole: currentRole,
    permissions: {},
    orderCardLayout: null,
  };
}

const ORDER_CARD_LAYOUT_FIELD_DEFINITIONS = [
  { key: 'client_total', label: 'Имя и сумма' },
  { key: 'car', label: 'Авто' },
  { key: 'phone', label: 'Телефон' },
  { key: 'date', label: 'Дата' },
  { key: 'time', label: 'Время' },
  { key: 'workers', label: 'Ответственные' },
  { key: 'manager', label: 'Менеджер' },
  { key: 'warehouse', label: 'Склад' },
  { key: 'warehouse_code', label: 'Код склада' },
  { key: 'supplier_paid_total', label: 'Оплата поставщику' },
  { key: 'services', label: 'Услуги' },
  { key: 'notes', label: 'Заметка' },
  { key: 'code', label: 'Еврокод' },
  { key: 'extra_note', label: 'Доп. заметка' },
  { key: 'vin', label: 'VIN' },
];

const ORDER_CARD_LAYOUT_ROLE_DEFAULTS = {
  owner: {
    groups: [
      { id: 'owner-main', title: 'Основное', fields: ['client_total', 'car', 'phone'] },
      { id: 'owner-meta', title: 'Организация', fields: ['date', 'time', 'workers', 'manager', 'warehouse'] },
      { id: 'owner-services', title: 'Работы', fields: ['services'] },
    ],
  },
  manager: {
    groups: [
      { id: 'manager-main', title: 'Основное', fields: ['client_total', 'car', 'phone'] },
      { id: 'manager-meta', title: 'Организация', fields: ['date', 'time', 'workers', 'manager', 'warehouse'] },
      { id: 'manager-services', title: 'Работы', fields: ['services'] },
    ],
  },
  senior: {
    groups: [
      { id: 'senior-main', title: 'Основное', fields: ['client_total', 'car', 'phone'] },
      { id: 'senior-meta', title: 'Организация', fields: ['date', 'time', 'workers', 'manager', 'warehouse'] },
      { id: 'senior-services', title: 'Работы', fields: ['services'] },
    ],
  },
  junior: {
    groups: [
      { id: 'junior-main', title: 'Основное', fields: ['client_total', 'car', 'phone'] },
      { id: 'junior-meta', title: 'Организация', fields: ['date', 'time', 'workers', 'manager', 'warehouse'] },
      { id: 'junior-services', title: 'Работы', fields: ['services'] },
    ],
  },
  extra: {
    groups: [
      { id: 'extra-main', title: 'Основное', fields: ['client_total', 'car', 'phone'] },
      { id: 'extra-meta', title: 'Организация', fields: ['date', 'time', 'workers', 'manager', 'warehouse'] },
      { id: 'extra-services', title: 'Работы', fields: ['services'] },
    ],
  },
};

function cloneOrderCardLayout(layout) {
  return {
    groups: Array.isArray(layout?.groups)
      ? layout.groups.map((group, index) => ({
          id: String(group?.id || `group-${index + 1}`),
          title: String(group?.title || '').trim(),
          fields: Array.isArray(group?.fields) ? group.fields.map(String) : [],
        }))
      : [],
  };
}

function getOrderCardLayoutFieldDefinitions() {
  return ORDER_CARD_LAYOUT_FIELD_DEFINITIONS.map(item => ({ ...item }));
}

function getOrderCardLayoutDefaults(systemRole = 'junior') {
  const roleKey = String(systemRole || 'junior').trim().toLowerCase();
  return cloneOrderCardLayout(ORDER_CARD_LAYOUT_ROLE_DEFAULTS[roleKey] || ORDER_CARD_LAYOUT_ROLE_DEFAULTS.junior);
}

function normalizeOrderCardLayout(layout, systemRole = 'junior') {
  const definitions = getOrderCardLayoutFieldDefinitions();
  const allowed = new Set(definitions.map(item => item.key));
  const fallback = getOrderCardLayoutDefaults(systemRole);
  if (!layout || typeof layout !== 'object' || Array.isArray(layout) || !Array.isArray(layout.groups)) {
    return fallback;
  }
  const used = new Set();
  const groups = layout.groups.map((group, index) => {
    const title = String(group?.title || '').trim();
    const fields = (Array.isArray(group?.fields) ? group.fields : [])
      .map(value => String(value || '').trim())
      .filter(key => key && allowed.has(key) && !used.has(key) && (used.add(key) || true));
    if (!fields.length) return null;
    return {
      id: String(group?.id || `group-${index + 1}`),
      title,
      fields,
    };
  }).filter(Boolean);
  return groups.length ? { groups } : fallback;
}

function getResolvedOrderCardLayout(workerLike) {
  const systemRole = workerLike?.systemRole || workerLike?.system_role || currentRole || 'junior';
  return normalizeOrderCardLayout(workerLike?.orderCardLayout, systemRole);
}

function currentUserHasPermission(key, legacyFallback = false) {
  if (currentRole === 'owner') return true;
  const state = resolveWorkerPermissionState(getCurrentWorkerRecord());
  if (Object.prototype.hasOwnProperty.call(state, key)) {
    return !!state[key];
  }
  return !!legacyFallback;
}

function currentUserCanViewAllOrders() {
  return currentRole === 'owner' || currentRole === 'manager' || currentUserHasPermission('orders_view_all');
}

function getWorkerRecordByName(name) {
  const workerName = String(name || '').trim();
  if (!workerName) return null;
  const normalized = workerName.toLowerCase();
  return (workers || []).find(item =>
    String(item?.name || '').trim().toLowerCase() === normalized
    || String(item?.alias || '').trim().toLowerCase() === normalized
  ) || null;
}

function getWorkerIdByName(name) {
  const worker = getWorkerRecordByName(name);
  return worker?.id || null;
}

function getWorkerRecordById(id) {
  const workerId = String(id || '').trim();
  if (!workerId) return null;
  return (workers || []).find(item => String(item?.id || '') === workerId) || null;
}

function getWorkerNameById(id) {
  return getWorkerRecordById(id)?.name || '';
}

function workerCanHandleSpecialService(workerLike, type) {
  const worker = typeof workerLike === 'string' ? getWorkerRecordByName(workerLike) : workerLike;
  const workerName = String(worker?.name || workerLike || '').trim();
  if (!workerName) return false;
  const state = resolveWorkerPermissionState(worker || { name: workerName, permissions: {}, systemRole: '' });
  if (type === 'tatu') {
    return !!state.special_service_tatu;
  }
  if (type === 'toning') {
    return !!state.special_service_toning;
  }
  return false;
}

function getSpecialServiceWorkers(type) {
  return (workers || []).filter(worker => workerCanHandleSpecialService(worker, type));
}

function getOrderSpecialServiceAssignedWorker(order, type) {
  if (!order) return '';
  const explicitAssigned = type === 'tatu'
    ? String(order.tatuResponsible || '').trim()
    : String(order.toningResponsible || '').trim();
  const explicitAssignedById = type === 'tatu'
    ? getWorkerNameById(order.tatuResponsibleWorkerId)
    : getWorkerNameById(order.toningResponsibleWorkerId);
  const doneBy = type === 'tatu' ? String(order.tatuDoneBy || '').trim() : String(order.toningDoneBy || '').trim();
  const candidates = [explicitAssigned, explicitAssignedById, doneBy].filter(Boolean);
  for (const candidate of candidates) {
    const worker = getWorkerRecordByName(candidate);
    const name = worker?.name || candidate;
    if (workerCanHandleSpecialService(worker || name, type)) return name;
  }
  return '';
}

function currentUserHasAnyDashboardPermission() {
  return ['orders_create', 'clients_view', 'workers_view', 'car_directory_view', 'warehouses_view', 'dropshippers_manage', 'groups_view', 'calendar_view', 'finance_view', 'owner_cash_view', 'owner_expenses_view', 'owner_payments_view', 'action_panel_view']
    .some(key => currentUserHasPermission(key));
}

// ── ORDERS ───────────────────────────────────────────────────

async function sbFetchOrders() {
  const res = await fetch(`${WORKER_URL}/api/orders`, { headers: getHeaders() });
  if (!res.ok) await throwApiError(res);
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
  if (!res.ok) await throwApiError(res);
  const rows = await res.json();
  return rowToOrder(rows[0]);
}

async function sbUpdateOrder(o) {
  const res = await fetch(`${WORKER_URL}/api/orders/${encodeURIComponent(o.id)}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(orderToRow(o)),
  });
  if (!res.ok) await throwApiError(res);
  const rows = await res.json();
  return rows[0] ? rowToOrder(rows[0]) : o;
}

async function sbSaveOrderWithCash(o, { isNew = false, cashEntries = [], rollbackOrder = null, syncPaymentTypes = null } = {}) {
  const res = await fetch(`${WORKER_URL}/api/orders/save-with-cash`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      is_new: !!isNew,
      order: orderToRowSparse(o),
      rollback_order: rollbackOrder ? orderToRowSparse(rollbackOrder) : null,
      cash_entries: cashEntries,
      sync_payment_types: Array.isArray(syncPaymentTypes) ? syncPaymentTypes : null,
    }),
  });
  if (!res.ok) await throwApiError(res);
  const body = await res.json();
  return {
    order: body?.order ? rowToOrder(body.order) : o,
    cashEntries: Array.isArray(body?.cash_entries) ? body.cash_entries : [],
    financeDebug: Array.isArray(body?.finance_debug) ? body.finance_debug : [],
  };
}

async function sbBackfillOrderCashEntries() {
  const res = await fetch(`${WORKER_URL}/api/admin/backfill-order-cash`, {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

async function sbPatchOrderFields(id, fields) {
  const res = await fetch(`${WORKER_URL}/api/orders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(fields),
  });
  if (!res.ok) await throwApiError(res);
  const rows = await res.json();
  return rows[0] ? rowToOrder(rows[0]) : null;
}

async function sbSetMissingOrderServicePrice(id, serviceCode, amount) {
  const res = await fetch(
    `${WORKER_URL}/api/orders/${encodeURIComponent(id)}/service-prices/${encodeURIComponent(serviceCode)}`,
    {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ amount: Number(amount) }),
    }
  );
  if (!res.ok) await throwApiError(res);
  const body = await res.json();
  return body?.order ? rowToOrder(body.order) : null;
}

async function sbCompleteOrderSpecialService(id, serviceCode, options = {}) {
  const res = await fetch(
    `${WORKER_URL}/api/orders/${encodeURIComponent(id)}/services/${encodeURIComponent(serviceCode)}/complete`,
    {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ target_worker_name: String(options?.targetWorkerName || '').trim() || null }),
    }
  );
  if (!res.ok) await throwApiError(res);
  const body = await res.json();
  return {
    order: body?.order ? rowToOrder(body.order) : null,
    salary: body?.salary || null,
    alreadyCompleted: body?.already_completed === true,
  };
}

async function sbDeleteOrder(id) {
  const res = await fetch(`${WORKER_URL}/api/orders/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) await throwApiError(res);
}

async function sbDeleteDoneOrders() {
  const res = await fetch(`${WORKER_URL}/api/orders/done`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) await throwApiError(res);
}

// ── WORKERS ──────────────────────────────────────────────────

async function sbFetchWorkers() {
  const res = await fetch(`${WORKER_URL}/api/workers`, { headers: getHeaders() });
  if (!res.ok) await throwApiError(res);
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
  if (!res.ok) await throwApiError(res);
}

// Установка PIN сотруднику (хешируется на стороне Worker)
async function sbSetWorkerPin(workerId, pin) {
  const res = await fetch(`${WORKER_URL}/api/workers/set-pin`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ workerId, pin }),
  });
  if (!res.ok) await throwApiError(res);
}

async function sbInsertWorker(entry) {
  const payload = { ...(entry || {}) };
  if (payload.note !== undefined || payload.permissions !== undefined || payload.orderCardLayout !== undefined) {
    payload.note = buildWorkerNoteWithMeta(payload.note || '', payload.permissions || {}, payload.telegramNick || '', payload.orderCardLayout || null);
  }
  if (payload.telegramNick !== undefined) payload.telegram_nick = String(payload.telegramNick || '').trim().replace(/^@+/, '');
  delete payload.permissions;
  delete payload.telegramNick;
  delete payload.orderCardLayout;
  const res = await fetch(`${WORKER_URL}/api/workers`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) await throwApiError(res);
  const rows = await res.json();
  return rows && rows.length ? rowToWorker(rows[0]) : null;
}

// Обновление данных сотрудника (роль, формула, пароль)
async function sbUpdateWorker(workerId, updates) {
  const body = {};
  if (updates.role !== undefined) body.role = updates.role || '';
  if (updates.systemRole !== undefined) body.system_role    = updates.systemRole;
  if (updates.salaryFormula !== undefined) body.salary_formula = updates.salaryFormula || '';
  if (updates.assistant !== undefined) body.assistant = updates.assistant || '';
  if (updates.alias !== undefined) body.alias = updates.alias || '';
  if (updates.telegramNick !== undefined) body.telegram_nick = String(updates.telegramNick || '').trim().replace(/^@+/, '');
  if (updates.note !== undefined || updates.permissions !== undefined || updates.orderCardLayout !== undefined || updates.telegramNick !== undefined || updates.clientCopyFields !== undefined) {
    body.note = buildWorkerNoteWithMeta(
      updates.note !== undefined ? updates.note : '',
      updates.permissions !== undefined ? updates.permissions : {},
      updates.telegramNick !== undefined ? updates.telegramNick : '',
      updates.orderCardLayout !== undefined ? updates.orderCardLayout : null,
      updates.clientCopyFields !== undefined ? updates.clientCopyFields : null
    );
  }
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
  if (!res.ok) await throwApiError(res);
  const rows = await res.json();
  return rows[0] ? rowToWorker(rows[0]) : null;
}

async function sbUpdateWorkerClientCopyFields(workerId, clientCopyFields) {
  const res = await fetch(`${WORKER_URL}/api/workers/${encodeURIComponent(workerId)}/client-copy-fields`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ clientCopyFields }),
  });
  if (!res.ok) await throwApiError(res);
  const rows = await res.json();
  return rows[0] ? rowToWorker(rows[0]) : null;
}

// ── WORKER PROBLEMS ──────────────────────────────────────────

async function sbFetchWorkerProblems(workerName) {
  const res = await fetch(
    `${WORKER_URL}/api/problems?worker=${encodeURIComponent(workerName)}`,
    { headers: getHeaders() }
  );
  if (!res.ok) await throwApiError(res);
  return res.json();
}

async function sbFetchAllProblems() {
  const res = await fetch(`${WORKER_URL}/api/problems/all`, { headers: getHeaders() });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

async function sbInsertWorkerProblem(entry) {
  const res = await fetch(`${WORKER_URL}/api/problems`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(entry),
  });
  if (!res.ok) await throwApiError(res);
  const rows = await res.json();
  return rows[0];
}

async function sbDeleteWorkerProblem(id) {
  const res = await fetch(`${WORKER_URL}/api/problems/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) await throwApiError(res);
}

// ── WORKER SALARIES ──────────────────────────────────────────

function normalizeSalaryRows(rows, options = {}) {
  const includeLegacySpecial = !!options?.includeLegacySpecial;
  const list = Array.isArray(rows) ? rows : [];
  return includeLegacySpecial ? list : list.filter(entry => !isLegacySpecialServiceSalaryEntry(entry));
}

async function sbFetchWorkerSalaries(workerName) {
  const res = await fetch(
    `${WORKER_URL}/api/salaries?worker=${encodeURIComponent(workerName)}`,
    { headers: getHeaders() }
  );
  if (!res.ok) await throwApiError(res);
  const rows = await res.json();
  return normalizeSalaryRows(rows);
}

async function sbFetchAllSalaries() {
  const res = await fetch(`${WORKER_URL}/api/salaries/all`, { headers: getHeaders() });
  if (!res.ok) await throwApiError(res);
  const rows = await res.json();
  return normalizeSalaryRows(rows);
}

async function sbFetchSalariesByOrder(orderId, options = {}) {
  const res = await fetch(
    `${WORKER_URL}/api/salaries/by-order/${encodeURIComponent(orderId)}`,
    { headers: getHeaders() }
  );
  if (!res.ok) await throwApiError(res);
  const rows = await res.json();
  return normalizeSalaryRows(rows, options);
}

async function sbInsertWorkerSalary(entry) {
  const payload = { ...(entry || {}) };
  if (!payload.worker_id && payload.worker_name) {
    payload.worker_id = getWorkerIdByName(payload.worker_name);
  }
  const res = await fetch(`${WORKER_URL}/api/salaries`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) await throwApiError(res);
  const rows = await res.json();
  return rows[0];
}

async function sbUpdateWorkerSalary(id, amount) {
  const body = (amount && typeof amount === 'object') ? amount : { amount };
  const res = await fetch(`${WORKER_URL}/api/salaries/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwApiError(res);
  const rows = await res.json();
  return rows[0];
}

async function sbDeleteWorkerSalary(id) {
  const res = await fetch(`${WORKER_URL}/api/salaries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) await throwApiError(res);
}

// ── CASH LOG ─────────────────────────────────────────────────

async function sbFetchCashLog(workerName, deletedMode = 'active') {
  const mode = deletedMode === 'only' ? 'only' : deletedMode === 'all' ? 'all' : 'active';
  const resolvedWorkerName = String(
    (workers || []).find(item => item.name === workerName || item.alias === workerName)?.name
    || workerName
    || ''
  ).trim();
  const pageSize = 1000;
  const allRows = [];
  for (let offset = 0; ; offset += pageSize) {
    const res = await fetch(
      `${WORKER_URL}/api/cash?worker=${encodeURIComponent(resolvedWorkerName)}&deleted=${encodeURIComponent(mode)}&offset=${offset}&limit=${pageSize}`,
      { headers: getHeaders() }
    );
    if (!res.ok) await throwApiError(res);
    const rows = await res.json();
    const rawPage = Array.isArray(rows) ? rows : [];
    const page = rawPage.filter(entry => String(entry?.ledger_status || 'posted') !== 'voided');
    allRows.push(...page);
    if (rawPage.length < pageSize) break;
  }
  return allRows;
}

async function sbFetchCashEntryBySourceKey(sourceKey) {
  const normalizedSourceKey = String(sourceKey || '').trim();
  if (!normalizedSourceKey) return null;
  const res = await fetch(
    `${WORKER_URL}/api/cash/by-source?source_key=${encodeURIComponent(normalizedSourceKey)}`,
    { headers: getHeaders() }
  );
  if (res.status === 404) return null;
  if (!res.ok) await throwApiError(res);
  const row = await res.json();
  return row && typeof row === 'object' && !Array.isArray(row) ? row : null;
}

async function sbFetchCashSummary(workerName = '') {
  const resolvedWorkerName = String(
    (workers || []).find(item => item.name === workerName || item.alias === workerName)?.name
    || workerName
    || ''
  ).trim();
  const workerQuery = resolvedWorkerName
    ? `?worker=${encodeURIComponent(resolvedWorkerName)}`
    : '';
  const res = await fetch(`${WORKER_URL}/api/cash/summary${workerQuery}`, { headers: getHeaders() });
  if (!res.ok) await throwApiError(res);
  const data = await res.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid cash summary response');
  }
  return data;
}

async function sbFetchCashLogPage(workerName, { deletedMode = 'active', offset = 0, limit = 200 } = {}) {
  const mode = deletedMode === 'only' ? 'only' : deletedMode === 'all' ? 'all' : 'active';
  const resolvedWorkerName = String(
    (workers || []).find(item => item.name === workerName || item.alias === workerName)?.name
    || workerName
    || ''
  ).trim();
  let rawOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.min(1000, Math.max(1, Number(limit) || 200));
  const rows = [];
  let nextOffset = rawOffset;
  let hasMore = false;
  let reachedEnd = false;

  while (!hasMore && !reachedEnd) {
    const needed = Math.max(1, safeLimit + 1 - rows.length);
    const batchLimit = Math.min(1000, Math.max(200, needed));
    const res = await fetch(
      `${WORKER_URL}/api/cash?worker=${encodeURIComponent(resolvedWorkerName)}&deleted=${encodeURIComponent(mode)}&offset=${rawOffset}&limit=${batchLimit}`,
      { headers: getHeaders() }
    );
    if (!res.ok) await throwApiError(res);
    const data = await res.json();
    const rawRows = Array.isArray(data) ? data : [];
    if (!rawRows.length) break;

    for (const entry of rawRows) {
      rawOffset += 1;
      if (String(entry?.ledger_status || 'posted') === 'voided') continue;
      if (rows.length < safeLimit) {
        rows.push(entry);
        nextOffset = rawOffset;
      } else {
        hasMore = true;
        break;
      }
    }
    reachedEnd = rawRows.length < batchLimit;
  }

  return { rows, nextOffset, hasMore };
}

async function sbFetchCashPage({ deletedMode = 'active', offset = 0, limit = 200 } = {}) {
  const mode = deletedMode === 'only' ? 'only' : deletedMode === 'all' ? 'all' : 'active';
  let rawOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.min(1000, Math.max(1, Number(limit) || 200));
  const rows = [];
  let nextOffset = rawOffset;
  let hasMore = false;
  let reachedEnd = false;

  // offset API относится к сырым строкам cash_log. Пропускаем voided-записи,
  // но продолжаем запрашивать страницы, пока не найдём safeLimit + 1 активную.
  while (!hasMore && !reachedEnd) {
    const needed = Math.max(1, safeLimit + 1 - rows.length);
    const batchLimit = Math.min(1000, Math.max(200, needed));
    const res = await fetch(
      `${WORKER_URL}/api/cash/all?deleted=${encodeURIComponent(mode)}&offset=${rawOffset}&limit=${batchLimit}`,
      { headers: getHeaders() }
    );
    if (!res.ok) await throwApiError(res);
    const data = await res.json();
    const rawRows = Array.isArray(data) ? data : [];
    if (!rawRows.length) break;

    for (const entry of rawRows) {
      rawOffset += 1;
      if (String(entry?.ledger_status || 'posted') === 'voided') continue;
      if (rows.length < safeLimit) {
        rows.push(entry);
        nextOffset = rawOffset;
      } else {
        hasMore = true;
        break;
      }
    }
    reachedEnd = rawRows.length < batchLimit;
  }

  return { rows, nextOffset, hasMore };
}

async function sbFetchAllCashLog(deletedMode = 'active') {
  const mode = deletedMode === 'only' ? 'only' : deletedMode === 'all' ? 'all' : 'active';
  const pageSize = 1000;
  const allRows = [];
  for (let offset = 0; ; offset += pageSize) {
    const res = await fetch(`${WORKER_URL}/api/cash/all?deleted=${encodeURIComponent(mode)}&offset=${offset}&limit=${pageSize}`, { headers: getHeaders() });
    if (!res.ok) await throwApiError(res);
    const rows = await res.json();
    const rawPage = Array.isArray(rows) ? rows : [];
    const page = rawPage.filter(entry => String(entry?.ledger_status || 'posted') !== 'voided');
    allRows.push(...page);
    if (rawPage.length < pageSize) break;
  }
  return allRows;
}

async function sbInsertCashEntry(entry) {
  const res = await fetch(`${WORKER_URL}/api/cash`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(entry),
  });
  if (!res.ok) await throwApiError(res);
  const rows = await res.json();
  return rows[0];
}

async function sbUpdateCashEntry(id, updates) {
  const res = await fetch(`${WORKER_URL}/api/cash/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) await throwApiError(res);
  const rows = await res.json();
  return rows[0];
}

async function sbReverseCashEntry(id, reason) {
  const res = await fetch(`${WORKER_URL}/api/cash/${encodeURIComponent(id)}/reverse`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

async function sbCorrectCashEntry(id, updates) {
  const res = await fetch(`${WORKER_URL}/api/cash/${encodeURIComponent(id)}/correct`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(updates || {}),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

async function sbDeleteCashEntry(id) {
  const res = await fetch(`${WORKER_URL}/api/cash/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) await throwApiError(res);
}

async function sbDeleteCashEntriesBySourceKeys(sourceKeys = []) {
  const res = await fetch(`${WORKER_URL}/api/cash/delete-by-source-keys`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ source_keys: sourceKeys }),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

// ── PAYMENT METHODS (dynamic) ────────────────────────────────

async function sbFetchPaymentMethods() {
  const res = await fetch(`${WORKER_URL}/api/payment-methods`, { headers: getHeaders() });
  if (!res.ok) await throwApiError(res);
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function sbCreatePaymentMethod(payload) {
  const res = await fetch(`${WORKER_URL}/api/payment-methods`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

async function sbUpdatePaymentMethod(id, patch) {
  const res = await fetch(`${WORKER_URL}/api/payment-methods/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(patch || {}),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

async function sbDeletePaymentMethod(id) {
  const res = await fetch(`${WORKER_URL}/api/payment-methods/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

const FX_USD_CASH_PREFIX = 'FXUSD|';

function buildCurrencyCashComment({ usdAmount, rate, uahAmount, note = '' }) {
  return [
    FX_USD_CASH_PREFIX + 'usd=' + String(Number(usdAmount) || 0),
    'rate=' + String(Number(rate) || 0),
    'uah=' + String(Number(uahAmount) || 0),
    'note=' + encodeURIComponent(String(note || '').trim()),
  ].join('|');
}

function parseCurrencyCashEntry(entry) {
  const raw = String(entry?.comment || '');
  if (!raw.startsWith(FX_USD_CASH_PREFIX)) return null;
  const parts = raw.split('|');
  const data = {};
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx);
    const value = part.slice(idx + 1);
    data[key] = value;
  }
  const usdAmount = Number(data.usd) || 0;
  if (!usdAmount) return null;
  return {
    usdAmount,
    rate: Number(data.rate) || 0,
    uahAmount: Number(data.uah) || Math.abs(Number(entry?.amount) || 0),
    note: decodeURIComponent(String(data.note || '')),
  };
}

function isCurrencyCashEntry(entry) {
  return !!parseCurrencyCashEntry(entry);
}

function isCurrencyCashTransferEntry(entry) {
  const parsed = parseCurrencyCashEntry(entry);
  return !!parsed && Math.abs(Number(parsed.uahAmount) || 0) > 0;
}

const EXPENSE_CATEGORY_OPTIONS = ['Заправка', 'Химия', 'Молдинг', 'Инструменты', 'Пленка', 'ПКО'];

function getExpenseCategoryOptions() {
  return [...EXPENSE_CATEGORY_OPTIONS];
}

function isWarehouseExpenseCategory(category) {
  return String(category || '').trim() !== 'Заправка';
}

function getWarehouseNameOptions() {
  const seen = new Set();
  const result = [];
  const warehouseSource = Array.isArray(refWarehouses)
    ? refWarehouses
    : (refWarehouses && typeof refWarehouses === 'object'
      ? Object.values(refWarehouses)
      : []);
  const push = (value) => {
    const name = String(value || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(name);
  };

  warehouseSource.forEach(item => {
    if (typeof item === 'string') push(item);
    else if (item && typeof item === 'object') {
      push(item.name);
      push(item.title);
      push(item.label);
      push(item.warehouse);
      push(item.value);
    }
  });
  (orders || []).forEach(order => {
    push(order?.warehouse);
    push(order?.warehouseName);
    push(order?.storage);
  });
  const cashSources = [
    ...(Array.isArray(window.allCashLog) ? window.allCashLog : []),
    ...(Array.isArray(window.cashLog) ? window.cashLog : []),
    ...(Array.isArray(window.workerCashLog) ? window.workerCashLog : []),
  ];
  cashSources.forEach(entry => {
    const parsedExpense = parseExpenseCashEntry(entry);
    if (parsedExpense?.warehouse) push(parsedExpense.warehouse);
  });
  return result
    .filter(name => {
      const normalized = String(name || '').trim();
      if (!normalized) return false;
      if (normalized === '—' || normalized === '-') return false;
      if (/could not find the table|perhaps you meant|pgrst\d+/i.test(normalized)) return false;
      return true;
    })
    .sort((a, b) => a.localeCompare(b, 'ru'));
}

function buildExpenseCashComment({ amount = 0, category = '', warehouse = '', note = '' } = {}) {
  const normalizedCategory = String(category || '').trim();
  const normalizedWarehouse = String(warehouse || '').trim();
  const normalizedNote = String(note || '').trim();
  const amountLabel = Math.abs(Number(amount) || 0).toLocaleString('ru');
  const parts = [`Расход(${amountLabel})`, normalizedCategory];
  if (normalizedWarehouse && normalizedCategory !== 'Заправка') {
    parts.push(`склад ${normalizedWarehouse}`);
  }
  const head = parts.filter(Boolean).join(' · ');
  return normalizedNote ? `${head} - ${normalizedNote}` : head;
}

function parseExpenseCashEntry(entry) {
  if (entry?.expense_category) {
    return {
      amountLabel: Math.abs(Number(entry?.amount) || 0).toLocaleString('ru'),
      category: String(entry.expense_category || '').trim(),
      warehouse: String(entry.warehouse_name || '').trim(),
      note: String(entry.comment || '').trim(),
    };
  }
  const raw = String(entry?.comment || '').trim();
  if (!raw.startsWith('Расход(')) return null;
  const match = raw.match(/^Расход\(([^)]+)\)\s*·\s*([^·-]+?)(?:\s*·\s*склад\s+([^-\n]+?))?(?:\s*-\s*([\s\S]+))?$/);
  if (!match) return null;
  const category = String(match[2] || '').trim();
  if (!EXPENSE_CATEGORY_OPTIONS.includes(category)) return null;
  return {
    amountLabel: String(match[1] || '').trim(),
    category,
    warehouse: String(match[3] || '').trim(),
    note: String(match[4] || '').trim(),
  };
}

function isExpenseCashEntry(entry) {
  return !!parseExpenseCashEntry(entry);
}

function getExpenseCashAmount(entry) {
  return Math.abs(Number(entry?.amount) || 0);
}

function getCashEntryDisplayComment(entry) {
  const expense = parseExpenseCashEntry(entry);
  if (expense) {
    if (entry?.expense_category) {
      const parts = [`Расход(${Math.abs(Number(entry?.amount) || 0).toLocaleString('ru')})`, expense.category];
      if (expense.warehouse && expense.category !== 'Заправка') parts.push(`склад ${expense.warehouse}`);
      const head = parts.join(' · ');
      return expense.note ? `${head} - ${expense.note}` : head;
    }
    return String(entry?.comment || '—');
  }
  const parsed = parseCurrencyCashEntry(entry);
  if (!parsed) return String(entry?.comment || '—');
  const base = parsed.uahAmount > 0
    ? (parsed.usdAmount > 0 ? 'Обмен в валютную кассу' : 'Возврат из валютной кассы')
    : (parsed.usdAmount > 0 ? 'Запись в валютную кассу' : 'Списание из валютной кассы');
  return parsed.note
    ? `${base} · ${parsed.note}`
    : base;
}

function getCashEntryDisplayMeta(entry) {
  const parsed = parseCurrencyCashEntry(entry);
  if (!parsed) return '';
  const parts = [];
  if (parsed.usdAmount) parts.push(`${Math.abs(parsed.usdAmount).toLocaleString('ru')} $`);
  if (parsed.rate) parts.push(`курс ${parsed.rate.toLocaleString('ru')}`);
  if (parsed.uahAmount) parts.push(`${parsed.usdAmount > 0 ? 'списано' : 'получено'} ${parsed.uahAmount.toLocaleString('ru')} ₴`);
  return parts.join(' · ');
}

function getCashEntrySearchText(entry) {
  return [
    String(entry?.comment || ''),
    getCashEntryDisplayComment(entry),
    getCashEntryDisplayMeta(entry),
  ].join(' ');
}

function calcCurrencyCashBalance(entries) {
  return (entries || []).reduce((sum, entry) => {
    const parsed = parseCurrencyCashEntry(entry);
    return sum + (parsed?.usdAmount || 0);
  }, 0);
}

// ── REF DATA ─────────────────────────────────────────────────

async function sbFetchRef(table) {
  const res = await fetch(`${WORKER_URL}/api/ref/${table}`, { headers: getHeaders() });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

async function sbFetchRefOptional(table) {
  try {
    const data = await sbFetchRef(table);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    // если таблица ещё не проксируется воркером — молча возвращаем пустой список
    return [];
  }
}

async function sbCreateRef(table, payload) {
  const res = await fetch(`${WORKER_URL}/api/ref/${table}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) await throwApiError(res);
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

async function sbCreateWarehouse(name) {
  return sbCreateRef('ref_warehouses', { name });
}

async function sbCreateDropshipper(name, workerName = '') {
  return sbCreateRef('ref_dropshippers', {
    name,
    worker_name: String(workerName || '').trim() || null,
  });
}

async function sbCreateServiceRate(payload) {
  return sbCreateRef('ref_service_rates', payload || {});
}

async function sbUpdateRef(table, id, payload) {
  const res = await fetch(`${WORKER_URL}/api/ref/${table}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) await throwApiError(res);
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

async function sbUpdateWarehouse(id, name) {
  return sbUpdateRef('ref_warehouses', id, { name });
}

async function sbUpdateDropshipper(id, name, workerName = '') {
  return sbUpdateRef('ref_dropshippers', id, {
    name,
    worker_name: String(workerName || '').trim() || null,
  });
}

async function sbUpdateServiceRate(id, payload) {
  return sbUpdateRef('ref_service_rates', id, payload || {});
}

async function sbUpsertAppSetting(key, valueJson) {
  return sbCreateRef('ref_app_settings', {
    key: String(key || '').trim(),
    value_json: valueJson || {},
  });
}

async function refreshSharedGlassManufacturers(force = false) {
  const now = Date.now();
  if (!force && glassManufacturersLastSyncAt && now - glassManufacturersLastSyncAt < 30000) {
    return appSettings?.glass_manufacturers || null;
  }
  if (glassManufacturersSyncPromise) return glassManufacturersSyncPromise;

  glassManufacturersSyncPromise = sbFetchRefOptional('ref_app_settings')
    .then(rows => {
      const row = (rows || []).find(item => String(item?.key || '').trim() === 'glass_manufacturers');
      if (row?.value_json && typeof row.value_json === 'object') {
        appSettings.glass_manufacturers = row.value_json;
      }
      glassManufacturersLastSyncAt = Date.now();
      return appSettings?.glass_manufacturers || null;
    })
    .finally(() => {
      glassManufacturersSyncPromise = null;
    });

  return glassManufacturersSyncPromise;
}

async function sbSendTelegramTest(text = 'Тестовое сообщение из SwiftGlass') {
  const res = await fetch(`${WORKER_URL}/api/admin/test-telegram`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ text }),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

// -- CAR DIRECTORY --------------------------------------------------
async function sbFetchCarDirectory() {
  const pageSize = 1000;
  const allRows = [];
  const seen = new Set();

  for (let offset = 0; ; offset += pageSize) {
    const res = await fetch(`${WORKER_URL}/api/car-directory?offset=${offset}&limit=${pageSize}`, { headers: getHeaders() });
    if (!res.ok) await throwApiError(res);
    const body = await res.json();
    const rows = Array.isArray(body) ? body : (body.data ?? []);
    let added = 0;

    for (const row of rows) {
      const key = row.id || row.model || `${row.eurocode}-${allRows.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allRows.push(row);
      added++;
    }

    if (rows.length < pageSize || added === 0) break;
  }

  return allRows;
}

async function sbUpsertCarDirectory(model, eurocode) {
  const res = await fetch(`${WORKER_URL}/api/car-directory`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ model, eurocode }),
  });
  if (!res.ok) await throwApiError(res);
  const rows = await res.json();
  return rows[0];
}

async function sbUpdateCarDirectory(id, model, eurocode) {
  const res = await fetch(`${WORKER_URL}/api/car-directory/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ model, eurocode }),
  });
  if (!res.ok) await throwApiError(res);
  const rows = await res.json();
  return rows[0];
}

async function sbDeleteCarDirectory(id) {
  const res = await fetch(`${WORKER_URL}/api/car-directory/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) await throwApiError(res);
}

// ── CLIENTS ─────────────────────────────────────────────────

async function sbFetchManualClients() {
  const pageSize = 1000;
  const allRows = [];
  const seen = new Set();

  for (let offset = 0; ; offset += pageSize) {
    const res = await fetch(`${WORKER_URL}/api/clients?offset=${offset}&limit=${pageSize}`, { headers: getHeaders() });
    if (!res.ok) await throwApiError(res);
    const body = await res.json();
    const rows = Array.isArray(body) ? body : (body.data ?? body.clients ?? []);
    let added = 0;

    for (const row of rows) {
      const key = row.id || row.phone || `${row.name}-${allRows.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allRows.push(row);
      added++;
    }

    if (rows.length < pageSize || added === 0) break;
  }

  return allRows.map(rowToManualClient);
}

async function sbInsertManualClient(client) {
  const res = await fetch(`${WORKER_URL}/api/clients`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(manualClientToRow(client)),
  });
  if (!res.ok) await throwApiError(res);
  const rows = await res.json();
  return rowToManualClient(Array.isArray(rows) ? rows[0] : rows);
}

async function sbUpsertManualClient(client) {
  const res = await fetch(`${WORKER_URL}/api/clients`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(manualClientToRow(client)),
  });
  if (!res.ok) await throwApiError(res);
  const rows = await res.json();
  return rowToManualClient(Array.isArray(rows) ? rows[0] : rows);
}

async function loadRefData() {
  try {
    const [cars, wh, eq, ps, part, ss, carDir, drops, settingsRows, paymentMethodRows, serviceRateRows] = await Promise.all([
      sbFetchRefOptional('ref_cars'),
      sbFetchRefOptional('ref_warehouses'),
      sbFetchRefOptional('ref_equipment'),
      sbFetchRefOptional('ref_payment_statuses'),
      sbFetchRefOptional('ref_partners'),
      sbFetchRefOptional('ref_supplier_statuses'),
      sbFetchCarDirectory().catch(() => []),
      sbFetchRefOptional('ref_dropshippers'),
      sbFetchRefOptional('ref_app_settings'),
      sbFetchPaymentMethods().catch(() => []),
      sbFetchRefOptional('ref_service_rates'),
    ]);
    refCars             = carDir.length ? carDir : cars;
    refWarehouses       = wh;
    refEquipment        = eq;
    refPaymentStatuses  = ps.map(s => s.name === 'Борг' ? { ...s, name: 'Долг' } : s);
    refPartners         = part;
    refSupplierStatuses = ss;
    paymentMethods      = Array.isArray(paymentMethodRows) ? paymentMethodRows : [];
    refServiceRates     = Array.isArray(serviceRateRows) ? serviceRateRows : [];
    carDirectory        = carDir;
    refDropshippers     = ensureBuiltInDropshippers(drops);
    appSettings         = Array.isArray(settingsRows)
      ? settingsRows.reduce((acc, row) => {
          const key = String(row?.key || '').trim();
          if (key) acc[key] = row?.value_json && typeof row.value_json === 'object' ? row.value_json : {};
          return acc;
        }, {})
      : {};
  } catch (e) {
    showToast('Ошибка загрузки справочников: ' + e.message, 'error');
  }
}

function ensureBuiltInDropshippers(rows = []) {
  const list = Array.isArray(rows) ? [...rows] : [];
  const builtIns = [
    { name: 'Саша Менеджер', worker_name: 'Sasha Manager' },
    { name: 'Паша Литовченко', worker_name: '' },
  ];

  builtIns.forEach(entry => {
    const exists = list.some(row =>
      (entry.worker_name && String(row?.worker_name || '').trim() === String(entry.worker_name).trim())
      || String(row?.name || '').trim() === String(entry.name).trim()
    );
    if (!exists) list.push(entry);
  });

  return list;
}

function getDropshipperCashWorkerRecord(dropshipperName) {
  const name = String(dropshipperName || '').trim();
  if (!name) return null;
  const row = (refDropshippers || []).find(item => String(item?.name || '').trim() === name) || null;
  const linkedWorkerId = String(row?.worker_id || '').trim();
  if (linkedWorkerId) {
    return getWorkerRecordById(linkedWorkerId);
  }
  const linkedWorkerName = String(row?.worker_name || '').trim();
  if (linkedWorkerName) {
    return getWorkerRecordByName(linkedWorkerName);
  }
  return (workers || []).find(worker => {
    const labels = [worker?.name, worker?.alias].filter(Boolean).map(value => String(value).trim().toLowerCase());
    const target = name.toLowerCase();
    if (labels.includes(target)) return true;
    const targetSymbol = Array.from(name)[0] || '';
    if (!targetSymbol || !labels.some(label => Array.from(label)[0] === targetSymbol.toLowerCase())) return false;
    const targetTokens = target.replace(/[^a-z0-9а-яіїєґ\s]/gi, ' ').split(/\s+/).filter(token => token.length > 1);
    return labels.some(label => {
      const tokens = label.replace(/[^a-z0-9а-яіїєґ\s]/gi, ' ').split(/\s+/).filter(token => token.length > 1);
      return tokens.some(token => targetTokens.includes(token));
    });
  }) || null;
}

function getCashRunningBalanceMap(log = [], amountGetter = entry => Number(entry?.amount) || 0) {
  const map = new Map();
  let balance = 0;
  [...(log || [])]
    .filter(entry => !String(entry?.deleted_at || '').trim())
    .sort((a, b) => {
      const at = new Date(a?.created_at || a?.fop_date || 0).getTime();
      const bt = new Date(b?.created_at || b?.fop_date || 0).getTime();
      if (at !== bt) return at - bt;
      return String(a?.id || '').localeCompare(String(b?.id || ''));
    })
    .forEach(entry => {
      balance += Number(amountGetter(entry)) || 0;
      const id = String(entry?.id || '').trim();
      if (id) map.set(id, balance);
    });
  return map;
}

// ── MAPPERS ──────────────────────────────────────────────────

function rowToOrder(r) {
  if (!r) return {};
  const configurationMeta = parseOrderConfigurationMeta(r.configuration);
  let paymentStatus = r.payment_status || '';
  if (paymentStatus === 'Борг') paymentStatus = 'Не оплачено';
  if (paymentStatus === 'Рассчитано') paymentStatus = 'Оплачено';
  if (paymentStatus === 'Частично оплачено') paymentStatus = 'Частично';
  let supplierStatus = r.supplier_status || '';
  if (supplierStatus === 'Частично оплачено') supplierStatus = 'Частично';
  return {
    id:              r.id,
    date:            r.date,
    daySort:         Number.isFinite(Number(r.day_sort)) ? Number(r.day_sort) : null,
    responsible:     r.responsible,
    responsibleWorkerId: r.responsible_worker_id || null,
    client:          r.client,
    phone:           r.phone,
    address:         r.address || '',
    vin:             r.vin || '',
    extraNote:       r.extra_note || '',
    car:             r.car,
    licensePlate:    r.license_plate || '',
    code:            r.code,
    glassManufacturer: r.glass_manufacturer || '',
    notes:           r.notes,
    mount:           r.mount,
    serviceType:     r.service_type,
    molding:         r.molding,
    extraWork:       r.extra_work,
    tatu:            r.tatu,
    tatuDone:        r.tatu_done ?? r.tatu_status ?? false,
    tatuDoneBy:      r.tatu_done_by || '',
    toning:          r.toning,
    toningDone:      r.toning_done ?? r.toning_status ?? false,
    toningDoneBy:    r.toning_done_by || '',
    delivery:        r.delivery       || 0,
    author:          r.author,
    paymentStatus:   paymentStatus,
    check:           r.check_sum      || 0,
    debt:            r.debt           || 0,
    debtDate:        r.debt_date      || '',
    total:           r.total          || 0,
    moldingAuthor:   r.molding_author,
    partner:         r.partner,
    supplierStatus:  supplierStatus,
    purchase:        r.purchase       || 0,
    income:          r.income         || 0,
    remainder:       r.remainder      || 0,
    paymentMethod:   r.payment_method,
    warehouse:       r.warehouse,
    warehouseCode:   r.warehouse_code,
    newPost:         r.new_post || false,
    configuration:   configurationMeta.configuration,
    tatuStatus:      r.tatu_status ?? configurationMeta.tatuStatus ?? false,
    toningStatus:    r.toning_status ?? configurationMeta.toningStatus ?? false,
    tatuResponsible: configurationMeta.tatuResponsible || getWorkerNameById(r.tatu_responsible_worker_id) || '',
    tatuResponsibleWorkerId: r.tatu_responsible_worker_id || null,
    toningResponsible: configurationMeta.toningResponsible || getWorkerNameById(r.toning_responsible_worker_id) || '',
    toningResponsibleWorkerId: r.toning_responsible_worker_id || null,
    warehouseDelta:  r.warehouse_delta,
    dropshipper:     r.drop_shipper,
    dropshipperPayout: r.drop_shipper_payout || 0,
    dropshipperPayments: r.drop_shipper_payments || [],
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
    callStatus:      r.call_status || false,
    ownWarehouse:    r.own_warehouse || false,
    workerDone:      r.worker_done || false,
    assistant:       r.assistant || '',
    assistantWorkerId: r.assistant_worker_id || null,
    extraAssistant:  r.extra_assistant || '',
    extraAssistantWorkerId: r.extra_assistant_worker_id || null,
    isCancelled:     r.is_cancelled || false,
    manager:         r.manager || '',
    managerWorkerId: r.manager_worker_id || null,
    onlySale:        r.only_sale || false,
    reworkData:      r.rework_data || {},
    priorityTask:    !!r.rework_data?.priorityTask,
    reminder:        !!r.rework_data?.reminder || (Array.isArray(r.rework_data?.reminderWorkers) && r.rework_data.reminderWorkers.length > 0),
    reminderWorkers: Array.isArray(r.rework_data?.reminderWorkers) ? r.rework_data.reminderWorkers : [],
    reminderComment: String(r.rework_data?.reminderComment || ''),
    clientPayments:  r.client_payments || [],
    supplierPayments:r.supplier_payments || [],
    deletedAt:       r.deleted_at || '',
    deletedBy:       r.deleted_by || '',
  };
}

function orderToRow(o) {
  const reworkData = { ...(o.reworkData || {}) };
  if (o.priorityTask) reworkData.priorityTask = true;
  else delete reworkData.priorityTask;
  if (o.reminder) reworkData.reminder = true;
  else delete reworkData.reminder;
  const reminderWorkers = Array.isArray(o.reminderWorkers) ? o.reminderWorkers : (Array.isArray(reworkData.reminderWorkers) ? reworkData.reminderWorkers : []);
  if (reminderWorkers.length) reworkData.reminderWorkers = [...new Set(reminderWorkers.map(name => String(name || '').trim()).filter(Boolean))];
  else delete reworkData.reminderWorkers;
  const reminderComment = Object.prototype.hasOwnProperty.call(o, 'reminderComment') ? o.reminderComment : reworkData.reminderComment;
  if (String(reminderComment || '').trim()) reworkData.reminderComment = String(reminderComment || '').trim();
  else delete reworkData.reminderComment;
  return {
    id:               o.id,
    date:             o.date,
    day_sort:         Number.isFinite(Number(o.daySort)) ? Number(o.daySort) : null,
    responsible:      o.responsible,
    responsible_worker_id: o.responsibleWorkerId || getWorkerIdByName(o.responsible),
    client:           o.client,
    phone:            o.phone,
    address:          o.address || null,
    vin:              o.vin || null,
    extra_note:       o.extraNote || null,
    car:              o.car,
    license_plate:    o.licensePlate || null,
    code:             o.code,
    glass_manufacturer: o.glassManufacturer || null,
    notes:            o.notes,
    mount:            Number(o.mount)     || 0,
    service_type:     o.serviceType,
    molding:          Number(o.molding)   || 0,
    extra_work:       Number(o.extraWork) || 0,
    tatu:             Number(o.tatu)      || 0,
    tatu_done:        o.tatuDone ?? o.tatuStatus ?? false,
    tatu_done_by:     (o.tatuDone ?? o.tatuStatus) ? (o.tatuDoneBy || o.tatuResponsible || null) : null,
    toning:           Number(o.toning)    || 0,
    toning_done:      o.toningDone ?? o.toningStatus ?? false,
    toning_done_by:   (o.toningDone ?? o.toningStatus) ? (o.toningDoneBy || o.toningResponsible || null) : null,
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
    new_post:          o.newPost || false,
    configuration:     buildOrderConfigurationMeta(parseOrderConfigurationMeta(o.configuration).configuration, {
      tatuStatus: o.tatuStatus || false,
      toningStatus: o.toningStatus || false,
      tatuResponsible: o.tatuResponsible || '',
      toningResponsible: o.toningResponsible || '',
    }),
    tatu_status:       o.tatuStatus || false,
    toning_status:     o.toningStatus || false,
    tatu_responsible_worker_id: o.tatuResponsibleWorkerId || getWorkerIdByName(o.tatuResponsible),
    toning_responsible_worker_id: o.toningResponsibleWorkerId || getWorkerIdByName(o.toningResponsible),
    drop_shipper:      o.dropshipper || null,
    drop_shipper_payout: o.dropshipperPayout || 0,
    drop_shipper_payments: o.dropshipperPayments || [],
    toning_external:    o.toningExternal || false,
    margin_total:       o.marginTotal || 0,
    payout_manager_glass:   o.payoutManagerGlass || 0,
    payout_resp_glass:      o.payoutRespGlass || 0,
    payout_extra_resp:     o.payoutExtraResp || 0,
    payout_extra_assist:   o.payoutExtraAssist || 0,
    payout_molding_resp:   o.payoutMoldingResp || 0,
    payout_molding_assist: o.payoutMoldingAssist || 0,
    price_locked:      o.priceLocked,
    time:              o.time,
    status_done:      o.statusDone || false,
    in_work:          o.inWork     || false,
    call_status:      o.callStatus || false,
    own_warehouse:    o.ownWarehouse || false,
    worker_done:      o.workerDone || false,
    assistant:        o.assistant  || null,
    assistant_worker_id: o.assistantWorkerId || getWorkerIdByName(o.assistant),
    extra_assistant:  o.extraAssistant || null,
    extra_assistant_worker_id: o.extraAssistantWorkerId || getWorkerIdByName(o.extraAssistant),
    is_cancelled:     o.isCancelled || false,
    manager:          o.manager    || null,
    manager_worker_id: o.managerWorkerId || getWorkerIdByName(o.manager),
    only_sale:        o.onlySale || false,
    rework_data:      reworkData,
    client_payments:  o.clientPayments || [],
    supplier_payments:o.supplierPayments || [],
  };
}

function orderToRowSparse(o) {
  if (!o || typeof o !== 'object') return {};
  const full = orderToRow(o);
  const sparse = {};
  const mapping = [
    ['id', 'id'],
    ['date', 'date'],
    ['daySort', 'day_sort'],
    ['responsible', 'responsible'],
    ['client', 'client'],
    ['phone', 'phone'],
    ['address', 'address'],
    ['vin', 'vin'],
    ['extraNote', 'extra_note'],
    ['car', 'car'],
    ['licensePlate', 'license_plate'],
    ['code', 'code'],
    ['glassManufacturer', 'glass_manufacturer'],
    ['notes', 'notes'],
    ['mount', 'mount'],
    ['serviceType', 'service_type'],
    ['molding', 'molding'],
    ['extraWork', 'extra_work'],
    ['tatu', 'tatu'],
    ['tatuDone', 'tatu_done'],
    ['tatuDoneBy', 'tatu_done_by'],
    ['toning', 'toning'],
    ['toningDone', 'toning_done'],
    ['toningDoneBy', 'toning_done_by'],
    ['delivery', 'delivery'],
    ['author', 'author'],
    ['paymentStatus', 'payment_status'],
    ['check', 'check_sum'],
    ['debt', 'debt'],
    ['debtDate', 'debt_date'],
    ['total', 'total'],
    ['moldingAuthor', 'molding_author'],
    ['partner', 'partner'],
    ['supplierStatus', 'supplier_status'],
    ['purchase', 'purchase'],
    ['income', 'income'],
    ['remainder', 'remainder'],
    ['paymentMethod', 'payment_method'],
    ['warehouse', 'warehouse'],
    ['warehouseCode', 'warehouse_code'],
    ['newPost', 'new_post'],
    ['configuration', 'configuration'],
    ['tatuStatus', 'tatu_status'],
    ['toningStatus', 'toning_status'],
    ['dropshipper', 'drop_shipper'],
    ['dropshipperPayout', 'drop_shipper_payout'],
    ['dropshipperPayments', 'drop_shipper_payments'],
    ['toningExternal', 'toning_external'],
    ['marginTotal', 'margin_total'],
    ['payoutManagerGlass', 'payout_manager_glass'],
    ['payoutRespGlass', 'payout_resp_glass'],
    ['payoutExtraResp', 'payout_extra_resp'],
    ['payoutExtraAssist', 'payout_extra_assist'],
    ['payoutMoldingResp', 'payout_molding_resp'],
    ['payoutMoldingAssist', 'payout_molding_assist'],
    ['priceLocked', 'price_locked'],
    ['time', 'time'],
    ['statusDone', 'status_done'],
    ['inWork', 'in_work'],
    ['callStatus', 'call_status'],
    ['ownWarehouse', 'own_warehouse'],
    ['workerDone', 'worker_done'],
    ['assistant', 'assistant'],
    ['extraAssistant', 'extra_assistant'],
    ['isCancelled', 'is_cancelled'],
    ['manager', 'manager'],
    ['onlySale', 'only_sale'],
    ['reworkData', 'rework_data'],
    ['priorityTask', 'rework_data'],
    ['reminder', 'rework_data'],
    ['reminderWorkers', 'rework_data'],
    ['reminderComment', 'rework_data'],
    ['clientPayments', 'client_payments'],
    ['supplierPayments', 'supplier_payments'],
  ];

  mapping.forEach(([sourceKey, rowKey]) => {
    if (Object.prototype.hasOwnProperty.call(o, sourceKey)) {
      sparse[rowKey] = full[rowKey];
    }
  });
  if (Object.prototype.hasOwnProperty.call(o, 'responsible')) sparse.responsible_worker_id = full.responsible_worker_id;
  if (Object.prototype.hasOwnProperty.call(o, 'assistant')) sparse.assistant_worker_id = full.assistant_worker_id;
  if (Object.prototype.hasOwnProperty.call(o, 'extraAssistant')) sparse.extra_assistant_worker_id = full.extra_assistant_worker_id;
  if (Object.prototype.hasOwnProperty.call(o, 'manager')) sparse.manager_worker_id = full.manager_worker_id;
  if (Object.prototype.hasOwnProperty.call(o, 'tatuResponsible')) sparse.tatu_responsible_worker_id = full.tatu_responsible_worker_id;
  if (Object.prototype.hasOwnProperty.call(o, 'toningResponsible')) sparse.toning_responsible_worker_id = full.toning_responsible_worker_id;

  return sparse;
}

function rowToWorker(r) {
  const noteMeta = parseWorkerNoteMeta(r.note);
  const systemRole = r.system_role || 'junior';
  return {
    id:            r.id,
    name:          r.name,
    alias:         r.alias         || '',
    role:          r.role || (ROLE_LABELS[systemRole] || systemRole),
    systemRole:    systemRole,
    note:          noteMeta.note,
    permissions:   noteMeta.permissions || {},
    telegramNick:  String(r.telegram_nick || noteMeta.telegramNick || '').trim().replace(/^@+/, ''),
    orderCardLayout: noteMeta.orderCardLayout || null,
    clientCopyFields: noteMeta.clientCopyFields || null,
    salaryFormula: r.salary_formula || '',
    assistant:     r.assistant     || '',
  };
}

function workerToRow(w) {
  const systemRole = w.systemRole || 'junior';
  return {
    name:           w.name,
    alias:          w.alias         || '',
    role:           w.role || (ROLE_LABELS[systemRole] || systemRole),
    system_role:    systemRole,
    note:           buildWorkerNoteWithMeta(w.note, w.permissions, w.telegramNick || '', w.orderCardLayout || null, w.clientCopyFields || null),
    telegram_nick:  String(w.telegramNick || '').trim().replace(/^@+/, ''),
    salary_formula: w.salaryFormula || '',
    assistant:      w.assistant     || '',
  };
}

function rowToManualClient(r) {
  if (!r) return {};
  return {
    id: r.id,
    name: r.name || '',
    phone: r.phone || '',
    address: r.address || '',
    alias: r.alias || r.client_alias || '',
    requisites: r.requisites || r.client_requisites || '',
    orders: [],
  };
}

function manualClientToRow(c) {
  const row = {
    name: c.name || '',
    phone: c.phone || null,
    address: c.address || null,
    alias: c.alias || c.name || null,
    requisites: c.requisites || null,
  };
  if (c.id) row.id = c.id;
  return row;
}

// ── WORKER FORMULA API ───────────────────────────────────────

async function sbUpdateWorkerFormula(workerId, formula) {
  const res = await fetch(`${WORKER_URL}/api/workers/${encodeURIComponent(workerId)}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ salary_formula: formula }),
  });
  if (!res.ok) await throwApiError(res);
  const rows = await res.json();
  return rows[0] ? rowToWorker(rows[0]) : null;
}

// ── РАСЧЁТ ЗАРПЛАТ ───────────────────────────────────────────
//
function parseWorkerSalaryFormula(rawFormula) {
  const source = String(rawFormula || '').trim();
  if (!source) return null;
  try {
    const parsed = JSON.parse(source);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch (e) {
    return null;
  }
}

function sanitizeWorkerSalaryRuleConfig(rawRule) {
  const rule = rawRule && typeof rawRule === 'object' ? rawRule : {};
  const adjustments = rule.serviceAdjustments && typeof rule.serviceAdjustments === 'object'
    ? rule.serviceAdjustments
    : {};
  const serviceRates = rule.serviceRates && typeof rule.serviceRates === 'object'
    ? rule.serviceRates
    : {};
  return {
    selectedServices: !!rule.selectedServices,
    attendanceBase: Number(rule.attendanceBase) || 0,
    dailyBaseIfCompleted: Number(rule.dailyBaseIfCompleted) || 0,
    glassMarginPct: Number(rule.glassMarginPct) || 0,
    moldingPct: Number(rule.moldingPct) || 0,
    extraWorkPct: Number(rule.extraWorkPct) || 0,
    tatuBonusPct: Number(rule.tatuBonusPct) || 0,
    toningBonusPct: Number(rule.toningBonusPct) || 0,
    serviceAdjustments: {
      mount: Number(adjustments.mount) || 0,
      cut: Number(adjustments.cut) || 0,
      glue: Number(adjustments.glue) || 0,
    },
    serviceRates: Object.entries(serviceRates).reduce((acc, [name, value]) => {
      const cleanName = String(name || '').trim();
      if (!cleanName) return acc;
      const num = Number(value);
      if (Number.isFinite(num) && num >= 0) acc[cleanName] = num;
      return acc;
    }, {}),
  };
}

function buildWorkerSalaryFormula(rule) {
  const safeRule = sanitizeWorkerSalaryRuleConfig(rule);
  const payload = {
    _custom: true,
    selectedServices: !!safeRule.selectedServices,
    attendanceBase: Number(safeRule.attendanceBase) || 0,
    dailyBaseIfCompleted: Number(safeRule.dailyBaseIfCompleted) || 0,
    glassMarginPct: Number(safeRule.glassMarginPct) || 0,
    moldingPct: Number(safeRule.moldingPct) || 0,
    extraWorkPct: Number(safeRule.extraWorkPct) || 0,
    tatuBonusPct: Number(safeRule.tatuBonusPct) || 0,
    toningBonusPct: Number(safeRule.toningBonusPct) || 0,
    serviceAdjustments: {
      mount: Number(safeRule.serviceAdjustments?.mount) || 0,
      cut: Number(safeRule.serviceAdjustments?.cut) || 0,
      glue: Number(safeRule.serviceAdjustments?.glue) || 0,
    },
    serviceRates: { ...(safeRule.serviceRates || {}) },
  };
  return JSON.stringify(payload);
}

const SALARY_CONFIG = {
  _senior:  { selectedServices: true },
  _junior:  { selectedServices: true },
  _manager: { managerOnly: true },
};

const DEFAULT_SALARY_FORMULA = {
  senior: 'выбранные услуги по прайсу',
  junior: 'выбранные услуги по прайсу',
  extra: 'выбранные услуги по прайсу',
  manager: 'по персональной формуле',
};

// Возвращает конфиг ЗП для сотрудника с учётом дефолта по роли
function getSalaryRule(workerName) {
  const w = workers.find(x => x.name === workerName);
  const roleBase = !w
    ? SALARY_CONFIG._junior
    : (w.systemRole === 'senior' || w.systemRole === 'extra')
      ? SALARY_CONFIG._senior
      : (w.systemRole === 'manager' ? SALARY_CONFIG._manager : SALARY_CONFIG._junior);
  const personalRule = parseWorkerSalaryFormula(w?.salaryFormula);
  if (!personalRule) {
    return roleBase;
  }
  const normalizedPersonal = sanitizeWorkerSalaryRuleConfig(personalRule);
  return {
    ...roleBase,
    ...normalizedPersonal,
    serviceAdjustments: {
      ...((roleBase && roleBase.serviceAdjustments) || {}),
      ...((normalizedPersonal && normalizedPersonal.serviceAdjustments) || {}),
    },
    serviceRates: {
      ...((roleBase && roleBase.serviceRates) || {}),
      ...((normalizedPersonal && normalizedPersonal.serviceRates) || {}),
    },
  };
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
      || order.extraAssistant === workerName
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
    isOrderFinanciallyActive(o) &&
    o.date === date &&
    calcWorkerOrderSalary(workerName, o) > 0
  );
}

function parseOrderServiceSelections(serviceTypeValue) {
  const raw = String(serviceTypeValue || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map(item => {
          if (typeof item === 'string') {
            const name = item.trim();
            return name ? { name, qty: 1 } : null;
          }
          const name = String(item?.name || '').trim();
          const qty = Math.max(1, Number(item?.qty) || 1);
          return name ? { name, qty } : null;
        })
        .filter(Boolean);
    }
  } catch (e) {
    // старый формат ниже
  }
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(name => ({ name, qty: 1 }));
}

function stringifyOrderServiceSelections(items) {
  const normalized = (items || [])
    .map(item => ({
      name: String(item?.name || '').trim(),
      qty: Math.max(1, Number(item?.qty) || 1),
    }))
    .filter(item => item.name);
  return normalized.length ? JSON.stringify(normalized) : '';
}

function _salarySelectedServiceItems(order) {
  const byName = (typeof SERVICE_TYPE_BY_NAME !== 'undefined') ? SERVICE_TYPE_BY_NAME : {};
  return parseOrderServiceSelections(order?.serviceType)
    .flatMap(item => {
      const service = byName[item.name] || { name: item.name, rate: 0, salaryCategory: 'custom' };
      return Array.from({ length: Math.max(1, Number(item.qty) || 1) }, () => service);
    });
}

function hasCustomSalaryService(order) {
  return _salarySelectedServiceItems(order).some(item => item.salaryCategory === 'custom');
}

function _customServiceSalary(order) {
  return Math.round((Number(order?.mount) || 0) * 0.2);
}

function _extraWorkSalary(order, workerName = '') {
  const rule = workerName ? getSalaryRule(workerName) : {};
  const hasPersonalPct = rule && Object.prototype.hasOwnProperty.call(rule, 'extraWorkPct');
  const pct = hasPersonalPct ? (Number(rule?.extraWorkPct) || 0) : 0.2;
  const amount = Math.round((Number(order?.extraWork) || 0) * pct);
  if (!amount || pct < 0) return 0;
  if (!workerName) return amount;
  return [order?.responsible, order?.assistant, order?.extraAssistant].includes(workerName) ? amount : 0;
}

function _selectedServicesSalary(workerName, order) {
  const rule = getSalaryRule(workerName);
  if (!rule.selectedServices) return 0;
  if (hasCustomSalaryService(order)) {
    return _customServiceSalary(order);
  }
  const adjustments = rule.serviceAdjustments || {};
  const serviceRates = rule.serviceRates || {};
  return _salarySelectedServiceItems(order).reduce((sum, item) => {
    if (item.salaryCategory === 'custom' || item.salaryCategory === 'special') return sum;
    const hasPersonalRate = Object.prototype.hasOwnProperty.call(serviceRates, item.name);
    const baseRate = hasPersonalRate ? Number(serviceRates[item.name]) : (Number(item.rate) || 0);
    const adjustment = hasPersonalRate ? 0 : (Number(adjustments[item.salaryCategory]) || 0);
    return sum + Math.max(0, baseRate + adjustment);
  }, 0);
}

function getShiftBaseAmount(workerName) {
  const rule = getSalaryRule(workerName);
  return Number(rule.attendanceBase) || Number(rule.dailyBaseIfCompleted) || 0;
}

function hasWorkAttendanceForDate(workerName, date, entries = null) {
  const pool = Array.isArray(entries)
    ? entries
    : (
        (typeof allSalaries !== 'undefined' && Array.isArray(allSalaries) && allSalaries.length)
          ? allSalaries
          : (typeof workerSalaries !== 'undefined' && Array.isArray(workerSalaries) ? workerSalaries : [])
      );
  const total = pool.reduce((sum, entry) => {
    if (entry?.worker_name !== workerName || entry?.date !== date) return sum;
    const amount = Number(entry.amount) || 0;
    const orderId = String(entry?.order_id || '');
    const comment = String(entry?.comment || '');
    if (orderId === WORK_ATTENDANCE_ORDER_ID && amount > 0) return sum + amount;
    if (amount < 0 && orderId.startsWith('Отмена ЗП') && comment.includes('Отмена выхода в работу')) return sum + amount;
    return sum;
  }, 0);
  return total > 0;
}

function calcDailyBaseSalary(workerName, date) {
  if (!workerName || !date) return 0;
  return hasWorkAttendanceForDate(workerName, date) ? getShiftBaseAmount(workerName) : 0;
}

function calcOrderSalary(workerName, order) {
  const rule        = getSalaryRule(workerName);
  const glassMargin = order.dropshipper ? 0 : _orderGlassMargin(order);
  const molding     = Number(order.molding) || 0;
  const fromGlass   = Math.round(glassMargin * (rule.glassMarginPct || 0));
  const fromMolding = Math.round(molding * (rule.moldingPct || 0));
  const fromServ    = _selectedServicesSalary(workerName, order);
  const extraWork   = _extraWorkSalary(order, workerName);

  return fromGlass + fromMolding + fromServ + extraWork;
}

function calcWorkerOrderSalary(workerName, order) {
  if (!workerName || !order || !isOrderFinanciallyActive(order)) return 0;
  let total = 0;
  if (order.workerDone) {
    if ([order.responsible, order.assistant, order.extraAssistant].includes(workerName)) {
      total += calcOrderSalary(workerName, order);
    }
    if (order.reworkData?.responsible === workerName || order.reworkData?.assistant === workerName) {
      total += calcReworkSalary(workerName, order.reworkData);
    }
    if (order.manager === workerName) {
      total += _calcManagerSalary(order);
    }
  }
  total += _calcTatuBonus(workerName, order);
  total += _calcToningBonus(workerName, order);
  return total;
}

function getWorkerOrderSalaryBreakdown(workerName, order) {
  if (!workerName || !order || !isOrderFinanciallyActive(order)) return [];
  const parts = [];
  const rule = getSalaryRule(workerName);

  if (order.workerDone && [order.responsible, order.assistant, order.extraAssistant].includes(workerName)) {
    if (rule.selectedServices) {
      if (hasCustomSalaryService(order)) {
        parts.push({ label: 'Нестандартные работы 20% от монтажа', amount: _customServiceSalary(order) });
      }
      const extraWorkSalary = _extraWorkSalary(order, workerName);
      if (extraWorkSalary > 0) {
        parts.push({ label: 'Доп. работы 20%', amount: extraWorkSalary });
      }
      const adjustments = rule.serviceAdjustments || {};
      const serviceRates = rule.serviceRates || {};
      const groupedServices = {};
      _salarySelectedServiceItems(order).forEach(item => {
        if (item.salaryCategory === 'custom' || item.salaryCategory === 'special') return;
        const hasPersonalRate = Object.prototype.hasOwnProperty.call(serviceRates, item.name);
        const baseRate = hasPersonalRate ? Number(serviceRates[item.name]) : (Number(item.rate) || 0);
        const adjustment = hasPersonalRate ? 0 : (Number(adjustments[item.salaryCategory]) || 0);
        const amount = Math.max(0, baseRate + adjustment);
        if (amount <= 0) return;
        if (!groupedServices[item.name]) {
          groupedServices[item.name] = { qty: 0, amount: 0 };
        }
        groupedServices[item.name].qty += 1;
        groupedServices[item.name].amount += amount;
      });
      Object.entries(groupedServices).forEach(([name, item]) => {
        parts.push({ label: item.qty > 1 ? `${name} ×${item.qty}` : name, amount: item.amount });
      });
    }

    const glassMargin = order.dropshipper ? 0 : _orderGlassMargin(order);
    const fromGlass = Math.round(glassMargin * (rule.glassMarginPct || 0));
    if (fromGlass > 0) parts.push({ label: 'Маржа стекла ' + Math.round((rule.glassMarginPct || 0) * 100) + '%', amount: fromGlass });

    const fromMolding = Math.round((Number(order.molding) || 0) * (rule.moldingPct || 0));
    if (fromMolding > 0) parts.push({ label: 'Молдинг ' + Math.round((rule.moldingPct || 0) * 100) + '%', amount: fromMolding });
  }

  if (order.workerDone && order.manager === workerName) {
    const managerAmount = _calcManagerSalary(order);
    if (managerAmount > 0) parts.push({ label: 'Менеджер ' + Math.round((getSalaryRule(order.manager).glassMarginPct || 0) * 100) + '% маржи стекла', amount: managerAmount });
  }

  const tatuBonus = _calcTatuBonus(workerName, order);
  if (tatuBonus > 0) parts.push({ label: 'Тату ' + Math.round((rule.tatuBonusPct || 0) * 100) + '%', amount: tatuBonus });

  const toningBonus = _calcToningBonus(workerName, order);
  if (toningBonus > 0) parts.push({ label: 'Тонировка ' + Math.round((rule.toningBonusPct || 0) * 100) + '%', amount: toningBonus });

  return parts;
}

// ЗП за доработку
function calcReworkSalary(workerName, reworkData) {
  if (!reworkData) return 0;
  return 0;
}

// Тату-бонус: начисляется если в конфиге есть tatuBonusPct и в заказе есть tatu
function _calcTatuBonus(workerName, order) {
  const assignedWorker = getOrderSpecialServiceAssignedWorker(order, 'tatu') || order?.tatuDoneBy || '';
  if (!workerName || assignedWorker !== workerName) return 0;
  const rule = getSalaryRule(workerName);
  if (!rule.tatuBonusPct) return 0;
  
  if (!order?.tatuDone) return 0;
  const tatu = Number(order.tatu) || 0;
  const tatuBonusMain = (tatu > 0) ? Math.round(tatu * rule.tatuBonusPct) : 0;
  
  const reworkTatu = Number(order.reworkData?.tatu) || 0;
  const tatuBonusRework = (reworkTatu > 0) ? Math.round(reworkTatu * rule.tatuBonusPct) : 0;
  
  return tatuBonusMain + tatuBonusRework;
}

function _calcToningBonus(workerName, order) {
  const assignedWorker = getOrderSpecialServiceAssignedWorker(order, 'toning') || order?.toningDoneBy || '';
  if (!workerName || assignedWorker !== workerName) return 0;
  const rule = getSalaryRule(workerName);
  if (!rule.toningBonusPct) return 0;
  if (!order?.toningDone || order?.toningExternal) return 0;
  return Math.round((Number(order.toning) || 0) * rule.toningBonusPct);
}

// ЗП менеджера: ставка + % от маржи стекла
// Начисляется только если он указан в поле order.manager
function _calcManagerSalary(order) {
  if (order.dropshipper || !order.manager) return 0;
  const rule = getSalaryRule(order.manager);
  const glassMargin = _orderGlassMargin(order);
  return Math.round(glassMargin * (rule.glassMarginPct || 0));
}

// Итоговая зп за день (используется в profile для совместимости)
function calcDaySalary(workerName, date) {
  const salaryEntries = (typeof allSalaries !== 'undefined' && Array.isArray(allSalaries) && allSalaries.length)
    ? allSalaries
    : (typeof workerSalaries !== 'undefined' && Array.isArray(workerSalaries) ? workerSalaries : []);
  return calcDailyBaseSalary(workerName, date)
    + orders
      .filter(o => o.workerDone && !o.isCancelled && o.date === date &&
              isOrderFinanciallyActive(o) &&
              (o.responsible === workerName || o.assistant === workerName || o.manager === workerName || o.reworkData?.responsible === workerName || o.reworkData?.assistant === workerName ||
               o.extraAssistant === workerName ||
               _calcTatuBonus(workerName, o) > 0 || _calcToningBonus(workerName, o) > 0))
      .reduce((sum, o) => {
        let total = sum;
        if ([o.responsible, o.assistant, o.extraAssistant].includes(workerName)) {
          total += calcOrderSalary(workerName, o);
        }
        if (o.reworkData?.responsible === workerName || o.reworkData?.assistant === workerName) {
          total += calcReworkSalary(workerName, o.reworkData);
        }
        if (o.manager === workerName) {
          total += _calcManagerSalary(o);
        }
        total += _calcTatuBonus(workerName, o);
        total += _calcToningBonus(workerName, o);
        return total;
      }, 0);
}

const MANUAL_SALARY_REPORT_ORDER_ID = 'DAY_REPORT';
const SALARY_WITHDRAWAL_ORDER_ID = 'Выплата';
const WORK_ATTENDANCE_ORDER_ID = 'Выход в работу';

function getOrderClientTotalAmount(order) {
  return (Number(order?.total) || 0)
       + (Number(order?.income) || 0)
       + (Number(order?.delivery) || 0);
}

function isOrderDeleted(order) {
  return !!String(order?.deletedAt || '').trim();
}

function isOrderFinanciallyActive(order) {
  return !!order && order.inWork === true && !order.isCancelled && !isOrderDeleted(order);
}

function getOrderCardStateClass(order) {
  if (!order) return '';
  if (order.priorityTask && !order.workerDone) return 'order-card-state-priority';
  if (order.isCancelled) return 'order-card-state-cancelled';
  if (order.ownWarehouse && !order.workerDone) return 'order-card-state-own-warehouse';
  if (order.callStatus && !order.workerDone) return 'order-card-state-call';
  if (order.inWork && !order.workerDone) return 'order-card-state-planner';
  if (!order.callStatus && !order.inWork && !order.ownWarehouse && !order.workerDone) return 'order-card-state-selection';
  return '';
}

function isOwnerManualSalaryEntry(entry) {
  return !!entry && entry.entry_type === 'manual';
}

function isLegacySpecialServiceSalaryEntry(entry) {
  if (!entry) return false;
  const orderId = String(entry.order_id || '').trim();
  const comment = String(entry.comment || '').trim();
  if (!orderId) return false;
  return (
    (orderId.includes('· Тату') && comment.startsWith('Тату по заказу ')) ||
    (orderId.includes('· Тонировка') && comment.startsWith('Тонировка по заказу '))
  );
}

function isSalaryWithdrawalEntry(entry) {
  return !!entry && String(entry.order_id || '').startsWith(SALARY_WITHDRAWAL_ORDER_ID);
}

function isWorkAttendanceEntry(entry) {
  return !!entry && entry.order_id === WORK_ATTENDANCE_ORDER_ID && Number(entry.amount) > 0;
}

function isRelevantSalaryEntry(entry) {
  return !!entry && Number(entry.amount) !== 0;
}

function getSalaryWithdrawalActor(entry) {
  const raw = String(entry?.order_id || '');
  const prefix = `${SALARY_WITHDRAWAL_ORDER_ID} · снял `;
  if (!raw.startsWith(prefix)) return '';
  return raw.slice(prefix.length).trim();
}

function getSalaryEntryTimestamp(entry) {
  const createdAt = String(entry?.created_at || '').trim();
  if (createdAt) {
    const time = new Date(createdAt).getTime();
    if (!Number.isNaN(time)) return time;
  }
  const date = String(entry?.date || '').trim();
  if (date) {
    const time = new Date(`${date}T00:00:00`).getTime();
    if (!Number.isNaN(time)) return time;
  }
  return 0;
}

function getLatestSalaryWithdrawalEntry(workerName, entries = []) {
  return (entries || [])
    .filter(entry => entry?.worker_name === workerName && isSalaryWithdrawalEntry(entry))
    .sort((a, b) => getSalaryEntryTimestamp(b) - getSalaryEntryTimestamp(a))[0] || null;
}

function isSalaryEntryOpenForCurrentAccumulation(entry, entries = []) {
  if (!entry || isSalaryWithdrawalEntry(entry)) return false;
  const latestWithdrawal = getLatestSalaryWithdrawalEntry(entry.worker_name, entries);
  if (!latestWithdrawal) return true;
  return getSalaryEntryTimestamp(entry) > getSalaryEntryTimestamp(latestWithdrawal);
}

function getWorkerCompletedOrdersSummary(workerName, date) {
  const dayOrders = _getCompletedOrdersForWorkerDate(workerName, date);
  return {
    date,
    count: dayOrders.length,
    totalAmount: dayOrders.reduce((sum, order) => sum + getOrderClientTotalAmount(order), 0),
    orders: dayOrders.map(order => ({
      id: order.id,
      client: order.client || '—',
      car: order.car || order.client || '—',
      amount: calcWorkerOrderSalary(workerName, order),
      breakdown: getWorkerOrderSalaryBreakdown(workerName, order),
    })),
  };
}

// ── GLOBAL STATE ─────────────────────────────────────────────

const ROLE_LABELS = {
  owner:   'Владелец',
  manager: 'Менеджер',
  senior:  'Старший специалист',
  junior:  'Младший специалист',
  extra:   'Экстра специалист',
};

function getWorkerSystemRoleLabel(systemRole) {
  return ROLE_LABELS[String(systemRole || '').trim()] || String(systemRole || '').trim() || 'Сотрудник';
}

const CASH_ACCOUNT_CASH = 'cash';
const CASH_ACCOUNT_FOP = 'fop';
const ORDER_META_TATU_STATUS_TOKEN = '__tatu_status__';
const ORDER_META_TONING_STATUS_TOKEN = '__toning_status__';
const ORDER_META_TATU_RESP_PREFIX = '__tatu_resp__:';
const ORDER_META_TONING_RESP_PREFIX = '__toning_resp__:';

let paymentMethods = [];

const PAYMENT_METHOD_LABEL_ALIASES = {
  'Шепель карта': '👤 Шепель Александр 💳 4149 4975 1422 9980 (PRIVAT)',
  'Киртока Максим': '👤 Киртока Максим 💳 4441 1144 6035 9811 (MONO)',
  'Киртока Анастасия': '👤 Киртока Анастасия 💳 4149 6090 2872 4237 (PRIVAT)',
  'Бабенко карта': '👤 Бабенко Олег 💳 5457 0825 0103 4743 (PRIVAT)',
  'Бабенко фоп': '📂 БЕЗНАЛ БАБЕНКО',
};

function getPaymentMethods() {
  const rows = Array.isArray(paymentMethods) ? paymentMethods : [];
  const seen = new Set();
  return rows.reduce((acc, row) => {
    const normalizedLabel = normalizePaymentMethod(row?.label);
    if (!normalizedLabel || seen.has(normalizedLabel)) return acc;
    seen.add(normalizedLabel);
    acc.push({ ...row, label: normalizedLabel });
    return acc;
  }, []);
}

function findPaymentMethodConfigByLabel(label) {
  const normalized = normalizePaymentMethod(label);
  if (!normalized) return null;
  return getPaymentMethods().find(row => normalizePaymentMethod(row?.label) === normalized) || null;
}

function isCardPaymentMethod(method) {
  const cfg = findPaymentMethodConfigByLabel(method);
  return String(cfg?.method_type || '').trim().toLowerCase() === 'card';
}

function isFopPaymentMethod(method) {
  const cfg = findPaymentMethodConfigByLabel(method);
  return String(cfg?.method_type || '').trim().toLowerCase() === 'fop';
}

function isCashPaymentMethod(method) {
  const cfg = findPaymentMethodConfigByLabel(method);
  if (cfg) return String(cfg?.method_type || '').trim().toLowerCase() === 'cash';
  // Backward compatibility for legacy data / before methods loaded.
  return normalizePaymentMethod(method) === '🪙 Наличка';
}

function paymentMethodRequiresConfirmation(method) {
  const cfg = findPaymentMethodConfigByLabel(method);
  if (cfg) return cfg.requires_confirmation === true || cfg.method_type === 'card' || cfg.method_type === 'fop';
  return !isCashPaymentMethod(method);
}

function parseOrderConfigurationMeta(configuration) {
  const parts = String(configuration || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  const visibleParts = [];
  let tatuStatus = false;
  let toningStatus = false;
  let tatuResponsible = '';
  let toningResponsible = '';
  parts.forEach(part => {
    if (part === ORDER_META_TATU_STATUS_TOKEN) {
      tatuStatus = true;
      return;
    }
    if (part === ORDER_META_TONING_STATUS_TOKEN) {
      toningStatus = true;
      return;
    }
    if (part.startsWith(ORDER_META_TATU_RESP_PREFIX)) {
      tatuResponsible = part.slice(ORDER_META_TATU_RESP_PREFIX.length).trim();
      return;
    }
    if (part.startsWith(ORDER_META_TONING_RESP_PREFIX)) {
      toningResponsible = part.slice(ORDER_META_TONING_RESP_PREFIX.length).trim();
      return;
    }
    visibleParts.push(part);
  });
  return {
    configuration: visibleParts.join(','),
    tatuStatus,
    toningStatus,
    tatuResponsible,
    toningResponsible,
  };
}

function buildOrderConfigurationMeta(configuration, options = {}) {
  const parsed = parseOrderConfigurationMeta(configuration);
  const parts = parsed.configuration
    ? parsed.configuration.split(',').map(part => part.trim()).filter(Boolean)
    : [];
  if (options.tatuStatus) parts.push(ORDER_META_TATU_STATUS_TOKEN);
  if (options.toningStatus) parts.push(ORDER_META_TONING_STATUS_TOKEN);
  const tatuResponsible = String(options.tatuResponsible ?? parsed.tatuResponsible ?? '').trim();
  const toningResponsible = String(options.toningResponsible ?? parsed.toningResponsible ?? '').trim();
  if (tatuResponsible) parts.push(`${ORDER_META_TATU_RESP_PREFIX}${tatuResponsible}`);
  if (toningResponsible) parts.push(`${ORDER_META_TONING_RESP_PREFIX}${toningResponsible}`);
  return [...new Set(parts)].join(',');
}

function normalizePaymentMethod(method) {
  if (!method) return '';
  const value = String(method).trim();
  if (value === 'Наличка') return '🪙 Наличка';
  if (PAYMENT_METHOD_LABEL_ALIASES[value]) return PAYMENT_METHOD_LABEL_ALIASES[value];
  return value;
}

function buildPaymentSourceKey(orderId, method, paymentType = 'client', payment = null) {
  const normalizedMethod = normalizePaymentMethod(method) || '';
  const amount = Number(payment?.amount) || 0;
  const date = String(payment?.date || '').trim();
  const timestamp = String(payment?.timestamp || '').trim();
  return [
    `order:${String(orderId || '').trim()}`,
    `type:${encodeURIComponent(String(paymentType || 'client'))}`,
    `method:${encodeURIComponent(normalizedMethod)}`,
    `amount:${encodeURIComponent(String(amount))}`,
    `date:${encodeURIComponent(date)}`,
    `ts:${encodeURIComponent(timestamp)}`,
  ].join('|');
}

function getPaymentMethodFromSourceKey(sourceKey) {
  const raw = String(sourceKey || '');
  const match = raw.match(/(?:^|\|)method:([^|]+)/);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch (e) {
    return match[1];
  }
}

function getCashEntrySourceKey(entry) {
  return String(entry?.source_key || entry?.fop_source_key || entry?.source_id || '').trim();
}

function getCashEntryAccountType(entry) {
  return String(entry?.account_type || entry?.cash_account || 'cash').trim().toLowerCase();
}

function getCashEntryPaymentMethod(entry) {
  return normalizePaymentMethod(
    entry?.payment_method
    || entry?.manual_payment_method
    || getPaymentMethodFromSourceKey(getCashEntrySourceKey(entry))
    || ''
  );
}

function getCashEntryApprovalStatus(entry) {
  if (entry?.fop_confirmed === true) return 'confirmed';
  if (entry?.approval_status) return String(entry.approval_status).trim().toLowerCase();
  return isConfirmableCashEntry(entry) ? 'pending' : 'not_required';
}

function isCashEntryApproved(entry) {
  return getCashEntryApprovalStatus(entry) === 'confirmed' || getCashEntryApprovalStatus(entry) === 'not_required';
}

function getCashEntryOwner(entry) {
  return String(entry?.cash_owner || entry?.worker_name || '').trim();
}

function getCashEntrySourceType(entry) {
  return String(entry?.source_type || '').trim().toLowerCase();
}

function getCashEntryAccountLabel(entry) {
  const account = getCashEntryAccountType(entry);
  if (account === 'fop') return 'ФОП';
  if (account === 'currency') return 'Валюта';
  return 'Наличные';
}

function getCashEntrySourceLabel(entry) {
  const sourceType = getCashEntrySourceType(entry);
  const orderId = String(entry?.order_id || '').trim();
  if (sourceType === 'order' && orderId) return `Заказ ${orderId}`;
  if (sourceType === 'salary') return 'ЗП';
  if (sourceType === 'expense') return 'Расход';
  if (sourceType === 'dropshipper') return 'Дроп';
  if (sourceType === 'exchange') return 'Обмен';
  if (sourceType === 'reversal') return 'Отмена';
  if (sourceType === 'correction') return 'Коррекция';
  if (sourceType === 'manual') return 'Ручная';
  if (orderId) return `Заказ ${orderId}`;
  return '';
}

function getCashEntryTagLabels(entry, options = {}) {
  const includeOwner = options?.includeOwner === true;
  const includeSource = options?.includeSource !== false;
  const tags = [];
  const owner = getCashEntryOwner(entry);
  const paymentMethod = getCashEntryPaymentMethod(entry);
  const sourceLabel = getCashEntrySourceLabel(entry);
  const expenseCategory = String(entry?.expense_category || '').trim();
  const warehouseName = String(entry?.warehouse_name || '').trim();
  const ledgerStatus = String(entry?.ledger_status || '').trim().toLowerCase();

  if (includeOwner && owner) {
    tags.push(`Касса: ${getWorkerDisplayName(owner) || owner}`);
  } else {
    const accountLabel = getCashEntryAccountLabel(entry);
    if (accountLabel) tags.push(accountLabel);
  }

  if (paymentMethod) tags.push(paymentMethod);
  if (includeSource && sourceLabel) tags.push(sourceLabel);
  if (ledgerStatus === 'corrected') tags.push('Исправлено');
  if (ledgerStatus === 'reversed') tags.push('Отменено');
  if (expenseCategory) tags.push(expenseCategory);
  if (warehouseName && expenseCategory !== 'Заправка') tags.push(`Склад ${warehouseName}`);

  return tags.filter((tag, index, arr) => tag && arr.indexOf(tag) === index);
}

function isConfirmableCashEntry(entry) {
  if (entry?.approval_status) {
    const normalizedStatus = String(entry.approval_status).trim().toLowerCase();
    return normalizedStatus === 'pending' || normalizedStatus === 'confirmed';
  }
  const account = getCashEntryAccountType(entry);
  const paymentMethod = getCashEntryPaymentMethod(entry);
  if ((account !== CASH_ACCOUNT_CASH && account !== CASH_ACCOUNT_FOP) || !paymentMethod) return false;
  if (account === CASH_ACCOUNT_FOP) return true;
  return paymentMethodRequiresConfirmation(paymentMethod);
}

function isConfirmablePaymentMethod(method) {
  const normalized = normalizePaymentMethod(method);
  return !!normalized && !isCashPaymentMethod(normalized);
}

function isOrderPaymentConfirmed(order, payment, paymentType = 'client') {
  const method = normalizePaymentMethod(payment?.method || '');
  if (!method) return false;
  if (!isConfirmablePaymentMethod(method)) return true;
  if (payment?.confirmed === true) return true;
  const sourceKey = buildPaymentSourceKey(order?.id || '', method, paymentType, payment);
  const availableRows = [
    ...(Array.isArray(window.allCashLog) ? window.allCashLog : []),
    ...(Array.isArray(window.ownerCashRecentLog) ? window.ownerCashRecentLog : []),
    ...(typeof workerCashLog !== 'undefined' && Array.isArray(workerCashLog) ? workerCashLog : []),
  ];
  const matchingEntries = availableRows.filter(entry => {
    if (getCashEntrySourceKey(entry) !== sourceKey) return false;
    if (String(entry?.deleted_at || '').trim()) return false;
    const ledgerStatus = String(entry?.ledger_status || 'posted').trim().toLowerCase();
    return !['voided', 'reversed', 'corrected'].includes(ledgerStatus);
  });
  if (matchingEntries.length) {
    return matchingEntries.some(entry => {
      if (entry?.fop_confirmed === true) return true;
      const status = String(entry?.approval_status || '').trim().toLowerCase();
      if (status === 'pending') return false;
      if (status === 'not_required') return true;
      return entry?.fop_confirmed === true || status === 'confirmed';
    });
  }
  if (payment?.confirmed === false) return false;
  return false;
}

function getOrderPaymentCashEntry(order, payment, paymentType = 'client') {
  const method = normalizePaymentMethod(payment?.method || '');
  if (!method || !isConfirmablePaymentMethod(method)) return null;
  const sourceKey = buildPaymentSourceKey(order?.id || '', method, paymentType, payment);
  return Array.isArray(window.allCashLog)
    ? (window.allCashLog.find(entry => getCashEntrySourceKey(entry) === sourceKey) || null)
    : null;
}

function sumConfirmedOrderPayments(order, payments = [], paymentType = 'client') {
  return (payments || []).reduce((sum, payment) => {
    const amount = Number(payment?.amount) || 0;
    if (amount <= 0) return sum;
    return sum + (isOrderPaymentConfirmed(order, payment, paymentType) ? amount : 0);
  }, 0);
}

function sumRecordedOrderPayments(payments = []) {
  return (payments || []).reduce((sum, payment) => {
    const amount = Number(payment?.amount) || 0;
    if (amount <= 0) return sum;
    if (!isConfirmablePaymentMethod(payment?.method || '')) return sum + amount;
    return payment?.confirmed === true ? sum + amount : sum;
  }, 0);
}

function getOrderClientPaidAmount(order) {
  const payments = Array.isArray(order?.clientPayments) ? order.clientPayments : [];
  if (payments.length) return sumConfirmedOrderPayments(order, payments, 'client');
  return Number(order?.debt) || 0;
}

function getOrderClientConfirmedPaidAmount(order) {
  return getOrderClientPaidAmount(order);
}

function getOrderSupplierPaidAmount(order) {
  const payments = Array.isArray(order?.supplierPayments) ? order.supplierPayments : [];
  if (payments.length) return sumConfirmedOrderPayments(order, payments, 'supplier');
  return Number(order?.check) || 0;
}

function getPaymentCashRoute(method, fallbackWorkerName = '') {
  const normalized = normalizePaymentMethod(method);
  const targetWorkerName = fallbackWorkerName || currentWorkerName || '';
  const cfg = findPaymentMethodConfigByLabel(normalized);
  if (!cfg || String(cfg?.method_type || '').trim().toLowerCase() === 'cash' || isCashPaymentMethod(normalized)) {
    return {
      workerName: targetWorkerName,
      workerId: getWorkerIdByName(targetWorkerName),
      cashAccount: CASH_ACCOUNT_CASH,
      requiresConfirmation: false,
    };
  }
  const type = String(cfg?.method_type || '').trim().toLowerCase();
  const resolvedOwner = cfg?.worker_id
    ? getWorkerRecordById(String(cfg.worker_id).trim())
    : getWorkerRecordByName(String(cfg?.worker_name || '').trim());
  const ownerWorker = String(resolvedOwner?.name || cfg?.worker_name || '').trim();
  const ownerWorkerId = resolvedOwner?.id || cfg?.worker_id || getWorkerIdByName(ownerWorker || targetWorkerName);
  return {
    workerName: ownerWorker || targetWorkerName,
    workerId: ownerWorkerId,
    cashAccount: type === 'fop' ? CASH_ACCOUNT_FOP : CASH_ACCOUNT_CASH,
    requiresConfirmation: true,
  };
}

function resolveOrderPaymentCashRoute({ order = null, payment = null, paymentType = 'client', method = '', fallbackWorkerName = '' } = {}) {
  const normalized = normalizePaymentMethod(method || payment?.method || '');
  let routeFallbackWorkerName = String(fallbackWorkerName || order?.responsible || currentWorkerName || '').trim();
  let reason = 'payment method route';

  if (isCashPaymentMethod(normalized) && payment?.cashWorker) {
    routeFallbackWorkerName = String(payment.cashWorker || '').trim() || routeFallbackWorkerName;
    reason = 'selected cash worker';
  }

  if (paymentType === 'dropshipper' && isCashPaymentMethod(normalized) && typeof getDropshipperCashWorkerRecord === 'function') {
    const dropshipperWorker = getDropshipperCashWorkerRecord(order?.dropshipper);
    if (dropshipperWorker?.name) {
      routeFallbackWorkerName = String(dropshipperWorker.name || '').trim() || routeFallbackWorkerName;
      reason = 'dropshipper cash worker';
    }
  }

  const route = getPaymentCashRoute(normalized, routeFallbackWorkerName);
  return {
    ...route,
    method: normalized,
    paymentType,
    routeFallbackWorkerName,
    reason,
  };
}

function buildOrderPaymentCashEntryPayload({ order, payment, paymentType = 'client', fallbackWorkerName = '' }) {
  const amount = Number(payment?.amount) || 0;
  const method = normalizePaymentMethod(payment?.method || '');
  if (!amount || !method) return null;

  const route = resolveOrderPaymentCashRoute({ order, payment, paymentType, method, fallbackWorkerName });
  const signedAmount = paymentType === 'supplier' || paymentType === 'dropshipper' ? -amount : amount;
  const orderId = order?.id || '—';
  const paymentDate = payment?.date || order?.date || '';
  const dateLabel = paymentDate ? formatDate(paymentDate) : '—';
  const clientLabel = order?.client || '—';
  const carLabel = order?.car || order?.client || '—';
  const actionLabel = paymentType === 'supplier'
    ? 'Оплата поставщику'
    : (paymentType === 'dropshipper' ? 'Выплата дропшипперу' : 'Оплата клиента');
  const payload = {
    worker_name: route.workerName,
    cash_owner: route.workerName,
    worker_id: route.workerId || null,
    cash_owner_id: route.workerId || null,
    amount: signedAmount,
    comment: `${actionLabel} ${method} ${orderId}, ${dateLabel}, клиент: ${clientLabel}, авто: ${carLabel}`,
    cash_account: route.cashAccount,
    account_type: route.cashAccount,
    payment_method: method,
    payment_type: isCashPaymentMethod(method) ? 'cash' : (route.cashAccount === CASH_ACCOUNT_FOP ? 'transfer' : 'card'),
    approval_status: route.requiresConfirmation ? 'pending' : 'not_required',
    approval_by: route.requiresConfirmation ? route.workerName : null,
    approval_by_id: route.requiresConfirmation ? (route.workerId || null) : null,
    source_type: 'order',
    order_id: orderId,
  };

  if (!isCashPaymentMethod(method)) {
    payload.fop_date = paymentDate || null;
    payload.fop_source_key = buildPaymentSourceKey(orderId, method, paymentType, payment);
  }

  if (route.requiresConfirmation) {
    payload.fop_confirmed = false;
  }

  return payload;
}

let currentRole = null;
let currentWorkerName = null;
let workers     = [];
let orders      = [];

let refCars             = [];
let refWarehouses       = [];
let refDropshippers     = [];
let appSettings         = {};
let glassManufacturersSyncPromise = null;
let glassManufacturersLastSyncAt = 0;
let carDirectory        = []; // справочник авто
let refEquipment        = [];
let refPaymentStatuses  = [];
let refPartners         = [];
let refSupplierStatuses = [];
let refServiceRates     = [];

// ── HELPERS ──────────────────────────────────────────────────

function getOrderIdNumber(id) {
  const m = String(id || '').match(/SG-(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function formatOrderId(num) {
  return 'SG-' + String(Math.max(1, Number(num) || 1)).padStart(4, '0');
}

function generateOrderId(afterId = '') {
  const nums = orders.map(o => {
    return getOrderIdNumber(o.id);
  });
  const localNext = (nums.length ? Math.max(...nums) : 0) + 1;
  const afterNext = getOrderIdNumber(afterId) + 1;
  return formatOrderId(Math.max(localNext, afterNext));
}

function canCreateOrder()    { return currentRole === 'owner' || currentUserHasPermission('orders_create', currentRole === 'manager'); }
function canEditPrice(order) {
  if (currentRole === 'owner') return true;
  if (currentRole === 'manager') return true;
  if (currentRole === 'extra') {
    if (order && (order.responsible === currentWorkerName || order.assistant === currentWorkerName || order.extraAssistant === currentWorkerName)) return true;
    return !order.priceLocked;
  }
  if (currentRole === 'senior') return !order.priceLocked;
  return false;
}
function canViewClients()  { return currentRole === 'owner' || currentUserHasPermission('clients_view', currentRole === 'manager'); }
function canPrintClientStatement() { return currentRole === 'owner' || currentUserHasPermission('client_statement_print'); }
function canViewWorkers()  { return currentRole === 'owner' || currentUserHasPermission('workers_view'); }
function canViewCarDirectory() { return currentRole === 'owner' || currentUserHasPermission('car_directory_view'); }
function canDeleteOrder()  { return currentRole === 'owner' || currentUserHasPermission('orders_delete', false); }
function canViewFinance()  { return currentRole === 'owner' || currentUserHasPermission('finance_view'); }
function canManageDropshippers() { return currentRole === 'owner' || currentUserHasPermission('dropshippers_manage'); }
function canViewWarehouses() { return currentRole === 'owner' || currentUserHasPermission('warehouses_view', currentRole === 'manager'); }
function canViewDashboard() { return currentRole === 'owner' || currentRole === 'manager' || currentUserHasAnyDashboardPermission(); }
function canViewOwnerCash() { return currentRole === 'owner' || currentUserHasPermission('owner_cash_view'); }
function canViewOwnerExpenses() { return currentRole === 'owner' || currentUserHasPermission('owner_expenses_view'); }
function canViewOwnerPayments() { return currentRole === 'owner' || currentUserHasPermission('owner_payments_view'); }
function canViewOwnerToday() { return currentRole === 'owner' || currentUserHasPermission('groups_view'); }
function canViewCalendar() { return currentRole === 'owner' || currentUserHasPermission('calendar_view'); }
function canMarkWorkerDone() { return currentRole === 'owner' || currentUserHasPermission('order_complete', currentRole === 'senior' || currentRole === 'extra'); }

function getClients() {
  const map = {};
  for (const o of orders) {
    if (!o.client) continue;
    const key = o.phone || o.client;
    if (!map[key]) map[key] = { name: o.client, phone: o.phone, address: o.address || '', alias: o.client || '', requisites: '', orders: [] };
    map[key].orders.push(o);
    if (o.address) map[key].address = o.address;
  }
  if (typeof manualClients !== 'undefined') {
    for (const c of manualClients) {
      const key = c.phone || c.name;
      if (!map[key]) map[key] = { name: c.name, phone: c.phone, address: c.address || '', alias: c.alias || c.name || '', requisites: c.requisites || '', orders: [] };
      map[key].alias = c.alias || map[key].alias || c.name || '';
      map[key].requisites = c.requisites || map[key].requisites || '';
      if (c.address) map[key].address = c.address;
      if (c.id) map[key].id = c.id;
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
