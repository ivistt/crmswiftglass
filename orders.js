// ============================================================
// ORDERS.JS — список заказов, детали, модал создания/редактирования
// ============================================================

let editingOrderId  = null;      // null = новый, иначе id редактируемого
let currentOrderTab = 'selection';  // 'selection' | 'call' | 'planner' | 'done' — для owner/manager
let currentWorkerTab = 'actual'; // 'actual' | 'today' | 'done' | 'future' | 'past' | 'all' — для специалистов
let ordersFiltersOpen = false;
let currentOrderDetailId = null;
let orderDateFilterExact = '';
let orderDateFilterFrom = '';
let orderDateFilterTo = '';
const deletingOrderIds = new Set();
const SERVICE_TYPE_OPTIONS = [
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
  { group: 'Нестандартные работы', name: 'Нестандартные работы', rate: 0, salaryCategory: 'custom' },
];
const CUSTOM_SERVICE_TYPE_NAME = 'Нестандартные работы';
const GLASS_MANUFACTURERS = [
  {
    name: '🇨🇳 XYG (Китай)',
    description: 'Средний сегмент (хороший аналог)\nГеометрия уступает европейским производителям\nМассово используется на рынке',
  },
  {
    name: '🇨🇳 BENSON (Китай)',
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
];
const GLASS_MANUFACTURER_BY_NAME = Object.fromEntries(GLASS_MANUFACTURERS.map(item => [item.name, item]));

const STATIC_MANAGER_OPTIONS = [
  { name: 'Maksim', label: '🦊 Макс' },
];
const SERVICE_TYPE_BY_NAME = Object.fromEntries(SERVICE_TYPE_OPTIONS.map(item => [item.name, item]));

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
  return currentUserCanActAsSenior();
}

function canQuickConfirmOrderAmounts(order) {
  return currentUserCanActAsSenior()
    && order?.responsible === currentWorkerName
    && isOrderFinanciallyActive(order)
    && !order?.workerDone;
}

function canCurrentUserOpenOrderModal(order) {
  if (currentRole === 'junior') return false;
  if (currentRole === 'owner' || currentRole === 'manager') return true;
  return currentUserCanActAsSenior();
}

function canCurrentUserManageOrderPayments(order) {
  if (!order && editingOrderId !== null) {
    order = getOrderDraftFromForm(editingOrderId ? orders.find(item => item.id === editingOrderId) : null);
  }
  if (!order) return currentRole === 'owner' || currentRole === 'manager';
  if (currentRole === 'owner' || currentRole === 'manager') return true;
  return currentUserCanActAsSenior() && order.responsible === currentWorkerName;
}

function canCurrentUserEditOrderServices(order) {
  if (currentRole === 'owner' || currentRole === 'manager') return true;
  if (!order || !currentUserCanActAsSenior()) return false;
  if (order.responsible !== currentWorkerName) return false;
  return !String(order.serviceType || '').trim();
}

function canCurrentUserCompleteOrder(order) {
  return currentUserCanActAsSenior()
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
  return Number(value) || 0;
}

function _escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getGlassManufacturerCopyText(name) {
  const manufacturer = GLASS_MANUFACTURER_BY_NAME[name];
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
  return calcClientPaymentStatus(Number(order?.debt) || 0, getOrderClientTotal(order));
}

