// ============================================================
// ORDERS.JS — список заказов, детали, модал создания/редактирования
// ============================================================

let editingOrderId  = null;      // null = новый, иначе id редактируемого
let currentOrderTab = 'selection';  // 'selection' | 'call' | 'planner' | 'done' — для owner/manager
let currentWorkerTab = 'actual'; // 'actual' | 'today' | 'done' | 'future' | 'past' | 'all' — для специалистов
let ordersFiltersOpen = true;
let currentOrderDetailId = null;
let orderModalInitialSnapshot = '';
let orderDateFilterExact = '';
let orderDateFilterFrom = '';
let orderDateFilterTo = '';
const deletingOrderIds = new Set();
window.__financeAuditDevEnabled = window.__financeAuditDevEnabled === true;

function isFinanceAuditDevEnabled() {
  return window.__financeAuditDevEnabled === true;
}

function enableFinanceAuditDevMode() {
  window.__financeAuditDevEnabled = true;
  console.info('[finance] dev mode enabled: финансовый путь заказа включен');
  if (currentOrderDetailId) openOrderDetail(currentOrderDetailId);
  return 'finance dev enabled';
}

try {
  Object.defineProperty(window, 'dev', {
    configurable: true,
    get() {
      return enableFinanceAuditDevMode();
    },
  });
} catch (e) {
  console.warn('[finance] Не удалось установить dev shortcut', e);
}

const DEFAULT_SERVICE_TYPE_OPTIONS = [
  { group: 'Монтаж', name: 'Монтаж лобового', rate: 400, salaryCategory: 'mount' },
  { group: 'Монтаж', name: 'Монтаж бокового', rate: 300, salaryCategory: 'mount' },
  { group: 'Монтаж', name: 'Монтаж заднего', rate: 400, salaryCategory: 'mount' },
  { group: 'Монтаж', name: 'Монтаж лобового бус', rate: 500, salaryCategory: 'mount' },
  { group: 'Монтаж', name: 'Монтаж лобового грузовик', rate: 700, salaryCategory: 'mount' },
  { group: 'Срезка', name: 'Срезка лобового', rate: 200, salaryCategory: 'cut' },
  { group: 'Срезка', name: 'Срезка бокового', rate: 150, salaryCategory: 'cut' },
  { group: 'Срезка', name: 'Срезка заднего', rate: 200, salaryCategory: 'cut' },
  { group: 'Срезка', name: 'Срезка лобового бус', rate: 250, salaryCategory: 'cut' },
  { group: 'Срезка', name: 'Срезка лобового грузовик', rate: 350, salaryCategory: 'cut' },
  { group: 'Вклейка', name: 'Вклейка лобового', rate: 200, salaryCategory: 'glue' },
  { group: 'Вклейка', name: 'Вклейка бокового', rate: 150, salaryCategory: 'glue' },
  { group: 'Вклейка', name: 'Вклейка заднего', rate: 200, salaryCategory: 'glue' },
  { group: 'Вклейка', name: 'Вклейка лобового бус', rate: 250, salaryCategory: 'glue' },
  { group: 'Вклейка', name: 'Вклейка лобового грузовик', rate: 350, salaryCategory: 'glue' },
  { group: 'Дополнительно', name: 'Тату', rate: 0, salaryCategory: 'special' },
  { group: 'Дополнительно', name: 'Тонировка', rate: 0, salaryCategory: 'special' },
  { group: 'Нестандартные работы', name: 'Нестандартные работы', rate: 0, salaryCategory: 'custom' },
];
function getServiceTypeOptions() {
  const rows = Array.isArray(refServiceRates) ? refServiceRates : [];
  const activeRows = rows
    .filter(row => row?.active !== false && String(row?.name || '').trim())
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
  if (!activeRows.length) return DEFAULT_SERVICE_TYPE_OPTIONS;
  return activeRows.map(row => ({
    group: String(row.service_group || row.group || '').trim() || 'Услуги',
    name: String(row.name || '').trim(),
    rate: Number(row.rate) || 0,
    salaryCategory: String(row.salary_category || row.salaryCategory || 'custom').trim() || 'custom',
  }));
}
const SERVICE_TYPE_OPTIONS = new Proxy([], {
  get(_target, prop) {
    const options = getServiceTypeOptions();
    const value = options[prop];
    return typeof value === 'function' ? value.bind(options) : value;
  },
  ownKeys() { return Reflect.ownKeys(getServiceTypeOptions()); },
  getOwnPropertyDescriptor(_target, prop) {
    return Object.getOwnPropertyDescriptor(getServiceTypeOptions(), prop);
  }
});
const CUSTOM_SERVICE_TYPE_NAME = 'Нестандартные работы';
const DEFAULT_GLASS_MANUFACTURERS = [
  {
    name: '🇨🇳 XYG (Китай)',
    description: 'Средний сегмент (хороший аналог)\nГеометрия уступает европейским производителям\nМассово используется на рынке',
  },
  {
    name: '🇨🇳 BENSON (Китай)',
    description: 'Средний сегмент (хороший аналог)\nГеометрия уступает европейским производителям\nМассово используется на рынке',
  },
  {
    name: '🇨🇳 LAMINATED (Китай)',
    description: 'Средний сегмент (хороший аналог)\nГеометрия уступает европейским производителям\nМассово используется на рынке',
  },
  {
    name: '🇨🇳 GLASPO (Китай)',
    description: 'Средний сегмент (хороший аналог)\nГеометрия уступает европейским производителям\nМассово используется на рынке',
  },
  {
    name: '🇪🇺 Saint-Gobain Sekurit (Европа)',
    description: 'Отличная геометрия, максимальное качество',
  },
  {
    name: '🇪🇺 Pilkington (Европа)',
    description: 'стабильное стекло уровня оригинала, но многое зависит от партии: бывает не идеал, но в среднем без сюрпризов',
  },
  {
    name: '🇺🇸 GUARDIAN',
    description: 'Средний сегмент, ближе к хорошему аналогу\nАмериканский производитель, стабильное качество',
  },
  {
    name: '🇵🇱Carlex',
    description: 'Средний сегмент (аналог)\nПольское производство, часто встречается в Европе',
  },
  {
    name: '🇹🇷🇪🇺GLAVISTA',
    description: 'турецко-европейский производитель автостекла',
  },
];

function getGlassManufacturers() {
  const configured = appSettings?.glass_manufacturers?.items;
  const source = Array.isArray(configured) ? configured : DEFAULT_GLASS_MANUFACTURERS;
  return source
    .map((item, index) => ({
      id: String(item?.id || `manufacturer-${index + 1}`),
      name: String(item?.name || '').trim(),
      description: String(item?.description || '').trim(),
    }))
    .filter(item => item.name);
}

function getGlassManufacturerByName(name) {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized) return null;
  return getGlassManufacturers().find(item => item.name.toLowerCase() === normalized) || null;
}

function populateGlassManufacturerOptions(selectedValue = '') {
  const select = document.getElementById('f-glass-manufacturer');
  if (!select) return;
  const selected = String(selectedValue || select.value || '').trim();
  const manufacturers = getGlassManufacturers();
  const options = [...manufacturers];
  if (selected && !options.some(item => item.name === selected)) {
    options.push({ id: 'historical', name: selected, description: '' });
  }
  select.innerHTML = '<option value="">— выбрать —</option>'
    + options.map(item => `<option value="${escapeAttr(item.name)}">${escapeHtml(item.name)}</option>`).join('');
  select.value = selected;
}

const SERVICE_TYPE_BY_NAME = new Proxy({}, {
  get(_target, prop) {
    return getServiceTypeOptions().find(item => item.name === prop);
  },
  has(_target, prop) {
    return getServiceTypeOptions().some(item => item.name === prop);
  },
  ownKeys() {
    return getServiceTypeOptions().map(item => item.name);
  },
  getOwnPropertyDescriptor(_target, prop) {
    const value = getServiceTypeOptions().find(item => item.name === prop);
    return value ? { enumerable: true, configurable: true, value } : undefined;
  },
});

function getCurrentWorkerSystemRole() {
  const worker = (workers || []).find(item => item.name === currentWorkerName);
  return worker?.systemRole || currentRole || '';
}

function currentUserCanActAsSenior() {
  const role = getCurrentWorkerSystemRole();
  return role === 'senior' || role === 'extra';
}

function canMarkWorkerDone() {
  // Галочка доступна только специалисту (senior) для своих заказов
  return currentUserHasPermission('order_complete', currentUserCanActAsSenior()) && currentUserCanActAsSenior();
}

function canQuickConfirmOrderAmounts(order) {
  const currentWorker = typeof getCurrentWorkerRecord === 'function' ? getCurrentWorkerRecord() : null;
  const currentName = currentWorker?.name || currentWorkerName;
  const isAssignedSpecialist = getOrderSpecialServiceAssignedWorker(order, 'tatu') === currentName
    || getOrderSpecialServiceAssignedWorker(order, 'toning') === currentName;
  return currentUserHasPermission('order_payments_manage', currentUserCanActAsSenior())
    && currentUserCanActAsSenior()
    && (order?.responsible === currentName || isAssignedSpecialist)
    && isOrderFinanciallyActive(order)
    && !order?.workerDone;
}

function canCurrentUserOpenOrderModal(order) {
  if (currentRole === 'owner' || currentRole === 'manager') return true;
  if (currentUserCanViewAllOrders()) return true;
  if (currentUserCanActAsSenior()) return true;
  if (!order) return false;
  const hasOrderAccess = currentUserHasPermission('orders_edit')
    || currentUserHasPermission('order_payments_manage')
    || currentUserHasPermission('order_services_edit')
    || currentUserHasPermission('order_complete')
    || currentUserHasPermission('special_service_status');
  return hasOrderAccess && _isCurrentWorkerOrder(order);
}

function resolveSalaryEntryOrderId(rawOrderId) {
  const raw = String(rawOrderId || '').trim();
  if (!raw) return '';
  const direct = (orders || []).find(item => String(item?.id || '') === raw);
  if (direct) return direct.id;
  const prefixed = raw.split('·')[0].trim();
  const matched = (orders || []).find(item => String(item?.id || '') === prefixed);
  return matched ? matched.id : '';
}

function openSalaryEntryOrder(rawOrderId, event) {
  event?.stopPropagation?.();
  const orderId = resolveSalaryEntryOrderId(rawOrderId);
  if (!orderId) return;
  const order = (orders || []).find(item => String(item?.id || '') === orderId);
  if (!order) return;
  if (canCurrentUserOpenOrderModal(order)) {
    openOrderModal(orderId);
    return;
  }
  openOrderDetail(orderId);
}

function canCurrentUserManageOrderPayments(order) {
  if (!order && editingOrderId !== null) {
    order = getOrderDraftFromForm(editingOrderId ? orders.find(item => item.id === editingOrderId) : null);
  }
  if (!order) return currentRole === 'owner' || currentRole === 'manager' || currentUserHasPermission('order_payments_manage', currentUserCanActAsSenior());
  if (currentRole === 'owner' || currentRole === 'manager') return true;
  return currentUserHasPermission('order_payments_manage', currentUserCanActAsSenior())
    && order.responsible === currentWorkerName;
}

function canCurrentUserRemoveOrderPayments() {
  return currentRole === 'owner' || currentRole === 'manager';
}

function canCurrentUserEditOrderServices(order) {
  if (currentRole === 'owner' || currentRole === 'manager') return true;
  if (!order && canCreateOrder()) return true;
  if (!order || !currentUserCanActAsSenior()) return false;
  if (order.responsible !== currentWorkerName) return false;
  if (!currentUserHasPermission('order_services_edit', currentUserCanActAsSenior())) return false;
  return !String(order.serviceType || '').trim();
}

function canCurrentUserToggleSpecialServiceStatus(order, type) {
  if (currentRole === 'owner' || currentRole === 'manager') return true;
  if (!order) return false;
  const currentWorker = typeof getCurrentWorkerRecord === 'function' ? getCurrentWorkerRecord() : null;
  const currentName = currentWorker?.name || currentWorkerName;
  const canHandle = workerCanHandleSpecialService(currentWorker || currentName, type);
  if (!canHandle) return false;
  const formAssignedName = String(document.getElementById(type === 'tatu' ? 'f-tatu-responsible' : 'f-toning-responsible')?.value || '').trim();
  const normalizedCurrentName = String(currentName || '').trim().toLowerCase();
  const normalizedCurrentAlias = String(currentWorker?.alias || '').trim().toLowerCase();
  const normalizedFormAssignedName = String(formAssignedName || '').trim().toLowerCase();
  const explicitlyAssignedInForm = !!normalizedFormAssignedName && (
    normalizedFormAssignedName === normalizedCurrentName
    || (!!normalizedCurrentAlias && normalizedFormAssignedName === normalizedCurrentAlias)
  );
  const effectiveOrder = formAssignedName
    ? {
        ...order,
        ...(type === 'tatu'
          ? { tatuResponsible: formAssignedName }
          : { toningResponsible: formAssignedName }),
      }
    : order;
  if (!explicitlyAssignedInForm && !isCurrentWorkerAssignedSpecialService(effectiveOrder, type, currentWorker || currentName)) return false;
  if (type === 'tatu') {
    return orderHasSpecialService(effectiveOrder, 'tatu');
  }
  if (type === 'toning') {
    return orderHasSpecialService(effectiveOrder, 'toning') && !effectiveOrder.toningExternal;
  }
  return false;
}

function canCurrentUserCompleteOrder(order) {
  return currentUserHasPermission('order_complete', currentUserCanActAsSenior())
    && currentUserCanActAsSenior()
    && order?.responsible === currentWorkerName
    && isOrderFinanciallyActive(order)
    && !order?.workerDone;
}

function hasSeniorServiceChanges(order) {
  if (!currentUserCanActAsSenior()) return false;
  const originalOrder = order || (editingOrderId ? orders.find(item => item.id === editingOrderId) : null);
  const currentServiceType = String(document.getElementById('f-service-type')?.value || '').trim();
  const originalServiceType = String(originalOrder?.serviceType || '').trim();
  return currentServiceType !== originalServiceType;
}

function _dailyBaseOrderId() {
  return 'Ставка за день';
}

function _moneyInputValue(value) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, '')
    .replace(',', '.')
    .trim();
  return Number(normalized) || 0;
}

function getOrderFormSpecialServiceNeeds() {
  const tatuAmount = _moneyInputValue(document.getElementById('f-tatu')?.value);
  const toningAmount = _moneyInputValue(document.getElementById('f-toning')?.value);
  const toningExternal = !!document.getElementById('f-toning-external')?.checked;
  return {
    needsTatu: tatuAmount > 0,
    needsToning: toningAmount > 0 && !toningExternal,
  };
}

function getResponsibleWorkerOptionRows() {
  const { needsTatu, needsToning } = getOrderFormSpecialServiceNeeds();
  const baseWorkers = workers.filter(w => ['senior', 'extra'].includes(w.systemRole));
  return baseWorkers.map(worker => {
    const canTatu = workerCanHandleSpecialService(worker, 'tatu');
    const canToning = workerCanHandleSpecialService(worker, 'toning');
    const priorityScore =
      (needsTatu && canTatu ? 2 : 0)
      + (needsToning && canToning ? 2 : 0)
      + (canTatu || canToning ? 1 : 0);
    const tags = [];
    if (canTatu) tags.push('тату');
    if (canToning) tags.push('тонировка');
    return {
      worker,
      priorityScore,
      tags,
    };
  }).sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    return String(getWorkerDisplayName(a.worker.name) || a.worker.name).localeCompare(String(getWorkerDisplayName(b.worker.name) || b.worker.name), 'ru');
  });
}

function refreshResponsibleOptions() {
  const respSel = document.getElementById('f-responsible');
  if (!respSel) return;
  const cur = respSel.value;
  const rows = getResponsibleWorkerOptionRows();
  respSel.innerHTML = '<option value="">— выбрать —</option>' +
    rows.map(({ worker, tags }) => {
      const label = `${getWorkerDisplayName(worker.name)} (${worker.role})${tags.length ? ' · ' + tags.join(', ') : ''}`;
      return `<option value="${escapeAttr(worker.name)}">${escapeHtml(label)}</option>`;
    }).join('');
  if (cur && [...respSel.options].some(option => option.value === cur)) {
    respSel.value = cur;
  }
}

function populateSpecialServiceResponsibleSelects() {
  const tatuSel = document.getElementById('f-tatu-responsible');
  const toningSel = document.getElementById('f-toning-responsible');
  if (tatuSel) {
    const cur = tatuSel.value;
    const options = getSpecialServiceWorkers('tatu').slice();
    if (cur && !options.some(worker => worker.name === cur)) {
      const currentWorker = getWorkerRecordByName(cur);
      if (currentWorker) options.push(currentWorker);
    }
    tatuSel.innerHTML = '<option value="">— выбрать —</option>' +
      options.map(worker => `<option value="${escapeAttr(worker.name)}">${escapeHtml(getWorkerDisplayName(worker.name))}</option>`).join('');
    if (cur && [...tatuSel.options].some(option => option.value === cur)) tatuSel.value = cur;
  }
  if (toningSel) {
    const cur = toningSel.value;
    const options = getSpecialServiceWorkers('toning').slice();
    if (cur && !options.some(worker => worker.name === cur)) {
      const currentWorker = getWorkerRecordByName(cur);
      if (currentWorker) options.push(currentWorker);
    }
    toningSel.innerHTML = '<option value="">— выбрать —</option>' +
      options.map(worker => `<option value="${escapeAttr(worker.name)}">${escapeHtml(getWorkerDisplayName(worker.name))}</option>`).join('');
    if (cur && [...toningSel.options].some(option => option.value === cur)) toningSel.value = cur;
  }
}

function _escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getGlassManufacturerCopyText(name) {
  const manufacturer = getGlassManufacturerByName(name);
  if (!name) return '';
  return manufacturer?.description
    ? `Производитель стекла: ${name}\n${manufacturer.description}`
    : `Производитель стекла: ${name}`;
}

function getOrderServiceSelections(value) {
  if (typeof parseOrderServiceSelections === 'function') {
    return parseOrderServiceSelections(value);
  }
  const raw = String(value || '').trim();
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(name => ({ name, qty: 1 }));
}

function getOrderServiceSelectionMap(value) {
  const map = new Map();
  getOrderServiceSelections(value).forEach(item => {
    map.set(item.name, Math.max(1, Number(item.qty) || 1));
  });
  return map;
}

function serializeOrderServiceSelections(items) {
  if (typeof stringifyOrderServiceSelections === 'function') {
    return stringifyOrderServiceSelections(items);
  }
  return (items || []).map(item => item.name).join(', ');
}

function formatOrderServiceLabel(name, qty = 1) {
  const safeQty = Math.max(1, Number(qty) || 1);
  return safeQty > 1 ? `${name} ×${safeQty}` : name;
}

function serviceOptionUsesQty(item) {
  return item?.salaryCategory !== 'special';
}

function formatOrderServiceTypeText(value) {
  return getOrderServiceSelections(value)
    .map(item => formatOrderServiceLabel(item.name, item.qty))
    .join(', ');
}

function getOrderServicesModalQtyInput(name) {
  return [...document.querySelectorAll('#order-services-modal-list [data-service-qty]')]
    .find(el => el.getAttribute('data-service-qty') === name) || null;
}

function getOrderServicesModalCheckbox(name) {
  return [...document.querySelectorAll('#order-services-modal-list input[type="checkbox"]')]
    .find(el => el.value === name) || null;
}

function getOrderFormServiceQtyInput(name) {
  return [...document.querySelectorAll('#service-type-checkboxes [data-form-service-qty]')]
    .find(el => el.getAttribute('data-form-service-qty') === name) || null;
}

function sanitizeServiceQtyValue(rawValue) {
  const digits = String(rawValue ?? '').replace(/\D+/g, '');
  if (!digits) return '';
  return String(Math.max(0, Number(digits) || 0));
}

function calcClientPaymentStatus(totalPaid, totalAmount) {
  const paid = Number(totalPaid) || 0;
  const total = Number(totalAmount) || 0;
  if (paid <= 0) return 'Не оплачено';
  if (total > 0 && paid >= total) return 'Оплачено';
  return 'Частично';
}

function calcSupplierPaymentStatus(totalPaid, glassPurchase) {
  const paid = Number(totalPaid) || 0;
  const purchase = Number(glassPurchase) || 0;
  if (paid <= 0) return 'Не оплачено';
  if (purchase > 0 && paid >= purchase) return 'Оплачено';
  return 'Частично';
}

function getOrderClientTotal(order) {
  return (Number(order?.total) || 0) + (Number(order?.income) || 0) + (Number(order?.delivery) || 0);
}

function getEffectivePaymentStatus(order) {
  return calcClientPaymentStatus(getOrderClientPaidAmount(order), getOrderClientTotal(order));
}

function getEffectiveSupplierStatus(order) {
  return calcSupplierPaymentStatus(getOrderSupplierPaidAmount(order), Number(order?.purchase) || 0);
}

async function confirmSeniorOrderAmounts(orderId) {
  const order = orders.find(x => x.id === orderId);
  if (!order || !canQuickConfirmOrderAmounts(order)) return;

  const checkEl = document.getElementById(`quick-supplier-${orderId}`);
  const debtEl = document.getElementById(`quick-client-${orderId}`);
  const btnEl = document.getElementById(`quick-confirm-${orderId}`);

  const newSupplierPaymentAmount = _moneyInputValue(checkEl?.value);
  const newClientPaymentAmount = _moneyInputValue(debtEl?.value);
  const quickPaymentMethod = normalizePaymentMethod('🪙 Наличка');

  const oldCheck = Number(order.check) || 0;
  const nextSupplierPayments = Array.isArray(order.supplierPayments)
    ? JSON.parse(JSON.stringify(order.supplierPayments))
    : [];
  const nextClientPayments = Array.isArray(order.clientPayments)
    ? JSON.parse(JSON.stringify(order.clientPayments))
    : [];
  const quickCashWorker = String(order.responsible || currentWorkerName || '').trim();

  if (newSupplierPaymentAmount > 0) {
    nextSupplierPayments.push({
      amount: newSupplierPaymentAmount,
      date: todayStr(),
      method: quickPaymentMethod,
      cashWorker: quickCashWorker || undefined,
      timestamp: new Date().toISOString(),
    });
  }

  if (newClientPaymentAmount > 0) {
    nextClientPayments.push({
      amount: newClientPaymentAmount,
      date: todayStr(),
      method: quickPaymentMethod,
      cashWorker: quickCashWorker || undefined,
      timestamp: new Date().toISOString(),
    });
  }

  const totalSupplierPaid = sumConfirmedOrderPayments(order, nextSupplierPayments, 'supplier');
  const totalClientPaid = sumConfirmedOrderPayments(order, nextClientPayments, 'client');
  const totalClientAmount = getOrderClientTotalAmount(order);
  const updatedOrder = {
    ...order,
    check: totalSupplierPaid,
    debt: totalClientPaid,
    paymentStatus: calcClientPaymentStatus(totalClientPaid, totalClientAmount),
    supplierStatus: calcSupplierPaymentStatus(totalSupplierPaid, order.purchase),
    clientPayments: nextClientPayments,
    supplierPayments: nextSupplierPayments,
  };

  if (btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = 'Сохранение...';
  }

  try {
    const saveResult = await sbSaveOrderWithCash({
          ...updatedOrder,
          clientPayments: nextClientPayments,
          supplierPayments: nextSupplierPayments,
          debt: totalClientPaid,
          check: totalSupplierPaid,
        }, {
          isNew: false,
          cashEntries: [],
          rollbackOrder: order,
        });
    logFinanceDebug('quick amounts save', saveResult);
    const saved = saveResult.order;
    if (checkEl) checkEl.value = '';
    if (debtEl) debtEl.value = '';
    await refreshCashStateAfterServerSave();
    try {
      orders = await sbFetchOrders();
    } catch (refreshError) {
      console.warn('Failed to refresh orders after quick amount save:', refreshError);
    }

    currentMonthFilter ? renderOrdersForMonth(currentMonthFilter) : renderOrders();
    if (document.getElementById('screen-order-detail')?.classList.contains('active')) {
      openOrderDetail(orderId);
    }
    if (document.getElementById('screen-profile')?.classList.contains('active')) {
      renderProfile();
    }
    showToast('Суммы обновлены ✓');
  } catch (e) {
    showToast('Ошибка сохранения: ' + e.message, 'error');
  } finally {
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.textContent = 'Подтвердить';
    }
  }
}



// ---------- КНОПКА ДОБАВИТЬ ----------
function setupOrderActions() {
  updateOrdersBackTopbar();
  updateOrdersFiltersDropdown();
  const el = document.getElementById('orders-actions');
  if (!el) return;
  const filterButton = `
    <button class="btn-secondary orders-filter-toggle" id="orders-filter-toggle"
      onclick="toggleOrdersFilters()" title="Фильтры" aria-label="Фильтры">
      <i data-lucide="list-filter" style="width:16px;height:16px;"></i>
    </button>
  `;
  if (canCreateOrder()) {
    el.innerHTML = `${filterButton}<button class="btn-primary orders-add-btn" onclick="openOrderModal(null)">+ Добавить</button>`;
  } else {
    el.innerHTML = filterButton;
  }
  initIcons();
  updateOrdersFiltersDropdown();
}

function updateOrdersBackTopbar() {
  const topbar = document.getElementById('orders-back-topbar');
  const label = document.getElementById('orders-back-label');
  if (!topbar || !label) return;

  const isSpecialist = currentRole !== 'owner' && currentRole !== 'manager';
  const shouldShow = Boolean(currentMonthFilter) || isSpecialist;
  topbar.style.display = shouldShow ? 'flex' : 'none';
  topbar.classList.toggle('orders-topbar-without-back', !shouldShow);
  label.textContent = 'Назад';
  const backBtn = topbar.querySelector('.back-btn');
  if (backBtn) backBtn.style.display = shouldShow ? 'flex' : 'none';
}

function toggleOrdersFilters() {
  ordersFiltersOpen = !ordersFiltersOpen;
  updateOrdersFiltersDropdown();
}

function updateOrdersFiltersDropdown() {
  const dropdown = document.getElementById('orders-filters-dropdown');
  const btn = document.getElementById('orders-filter-toggle');
  if (dropdown) dropdown.classList.toggle('open', ordersFiltersOpen);
  if (btn) btn.classList.toggle('active', ordersFiltersOpen);
}

function goBackFromOrdersList() {
  if (currentMonthFilter) {
    renderMonths();
    showScreen('months');
    return;
  }

  goBackOrHome('home');
}

// ---------- РЕНДЕР КАРТОЧКИ ЗАКАЗА ----------
function renderOrderCard(o) {
  const canOpenModal = canCurrentUserOpenOrderModal(o);
  const cardClickAction = canOpenModal ? `openOrderModal('${escapeAttr(o.id)}')` : '';
  const primaryTitle = o.client || '—';
  const clientTotal = getOrderClientTotal(o);
  const clientPaidAmount = getOrderClientPaidAmount(o);
  const supplierPaidAmount = getOrderSupplierPaidAmount(o);
  const clientPaidInlineHtml = `<span class="order-meta-inline-money" title="Клиент оплатил / общая сумма заказа"><span>${clientPaidAmount.toLocaleString('ru')}</span><span class="order-meta-money-separator">/</span><span>${clientTotal.toLocaleString('ru')} ₴</span></span>`;
  const supplierPaidInlineHtml = (supplierPaidAmount > 0 || Number(o.purchase) > 0)
    ? `<span class="order-meta-inline-money"><span>${supplierPaidAmount.toLocaleString('ru')}</span><span class="order-meta-money-separator">/</span><span>${(Number(o.purchase) || 0).toLocaleString('ru')} ₴</span></span>`
    : '';
  const warehouseCodeInlineHtml = o.warehouseCode
    ? `<span style="margin-left:6px;color:var(--accent);font-weight:900;">${escapeHtml(o.warehouseCode)}</span>`
    : '';
  const warehousePillHtml = (o.warehouse || warehouseCodeInlineHtml || supplierPaidInlineHtml)
    ? `<span class="order-meta-item order-meta-pill">${escapeHtml(o.warehouse || 'Склад —')}${warehouseCodeInlineHtml}${supplierPaidInlineHtml}</span>`
    : '';
  const phoneHtml = (currentRole === 'senior' || currentRole === 'junior' || currentRole === 'extra')
    ? orderCardPhoneCallLink(o.phone)
    : `${icon('phone')} ${escapeHtml(o.phone || '—')}`;
  const layoutHtml = renderOrderCardLayout(o, {
    phoneHtml,
    warehousePillHtml,
    clientPaidInlineHtml,
  });
  const specialistBonusFlags = [
    (o.priorityTask && !o.workerDone)
      ? `<span class="status-badge status-priority" title="Приоритетная задача">Приоритет</span>`
      : '',
    workerCanHandleSpecialService(typeof getCurrentWorkerRecord === 'function' ? getCurrentWorkerRecord() : currentWorkerName, 'tatu') && Number(o.tatu) > 0
      ? `<span class="status-badge status-call" title="В заказе есть тату">Тату ${(Number(o.tatu) || 0).toLocaleString('ru')} ₴</span>`
      : '',
    workerCanHandleSpecialService(typeof getCurrentWorkerRecord === 'function' ? getCurrentWorkerRecord() : currentWorkerName, 'toning') && Number(o.toning) > 0
      ? `<span class="status-badge status-own-warehouse" title="В заказе есть тонировка">Тонировка ${(Number(o.toning) || 0).toLocaleString('ru')} ₴</span>`
      : '',
  ].filter(Boolean).join('');
  const specialistPriorityClass = (currentRole !== 'owner' && currentRole !== 'manager' && o.priorityTask && !o.workerDone)
    ? ' order-card-priority-highlight'
    : '';
  return `
    <div class="order-card ${getOrderCardStateClass(o)}${specialistPriorityClass}" ${canOpenModal ? `onclick="${cardClickAction}" style="cursor:pointer;"` : 'style="cursor:default;"'}>
      <div class="order-card-top">
        <div class="order-card-left">
          <div class="order-card-status-row">
            <span class="order-id">${o.id}</span>
            ${renderOrderStatusBadges(o)}
            ${specialistBonusFlags}
          </div>
        </div>
      </div>
      <div class="order-card-primary-group">
        ${layoutHtml}
      </div>
    </div>
  `;
}

function getOrderCardFieldValue(order, fieldKey, context = {}) {
  const supplierPaidAmount = getOrderSupplierPaidAmount(order);
  const supplierPaidInlineHtml = (supplierPaidAmount > 0 || Number(order.purchase) > 0)
    ? `<span class="order-meta-inline-money"><span>${supplierPaidAmount.toLocaleString('ru')}</span><span class="order-meta-money-separator">/</span><span>${(Number(order.purchase) || 0).toLocaleString('ru')} ₴</span></span>`
    : '';
  const warehouseCodeInlineHtml = order.warehouseCode
    ? `<span style="margin-left:6px;color:var(--accent);font-weight:900;">${escapeHtml(order.warehouseCode)}</span>`
    : '';
  const warehousePillHtml = context.warehousePillHtml || ((order.warehouse || warehouseCodeInlineHtml || supplierPaidInlineHtml)
    ? `<span class="order-meta-item order-meta-pill">${escapeHtml(order.warehouse || 'Склад —')}${warehouseCodeInlineHtml}${supplierPaidInlineHtml}</span>`
    : '');
  const values = {
    client_total: {
      html: `<span class="order-meta-item order-meta-pill order-meta-primary-title"><span class="order-name order-meta-primary-name">${escapeHtml(order.client || '—')}</span>${context.clientPaidInlineHtml || ''}</span>`,
    },
    car: { html: `<span class="order-meta-item order-meta-pill order-meta-client-pill">${icon('car')} <span class="order-meta-client-name">${escapeHtml(order.car || '—')}</span></span>` },
    phone: { html: `<span class="order-meta-item order-meta-pill">${context.phoneHtml || `${icon('phone')} ${escapeHtml(order.phone || '—')}`}</span>` },
    date: { html: `<span class="order-meta-item order-meta-pill">${icon('calendar')} ${formatDate(order.date)}</span>` },
    time: order.time ? { html: `<span class="order-meta-item order-meta-pill">${icon('clock')} ${escapeHtml(order.time)}</span>` } : null,
    workers: { html: `<span class="order-meta-item order-meta-pill">${escapeHtml(getWorkerDisplayPair(order.responsible, order.assistant))}</span>` },
    manager: order.manager ? { html: `<span class="order-meta-item order-meta-pill">${escapeHtml(getWorkerDisplayName(order.manager))}</span>` } : null,
    warehouse: warehousePillHtml ? { html: warehousePillHtml } : null,
    warehouse_code: order.warehouseCode ? { html: `<span class="order-meta-item order-meta-pill">${icon('hash')} ${escapeHtml(order.warehouseCode)}</span>` } : null,
    supplier_paid_total: supplierPaidInlineHtml ? { html: `<span class="order-meta-item order-meta-pill">${icon('wallet')} ${supplierPaidInlineHtml}</span>` } : null,
    services: renderOrderCardServices(order) ? { blockHtml: renderOrderCardServices(order) } : null,
    notes: order.notes ? { blockHtml: `<div class="order-card-note">${escapeHtml(order.notes)}</div>` } : null,
    code: order.code ? { html: `<span class="order-meta-item order-meta-pill">${icon('hash')} ${escapeHtml(order.code)}</span>` } : null,
    extra_note: order.extraNote ? { html: `<span class="order-meta-item order-meta-pill">${icon('file-text')} ${escapeHtml(order.extraNote)}</span>` } : null,
    vin: order.vin ? { html: `<span class="order-meta-item order-meta-pill">VIN ${escapeHtml(order.vin)}</span>` } : null,
  };
  return values[fieldKey] || null;
}

function renderOrderCardLayout(order, context = {}) {
  const viewer = typeof getCurrentWorkerRecord === 'function' ? getCurrentWorkerRecord() : { systemRole: currentRole, orderCardLayout: null };
  const layout = typeof getResolvedOrderCardLayout === 'function'
    ? getResolvedOrderCardLayout(viewer)
    : { groups: [] };
  const groups = Array.isArray(layout?.groups) ? layout.groups : [];
  const groupsHtml = groups.map((group, groupIndex) => {
    const fieldBlocks = (Array.isArray(group.fields) ? group.fields : [])
      .map(fieldKey => getOrderCardFieldValue(order, fieldKey, context))
      .filter(Boolean);
    if (!fieldBlocks.length) return '';
    const inlineHtml = fieldBlocks.filter(item => item.html).map(item => item.html).join('');
    const blockHtml = fieldBlocks.filter(item => item.blockHtml).map(item => item.blockHtml).join('');
    const isPrimaryGroup = groupIndex === 0;
    return `
      <div class="order-card-layout-group${isPrimaryGroup ? ' order-card-layout-group-primary' : ''}">
        ${inlineHtml ? `<div class="order-card-meta${blockHtml ? ' order-card-primary-meta' : ''}${isPrimaryGroup ? ' order-card-meta-primary' : ''}">${inlineHtml}</div>` : ''}
        ${blockHtml}
      </div>
    `;
  }).filter(Boolean).join('');
  return groupsHtml ? `<div class="order-card-layout">${groupsHtml}</div>` : '';
}

function orderHasDebtTabFinancialMeaning(order) {
  if (!order || order.isCancelled || isOrderDeleted(order)) return false;
  const total = typeof getOrderClientTotalAmount === 'function'
    ? getOrderClientTotalAmount(order)
    : getOrderClientTotal(order);
  const paid = getOrderClientPaidAmount(order);
  const left = Math.max(0, total - paid);
  if (total <= 0 || left <= 0) return false;
  return !!order.workerDone || paid > 0;
}