function getEffectiveSupplierStatus(order) {
  return calcSupplierPaymentStatus(Number(order?.check) || 0, Number(order?.purchase) || 0);
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

  if (newSupplierPaymentAmount > 0) {
    nextSupplierPayments.push({
      amount: newSupplierPaymentAmount,
      date: todayStr(),
      method: quickPaymentMethod,
      timestamp: new Date().toISOString(),
    });
  }

  if (newClientPaymentAmount > 0) {
    nextClientPayments.push({
      amount: newClientPaymentAmount,
      date: todayStr(),
      method: quickPaymentMethod,
      timestamp: new Date().toISOString(),
    });
  }

  const totalSupplierPaid = nextSupplierPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalClientPaid = nextClientPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const checkDiff = totalSupplierPaid - oldCheck;
  const oldClientPaid = Number(order.debt) || 0;
  const clientDiff = totalClientPaid - oldClientPaid;
  const cashEntries = [];
  const totalClientAmount = (Number(order.total) || 0) + (Number(order.income) || 0) + (Number(order.delivery) || 0);
  const updatedOrder = {
    ...order,
    check: totalSupplierPaid,
    debt: totalClientPaid,
    paymentStatus: calcClientPaymentStatus(totalClientPaid, totalClientAmount),
    supplierStatus: calcSupplierPaymentStatus(totalSupplierPaid, order.purchase),
    clientPayments: nextClientPayments,
    supplierPayments: nextSupplierPayments,
  };

  if (isOrderFinanciallyActive(updatedOrder) && checkDiff !== 0) {
    const amount = -checkDiff;
    const typeStr = checkDiff > 0 ? 'Списание' : 'Возврат';
    const fDate = updatedOrder.date ? formatDate(updatedOrder.date) : '—';
    const fTime = updatedOrder.time || '—';
    const fCar = updatedOrder.car || '—';
    const targetWorker = updatedOrder.responsible || currentWorkerName;
    cashEntries.push({
      worker_name: targetWorker,
      amount,
      comment: `${typeStr} за стекло ${updatedOrder.id}, ${fDate} ${fTime}, авто: ${fCar}, склад: ${updatedOrder.warehouse || '—'}`,
      cashType: 'supplier',
    });
  }

  if (isOrderFinanciallyActive(updatedOrder) && clientDiff !== 0) {
    const typeStr = clientDiff > 0 ? 'Оплата клиента' : 'Возврат клиенту';
    const fDate = updatedOrder.date ? formatDate(updatedOrder.date) : '—';
    const fCar = updatedOrder.car || '—';
    const targetWorker = updatedOrder.responsible || currentWorkerName;
    cashEntries.push({
      worker_name: targetWorker,
      amount: clientDiff,
      comment: `${typeStr} наличкой ${updatedOrder.id}, ${fDate}, авто: ${fCar}`,
      cashType: 'client',
    });
  }

  if (btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = 'Сохранение...';
  }

  try {
    const saved = await sbPatchOrderFields(orderId, {
      debt: totalClientPaid,
      check_sum: totalSupplierPaid,
      client_payments: nextClientPayments,
      supplier_payments: nextSupplierPayments,
    });
    const mergedOrder = { ...updatedOrder, ...saved, clientPayments: nextClientPayments, supplierPayments: nextSupplierPayments };
    const idx = orders.findIndex(x => x.id === orderId);
    if (idx !== -1) orders[idx] = mergedOrder;

    if (checkEl) checkEl.value = '';
    if (debtEl) debtEl.value = '';

    for (const rawCashEntry of cashEntries) {
      const cashEntry = await sbInsertCashEntry({
        worker_name: rawCashEntry.worker_name,
        amount: rawCashEntry.amount,
        comment: rawCashEntry.comment,
        cash_account: 'cash',
      });
      const targetWorker = cashEntry?.worker_name;
      if (typeof workerCashLog !== 'undefined' && targetWorker === currentWorkerName) {
        workerCashLog.unshift(cashEntry);
      }
      if (currentRole === 'owner' && Array.isArray(window.allCashLog) && cashEntry) {
        window.allCashLog.unshift(cashEntry);
      }
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
  if (canCreateOrder()) {
    el.innerHTML = `<button class="btn-primary" onclick="openOrderModal(null)">+ Добавить запись</button>`;
  } else {
    el.innerHTML = '';
  }
}

function updateOrdersBackTopbar() {
  const topbar = document.getElementById('orders-back-topbar');
  const label = document.getElementById('orders-back-label');
  if (!topbar || !label) return;

  const isSpecialist = currentRole !== 'owner' && currentRole !== 'manager';
  const shouldShow = Boolean(currentMonthFilter) || isSpecialist;
  topbar.style.display = 'flex';
  topbar.classList.toggle('orders-topbar-without-back', !shouldShow);
  label.textContent = 'Назад';
  const backBtn = topbar.querySelector('.back-btn:not(.orders-filter-toggle)');
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

  goHome();
}

// ---------- РЕНДЕР КАРТОЧКИ ЗАКАЗА ----------
function renderOrderCard(o) {
  const canOpenModal = canCurrentUserOpenOrderModal(o);
  const cardClickAction = canOpenModal ? `openOrderModal('${escapeAttr(o.id)}')` : '';
  const primaryTitle = o.client || '—';
  const clientTotal = getOrderClientTotal(o);
  const clientPaidInlineHtml = clientTotal > 0
    ? `<span class="order-meta-inline-money" title="Клиент оплатил / общая сумма заказа"><span>${(Number(o.debt) || 0).toLocaleString('ru')}</span><span class="order-meta-money-separator">/</span><span>${clientTotal.toLocaleString('ru')} ₴</span></span>`
    : '';
  const supplierPaidInlineHtml = (Number(o.check) > 0 || Number(o.purchase) > 0)
    ? `<span class="order-meta-inline-money"><span>${(Number(o.check) || 0).toLocaleString('ru')}</span><span class="order-meta-money-separator">/</span><span>${(Number(o.purchase) || 0).toLocaleString('ru')} ₴</span></span>`
    : '';
  const warehouseCodeInlineHtml = (currentRole === 'owner' || currentWorkerName === 'Sasha Manager') && o.warehouseCode
    ? `<span style="margin-left:6px;color:var(--accent);font-weight:900;">${escapeHtml(o.warehouseCode)}</span>`
    : '';
  const warehousePillHtml = (o.warehouse || warehouseCodeInlineHtml || supplierPaidInlineHtml)
    ? `<span class="order-meta-item order-meta-pill">${escapeHtml(o.warehouse || 'Склад —')}${warehouseCodeInlineHtml}${supplierPaidInlineHtml}</span>`
    : '';
  const servicesHtml = renderOrderCardServices(o);
  const callNotesHtml = renderOrderCardCallNotes(o);
  const managerMetaHtml = renderManagerOrderCardMeta(o);
  const specialistBonusFlags = [
    currentWorkerName === 'Roma' && Number(o.tatu) > 0
      ? `<span class="status-badge status-call" title="В заказе есть тату">Тату ${(Number(o.tatu) || 0).toLocaleString('ru')} ₴</span>`
      : '',
    currentWorkerName === 'Lyosha' && Number(o.toning) > 0
      ? `<span class="status-badge status-own-warehouse" title="В заказе есть тонировка">Тонировка ${(Number(o.toning) || 0).toLocaleString('ru')} ₴</span>`
      : '',
  ].filter(Boolean).join('');
  return `
    <div class="order-card ${getOrderCardStateClass(o)}" ${canOpenModal ? `onclick="${cardClickAction}" style="cursor:pointer;"` : 'style="cursor:default;"'}>
      <div class="order-card-top">
        <div class="order-card-left">
          <div class="order-card-status-row">
            <span class="order-id">${o.id}</span>
            ${renderOrderStatusBadges(o)}
            ${specialistBonusFlags}
          </div>
          <div class="order-card-title-row">
            <span class="order-name">${primaryTitle}</span>
            ${currentRole === 'manager' ? clientPaidInlineHtml : ''}
          </div>
        </div>
      </div>
      ${currentRole === 'manager' ? managerMetaHtml : `
      <div class="order-card-meta">
        <span class="order-meta-item order-meta-pill order-meta-client-pill">${icon('car')} <span class="order-meta-client-name">${o.car || '—'}</span></span>
        <span class="order-meta-item order-meta-pill">${icon('phone')} ${o.phone || '—'}</span>
        <span class="order-meta-item order-meta-pill">${icon('calendar')} ${formatDate(o.date)}</span>
        <span class="order-meta-item order-meta-pill">${getWorkerDisplayPair(o.responsible, o.assistant)}</span>
        ${o.manager ? `<span class="order-meta-item order-meta-pill">${getWorkerDisplayName(o.manager)}</span>` : ''}
        ${warehousePillHtml}
      </div>`}
      ${servicesHtml}
      ${callNotesHtml}
    </div>
  `;
}

function renderManagerOrderCardMeta(order) {
  if (currentRole !== 'manager' || !order) return '';
  const clientTotal = getOrderClientTotal(order);
  const clientPaidInlineHtml = clientTotal > 0
    ? `<span class="order-meta-inline-money" title="Клиент оплатил / общая сумма заказа"><span>${(Number(order.debt) || 0).toLocaleString('ru')}</span><span class="order-meta-money-separator">/</span><span>${clientTotal.toLocaleString('ru')} ₴</span></span>`
    : '';
  const supplierPaidInlineHtml = (Number(order.check) > 0 || Number(order.purchase) > 0)
    ? `<span class="order-meta-inline-money"><span>${(Number(order.check) || 0).toLocaleString('ru')}</span><span class="order-meta-money-separator">/</span><span>${(Number(order.purchase) || 0).toLocaleString('ru')} ₴</span></span>`
    : '';
  const warehouseCodeInlineHtml = order.warehouseCode
    ? `<span style="margin-left:6px;color:var(--accent);font-weight:900;">${escapeHtml(order.warehouseCode)}</span>`
    : '';
  const groups = [
    [
      { iconLabel: icon('car'), value: order.car || '—' },
      { iconLabel: icon('phone'), value: order.phone || '—' },
      { iconLabel: icon('calendar'), value: formatDate(order.date) },
      { iconLabel: icon('users'), value: getWorkerDisplayPair(order.responsible, order.assistant) || '—' },
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

function renderOrderCardServices(order) {
  if (currentRole !== 'owner' && currentRole !== 'manager') return '';
  const services = getOrderServiceSelections(order?.serviceType);
  if (!services.length) return '';
  return '<div class="order-card-services">'
    + services.map(item => `<span class="order-service-pill">${escapeHtml(formatOrderServiceLabel(item.name, item.qty))}</span>`).join('')
    + '</div>';
}

function renderOrderCardCallNotes(order) {
  if (currentRole !== 'owner' && currentRole !== 'manager') return '';
  if (currentRole === 'manager') return '';
  if (!order?.notes) return '';
  if (!order?.callStatus) return '';
  return `<div class="order-card-note">${escapeHtml(order.notes)}</div>`;
}

function getSpecialServiceAction(order) {
  if (!order || !isOrderFinanciallyActive(order)) return null;
  if (currentWorkerName === 'Roma' && Number(order.tatu) > 0 && !order.tatuDone) {
    return { type: 'tatu', label: 'Выполнить тату', title: 'Подтвердить выполнение тату' };
  }
  if (currentWorkerName === 'Lyosha' && Number(order.toning) > 0 && !order.toningDone && !order.toningExternal) {
    return { type: 'toning', label: 'Выполнить тонировку', title: 'Подтвердить выполнение тонировки' };
  }
  return null;
}

async function confirmSpecialServiceDone(orderId, type) {
  const order = orders.find(item => item.id === orderId);
  if (!order) return;
  const isTatu = type === 'tatu';
  const label = isTatu ? 'тату' : 'тонировку';
  if (!confirm(`Отметить ${label} выполненной по заказу ${order.id}? После этого начислится ЗП.`)) return;

  try {
    const patch = isTatu ? { tatu_done: true } : { toning_done: true };
    const saved = await sbPatchOrderFields(order.id, patch);
    const idx = orders.findIndex(item => item.id === order.id);
    const updated = {
      ...order,
      ...saved,
      tatuDone: isTatu ? true : (saved?.tatuDone ?? order.tatuDone),
      tatuDoneBy: isTatu ? currentWorkerName : (saved?.tatuDoneBy ?? order.tatuDoneBy),
      toningDone: !isTatu ? true : (saved?.toningDone ?? order.toningDone),
      toningDoneBy: !isTatu ? currentWorkerName : (saved?.toningDoneBy ?? order.toningDoneBy),
    };
    if (idx !== -1) orders[idx] = updated;
    await _upsertOrderSalaries(updated);
    currentMonthFilter ? renderOrdersForMonth(currentMonthFilter) : renderOrders();
    showToast('Услуга выполнена ✓');
    if (document.getElementById('screen-profile')?.classList.contains('active')) {
      await loadWorkerSalaries();
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
              <span class="service-option-qty">
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
  const btn = document.getElementById('order-services-save-btn');
  if (btn) btn.disabled = true;
  try {
    const serialized = serializeOrderServiceSelections(values);
    const saved = await sbPatchOrderFields(orderId, { service_type: serialized });
    const idx = orders.findIndex(item => item.id === orderId);
    if (idx !== -1) orders[idx] = { ...orders[idx], ...saved, serviceType: serialized };
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
  if (o.isCancelled) {
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
  return order && (order.responsible === currentWorkerName || order.assistant === currentWorkerName);
}

function _filterSpecialistOrdersByTab(list) {
  const today = todayStr();
  if (currentWorkerName === 'Roma' && currentWorkerTab === 'tatuActual') {
    return list.filter(o => isOrderFinanciallyActive(o) && Number(o.tatu) > 0 && !o.tatuDone);
  }
  if (currentWorkerName === 'Roma' && currentWorkerTab === 'tatuDone') {
    return list.filter(o => Number(o.tatu) > 0 && o.tatuDone);
  }
  if (currentWorkerName === 'Lyosha' && currentWorkerTab === 'toningActual') {
    return list.filter(o => isOrderFinanciallyActive(o) && Number(o.toning) > 0 && !o.toningDone && !o.toningExternal);
  }
  if (currentWorkerName === 'Lyosha' && currentWorkerTab === 'toningDone') {
    return list.filter(o => Number(o.toning) > 0 && o.toningDone);
  }
  if (currentWorkerName === 'Nastya' && currentWorkerTab === 'ownWarehouse') {
    return list.filter(o => o.ownWarehouse && !o.workerDone && !o.isCancelled);
  }
  const ownOrders = currentWorkerName === 'Nastya'
    ? list.filter(o => o.inWork && !o.isCancelled)
    : list.filter(o => _isCurrentWorkerOrder(o) && o.inWork && !o.isCancelled);

  if (currentWorkerTab === 'actual') {
    return ownOrders.filter(o => !o.workerDone);
  }
  if (currentWorkerTab === 'today') {
    return ownOrders.filter(o => o.date === today);
  }
  if (currentWorkerTab === 'done') {
    return ownOrders.filter(o => o.workerDone);
  }
  if (currentWorkerTab === 'future') {
    return ownOrders.filter(o => o.date && o.date > today);
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
    if (currentOrderTab === 'all') {
      // без дополнительной фильтрации
    } else if (currentOrderTab === 'planner') {
      list = list.filter(o => o.inWork && !o.ownWarehouse && !o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'call') {
      list = list.filter(_isCallOrderVisibleInCurrentContext);
    } else if (currentOrderTab === 'ownWarehouse') {
      list = list.filter(o => o.ownWarehouse && !o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'selection') {
      list = list.filter(o => !o.callStatus && !o.inWork && !o.ownWarehouse && !o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'done') {
      list = list.filter(o => o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'debt') {
      list = list.filter(o => isOrderFinanciallyActive(o) && ['Не оплачено', 'Частично'].includes(getEffectivePaymentStatus(o)));
    } else if (currentOrderTab === 'cancelled') {
      list = list.filter(o => o.isCancelled);
    }
  } else {
    list = _filterSpecialistOrdersByTab(list);
  }

  if (search) list = list.filter(o => orderMatchesSearch(o, search));
  if (orderDateFilterExact || orderDateFilterFrom || orderDateFilterTo) list = list.filter(orderMatchesDateFilter);
  if (statF) list = list.filter(o => getEffectivePaymentStatus(o) === statF);
  if (workerF) list = list.filter(o => o.responsible === workerF || o.assistant === workerF || o.manager === workerF);

  list.sort((a, b) => {
    const ad = a.date || '';
    const bd = b.date || '';
    return sort === 'asc' ? ad.localeCompare(bd) : bd.localeCompare(ad);
  });

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

// ---------- ДЕТАЛЬНЫЙ ЭКРАН ЗАКАЗА ----------
function openOrderDetail(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  currentOrderDetailId = id;

  const el = document.getElementById('order-detail-content');
  const fullOrderTotal = getOrderClientTotal(o);
  const clientPaid = Number(o.debt) || 0;
  const clientLeft = Math.max(0, fullOrderTotal - clientPaid);
  const supplierPaid = Number(o.check) || 0;
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
      ${canEdit   ? `<button class="icon-action-btn" title="Редактировать" onclick="openOrderModal('${o.id}')">${icon('pencil')}</button>` : ''}
        ${canDelete ? `<button class="icon-action-btn icon-action-danger" title="Полностью удалить заказ" onclick="deleteOrder('${escapeAttr(o.id)}', event)">${icon('trash-2')}</button>` : ''}
    `;
  }

  el.innerHTML = `
    <div class="detail-header">
      <div class="detail-header-top">
        <div>
          <div style="font-size:12px;color:var(--text3);font-family:'JetBrains Mono',monospace;margin-bottom:6px;">${o.id}</div>
          <div class="detail-title">${o.car || '—'}</div>
          <div class="detail-subtitle">${icon('calendar')} ${formatDate(o.date)}${o.time ? ' · ' + icon('clock') + ' ' + o.time : ''} &nbsp;·&nbsp; ${icon('hard-hat')} ${getWorkerDisplayPair(o.responsible, o.assistant)}</div>
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
    `}
  `;

  showScreen('order-detail');
}

// ---------- УДАЛЕНИЕ ----------
async function deleteOrder(id, event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  closeOrderActionMenus();
  if (deletingOrderIds.has(id)) return;
  if (!confirm('Полностью удалить этот заказ из базы? Это действие нельзя отменить.')) return;
  deletingOrderIds.add(id);
  try {
    await sbDeleteOrder(id);
    orders = orders.filter(o => o.id !== id);
    showToast('Запись удалена');
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

// ---------- КОПИРОВАНИЕ ДАННЫХ ЗАКАЗА ----------
function copyOrderSummary(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;

  const lines = [];
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

  if (o.car) lines.push(`Авто: ${o.car}`);
  if (o.phone) lines.push(`Телефон: ${o.phone}`);
  if (o.notes) lines.push(`Заметки: ${o.notes}`);
  const manufacturerText = getGlassManufacturerCopyText(o.glassManufacturer);
  if (manufacturerText) lines.push(manufacturerText);
  services.forEach(([label, amount]) => lines.push(`${label}: ${fmt(amount)}`));
  if (services.length === 0 && Number(o.total) > 0) lines.push(`Услуги: ${fmt(o.total)}`);
  if (services.length > 0 && Number(o.total) > listedServicesTotal) lines.push(`Сумма услуг: ${fmt(o.total)}`);
  if (Number(o.income) > 0) lines.push(`Цена продажи стекла: ${fmt(o.income)}`);
  if (fullTotal > 0) {
    if (lines.length) lines.push('');
    lines.push(`Общая сумма: ${fmt(fullTotal)}`);
  }

  const text = lines.join('\n');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Дані скопійовано');
    }).catch(() => {
      _fallbackCopy(text);
    });
  } else {
    _fallbackCopy(text);
  }
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

function buildNewNonCashPaymentEntries(order, oldOrder = null) {
  const entries = [];
  const clientDelta = getNewOrderPaymentsDelta(oldOrder?.clientPayments || [], order?.clientPayments || []);
  const supplierDelta = getNewOrderPaymentsDelta(oldOrder?.supplierPayments || [], order?.supplierPayments || []);

  clientDelta.forEach(payment => {
    if (isCashPaymentMethod(payment?.method)) return;
    const payload = buildOrderPaymentCashEntryPayload({
      order,
      payment,
      paymentType: 'client',
      fallbackWorkerName: order?.responsible || currentWorkerName,
    });
    if (payload) entries.push(payload);
  });

  supplierDelta.forEach(payment => {
    if (isCashPaymentMethod(payment?.method)) return;
    const payload = buildOrderPaymentCashEntryPayload({
      order,
      payment,
      paymentType: 'supplier',
      fallbackWorkerName: order?.responsible || currentWorkerName,
    });
    if (payload) entries.push(payload);
  });

  return entries;
}

async function addCashEntriesForDuplicatedOrder(order) {
  if (!isOrderFinanciallyActive(order)) return;

  const supplierPayments = order.supplierPayments || [];
  const supplierCashPaid = supplierPayments.length
    ? sumCashSupplierPayments(supplierPayments)
    : (Number(order.check) || 0);
  const clientCashPaid = getCashClientPaidForOrderSnapshot(order);
  const targetWorker = order.responsible || currentWorkerName;
  const fDate = order.date ? formatDate(order.date) : '—';
  const fTime = order.time || '—';
  const fCar = order.car || '—';

  if (supplierCashPaid !== 0) {
    const cashComment = `Списание за стекло ${order.id}, ${fDate} ${fTime}, авто: ${fCar}, склад: ${order.warehouse || '—'}`;
    const cashEntry = await sbInsertCashEntry({
      worker_name: targetWorker,
      amount: -supplierCashPaid,
      comment: cashComment,
    });
    if (typeof workerCashLog !== 'undefined' && targetWorker === currentWorkerName && cashEntry) {
      workerCashLog.unshift(cashEntry);
    }
    if (currentRole === 'owner' && Array.isArray(window.allCashLog) && cashEntry) {
      window.allCashLog.unshift(cashEntry);
    }
  }

  if (clientCashPaid !== 0) {
    const cashComment = `Оплата клиента наличкой ${order.id}, ${fDate}, авто: ${fCar}`;
    const cashEntry = await sbInsertCashEntry({
      worker_name: targetWorker,
      amount: clientCashPaid,
      comment: cashComment,
    });
    if (typeof workerCashLog !== 'undefined' && targetWorker === currentWorkerName && cashEntry) {
      workerCashLog.unshift(cashEntry);
    }
    if (currentRole === 'owner' && Array.isArray(window.allCashLog) && cashEntry) {
      window.allCashLog.unshift(cashEntry);
    }
  }
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
  duplicate.id = generateOrderId();
  duplicate.statusDone = false;
  duplicate.workerDone = false;
  duplicate.priceLocked = false;
  duplicate.inWork = false;
  duplicate.callStatus = false;
  duplicate.ownWarehouse = false;
  duplicate.isCancelled = false;

  try {
    const saved = await saveNewOrderWithNextIdOnConflict(
      duplicate,
      () => sbInsertOrder(duplicate)
    );
    const nextOrder = saved || duplicate;
    orders.unshift(nextOrder);
    await addCashEntriesForDuplicatedOrder(nextOrder);
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
  if (!model || !eurocode || typeof sbUpsertCarDirectory !== 'function') return;

  try {
    const saved = await sbUpsertCarDirectory(model, eurocode);
    if (!Array.isArray(carDirectory)) return;

    const savedId = saved?.id;
    const idx = carDirectory.findIndex(item =>
      (savedId && item.id === savedId) ||
      String(item.model || '').trim().toLowerCase() === model.toLowerCase()
    );
    const nextRow = saved || { model, eurocode };
    if (idx !== -1) {
      carDirectory[idx] = { ...carDirectory[idx], ...nextRow, model, eurocode };
    } else {
      carDirectory.push(nextRow);
    }
  } catch (e) {
    console.warn('Failed to remember car directory row:', e);
  }
}

function populateRefSelects() {
  // Марки авто — теперь datalist
  populateCarDatalist();

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
              <span class="service-option-qty">
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

  // Ответственный — старшие специалисты
  const respSel = document.getElementById('f-responsible');
  if (respSel) {
    const cur = respSel.value;
    respSel.innerHTML = '<option value="">— выбрать —</option>' +
      workers.filter(w => ['senior', 'extra'].includes(w.systemRole)).map(w => `<option value="${w.name}">${getWorkerDisplayName(w.name)} (${w.role})</option>`).join('');
    if (cur) respSel.value = cur;
    
    // При смене ответственного — подставляем помощника
    respSel.onchange = () => applyAssistantForResponsible(respSel.value);
  }

  const managerSel = document.getElementById('f-manager');
  if (managerSel) {
    const cur = managerSel.value;
    const managerWorkers = workers.filter(w => w.systemRole === 'manager');
    const staticManagers = STATIC_MANAGER_OPTIONS
      .filter(manager => !managerWorkers.some(w => w.name === manager.name));
    managerSel.innerHTML = '<option value="">— выбрать —</option>' +
      managerWorkers.map(w => `<option value="${escapeAttr(w.name)}">${escapeHtml(getWorkerDisplayName(w.name))}</option>`).join('') +
      staticManagers.map(w => `<option value="${escapeAttr(w.name)}">${escapeHtml(w.label)}</option>`).join('');
    if (cur) managerSel.value = cur;
  }

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
  const canSeeServicesInOrderForm = currentRole === 'owner' || currentRole === 'manager' || currentUserCanActAsSenior();
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
  const staticManagers = STATIC_MANAGER_OPTIONS
    .filter(manager => !(workers || []).some(w => w.name === manager.name));
  sel.innerHTML = '<option value="">Все сотрудники</option>' +
    (workers || []).map(w => `<option value="${escapeAttr(w.name)}">${escapeHtml(getWorkerDisplayName(w.name))}</option>`).join('') +
    staticManagers.map(w => `<option value="${escapeAttr(w.name)}">${escapeHtml(w.label)}</option>`).join('');
  if (cur) sel.value = cur;
}

let currentClientPayments = [];
let currentSupplierPayments = [];

function resetOrdersFilters() {
  ordersFiltersOpen = false;
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
      </div>
      ${canManagePayments ? `
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
      </div>
      ${canManagePayments ? `
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
  const totalPaid = currentClientPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  debtEl.value = String(totalPaid || 0);
  syncClientLeftFromPayments();
}

function syncClientLeftFromPayments(totalAll = null) {
  const leftEl = document.getElementById('f-client-left');
  if (!leftEl) return;
  const total = totalAll ?? (
    (Number(document.getElementById('f-total')?.value) || 0) +
    (Number(document.getElementById('f-income')?.value) || 0) +
    (Number(document.getElementById('f-delivery')?.value) || 0)
  );
  const paid = Number(document.getElementById('f-debt')?.value) || 0;
  leftEl.value = String(Math.max(0, total - paid));
}

function syncSupplierPaidFromPayments() {
  const checkEl = document.getElementById('f-check');
  const totalPaid = currentSupplierPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  if (checkEl) checkEl.value = String(totalPaid || 0);
  syncSupplierLeftFromPayments();
}

function syncSupplierLeftFromPayments() {
  const leftEl = document.getElementById('f-supplier-left');
  if (!leftEl) return;
  const purchase = Number(document.getElementById('f-purchase')?.value) || 0;
  const paid = currentSupplierPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  leftEl.value = String(Math.max(0, purchase - paid));
}

async function addClientPayment() {
  if (!canCurrentUserManageOrderPayments(getOrderDraftFromForm(editingOrderId ? orders.find(item => item.id === editingOrderId) : null))) return;
  if (!editingOrderId) return showToast('Сначала сохраните заказ, потом добавляйте оплату', 'error');
  const amtEl = document.getElementById('f-new-payment-amount');
  const dateEl = document.getElementById('f-new-payment-date');
  const methodEl = document.getElementById('f-payment-method');
  const addBtn = document.getElementById('add-client-payment-btn');
  const amount = Number(amtEl.value);
  if (!amount || amount <= 0) return showToast('Введите сумму оплаты', 'error');
  const date = dateEl.value || todayStr();
  const method = normalizePaymentMethod(methodEl?.value || '');
  if (!method) return showToast('Выберите способ оплаты', 'error');

  const prevPayments = JSON.parse(JSON.stringify(currentClientPayments || []));
  currentClientPayments.push({ amount, date, method, timestamp: new Date().toISOString() });
  if (addBtn) addBtn.disabled = true;
  try {
    await persistImmediateOrderPaymentsUpdate();
    amtEl.value = '';
    renderClientPayments();
    syncClientPaidFromPayments();
    recalcTotal();
    showToast('Оплата клиента добавлена ✓');
  } catch (e) {
    currentClientPayments = prevPayments;
    renderClientPayments();
    syncClientPaidFromPayments();
    recalcTotal();
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
  const addBtn = document.getElementById('add-supplier-payment-btn');
  const amount = Number(amtEl.value);
  if (!amount || amount <= 0) return showToast('Введите сумму поставщику', 'error');
  const date = dateEl.value || todayStr();
  const method = normalizePaymentMethod(methodEl?.value || '');
  if (!method) return showToast('Выберите способ оплаты', 'error');

  const prevPayments = JSON.parse(JSON.stringify(currentSupplierPayments || []));
  currentSupplierPayments.push({ amount, date, method, timestamp: new Date().toISOString() });
  if (addBtn) addBtn.disabled = true;
  try {
    await persistImmediateOrderPaymentsUpdate();
    amtEl.value = '';
    renderSupplierPayments();
    syncSupplierPaidFromPayments();
    recalcTotal();
    showToast('Оплата поставщику добавлена ✓');
  } catch (e) {
    currentSupplierPayments = prevPayments;
    renderSupplierPayments();
    syncSupplierPaidFromPayments();
    recalcTotal();
    showToast('Ошибка сохранения: ' + e.message, 'error');
  } finally {
    if (addBtn) addBtn.disabled = false;
  }
}

async function persistImmediateOrderPaymentsUpdate() {
  if (!editingOrderId) return;
  const existingOrder = orders.find(item => item.id === editingOrderId);
  if (!existingOrder) throw new Error('Заказ не найден');
  const sumAmounts = payments => (payments || []).reduce((sum, payment) => sum + (Number(payment?.amount) || 0), 0);

  const data = getOrderDraftFromForm(existingOrder);
  data.clientPayments = currentClientPayments;
  data.supplierPayments = currentSupplierPayments;

  const oldSupplierPayments = existingOrder?.supplierPayments || [];
  const newSupplierPayments = data.supplierPayments || [];
  const hasSupplierPaymentHistory = oldSupplierPayments.length > 0 || newSupplierPayments.length > 0;
  const oldFinanciallyActive = isOrderFinanciallyActive(existingOrder);
  const newFinanciallyActive = isOrderFinanciallyActive(data);
  const oldCashSupplierPaid = oldFinanciallyActive ? (hasSupplierPaymentHistory ? sumCashSupplierPayments(oldSupplierPayments) : (Number(existingOrder.check) || 0)) : 0;
  const newCashSupplierPaid = newFinanciallyActive ? (hasSupplierPaymentHistory ? sumCashSupplierPayments(newSupplierPayments) : (Number(data.check) || 0)) : 0;
  const cashSupplierDiff = newFinanciallyActive ? (newCashSupplierPaid - oldCashSupplierPaid) : 0;

  const oldClientPayments = existingOrder?.clientPayments || [];
  const newClientPayments = data.clientPayments || [];
  const oldCashClientPaid = oldFinanciallyActive ? getCashClientPaidForOrderSnapshot({ ...existingOrder, clientPayments: oldClientPayments }) : 0;
  const newCashClientPaid = newFinanciallyActive ? getCashClientPaidForOrderSnapshot({ ...data, clientPayments: newClientPayments }) : 0;
  const cashClientDiff = newFinanciallyActive ? (newCashClientPaid - oldCashClientPaid) : 0;
  const cashEntries = [];

  if ((currentRole === 'senior' || currentRole === 'owner') && cashSupplierDiff !== 0) {
    const amount = -cashSupplierDiff;
    const typeStr = cashSupplierDiff > 0 ? 'Списание' : 'Возврат';
    const fDate = data.date ? formatDate(data.date) : '—';
    const fTime = data.time || '—';
    const fCar = data.car || '—';
    const targetWorker = data.responsible || currentWorkerName;
    cashEntries.push({
      worker_name: targetWorker,
      amount,
      comment: `${typeStr} за стекло ${data.id}, ${fDate} ${fTime}, авто: ${fCar}, склад: ${data.warehouse || '—'}`,
      cashType: 'supplier',
    });
  }

  if ((currentRole === 'senior' || currentRole === 'owner') && cashClientDiff !== 0) {
    const typeStr = cashClientDiff > 0 ? 'Оплата клиента' : 'Возврат клиенту';
    const fDate = data.date ? formatDate(data.date) : '—';
    const fCar = data.car || '—';
    const targetWorker = data.responsible || currentWorkerName;
    cashEntries.push({
      worker_name: targetWorker,
      amount: cashClientDiff,
      comment: `${typeStr} наличкой ${data.id}, ${fDate}, авто: ${fCar}`,
      cashType: 'client',
    });
  }

  const saved = await sbPatchOrderFields(editingOrderId, {
    client_payments: data.clientPayments,
    supplier_payments: data.supplierPayments,
    debt: sumAmounts(data.clientPayments),
    check_sum: sumAmounts(data.supplierPayments),
  });
  const idx = orders.findIndex(item => item.id === editingOrderId);
  if (idx !== -1 && saved) {
    orders[idx] = {
      ...orders[idx],
      ...saved,
      clientPayments: data.clientPayments,
      supplierPayments: data.supplierPayments,
    };
  }

  for (const rawCashEntry of cashEntries) {
    const cashEntry = await sbInsertCashEntry({
      worker_name: rawCashEntry.worker_name,
      amount: rawCashEntry.amount,
      comment: rawCashEntry.comment,
      cash_account: 'cash',
    });
    if (typeof workerCashLog !== 'undefined' && cashEntry?.worker_name === currentWorkerName) {
      workerCashLog.unshift(cashEntry);
    }
    if (currentRole === 'owner' && Array.isArray(window.allCashLog) && cashEntry) {
      window.allCashLog.unshift(cashEntry);
    }
  }

  try {
    orders = await sbFetchOrders();
  } catch (refreshError) {
    console.warn('Failed to refresh orders after immediate payment save:', refreshError);
  }

  if (typeof refreshActiveOrdersViews === 'function') {
    refreshActiveOrdersViews();
  } else {
    currentMonthFilter ? renderOrdersForMonth(currentMonthFilter) : renderOrders();
  }
}

function sumCashSupplierPayments(payments) {
  return (payments || []).reduce((sum, payment) => {
    return sum + (isCashPaymentMethod(payment.method) ? (Number(payment.amount) || 0) : 0);
  }, 0);
}

function removeClientPayment(idx) {
  if (!confirm('Удалить этот платеж из истории?')) return;
  currentClientPayments.splice(idx, 1);
  renderClientPayments();
  syncClientPaidFromPayments();
  recalcTotal();
}

function removeSupplierPayment(idx) {
  if (!confirm('Удалить этот платеж поставщику из истории?')) return;
  currentSupplierPayments.splice(idx, 1);
  renderSupplierPayments();
  syncSupplierPaidFromPayments();
  recalcTotal();
}

// ---------- МОДАЛ СОЗДАНИЯ / РЕДАКТИРОВАНИЯ ----------
function openOrderModal(id) {
  const accessOrder = id ? orders.find(item => item.id === id) : null;
  if (id && !canCurrentUserOpenOrderModal(accessOrder)) return;
  editingOrderId = id;
  currentClientPayments = [];
  currentSupplierPayments = [];

  populateRefSelects();
  populateClientDatalist();
  setOrderModalPanel((currentRole === 'owner' || currentRole === 'manager') ? 'order' : 'work');

  const cancelWrap = document.getElementById('cancel-toggle-wrap');
  if (cancelWrap) {
    cancelWrap.style.display = (currentRole === 'owner' || currentRole === 'manager') ? 'inline-flex' : 'none';
  }

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
  if (tonExtEl) tonExtEl.addEventListener('change', () => { recalcFullMargins(); recalcTotal(); });

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

  // Начальный пересчёт итогов (при редактировании)
  setTimeout(recalcTotal, 50);
}

function closeOrderModal() {
  document.getElementById('order-modal').classList.remove('active');
  editingOrderId = null;
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
  const getN = id => Number(document.getElementById(id)?.value) || 0;
  const order = { ...(baseOrder || {}) };
  order.id = baseOrder?.id || editingOrderId || 'Новая запись';
  order.date = get('f-date') || baseOrder?.date || '';
  order.time = get('f-time') || baseOrder?.time || '';
  order.responsible = get('f-responsible') || baseOrder?.responsible || '';
  order.assistant = document.getElementById('f-assistant')?.value || baseOrder?.assistant || '';
  order.manager = document.getElementById('f-manager')?.value || baseOrder?.manager || '';
  order.dropshipper = get('f-dropshipper') || baseOrder?.dropshipper || '';
  order.molding = getN('f-molding');
  order.extraWork = getN('f-extra-work');
  order.toning = getN('f-toning');
  order.tatu = getN('f-tatu');
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
  return order;
}

function getOrderSalaryPreviewRows(order) {
  if (!order) return [];
  const rows = [];
  const seen = new Set();
  const candidateNames = [order.responsible, order.assistant, order.manager, 'Roma', 'Lyosha'].filter(Boolean);
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
  const isMainWorker = order.responsible === workerName || order.assistant === workerName;

  if (isMainWorker) {
    if (rule.selectedServices) {
      if (typeof hasCustomSalaryService === 'function' && hasCustomSalaryService(order)) {
        parts.push({ label: 'Нестандартная работа, внесите запись в кассу', amount: 0 });
      }
      const adjustments = rule.serviceAdjustments || {};
      const groupedServices = {};
      const serviceItems = typeof _salarySelectedServiceItems === 'function' ? _salarySelectedServiceItems(order) : [];
      serviceItems.forEach(item => {
        if (item.salaryCategory === 'custom') return;
        const adjustment = Number(adjustments[item.salaryCategory]) || 0;
        const amount = Math.max(0, (Number(item.rate) || 0) + adjustment);
        if (!groupedServices[item.name]) groupedServices[item.name] = { qty: 0, amount: 0 };
        groupedServices[item.name].qty += 1;
        groupedServices[item.name].amount += amount;
      });
      Object.entries(groupedServices).forEach(([name, item]) => {
        parts.push({ label: item.qty > 1 ? `${name} ×${item.qty}` : name, amount: item.amount });
      });
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

  if (workerName === 'Roma' && Number(order.tatu) > 0) {
    parts.push({ label: 'Тату ' + Math.round((rule.tatuBonusPct || 0) * 100) + '%', amount: Math.round((Number(order.tatu) || 0) * (rule.tatuBonusPct || 0)) });
  }

  if (workerName === 'Lyosha' && !order.toningExternal && Number(order.toning) > 0) {
    parts.push({ label: 'Тонировка ' + Math.round((rule.toningBonusPct || 0) * 100) + '%', amount: Math.round((Number(order.toning) || 0) * (rule.toningBonusPct || 0)) });
  }

  if (!parts.length && (order.responsible === workerName || order.assistant === workerName || order.manager === workerName)) {
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
        ['Дата', formatOrderSummaryValue(draftOrder.date)],
        ['Время', formatOrderSummaryValue(draftOrder.time)],
        ['Ответственный', formatOrderSummaryValue(getWorkerDisplayName(draftOrder.responsible || ''))],
        ['Помощник', formatOrderSummaryValue(getWorkerDisplayName(draftOrder.assistant || ''))],
        ['Менеджер', formatOrderSummaryValue(getWorkerDisplayName(draftOrder.manager || ''))],
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
  const isPrivileged = currentRole === 'owner' || currentRole === 'manager';
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
  const isPrivileged = currentRole === 'owner' || currentRole === 'manager';
  const canManagePayments = canCurrentUserManageOrderPayments(draftOrder);
  const canEditServices = canCurrentUserEditOrderServices(existingOrder);
  const canComplete = canCurrentUserCompleteOrder(existingOrder);
  const canSave = isPrivileged || (canEditServices && hasSeniorServiceChanges(existingOrder));
  const headerActions = document.getElementById('order-modal-owner-actions');
  if (headerActions) {
    headerActions.style.display = (isPrivileged && !!editingOrderId && !!existingOrder) ? 'inline-flex' : 'none';
  }

  updateOrderModalTabsAccess(existingOrder);

  const basicFieldIds = [
    'f-date','f-time','f-responsible','f-assistant','f-manager','f-client','f-phone','f-address',
    'f-vin','f-extra-note','f-car','f-code','f-glass-manufacturer','f-new-post','f-warehouse',
    'f-warehouse-code','f-notes','f-order-status','f-only-sale','f-toning-external','f-configuration'
  ];
  basicFieldIds.forEach(id => setElementDisabledState(document.getElementById(id), !isPrivileged));
  document.querySelectorAll('#f-configuration-checkboxes input[type="checkbox"]').forEach(input => setElementDisabledState(input, !isPrivileged));

  const workCostsSection = document.getElementById('order-work-costs-section');
  if (workCostsSection) {
    workCostsSection.style.display = isPrivileged
      ? (document.querySelector('[data-order-modal-tab].active')?.dataset.orderModalTab === 'work' ? '' : 'none')
      : 'none';
  }
  ['f-mount','f-molding','f-extra-work','f-tatu','f-toning','f-total','f-delivery','f-dropshipper','f-purchase','f-income','f-debt-date'].forEach(id => {
    const el = document.getElementById(id);
    const allow = isPrivileged || (canManagePayments && id === 'f-debt-date');
    setElementDisabledState(el, !allow);
  });

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
  set('f-phone', o.phone);
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
  set('f-manager', o.manager || '');
  set('f-check', o.check);
  set('f-debt', o.debt);
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
    'f-payout-molding-resp','f-payout-molding-assist','f-assistant','f-manager',
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

    const forceUnlock = (currentRole === 'owner' || currentRole === 'manager' || currentRole === 'extra');
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
      .reduce((s, id) => s + (Number(document.getElementById(id)?.value) || 0), 0);
  } else {
    // 'init', 'manualTotal' или любое другое (например, вызов без аргументов из других частей кода)
    worksSum = Number(document.getElementById('f-total')?.value) || 0;
  }

  // Сумма продажи стекла из финансового блока
  const glassSum = Number(document.getElementById('f-income')?.value) || 0;
  // Доставка из финансового блока
  const deliverySum = Number(document.getElementById('f-delivery')?.value) || 0;
  const totalAll = worksSum + glassSum + deliverySum;

  // Скрытое поле (для сохранения — только работы, как было), или видимый инпут
  const totalEl = document.getElementById('f-total');
  if (totalEl && mode === 'fromComponent') totalEl.value = worksSum;

  const fmt = v => v.toLocaleString('ru') + ' \u20B4';
  const glassPurchase = Number(document.getElementById('f-purchase')?.value) || 0;

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
  const serviceTypeRequired = !data.onlySale && currentRole !== 'owner' && currentRole !== 'manager';
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

// ---------- СОХРАНЕНИЕ ----------
async function saveOrder() {
  const get  = id => document.getElementById(id)?.value?.trim() || '';
  const getN = id => Number(document.getElementById(id)?.value) || 0;

  const isNew = !editingOrderId;
  const existingOrder = isNew ? null : orders.find(o => o.id === editingOrderId);

  recalcMargin();

  const data = {
    id:              isNew ? generateOrderId() : editingOrderId,
    date:            get('f-date'),
    time:            get('f-time'),
    responsible:     get('f-responsible'),
    client:          get('f-client'),
    phone:           get('f-phone'),
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
    inWork:          (currentRole === 'owner' || currentRole === 'manager')
      ? (document.getElementById('f-order-status')?.value === 'inWork')
      : (existingOrder ? existingOrder.inWork : false),
    callStatus:      (currentRole === 'owner' || currentRole === 'manager')
      ? (document.getElementById('f-order-status')?.value === 'call')
      : (existingOrder ? !!existingOrder.callStatus : false),
    ownWarehouse:    (currentRole === 'owner' || currentRole === 'manager')
      ? (document.getElementById('f-order-status')?.value === 'ownWarehouse')
      : (existingOrder ? !!existingOrder.ownWarehouse : false),
    isCancelled:     (currentRole === 'owner' || currentRole === 'manager')
      ? (document.getElementById('f-order-status')?.value === 'cancelled')
      : (existingOrder ? !!existingOrder.isCancelled : false),
    workerDone:      isNew ? false : (orders.find(x => x.id === editingOrderId)?.workerDone || false),
    assistant:       document.getElementById('f-assistant')?.value || '',
    manager:         document.getElementById('f-manager')?.value || '',
    priceLocked:     (currentRole === 'senior') ? true : (existingOrder ? existingOrder.priceLocked : false),
    toningExternal:  document.getElementById('f-toning-external')?.checked || false,
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
    reworkData: {},
    clientPayments: currentClientPayments,
    supplierPayments: currentSupplierPayments,
  };

  if (!validateOrderRequiredFields(data)) return;

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

  if ((currentRole === 'senior' || currentRole === 'owner') && cashSupplierDiff !== 0) {
    const amount = -cashSupplierDiff; // наличная оплата поставщику уменьшает кассу
    const typeStr = cashSupplierDiff > 0 ? 'Списание' : 'Возврат';
    const fDate = data.date ? formatDate(data.date) : '—';
    const fTime = data.time || '—';
    const fCar = data.car || '—';
    const targetWorker = data.responsible || currentWorkerName;
    cashEntries.push({
      worker_name: targetWorker,
      amount,
      comment: `${typeStr} за стекло ${data.id}, ${fDate} ${fTime}, авто: ${fCar}, склад: ${data.warehouse || '—'}`,
      cashType: 'supplier',
    });
  }

  if ((currentRole === 'senior' || currentRole === 'owner') && cashClientDiff !== 0) {
    const typeStr = cashClientDiff > 0 ? 'Оплата клиента' : 'Возврат клиенту';
    const fDate = data.date ? formatDate(data.date) : '—';
    const fCar = data.car || '—';
    const targetWorker = data.responsible || currentWorkerName;
    cashEntries.push({
      worker_name: targetWorker,
      amount: cashClientDiff,
      comment: `${typeStr} наличкой ${data.id}, ${fDate}, авто: ${fCar}`,
      cashType: 'client',
    });
  }

  try {
    const shouldUseSaveWithCash = cashEntries.length > 0;
    const result = isNew
      ? await saveNewOrderWithNextIdOnConflict(
          data,
          async currentCashEntries => {
            if (shouldUseSaveWithCash) {
              return await sbSaveOrderWithCash(data, {
                isNew: true,
                cashEntries: currentCashEntries,
                rollbackOrder: existingOrder,
              });
            }
            const savedOrder = await sbInsertOrder(data);
            return { order: savedOrder, cashEntries: [] };
          },
          { cashEntries }
        )
      : (shouldUseSaveWithCash
        ? await sbSaveOrderWithCash(data, {
            isNew: false,
            cashEntries,
            rollbackOrder: existingOrder,
          })
        : { order: await sbUpdateOrder(data), cashEntries: [] });
    const saved = result.order;

    if (isNew) {
      orders.unshift(saved);
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
      showToast('Запись создана ✓');
    } else {
      const idx = orders.findIndex(o => o.id === editingOrderId);
      if (idx !== -1) orders[idx] = saved;
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
      showToast('Запись обновлена ✓');
    }

    const savedCashEntries = result.cashEntries || [];
    for (const cashEntry of savedCashEntries) {
      if (typeof workerCashLog !== 'undefined' && cashEntry?.worker_name === currentWorkerName) {
        workerCashLog.unshift(cashEntry);
      }
      if (currentRole === 'owner' && Array.isArray(window.allCashLog) && cashEntry) {
        window.allCashLog.unshift(cashEntry);
      }
    }

    if (cashSupplierDiff !== 0) {
      const targetWorker = data.responsible || currentWorkerName;
      showToast(`${cashSupplierDiff > 0 ? 'Списано' : 'Возвращено'} ${Math.abs(cashSupplierDiff)} ₴ в кассу мастера ${targetWorker}`);
    }

    try {
      orders = await sbFetchOrders();
    } catch (refreshError) {
      console.warn('Failed to refresh orders after save:', refreshError);
    }

    closeOrderModal();
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
    if (currentOrderTab === 'all') {
      // без дополнительной фильтрации
    } else if (currentOrderTab === 'planner') {
      list = list.filter(o => o.inWork && !o.ownWarehouse && !o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'call') {
      list = list.filter(_isCallOrderVisibleInCurrentContext);
    } else if (currentOrderTab === 'ownWarehouse') {
      list = list.filter(o => o.ownWarehouse && !o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'selection') {
      list = list.filter(o => !o.callStatus && !o.inWork && !o.ownWarehouse && !o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'done') {
      list = list.filter(o => o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'debt') {
      list = list.filter(o => isOrderFinanciallyActive(o) && ['Не оплачено', 'Частично'].includes(getEffectivePaymentStatus(o)));
    } else if (currentOrderTab === 'cancelled') {
      list = list.filter(o => o.isCancelled);
    }
  } else {
    list = _filterSpecialistOrdersByTab(list);
  }

  if (search) list = list.filter(o => orderMatchesSearch(o, search));
  if (orderDateFilterExact || orderDateFilterFrom || orderDateFilterTo) list = list.filter(orderMatchesDateFilter);
  if (statF) list = list.filter(o => getEffectivePaymentStatus(o) === statF);
  if (workerF) list = list.filter(o => o.responsible === workerF || o.assistant === workerF || o.manager === workerF);
  list.sort((a, b) => {
    const ad = a.date || '';
    const bd = b.date || '';
    return sort === 'asc' ? ad.localeCompare(bd) : bd.localeCompare(ad);
  });

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
  o.workerDone = true;
  try {
    if (String(draftOrder.serviceType || '').trim() !== String(o.serviceType || '').trim()) {
      const savedServices = await sbPatchOrderFields(o.id, { service_type: String(draftOrder.serviceType || '').trim() || null });
      if (savedServices) {
        const idx = orders.findIndex(x => x.id === orderId);
        if (idx !== -1) orders[idx] = { ...orders[idx], ...savedServices, serviceType: draftOrder.serviceType };
      } else {
        o.serviceType = draftOrder.serviceType;
      }
    }
    const saved = await sbPatchOrderFields(o.id, { worker_done: true });
    if (saved) {
      const idx = orders.findIndex(x => x.id === orderId);
      if (idx !== -1) orders[idx] = { ...o, ...saved, workerDone: true };
    }
    await _upsertOrderSalaries(orders.find(x => x.id === orderId) || o);
    // Автозачисление в кассу если наличка и заказ отмечен выполненным
    if (typeof addCashFromOrder === 'function') {
      await addCashFromOrder(o);
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
  if (order?.workerDone) closeOrderModal();
}

// Начислить / удалить записи ЗП для всех участников заказа
async function _upsertOrderSalaries(order) {
  const amounts = {};
  const affectedWorkers = new Set();

  if (order.workerDone) {
    // 1. Основные участники
    [order.responsible, order.assistant].filter(Boolean).forEach(w => {
      affectedWorkers.add(w);
      amounts[w] = (amounts[w] || 0) + calcOrderSalary(w, order);
    });

    // 2. Участники доработки
    if (order.reworkData) {
      [order.reworkData.responsible, order.reworkData.assistant].filter(Boolean).forEach(w => {
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
  }

  const specialSalaryEntries = getSpecialServiceSalaryEntries(order);
  for (const entry of specialSalaryEntries) {
    await upsertSpecialServiceSalaryEntry(entry);
    affectedWorkers.add(entry.workerName);
  }


  // Всегда берём актуальные записи ЗП по этому заказу из БД
  let existingInDb = [];
  try {
    existingInDb = await sbFetchSalariesByOrder(order.id) || [];
  } catch (e) { /* если упало — продолжаем с пустым массивом */ }
  const automaticEntriesInDb = existingInDb.filter(entry => !isOwnerManualSalaryEntry(entry));

  // После первого выполнения заказа ЗП по этому order_id считается зафиксированной:
  // последующие правки сумм/полей заказа не должны менять уже начисленные записи.
  const salaryFrozen = order.workerDone && automaticEntriesInDb.length;
  if (salaryFrozen) {
    for (const workerName of affectedWorkers) {
      if (!_canSyncDailyBaseSalaryForWorker(workerName)) continue;
      await _syncDailyBaseSalaryEntry(workerName, order.date);
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

  for (const workerName of affectedWorkers) {
    if (!_canSyncDailyBaseSalaryForWorker(workerName)) continue;
    await _syncDailyBaseSalaryEntry(workerName, order.date);
  }

  // Обновляем локальный массив workerSalaries (только для текущего пользователя)
  if (typeof workerSalaries !== 'undefined') {
    try {
      workerSalaries = await sbFetchWorkerSalaries(currentWorkerName);
    } catch (e) { /* не критично */ }
  }
}

function getSpecialServiceSalaryEntries(order) {
  const entries = [];
  const tatuAmount = _calcTatuBonus('Roma', order);
  if (tatuAmount > 0) {
    entries.push({
      workerName: 'Roma',
      date: order.date,
      amount: tatuAmount,
      orderId: `${order.id} · Тату`,
      comment: `Тату по заказу ${order.id}`,
    });
  }

  const toningAmount = _calcToningBonus('Lyosha', order);
  if (toningAmount > 0) {
    entries.push({
      workerName: 'Lyosha',
      date: order.date,
      amount: toningAmount,
      orderId: `${order.id} · Тонировка`,
      comment: `Тонировка по заказу ${order.id}`,
    });
  }

  return entries;
}

async function upsertSpecialServiceSalaryEntry(entry) {
  if (!entry?.workerName || !entry.date || !entry.orderId) return;
  const amount = Number(entry.amount) || 0;
  let salaryRows = [];
  try {
    salaryRows = await sbFetchWorkerSalaries(entry.workerName) || [];
  } catch (e) {
    return;
  }

  const existing = salaryRows.find(row => row.order_id === entry.orderId && !isOwnerManualSalaryEntry(row));
  if (amount > 0) {
    if (!existing) {
      await sbInsertWorkerSalary({
        worker_name: entry.workerName,
        date: entry.date,
        amount,
        order_id: entry.orderId,
        entry_type: 'auto',
        comment: entry.comment || '',
      });
    } else if (Number(existing.amount) !== amount || existing.comment !== entry.comment) {
      await sbUpdateWorkerSalary(existing.id, {
        amount,
        comment: entry.comment || '',
      });
    }
  } else if (existing) {
    await sbDeleteWorkerSalary(existing.id);
  }
}

function _canSyncDailyBaseSalaryForWorker(workerName) {
  return false;
}

async function _syncDailyBaseSalaryEntry(workerName, date) {
  return;
}

// ---------- ТАБЫ ЗАКАЗОВ ----------

function initOrderTabs() {
  const tabsEl = document.getElementById('orders-tabs');

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
      `;
    }
    setOrderTab('selection');
  } else {
    // Специалисты: только заказы из планёрки
    if (tabsEl) {
      tabsEl.style.display = 'flex';
      tabsEl.innerHTML = `
        <button class="orders-tab orders-tab-relevant active" id="tab-actual" onclick="setWorkerTab('actual')"><span class="tab-dot"></span> Актуальные</button>
        ${currentWorkerName === 'Roma' ? '<button class="orders-tab" id="tab-tatu-actual" onclick="setWorkerTab(\'tatuActual\')">Тату актуальные</button><button class="orders-tab" id="tab-tatu-done" onclick="setWorkerTab(\'tatuDone\')">Тату выполненные</button>' : ''}
        ${currentWorkerName === 'Lyosha' ? '<button class="orders-tab" id="tab-toning-actual" onclick="setWorkerTab(\'toningActual\')">Тонировка актуальные</button><button class="orders-tab" id="tab-toning-done" onclick="setWorkerTab(\'toningDone\')">Тонировка выполненные</button>' : ''}
        <button class="orders-tab" id="tab-today" onclick="setWorkerTab('today')">Сегодняшние</button>
        <button class="orders-tab" id="tab-done-worker" onclick="setWorkerTab('done')">Выполненные</button>
        <button class="orders-tab" id="tab-future" onclick="setWorkerTab('future')">Будущие</button>
        <button class="orders-tab" id="tab-past" onclick="setWorkerTab('past')">Прошедшие</button>
        ${currentWorkerName === 'Nastya' ? '<button class="orders-tab" id="tab-own-warehouse-worker" onclick="setWorkerTab(\'ownWarehouse\')">Наш склад</button>' : ''}
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

  // Рома: 20% от tatu (всегда, если tatu > 0)
  const payoutRoma = tatuSum > 0 ? Math.round(tatuSum * 0.20) : 0;

  const payoutLesha       = toningExternal ? 0 : Math.round(toningSum * 0.20);
  const payoutExtraResp   = Math.round(extraSum * 0.20);
  const payoutExtraAssist = Math.round(extraSum * 0.20);
  const payoutMoldingResp   = Math.round(moldingSum * 0.20);
  const payoutMoldingAssist = Math.round(moldingSum * 0.20);

  const costs = purchaseGlass + costMolding + costToning;
  const payouts = payoutDropshipper + payoutManagerGlass + payoutRespGlass + payoutLesha + payoutRoma +
                  payoutExtraResp + payoutExtraAssist + payoutMoldingResp + payoutMoldingAssist;

  const marginTotal = total - costs - payouts;

  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = Math.round(v); };
  setVal('f-remainder',           marginGlass);
  setVal('f-margin-total',        marginTotal);
  setVal('f-payout-dropshipper',  payoutDropshipper);
  setVal('f-payout-manager-glass',payoutManagerGlass);
  setVal('f-payout-resp-glass',   payoutRespGlass);
  setVal('f-payout-lesha',        payoutLesha);
  setVal('f-payout-roma',         payoutRoma);
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
    if (phoneEl && item.client?.phone) phoneEl.value = item.client.phone;

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