function renderManagerOrderCardMeta(order) {
  if (currentRole !== 'manager' || !order) return '';
  const clientTotal = getOrderClientTotal(order);
  const clientPaidAmount = getOrderClientPaidAmount(order);
  const supplierPaidAmount = getOrderSupplierPaidAmount(order);
  const clientPaidInlineHtml = clientTotal > 0
    ? `<span class="order-meta-inline-money" title="Клиент оплатил / общая сумма заказа"><span>${clientPaidAmount.toLocaleString('ru')}</span><span class="order-meta-money-separator">/</span><span>${clientTotal.toLocaleString('ru')} ₴</span></span>`
    : '';
  const supplierPaidInlineHtml = (supplierPaidAmount > 0 || Number(order.purchase) > 0)
    ? `<span class="order-meta-inline-money"><span>${supplierPaidAmount.toLocaleString('ru')}</span><span class="order-meta-money-separator">/</span><span>${(Number(order.purchase) || 0).toLocaleString('ru')} ₴</span></span>`
    : '';
  const warehouseCodeInlineHtml = order.warehouseCode
    ? `<span style="margin-left:6px;color:var(--accent);font-weight:900;">${escapeHtml(order.warehouseCode)}</span>`
    : '';
  const groups = [
    [
      { iconLabel: icon('car'), value: order.car || '—' },
      { iconLabel: icon('phone'), value: order.phone || '—' },
      { iconLabel: icon('calendar'), value: order.time ? `${formatDate(order.date)} / ${order.time}` : formatDate(order.date) },
      { iconLabel: icon('users'), value: [getWorkerDisplayName(order.responsible), getWorkerDisplayName(order.assistant), getWorkerDisplayName(order.extraAssistant)].filter(Boolean).join(' + ') || '—' },
    ],
    [
      { value: order.code || '—' },
      { value: order.extraNote || '—' },
      { value: order.vin || '—' },
    ],
    [
      { html: `${escapeHtml(order.warehouse || '—')}${warehouseCodeInlineHtml}${supplierPaidInlineHtml}` },
      { value: order.warehouseCode || '—' },
    ],
    [
      { label: '', value: String(order.notes || '—').trim() || '—', strong: true },
    ],
    [
      { value: getWorkerDisplayName(order.manager) || '—' },
    ],
  ];

  return `
    <div class="order-card-manager-meta">
      ${groups.map(group => `
        <div class="order-card-manager-group">
          ${group.map(row => `
            <div class="order-card-manager-row ${row.strong ? 'order-card-manager-row-strong' : ''}">
              ${row.iconLabel
                ? `<span class="order-card-manager-row-label">${row.iconLabel}</span>`
                : (row.label
                  ? `<span class="order-card-manager-row-label">${escapeHtml(row.label)}:</span>`
                  : '')}
              <span class="order-card-manager-row-value">${row.html || escapeHtml(row.value)}</span>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  `;
}

function compareOrdersForList(a, b, sort = 'desc', prioritize = false) {
  if (prioritize) {
    const priorityDelta = Number(!!b?.priorityTask) - Number(!!a?.priorityTask);
    if (priorityDelta) return priorityDelta;
  }
  const ad = String(a?.date || '');
  const bd = String(b?.date || '');
  if (ad === bd) {
    const aDaySort = getOrderDaySortValue(a);
    const bDaySort = getOrderDaySortValue(b);
    if (aDaySort !== bDaySort) return aDaySort - bDaySort;
  }
  const av = getOrderIdSortValue(a);
  const bv = getOrderIdSortValue(b);
  if (av !== bv) return sort === 'asc' ? av - bv : bv - av;
  const dateCompare = sort === 'asc' ? ad.localeCompare(bd) : bd.localeCompare(ad);
  if (dateCompare) return dateCompare;
  return String(a?.time || '').localeCompare(String(b?.time || ''));
}

function getOrderDaySortValue(order) {
  const raw = Number(order?.daySort);
  return Number.isFinite(raw) ? raw : Number.MAX_SAFE_INTEGER;
}

function getOrderIdSortValue(order) {
  const raw = String(order?.id || '').trim().toUpperCase();
  const match = raw.match(/SG-(\d+)/);
  return match ? Number(match[1]) || 0 : 0;
}

function renderOrderCardServices(order) {
  const services = getOrderServiceSelections(order?.serviceType);
  const extraPills = [];
  if (order?.tatuResponsible && orderHasSpecialService(order, 'tatu')) {
    extraPills.push(`<span class="order-service-pill">Тату: ${escapeHtml(getWorkerDisplayName(order.tatuResponsible) || order.tatuResponsible)}</span>`);
  }
  if (order?.toningResponsible && orderHasSpecialService(order, 'toning') && !order?.toningExternal) {
    extraPills.push(`<span class="order-service-pill">Тонировка: ${escapeHtml(getWorkerDisplayName(order.toningResponsible) || order.toningResponsible)}</span>`);
  }
  if (!services.length && !extraPills.length) return '';
  return '<div class="order-card-services" style="margin-top:0;">'
    + services.map(item => `<span class="order-service-pill">${escapeHtml(formatOrderServiceLabel(item.name, item.qty))}</span>`).join('')
    + extraPills.join('')
    + '</div>';
}

function orderHasSpecialService(order, type) {
  if (!order) return false;
  if (type === 'tatu' && Number(order.tatu) > 0) return true;
  if (type === 'toning' && Number(order.toning) > 0 && !order.toningExternal) return true;
  const selectedServices = getOrderServiceSelections(order?.serviceType).map(item => String(item?.name || '').trim().toLowerCase());
  if (type === 'tatu') return selectedServices.includes('тату');
  if (type === 'toning') return selectedServices.includes('тонировка');
  return false;
}

function isCurrentWorkerAssignedSpecialService(order, type, workerLike = null) {
  if (!order) return false;
  const worker = typeof workerLike === 'string' ? getWorkerRecordByName(workerLike) : workerLike;
  const currentName = String(worker?.name || currentWorkerName || '').trim().toLowerCase();
  const currentAlias = String(worker?.alias || '').trim().toLowerCase();
  const currentId = String(worker?.id || '').trim();
  const assignedName = String(getOrderSpecialServiceAssignedWorker(order, type) || '').trim().toLowerCase();
  const rawAssignedName = String(type === 'tatu' ? (order.tatuResponsible || '') : (order.toningResponsible || '')).trim().toLowerCase();
  const assignedId = String(type === 'tatu' ? (order.tatuResponsibleWorkerId || '') : (order.toningResponsibleWorkerId || '')).trim();
  if (currentId && assignedId && currentId === assignedId) return true;
  if (currentName && assignedName && currentName === assignedName) return true;
  if (currentName && rawAssignedName && currentName === rawAssignedName) return true;
  if (currentAlias && rawAssignedName && currentAlias === rawAssignedName) return true;
  return false;
}

function renderOrderCardCallNotes(order) {
  if (currentRole === 'manager') return '';
  if (!order?.notes) return '';
  return `<div class="order-card-note">${escapeHtml(order.notes)}</div>`;
}

function getSpecialServiceAction(order) {
  if (!order || !isOrderFinanciallyActive(order)) return null;
  const currentWorker = typeof getCurrentWorkerRecord === 'function' ? getCurrentWorkerRecord() : null;
  const currentName = currentWorker?.name || currentWorkerName;
  if (
    workerCanHandleSpecialService(currentWorker || currentName, 'tatu')
    && isCurrentWorkerAssignedSpecialService(order, 'tatu', currentWorker || currentName)
    && orderHasSpecialService(order, 'tatu')
    && !order.tatuStatus
  ) {
    return { type: 'tatu', label: 'Выполнить тату', title: 'Подтвердить выполнение тату' };
  }
  if (
    workerCanHandleSpecialService(currentWorker || currentName, 'toning')
    && isCurrentWorkerAssignedSpecialService(order, 'toning', currentWorker || currentName)
    && orderHasSpecialService(order, 'toning')
    && !order.toningStatus
    && !order.toningExternal
  ) {
    return { type: 'toning', label: 'Выполнить тонировку', title: 'Подтвердить выполнение тонировки' };
  }
  return null;
}

async function confirmSpecialServiceDone(orderId, type) {
  const order = orders.find(item => item.id === orderId);
  if (!order) return;
  const isTatu = type === 'tatu';
  const label = isTatu ? 'тату' : 'тонировку';
  if (!confirm(`Отметить ${label} выполненной по заказу ${order.id}?`)) return;

  try {
    const patch = isTatu
      ? { tatu_status: true, tatu_done: true, tatu_done_by: currentWorkerName }
      : { toning_status: true, toning_done: true, toning_done_by: currentWorkerName };
    const saved = await sbPatchOrderFields(order.id, patch);
    try {
      orders = await sbFetchOrders();
    } catch (refreshError) {
      console.warn('Failed to refresh orders after special service status update:', refreshError);
      const idx = orders.findIndex(item => item.id === order.id);
      const updated = {
        ...order,
        ...saved,
        tatuStatus: isTatu ? true : (saved?.tatuStatus ?? order.tatuStatus),
        tatuDone: isTatu ? true : (saved?.tatuDone ?? order.tatuDone),
        tatuDoneBy: isTatu ? currentWorkerName : (saved?.tatuDoneBy ?? order.tatuDoneBy),
        toningStatus: !isTatu ? true : (saved?.toningStatus ?? order.toningStatus),
        toningDone: !isTatu ? true : (saved?.toningDone ?? order.toningDone),
        toningDoneBy: !isTatu ? currentWorkerName : (saved?.toningDoneBy ?? order.toningDoneBy),
      };
      if (idx !== -1) orders[idx] = updated;
    }
    currentMonthFilter ? renderOrdersForMonth(currentMonthFilter) : renderOrders();
    showToast('Услуга выполнена ✓');
    if (document.getElementById('screen-profile')?.classList.contains('active')) {
      renderProfile();
    }
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}

function openOrderServicesModal(orderId) {
  const order = orders.find(item => item.id === orderId);
  if (!order || currentRole !== 'senior' || order.responsible !== currentWorkerName || order.workerDone) return;

  let modal = document.getElementById('order-services-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'order-services-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  const selectedMap = getOrderServiceSelectionMap(order.serviceType);
  const groups = [...new Set(SERVICE_TYPE_OPTIONS.map(item => item.group))];
  const servicesHtml = groups.map(group => `
    <div class="service-group">
      <div class="service-group-title">${escapeHtml(group)}</div>
        <div class="service-group-options">
          ${SERVICE_TYPE_OPTIONS.filter(item => item.group === group).map(item => `
            <label class="checkbox">
              <span class="service-option-main">
                <input type="checkbox" value="${escapeAttr(item.name)}" ${selectedMap.has(item.name) ? 'checked' : ''} onchange="syncOrderServicesModalSelection(this)">
                <span class="service-option-label">${escapeHtml(item.name)}</span>
              </span>
              <span class="service-option-qty" ${serviceOptionUsesQty(item) ? '' : 'style="display:none;"'}>
                <input
                  type="text"
                  inputmode="numeric"
                  autocomplete="off"
                  class="form-input service-qty-input"
                  data-service-qty="${escapeAttr(item.name)}"
                  value="${selectedMap.get(item.name) || 0}"
                  onclick="event.stopPropagation()"
                  oninput="syncOrderServiceQtyInput('${escapeAttr(item.name)}', this.value)"
                  onblur="normalizeOrderServiceQtyInput('${escapeAttr(item.name)}')"
                >
              </span>
            </label>
          `).join('')}
        </div>
      </div>
  `).join('');

  modal.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-header">
        <div>
          <div class="modal-title">Услуги по заказу ${escapeHtml(order.id)}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:3px;">${escapeHtml(order.car || order.client || '')}</div>
        </div>
        <button class="modal-close" onclick="closeOrderServicesModal()"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
      </div>
      <div class="modal-body">
        <div id="order-services-modal-list" class="service-checkboxes">${servicesHtml}</div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeOrderServicesModal()">Закрыть</button>
        <button class="btn-primary" id="order-services-save-btn" onclick="saveOrderServices('${escapeAttr(order.id)}')">Сохранить услуги</button>
      </div>
    </div>
  `;
  modal.classList.add('active');
  initIcons();
}

function closeOrderServicesModal() {
  document.getElementById('order-services-modal')?.classList.remove('active');
}

function syncOrderServicesModalSelection(changedEl) {
  const box = document.querySelectorAll('#order-services-modal-list input[type="checkbox"]');
  if (changedEl?.value === CUSTOM_SERVICE_TYPE_NAME && changedEl.checked) {
    box.forEach(el => {
      if (el !== changedEl) el.checked = false;
    });
  } else if (changedEl?.checked) {
    box.forEach(el => {
      if (el.value === CUSTOM_SERVICE_TYPE_NAME) el.checked = false;
    });
  }
  const qtyInput = getOrderServicesModalQtyInput(changedEl?.value || '');
  if (!qtyInput) return;
  if (changedEl?.checked && Number(qtyInput.value) < 1) {
    qtyInput.value = '1';
  }
  if (changedEl && !changedEl.checked) {
    qtyInput.value = '0';
  }
}

function syncOrderServiceQtyInput(name, rawValue) {
  const input = getOrderServicesModalQtyInput(name);
  const checkbox = getOrderServicesModalCheckbox(name);
  if (!input) return;
  const sanitized = sanitizeServiceQtyValue(rawValue);
  const nextValue = sanitized === '' ? 0 : Number(sanitized);
  input.value = sanitized;
  if (checkbox) checkbox.checked = nextValue > 0;
  syncOrderServicesModalSelection(checkbox);
}

function normalizeOrderServiceQtyInput(name) {
  const input = getOrderServicesModalQtyInput(name);
  if (!input) return;
  input.value = sanitizeServiceQtyValue(input.value) || '0';
  syncOrderServiceQtyInput(name, input.value);
}

async function saveOrderServices(orderId) {
  const order = orders.find(item => item.id === orderId);
  if (!order) return;
  const values = [...document.querySelectorAll('#order-services-modal-list input[type="checkbox"]')]
    .filter(el => el.checked)
    .map(el => {
      const qtyInput = getOrderServicesModalQtyInput(el.value);
      return { name: el.value, qty: Math.max(1, Number(qtyInput?.value) || 1) };
    });
  if (!order.onlySale && !values.length) {
    showToast('Выберите хотя бы одну услугу', 'error');
    return;
  }
  if (values.some(item => item.name === CUSTOM_SERVICE_TYPE_NAME) && (Number(order.mount) || 0) <= 0) {
    alert('Сумма монтажа не заполнена');
    return;
  }
  const btn = document.getElementById('order-services-save-btn');
  if (btn) btn.disabled = true;
  try {
    const serialized = serializeOrderServiceSelections(values);
    await sbPatchOrderFields(orderId, { service_type: serialized });
    try {
      orders = await sbFetchOrders();
    } catch (refreshError) {
      console.warn('Failed to refresh orders after saving services:', refreshError);
    }
    closeOrderServicesModal();
    currentMonthFilter ? renderOrdersForMonth(currentMonthFilter) : renderOrders();
    showToast('Услуги сохранены ✓');
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function closeOrderActionMenus() {
  document.querySelectorAll('.order-card-action-menu.active').forEach(menu => menu.classList.remove('active'));
  document.querySelectorAll('.order-card-action-dropdown.active').forEach(dropdown => dropdown.classList.remove('active'));
}

function toggleOrderActionMenu(orderId, event) {
  event?.stopPropagation();
  const menu = Array.from(document.querySelectorAll('.order-card-action-menu'))
    .find(item => item.dataset.orderActionMenu === String(orderId));
  if (!menu) return;
  const dropdown = menu.closest('.order-card-action-dropdown');
  const isOpen = menu.classList.contains('active');
  closeOrderActionMenus();
  if (!isOpen) {
    menu.classList.add('active');
    dropdown?.classList.add('active');
  }
}

document.addEventListener('click', closeOrderActionMenus);

function renderOrderStatusBadges(o) {
  const badges = [];
  if (isOrderDeleted(o)) {
    badges.push('<span class="status-badge" style="background:#6B7280;color:#fff;">Удален</span>');
  } else if (o.isCancelled) {
    badges.push('<span class="status-badge" style="background:var(--red,#DC2626);color:#fff;">Отменен</span>');
  } else {
    if (o.ownWarehouse && !o.workerDone) badges.push('<span class="status-badge status-own-warehouse">Наш склад</span>');
    if (o.callStatus && !o.workerDone) badges.push('<span class="status-badge status-call">Прозвон</span>');
    if (!o.callStatus && !o.inWork && !o.ownWarehouse && !o.workerDone) badges.push('<span class="status-badge status-selection">Подборка</span>');
    if (o.inWork && !o.workerDone) badges.push('<span class="status-badge" style="background:#F59E0B;color:#fff;">В работе</span>');
    if (o.workerDone) badges.push('<span class="status-badge status-done">✓ Выполнен</span>');
  }
  badges.push(statusBadge(getEffectivePaymentStatus(o)));
  return badges.join('');
}

function _isCurrentWorkerOrder(order) {
  if (!order) return false;
  if (currentUserCanViewAllOrders()) return true;
  return order.responsible === currentWorkerName || order.assistant === currentWorkerName || order.extraAssistant === currentWorkerName;
}

function _filterSpecialistOrdersByTab(list) {
  const today = todayStr();
  const currentWorker = typeof getCurrentWorkerRecord === 'function' ? getCurrentWorkerRecord() : null;
  const currentName = currentWorker?.name || currentWorkerName;
  list = list.filter(o => !isOrderDeleted(o));
  if (workerCanHandleSpecialService(currentWorker || currentName, 'tatu') && currentWorkerTab === 'tatuActual') {
    return list.filter(o => o.inWork && !o.isCancelled && orderHasSpecialService(o, 'tatu') && !o.tatuStatus && isCurrentWorkerAssignedSpecialService(o, 'tatu', currentWorker || currentName));
  }
  if (workerCanHandleSpecialService(currentWorker || currentName, 'tatu') && currentWorkerTab === 'tatuDone') {
    return list.filter(o => o.inWork && !o.isCancelled && orderHasSpecialService(o, 'tatu') && !!o.tatuStatus && isCurrentWorkerAssignedSpecialService(o, 'tatu', currentWorker || currentName));
  }
  if (workerCanHandleSpecialService(currentWorker || currentName, 'toning') && currentWorkerTab === 'toningActual') {
    return list.filter(o => o.inWork && !o.isCancelled && orderHasSpecialService(o, 'toning') && !o.toningStatus && !o.toningExternal && isCurrentWorkerAssignedSpecialService(o, 'toning', currentWorker || currentName));
  }
  if (workerCanHandleSpecialService(currentWorker || currentName, 'toning') && currentWorkerTab === 'toningDone') {
    return list.filter(o => o.inWork && !o.isCancelled && orderHasSpecialService(o, 'toning') && !!o.toningStatus && !o.toningExternal && isCurrentWorkerAssignedSpecialService(o, 'toning', currentWorker || currentName));
  }
  if (currentUserHasPermission('own_warehouse_view') && currentWorkerTab === 'ownWarehouse') {
    return list.filter(o => o.ownWarehouse && !o.workerDone && !o.isCancelled);
  }
  const ownOrders = list.filter(o => _isCurrentWorkerOrder(o) && o.inWork && !o.isCancelled);

  if (currentWorkerTab === 'actual') {
    return ownOrders.filter(o => !o.workerDone);
  }
  if (currentWorkerTab === 'today') {
    return ownOrders.filter(o => !o.workerDone && o.date === today);
  }
  if (currentWorkerTab === 'done') {
    return ownOrders.filter(o => o.workerDone);
  }
  if (currentWorkerTab === 'future') {
    return ownOrders.filter(o => !o.workerDone && o.date && o.date > today);
  }
  if (currentWorkerTab === 'past') {
    return ownOrders.filter(o => !o.workerDone && o.date && o.date < today);
  }
  return ownOrders;
}

function getOrderDateFilterLabel() {
  if (orderDateFilterExact) return formatDate(orderDateFilterExact);
  if (orderDateFilterFrom && orderDateFilterTo) return `${formatDate(orderDateFilterFrom)} — ${formatDate(orderDateFilterTo)}`;
  if (orderDateFilterFrom) return `От ${formatDate(orderDateFilterFrom)}`;
  if (orderDateFilterTo) return `До ${formatDate(orderDateFilterTo)}`;
  return 'Дата';
}

function updateOrderDateFilterButton() {
  const btn = document.getElementById('filter-date-btn');
  if (!btn) return;
  btn.textContent = getOrderDateFilterLabel();
  btn.classList.toggle('active', !!(orderDateFilterExact || orderDateFilterFrom || orderDateFilterTo));
}

function orderMatchesDateFilter(order) {
  const date = String(order?.date || '').slice(0, 10);
  if (!date) return !(orderDateFilterExact || orderDateFilterFrom || orderDateFilterTo);
  if (orderDateFilterExact) return date === orderDateFilterExact;
  if (orderDateFilterFrom && date < orderDateFilterFrom) return false;
  if (orderDateFilterTo && date > orderDateFilterTo) return false;
  return true;
}

function openOrderDateFilterModal() {
  let modal = document.getElementById('order-date-filter-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'order-date-filter-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <div class="modal-header">
        <div class="modal-title">Фильтр по дате</div>
        <button class="modal-close" onclick="closeOrderDateFilterModal()">${icon('x')}</button>
      </div>
      <div class="modal-body" style="display:grid;gap:12px;">
        <div style="padding:12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;">
          <div style="font-size:12px;font-weight:900;color:var(--text3);letter-spacing:0.04em;margin-bottom:10px;">КОНКРЕТНОЕ ЧИСЛО</div>
          <div class="form-group">
            <label class="form-label">Дата</label>
            <input class="form-input" type="date" id="order-date-filter-exact" value="${escapeAttr(orderDateFilterExact)}">
          </div>
        </div>
        <div style="padding:12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;">
          <div style="font-size:12px;font-weight:900;color:var(--text3);letter-spacing:0.04em;margin-bottom:10px;">ДИАПАЗОН</div>
          <div class="form-group">
            <label class="form-label">Дата от</label>
            <input class="form-input" type="date" id="order-date-filter-from" value="${escapeAttr(orderDateFilterFrom)}">
          </div>
          <div class="form-group" style="margin-top:10px;">
            <label class="form-label">Дата до</label>
            <input class="form-input" type="date" id="order-date-filter-to" value="${escapeAttr(orderDateFilterTo)}">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="clearOrderDateFilter()">Сбросить</button>
        <button class="btn-primary" onclick="applyOrderDateFilter()">Применить</button>
      </div>
    </div>
  `;
  modal.classList.add('active');
  initIcons();
}

function closeOrderDateFilterModal() {
  document.getElementById('order-date-filter-modal')?.classList.remove('active');
}

function applyOrderDateFilter() {
  const exact = document.getElementById('order-date-filter-exact')?.value || '';
  let from = document.getElementById('order-date-filter-from')?.value || '';
  let to = document.getElementById('order-date-filter-to')?.value || '';
  if (from && to && from > to) {
    const tmp = from;
    from = to;
    to = tmp;
  }
  orderDateFilterExact = exact;
  orderDateFilterFrom = exact ? '' : from;
  orderDateFilterTo = exact ? '' : to;
  closeOrderDateFilterModal();
  updateOrderDateFilterButton();
  refreshOrdersView();
}

function clearOrderDateFilter() {
  orderDateFilterExact = '';
  orderDateFilterFrom = '';
  orderDateFilterTo = '';
  closeOrderDateFilterModal();
  updateOrderDateFilterButton();
  refreshOrdersView();
}

function refreshOrdersView() {
  updateOrderDateFilterButton();
  if (currentMonthFilter) {
    renderOrdersForMonth(currentMonthFilter);
  } else {
    renderOrders();
  }
}

function _renderOrdersList(container, list) {
  container.innerHTML = list.map(o => renderOrderCard(o)).join('');
}

function normalizeOrderSearchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim();
}

function collectOrderSearchValues(value, values = [], depth = 0) {
  if (value == null || depth > 4) return values;
  if (Array.isArray(value)) {
    value.forEach(item => collectOrderSearchValues(item, values, depth + 1));
    return values;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach(item => collectOrderSearchValues(item, values, depth + 1));
    return values;
  }
  values.push(String(value));
  return values;
}

function orderMatchesSearch(order, query) {
  const normalizedQuery = normalizeOrderSearchText(query);
  if (!normalizedQuery) return true;

  const compactQuery = normalizedQuery.replace(/\s+/g, '');
  if (compactQuery.startsWith('sg')) {
    const orderId = normalizeOrderSearchText(order?.id || '').replace(/\s+/g, '');
    return orderId.includes(compactQuery);
  }

  const haystack = normalizeOrderSearchText(collectOrderSearchValues(order).join(' '));
  const haystackDigits = haystack.replace(/\D/g, '');
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

  return tokens.every(token => {
    if (haystack.includes(token)) return true;
    const tokenDigits = token.replace(/\D/g, '');
    return !!tokenDigits && haystackDigits.includes(tokenDigits);
  });
}

// ---------- РЕНДЕР СПИСКА ----------
function renderOrders() {
  populateOrderWorkerFilter();
  updateOrderDateFilterButton();
  const search = document.getElementById('filter-search')?.value || '';
  const statF  = document.getElementById('filter-status')?.value || '';
  const workerF = document.getElementById('filter-worker')?.value || '';
  const sort   = document.getElementById('filter-sort')?.value || 'desc';

  let list = [...orders];

  if (currentRole === 'owner' || currentRole === 'manager') {
    if (currentOrderTab === 'deleted') {
      list = list.filter(isOrderDeleted);
    } else if (currentOrderTab === 'all') {
      list = list.filter(o => !isOrderDeleted(o));
      // без дополнительной фильтрации
    } else if (currentOrderTab === 'planner') {
      list = list.filter(o => !isOrderDeleted(o) && o.inWork && !o.ownWarehouse && !o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'call') {
      list = list.filter(o => !isOrderDeleted(o)).filter(_isCallOrderVisibleInCurrentContext);
    } else if (currentOrderTab === 'ownWarehouse') {
      list = list.filter(o => !isOrderDeleted(o) && o.ownWarehouse && !o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'selection') {
      list = list.filter(o => !isOrderDeleted(o) && !o.callStatus && !o.inWork && !o.ownWarehouse && !o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'done') {
      list = list.filter(o => !isOrderDeleted(o) && o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'debt') {
      list = list.filter(orderHasDebtTabFinancialMeaning);
    } else if (currentOrderTab === 'cancelled') {
      list = list.filter(o => !isOrderDeleted(o) && o.isCancelled);
    }
  } else {
    list = _filterSpecialistOrdersByTab(list);
  }

  if (search) list = list.filter(o => orderMatchesSearch(o, search));
  if (orderDateFilterExact || orderDateFilterFrom || orderDateFilterTo) list = list.filter(orderMatchesDateFilter);
  if (statF) list = list.filter(o => getEffectivePaymentStatus(o) === statF);
  if (workerF) list = list.filter(o =>
    o.responsible === workerF
    || o.assistant === workerF
    || o.extraAssistant === workerF
    || o.manager === workerF
    || getOrderSpecialServiceAssignedWorker(o, 'tatu') === workerF
    || getOrderSpecialServiceAssignedWorker(o, 'toning') === workerF
  );

  list.sort((a, b) => compareOrdersForList(a, b, sort, currentRole !== 'owner' && currentRole !== 'manager'));

  const container = document.getElementById('orders-list');

  if (!list.length) {
    const specialistEmptyMap = {
      today: '<h3>Нет сегодняшних записей</h3><p>На сегодня задач нет</p>',
      actual: '<h3>Нет актуальных записей</h3><p>В планёрке нет активных задач</p>',
      done: '<h3>Нет выполненных записей</h3><p>Пока ничего не завершено</p>',
      future: '<h3>Нет будущих записей</h3><p>Будущих задач пока нет</p>',
      past: '<h3>Нет прошедших записей</h3><p>Просроченных задач нет</p>',
      all: '<h3>Записей не найдено</h3><p>У вас пока нет заказов</p>',
    };
    const msg = (currentRole !== 'owner' && currentRole !== 'manager')
      ? (specialistEmptyMap[currentWorkerTab] || specialistEmptyMap.all)
      : '<h3>Записей не найдено</h3><p>Попробуйте изменить фильтры или добавьте новую запись</p>';
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${icon('clipboard-list')}</div>${msg}</div>`;
    return;
  }

  _renderOrdersList(container, list);
}

function _isCallOrderVisibleInCurrentContext(o) {
  if (!o?.callStatus || o.ownWarehouse || o.workerDone || o.isCancelled) return false;
  if (currentRole !== 'manager') return true;
  if (currentWorkerName === 'Sasha Manager') return true;
  if (o.manager !== currentWorkerName) return false;
  if (!o.date) return true;
  return o.date <= tomorrowStr();
}

function renderOrderPaymentsForDetail(payments, emptyLabel) {
  if (!payments || !payments.length) {
    return '<div style="font-size:12px;color:var(--text3);margin-top:8px;">' + emptyLabel + '</div>';
  }
  return '<div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">'
    + payments.map(payment => `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;">
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--text2);">${formatDate(payment.date)}</div>
          ${payment.method ? `<div style="font-size:11px;color:var(--text3);margin-top:2px;">${escapeHtml(normalizePaymentMethod(payment.method))}</div>` : ''}
        </div>
        <div style="font-size:13px;font-weight:800;color:var(--accent);white-space:nowrap;">${(Number(payment.amount) || 0).toLocaleString('ru')} ₴</div>
      </div>
    `).join('')
    + '</div>';
}

function getOrderFinanceCashEntries(order) {
  const orderId = String(order?.id || '').trim();
  if (!orderId) return [];
  const logs = [
    ...(Array.isArray(window.allCashLog) ? window.allCashLog : []),
    ...(Array.isArray(window.workerCashLog) ? window.workerCashLog : []),
  ];
  const seen = new Set();
  return logs.filter(entry => {
    const id = String(entry?.id || '');
    if (id && seen.has(id)) return false;
    const source = typeof getCashEntrySourceKey === 'function'
      ? getCashEntrySourceKey(entry)
      : String(entry?.source_key || entry?.fop_source_key || entry?.source_id || '');
    const comment = String(entry?.comment || '');
    const matches = String(entry?.order_id || '') === orderId
      || source.startsWith(`order:${orderId}`)
      || comment.includes(orderId);
    if (matches && id) seen.add(id);
    return matches;
  });
}

function isActiveFinanceLedgerEntry(entry) {
  if (!entry || String(entry.deleted_at || '').trim()) return false;
  const status = String(entry.ledger_status || 'posted').trim().toLowerCase();
  return status !== 'voided' && status !== 'reversed';
}

function ensureUniqueOrderFinanceSourceKeys(rows = []) {
  const seen = new Map();
  return (rows || []).map(row => {
    const baseKey = String(row?.sourceKey || '').trim();
    if (!baseKey) return row;
    const nextCount = (seen.get(baseKey) || 0) + 1;
    seen.set(baseKey, nextCount);
    if (nextCount === 1) return row;
    return {
      ...row,
      sourceKey: `${baseKey}|seq:${nextCount}`,
      reason: `${row.reason}, дубль ${nextCount}`,
    };
  });
}

function getExpectedOrderFinanceRows(order) {
  const rows = [];
  const addRows = (payments, paymentType) => {
    (payments || []).forEach(payment => {
      if (payment?.adjustment === true) return;
      const method = normalizePaymentMethod(payment?.method || '');
      const amount = Number(payment?.amount) || 0;
      if (!method || !amount) return;
      const signedAmount = paymentType === 'supplier' || paymentType === 'dropshipper' ? -amount : amount;
      const sourceKey = buildPaymentSourceKey(order?.id || '', method, paymentType, payment);
      const fallbackWorker = currentRole === 'owner'
        ? (payment?.cashWorker || order?.responsible || currentWorkerName || '')
        : (currentWorkerName || order?.responsible || '');
      const route = typeof resolveOrderPaymentCashRoute === 'function'
        ? resolveOrderPaymentCashRoute({ order, payment, paymentType, method, fallbackWorkerName: fallbackWorker })
        : (typeof getPaymentCashRoute === 'function'
          ? getPaymentCashRoute(method, fallbackWorker)
          : { workerName: fallbackWorker, cashAccount: 'cash', requiresConfirmation: !isCashPaymentMethod(method), reason: 'payment method route' });
      rows.push({
        paymentType,
        label: paymentType === 'supplier' ? 'Поставщик' : (paymentType === 'dropshipper' ? 'Дропшиппер' : 'Клиент'),
        method,
        amount: signedAmount,
        date: payment?.date || order?.date || '',
        sourceKey,
        cashOwner: route.workerName || fallbackWorker || '',
        account: route.cashAccount || 'cash',
        requiresConfirmation: route.requiresConfirmation === true,
        reason: route.reason === 'selected cash worker'
          ? 'кассу выбрал владелец'
          : (route.reason === 'dropshipper cash worker' ? 'касса дропшиппера' : 'маршрут способа оплаты'),
      });
    });
  };
  addRows(order?.clientPayments || [], 'client');
  addRows(order?.supplierPayments || [], 'supplier');
  addRows(order?.dropshipperPayments || [], 'dropshipper');
  return ensureUniqueOrderFinanceSourceKeys(rows);
}

function renderOrderFinanceAudit(order) {
  if (!isFinanceAuditDevEnabled()) return '';
  const hasLoadedCashLog = (Array.isArray(window.allCashLog) && window.allCashLog.length > 0) || window.__orderFinanceAuditCashLoaded === true;
  if (!hasLoadedCashLog) {
    return `
      <div class="detail-section" id="order-finance-audit">
        <div class="detail-section-title">${icon('receipt')} Финансовый путь</div>
        <div class="finance-audit-empty">Загружаю кассовые записи по заказу</div>
      </div>
    `;
  }
  const entries = getOrderFinanceCashEntries(order);
  const expected = getExpectedOrderFinanceRows(order);
  const activeBySource = new Map();
  entries.filter(isActiveFinanceLedgerEntry).forEach(entry => {
    const key = typeof getCashEntrySourceKey === 'function'
      ? getCashEntrySourceKey(entry)
      : String(entry?.source_key || entry?.fop_source_key || entry?.source_id || '').trim();
    if (!key) return;
    const list = activeBySource.get(key) || [];
    list.push(entry);
    activeBySource.set(key, list);
  });

  const issues = [];
  expected.forEach(row => {
    const matches = activeBySource.get(row.sourceKey) || [];
    if (!matches.length) issues.push(`Нет кассовой записи: ${row.label} ${row.amount.toLocaleString('ru')} ₴`);
    if (matches.length > 1) issues.push(`Дубль source_key: ${row.sourceKey}`);
    matches.forEach(entry => {
      const actualAmount = Number(entry.amount) || 0;
      const actualOwner = getCashEntryOwner(entry);
      if (actualAmount !== row.amount) issues.push(`Сумма не совпадает: ${row.sourceKey}`);
      if (row.cashOwner && actualOwner && actualOwner !== row.cashOwner) issues.push(`Касса не совпадает: ${row.sourceKey}`);
    });
  });

  const duplicateActual = new Map();
  entries.filter(isActiveFinanceLedgerEntry).forEach(entry => {
    const key = typeof getCashEntrySourceKey === 'function'
      ? getCashEntrySourceKey(entry)
      : String(entry?.source_key || entry?.fop_source_key || '').trim();
    if (!key) return;
    duplicateActual.set(key, (duplicateActual.get(key) || 0) + 1);
  });
  duplicateActual.forEach((count, key) => {
    if (count > 1 && !issues.some(text => text.includes(key))) issues.push(`Активный дубль: ${key}`);
  });

  if (issues.length && typeof console !== 'undefined') {
    const orderId = String(order?.id || '').trim();
    window.__orderFinanceAuditIssueCache = window.__orderFinanceAuditIssueCache || {};
    const signature = issues.join('|');
    if (window.__orderFinanceAuditIssueCache[orderId] !== signature) {
      window.__orderFinanceAuditIssueCache[orderId] = signature;
      console.warn('[finance][order-detail]', {
        orderId,
        issues,
        expected,
        cashEntries: entries,
      });
    }
  }

  const expectedHtml = expected.length
    ? expected.map(row => {
        const matches = activeBySource.get(row.sourceKey) || [];
        const status = matches.length === 1 ? 'ok' : (matches.length > 1 ? 'warn' : 'bad');
        const statusText = matches.length === 1 ? 'найдено' : (matches.length > 1 ? `${matches.length} дубля` : 'нет записи');
        return `
          <div class="finance-audit-row ${status}">
            <div>
              <div class="finance-audit-title">${escapeHtml(row.label)} · ${escapeHtml(row.method)} · ${row.amount.toLocaleString('ru')} ₴</div>
              <div class="finance-audit-meta">Касса: ${escapeHtml(getWorkerDisplayName(row.cashOwner) || row.cashOwner || '—')} · ${escapeHtml(row.reason)} · ${formatDate(row.date)}</div>
              <div class="finance-audit-key">${escapeHtml(row.sourceKey)}</div>
            </div>
            <div class="finance-audit-status">${statusText}</div>
          </div>
        `;
      }).join('')
    : '<div class="finance-audit-empty">Быстрых оплат в заказе нет</div>';

  const actualHtml = entries.length
    ? entries
        .slice()
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
        .map(entry => {
          const status = String(entry.ledger_status || 'posted');
          const amount = Number(entry.amount) || 0;
          const source = typeof getCashEntrySourceKey === 'function'
            ? getCashEntrySourceKey(entry)
            : String(entry.source_key || entry.fop_source_key || entry.source_id || '').trim();
          return `
            <div class="finance-audit-entry">
              <div>
                <div class="finance-audit-title">${amount >= 0 ? '+' : ''}${amount.toLocaleString('ru')} ₴ · ${escapeHtml(getWorkerDisplayName(getCashEntryOwner(entry)) || getCashEntryOwner(entry) || '—')}</div>
                <div class="finance-audit-meta">${escapeHtml(getCashEntrySourceLabel(entry) || entry.source_type || 'Запись')} · ${escapeHtml(status)} · ${escapeHtml(getCashEntryApprovalStatus(entry))}</div>
                <div class="finance-audit-key">${escapeHtml(source || 'без source_key')}</div>
              </div>
            </div>
          `;
        }).join('')
    : '<div class="finance-audit-empty">Кассовых записей по заказу пока не найдено</div>';

  return `
    <div class="detail-section" id="order-finance-audit">
      <div class="detail-section-title">${icon('receipt')} Финансовый путь</div>
      ${issues.length ? `
        <div class="finance-audit-warning">
          ${issues.map(issue => `<div>${escapeHtml(issue)}</div>`).join('')}
        </div>
      ` : '<div class="finance-audit-ok">Проблем по быстрым оплатам не видно</div>'}
      <div class="finance-audit-grid">
        <div>
          <div class="finance-audit-heading">Ожидаемый путь</div>
          ${expectedHtml}
        </div>
        <div>
          <div class="finance-audit-heading">Фактические записи кассы</div>
          ${actualHtml}
        </div>
      </div>
    </div>
  `;
}

async function ensureOrderFinanceAuditLoaded(orderId) {
  if (!isFinanceAuditDevEnabled() || currentRole !== 'owner') return;
  if (Array.isArray(window.allCashLog) && window.allCashLog.length) {
    window.__orderFinanceAuditCashLoaded = true;
    return;
  }
  try {
    window.allCashLog = await sbFetchAllCashLog();
    window.__orderFinanceAuditCashLoaded = true;
    if (currentOrderDetailId === orderId) openOrderDetail(orderId);
  } catch (e) {
    console.warn('[finance] Не удалось загрузить кассу для финансового пути заказа', e);
  }
}

// ---------- ДЕТАЛЬНЫЙ ЭКРАН ЗАКАЗА ----------
function openOrderDetail(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  currentOrderDetailId = id;

  const el = document.getElementById('order-detail-content');
  const fullOrderTotal = getOrderClientTotal(o);
  const clientPaid = getOrderClientPaidAmount(o);
  const clientLeft = Math.max(0, fullOrderTotal - clientPaid);
  const supplierPaid = getOrderSupplierPaidAmount(o);
  const supplierLeft = Math.max(0, (Number(o.purchase) || 0) - supplierPaid);
  const dropshipperPaid = (o.dropshipperPayments || []).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const dropshipperLeft = Math.max(0, (Number(o.dropshipperPayout) || 0) - dropshipperPaid);
  const clientPaymentsHtml = renderOrderPaymentsForDetail(o.clientPayments || [], 'Оплат клиента нет');
  const supplierPaymentsHtml = renderOrderPaymentsForDetail(o.supplierPayments || [], 'Оплат поставщику нет');
  const dropshipperPaymentsHtml = renderOrderPaymentsForDetail(o.dropshipperPayments || [], 'Выплат дропшипперу нет');

  const canEdit   = currentRole === 'owner' || currentRole === 'manager';
  const canDelete = canDeleteOrder();
  const isSpecialistDetail = currentRole !== 'owner' && currentRole !== 'manager';

  // Кнопки в топ-баре рядом с "назад"
  const actionsEl = document.getElementById('order-detail-actions');
  if (actionsEl) {
    actionsEl.innerHTML = `
      <button class="icon-action-btn" title="Скопировать данные" onclick="copyOrderSummary('${o.id}')">${icon('clipboard-list')}</button>
      ${canEdit ? `<button class="icon-action-btn" title="Создать дубликат" onclick="duplicateOrder('${o.id}')">${icon('plus')}</button>` : ''}
      ${canEdit && isOrderDeleted(o) ? `<button class="icon-action-btn" title="Восстановить" onclick="restoreOrder('${escapeAttr(o.id)}', event)">${icon('refresh-cw')}</button>` : ''}
      ${canEdit   ? `<button class="icon-action-btn" title="Редактировать" onclick="openOrderModal('${o.id}')">${icon('pencil')}</button>` : ''}
        ${canDelete ? `<button class="icon-action-btn icon-action-danger" title="${isOrderDeleted(o) ? 'Удалить безвозвратно' : 'Удалить'}" onclick="deleteOrder('${escapeAttr(o.id)}', event)">${icon('trash-2')}</button>` : ''}
    `;
  }

  el.innerHTML = `
    <div class="detail-header">
      <div class="detail-header-top">
        <div>
          <div style="font-size:12px;color:var(--text3);font-family:'JetBrains Mono',monospace;margin-bottom:6px;">${o.id}</div>
          <div class="detail-title">${o.car || '—'}</div>
          <div class="detail-subtitle">${icon('calendar')} ${formatDate(o.date)}${o.time ? ' · ' + icon('clock') + ' ' + o.time : ''} &nbsp;·&nbsp; ${icon('hard-hat')} ${[getWorkerDisplayName(o.responsible), getWorkerDisplayName(o.assistant), getWorkerDisplayName(o.extraAssistant)].filter(Boolean).join(' + ') || '—'}</div>
        </div>
        <div class="detail-badges">
          ${o.inWork ? `<span class="status-badge" style="background:#F59E0B;color:#fff;">${icon('hammer')} Планёрка</span>` : ''}
          ${statusBadge(getEffectivePaymentStatus(o))}
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">${icon('user')} Клиент</div>
      <div class="detail-grid">
        ${field(`${icon('calendar')} Дата`, formatDate(o.date))}
        ${field(`${icon('clock')} Время`, o.time)}
        ${field(`${icon('hard-hat')} Ответственный`, getWorkerDisplayName(o.responsible))}
        ${field(`${icon('users')} Помощник`, getWorkerDisplayName(o.assistant))}
        ${field(`${icon('users')} Доп. помощник`, getWorkerDisplayName(o.extraAssistant))}
        ${field(`${icon('clipboard-list')} Менеджер`, getWorkerDisplayName(o.manager))}
        ${field(`${icon('user')} Клиент`, o.client)}
        ${field(`${icon('phone')} Телефон`, phoneCallLink(o.phone), 'mono detail-phone-value')}
        ${field(`${icon('map-pin')} Место`, o.address)}
        ${isSpecialistDetail ? '' : field(`${icon('users')} Создал`, getWorkerDisplayName(o.author))}
      </div>
      ${o.notes ? `<div style="margin-top:14px;padding:12px;background:var(--surface2);border-radius:8px;font-size:13px;color:var(--text2);">📝 ${o.notes}</div>` : ''}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">${icon('car')} Авто и логистика</div>
      <div class="detail-grid">
        ${field(`${icon('car')} Авто`, o.car)}
        ${field('VIN', o.vin, 'mono')}
        ${field('Доп заметка', o.extraNote)}
        ${field(`${icon('hash')} Єврокод`, o.code, 'mono')}
        ${field(`${icon('factory')} Производитель стекла`, o.glassManufacturer)}
        ${field(`${icon('warehouse')} Склад`, o.warehouse)}
        ${field(`${icon('hash')} Код склада`, o.warehouseCode, 'mono')}
        ${field(`${icon('list-checks')} Комплектация`, o.configuration)}
        ${o.newPost ? field(`${icon('mail')} Новая почта`, 'Да') : ''}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">${icon('wrench')} Работы</div>
      <div class="detail-grid">
        ${field(`${icon('tool')} Вид послуги`, formatOrderServiceTypeText(o.serviceType))}
        ${field(`${icon('wrench')} Стоимость работ`, o.total ? o.total + ' ₴' : '')}
        ${field(`${icon('wrench')} Монтаж`, o.mount ? o.mount + ' ₴' : '')}
        ${field(`${icon('receipt')} Только продажа`, o.onlySale ? 'Да' : '')}
        ${field(`${icon('hash')} Молдинг`, o.molding)}
        ${field(`${icon('wrench')} Доп. работы`, o.extraWork)}
        ${field(`${icon('hash')} Доп услуги`, o.tatu)}
        ${field('Тонировка', o.toning)}
        ${field('Ответственный за тату', getWorkerDisplayName(o.tatuResponsible || ''))}
        ${field('Ответственный за тонировку', getWorkerDisplayName(o.toningResponsible || ''))}
        ${o.toningExternal ? field('Тонировка внешняя', 'Да') : ''}
        ${field(`${icon('truck')} Доставка`, o.delivery ? o.delivery + ' ₴' : '')}
        ${isSpecialistDetail ? field(`${icon('handshake')} Дропшиппер`, o.dropshipper) : ''}
      </div>
    </div>

    ${isSpecialistDetail ? `
    <div class="detail-section">
      <div class="detail-section-title">${icon('banknote')} Финансы</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
        <div style="padding:14px;background:linear-gradient(135deg,rgba(29,233,182,.16),rgba(29,233,182,.05));border:1px solid rgba(29,233,182,.22);border-radius:14px;">
          <div style="font-size:11px;font-weight:800;color:var(--text3);letter-spacing:0.05em;">ОБЩАЯ СУММА ЗАКАЗА</div>
          <div style="font-size:28px;font-weight:900;color:var(--accent);margin-top:8px;">${fullOrderTotal.toLocaleString('ru')} ₴</div>
        </div>
        <div style="padding:14px;background:var(--surface2);border:1px solid var(--border);border-radius:14px;">
          <div style="font-size:11px;font-weight:800;color:var(--text3);letter-spacing:0.05em;">ПРОДАЖА СТЕКЛА</div>
          <div style="font-size:24px;font-weight:900;color:var(--text);margin-top:8px;">${(Number(o.income) || 0).toLocaleString('ru')} ₴</div>
        </div>
        <div style="padding:14px;background:var(--surface2);border:1px solid var(--border);border-radius:14px;">
          <div style="font-size:11px;font-weight:800;color:var(--text3);letter-spacing:0.05em;">СУММА РАБОТ</div>
          <div style="font-size:24px;font-weight:900;color:var(--text);margin-top:8px;">${(Number(o.total) || 0).toLocaleString('ru')} ₴</div>
        </div>
      </div>
    </div>
    ` : ''}

    ${isSpecialistDetail ? '' : `
    <div class="detail-section">
      <div class="detail-section-title">${icon('banknote')} Финансы</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:14px;">
        <div style="padding:14px;background:linear-gradient(135deg,rgba(29,233,182,.16),rgba(29,233,182,.05));border:1px solid rgba(29,233,182,.22);border-radius:14px;">
          <div style="font-size:11px;font-weight:800;color:var(--text3);letter-spacing:0.05em;">ОБЩАЯ СУММА ЗАКАЗА</div>
          <div style="font-size:28px;font-weight:900;color:var(--accent);margin-top:8px;">${fullOrderTotal.toLocaleString('ru')} ₴</div>
        </div>
        <div style="padding:14px;background:var(--surface2);border:1px solid var(--border);border-radius:14px;">
          <div style="font-size:11px;font-weight:800;color:var(--text3);letter-spacing:0.05em;">ПРОДАЖА СТЕКЛА</div>
          <div style="font-size:24px;font-weight:900;color:var(--text);margin-top:8px;">${(Number(o.income) || 0).toLocaleString('ru')} ₴</div>
        </div>
        <div style="padding:14px;background:var(--surface2);border:1px solid var(--border);border-radius:14px;">
          <div style="font-size:11px;font-weight:800;color:var(--text3);letter-spacing:0.05em;">СУММА РАБОТ</div>
          <div style="font-size:24px;font-weight:900;color:var(--text);margin-top:8px;">${(Number(o.total) || 0).toLocaleString('ru')} ₴</div>
        </div>
      </div>
      <div class="detail-grid">
        ${field('Статус оплаты клиента', getEffectivePaymentStatus(o))}
        ${field('Оплачено клиентом', clientPaid.toLocaleString('ru') + ' ₴')}
        ${field('Клиенту осталось оплатить', clientLeft.toLocaleString('ru') + ' ₴')}
        ${field('Дата расчёта долга', formatDate(o.debtDate))}
        ${field('Сумма продажи стекла', o.income ? o.income + ' ₴' : '')}
        ${field('Сумма покупки стекла', o.purchase ? o.purchase + ' ₴' : '')}
        ${field('Оплачено поставщику', supplierPaid.toLocaleString('ru') + ' ₴')}
        ${field('Поставщику осталось оплатить', supplierLeft.toLocaleString('ru') + ' ₴')}
        ${field(`${icon('package')} Статус оплати постачальнику`, getEffectiveSupplierStatus(o))}
        ${field('Маржа стекло', o.remainder !== undefined ? o.remainder + ' ₴' : '')}
        ${field('Дропшиппер', o.dropshipper)}
        ${field('Выплата дропшипперу', o.dropshipperPayout ? o.dropshipperPayout + ' ₴' : '')}
        ${field('Дропшипперу выплачено', dropshipperPaid.toLocaleString('ru') + ' ₴')}
        ${field('Дропшипперу осталось', dropshipperLeft.toLocaleString('ru') + ' ₴')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:14px;">
        <div style="padding:12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;">
          <div style="font-size:12px;font-weight:800;color:var(--text3);letter-spacing:0.04em;">ОПЛАТЫ КЛИЕНТА</div>
          ${clientPaymentsHtml}
        </div>
        <div style="padding:12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;">
          <div style="font-size:12px;font-weight:800;color:var(--text3);letter-spacing:0.04em;">ОПЛАТЫ ПОСТАВЩИКУ</div>
          ${supplierPaymentsHtml}
        </div>
        <div style="padding:12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;">
          <div style="font-size:12px;font-weight:800;color:var(--text3);letter-spacing:0.04em;">ВЫПЛАТЫ ДРОПШИППЕРУ</div>
          ${dropshipperPaymentsHtml}
        </div>
      </div>
    </div>
    ${renderOrderFinanceAudit(o)}
    `}
  `;

  showScreen('order-detail');
  ensureOrderFinanceAuditLoaded(o.id);
}

// ---------- УДАЛЕНИЕ ----------
async function deleteOrder(id, event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  closeOrderActionMenus();
  if (deletingOrderIds.has(id)) return;
  const existingOrder = orders.find(o => o.id === id);
  const hardDelete = isOrderDeleted(existingOrder);
  const message = hardDelete
    ? 'Удалить этот заказ безвозвратно? Архив кассы и ЗП останется, но сам заказ восстановить уже нельзя.'
    : 'Переместить этот заказ в удаленные? Его можно будет восстановить позже.';
  if (!confirm(message)) return;
  deletingOrderIds.add(id);
  try {
    if (hardDelete) {
      await sbDeleteOrder(id);
      orders = orders.filter(o => o.id !== id);
      showToast('Заказ удален безвозвратно');
    } else {
      const deletedAt = new Date().toISOString();
      await sbPatchOrderFields(id, {
        deleted_at: deletedAt,
        deleted_by: currentWorkerName || currentRole || 'system',
      });
      try {
        orders = await sbFetchOrders();
      } catch (refreshError) {
        console.warn('Failed to refresh orders after soft delete:', refreshError);
        const idx = orders.findIndex(o => o.id === id);
        if (idx !== -1) {
          orders[idx] = {
            ...orders[idx],
            deletedAt,
            deletedBy: currentWorkerName || currentRole || 'system',
          };
        }
      }
      showToast('Заказ перемещен в удаленные');
    }
    if (document.getElementById('screen-order-detail')?.classList.contains('active') && currentOrderDetailId === id) {
      currentOrderDetailId = null;
      openOrdersScreen();
    } else if (typeof refreshActiveOrdersViews === 'function') {
      refreshActiveOrdersViews();
    } else if (currentMonthFilter) {
      renderOrdersForMonth(currentMonthFilter);
    } else {
      renderOrders();
    }
    renderHome();
  } catch (e) {
    showToast('Ошибка удаления: ' + e.message, 'error');
  } finally {
    deletingOrderIds.delete(id);
  }
}

async function restoreOrder(id, event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  closeOrderActionMenus();
  if (deletingOrderIds.has(id)) return;
  const existingOrder = orders.find(o => o.id === id);
  if (!existingOrder || !isOrderDeleted(existingOrder)) return;
  deletingOrderIds.add(id);
  try {
    await sbPatchOrderFields(id, {
      deleted_at: null,
      deleted_by: null,
    });
    try {
      orders = await sbFetchOrders();
    } catch (refreshError) {
      console.warn('Failed to refresh orders after restore:', refreshError);
      const idx = orders.findIndex(o => o.id === id);
      if (idx !== -1) {
        orders[idx] = {
          ...orders[idx],
          deletedAt: '',
          deletedBy: '',
        };
      }
    }
    showToast('Заказ восстановлен ✓');
    if (document.getElementById('screen-order-detail')?.classList.contains('active') && currentOrderDetailId === id) {
      currentOrderDetailId = null;
      openOrdersScreen();
    } else if (typeof refreshActiveOrdersViews === 'function') {
      refreshActiveOrdersViews();
    } else if (currentMonthFilter) {
      renderOrdersForMonth(currentMonthFilter);
    } else {
      renderOrders();
    }
    renderHome();
  } catch (e) {
    showToast('Ошибка восстановления: ' + e.message, 'error');
  } finally {
    deletingOrderIds.delete(id);
  }
}

// ---------- КОПИРОВАНИЕ ДАННЫХ ЗАКАЗА ----------
let orderCopyModalOrderId = null;

const ORDER_COPY_EXTRA_BLOCKS = [
  {
    key: 'address',
    title: 'Адрес',
    text: '*Адрес*\n\nМы находимся по адресу: Новикова, 5.\nКонтакт мастера ниже — перед выездом позвоните ему для уточнения заезда\n\n0 (95) 920 73 59 Александр',
  },
  {
    key: 'corrosion',
    title: 'Коррозия',
    text: '*Коррозия*\n\nПосле демонтажа стекла возможно выявление коррозии (ржавчины). Стоимость устранения определяется по факту, в зависимости от степени сложности работ, и оплачивается дополнительно.',
  },
  {
    key: 'projection-toning',
    title: 'Тонировка для проекции',
    text: '*Тонировка для проекции*\n\nПосле тонировки работа проекции сохранится. Возможны незначительные изменения яркости и чёткости изображения из-за особенностей плёнки, однако в целом проекция отображается корректно.',
  },
  {
    key: 'site-form',
    title: 'Заявка на заполнение',
    text: '*Заявка на заполнение*\n\nЧтобы не уточнять всё по переписке, заполните, пожалуйста, короткую форму заявки:\nhttps://swiftglass.com.ua/form',
  },
  {
    key: 'selection',
    title: 'Подбор',
    text: '*Подбор*\n\nДля проверки комплектации и правильного подбора стекла пришлите, пожалуйста:\n• VIN-код автомобиля;\n• фото лобового стекла с улицы в зоне зеркала заднего вида.\n\nПо фото мы определим наличие датчиков, камеры, обогрева и других опций.',
  },
];

function getOrderCopyExtraBlocks() {
  const personal = typeof getCurrentWorkerRecord === 'function'
    ? getCurrentWorkerRecord()?.clientCopyFields?.fields
    : null;
  if (currentRole !== 'owner' && Array.isArray(personal) && personal.length) {
    return personal
      .map((block, index) => ({
        key: String(block?.key || `personal-${index + 1}`),
        title: String(block?.title || '').trim(),
        text: String(block?.text || '').trim(),
      }))
      .filter(block => block.title && block.text);
  }
  const configured = appSettings?.client_copy_fields?.fields;
  if (!Array.isArray(configured)) return ORDER_COPY_EXTRA_BLOCKS;
  return configured
    .map((block, index) => ({
      key: String(block?.key || `custom-${index + 1}`),
      title: String(block?.title || '').trim(),
      text: String(block?.text || '').trim(),
    }))
    .filter(block => block.title && block.text);
}

function copyOrderSummary(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;

  if (o.workerDone) {
    const completedOrderClientText = `Спасибо за заказ!

📋 Рекомендации по эксплуатации после замены стекла
Чтобы герметик правильно кристаллизовался и стекло сохранило герметичность на долгие годы, пожалуйста, соблюдайте следующие правила в первые 24-48 часов:

1. Основные ограничения:
• Не снимайте фиксирующий скотч в течение суток.
• Избегайте моек высокого давления.
• Паркуйтесь на ровной поверхности.

2. Важные нюансы:
• Закрывайте двери плавно. При закрытии двери в салоне создается скачок давления.
• Соблюдайте спокойный темп езды.

3. Рекомендация по уходу:
• Оптимально будет заменить щетки стеклоочистителя на новые. Старые дворники часто имеют износ и накопившуюся пыль.

Будем благодарны за обратную связь!
https://share.google/EKtUDPReA8dCuWp4z`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(completedOrderClientText).then(() => {
        showToast('Дані скопійовано');
      }).catch(() => {
        _fallbackCopy(completedOrderClientText);
      });
    } else {
      _fallbackCopy(completedOrderClientText);
    }
    return;
  }

  openOrderCopyModal(id);
}

function buildOrderClientCopyContent(o) {
  const textLines = [];
  const htmlParts = [];
  const fullTotal = getOrderClientTotal(o);
  const fmt = value => `${Number(value).toLocaleString('ru')} ₴`;
  const services = [
    ['Монтаж', o.mount],
    ['Молдинг (под вопросом)', o.molding],
    ['Доп. работы', o.extraWork],
    ['Тату', o.tatu],
    ['Тонировка', o.toning],
    ['Доставка', o.delivery],
  ].filter(([, amount]) => Number(amount) > 0);
  const listedServicesTotal = services.reduce((sum, [, amount]) => sum + (Number(amount) || 0), 0);
  const appendTextLine = line => textLines.push(line);
  const appendTextSpacer = () => { if (textLines.length && textLines[textLines.length - 1] !== '') textLines.push(''); };
  const appendHtmlLine = line => htmlParts.push(`<div>${line}</div>`);
  const appendHtmlSpacer = () => htmlParts.push('<div style="height:14px;"></div>');
  const appendHtmlServiceLine = line => htmlParts.push(`<div style="margin-top:4px;">${line}</div>`);
  const appendBlockSpacer = () => {
    appendTextSpacer();
    appendHtmlSpacer();
  };

  if (o.car) {
    appendTextLine(`Авто: ${o.car}`);
    appendHtmlLine(`Авто: ${escapeHtml(o.car)}`);
  }
  if (o.phone) {
    appendTextSpacer();
    appendTextLine(`Телефон: ${o.phone}`);
    appendHtmlSpacer();
    appendHtmlLine(`Телефон: ${escapeHtml(o.phone)}`);
  }
  if (o.notes) {
    appendBlockSpacer();
    appendTextLine(`Заметки: ${o.notes}`);
    appendHtmlLine(`Заметки: ${escapeHtml(o.notes)}`);
  }
  const manufacturerText = getGlassManufacturerCopyText(o.glassManufacturer);
  if (manufacturerText) {
    appendBlockSpacer();
    manufacturerText.split('\n').forEach(line => {
      appendTextLine(line);
      appendHtmlLine(escapeHtml(line));
    });
  }
  if (services.length || Number(o.total) > 0 || Number(o.income) > 0) {
    appendBlockSpacer();
    services.forEach(([label, amount]) => {
      const line = `${label}: ${fmt(amount)}`;
      appendTextLine(line);
      appendHtmlServiceLine(escapeHtml(line));
    });
    if (services.length === 0 && Number(o.total) > 0) {
      const line = `Услуги: ${fmt(o.total)}`;
      appendTextLine(line);
      appendHtmlServiceLine(escapeHtml(line));
    }
    if (services.length > 0 && Number(o.total) > listedServicesTotal) {
      const line = `Сумма услуг: ${fmt(o.total)}`;
      appendTextLine(line);
      appendHtmlServiceLine(escapeHtml(line));
    }
    if (Number(o.income) > 0) {
      const line = `Цена продажи стекла: ${fmt(o.income)}`;
      appendTextLine(line);
      appendHtmlLine(escapeHtml(line));
    }
  }
  if (fullTotal > 0) {
    appendBlockSpacer();
    const totalLine = `Общая сумма: ${fmt(fullTotal)}`;
    appendTextLine(totalLine);
    appendHtmlLine(`<strong>${escapeHtml(totalLine)}</strong>`);
  }
  const copyPaymentMethods = getOrderCopyPaymentMethods(o);
  if (copyPaymentMethods.length) {
    appendBlockSpacer();
    const paymentLine = `Способ оплаты: ${copyPaymentMethods.join(', ')}`;
    appendTextLine(paymentLine);
    appendHtmlLine(escapeHtml(paymentLine));
  }

  const text = textLines.join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.45;">${htmlParts.join('')}</div>`;
  return { text, html };
}

function renderOrderCopyExtraBlockHtml(text) {
  return escapeHtml(text)
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function buildOrderCopyContentWithExtras(order, extraKeys = []) {
  const base = buildOrderClientCopyContent(order);
  const selected = new Set(extraKeys || []);
  const extraBlocks = getOrderCopyExtraBlocks().filter(block => selected.has(block.key));
  if (!extraBlocks.length) return base;
  const extraText = extraBlocks.map(block => block.text).join('\n\n');
  const extraHtml = extraBlocks
    .map(block => `<div style="margin-top:18px;">${renderOrderCopyExtraBlockHtml(block.text)}</div>`)
    .join('');
  const baseHtml = base.html.endsWith('</div>') ? base.html.slice(0, -6) : base.html;
  return {
    text: [base.text, extraText].filter(Boolean).join('\n\n'),
    html: `${baseHtml}${extraHtml}</div>`,
  };
}

function openOrderCopyModal(id) {
  const order = orders.find(item => item.id === id);
  if (!order) return;
  orderCopyModalOrderId = id;
  const container = document.getElementById('order-copy-options');
  const modal = document.getElementById('order-copy-modal');
  if (!container || !modal) {
    copyOrderClientContent(buildOrderClientCopyContent(order));
    return;
  }
  const base = buildOrderClientCopyContent(order);
  const basePreview = base.text.split('\n').filter(Boolean).slice(0, 8).join('\n');
  container.innerHTML = `
    <label class="order-copy-option">
      <input type="checkbox" checked disabled>
      <span>
        <div class="order-copy-option-title">Данные заказа</div>
        <div class="order-copy-option-preview">${escapeHtml(basePreview || 'Основная информация заказа')}</div>
      </span>
    </label>
    ${getOrderCopyExtraBlocks().map(block => `
      <label class="order-copy-option">
        <input type="checkbox" value="${escapeAttr(block.key)}" data-order-copy-extra>
        <span>
          <div class="order-copy-option-title">${escapeHtml(block.title)}</div>
          <div class="order-copy-option-preview">${escapeHtml(block.text.replace(/\*/g, '').split('\n').filter(Boolean).slice(1).join('\n'))}</div>
        </span>
      </label>
    `).join('')}
  `;
  modal.classList.add('active');
  initIcons();
}

function closeOrderCopyModal() {
  document.getElementById('order-copy-modal')?.classList.remove('active');
  orderCopyModalOrderId = null;
}

function copySelectedOrderSummary() {
  const order = orders.find(item => item.id === orderCopyModalOrderId);
  if (!order) return;
  const extraKeys = Array.from(document.querySelectorAll('[data-order-copy-extra]:checked'))
    .map(input => input.value)
    .filter(Boolean);
  copyOrderClientContent(buildOrderCopyContentWithExtras(order, extraKeys));
  closeOrderCopyModal();
}

function copyOrderClientContent({ text, html }) {
  if (navigator.clipboard && window.ClipboardItem && navigator.clipboard.write) {
    navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      }),
    ]).then(() => {
      showToast('Дані скопійовано');
    }).catch(() => {
      _fallbackCopy(text);
    });
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Дані скопійовано');
    }).catch(() => {
      _fallbackCopy(text);
    });
  } else {
    _fallbackCopy(text);
  }
}

function getOrderCopyPaymentMethods(order) {
  const specificMethods = [];
  const fallbackMethods = [];
  const addMethod = method => {
    const normalized = normalizePaymentMethod(method || '');
    if (!normalized || isCashPaymentMethod(normalized)) return;
    const label = formatOrderCopyPaymentMethod(normalized);
    if (!label || isGenericOrderCopyPaymentMethod(label)) return;
    const config = typeof findPaymentMethodConfigByLabel === 'function' ? findPaymentMethodConfigByLabel(normalized) : null;
    const methodType = String(config?.method_type || '').trim().toLowerCase();
    const target = (methodType && methodType !== 'cash') || config ? specificMethods : fallbackMethods;
    if (!target.includes(label)) target.push(label);
  };
  (order?.clientPayments || []).forEach(payment => addMethod(payment?.method));
  addMethod(order?.paymentMethod);
  return specificMethods.length ? specificMethods : fallbackMethods;
}

function formatOrderCopyPaymentMethod(method) {
  return String(method || '')
    .trim()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim();
}

function isGenericOrderCopyPaymentMethod(method) {
  const normalized = String(method || '').trim().toLowerCase();
  return ['карта', 'card', 'картой', 'безнал', 'безналичный расчет', 'безналичный расчёт'].includes(normalized);
}

function sumCashClientPayments(payments) {
  return (payments || []).reduce((sum, payment) => {
    return sum + (isCashPaymentMethod(payment.method) ? (Number(payment.amount) || 0) : 0);
  }, 0);
}

function getCashClientPaidForOrderSnapshot(order) {
  const payments = order?.clientPayments || [];
  if (payments.length) return sumCashClientPayments(payments);
  return isCashPaymentMethod(order?.paymentMethod) ? (Number(order?.debt) || 0) : 0;
}

function getOrderPaymentSignature(payment) {
  return [
    normalizePaymentMethod(payment?.method || ''),
    Number(payment?.amount) || 0,
    payment?.date || '',
    payment?.timestamp || '',
  ].join('||');
}

function getNewOrderPaymentsDelta(oldPayments = [], newPayments = []) {
  const seen = new Map();
  (oldPayments || []).forEach(payment => {
    const key = getOrderPaymentSignature(payment);
    seen.set(key, (seen.get(key) || 0) + 1);
  });
  const added = [];
  (newPayments || []).forEach(payment => {
    const key = getOrderPaymentSignature(payment);
    const left = seen.get(key) || 0;
    if (left > 0) {
      seen.set(key, left - 1);
      return;
    }
    added.push(payment);
  });
  return added;
}

function getRemovedOrderPaymentsDelta(oldPayments = [], newPayments = []) {
  const seen = new Map();
  (newPayments || []).forEach(payment => {
    const key = getOrderPaymentSignature(payment);
    seen.set(key, (seen.get(key) || 0) + 1);
  });
  const removed = [];
  (oldPayments || []).forEach(payment => {
    const key = getOrderPaymentSignature(payment);
    const left = seen.get(key) || 0;
    if (left > 0) {
      seen.set(key, left - 1);
      return;
    }
    removed.push(payment);
  });
  return removed;
}

function getCurrentCashWorkerNameForOrder(order = null) {
  const currentWorkerRecord = (workers || []).find(worker =>
    worker && (worker.name === currentWorkerName || worker.alias === currentWorkerName)
  ) || null;
  const currentWorkerCashName = currentWorkerRecord?.name || currentWorkerName;
  return currentRole === 'owner'
    ? (order?.responsible || currentWorkerCashName)
    : currentWorkerCashName;
}

function buildNewCashPaymentEntries(order, oldOrder = null) {
  const entries = [];
  const targetWorker = getCurrentCashWorkerNameForOrder(order);
  const clientDelta = getNewOrderPaymentsDelta(oldOrder?.clientPayments || [], order?.clientPayments || []);
  const supplierDelta = getNewOrderPaymentsDelta(oldOrder?.supplierPayments || [], order?.supplierPayments || []);

  clientDelta.forEach(payment => {
    if (!isCashPaymentMethod(payment?.method)) return;
    const fDate = payment?.date ? formatDate(payment.date) : (order?.date ? formatDate(order.date) : '—');
    const fClient = order?.client || '—';
    const fCar = order?.car || '—';
    const sourceKey = buildPaymentSourceKey(order?.id || '', payment?.method || '', 'client', payment);
    entries.push({
      worker_name: targetWorker,
      amount: Number(payment.amount) || 0,
      comment: `Оплата клиента наличкой ${order?.id || '—'}, ${fDate}, клиент: ${fClient}, авто: ${fCar}`,
      fop_source_key: sourceKey,
      fop_date: payment?.date || order?.date || null,
      payment_method: normalizePaymentMethod(payment?.method || ''),
      order_id: order?.id || null,
      source_type: 'order',
      cashType: 'client',
    });
  });

  supplierDelta.forEach(payment => {
    if (!isCashPaymentMethod(payment?.method)) return;
    const fDate = payment?.date ? formatDate(payment.date) : (order?.date ? formatDate(order.date) : '—');
    const fTime = order?.time || '—';
    const fClient = order?.client || '—';
    const fCar = order?.car || '—';
    const sourceKey = buildPaymentSourceKey(order?.id || '', payment?.method || '', 'supplier', payment);
    entries.push({
      worker_name: targetWorker,
      amount: -(Number(payment.amount) || 0),
      comment: `Списание за стекло ${order?.id || '—'}, ${fDate} ${fTime}, клиент: ${fClient}, авто: ${fCar}, склад: ${order?.warehouse || '—'}`,
      fop_source_key: sourceKey,
      fop_date: payment?.date || order?.date || null,
      payment_method: normalizePaymentMethod(payment?.method || ''),
      order_id: order?.id || null,
      source_type: 'order',
      cashType: 'supplier',
    });
  });

  return entries;
}

function buildNewNonCashPaymentEntries(order, oldOrder = null) {
  const entries = [];
  const currentWorkerCashName = getCurrentCashWorkerNameForOrder(order);
  const clientDelta = getNewOrderPaymentsDelta(oldOrder?.clientPayments || [], order?.clientPayments || []);
  const supplierDelta = getNewOrderPaymentsDelta(oldOrder?.supplierPayments || [], order?.supplierPayments || []);

  clientDelta.forEach(payment => {
    if (isCashPaymentMethod(payment?.method)) return;
    const payload = buildOrderPaymentCashEntryPayload({
      order,
      payment,
      paymentType: 'client',
      fallbackWorkerName: currentRole === 'owner' ? (order?.responsible || currentWorkerCashName) : currentWorkerCashName,
    });
    if (payload) entries.push(payload);
  });

  supplierDelta.forEach(payment => {
    if (isCashPaymentMethod(payment?.method)) return;
    const payload = buildOrderPaymentCashEntryPayload({
      order,
      payment,
      paymentType: 'supplier',
      fallbackWorkerName: currentRole === 'owner' ? (order?.responsible || currentWorkerCashName) : currentWorkerCashName,
    });
    if (payload) entries.push(payload);
  });

  return entries;
}

function getRemovedPaymentSourceKeys(order, oldOrder = null) {
  const sourceKeys = [];
  const orderId = order?.id || oldOrder?.id || '';
  getRemovedOrderPaymentsDelta(oldOrder?.clientPayments || [], order?.clientPayments || []).forEach(payment => {
    const method = normalizePaymentMethod(payment?.method || '');
    if (!method) return;
    sourceKeys.push(buildPaymentSourceKey(orderId, method, 'client', payment));
  });
  getRemovedOrderPaymentsDelta(oldOrder?.supplierPayments || [], order?.supplierPayments || []).forEach(payment => {
    const method = normalizePaymentMethod(payment?.method || '');
    if (!method) return;
    sourceKeys.push(buildPaymentSourceKey(orderId, method, 'supplier', payment));
  });
  return Array.from(new Set(sourceKeys.filter(Boolean)));
}

function isDuplicateOrderIdError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return msg.includes('duplicate key') ||
    msg.includes('already exists') ||
    msg.includes('duplicate') ||
    msg.includes('уже существует');
}

function replaceOrderIdInCashEntries(cashEntries, oldId, newId) {
  if (!oldId || !newId || oldId === newId) return cashEntries;
  return (cashEntries || []).map(entry => {
    if (!entry || typeof entry.comment !== 'string') return entry;
    return { ...entry, comment: entry.comment.split(oldId).join(newId) };
  });
}

async function saveNewOrderWithNextIdOnConflict(order, saveFn, { cashEntries = [] } = {}) {
  let currentCashEntries = cashEntries;
  let lastError = null;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await saveFn(currentCashEntries);
    } catch (e) {
      lastError = e;
      if (!isDuplicateOrderIdError(e)) throw e;

      const oldId = order.id;
      order.id = generateOrderId(oldId);
      currentCashEntries = replaceOrderIdInCashEntries(currentCashEntries, oldId, order.id);
    }
  }

  throw lastError || new Error('Не удалось подобрать свободный ID заказа');
}

async function duplicateOrder(id) {
  if (currentRole !== 'owner' && currentRole !== 'manager') return;
  const source = orders.find(x => x.id === id);
  if (!source) return;
  if (!confirm(`Создать дубликат записи ${source.id}?`)) return;

  const duplicate = JSON.parse(JSON.stringify(source));
  delete duplicate.id;
  duplicate.statusDone = false;
  duplicate.workerDone = false;
  duplicate.priceLocked = false;
  duplicate.inWork = false;
  duplicate.callStatus = false;
  duplicate.ownWarehouse = false;
  duplicate.isCancelled = false;
  duplicate.clientPayments = [];
  duplicate.supplierPayments = [];
  duplicate.dropShipperPayments = [];
  duplicate.debt = 0;
  duplicate.check = 0;
  duplicate.paymentStatus = 'Не оплачено';
  duplicate.supplierStatus = 'Не оплачено';

  try {
    const saved = (await sbSaveOrderWithCash(duplicate, {
      isNew: true,
      cashEntries: [],
      rollbackOrder: null,
    })).order;
    const nextOrder = saved || duplicate;
    try {
      orders = await sbFetchOrders();
    } catch (refreshError) {
      console.warn('Failed to refresh orders after duplicate:', refreshError);
    }
    showToast(`Дубликат создан: ${nextOrder.id} ✓`);
    openOrderDetail(nextOrder.id);
  } catch (e) {
    showToast('Ошибка дублирования: ' + e.message, 'error');
  }
}

function _fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
    showToast('Дані скопійовано');
  } catch (e) {
    showToast('Не вдалося скопіювати', 'error');
  }
  document.body.removeChild(ta);
}

// ---------- ЗАПОЛНЕНИЕ СЕЛЕКТОВ ИЗ СПРАВОЧНИКОВ ----------
function populateCarDatalist() {
  // теперь просто инициализируем ac — данные берутся напрямую из refCars
}

function populateClientDatalist() {
  // данные клиентов берутся напрямую через acGetItems('client') → getClients()
}

// Подставляет помощника по умолчанию для выбранного ответственного
function applyAssistantForResponsible(respName) {
  if (!respName) return;
  const norm   = s => (s || '').trim().toLowerCase();
  const senior = (workers || []).find(w => norm(w.name) === norm(respName));
  const asSel  = document.getElementById('f-assistant');

  if (asSel && senior) {
    const preferredAssistant = senior.assistant || '';
    if (preferredAssistant) {
      // Ищем опцию без учёта регистра и лишних пробелов
      const matchedOption = Array.from(asSel.options).find(o => norm(o.value) === norm(preferredAssistant));
      if (matchedOption) {
        asSel.value = matchedOption.value;
      } else {
        console.warn(`Assistant "${preferredAssistant}" for ${respName} not found in dropdown options.`);
      }
    } else {
      asSel.value = '';
    }
  }
}

async function rememberAssistantForResponsible(respName, assistantName) {
  const norm = s => (s || '').trim().toLowerCase();
  const responsible = (workers || []).find(w => norm(w.name) === norm(respName));
  if (!responsible || !assistantName) return;
  if (norm(responsible.assistant) === norm(assistantName)) return;

  await sbUpdateWorker(responsible.id, { assistant: assistantName });
  responsible.assistant = assistantName;
}

async function rememberClientAddressFromOrder(order) {
  const name = String(order?.client || '').trim();
  const phone = String(order?.phone || '').trim();
  const address = String(order?.address || '').trim();
  if (!name || !address || typeof sbUpsertManualClient !== 'function') return;

  const savedClient = await sbUpsertManualClient({ name, phone, address });
  if (typeof manualClients === 'undefined') return;

  const key = phone || name;
  const idx = manualClients.findIndex(c => (c.phone || c.name) === key);
  if (idx !== -1) {
    manualClients[idx] = { ...manualClients[idx], ...savedClient, name, phone, address };
  } else {
    manualClients.push(savedClient || { name, phone, address, orders: [] });
  }
}

async function rememberCarDirectoryFromOrder(order) {
  const model = String(order?.car || '').trim();
  const eurocode = String(order?.code || '').trim();
  if (!model || typeof sbUpsertCarDirectory !== 'function') return;

  const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const modelKey = normalize(model);
  const existing = [...(Array.isArray(carDirectory) ? carDirectory : []), ...(Array.isArray(refCars) ? refCars : [])]
    .find(item => normalize(item?.model) === modelKey);
  if (existing && (!eurocode || String(existing.eurocode || '').trim() === eurocode)) return;

  try {
    const saved = await sbUpsertCarDirectory(existing?.model || model, eurocode || existing?.eurocode || '');
    if (!Array.isArray(carDirectory)) return;

    const savedId = saved?.id;
    const savedModel = saved?.model || existing?.model || model;
    const savedEurocode = saved?.eurocode || eurocode || existing?.eurocode || '';
    const savedModelKey = normalize(savedModel);
    const idx = carDirectory.findIndex(item =>
      (savedId && item.id === savedId) ||
      normalize(item.model) === savedModelKey
    );
    const nextRow = { ...(saved || {}), model: savedModel, eurocode: savedEurocode };
    if (idx !== -1) {
      carDirectory[idx] = { ...carDirectory[idx], ...nextRow };
    } else {
      carDirectory.push(nextRow);
    }
    if (Array.isArray(refCars)) {
      const refIdx = refCars.findIndex(item =>
        (savedId && item.id === savedId) ||
        normalize(item.model) === savedModelKey
      );
      if (refIdx !== -1) {
        refCars[refIdx] = { ...refCars[refIdx], ...nextRow };
      } else {
        refCars.push(nextRow);
      }
    }
    populateCarDatalist();
  } catch (e) {
    console.warn('Failed to remember car directory row:', e);
  }
}

function populateRefSelects() {
  // Марки авто — теперь datalist
  populateCarDatalist();

  // Способы оплаты (dynamic, from Supabase)
  const paymentMethods = (typeof getPaymentMethods === 'function' ? getPaymentMethods() : [])
    .filter(row => row?.active !== false)
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.label || '').localeCompare(String(b.label || ''), 'ru'));
  const paymentOptionsHtml = [
    '<option value="">— выбрать —</option>',
    ...paymentMethods.map(row => `<option value="${escapeAttr(row.label)}">${escapeHtml(row.label)}</option>`),
  ].join('');
  const clientMethodSel = document.getElementById('f-payment-method');
  if (clientMethodSel) {
    const cur = clientMethodSel.value;
    clientMethodSel.innerHTML = paymentOptionsHtml;
    if (cur) clientMethodSel.value = cur;
  }
  const supplierMethodSel = document.getElementById('f-new-supplier-payment-method');
  if (supplierMethodSel) {
    const cur = supplierMethodSel.value;
    supplierMethodSel.innerHTML = paymentOptionsHtml;
    if (cur) supplierMethodSel.value = cur;
  }
  updateQuickCashWorkerSelectors();

  // Услуги — чекбоксы
  const svcBox = document.getElementById('service-type-checkboxes');
  if (svcBox) {
    const curMap = getOrderServiceSelectionMap(document.getElementById('f-service-type')?.value || '');
    const groups = [...new Set(SERVICE_TYPE_OPTIONS.map(item => item.group))];
    svcBox.innerHTML = groups.map(group => `
      <div class="service-group">
        <div class="service-group-title">${group}</div>
        <div class="service-group-options">
          ${SERVICE_TYPE_OPTIONS.filter(item => item.group === group).map(item => `
            <label class="checkbox">
              <span class="service-option-main">
                <input type="checkbox" value="${item.name}" ${curMap.has(item.name) ? 'checked' : ''} onchange="syncServiceTypes(this)">
                <span class="service-option-label">${item.name}</span>
              </span>
              <span class="service-option-qty" ${serviceOptionUsesQty(item) ? '' : 'style="display:none;"'}>
                <input
                  type="text"
                  inputmode="numeric"
                  autocomplete="off"
                  class="form-input service-qty-input"
                  data-form-service-qty="${item.name}"
                  value="${curMap.get(item.name) || 0}"
                  oninput="syncServiceTypes(this, false)"
                  onblur="normalizeOrderFormServiceQtyInput('${item.name}')"
                >
              </span>
            </label>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  // Статусы расчёта
  const psSel = document.getElementById('f-payment-status');
  if (psSel) {
    const cur = psSel.value;
    const opts = ['Оплачено', 'Не оплачено', 'Частично'];
    psSel.innerHTML = '<option value="">—</option>' + opts.map(s => `<option value="${s}">${s}</option>`).join('');
    if (cur) psSel.value = cur;
  }

  // Дропшипперы
  const dsSel = document.getElementById('f-dropshipper');
  if (dsSel) {
    const cur = dsSel.value;
    dsSel.innerHTML = '<option value="">— выбрать —</option>' +
      (refDropshippers || []).map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    if (cur) dsSel.value = cur;
  }

  // Партнёры
  const partSel = document.getElementById('f-partner');
  if (partSel) {
    const cur = partSel.value;
    partSel.innerHTML = '<option value="">— выбрать —</option>' +
      refPartners.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    if (cur) partSel.value = cur;
  }

  // Молдинг автор (работники)
  const maSel = document.getElementById('f-molding-author');
  if (maSel) {
    const cur = maSel.value;
    maSel.innerHTML = '<option value="">— выбрать —</option>' +
      workers.map(w => `<option value="${w.name}">${getWorkerDisplayName(w.name)}</option>`).join('');
    if (cur) maSel.value = cur;
  }

  // Статусы оплаты поставщику
  const ssSel = document.getElementById('f-supplier-status');
  if (ssSel) {
    const cur = ssSel.value;
    const opts = ['Оплачено','Не оплачено','Частично'];
    ssSel.innerHTML = '<option value="">—</option>' + opts.map(s => `<option value="${s}">${s}</option>`).join('');
    if (cur) ssSel.value = cur;
  }

  // Помощник — старший или младший специалист
  const assistantSel = document.getElementById('f-assistant');
  if (assistantSel) {
    const cur = assistantSel.value;
    assistantSel.innerHTML = '<option value="">— выбрать / нет —</option>' + 
      workers.filter(w => ['senior', 'junior', 'extra'].includes(w.systemRole)).map(w => `<option value="${w.name}">${getWorkerDisplayName(w.name)} (${w.role})</option>`).join('');
    if (cur) assistantSel.value = cur;
  }
  const extraAssistantSel = document.getElementById('f-extra-assistant');
  if (extraAssistantSel) {
    const cur = extraAssistantSel.value;
    extraAssistantSel.innerHTML = '<option value="">— выбрать / нет —</option>' +
      workers.filter(w => ['senior', 'junior', 'extra'].includes(w.systemRole)).map(w => `<option value="${w.name}">${getWorkerDisplayName(w.name)} (${w.role})</option>`).join('');
    if (cur) extraAssistantSel.value = cur;
  }

  // Ответственный — старшие специалисты
  const respSel = document.getElementById('f-responsible');
  if (respSel) {
    refreshResponsibleOptions();
    // При смене ответственного — подставляем помощника
    respSel.onchange = () => {
      applyAssistantForResponsible(respSel.value);
      updateQuickCashWorkerSelectors();
    };
  }

  const managerSel = document.getElementById('f-manager');
  if (managerSel) {
    const cur = managerSel.value;
    const managerWorkers = workers.filter(w => {
      if (w.systemRole === 'manager') return true;
      const permissions = typeof resolveWorkerPermissionState === 'function'
        ? resolveWorkerPermissionState(w)
        : (w.permissions || {});
      return !!permissions.selectable_as_manager;
    });
    managerSel.innerHTML = '<option value="">— выбрать —</option>' +
      managerWorkers.map(w => `<option value="${escapeAttr(w.name)}">${escapeHtml(getWorkerDisplayName(w.name))}</option>`).join('');
    if (cur) managerSel.value = cur;
  }

  populateSpecialServiceResponsibleSelects();
  populateOrderWorkerFilter();
}

function setServiceTypeSelection(value = '') {
  const selectedMap = getOrderServiceSelectionMap(value);
  document.querySelectorAll('#service-type-checkboxes input[type="checkbox"]').forEach(el => {
    el.checked = selectedMap.has(el.value);
  });
  document.querySelectorAll('#service-type-checkboxes [data-form-service-qty]').forEach(el => {
    const name = el.getAttribute('data-form-service-qty');
    el.value = String(selectedMap.get(name) || 0);
  });
  const hidden = document.getElementById('f-service-type');
  if (hidden) hidden.value = serializeOrderServiceSelections(getOrderServiceSelections(value));
}

function updateOrderServiceTypeAccess() {
  const section = document.getElementById('order-service-type-section');
  if (!section) return;
  const existingOrder = editingOrderId ? orders.find(item => item.id === editingOrderId) : null;
  const canSeeServicesInOrderForm = canUseFullOrderForm(existingOrder) || currentUserCanActAsSenior();
  const canEditServicesInOrderForm = canCurrentUserEditOrderServices(existingOrder);
  section.dataset.orderModalPanel = canSeeServicesInOrderForm ? 'work' : 'hidden';
  section.style.display = canSeeServicesInOrderForm
    ? (document.querySelector('[data-order-modal-tab].active')?.dataset.orderModalTab === 'work' ? '' : 'none')
    : 'none';
  section.querySelectorAll('input[type="checkbox"], [data-form-service-qty]').forEach(input => {
    input.disabled = !canEditServicesInOrderForm;
  });
}

function populateOrderWorkerFilter() {
  const sel = document.getElementById('filter-worker');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Все сотрудники</option>' +
    (workers || []).map(w => `<option value="${escapeAttr(w.name)}">${escapeHtml(getWorkerDisplayName(w.name))}</option>`).join('');
  if (cur) sel.value = cur;
}

function getQuickCashWorkerOptionsHtml(selected = '') {
  return (workers || [])
    .filter(worker => {
      const role = String(worker?.systemRole || worker?.system_role || '').trim();
      const permissions = typeof resolveWorkerPermissionState === 'function'
        ? resolveWorkerPermissionState(worker)
        : (worker?.permissions || {});
      return ['owner', 'manager', 'senior', 'extra'].includes(role)
        || permissions.personal_cash_view === true
        || permissions.cash_add_entries === true;
    })
    .map(worker => {
      const name = String(worker?.name || '').trim();
      if (!name) return '';
      const label = getWorkerDisplayName(name) || name;
      return `<option value="${escapeAttr(name)}" ${name === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    })
    .filter(Boolean)
    .join('');
}

function logFinanceDebug(context, result) {
  const rows = Array.isArray(result?.financeDebug) ? result.financeDebug : [];
  if (!rows.length || typeof console === 'undefined') return;
  const orderId = result?.order?.id || editingOrderId || '';
  console.groupCollapsed(`[finance] ${context}${orderId ? ` · ${orderId}` : ''}`);
  rows.forEach(row => {
    const level = ['duplicate-voided', 'entry-voided', 'payment-skipped'].includes(row?.type) ? 'warn' : 'log';
    (console[level] || console.log)(row);
  });
  console.groupEnd();
}

function updateQuickCashWorkerSelectors() {
  const controls = [
    {
      methodEl: document.getElementById('f-payment-method'),
      groupEl: document.getElementById('f-new-payment-cash-worker-group'),
      selectEl: document.getElementById('f-new-payment-cash-worker'),
    },
    {
      methodEl: document.getElementById('f-new-supplier-payment-method'),
      groupEl: document.getElementById('f-new-supplier-cash-worker-group'),
      selectEl: document.getElementById('f-new-supplier-cash-worker'),
    },
  ];
  const fallbackWorker = String(document.getElementById('f-responsible')?.value || currentWorkerName || '').trim();
  controls.forEach(({ methodEl, groupEl, selectEl }) => {
    if (!groupEl || !selectEl) return;
    const show = currentRole === 'owner' && isCashPaymentMethod(normalizePaymentMethod(methodEl?.value || ''));
    groupEl.style.display = show ? '' : 'none';
    if (!show) {
      selectEl.value = '';
      return;
    }
    const selected = selectEl.value || fallbackWorker;
    selectEl.innerHTML = '<option value="">— выбрать —</option>' + getQuickCashWorkerOptionsHtml(selected);
    if (selected) selectEl.value = selected;
  });
}

let currentClientPayments = [];
let currentSupplierPayments = [];

function getOrderPaymentCashRecipient(order, payment, paymentType = 'client') {
  const method = normalizePaymentMethod(payment?.method || '');
  if (!method) return '';
  const fallbackWorker = String(order?.responsible || currentWorkerName || '').trim();
  if (typeof resolveOrderPaymentCashRoute === 'function') {
    const route = resolveOrderPaymentCashRoute({ order, payment, paymentType, method, fallbackWorkerName: fallbackWorker });
    return String(route?.workerName || fallbackWorker || '').trim();
  }
  const savedCashWorker = String(payment?.cashWorker || '').trim();
  if (savedCashWorker) return savedCashWorker;
  return fallbackWorker;
}

function renderOrderPaymentRecipientLine(payment, paymentType = 'client') {
  const order = editingOrderId ? (orders.find(item => item.id === editingOrderId) || { id: editingOrderId }) : null;
  const recipient = getOrderPaymentCashRecipient(order, payment, paymentType);
  if (!recipient) return '';
  return `<div style="font-size:11px;color:var(--text3);margin-top:2px;">Касса: ${escapeHtml(getWorkerDisplayName(recipient) || recipient)}</div>`;
}

function resetOrdersFilters() {
  ordersFiltersOpen = true;
  orderDateFilterExact = '';
  orderDateFilterFrom = '';
  orderDateFilterTo = '';

  const searchEl = document.getElementById('filter-search');
  const statusEl = document.getElementById('filter-status');
  const workerEl = document.getElementById('filter-worker');
  const sortEl = document.getElementById('filter-sort');

  if (searchEl) searchEl.value = '';
  if (statusEl) statusEl.value = '';
  if (workerEl) workerEl.value = '';
  if (sortEl) sortEl.value = 'desc';

  updateOrderDateFilterButton();
  updateOrdersFiltersDropdown();
}

// ---------- ФУНКЦИИ ИСТОРИИ ОПЛАТ И ДОРАБОТКИ ----------

function toggleReworkSection() {}

function renderClientPayments() {
  const listEl = document.getElementById('client-payments-list');
  if (!listEl) return;
  const canManagePayments = canCurrentUserManageOrderPayments(getOrderDraftFromForm(editingOrderId ? orders.find(item => item.id === editingOrderId) : null));
  const canRemovePayments = canCurrentUserRemoveOrderPayments();
  if (!currentClientPayments.length) {
    listEl.innerHTML = '<div style="font-size:11px;color:var(--text3);">Нет оплат</div>';
    return;
  }
  listEl.innerHTML = currentClientPayments.map((p, idx) => `
    <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface2);padding:6px 10px;border-radius:6px;border:1px solid var(--border);">
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--text2);">${Number(p.amount).toLocaleString('ru')} ₴</div>
        <div style="font-size:11px;color:var(--text3);">${formatDate(p.date)}</div>
        ${p.method ? `<div style="font-size:11px;color:var(--text3);margin-top:2px;">${escapeHtml(normalizePaymentMethod(p.method))}</div>` : ''}
        ${renderOrderPaymentRecipientLine(p, 'client')}
      </div>
      ${canManagePayments && canRemovePayments ? `
        <button type="button" class="icon-btn" style="width:20px;height:20px;" onclick="removeClientPayment(${idx})">
          <i data-lucide="trash-2" style="width:10px;height:10px;color:var(--red);"></i>
        </button>
      ` : ''}
    </div>
  `).join('');
  initIcons();
}

function renderSupplierPayments() {
  const listEl = document.getElementById('supplier-payments-list');
  if (!listEl) return;
  const canManagePayments = canCurrentUserManageOrderPayments(getOrderDraftFromForm(editingOrderId ? orders.find(item => item.id === editingOrderId) : null));
  const canRemovePayments = canCurrentUserRemoveOrderPayments();
  if (!currentSupplierPayments.length) {
    listEl.innerHTML = '<div style="font-size:11px;color:var(--text3);">Нет оплат поставщику</div>';
    return;
  }
  listEl.innerHTML = currentSupplierPayments.map((p, idx) => `
    <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface2);padding:6px 10px;border-radius:6px;border:1px solid var(--border);">
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--text2);">${Number(p.amount).toLocaleString('ru')} ₴</div>
        <div style="font-size:11px;color:var(--text3);">${formatDate(p.date)}</div>
        ${p.method ? `<div style="font-size:11px;color:var(--text3);margin-top:2px;">${escapeHtml(normalizePaymentMethod(p.method))}</div>` : ''}
        ${renderOrderPaymentRecipientLine(p, 'supplier')}
      </div>
      ${canManagePayments && canRemovePayments ? `
        <button type="button" class="icon-btn" style="width:20px;height:20px;" onclick="removeSupplierPayment(${idx})">
          <i data-lucide="trash-2" style="width:10px;height:10px;color:var(--red);"></i>
        </button>
      ` : ''}
    </div>
  `).join('');
  initIcons();
}

function syncClientPaidFromPayments() {
  const debtEl = document.getElementById('f-debt');
  if (!debtEl) return;
  const draftOrder = editingOrderId ? (orders.find(item => item.id === editingOrderId) || { id: editingOrderId }) : null;
  const totalPaid = sumConfirmedOrderPayments(draftOrder, currentClientPayments, 'client');
  debtEl.value = String(totalPaid || 0);
  syncClientLeftFromPayments();
}

function syncClientLeftFromPayments(totalAll = null) {
  const leftEl = document.getElementById('f-client-left');
  if (!leftEl) return;
  const total = totalAll ?? (
    _moneyInputValue(document.getElementById('f-total')?.value) +
    _moneyInputValue(document.getElementById('f-income')?.value) +
    _moneyInputValue(document.getElementById('f-delivery')?.value)
  );
  const paid = _moneyInputValue(document.getElementById('f-debt')?.value);
  leftEl.value = String(Math.max(0, total - paid));
}

function syncSupplierPaidFromPayments() {
  const checkEl = document.getElementById('f-check');
  const draftOrder = editingOrderId ? (orders.find(item => item.id === editingOrderId) || { id: editingOrderId }) : null;
  const totalPaid = sumConfirmedOrderPayments(draftOrder, currentSupplierPayments, 'supplier');
  if (checkEl) checkEl.value = String(totalPaid || 0);
  syncSupplierLeftFromPayments();
}

function syncSupplierLeftFromPayments() {
  const leftEl = document.getElementById('f-supplier-left');
  if (!leftEl) return;
  const purchase = Number(document.getElementById('f-purchase')?.value) || 0;
  const draftOrder = editingOrderId ? (orders.find(item => item.id === editingOrderId) || { id: editingOrderId }) : null;
  const paid = sumConfirmedOrderPayments(draftOrder, currentSupplierPayments, 'supplier');
  leftEl.value = String(Math.max(0, purchase - paid));
}

async function addClientPayment() {
  if (!canCurrentUserManageOrderPayments(getOrderDraftFromForm(editingOrderId ? orders.find(item => item.id === editingOrderId) : null))) return;
  if (!editingOrderId) return showToast('Сначала сохраните заказ, потом добавляйте оплату', 'error');
  const amtEl = document.getElementById('f-new-payment-amount');
  const dateEl = document.getElementById('f-new-payment-date');
  const methodEl = document.getElementById('f-payment-method');
  const cashWorkerEl = document.getElementById('f-new-payment-cash-worker');
  const addBtn = document.getElementById('add-client-payment-btn');
  const amount = Number(amtEl.value);
  if (!amount || amount <= 0) return showToast('Введите сумму оплаты', 'error');
  const date = dateEl.value || todayStr();
  const method = normalizePaymentMethod(methodEl?.value || '');
  if (!method) return showToast('Выберите способ оплаты', 'error');
  const cashWorker = currentRole === 'owner' && isCashPaymentMethod(method)
    ? String(cashWorkerEl?.value || '').trim()
    : '';
  if (currentRole === 'owner' && isCashPaymentMethod(method) && !cashWorker) return showToast('Выберите кассу', 'error');
  const resolvedCashWorker = isCashPaymentMethod(method)
    ? (cashWorker || String(getOrderDraftFromForm(orders.find(item => item.id === editingOrderId) || null)?.responsible || currentWorkerName || '').trim())
    : '';

  const nextClientPayments = [
    ...JSON.parse(JSON.stringify(currentClientPayments || [])),
    { amount, date, method, cashWorker: resolvedCashWorker || undefined, timestamp: new Date().toISOString() },
  ];
  if (addBtn) addBtn.disabled = true;
  try {
    await persistImmediateOrderPaymentsUpdate({
      clientPayments: nextClientPayments,
      supplierPayments: currentSupplierPayments,
    });
    amtEl.value = '';
    renderClientPayments();
    syncClientPaidFromPayments();
    recalcTotal();
    showToast('Оплата клиента добавлена ✓');
  } catch (e) {
    showToast('Ошибка сохранения: ' + e.message, 'error');
  } finally {
    if (addBtn) addBtn.disabled = false;
  }
}

async function addSupplierPayment() {
  if (!canCurrentUserManageOrderPayments(getOrderDraftFromForm(editingOrderId ? orders.find(item => item.id === editingOrderId) : null))) return;
  if (!editingOrderId) return showToast('Сначала сохраните заказ, потом добавляйте оплату', 'error');
  const amtEl = document.getElementById('f-new-supplier-payment-amount');
  const dateEl = document.getElementById('f-new-supplier-payment-date');
  const methodEl = document.getElementById('f-new-supplier-payment-method');
  const cashWorkerEl = document.getElementById('f-new-supplier-cash-worker');
  const addBtn = document.getElementById('add-supplier-payment-btn');
  const amount = Number(amtEl.value);
  if (!amount || amount <= 0) return showToast('Введите сумму поставщику', 'error');
  const date = dateEl.value || todayStr();
  const method = normalizePaymentMethod(methodEl?.value || '');
  if (!method) return showToast('Выберите способ оплаты', 'error');
  const cashWorker = currentRole === 'owner' && isCashPaymentMethod(method)
    ? String(cashWorkerEl?.value || '').trim()
    : '';
  if (currentRole === 'owner' && isCashPaymentMethod(method) && !cashWorker) return showToast('Выберите кассу', 'error');
  const resolvedCashWorker = isCashPaymentMethod(method)
    ? (cashWorker || String(getOrderDraftFromForm(orders.find(item => item.id === editingOrderId) || null)?.responsible || currentWorkerName || '').trim())
    : '';

  const nextSupplierPayments = [
    ...JSON.parse(JSON.stringify(currentSupplierPayments || [])),
    { amount, date, method, cashWorker: resolvedCashWorker || undefined, timestamp: new Date().toISOString() },
  ];
  if (addBtn) addBtn.disabled = true;
  try {
    await persistImmediateOrderPaymentsUpdate({
      clientPayments: currentClientPayments,
      supplierPayments: nextSupplierPayments,
    });
    amtEl.value = '';
    renderSupplierPayments();
    syncSupplierPaidFromPayments();
    recalcTotal();
    showToast('Оплата поставщику добавлена ✓');
  } catch (e) {
    showToast('Ошибка сохранения: ' + e.message, 'error');
  } finally {
    if (addBtn) addBtn.disabled = false;
  }
}

async function refreshImmediatePaymentState(orderId, { refreshCash = false } = {}) {
  let refreshedOrder = null;
  try {
    orders = await sbFetchOrders();
    refreshedOrder = orders.find(item => item.id === orderId) || null;
  } catch (refreshError) {
    console.warn('Failed to refresh orders after immediate payment save:', refreshError);
  }

  if (refreshCash) {
    await refreshCashStateAfterServerSave();
  }

  return refreshedOrder;
}

async function refreshCashStateAfterServerSave() {
  if (currentRole === 'owner') {
    try {
      window.allCashLog = await sbFetchAllCashLog();
    } catch (cashError) {
      console.warn('Failed to refresh owner cash log after server save:', cashError);
    }
  } else if (typeof workerCashLog !== 'undefined' && currentWorkerName) {
    try {
      workerCashLog = await sbFetchCashLog(currentWorkerName);
    } catch (cashError) {
      console.warn('Failed to refresh worker cash log after server save:', cashError);
    }
  }
}

function mergeCreatedCashEntriesIntoCurrentWorkerCash(createdEntries = []) {
  if (!Array.isArray(createdEntries) || !createdEntries.length || typeof workerCashLog === 'undefined') return;
  const currentWorker = typeof getCurrentWorkerRecord === 'function' ? getCurrentWorkerRecord() : null;
  const labels = [currentWorkerName, currentWorker?.name, currentWorker?.alias]
    .map(value => String(value || '').trim())
    .filter(Boolean);
  if (!labels.length) return;
  const normalizedLabels = new Set(labels.map(value => value.toLowerCase()));
  const shouldAttach = entry => {
    const owner = String(getCashEntryOwner(entry) || '').trim().toLowerCase();
    return owner && normalizedLabels.has(owner);
  };
  const existingIds = new Set((workerCashLog || []).map(entry => String(entry?.id || '')));
  const additions = createdEntries.filter(entry => entry && shouldAttach(entry) && !existingIds.has(String(entry.id || '')));
  if (!additions.length) return;
  workerCashLog = [...additions, ...(workerCashLog || [])];
}

async function persistImmediateOrderPaymentsUpdate({
  clientPayments = currentClientPayments,
  supplierPayments = currentSupplierPayments,
} = {}) {
  if (!editingOrderId) return;
  const existingOrder = orders.find(item => item.id === editingOrderId);
  if (!existingOrder) throw new Error('Заказ не найден');

  const data = getOrderDraftFromForm(existingOrder);
  data.clientPayments = JSON.parse(JSON.stringify(clientPayments || []));
  data.supplierPayments = JSON.parse(JSON.stringify(supplierPayments || []));
  const confirmedClientPaid = sumConfirmedOrderPayments({ ...existingOrder, ...data }, data.clientPayments, 'client');
  const confirmedSupplierPaid = sumConfirmedOrderPayments({ ...existingOrder, ...data }, data.supplierPayments, 'supplier');

  data.debt = confirmedClientPaid;
  data.check = confirmedSupplierPaid;
  const paymentPatchOrder = {
    id: editingOrderId,
    clientPayments: data.clientPayments,
    supplierPayments: data.supplierPayments,
    debt: confirmedClientPaid,
    check: confirmedSupplierPaid,
  };

  const saveResult = await sbSaveOrderWithCash(paymentPatchOrder, {
    isNew: false,
    cashEntries: [],
    rollbackOrder: existingOrder,
  });
  logFinanceDebug('immediate payment save', saveResult);
  const saved = saveResult.order;
  const refreshedOrder = await refreshImmediatePaymentState(editingOrderId, {
    refreshCash: true,
  });
  const canonicalOrder = refreshedOrder || saved || orders.find(item => item.id === editingOrderId) || null;
  currentClientPayments = JSON.parse(JSON.stringify(canonicalOrder?.clientPayments || data.clientPayments || []));
  currentSupplierPayments = JSON.parse(JSON.stringify(canonicalOrder?.supplierPayments || data.supplierPayments || []));

  if (typeof refreshActiveOrdersViews === 'function') {
    refreshActiveOrdersViews();
  } else {
    currentMonthFilter ? renderOrdersForMonth(currentMonthFilter) : renderOrders();
  }

  return canonicalOrder;
}

function sumCashSupplierPayments(payments) {
  return (payments || []).reduce((sum, payment) => {
    return sum + (isCashPaymentMethod(payment.method) ? (Number(payment.amount) || 0) : 0);
  }, 0);
}

async function removeClientPayment(idx) {
  if (!canCurrentUserRemoveOrderPayments()) return showToast('Удалять оплаты может только владелец или менеджер', 'error');
  if (!confirm('Удалить этот платеж из истории?')) return;
  const nextClientPayments = JSON.parse(JSON.stringify(currentClientPayments || []));
  nextClientPayments.splice(idx, 1);
  try {
    await persistImmediateOrderPaymentsUpdate({
      clientPayments: nextClientPayments,
      supplierPayments: currentSupplierPayments,
    });
    renderClientPayments();
    syncClientPaidFromPayments();
    recalcTotal();
    showToast('Платеж клиента удален ✓');
  } catch (e) {
    showToast('Ошибка удаления: ' + e.message, 'error');
  }
}

async function removeSupplierPayment(idx) {
  if (!canCurrentUserRemoveOrderPayments()) return showToast('Удалять оплаты может только владелец или менеджер', 'error');
  if (!confirm('Удалить этот платеж поставщику из истории?')) return;
  const nextSupplierPayments = JSON.parse(JSON.stringify(currentSupplierPayments || []));
  nextSupplierPayments.splice(idx, 1);
  try {
    await persistImmediateOrderPaymentsUpdate({
      clientPayments: currentClientPayments,
      supplierPayments: nextSupplierPayments,
    });
    renderSupplierPayments();
    syncSupplierPaidFromPayments();
    recalcTotal();
    showToast('Платеж поставщику удален ✓');
  } catch (e) {
    showToast('Ошибка удаления: ' + e.message, 'error');
  }
}

// ---------- МОДАЛ СОЗДАНИЯ / РЕДАКТИРОВАНИЯ ----------
async function openOrderModal(id) {
  const accessOrder = id ? orders.find(item => item.id === id) : null;
  if (id && !canCurrentUserOpenOrderModal(accessOrder)) return;
  editingOrderId = id;
  currentClientPayments = [];
  currentSupplierPayments = [];

  if ((!Array.isArray(getPaymentMethods?.()) || !getPaymentMethods().length) && typeof sbFetchPaymentMethods === 'function') {
    try {
      paymentMethods = await sbFetchPaymentMethods();
    } catch (e) {
      paymentMethods = [];
    }
  }

  populateRefSelects();
  if (typeof refreshSharedGlassManufacturers === 'function') {
    try { await refreshSharedGlassManufacturers(); } catch (e) {}
  }
  populateGlassManufacturerOptions(accessOrder?.glassManufacturer || '');
  populateClientDatalist();
  setOrderModalPanel(canUseFullOrderForm(accessOrder) ? 'order' : 'work');

  const cancelWrap = document.getElementById('cancel-toggle-wrap');
  if (cancelWrap) {
    cancelWrap.style.display = canUseFullOrderForm(accessOrder) ? 'inline-flex' : 'none';
  }
  const reminderWrap = document.getElementById('f-reminder-wrap');
  if (reminderWrap) reminderWrap.style.display = canCurrentUserUseOrderReminder() ? '' : 'none';
  const reminderCommentWrap = document.getElementById('f-reminder-comment-wrap');
  const reminderCommentEl = document.getElementById('f-reminder-comment');
  const reminderComment = accessOrder ? getOrderReminderComment(accessOrder) : '';
  if (reminderCommentWrap) reminderCommentWrap.style.display = (canCurrentUserUseOrderReminder() || reminderComment) ? '' : 'none';
  if (reminderCommentEl && !id) reminderCommentEl.value = '';

  if (id) {
    // РЕДАКТИРОВАНИЕ
    const o = orders.find(x => x.id === id);
    if (!o) return;
    
    if (o.clientPayments) {
      currentClientPayments = JSON.parse(JSON.stringify(o.clientPayments));
    }
    if (o.supplierPayments) {
      currentSupplierPayments = JSON.parse(JSON.stringify(o.supplierPayments));
    }
    
    document.getElementById('order-modal-title').textContent = `Редактировать ${o.id}`;
    fillOrderForm(o);

    // После заполнения формы: если помощник не задан в заказе — подставляем по умолчанию
    {
      const asSel   = document.getElementById('f-assistant');
      const respSel = document.getElementById('f-responsible');
      if (asSel && respSel && respSel.value && !o.assistant) {
        applyAssistantForResponsible(respSel.value);
      }
    }

    // Блокировка цены если уже сохранён
    setPriceFieldsLocked(o.priceLocked && !canEditPrice(o));
  } else {
    // НОВЫЙ
    document.getElementById('order-modal-title').textContent = 'Новая запись';
    clearOrderForm();
    setPriceFieldsLocked(false);
    document.getElementById('f-date').value = todayStr();
    document.getElementById('f-time').value = nowTimeStr();

    // Если текущий пользователь — senior, автоподставляем его и его помощника
    if (currentRole === 'senior' && currentWorkerName) {
      const respSel = document.getElementById('f-responsible');
      if (respSel) respSel.value = currentWorkerName;
      applyAssistantForResponsible(currentWorkerName);
    }
    // Для owner/manager: если один senior — подставляем его и его помощника
    else {
      const seniors = workers.filter(w => w.systemRole === 'senior');
      const respSel = document.getElementById('f-responsible');
      if (respSel && seniors.length === 1 && !respSel.value) {
        respSel.value = seniors[0].name;
        applyAssistantForResponsible(seniors[0].name);
      }
    }
  }

  const headerActions = document.getElementById('order-modal-owner-actions');
  if (headerActions) {
    headerActions.style.display = (id && (currentRole === 'owner' || currentRole === 'manager')) ? 'inline-flex' : 'none';
  }

  // Автокомплит инициализируется глобально через acInit()
  // Сбрасываем состояние замка еврокода при открытии нового заказа
  const codeEl2 = document.getElementById('f-code');

  // f-code теперь управляется через acFilter/acSelect (автокомплит)

  // Авторасчёт total из полей работ и доработки
  ['f-mount','f-molding','f-extra-work','f-tatu','f-toning'].forEach(fid => {
    const el = document.getElementById(fid);
    if (!el) return;
    const newEl = el.cloneNode(true);
    el.parentNode.replaceChild(newEl, el);
    newEl.addEventListener('input', () => recalcTotal('fromComponent'));
  });

  const dEl = document.getElementById('f-delivery');
  if (dEl) {
    const newD = dEl.cloneNode(true);
    dEl.parentNode.replaceChild(newD, dEl);
    newD.addEventListener('input', () => recalcTotal('init'));
  }

  // Автопересчёт финансов
  const totalEl = document.getElementById('f-total');
  const newTotal = totalEl.cloneNode(true);
  totalEl.parentNode.replaceChild(newTotal, totalEl);
  newTotal.addEventListener('input', recalcTotal);

  const purchaseEl = document.getElementById('f-purchase');
  const newPurchase = purchaseEl.cloneNode(true);
  purchaseEl.parentNode.replaceChild(newPurchase, purchaseEl);
  newPurchase.addEventListener('input', recalcMargin);

  const incomeEl = document.getElementById('f-income');
  const newIncome = incomeEl.cloneNode(true);
  incomeEl.parentNode.replaceChild(newIncome, incomeEl);
  newIncome.addEventListener('input', recalcMargin);

  const tonExtEl = document.getElementById('f-toning-external');
  if (tonExtEl) tonExtEl.addEventListener('change', () => { populateSpecialServiceResponsibleSelects(); recalcFullMargins(); recalcTotal(); });
  [
    { id: 'f-tatu-status', type: 'tatu' },
    { id: 'f-toning-status', type: 'toning' },
  ].forEach(({ id, type }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      syncSpecialServiceStatusPreview();
      handleSpecialServiceStatusChange(type);
    });
  });

  ['f-responsible','f-assistant','f-manager','f-dropshipper','f-order-status'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.onchange = () => {
      if (id === 'f-responsible') applyAssistantForResponsible(el.value);
      recalcFullMargins();
      renderOrderSummary(id ? (editingOrderId ? orders.find(item => item.id === editingOrderId) : null) : null);
      if (id === 'f-order-status') updateOrderSaveButtonLabel();
    };
  });

  [
    'f-mount','f-molding','f-extra-work','f-tatu','f-toning','f-total','f-delivery',
    'f-purchase','f-income','f-client','f-phone','f-car'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      if (id === 'f-tatu' || id === 'f-toning') populateSpecialServiceResponsibleSelects();
      recalcFullMargins();
      renderOrderSummary(editingOrderId ? orders.find(item => item.id === editingOrderId) : null);
    });
  });

  const finBody = document.getElementById('finance-section-body');
  if (finBody) finBody.style.display = 'block';

  // Прячем live-total пока нет данных
  const liveTotalEl = document.getElementById('modal-live-total');
  if (liveTotalEl) liveTotalEl.style.display = 'none';

  applyOrderFormDateTimeDefaults();
  updateOrderServiceTypeAccess();
  updateOrderSaveButtonLabel();
  renderSupplierPayments();
  renderClientPayments(); // рендерим историю оплат (изначально)
  syncSupplierPaidFromPayments();
  syncClientPaidFromPayments();
  initOrderVinDecoder();
  updateOrderModalAccess(id ? orders.find(item => item.id === id) : null);

  document.getElementById('order-modal').classList.add('active');

  // Начальный пересчёт итогов (при редактировании) и фиксация исходного состояния формы
  orderModalInitialSnapshot = '';
  setTimeout(() => {
    recalcTotal();
    orderModalInitialSnapshot = getOrderModalStateSnapshot();
  }, 50);
}

function closeOrderModal(force = false) {
  if (!force && hasUnsavedOrderModalChanges()) {
    openOrderCloseConfirmModal();
    return;
  }
  document.getElementById('order-modal').classList.remove('active');
  closeOrderCloseConfirmModal();
  editingOrderId = null;
  orderModalInitialSnapshot = '';
}

function getOrderModalStateSnapshot() {
  const modal = document.getElementById('order-modal');
  if (!modal) return '';
  const fieldState = {};
  modal.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
    if (!el.id) return;
    if (el.type === 'checkbox' || el.type === 'radio') {
      fieldState[el.id] = !!el.checked;
    } else {
      fieldState[el.id] = el.value ?? '';
    }
  });
  return JSON.stringify({
    editingOrderId: editingOrderId || null,
    fields: fieldState,
    clientPayments: JSON.parse(JSON.stringify(currentClientPayments || [])),
    supplierPayments: JSON.parse(JSON.stringify(currentSupplierPayments || [])),
  });
}

function hasUnsavedOrderModalChanges() {
  const modal = document.getElementById('order-modal');
  if (!modal?.classList.contains('active')) return false;
  if (editingOrderId) return false;
  const currentSnapshot = getOrderModalStateSnapshot();
  if (!orderModalInitialSnapshot) return currentSnapshot !== '';
  return currentSnapshot !== orderModalInitialSnapshot;
}

function openOrderCloseConfirmModal() {
  let modal = document.getElementById('order-close-confirm-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'order-close-confirm-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="modal" style="max-width:360px;">
      <div class="modal-header">
        <div class="modal-title">Удалить изменения?</div>
        <button class="modal-close" onclick="closeOrderCloseConfirmModal()">${icon('x')}</button>
      </div>
      <div class="modal-body">
        <div style="font-size:14px;color:var(--text2);line-height:1.5;">
          В заказе есть несохраненные изменения. Если удалить, форма закроется и изменения пропадут.
        </div>
      </div>
      <div class="modal-footer" style="display:flex;gap:8px;">
        <button class="btn-secondary" style="flex:1;" onclick="closeOrderCloseConfirmModal()">Отмена</button>
        <button class="btn-primary icon-action-danger" style="flex:1;" onclick="confirmCloseOrderModalDiscard()">Удалить</button>
      </div>
    </div>
  `;
  modal.classList.add('active');
  initIcons();
}

function closeOrderCloseConfirmModal() {
  document.getElementById('order-close-confirm-modal')?.classList.remove('active');
}

function confirmCloseOrderModalDiscard() {
  closeOrderCloseConfirmModal();
  closeOrderModal(true);
}

function setOrderModalPanel(panel) {
  const nextPanel = panel || 'order';
  updateOrderServiceTypeAccess();
  document.querySelectorAll('[data-order-modal-panel]').forEach(el => {
    el.style.display = el.dataset.orderModalPanel === nextPanel ? '' : 'none';
  });
  document.querySelectorAll('[data-order-modal-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.orderModalTab === nextPanel);
  });
  updateOrderModalAccess(editingOrderId ? orders.find(item => item.id === editingOrderId) : null);
}

function canUseFullOrderForm(order = null) {
  if (currentRole === 'owner' || currentRole === 'manager') return true;
  const isNewOrder = !editingOrderId && !order;
  return isNewOrder && canCreateOrder();
}

function canCurrentUserUseOrderReminder() {
  return currentRole === 'owner'
    || currentRole === 'manager'
    || (typeof canUseActionPanelReminders === 'function' && canUseActionPanelReminders());
}

function getCurrentOrderReminderChecked(order = null) {
  if (!order) return false;
  return !!order.reminder || (Array.isArray(order.reminderWorkers) && order.reminderWorkers.length > 0) || (Array.isArray(order.reworkData?.reminderWorkers) && order.reworkData.reminderWorkers.length > 0);
}

function getOrderReminderComment(order = null) {
  return String(order?.reminderComment || order?.reworkData?.reminderComment || '').trim();
}

function buildOrderReminderPatch(existingOrder = null, checked = false, comment = null) {
  const canEditReminder = canCurrentUserUseOrderReminder();
  const reminder = canEditReminder ? !!checked : getCurrentOrderReminderChecked(existingOrder);
  const nextComment = comment === null
    ? getOrderReminderComment(existingOrder)
    : String(comment || '').trim();
  const reworkData = {
    ...(existingOrder?.reworkData || {}),
  };
  delete reworkData.reminderWorkers;
  if (reminder) reworkData.reminder = true;
  else delete reworkData.reminder;
  if (nextComment) reworkData.reminderComment = nextComment;
  else delete reworkData.reminderComment;
  return {
    reminder,
    reminderWorkers: [],
    reminderComment: nextComment,
    reworkData,
  };
}

function hasOrderReminderChanges(order = null) {
  if (!canCurrentUserUseOrderReminder()) return false;
  const originalOrder = order || (editingOrderId ? orders.find(item => item.id === editingOrderId) : null);
  const currentChecked = document.getElementById('f-reminder')?.checked || false;
  const originalChecked = getCurrentOrderReminderChecked(originalOrder);
  const currentComment = String(document.getElementById('f-reminder-comment')?.value || '').trim();
  const originalComment = getOrderReminderComment(originalOrder);
  return currentChecked !== originalChecked || currentComment !== originalComment;
}

function setElementDisabledState(el, disabled) {
  if (!el) return;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.tagName === 'BUTTON') {
    el.disabled = !!disabled;
  }
  if (disabled) el.setAttribute('aria-disabled', 'true');
  else el.removeAttribute('aria-disabled');
}

function getOrderDraftFromForm(baseOrder = null) {
  const get = id => document.getElementById(id)?.value?.trim?.() || '';
  const getN = id => _moneyInputValue(document.getElementById(id)?.value);
  const order = { ...(baseOrder || {}) };
  order.id = baseOrder?.id || editingOrderId || 'Новая запись';
  order.date = get('f-date') || baseOrder?.date || '';
  order.time = get('f-time') || baseOrder?.time || '';
  order.responsible = get('f-responsible') || baseOrder?.responsible || '';
  order.assistant = document.getElementById('f-assistant')?.value || baseOrder?.assistant || '';
  order.extraAssistant = document.getElementById('f-extra-assistant')?.value || baseOrder?.extraAssistant || '';
  order.manager = document.getElementById('f-manager')?.value || baseOrder?.manager || '';
  order.dropshipper = get('f-dropshipper') || baseOrder?.dropshipper || '';
  order.molding = getN('f-molding');
  order.extraWork = getN('f-extra-work');
  order.toning = getN('f-toning');
  order.tatu = getN('f-tatu');
  order.tatuStatus = document.getElementById('f-tatu-status')?.checked || false;
  order.toningStatus = document.getElementById('f-toning-status')?.checked || false;
  order.tatuResponsible = document.getElementById('f-tatu-responsible')?.value || baseOrder?.tatuResponsible || '';
  order.toningResponsible = document.getElementById('f-toning-responsible')?.value || baseOrder?.toningResponsible || '';
  order.tatuDone = order.tatuStatus;
  order.tatuDoneBy = order.tatuStatus ? (baseOrder?.tatuDoneBy || order.tatuResponsible || currentWorkerName || '') : '';
  order.toningDone = order.toningStatus;
  order.toningDoneBy = order.toningStatus ? (baseOrder?.toningDoneBy || order.toningResponsible || currentWorkerName || '') : '';
  order.priorityTask = document.getElementById('f-priority-task')?.checked || false;
  const reminderPatch = buildOrderReminderPatch(baseOrder, document.getElementById('f-reminder')?.checked || false, document.getElementById('f-reminder-comment')?.value || '');
  order.reminder = reminderPatch.reminder;
  order.reminderWorkers = reminderPatch.reminderWorkers;
  order.reminderComment = reminderPatch.reminderComment;
  order.total = getN('f-total');
  order.income = getN('f-income');
  order.purchase = getN('f-purchase');
  order.serviceType = get('f-service-type') || '';
  order.toningExternal = document.getElementById('f-toning-external')?.checked || false;
  order.workerDone = true;
  order.callStatus = document.getElementById('f-order-status')?.value === 'call';
  order.inWork = document.getElementById('f-order-status')?.value === 'inWork';
  order.ownWarehouse = document.getElementById('f-order-status')?.value === 'ownWarehouse';
  order.isCancelled = document.getElementById('f-order-status')?.value === 'cancelled';
  order.reworkData = { ...reminderPatch.reworkData, priorityTask: order.priorityTask };
  return order;
}

function getOrderSalaryPreviewRows(order) {
  if (!order) return [];
  const rows = [];
  const seen = new Set();
  const candidateNames = [
    order.responsible,
    order.assistant,
    order.extraAssistant,
    order.manager,
    getOrderSpecialServiceAssignedWorker(order, 'tatu'),
    getOrderSpecialServiceAssignedWorker(order, 'toning'),
  ].filter(Boolean);
  candidateNames.forEach(workerName => {
    if (seen.has(workerName)) return;
    seen.add(workerName);
    const breakdown = getWorkerOrderSalaryPreviewBreakdown(workerName, order);
    const amount = breakdown.reduce((sum, part) => sum + (Number(part.amount) || 0), 0);
    rows.push({
      key: workerName,
      title: getWorkerDisplayName(workerName),
      amount,
      breakdown,
    });
  });

  const dropshipperAmount = Number(order.dropshipper ? (order.income - order.purchase) : 0) || 0;
  if (order.dropshipper && dropshipperAmount > 0) {
    rows.push({
      key: `dropshipper:${order.dropshipper}`,
      title: `Дропшиппер: ${order.dropshipper}`,
      amount: dropshipperAmount,
      breakdown: [{ label: 'Маржа стекла 100%', amount: dropshipperAmount }],
    });
  }
  return rows;
}

function getWorkerOrderSalaryPreviewBreakdown(workerName, order) {
  if (!workerName || !order || order.isCancelled) return [];
  const parts = [];
  const rule = typeof getSalaryRule === 'function' ? getSalaryRule(workerName) : {};
  const isMainWorker = [order.responsible, order.assistant, order.extraAssistant].includes(workerName);

  if (isMainWorker) {
    if (rule.selectedServices) {
      if (typeof hasCustomSalaryService === 'function' && hasCustomSalaryService(order)) {
        const customAmount = typeof _customServiceSalary === 'function'
          ? _customServiceSalary(order)
          : Math.round((Number(order.mount) || 0) * 0.2);
        parts.push({ label: 'Нестандартные работы 20% от монтажа', amount: customAmount });
      }
      const adjustments = rule.serviceAdjustments || {};
      const serviceRates = rule.serviceRates || {};
      const groupedServices = {};
      const serviceItems = typeof _salarySelectedServiceItems === 'function' ? _salarySelectedServiceItems(order) : [];
      serviceItems.forEach(item => {
        if (item.salaryCategory === 'custom' || item.salaryCategory === 'special') return;
        const hasPersonalRate = Object.prototype.hasOwnProperty.call(serviceRates, item.name);
        const baseRate = hasPersonalRate ? Number(serviceRates[item.name]) : (Number(item.rate) || 0);
        const adjustment = hasPersonalRate ? 0 : (Number(adjustments[item.salaryCategory]) || 0);
        const amount = Math.max(0, baseRate + adjustment);
        if (amount <= 0) return;
        if (!groupedServices[item.name]) groupedServices[item.name] = { qty: 0, amount: 0 };
        groupedServices[item.name].qty += 1;
        groupedServices[item.name].amount += amount;
      });
      Object.entries(groupedServices).forEach(([name, item]) => {
        parts.push({ label: item.qty > 1 ? `${name} ×${item.qty}` : name, amount: item.amount });
      });
    }

    const extraWorkAmount = typeof _extraWorkSalary === 'function'
      ? _extraWorkSalary(order, workerName)
      : Math.round((Number(order?.extraWork) || 0) * 0.2);
    if (extraWorkAmount > 0) {
      parts.push({ label: 'Доп. работы 20%', amount: extraWorkAmount });
    }

    const glassMargin = order.dropshipper ? 0 : (typeof _orderGlassMargin === 'function' ? _orderGlassMargin(order) : 0);
    const fromGlass = Math.round(glassMargin * (rule.glassMarginPct || 0));
    if (fromGlass > 0) parts.push({ label: 'Маржа стекла ' + Math.round((rule.glassMarginPct || 0) * 100) + '%', amount: fromGlass });

    const fromMolding = Math.round((Number(order.molding) || 0) * (rule.moldingPct || 0));
    if (fromMolding > 0) parts.push({ label: 'Молдинг ' + Math.round((rule.moldingPct || 0) * 100) + '%', amount: fromMolding });
  }

  if (order.manager === workerName) {
    const managerAmount = order.dropshipper ? 0 : Math.round((typeof _orderGlassMargin === 'function' ? _orderGlassMargin(order) : 0) * (rule.glassMarginPct || 0));
    if (managerAmount > 0) parts.push({ label: 'Менеджер ' + Math.round((rule.glassMarginPct || 0) * 100) + '% маржи стекла', amount: managerAmount });
  }

  if (workerCanHandleSpecialService(workerName, 'tatu') && getOrderSpecialServiceAssignedWorker(order, 'tatu') === workerName && Number(order.tatu) > 0) {
    parts.push({ label: 'Тату ' + Math.round((rule.tatuBonusPct || 0) * 100) + '%', amount: Math.round((Number(order.tatu) || 0) * (rule.tatuBonusPct || 0)) });
  }

  if (workerCanHandleSpecialService(workerName, 'toning') && getOrderSpecialServiceAssignedWorker(order, 'toning') === workerName && !order.toningExternal && Number(order.toning) > 0) {
    parts.push({ label: 'Тонировка ' + Math.round((rule.toningBonusPct || 0) * 100) + '%', amount: Math.round((Number(order.toning) || 0) * (rule.toningBonusPct || 0)) });
  }

  if (!parts.length && ([order.responsible, order.assistant, order.extraAssistant].includes(workerName) || order.manager === workerName)) {
    parts.push({ label: 'Пока начисление 0', amount: 0 });
  }

  return parts;
}

function formatOrderSummaryValue(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function formatOrderSummaryMoney(value) {
  return `${(Number(value) || 0).toLocaleString('ru')} ₴`;
}

function renderOrderSummary(order = null) {
  const section = document.getElementById('order-summary-section');
  const content = document.getElementById('order-summary-content');
  if (!section || !content) return;

  const draftOrder = getOrderDraftFromForm(order);
  const canSeePayouts = currentRole === 'owner';
  const payoutRows = canSeePayouts ? getOrderSalaryPreviewRows(draftOrder) : [];
  const clientPaid = Number(document.getElementById('f-debt')?.value) || 0;
  const clientLeft = Number(document.getElementById('f-client-left')?.value) || 0;
  const supplierPaid = Number(document.getElementById('f-check')?.value) || 0;
  const supplierLeft = Number(document.getElementById('f-supplier-left')?.value) || 0;
  const marginGlass = Number(document.getElementById('f-remainder')?.value) || 0;
  const marginTotal = Number(document.getElementById('f-margin-total')?.value) || 0;
  const fullTotal = (Number(draftOrder.total) || 0) + (Number(draftOrder.income) || 0) + (Number(draftOrder.delivery) || 0);
  const statusLabel = ({
    '': 'Подборка',
    call: 'Прозвон',
    inWork: 'В работу (Планёрка)',
    ownWarehouse: 'Наш склад',
    cancelled: 'Отменён',
  })[document.getElementById('f-order-status')?.value || ''] || 'Подборка';

  const blocks = [
    {
      title: 'Основное',
      rows: [
        ['ID', formatOrderSummaryValue(draftOrder.id)],
        ['Статус', statusLabel],
        ['Приоритетная задача', draftOrder.priorityTask ? 'Да' : '—'],
        ['Дата', formatOrderSummaryValue(draftOrder.date)],
        ['Время', formatOrderSummaryValue(draftOrder.time)],
        ['Ответственный', formatOrderSummaryValue(getWorkerDisplayName(draftOrder.responsible || ''))],
        ['Помощник', formatOrderSummaryValue(getWorkerDisplayName(draftOrder.assistant || ''))],
        ['Доп. помощник', formatOrderSummaryValue(getWorkerDisplayName(draftOrder.extraAssistant || ''))],
        ['Менеджер', formatOrderSummaryValue(getWorkerDisplayName(draftOrder.manager || ''))],
        ['Ответственный за тату', formatOrderSummaryValue(getWorkerDisplayName(draftOrder.tatuResponsible || ''))],
        ['Ответственный за тонировку', formatOrderSummaryValue(getWorkerDisplayName(draftOrder.toningResponsible || ''))],
      ],
    },
    {
      title: 'Клиент и авто',
      rows: [
        ['Клиент', formatOrderSummaryValue(document.getElementById('f-client')?.value?.trim())],
        ['Телефон', formatOrderSummaryValue(document.getElementById('f-phone')?.value?.trim())],
        ['Место', formatOrderSummaryValue(document.getElementById('f-address')?.value?.trim())],
        ['VIN', formatOrderSummaryValue(document.getElementById('f-vin')?.value?.trim())],
        ['Доп заметка', formatOrderSummaryValue(document.getElementById('f-extra-note')?.value?.trim())],
        ['Автомобиль', formatOrderSummaryValue(document.getElementById('f-car')?.value?.trim())],
        ['Еврокод', formatOrderSummaryValue(document.getElementById('f-code')?.value?.trim())],
        ['Производитель', formatOrderSummaryValue(document.getElementById('f-glass-manufacturer')?.value?.trim())],
      ],
    },
    {
      title: 'Логистика и работы',
      rows: [
        ['Склад', formatOrderSummaryValue(document.getElementById('f-warehouse')?.value?.trim())],
        ['Код склада', formatOrderSummaryValue(document.getElementById('f-warehouse-code')?.value?.trim())],
        ['Комплектация', formatOrderSummaryValue(document.getElementById('f-configuration')?.value?.trim())],
        ['Заметки', formatOrderSummaryValue(document.getElementById('f-notes')?.value?.trim())],
        ['Тип услуги', formatOrderSummaryValue(formatOrderServiceTypeText(draftOrder.serviceType))],
        ['Монтаж', formatOrderSummaryMoney(document.getElementById('f-mount')?.value)],
        ['Молдинг', formatOrderSummaryMoney(draftOrder.molding)],
        ['Доп. работы', formatOrderSummaryMoney(draftOrder.extraWork)],
        ['Тату', formatOrderSummaryMoney(draftOrder.tatu)],
        ['Тонировка', formatOrderSummaryMoney(draftOrder.toning)],
        ['Доставка', formatOrderSummaryMoney(draftOrder.delivery)],
        ['Дропшиппер', formatOrderSummaryValue(draftOrder.dropshipper)],
      ],
    },
    {
      title: 'Финансы',
      rows: [
        ['Сумма услуг', formatOrderSummaryMoney(draftOrder.total)],
        ['Продажа стекла', formatOrderSummaryMoney(draftOrder.income)],
        ['Покупка стекла', formatOrderSummaryMoney(draftOrder.purchase)],
        ['Общая сумма заказа', formatOrderSummaryMoney(fullTotal)],
        ['Клиент оплатил', formatOrderSummaryMoney(clientPaid)],
        ['Клиенту осталось', formatOrderSummaryMoney(clientLeft)],
        ['Поставщику оплачено', formatOrderSummaryMoney(supplierPaid)],
        ['Поставщику осталось', formatOrderSummaryMoney(supplierLeft)],
        ...(currentRole === 'owner' ? [['Маржа стекла', formatOrderSummaryMoney(marginGlass)]] : []),
        ['Общая маржа', formatOrderSummaryMoney(marginTotal)],
      ],
    },
  ];

  const payoutsHtml = payoutRows.length
    ? payoutRows.map(row => {
        const breakdown = Array.isArray(row.breakdown) ? row.breakdown : [];
        return `
          <div class="order-summary-payout-card">
            <div class="order-summary-payout-head">
              <span>${escapeHtml(row.title)}</span>
              <strong>${formatOrderSummaryMoney(row.amount)}</strong>
            </div>
            <div class="order-summary-payout-lines">
              ${breakdown.map(part => `
                <div class="order-summary-payout-line">
                  <span>${escapeHtml(part.label)}</span>
                  <span>${formatOrderSummaryMoney(part.amount)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')
    : '<div class="order-summary-empty">Пока нет прогнозируемых выплат по текущим данным заказа.</div>';

  content.innerHTML = `
    <div class="order-summary-grid">
      ${blocks.map(block => `
        <div class="order-summary-card">
          <div class="order-summary-title">${escapeHtml(block.title)}</div>
          <div class="order-summary-rows">
            ${block.rows.map(([label, value]) => `
              <div class="order-summary-row">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
    ${canSeePayouts ? `
    <div class="order-summary-card">
      <div class="order-summary-title">Прогнозируемые выплаты</div>
      <div class="order-summary-payouts">${payoutsHtml}</div>
    </div>` : ''}
  `;
}

function updateOrderModalTabsAccess(order = null) {
  const isPrivileged = canUseFullOrderForm(order);
  const orderTabBtn = document.querySelector('[data-order-modal-tab="order"]');
  const workTabBtn = document.querySelector('[data-order-modal-tab="work"]');
  const financeTabBtn = document.querySelector('[data-order-modal-tab="finance"]');
  const summaryTabBtn = document.querySelector('[data-order-modal-tab="summary"]');
  if (orderTabBtn) orderTabBtn.style.display = isPrivileged ? '' : 'none';
  if (workTabBtn) workTabBtn.style.display = '';
  if (financeTabBtn) financeTabBtn.style.display = '';
  if (summaryTabBtn) summaryTabBtn.style.display = '';

  const activeTab = document.querySelector('[data-order-modal-tab].active')?.dataset.orderModalTab;
  if (!isPrivileged && activeTab === 'order') setOrderModalPanel('work');
  if (isPrivileged && !activeTab) setOrderModalPanel('order');
}

function updateOrderModalAccess(order = null) {
  const existingOrder = order || (editingOrderId ? orders.find(item => item.id === editingOrderId) : null);
  const draftOrder = getOrderDraftFromForm(existingOrder);
  const isPrivileged = canUseFullOrderForm(existingOrder);
  const canManagePayments = canCurrentUserManageOrderPayments(draftOrder);
  const canEditServices = canCurrentUserEditOrderServices(existingOrder);
  const currentWorker = typeof getCurrentWorkerRecord === 'function' ? getCurrentWorkerRecord() : null;
  const currentName = currentWorker?.name || currentWorkerName;
  const tatuTabFallback = currentRole !== 'owner' && currentRole !== 'manager'
    && (currentWorkerTab === 'tatuActual' || currentWorkerTab === 'tatuDone');
  const toningTabFallback = currentRole !== 'owner' && currentRole !== 'manager'
    && (currentWorkerTab === 'toningActual' || currentWorkerTab === 'toningDone');
  const canToggleTatuStatus = canCurrentUserToggleSpecialServiceStatus(draftOrder, 'tatu') || tatuTabFallback;
  const canToggleToningStatus = canCurrentUserToggleSpecialServiceStatus(draftOrder, 'toning') || toningTabFallback;
  const canComplete = canCurrentUserCompleteOrder(existingOrder);
  const canEditReminder = canCurrentUserUseOrderReminder();
  const reminderComment = getOrderReminderComment(existingOrder);
  const canSave = isPrivileged || (canEditServices && hasSeniorServiceChanges(existingOrder)) || hasOrderReminderChanges(existingOrder);
  const headerActions = document.getElementById('order-modal-owner-actions');
  if (headerActions) {
    headerActions.style.display = (isPrivileged && !!editingOrderId && !!existingOrder) ? 'inline-flex' : 'none';
  }
  const restoreBtn = document.getElementById('order-modal-restore-btn');
  if (restoreBtn) {
    restoreBtn.style.display = (isPrivileged && !!editingOrderId && !!existingOrder && isOrderDeleted(existingOrder)) ? 'inline-flex' : 'none';
  }
  const deleteBtn = document.getElementById('order-modal-delete-btn');
  if (deleteBtn) {
    deleteBtn.title = (isPrivileged && !!existingOrder && isOrderDeleted(existingOrder)) ? 'Удалить безвозвратно' : 'Удалить';
  }

  updateOrderModalTabsAccess(existingOrder);

  const basicFieldIds = [
    'f-date','f-time','f-responsible','f-assistant','f-manager','f-client','f-phone','f-address',
    'f-vin','f-extra-note','f-car','f-code','f-glass-manufacturer','f-new-post','f-warehouse',
    'f-warehouse-code','f-notes','f-order-status','f-only-sale','f-toning-external','f-priority-task','f-reminder','f-reminder-comment','f-configuration'
  ];
  basicFieldIds.forEach(id => setElementDisabledState(document.getElementById(id), !isPrivileged));
  setElementDisabledState(document.getElementById('f-reminder'), !canEditReminder);
  setElementDisabledState(document.getElementById('f-reminder-comment'), !canEditReminder);
  const reminderCommentWrap = document.getElementById('f-reminder-comment-wrap');
  if (reminderCommentWrap) reminderCommentWrap.style.display = (canEditReminder || reminderComment) ? '' : 'none';
  document.querySelectorAll('#f-configuration-checkboxes input[type="checkbox"]').forEach(input => setElementDisabledState(input, !isPrivileged));

  const workCostsSection = document.getElementById('order-work-costs-section');
  if (workCostsSection) {
    const isWorkTabActive = document.querySelector('[data-order-modal-tab].active')?.dataset.orderModalTab === 'work';
    const shouldShowForSpecialist = !isPrivileged && (canToggleTatuStatus || canToggleToningStatus);
    workCostsSection.style.display = (isPrivileged || shouldShowForSpecialist)
      ? (isWorkTabActive ? '' : 'none')
      : 'none';
  }
  const specialStatusSection = document.getElementById('order-special-status-section');
  if (specialStatusSection) {
    specialStatusSection.style.display = (canToggleTatuStatus || canToggleToningStatus)
      ? (document.querySelector('[data-order-modal-tab].active')?.dataset.orderModalTab === 'work' ? '' : 'none')
      : 'none';
  }
  const tatuStatusWrap = document.getElementById('f-tatu-status-wrap');
  if (tatuStatusWrap) tatuStatusWrap.style.display = canToggleTatuStatus ? '' : 'none';
  const toningStatusWrap = document.getElementById('f-toning-status-wrap');
  if (toningStatusWrap) toningStatusWrap.style.display = canToggleToningStatus ? '' : 'none';
  ['f-mount','f-molding','f-extra-work','f-tatu','f-toning','f-total','f-delivery','f-dropshipper','f-purchase','f-income','f-debt-date'].forEach(id => {
    const el = document.getElementById(id);
    const allow = isPrivileged || (canManagePayments && id === 'f-debt-date');
    setElementDisabledState(el, !allow);
  });
  setElementDisabledState(
    document.getElementById('f-tatu-status'),
    !canToggleTatuStatus
  );
  setElementDisabledState(
    document.getElementById('f-toning-status'),
    !canToggleToningStatus
  );

  ['f-new-payment-amount','f-new-payment-date','f-payment-method','f-new-supplier-payment-amount','f-new-supplier-payment-date','f-new-supplier-payment-method'].forEach(id => {
    setElementDisabledState(document.getElementById(id), !canManagePayments);
  });
  setElementDisabledState(document.getElementById('add-client-payment-btn'), !canManagePayments);
  setElementDisabledState(document.getElementById('add-supplier-payment-btn'), !canManagePayments);

  document.querySelectorAll('#service-type-checkboxes input[type="checkbox"], #service-type-checkboxes [data-form-service-qty]').forEach(input => {
    setElementDisabledState(input, !canEditServices);
  });

  const saveBtn = document.getElementById('order-save-btn');
  if (saveBtn) saveBtn.style.display = canSave ? 'inline-flex' : 'none';
  const completeBtn = document.getElementById('order-complete-btn');
  if (completeBtn) completeBtn.style.display = canComplete ? 'inline-flex' : 'none';

  renderClientPayments();
  renderSupplierPayments();
  renderOrderSummary(draftOrder);
}

function updateOrderSaveButtonLabel() {
  const status = document.getElementById('f-order-status')?.value || '';
  const label = document.getElementById('order-save-label');
  const btn = document.getElementById('order-save-btn');
  if (btn) {
    btn.classList.remove('order-save-selection', 'order-save-call', 'order-save-planner', 'order-save-cancelled', 'order-save-own-warehouse');
  }
  if (!label) return;
  if (!editingOrderId && currentUserCanActAsSenior()) {
    label.textContent = 'Сохранить';
    return;
  }
  if (currentUserCanActAsSenior()) {
    label.textContent = 'Сохранить';
    return;
  }
  if (status === 'inWork') {
    label.textContent = 'Сохранить в работу';
    if (btn) btn.classList.add('order-save-planner');
  } else if (status === 'call') {
    label.textContent = 'Сохранить в прозвон';
    if (btn) btn.classList.add('order-save-call');
  } else if (status === 'cancelled') {
    label.textContent = 'Сохранить отменённым';
    if (btn) btn.classList.add('order-save-cancelled');
  } else if (status === 'ownWarehouse') {
    label.textContent = 'Сохранить на наш склад';
    if (btn) btn.classList.add('order-save-own-warehouse');
  } else {
    label.textContent = 'Сохранить в подборку';
    if (btn) btn.classList.add('order-save-selection');
  }
}

function toggleExclusiveOrderFlag(flag) {
  const onlySaleEl = document.getElementById('f-only-sale');
  if (flag === 'sale' && onlySaleEl?.checked) return;
}

function syncConfiguration() {
  const selected = Array.from(document.querySelectorAll('#f-configuration-checkboxes input[type="checkbox"]:checked'))
    .map(el => el.value)
    .filter(Boolean);
  const hidden = document.getElementById('f-configuration');
  if (hidden) hidden.value = selected.join(',');
}

function syncSpecialServiceStatusPreview() {
  renderOrderSummary(editingOrderId ? orders.find(item => item.id === editingOrderId) : null);
}

function shouldAutoPersistSpecialServiceStatus(type, order) {
  if (currentRole === 'owner' || currentRole === 'manager') return false;
  if (!order) return false;
  const currentWorker = typeof getCurrentWorkerRecord === 'function' ? getCurrentWorkerRecord() : null;
  const currentName = currentWorker?.name || currentWorkerName;
  if (type === 'tatu') {
    return workerCanHandleSpecialService(currentWorker || currentName, 'tatu') && canCurrentUserToggleSpecialServiceStatus(order, 'tatu');
  }
  if (type === 'toning') {
    return workerCanHandleSpecialService(currentWorker || currentName, 'toning') && canCurrentUserToggleSpecialServiceStatus(order, 'toning');
  }
  return false;
}

async function handleSpecialServiceStatusChange(type) {
  if (!editingOrderId) return;
  const existingOrder = orders.find(item => item.id === editingOrderId);
  if (!existingOrder) return;
  if (!shouldAutoPersistSpecialServiceStatus(type, getOrderDraftFromForm(existingOrder))) return;

  const isTatu = type === 'tatu';
  const input = document.getElementById(isTatu ? 'f-tatu-status' : 'f-toning-status');
  if (!input) return;
  const previousValue = isTatu ? !!existingOrder.tatuStatus : !!existingOrder.toningStatus;
  const nextValue = !!input.checked;

  try {
    input.disabled = true;
    const patch = isTatu
      ? {
          tatu_status: nextValue,
          tatu_done: nextValue,
          tatu_done_by: nextValue ? currentWorkerName : null,
        }
      : {
          toning_status: nextValue,
          toning_done: nextValue,
          toning_done_by: nextValue ? currentWorkerName : null,
        };
    const saved = await sbPatchOrderFields(editingOrderId, patch);
    let updatedOrder = null;
    try {
      orders = await sbFetchOrders();
      updatedOrder = orders.find(item => item.id === editingOrderId) || null;
    } catch (refreshError) {
      console.warn('Failed to refresh orders after service status toggle:', refreshError);
      updatedOrder = {
        ...existingOrder,
        ...saved,
        tatuStatus: isTatu ? nextValue : existingOrder.tatuStatus,
        tatuDone: isTatu ? nextValue : existingOrder.tatuDone,
        tatuDoneBy: isTatu ? (nextValue ? currentWorkerName : '') : existingOrder.tatuDoneBy,
        toningStatus: !isTatu ? nextValue : existingOrder.toningStatus,
        toningDone: !isTatu ? nextValue : existingOrder.toningDone,
        toningDoneBy: !isTatu ? (nextValue ? currentWorkerName : '') : existingOrder.toningDoneBy,
      };
      const idx = orders.findIndex(item => item.id === editingOrderId);
      if (idx !== -1) orders[idx] = updatedOrder;
    }
    updateOrderModalAccess(updatedOrder);
    renderOrderSummary(updatedOrder);
    if (currentMonthFilter) renderOrdersForMonth(currentMonthFilter);
    else renderOrders();
    if (document.getElementById('screen-profile')?.classList.contains('active')) {
      renderProfile();
    }
    showToast((isTatu ? 'Статус тату' : 'Статус тонировки') + ' сохранён ✓');
  } catch (e) {
    input.checked = previousValue;
    syncSpecialServiceStatusPreview();
    showToast('Ошибка сохранения: ' + e.message, 'error');
  } finally {
    updateOrderModalAccess(orders.find(item => item.id === editingOrderId) || existingOrder);
  }
}

function applyOrderFormDateTimeDefaults() {
  const defaultDateIds = ['f-date', 'f-new-supplier-payment-date', 'f-new-payment-date', 'f-debt-date'];
  defaultDateIds.forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = todayStr();
  });

  const timeEl = document.getElementById('f-time');
  if (timeEl && !timeEl.value) timeEl.value = nowTimeStr();
}

function fillOrderForm(o) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
  set('f-date', o.date);
  set('f-time', o.time);
  set('f-responsible', o.responsible);
  set('f-client', o.client);
  set('f-phone', normalizeOrderPhoneValue(o.phone));
  set('f-address', o.address);
  set('f-vin', o.vin);
  set('f-extra-note', o.extraNote);
  set('f-car', o.car);
  set('f-code', o.code);
  set('f-glass-manufacturer', o.glassManufacturer);
  set('f-notes', o.notes);
  set('f-mount', o.mount);
  set('f-molding', o.molding);
  set('f-extra-work', o.extraWork);
  set('f-tatu', o.tatu);
  set('f-toning', o.toning);
  set('f-delivery', o.delivery);
  set('f-warehouse', o.warehouse || '');
  set('f-warehouse-code', o.warehouseCode || '');
  const newPostEl = document.getElementById('f-new-post');
  if (newPostEl) newPostEl.checked = !!o.newPost;
  set('f-configuration', o.configuration || '');
  const tatuResponsibleEl = document.getElementById('f-tatu-responsible');
  if (tatuResponsibleEl) {
    const tatuResponsibleValue = o.tatuResponsible || '';
    if (tatuResponsibleValue && !Array.from(tatuResponsibleEl.options).some(option => option.value === tatuResponsibleValue)) {
      const option = document.createElement('option');
      option.value = tatuResponsibleValue;
      option.textContent = getWorkerDisplayName(tatuResponsibleValue);
      tatuResponsibleEl.appendChild(option);
    }
    tatuResponsibleEl.value = tatuResponsibleValue;
  }
  const toningResponsibleEl = document.getElementById('f-toning-responsible');
  if (toningResponsibleEl) {
    const toningResponsibleValue = o.toningResponsible || '';
    if (toningResponsibleValue && !Array.from(toningResponsibleEl.options).some(option => option.value === toningResponsibleValue)) {
      const option = document.createElement('option');
      option.value = toningResponsibleValue;
      option.textContent = getWorkerDisplayName(toningResponsibleValue);
      toningResponsibleEl.appendChild(option);
    }
    toningResponsibleEl.value = toningResponsibleValue;
  }
  const tatuStatusEl = document.getElementById('f-tatu-status');
  if (tatuStatusEl) tatuStatusEl.checked = !!o.tatuStatus;
  const toningStatusEl = document.getElementById('f-toning-status');
  if (toningStatusEl) toningStatusEl.checked = !!o.toningStatus;
  set('f-manager', o.manager || '');
  set('f-check', getOrderSupplierPaidAmount(o));
  set('f-debt', getOrderClientPaidAmount(o));
  set('f-debt-date', o.debtDate);
  set('f-total', o.total);
  set('f-supplier-status', o.supplierStatus);
  set('f-purchase', o.purchase);
  set('f-income', o.income);
  set('f-remainder', o.remainder);
  set('f-payment-method', normalizePaymentMethod(o.paymentMethod));
  set('f-dropshipper', o.dropshipper);
  const tonExtEl = document.getElementById('f-toning-external');
  if (tonExtEl) tonExtEl.checked = !!o.toningExternal;
  const priorityTaskEl = document.getElementById('f-priority-task');
  if (priorityTaskEl) priorityTaskEl.checked = !!o.priorityTask;
  const reminderEl = document.getElementById('f-reminder');
  if (reminderEl) reminderEl.checked = getCurrentOrderReminderChecked(o);
  set('f-reminder-comment', getOrderReminderComment(o));
  // услуги — чекбоксы
  const svcHidden = document.getElementById('f-service-type');
  if (svcHidden) {
    setServiceTypeSelection(o.serviceType || '');
  }
  set('f-margin-total', o.marginTotal);
  set('f-payout-dropshipper', o.dropshipperPayout);
  set('f-payout-manager-glass', o.payoutManagerGlass);
  set('f-payout-resp-glass', o.payoutRespGlass);
  set('f-payout-lesha', o.payoutLesha);
  set('f-payout-roma', o.payoutRoma);
  set('f-payout-extra-resp', o.payoutExtraResp);
  set('f-payout-extra-assist', o.payoutExtraAssist);
  set('f-payout-molding-resp', o.payoutMoldingResp);
  set('f-payout-molding-assist', o.payoutMoldingAssist);
  
  const onlySaleEl = document.getElementById('f-only-sale');
  if (onlySaleEl) onlySaleEl.checked = !!o.onlySale;

  const statusEl = document.getElementById('f-order-status');
  if (statusEl) {
    if (o.isCancelled) statusEl.value = 'cancelled';
    else if (o.ownWarehouse) statusEl.value = 'ownWarehouse';
    else if (o.inWork) statusEl.value = 'inWork';
    else if (o.callStatus) statusEl.value = 'call';
    else statusEl.value = '';
  }
  const asEl = document.getElementById('f-assistant');
  if (asEl) {
    const assistantValue = o.assistant || '';
    if (assistantValue && !Array.from(asEl.options).some(opt => opt.value === assistantValue)) {
      const option = document.createElement('option');
      option.value = assistantValue;
      option.textContent = getWorkerDisplayName(assistantValue);
      asEl.appendChild(option);
    }
    asEl.value = assistantValue;
  }
  const extraAsEl = document.getElementById('f-extra-assistant');
  if (extraAsEl) {
    const extraAssistantValue = o.extraAssistant || '';
    if (extraAssistantValue && !Array.from(extraAsEl.options).some(opt => opt.value === extraAssistantValue)) {
      const option = document.createElement('option');
      option.value = extraAssistantValue;
      option.textContent = getWorkerDisplayName(extraAssistantValue);
      extraAsEl.appendChild(option);
    }
    extraAsEl.value = extraAssistantValue;
  }
  // перерисовать чекбоксы комплектации
  const confArr = (o.configuration || '').split(',');
  document.querySelectorAll('#f-configuration-checkboxes input[type="checkbox"]').forEach(el => {
    el.checked = confArr.includes(el.value);
  });
  syncConfiguration();
}

function clearOrderForm() {
  const ids = [
    'f-date','f-time','f-responsible','f-client','f-phone','f-address','f-vin','f-extra-note','f-car','f-code',
    'f-glass-manufacturer','f-notes','f-mount','f-service-type','f-molding',
    'f-extra-work','f-tatu','f-toning','f-delivery','f-warehouse','f-warehouse-code','f-configuration',
    'f-payment-status','f-check','f-supplier-left','f-debt','f-client-left','f-debt-date','f-total',
    'f-supplier-status','f-purchase','f-income',
    'f-remainder','f-payment-method','f-dropshipper','f-margin-total',
    'f-payout-dropshipper','f-payout-manager-glass','f-payout-resp-glass',
    'f-payout-lesha','f-payout-roma','f-payout-extra-resp','f-payout-extra-assist',
    'f-payout-molding-resp','f-payout-molding-assist','f-assistant','f-extra-assistant','f-manager','f-tatu-responsible','f-toning-responsible',
    'f-new-payment-amount','f-new-payment-date','f-new-supplier-payment-amount','f-new-supplier-payment-date','f-new-supplier-payment-method'
  ];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  currentClientPayments = [];
  currentSupplierPayments = [];
  const orderStatusEl = document.getElementById('f-order-status');
  if (orderStatusEl) orderStatusEl.value = '';
  const onlySaleEl = document.getElementById('f-only-sale');
  if (onlySaleEl) onlySaleEl.checked = false;
  const newPostEl = document.getElementById('f-new-post');
  if (newPostEl) newPostEl.checked = false;
  const tonExtEl = document.getElementById('f-toning-external');
  if (tonExtEl) tonExtEl.checked = false;
  const priorityTaskEl = document.getElementById('f-priority-task');
  if (priorityTaskEl) priorityTaskEl.checked = false;
  const reminderEl = document.getElementById('f-reminder');
  if (reminderEl) reminderEl.checked = false;
  const reminderCommentEl = document.getElementById('f-reminder-comment');
  if (reminderCommentEl) reminderCommentEl.value = '';
  const tatuStatusEl = document.getElementById('f-tatu-status');
  if (tatuStatusEl) tatuStatusEl.checked = false;
  const toningStatusEl = document.getElementById('f-toning-status');
  if (toningStatusEl) toningStatusEl.checked = false;
  setServiceTypeSelection('');
  document.querySelectorAll('#f-configuration-checkboxes input[type="checkbox"]').forEach(el => el.checked = false);
  syncConfiguration();
}

function setPriceFieldsLocked(locked) {
  const priceFields = ['f-total','f-check','f-supplier-left','f-debt','f-debt-date','f-payment-status','f-payment-method','f-new-supplier-payment-method','f-purchase','f-income','f-supplier-status'];
  priceFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'f-check' || id === 'f-supplier-left' || id === 'f-supplier-status') {
      el.setAttribute('readonly', 'true');
      el.setAttribute('disabled', 'true');
      return;
    }
    if (id === 'f-payment-status') return; // Now fully automated
    if (id === 'f-debt-date' && currentRole === 'senior') return;
    if (id === 'f-check' && currentRole === 'senior') return;

    const forceUnlock = (currentRole === 'owner' || currentRole === 'manager' || currentRole === 'extra' || (!editingOrderId && canCreateOrder()));
    if (locked && !forceUnlock) {
      el.setAttribute('readonly', 'true');
      el.setAttribute('disabled', 'true');
    } else {
      el.removeAttribute('readonly');
      el.removeAttribute('disabled');
    }
  });
}

// Автопересчёт маржи и всех выплат
function recalcMargin() {
  recalcFullMargins();
  recalcTotal(); // обновляем итог стекла в шапке
}

function recalcTotal(mode = 'init') {
  let worksSum = 0;
  if (mode === 'fromComponent') {
    worksSum = ['f-mount','f-molding','f-extra-work','f-tatu','f-toning']
      .reduce((s, id) => s + _moneyInputValue(document.getElementById(id)?.value), 0);
  } else {
    // 'init', 'manualTotal' или любое другое (например, вызов без аргументов из других частей кода)
    worksSum = _moneyInputValue(document.getElementById('f-total')?.value);
  }

  // Сумма продажи стекла из финансового блока
  const glassSum = _moneyInputValue(document.getElementById('f-income')?.value);
  // Доставка из финансового блока
  const deliverySum = _moneyInputValue(document.getElementById('f-delivery')?.value);
  const totalAll = worksSum + glassSum + deliverySum;

  // Скрытое поле (для сохранения — только работы, как было), или видимый инпут
  const totalEl = document.getElementById('f-total');
  if (totalEl && mode === 'fromComponent') totalEl.value = worksSum;

  const fmt = v => v.toLocaleString('ru') + ' \u20B4';
  const glassPurchase = _moneyInputValue(document.getElementById('f-purchase')?.value);

  // Обновляем live-счётчик в хедере модала
  const liveTotal = document.getElementById('modal-live-total');
  const liveGlass = document.getElementById('modal-total-glass');
  const liveWorks = document.getElementById('modal-total-works');
  const liveAll   = document.getElementById('modal-total-all');
  
  if (liveTotal) liveTotal.style.display = totalAll > 0 ? 'flex' : 'none';
  if (liveGlass) liveGlass.textContent = fmt(glassSum);
  if (liveWorks) liveWorks.textContent = fmt(worksSum);
  if (liveAll)   liveAll.textContent   = fmt(totalAll);

  // Авторасчет статуса оплаты
  const debtInput = document.getElementById('f-debt');
  const paymentStatusSel = document.getElementById('f-payment-status');
  if (debtInput && paymentStatusSel) {
    const debtVal = Number(debtInput.value) || 0;
    paymentStatusSel.value = calcClientPaymentStatus(debtVal, totalAll);
  }
  syncClientLeftFromPayments(totalAll);

  // Авторасчет статуса поставщика
  const checkInput = document.getElementById('f-check');
  const supplierStatusSel = document.getElementById('f-supplier-status');
  if (checkInput && supplierStatusSel) {
    const checkVal = Number(checkInput.value) || 0;
    supplierStatusSel.value = calcSupplierPaymentStatus(checkVal, glassPurchase);
  }
  syncSupplierLeftFromPayments();

  recalcFullMargins();
}

function validateOrderRequiredFields(data) {
  const status = document.getElementById('f-order-status')?.value || '';
  const serviceTypeRequired = !data.onlySale && !canUseFullOrderForm(editingOrderId ? orders.find(o => o.id === editingOrderId) : null);
  const missing = [];

  if (status === '') {
    if (!data.phone) missing.push('номер телефона');
    if (!data.car) missing.push('автомобиль');
  }

  if (status === 'call') {
    if (!data.manager) missing.push('менеджер');
    if (!data.phone) missing.push('номер телефона');
    if (!data.car) missing.push('автомобиль');
    if (serviceTypeRequired && !data.serviceType) missing.push('тип услуги');
  }

  if (status === 'inWork') {
    if (!data.responsible) missing.push('ответственный');
    if (!data.assistant) missing.push('помощник');
    if (!data.phone) missing.push('номер телефона');
    if (!data.car) missing.push('автомобиль');
    if (!data.manager) missing.push('менеджер');
    if (serviceTypeRequired && !data.serviceType) missing.push('тип услуги');
  }

  if (status === 'ownWarehouse') {
    if (!data.phone) missing.push('номер телефона');
    if (!data.car) missing.push('автомобиль');
  }

  if (!missing.length) return true;
  alert('Заполните обязательные поля: ' + missing.join(', '));
  return false;
}

function validateCustomServiceMountAmount(data) {
  const serviceValue = data?.serviceType ?? document.getElementById('f-service-type')?.value ?? '';
  const hasCustom = typeof getOrderServiceSelections === 'function'
    ? getOrderServiceSelections(serviceValue).some(item => item.name === CUSTOM_SERVICE_TYPE_NAME)
    : String(serviceValue || '').includes(CUSTOM_SERVICE_TYPE_NAME);
  if (!hasCustom) return true;
  if ((Number(data?.mount) || 0) > 0) return true;
  alert('Сумма монтажа не заполнена');
  return false;
}

// ---------- СОХРАНЕНИЕ ----------
async function saveOrder() {
  const get  = id => document.getElementById(id)?.value?.trim() || '';
  const getN = id => _moneyInputValue(document.getElementById(id)?.value);

  const isNew = !editingOrderId;
  const existingOrder = isNew ? null : orders.find(o => o.id === editingOrderId);
  const canUseFullSave = canUseFullOrderForm(existingOrder);
  const reminderChecked = document.getElementById('f-reminder')?.checked || false;
  const reminderComment = (canCurrentUserUseOrderReminder() || canUseFullSave)
    ? (document.getElementById('f-reminder-comment')?.value || '')
    : getOrderReminderComment(existingOrder);
  const reminderPatch = buildOrderReminderPatch(existingOrder, reminderChecked, reminderComment);

  recalcMargin();

  const data = {
    id:              isNew ? generateOrderId() : editingOrderId,
    date:            get('f-date'),
    time:            get('f-time'),
    responsible:     get('f-responsible'),
    client:          get('f-client'),
    phone:           normalizeOrderPhoneValue(get('f-phone')),
    address:         get('f-address'),
    vin:             get('f-vin'),
    extraNote:       get('f-extra-note'),
    car:             get('f-car'),
    code:            get('f-code'),
    glassManufacturer: get('f-glass-manufacturer'),
    notes:           get('f-notes'),
    mount:           getN('f-mount'),
    serviceType:     get('f-service-type'),
    glass:           0,
    molding:         getN('f-molding'),
    extraWork:       getN('f-extra-work'),
    tatu:            getN('f-tatu'),
    toning:          getN('f-toning'),
    tatuStatus:      document.getElementById('f-tatu-status')?.checked || false,
    toningStatus:    document.getElementById('f-toning-status')?.checked || false,
    tatuResponsible: document.getElementById('f-tatu-responsible')?.value || '',
    toningResponsible: document.getElementById('f-toning-responsible')?.value || '',
    tatuDone:        document.getElementById('f-tatu-status')?.checked || false,
    tatuDoneBy:      document.getElementById('f-tatu-status')?.checked ? (existingOrder?.tatuDoneBy || document.getElementById('f-tatu-responsible')?.value || currentWorkerName || '') : '',
    toningDone:      document.getElementById('f-toning-status')?.checked || false,
    toningDoneBy:    document.getElementById('f-toning-status')?.checked ? (existingOrder?.toningDoneBy || document.getElementById('f-toning-responsible')?.value || currentWorkerName || '') : '',
    priorityTask:    canUseFullSave
      ? (document.getElementById('f-priority-task')?.checked || false)
      : !!existingOrder?.priorityTask,
    reminder:        reminderPatch.reminder,
    reminderWorkers: reminderPatch.reminderWorkers,
    reminderComment: reminderPatch.reminderComment,
    delivery:        getN('f-delivery'),
    warehouse:       get('f-warehouse'),
    warehouseCode:   get('f-warehouse-code'),
    newPost:         document.getElementById('f-new-post')?.checked || false,
    configuration:   get('f-configuration'),
    paymentStatus:   get('f-payment-status'),
    check:           getN('f-check'),
    debt:            getN('f-debt'),
    debtDate:        get('f-debt-date'),
    total:           getN('f-total'),
    supplierStatus:  get('f-supplier-status'),
    purchase:        getN('f-purchase'),
    income:          getN('f-income'),
    remainder:       getN('f-remainder'),
    paymentMethod:   normalizePaymentMethod(get('f-payment-method')),
    dropshipper:     get('f-dropshipper'),
    dropshipperPayout: getN('f-payout-dropshipper'),
    dropshipperPayments: existingOrder ? (existingOrder.dropshipperPayments || []) : [],
    statusDone:      existingOrder ? existingOrder.statusDone : false,
    inWork:          canUseFullSave
      ? (document.getElementById('f-order-status')?.value === 'inWork')
      : (existingOrder ? existingOrder.inWork : false),
    callStatus:      canUseFullSave
      ? (document.getElementById('f-order-status')?.value === 'call')
      : (existingOrder ? !!existingOrder.callStatus : false),
    ownWarehouse:    canUseFullSave
      ? (document.getElementById('f-order-status')?.value === 'ownWarehouse')
      : (existingOrder ? !!existingOrder.ownWarehouse : false),
    isCancelled:     canUseFullSave
      ? (document.getElementById('f-order-status')?.value === 'cancelled')
      : (existingOrder ? !!existingOrder.isCancelled : false),
    workerDone:      isNew ? false : (orders.find(x => x.id === editingOrderId)?.workerDone || false),
    assistant:       document.getElementById('f-assistant')?.value || '',
    extraAssistant:  document.getElementById('f-extra-assistant')?.value || '',
    manager:         document.getElementById('f-manager')?.value || '',
    priceLocked:     (currentRole === 'senior' && !canUseFullSave) ? true : (existingOrder ? existingOrder.priceLocked : false),
    toningExternal:  canUseFullSave ? (document.getElementById('f-toning-external')?.checked || false) : (existingOrder ? !!existingOrder.toningExternal : false),
    marginTotal:     getN('f-margin-total'),
    payoutDropshipper:     getN('f-payout-dropshipper'),
    payoutManagerGlass:    getN('f-payout-manager-glass'),
    payoutRespGlass:       getN('f-payout-resp-glass'),
    payoutLesha:           getN('f-payout-lesha'),
    payoutRoma:            getN('f-payout-roma'),
    payoutExtraResp:       getN('f-payout-extra-resp'),
    payoutExtraAssist:     getN('f-payout-extra-assist'),
    payoutMoldingResp:     getN('f-payout-molding-resp'),
    payoutMoldingAssist:   getN('f-payout-molding-assist'),
    onlySale:        document.getElementById('f-only-sale')?.checked || false,
    reworkData: {
      ...reminderPatch.reworkData,
      priorityTask: canUseFullSave
        ? (document.getElementById('f-priority-task')?.checked || false)
        : !!existingOrder?.priorityTask,
    },
    clientPayments: currentClientPayments,
    supplierPayments: currentSupplierPayments,
  };

  if (existingOrder?.date && data.date && existingOrder.date !== data.date) {
    const history = Array.isArray(data.reworkData?.rescheduleHistory)
      ? [...data.reworkData.rescheduleHistory]
      : [];
    history.push({
      from: existingOrder.date,
      to: data.date,
      changedAt: new Date().toISOString(),
      changedBy: currentWorkerName || currentRole || '',
    });
    data.reworkData.rescheduleHistory = history.slice(-30);
  }

  if (!validateOrderRequiredFields(data)) return;
  if (!validateCustomServiceMountAmount(data)) return;

  const saveBtn = document.getElementById('order-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i data-lucide="loader" style="width:14px;height:14px;"></i><span>Сохранение...</span>'; initIcons(); }

  const oldCheck = Number(existingOrder ? existingOrder.check : 0) || 0;
  const newCheck = Number(data.check) || 0;
  const oldSupplierPayments = existingOrder?.supplierPayments || [];
  const newSupplierPayments = data.supplierPayments || [];
  const hasSupplierPaymentHistory = oldSupplierPayments.length > 0 || newSupplierPayments.length > 0;
  const oldFinanciallyActive = existingOrder ? isOrderFinanciallyActive(existingOrder) : false;
  const newFinanciallyActive = isOrderFinanciallyActive(data);
  const oldCashSupplierPaid = oldFinanciallyActive ? (hasSupplierPaymentHistory ? sumCashSupplierPayments(oldSupplierPayments) : oldCheck) : 0;
  const newCashSupplierPaid = newFinanciallyActive ? (hasSupplierPaymentHistory ? sumCashSupplierPayments(newSupplierPayments) : newCheck) : 0;
  const cashSupplierDiff = newFinanciallyActive ? (newCashSupplierPaid - oldCashSupplierPaid) : 0;

  // Дельта наличных платежей от клиента (для зачисления в кассу мастера)
  const oldClientPayments = existingOrder?.clientPayments || [];
  const newClientPayments = data.clientPayments || [];
  const oldCashClientPaid = oldFinanciallyActive ? getCashClientPaidForOrderSnapshot({ ...existingOrder, clientPayments: oldClientPayments }) : 0;
  const newCashClientPaid = newFinanciallyActive ? getCashClientPaidForOrderSnapshot({ ...data, clientPayments: newClientPayments }) : 0;
  const cashClientDiff = newFinanciallyActive ? (newCashClientPaid - oldCashClientPaid) : 0;
  const cashEntries = [];

  try {
    const result = isNew
      ? await saveNewOrderWithNextIdOnConflict(
          data,
          async currentCashEntries => {
            return await sbSaveOrderWithCash(data, {
              isNew: true,
              cashEntries: currentCashEntries,
              rollbackOrder: existingOrder,
            });
          },
          { cashEntries }
        )
      : await sbSaveOrderWithCash(data, {
            isNew: false,
            cashEntries,
            rollbackOrder: existingOrder,
          });
    const saved = result.order;
    logFinanceDebug(isNew ? 'order create' : 'order save', result);

    await rememberCarDirectoryFromOrder(saved);
    try {
      await rememberAssistantForResponsible(data.responsible, data.assistant);
    } catch (e) {
      console.warn('Failed to remember assistant preference:', e);
    }
    try {
      await rememberClientAddressFromOrder(saved);
    } catch (e) {
      console.warn('Failed to remember client address:', e);
    }
    showToast(isNew ? 'Запись создана ✓' : 'Запись обновлена ✓');

    const savedCashEntries = result.cashEntries || [];
    if (savedCashEntries.length > 0 || cashSupplierDiff !== 0 || cashClientDiff !== 0) {
      await refreshCashStateAfterServerSave();
    }

    try {
      orders = await sbFetchOrders();
    } catch (refreshError) {
      console.warn('Failed to refresh orders after save:', refreshError);
      const fallbackIdx = orders.findIndex(o => o.id === saved.id);
      if (fallbackIdx !== -1) {
        orders[fallbackIdx] = { ...orders[fallbackIdx], ...saved };
      } else {
        orders.unshift(saved);
      }
    }

    closeOrderModal(true);
    if (typeof refreshActiveOrdersViews === 'function') {
      refreshActiveOrdersViews();
    } else {
      if (currentMonthFilter) {
        renderOrdersForMonth(currentMonthFilter);
      } else {
        renderMonths();
      }
      renderOrders();
      renderHome();
    }
  } catch (e) {
    showToast('Ошибка сохранения: ' + e.message, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i data-lucide="save" style="width:14px;height:14px;"></i><span id="order-save-label"></span>';
      updateOrderSaveButtonLabel();
      initIcons();
    }
  }
}

// ---------- ХЕЛПЕРЫ ----------
function statusBadge(status) {
  const map = {
    'Оплачено':           'status-paid',
    'Частично':  'status-partial',
    'Не оплачено':        'status-unpaid',
    'Долг':               'status-debt',
  };
  if (!status) return '';
  return `<span class="status-badge ${map[status] || ''}">${status}</span>`;
}

function mountBadge(mount) {
  const map = {
    'Выполнен':    'mount-done',
    'В процессе':  'mount-process',
    'Не выполнен': 'mount-not',
  };
  if (!mount) return '';
  return `<span class="mount-badge ${map[mount] || ''}">${mount}</span>`;
}

function field(label, value, cls = '') {
  const empty = !value || value === '0' || value === '' || value === 0;
  return `
    <div class="detail-item">
      <div class="detail-item-label">${label}</div>
      <div class="detail-item-value ${cls}" ${empty ? 'style="color:var(--text3);font-weight:400;"' : ''}>${empty ? '—' : value}</div>
    </div>
  `;
}

function phoneCallLink(phone) {
  if (!phone) return '';
  const raw = String(phone).trim();
  const tel = raw.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  if (!tel) return raw;
  return `<a class="detail-phone-link" href="tel:${tel}">${raw}</a>`;
}

function normalizeOrderPhoneValue(value) {
  const raw = String(value || '');
  const hasLeadingPlus = raw.trimStart().startsWith('+');
  const digits = raw.replace(/\D/g, '');
  return `${hasLeadingPlus ? '+' : ''}${digits}`;
}

function formatOrderPhoneInput(input) {
  if (!input) return;
  const raw = String(input.value || '');
  const cursor = Number.isFinite(input.selectionStart) ? input.selectionStart : raw.length;
  const formatted = normalizeOrderPhoneValue(raw);
  if (formatted === raw) return;
  const formattedBeforeCursor = normalizeOrderPhoneValue(raw.slice(0, cursor));
  input.value = formatted;
  const nextCursor = Math.min(formatted.length, formattedBeforeCursor.length);
  try { input.setSelectionRange(nextCursor, nextCursor); } catch (e) {}
}

function orderCardPhoneCallLink(phone) {
  if (!phone) return `${icon('phone')} —`;
  const raw = String(phone).trim();
  const tel = raw.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  if (!tel) return `${icon('phone')} ${escapeHtml(raw)}`;
  return `<a class="detail-phone-link" href="tel:${escapeAttr(tel)}" onclick="event.stopPropagation()">${icon('phone')} ${escapeHtml(raw)}</a>`;
}

function formatDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

function nowTimeStr() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':'
    + String(d.getMinutes()).padStart(2, '0');
}

// ---------- ЭКРАН МЕСЯЦЕВ ----------
const MONTH_NAMES_RU = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'
];

function renderYears() {
  const map = {};
  for (const o of orders) {
    if (isOrderDeleted(o)) continue;
    if (!o.date) continue;
    const year = o.date.slice(0, 4);
    if (!map[year]) map[year] = [];
    map[year].push(o);
  }

  const keys = Object.keys(map).sort((a, b) => b.localeCompare(a));
  const container = document.getElementById('years-list');
  container.className = 'list-cards';

  if (!keys.length) {
    const specialistTodayCard = renderSpecialistTodayYearCard();
    container.innerHTML = specialistTodayCard || `
      <div class="empty-state">
        <div class="empty-state-icon">${icon('calendar')}</div>
        <h3>Записей не найдено</h3>
      </div>`;
    return;
  }

  const specialistTodayCard = renderSpecialistTodayYearCard();
  container.innerHTML = specialistTodayCard + keys.map(year => {
    const list = map[year];
    const displayList = (currentRole === 'owner' || currentRole === 'manager') ? list : list.filter(o => o.inWork);
    const totalSum = list.filter(isOrderFinanciallyActive).reduce((s, o) => s + getOrderClientTotalAmount(o), 0);
    return `
      <div class="month-card" onclick="openYear('${year}')">
        <div>
          <div class="month-card-title">${year} год</div>
          <div class="month-card-sub">${displayList.length} зап.</div>
        </div>
        <div class="month-card-right">
          ${canViewFinance() ? `<div class="month-card-count">${totalSum.toLocaleString('ru')} ₴</div>` : `<div class="month-card-count">${displayList.length}</div>`}
          <div class="month-card-label">${canViewFinance() ? 'сумма' : 'записей'}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderSpecialistTodayYearCard() {
  if (currentRole === 'owner' || currentRole === 'manager') return '';

  const today = todayStr();
  const todayOrders = orders.filter(o =>
    _isCurrentWorkerOrder(o) &&
    o.inWork &&
    !o.isCancelled &&
    o.date === today
  );

  return `
    <div class="month-card month-card-accent" onclick="openSpecialistTodayOrders()">
      <div>
        <div class="month-card-title">Сегодня</div>
        <div class="month-card-sub">${formatDate(today)}</div>
      </div>
      <div class="month-card-right">
        <div class="month-card-count">${todayOrders.length}</div>
        <div class="month-card-label">зап.</div>
      </div>
    </div>
  `;
}

function openSpecialistTodayOrders() {
  currentMonthFilter = null;
  document.querySelector('#screen-orders .page-title').innerHTML = `${icon('clipboard-list')} Сегодняшние заказы`;
  initOrderTabs();
  currentWorkerTab = 'today';
  updateOrdersBackTopbar();
  renderOrders();
  showScreen('orders');
  setWorkerTab('today');
}

function openYear(year) {
  window.currentYearFilter = year;
  const titleEl = document.getElementById('months-page-title');
  if (titleEl) titleEl.textContent = `Записи за ${year} год`;
  renderMonths();
  setupMonthsActions();
  showScreen('months');
}

function renderMonths() {
  const map = {};
  for (const o of orders) {
    if (isOrderDeleted(o)) continue;
    if (!o.date) continue;
    const year = o.date.slice(0, 4);
    if (window.currentYearFilter && year !== window.currentYearFilter) continue;
    
    const ym = o.date.slice(0, 7);
    if (!map[ym]) map[ym] = [];
    map[ym].push(o);
  }

  const keys = Object.keys(map).sort((a, b) => b.localeCompare(a));
  const container = document.getElementById('months-list');
  container.className = 'list-cards';

  if (!keys.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icon('calendar')}</div>
        <h3>Записей не найдено</h3>
        <p>Попробуйте изменить фильтр</p>
      </div>`;
    return;
  }

  container.innerHTML = keys.map(ym => {
    const [year, month] = ym.split('-');
    const monthName = MONTH_NAMES_RU[parseInt(month) - 1];
    const list = map[ym];
    const displayList = (currentRole === 'owner' || currentRole === 'manager') ? list : list.filter(o => o.inWork);
    const totalSum = list.filter(isOrderFinanciallyActive).reduce((s, o) => s + getOrderClientTotalAmount(o), 0);
    return `
      <div class="month-card" onclick="openMonthOrders('${ym}')">
        <div>
          <div class="month-card-title">${monthName}</div>
          <div class="month-card-sub">${year} · ${displayList.length} зап.</div>
        </div>
        <div class="month-card-right">
          ${canViewFinance() ? `<div class="month-card-count">${totalSum.toLocaleString('ru')} ₴</div>` : `<div class="month-card-count">${displayList.length}</div>`}
          <div class="month-card-label">${canViewFinance() ? 'сумма' : 'записей'}</div>
        </div>
      </div>
    `;
  }).join('');
}

function openMonthOrders(ym) {
  currentMonthFilter = ym;
  const [year, month] = ym.split('-');
  const monthName = MONTH_NAMES_RU[parseInt(month) - 1];
  document.querySelector('#screen-orders .page-title').innerHTML = `${icon('clipboard-list')} ${monthName} ${year}`;
  initOrderTabs();
  setupOrderActions();
  renderOrdersForMonth(ym);
  showScreen('orders');
}

function renderOrdersForMonth(ym) {
  populateOrderWorkerFilter();
  updateOrderDateFilterButton();
  const search = document.getElementById('filter-search')?.value || '';
  const statF  = document.getElementById('filter-status')?.value || '';
  const workerF = document.getElementById('filter-worker')?.value || '';
  const sort   = document.getElementById('filter-sort')?.value || 'desc';

  let list = orders.filter(o => o.date && o.date.slice(0, 7) === ym);

  if (currentRole === 'owner' || currentRole === 'manager') {
    if (currentOrderTab === 'deleted') {
      list = list.filter(isOrderDeleted);
    } else if (currentOrderTab === 'all') {
      list = list.filter(o => !isOrderDeleted(o));
      // без дополнительной фильтрации
    } else if (currentOrderTab === 'planner') {
      list = list.filter(o => !isOrderDeleted(o) && o.inWork && !o.ownWarehouse && !o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'call') {
      list = list.filter(o => !isOrderDeleted(o)).filter(_isCallOrderVisibleInCurrentContext);
    } else if (currentOrderTab === 'ownWarehouse') {
      list = list.filter(o => !isOrderDeleted(o) && o.ownWarehouse && !o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'selection') {
      list = list.filter(o => !isOrderDeleted(o) && !o.callStatus && !o.inWork && !o.ownWarehouse && !o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'done') {
      list = list.filter(o => !isOrderDeleted(o) && o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'debt') {
      list = list.filter(orderHasDebtTabFinancialMeaning);
    } else if (currentOrderTab === 'cancelled') {
      list = list.filter(o => !isOrderDeleted(o) && o.isCancelled);
    }
  } else {
    list = _filterSpecialistOrdersByTab(list);
  }

  if (search) list = list.filter(o => orderMatchesSearch(o, search));
  if (orderDateFilterExact || orderDateFilterFrom || orderDateFilterTo) list = list.filter(orderMatchesDateFilter);
  if (statF) list = list.filter(o => getEffectivePaymentStatus(o) === statF);
  if (workerF) list = list.filter(o =>
    o.responsible === workerF
    || o.assistant === workerF
    || o.extraAssistant === workerF
    || o.manager === workerF
    || getOrderSpecialServiceAssignedWorker(o, 'tatu') === workerF
    || getOrderSpecialServiceAssignedWorker(o, 'toning') === workerF
  );
  list.sort((a, b) => compareOrdersForList(a, b, sort, currentRole !== 'owner' && currentRole !== 'manager'));

  const container = document.getElementById('orders-list');

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icon('clipboard-list')}</div>
        <h3>Записей нет</h3>
        <p>В этом месяце нет заказов</p>
      </div>`;
    return;
  }

  _renderOrdersList(container, list);
}

// ---------- WORKER DONE — СПЕЦИАЛИСТ ОТМЕЧАЕТ ВЫПОЛНЕНИЕ ----------

async function toggleWorkerDone(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o) return;
  const draftOrder = (editingOrderId === orderId && document.getElementById('order-modal')?.classList.contains('active'))
    ? getOrderDraftFromForm(o)
    : o;
  if (o.responsible !== currentWorkerName) return;
  if (!isOrderFinanciallyActive(draftOrder)) {
    showToast('Выполнить можно только заказ в работе', 'error');
    return;
  }
  if (o.workerDone) return;
  if (!draftOrder.onlySale && !String(draftOrder.serviceType || '').trim()) {
    alert('Услуги не выбраны, ЗП не начислится');
    return;
  }
  if (!confirm(`Отметить заказ ${o.id} выполненным? После этого будет начислена зарплата.`)) return;
  try {
    if (String(draftOrder.serviceType || '').trim() !== String(o.serviceType || '').trim()) {
      await sbPatchOrderFields(o.id, { service_type: String(draftOrder.serviceType || '').trim() || null });
    }
    const donePatch = {
      worker_done: true,
      rework_data: {
        ...(o.reworkData || {}),
        completedAt: new Date().toISOString(),
        completedBy: currentWorkerName || '',
      },
    };
    if (draftOrder.tatuStatus && canCurrentUserToggleSpecialServiceStatus(draftOrder, 'tatu')) {
      donePatch.tatu_status = true;
      donePatch.tatu_done = true;
      donePatch.tatu_done_by = draftOrder.tatuDoneBy || draftOrder.tatuResponsible || currentWorkerName || null;
    }
    if (draftOrder.toningStatus && canCurrentUserToggleSpecialServiceStatus(draftOrder, 'toning')) {
      donePatch.toning_status = true;
      donePatch.toning_done = true;
      donePatch.toning_done_by = draftOrder.toningDoneBy || draftOrder.toningResponsible || currentWorkerName || null;
    }
    await sbPatchOrderFields(o.id, donePatch);
    try {
      orders = await sbFetchOrders();
    } catch (refreshError) {
      console.warn('Failed to refresh orders after worker done update:', refreshError);
    }
    const refreshedOrder = orders.find(x => x.id === orderId) || { ...o, serviceType: draftOrder.serviceType, workerDone: true };
    await _upsertOrderSalaries(refreshedOrder);
    try {
      orders = await sbFetchOrders();
    } catch (refreshError) {
      console.warn('Failed to refresh orders after completion side effects:', refreshError);
    }
    currentMonthFilter ? renderOrdersForMonth(currentMonthFilter) : renderOrders();
    showToast('✓ Выполнено');
    if (document.getElementById('screen-profile')?.classList.contains('active')) {
      await loadWorkerSalaries();
      renderProfile();
    }
  } catch (e) {
    o.workerDone = false;
    showToast('Ошибка: ' + e.message, 'error');
  }
}

async function completeOrderFromModal() {
  if (!editingOrderId) return;
  await toggleWorkerDone(editingOrderId);
  const order = orders.find(item => item.id === editingOrderId);
  if (order?.workerDone) closeOrderModal(true);
}

// Начислить / удалить записи ЗП для всех участников заказа
async function _upsertOrderSalaries(order) {
  try {
    if (typeof sbFetchWorkers === 'function') {
      workers = await sbFetchWorkers();
    }
  } catch (e) {
    console.warn('Failed to refresh workers before salary sync:', e);
  }

  const amounts = {};
  const affectedWorkers = new Set();

  if (order.workerDone) {
    // 1. Основные участники
    [...new Set([order.responsible, order.assistant, order.extraAssistant].filter(Boolean))].forEach(w => {
      affectedWorkers.add(w);
      amounts[w] = (amounts[w] || 0) + calcOrderSalary(w, order);
    });

    // 2. Участники доработки
    if (order.reworkData) {
      [...new Set([order.reworkData.responsible, order.reworkData.assistant].filter(Boolean))].forEach(w => {
        affectedWorkers.add(w);
        amounts[w] = (amounts[w] || 0) + calcReworkSalary(w, order.reworkData);
      });
    }

    // 3. Менеджер — если указан в поле manager заказа и имеет systemRole === 'manager'
    const managerName = order.manager || '';
    if (managerName && workers.find(x => x.name === managerName && x.systemRole === 'manager')) {
      affectedWorkers.add(managerName);
      amounts[managerName] = (amounts[managerName] || 0) + _calcManagerSalary(order);
    }

    const tatuWorkerName = getOrderSpecialServiceAssignedWorker(order, 'tatu');
    const tatuAmount = _calcTatuBonus(tatuWorkerName, order);
    if (tatuAmount > 0) {
      affectedWorkers.add(tatuWorkerName);
      amounts[tatuWorkerName] = (amounts[tatuWorkerName] || 0) + tatuAmount;
    }

    const toningWorkerName = getOrderSpecialServiceAssignedWorker(order, 'toning');
    const toningAmount = _calcToningBonus(toningWorkerName, order);
    if (toningAmount > 0) {
      affectedWorkers.add(toningWorkerName);
      amounts[toningWorkerName] = (amounts[toningWorkerName] || 0) + toningAmount;
    }
  }

  // Всегда берём актуальные записи ЗП по этому заказу из БД
  let existingInDb = [];
  try {
    existingInDb = await sbFetchSalariesByOrder(order.id, { includeLegacySpecial: true }) || [];
  } catch (e) { /* если упало — продолжаем с пустым массивом */ }
  const legacySpecialEntriesInDb = existingInDb.filter(isLegacySpecialServiceSalaryEntry);
  for (const entry of legacySpecialEntriesInDb) {
    try {
      await sbDeleteWorkerSalary(entry.id);
    } catch (e) { /* не критично */ }
  }
  const automaticEntriesInDb = existingInDb.filter(entry => !isOwnerManualSalaryEntry(entry) && !isLegacySpecialServiceSalaryEntry(entry));

  // После первого выполнения заказа ЗП по этому order_id считается зафиксированной:
  // последующие правки сумм/полей заказа не должны менять уже начисленные записи.
  const salaryFrozen = order.workerDone && automaticEntriesInDb.length;
  if (salaryFrozen) {
    const missingWorkers = Object.keys(amounts).filter(workerName =>
      Number(amounts[workerName]) > 0 && !automaticEntriesInDb.some(entry => entry.worker_name === workerName)
    );
    for (const workerName of missingWorkers) {
      await sbInsertWorkerSalary({ worker_name: workerName, date: order.date, amount: amounts[workerName], order_id: order.id, entry_type: 'auto' });
      affectedWorkers.add(workerName);
    }
    if (typeof workerSalaries !== 'undefined') {
      try {
        workerSalaries = await sbFetchWorkerSalaries(currentWorkerName);
      } catch (e) { /* не критично */ }
    }
    return;
  }

  const workerNamesToProcess = new Set([...Object.keys(amounts), ...automaticEntriesInDb.map(s => s.worker_name)]);
  automaticEntriesInDb.forEach(s => affectedWorkers.add(s.worker_name));

  for (const workerName of workerNamesToProcess) {
    const amount = amounts[workerName] || 0;
    const existingEntry = automaticEntriesInDb.find(s => s.worker_name === workerName);

    if (amount > 0) {
      if (!existingEntry) {
        await sbInsertWorkerSalary({ worker_name: workerName, date: order.date, amount, order_id: order.id, entry_type: 'auto' });
      } else if (existingEntry.amount !== String(amount)) {
        await sbUpdateWorkerSalary(existingEntry.id, amount);
      }
    } else {
      if (existingEntry) {
        await sbDeleteWorkerSalary(existingEntry.id);
      }
    }
  }

  // Обновляем локальный массив workerSalaries (только для текущего пользователя)
  if (typeof workerSalaries !== 'undefined') {
    try {
      workerSalaries = await sbFetchWorkerSalaries(currentWorkerName);
    } catch (e) { /* не критично */ }
  }
}

// ---------- ТАБЫ ЗАКАЗОВ ----------

function initOrderTabs() {
  const tabsEl = document.getElementById('orders-tabs');
  const currentWorker = typeof getCurrentWorkerRecord === 'function' ? getCurrentWorkerRecord() : null;
  const currentName = currentWorker?.name || currentWorkerName;

  if (currentRole === 'owner' || currentRole === 'manager') {
  if (tabsEl) {
    tabsEl.style.display = 'flex';
    tabsEl.innerHTML = `
        <button class="orders-tab" id="tab-all" onclick="setOrderTab('all')">Все</button>
        <button class="orders-tab" id="tab-selection" onclick="setOrderTab('selection')">Подборка</button>
        <button class="orders-tab" id="tab-call"      onclick="setOrderTab('call')">Прозвон</button>
        <button class="orders-tab" id="tab-planner"   onclick="setOrderTab('planner')">Планёрка</button>
        <button class="orders-tab" id="tab-ownWarehouse" onclick="setOrderTab('ownWarehouse')">Наш склад</button>
        <button class="orders-tab" id="tab-done"      onclick="setOrderTab('done')">Выполненные</button>
        <button class="orders-tab" id="tab-debt"      onclick="setOrderTab('debt')">Долг</button>
        <button class="orders-tab" id="tab-cancelled" onclick="setOrderTab('cancelled')">Отмененные</button>
        <button class="orders-tab" id="tab-deleted" onclick="setOrderTab('deleted')">Удаленные</button>
      `;
    }
    setOrderTab('selection');
  } else {
    // Специалисты: только заказы из планёрки
    if (tabsEl) {
      tabsEl.style.display = 'flex';
      tabsEl.innerHTML = `
        <button class="orders-tab orders-tab-relevant active" id="tab-actual" onclick="setWorkerTab('actual')"><span class="tab-dot"></span> Актуальные</button>
        ${workerCanHandleSpecialService(currentWorker || currentName, 'tatu') ? '<button class="orders-tab" id="tab-tatu-actual" onclick="setWorkerTab(\'tatuActual\')">Тату актуальные</button><button class="orders-tab" id="tab-tatu-done" onclick="setWorkerTab(\'tatuDone\')">Тату выполненные</button>' : ''}
        ${workerCanHandleSpecialService(currentWorker || currentName, 'toning') ? '<button class="orders-tab" id="tab-toning-actual" onclick="setWorkerTab(\'toningActual\')">Тонировка актуальные</button><button class="orders-tab" id="tab-toning-done" onclick="setWorkerTab(\'toningDone\')">Тонировка выполненные</button>' : ''}
        <button class="orders-tab" id="tab-today" onclick="setWorkerTab('today')">Сегодняшние</button>
        <button class="orders-tab" id="tab-done-worker" onclick="setWorkerTab('done')">Выполненные</button>
        <button class="orders-tab" id="tab-future" onclick="setWorkerTab('future')">Будущие</button>
        <button class="orders-tab" id="tab-past" onclick="setWorkerTab('past')">Прошедшие</button>
        ${currentUserHasPermission('own_warehouse_view') ? '<button class="orders-tab" id="tab-own-warehouse-worker" onclick="setWorkerTab(\'ownWarehouse\')">Наш склад</button>' : ''}
        <button class="orders-tab" id="tab-my-all" onclick="setWorkerTab('all')">Все мои</button>
      `;
    }
    currentWorkerTab = 'actual';
    if (currentMonthFilter) {
      renderOrdersForMonth(currentMonthFilter);
    } else {
      renderOrders();
    }
  }
}

function setWorkerTab(tab) {
  currentWorkerTab = tab;
  document.querySelectorAll('.orders-tab').forEach(b => b.classList.remove('active'));
  const tabMap = {
    actual: 'tab-actual',
    today: 'tab-today',
    done: 'tab-done-worker',
    future: 'tab-future',
    past: 'tab-past',
    ownWarehouse: 'tab-own-warehouse-worker',
    tatuActual: 'tab-tatu-actual',
    tatuDone: 'tab-tatu-done',
    toningActual: 'tab-toning-actual',
    toningDone: 'tab-toning-done',
    all: 'tab-my-all',
  };
  const el = document.getElementById(tabMap[tab] || 'tab-my-all');
  if (el) el.classList.add('active');
  if (currentMonthFilter) {
    renderOrdersForMonth(currentMonthFilter);
  } else {
    renderOrders();
  }
}

function setOrderTab(tab) {
  currentOrderTab = tab;
  document.querySelectorAll('.orders-tab').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('tab-' + tab);
  if (el) el.classList.add('active');
  if (currentMonthFilter) {
    renderOrdersForMonth(currentMonthFilter);
  } else {
    renderOrders();
  }
}
// Полный пересчёт маржи и выплат
function recalcFullMargins() {
  const val = id => Number(document.getElementById(id)?.value) || 0;
  const incomeGlass   = val('f-income');
  const purchaseGlass = val('f-purchase');
  const moldingSum    = val('f-molding');
  const extraSum      = val('f-extra-work');
  const toningSum     = val('f-toning');
  const tatuSum       = val('f-tatu');
  const total         = val('f-total');
  const toningExternal = document.getElementById('f-toning-external')?.checked || false;
  const hasDropshipper = !!document.getElementById('f-dropshipper')?.value;

  const marginGlass = incomeGlass - purchaseGlass;
  const costMolding = moldingSum * 0.4;
  const costToning  = toningSum * 0.4;

  const payoutDropshipper = hasDropshipper ? marginGlass : 0;

  const managerValue = document.getElementById('f-manager')?.value || '';
  const managerRule = managerValue && typeof getSalaryRule === 'function' ? getSalaryRule(managerValue) : {};
  const payoutManagerGlass = !hasDropshipper && marginGlass > 0 ? Math.round(marginGlass * (managerRule.glassMarginPct || 0)) : 0;

  const responsibleName = document.getElementById('f-responsible')?.value || '';
  const responsibleRule = responsibleName && typeof getSalaryRule === 'function' ? getSalaryRule(responsibleName) : {};
  const payoutRespGlass = !hasDropshipper && marginGlass > 0 ? Math.round(marginGlass * (responsibleRule.glassMarginPct || 0)) : 0;

  const tatuResponsibleName = document.getElementById('f-tatu-responsible')?.value || '';
  const tatuRule = tatuResponsibleName && typeof getSalaryRule === 'function' ? getSalaryRule(tatuResponsibleName) : {};
  const payoutTatuSpecial = tatuSum > 0 ? Math.round(tatuSum * (tatuRule.tatuBonusPct || 0)) : 0;

  const toningResponsibleName = document.getElementById('f-toning-responsible')?.value || '';
  const toningRule = toningResponsibleName && typeof getSalaryRule === 'function' ? getSalaryRule(toningResponsibleName) : {};
  const payoutToningSpecial = (!toningExternal && toningSum > 0) ? Math.round(toningSum * (toningRule.toningBonusPct || 0)) : 0;
  const payoutExtraResp   = Math.round(extraSum * 0.20);
  const payoutExtraAssist = Math.round(extraSum * 0.20);
  const payoutMoldingResp   = Math.round(moldingSum * 0.20);
  const payoutMoldingAssist = Math.round(moldingSum * 0.20);

  const costs = purchaseGlass + costMolding + costToning;
  const payouts = payoutDropshipper + payoutManagerGlass + payoutRespGlass + payoutToningSpecial + payoutTatuSpecial +
                  payoutExtraResp + payoutExtraAssist + payoutMoldingResp + payoutMoldingAssist;

  const marginTotal = total - costs - payouts;

  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = Math.round(v); };
  setVal('f-remainder',           marginGlass);
  setVal('f-margin-total',        marginTotal);
  setVal('f-payout-dropshipper',  payoutDropshipper);
  setVal('f-payout-manager-glass',payoutManagerGlass);
  setVal('f-payout-resp-glass',   payoutRespGlass);
  setVal('f-payout-lesha',        0);
  setVal('f-payout-roma',         0);
  setVal('f-payout-extra-resp',   payoutExtraResp);
  setVal('f-payout-extra-assist', payoutExtraAssist);
  setVal('f-payout-molding-resp', payoutMoldingResp);
  setVal('f-payout-molding-assist',payoutMoldingAssist);
  renderOrderSummary(editingOrderId ? orders.find(item => item.id === editingOrderId) : null);
}

// синхронизация чекбоксов услуг с hidden-полем
function syncServiceTypes(changedEl = null, recalc = true) {
  const box = document.querySelectorAll('#service-type-checkboxes input[type="checkbox"]');
  const isQtyInputChange = changedEl?.matches?.('[data-form-service-qty]');
  const changedName = changedEl?.getAttribute?.('data-form-service-qty')
    || (changedEl?.matches?.('input[type="checkbox"]') ? changedEl.value : '')
    || '';
  const changedCheckbox = changedEl?.matches?.('input[type="checkbox"]')
    ? changedEl
    : [...box].find(el => el.value === changedName);
  if (changedName === CUSTOM_SERVICE_TYPE_NAME && changedCheckbox?.checked) {
    box.forEach(el => {
      if (el !== changedCheckbox) el.checked = false;
      if (el !== changedCheckbox) {
        const qtyInput = getOrderFormServiceQtyInput(el.value);
        if (qtyInput) qtyInput.value = '0';
      }
    });
  } else if (changedCheckbox?.checked) {
    box.forEach(el => {
      if (el.value === CUSTOM_SERVICE_TYPE_NAME) {
        el.checked = false;
        const qtyInput = getOrderFormServiceQtyInput(el.value);
        if (qtyInput) qtyInput.value = '0';
      }
    });
  }
  const changedQtyInput = changedName ? getOrderFormServiceQtyInput(changedName) : null;
  if (isQtyInputChange && changedQtyInput) {
    changedQtyInput.value = sanitizeServiceQtyValue(changedEl.value);
  }
  if (changedCheckbox && isQtyInputChange) {
    changedCheckbox.checked = Number(changedQtyInput?.value || 0) > 0;
  }
  if (!isQtyInputChange && changedCheckbox?.checked && changedQtyInput && Number(changedQtyInput.value) < 1) {
    changedQtyInput.value = '1';
  }
  if (changedCheckbox && !changedCheckbox.checked) {
    if (changedQtyInput) changedQtyInput.value = isQtyInputChange ? '' : '0';
  }
  const vals = [...box]
    .filter(el => el.checked)
    .map(el => {
      const qtyInput = getOrderFormServiceQtyInput(el.value);
      return { name: el.value, qty: Math.max(1, Number(qtyInput?.value) || 1) };
    });
  const hidden = document.getElementById('f-service-type');
  if (hidden) hidden.value = serializeOrderServiceSelections(vals);
  if (recalc) recalcTotal();
  renderOrderSummary(editingOrderId ? orders.find(item => item.id === editingOrderId) : null);
}

function normalizeOrderFormServiceQtyInput(name) {
  const input = getOrderFormServiceQtyInput(name);
  if (!input) return;
  input.value = sanitizeServiceQtyValue(input.value) || '0';
  syncServiceTypes(input, false);
}

let _orderVinDecodeTimer = null;

function initOrderVinDecoder() {
  const vinInput = document.getElementById('f-vin');
  if (!vinInput || vinInput.dataset.vinDecoderBound === '1') return;
  vinInput.dataset.vinDecoderBound = '1';
  vinInput.addEventListener('input', () => {
    const vin = vinInput.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    vinInput.value = vin;
    clearTimeout(_orderVinDecodeTimer);
    setOrderVinTooltip(vin ? 'Введите 17 символов VIN' : '', 'hint');
    if (vin.length === 17) {
      setOrderVinTooltip('Декодируем VIN...', 'loading');
      _orderVinDecodeTimer = setTimeout(() => decodeOrderVin(vin), 450);
    }
  });
}

async function decodeOrderVin(vin) {
  try {
    const data = typeof decodeVinNHTSA === 'function'
      ? await decodeVinNHTSA(vin)
      : await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${vin}?format=json`)
          .then(res => res.json())
          .then(body => {
            const get = name => body.Results?.find(r => r.Variable === name)?.Value || '';
            return { make: get('Make'), model: get('Model'), year: get('Model Year'), body: get('Body Class') || get('Vehicle Type') };
          });
    const make = data?.make || '—';
    const model = data?.model || '—';
    const year = data?.year || (typeof decodeYearFromVin === 'function' ? decodeYearFromVin(vin[9]) : '') || '—';
    const body = data?.body ? (typeof mapBodyType === 'function' ? (mapBodyType(data.body) || data.body) : data.body) : '—';
    const hasData = [make, model, year, body].some(value => value && value !== '—');
    if (hasData) {
      setOrderVinTooltip(`Марка: ${make} · Модель: ${model} · Кузов: ${body} · Год: ${year}`, 'ok');
    } else {
      setOrderVinTooltip('Данные по VIN не найдены', 'error');
    }
  } catch (e) {
    setOrderVinTooltip('Не удалось декодировать VIN', 'error');
  }
}

function setOrderVinTooltip(text, type = 'hint') {
  let el = document.getElementById('order-vin-tooltip');
  const vinInput = document.getElementById('f-vin');
  if (!vinInput) return;
  if (!el) {
    el = document.createElement('div');
    el.id = 'order-vin-tooltip';
    el.className = 'vin-status';
    vinInput.parentElement.appendChild(el);
  }
  if (!text) {
    el.remove();
    return;
  }
  el.className = `vin-status vin-${type}`;
  el.textContent = text;
}

// ============================================================
// AUTOCOMPLETE ENGINE — клиент и авто
// ============================================================

const _ac = {
  client: { activeIdx: -1 },
  phone:  { activeIdx: -1 },
  car:    { activeIdx: -1 },
  code:   { activeIdx: -1 },
};

// Подсвечивает совпадающую часть строки
function acHighlight(str, query) {
  if (!query) return escapeHtml(str);
  const idx = str.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escapeHtml(str);
  return escapeHtml(str.slice(0, idx))
    + '<span class="ac-item-match">' + escapeHtml(str.slice(idx, idx + query.length)) + '</span>'
    + escapeHtml(str.slice(idx + query.length));
}

function acGetItems(type, query) {
  const q = (query || '').trim().toLowerCase();
  if (type === 'client') {
    const clients = getClients();
    return clients
      .filter(c => {
        if (!q) return true;
        const name = (c.name || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        const phoneDigits = phone.replace(/\D/g, '');
        const queryDigits = q.replace(/\D/g, '');
        return name.includes(q)
          || phone.includes(q)
          || (!!queryDigits && phoneDigits.includes(queryDigits));
      })
      .slice(0, 40)
      .map(c => ({
        label:   c.name,
        sub:     c.phone || '',
        value:   c.name,
        client:  c,
      }));
  }
  if (type === 'phone') {
    const clients = getClients();
    const queryDigits = q.replace(/\D/g, '');
    return clients
      .filter(c => {
        if (!q) return true;
        const name = (c.name || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        const phoneDigits = phone.replace(/\D/g, '');
        return phone.includes(q)
          || name.includes(q)
          || (!!queryDigits && phoneDigits.includes(queryDigits));
      })
      .slice(0, 40)
      .map(c => ({
        label:   c.phone || '—',
        sub:     c.name || '',
        value:   c.phone || '',
        client:  c,
      }));
  }
  if (type === 'car') {
    const cars = refCars || [];
    const words = q.split(/\s+/).filter(Boolean);
    return cars
      .filter(c => {
        if (!q) return true;
        const haystack = [
          c.model || '',
          c.eurocode || '',
        ].join(' ').toLowerCase();
        return words.every(word => haystack.includes(word));
      })
      .slice(0, 40)
      .map(c => ({
        label:   c.model,
        sub:     c.eurocode ? 'Еврокод: ' + c.eurocode : '',
        value:   c.model,
        car:     c,
      }));
  }
  if (type === 'code') {
    const cars = (refCars || []).filter(c => c.eurocode);
    return cars
      .filter(c => !q || c.eurocode.toLowerCase().startsWith(q))
      .slice(0, 40)
      .map(c => ({
        label: c.eurocode,
        sub:   c.model,
        value: c.eurocode,
        car:   c,
      }));
  }
  return [];
}

function acRender(type, query) {
  const listEl = document.getElementById('ac-' + type + '-list');
  if (!listEl) return;
  const items = acGetItems(type, query);
  _ac[type].activeIdx = -1;

  if (!items.length) {
    listEl.innerHTML = '<div class="ac-empty">Ничего не найдено</div>';
    return;
  }

  listEl.innerHTML = items.map((item, i) => `
    <div class="ac-item" data-idx="${i}"
      onmousedown="acSelect('${type}', ${i})"
      onmouseover="acSetActive('${type}', ${i})">
      <div class="ac-item-name">${acHighlight(item.label, query)}</div>
      ${item.sub ? `<div class="ac-item-sub">${escapeHtml(item.sub)}</div>` : ''}
    </div>
  `).join('');

  // Сохраняем items для выбора по индексу
  _ac[type]._items = items;
}

function acOpen(type) {
  const input  = document.getElementById('f-' + type);
  const listEl = document.getElementById('ac-' + type + '-list');
  if (!input || !listEl) return;
  acRender(type, input.value);
  listEl.classList.add('open');
}

function onCarInputChange(rawValue) {
  const value = String(rawValue || '').trim().toLowerCase();
  const codeEl = document.getElementById('f-code');
  if (!codeEl) return;
  if (!value) {
    codeEl.value = '';
    return;
  }
  const exact = (refCars || []).find(car => String(car?.model || '').trim().toLowerCase() === value);
  codeEl.value = exact?.eurocode || '';
}

function onCodeInputChange(rawValue) {
  const value = String(rawValue || '').trim().toLowerCase();
  const carEl = document.getElementById('f-car');
  if (!carEl) return;
  if (!value) {
    carEl.value = '';
    return;
  }
  const exact = (refCars || []).find(car => String(car?.eurocode || '').trim().toLowerCase() === value);
  carEl.value = exact?.model || '';
}

function acFilter(type) {
  const input  = document.getElementById('f-' + type);
  const listEl = document.getElementById('ac-' + type + '-list');
  if (!input || !listEl) return;
  acRender(type, input.value);
  listEl.classList.add('open');
  // Для авто — пробуем заполнить еврокод при точном совпадении
  if (type === 'car') onCarInputChange(input.value);
  // Для кода — пробуем заполнить авто при точном совпадении
  if (type === 'code') onCodeInputChange(input.value);
}

function acBlur(type) {
  // Задержка чтобы onmousedown на item успел сработать раньше blur
  setTimeout(() => {
    const listEl = document.getElementById('ac-' + type + '-list');
    if (listEl) listEl.classList.remove('open');
    _ac[type].activeIdx = -1;
  }, 180);
}

function acSetActive(type, idx) {
  _ac[type].activeIdx = idx;
  const items = document.querySelectorAll('#ac-' + type + '-list .ac-item');
  items.forEach((el, i) => el.classList.toggle('ac-active', i === idx));
}

function acKey(event, type) {
  const listEl = document.getElementById('ac-' + type + '-list');
  if (!listEl || !listEl.classList.contains('open')) return;

  const items = listEl.querySelectorAll('.ac-item');
  let idx = _ac[type].activeIdx;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    idx = Math.min(idx + 1, items.length - 1);
    acSetActive(type, idx);
    items[idx]?.scrollIntoView({ block: 'nearest' });
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    idx = Math.max(idx - 1, 0);
    acSetActive(type, idx);
    items[idx]?.scrollIntoView({ block: 'nearest' });
  } else if (event.key === 'Enter') {
    if (idx >= 0) {
      event.preventDefault();
      acSelect(type, idx);
    }
  } else if (event.key === 'Escape') {
    listEl.classList.remove('open');
  }
}

function acSelect(type, idx) {
  const item = (_ac[type]._items || [])[idx];
  if (!item) return;

  if (type === 'client' || type === 'phone') {
    const input = document.getElementById('f-client');
    if (input) input.value = item.client?.name || item.value;

    // Автозаполнение телефона
    const phoneEl = document.getElementById('f-phone');
    if (phoneEl && item.client?.phone) phoneEl.value = normalizeOrderPhoneValue(item.client.phone);

    const addressEl = document.getElementById('f-address');
    if (addressEl && item.client?.address) addressEl.value = item.client.address;
  }

  if (type === 'car') {
    const input = document.getElementById('f-car');
    if (input) input.value = item.value;

    // Автозаполнение еврокода из справочника
    const codeEl = document.getElementById('f-code');
    if (codeEl) codeEl.value = item.car?.eurocode || '';
  }

  if (type === 'code') {
    const input = document.getElementById('f-code');
    if (input) input.value = item.value;

    // Обратное заполнение: еврокод → авто
    const carEl = document.getElementById('f-car');
    if (carEl && item.car?.model) carEl.value = item.car.model;
  }

  // Закрываем список
  const listEl = document.getElementById('ac-' + type + '-list');
  if (listEl) listEl.classList.remove('open');
  _ac[type].activeIdx = -1;
}
