// ============================================================
// ORDERS.JS — список заказов, детали, модал создания/редактирования
// ============================================================

let editingOrderId  = null;      // null = новый, иначе id редактируемого
let currentOrderTab = 'selection';  // 'selection' | 'call' | 'planner' | 'done' — для owner/manager
let currentWorkerTab = 'actual'; // 'actual' | 'today' | 'done' | 'future' | 'past' | 'all' — для специалистов
let ordersVisibleCount = 10;
let lastOrdersListSignature = '';
let ordersFiltersOpen = false;
let currentOrderDetailId = null;
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

function canMarkWorkerDone() {
  // Галочка доступна только специалисту (senior) для своих заказов
  return currentRole === 'senior';
}

function canQuickConfirmOrderAmounts(order) {
  return currentRole === 'senior'
    && order?.responsible === currentWorkerName
    && isOrderFinanciallyActive(order)
    && !order?.workerDone;
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
    const result = await sbSaveOrderWithCash(updatedOrder, {
      isNew: false,
      cashEntries,
      rollbackOrder: order,
    });
    const saved = result.order;
    const mergedOrder = { ...updatedOrder, ...saved, clientPayments: nextClientPayments, supplierPayments: nextSupplierPayments };
    const idx = orders.findIndex(x => x.id === orderId);
    if (idx !== -1) orders[idx] = mergedOrder;

    if (checkEl) checkEl.value = '';
    if (debtEl) debtEl.value = '';

    for (const cashEntry of (result.cashEntries || [])) {
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

  openOrdersScreen();
}

// ---------- РЕНДЕР КАРТОЧКИ ЗАКАЗА ----------
function renderOrderCard(o) {
  const canMark = canMarkWorkerDone() &&
    o.responsible === currentWorkerName;
  const canEditListActions = currentRole === 'owner' || currentRole === 'manager';
  const canDeleteListAction = canDeleteOrder();
  const canQuickConfirm = canQuickConfirmOrderAmounts(o);
  const cardClickAction = canEditListActions ? `openOrderModal('${escapeAttr(o.id)}')` : `openOrderDetail('${escapeAttr(o.id)}')`;
  const clientTotal = getOrderClientTotal(o);
  const clientPaidInlineHtml = clientTotal > 0
    ? `<span class="order-meta-inline-money" title="Клиент оплатил / общая сумма заказа"><span>${(Number(o.debt) || 0).toLocaleString('ru')}</span><span class="order-meta-money-separator">/</span><span>${clientTotal.toLocaleString('ru')} ₴</span></span>`
    : '';
  const supplierPaidInlineHtml = (Number(o.check) > 0 || Number(o.purchase) > 0)
    ? `<span class="order-meta-inline-money"><span>${(Number(o.check) || 0).toLocaleString('ru')}</span><span class="order-meta-money-separator">/</span><span>${(Number(o.purchase) || 0).toLocaleString('ru')} ₴</span></span>`
    : '';
  const specialistBonusFlags = [
    currentWorkerName === 'Roma' && Number(o.tatu) > 0
      ? `<span class="status-badge status-call" title="В заказе есть тату">Тату ${(Number(o.tatu) || 0).toLocaleString('ru')} ₴</span>`
      : '',
    currentWorkerName === 'Lyosha' && Number(o.toning) > 0
      ? `<span class="status-badge status-own-warehouse" title="В заказе есть тонировка">Тонировка ${(Number(o.toning) || 0).toLocaleString('ru')} ₴</span>`
      : '',
  ].filter(Boolean).join('');
  return `
    <div class="order-card ${getOrderCardStateClass(o)}" onclick="${cardClickAction}">
      <div class="order-card-top">
        <div class="order-card-left">
          <div class="order-card-status-row">
            <span class="order-id">${o.id}</span>
            ${renderOrderStatusBadges(o)}
            ${specialistBonusFlags}
          </div>
          <div class="order-card-title-row">
            <span class="order-name">${o.car || '—'}</span>
          </div>
        </div>
        <div class="order-card-actions">
          ${canEditListActions ? `
            <div class="order-card-action-dropdown" onclick="event.stopPropagation()">
              <button class="icon-action-btn order-card-action-trigger" title="Действия заказа" onclick="toggleOrderActionMenu('${o.id}', event)">${icon('list')}</button>
              <div class="order-card-action-menu" data-order-action-menu="${escapeAttr(o.id)}">
                <button class="icon-action-btn" title="Скопировать данные" onclick="event.stopPropagation(); closeOrderActionMenus(); copyOrderSummary('${o.id}')">${icon('clipboard-list')}</button>
                <button class="icon-action-btn" title="Создать дубликат" onclick="event.stopPropagation(); closeOrderActionMenus(); duplicateOrder('${o.id}')">${icon('plus')}</button>
                <button class="icon-action-btn" title="Редактировать" onclick="event.stopPropagation(); closeOrderActionMenus(); openOrderModal('${o.id}')">${icon('pencil')}</button>
                ${canDeleteListAction ? `<button type="button" class="icon-action-btn icon-action-danger" title="Удалить" onpointerdown="event.stopPropagation()" onclick="deleteOrder('${escapeAttr(o.id)}', event)">${icon('trash-2')}</button>` : ''}
              </div>
            </div>
          ` : ''}
          ${canMark ? `
            <button
              class="btn-check-done ${o.workerDone ? 'done' : ''}"
              onclick="${o.workerDone ? 'event.stopPropagation(); return false;' : `event.stopPropagation(); toggleWorkerDone('${o.id}')`}"
              title="${o.workerDone ? 'Заказ уже отмечен выполненным' : 'Отметить выполненным'}"
              ${o.workerDone ? 'disabled' : ''}
            >
              <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <polyline points="2,7 5.5,10.5 12,3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          ` : ''}
        </div>
      </div>
      <div class="order-card-meta">
        <span class="order-meta-item order-meta-pill order-meta-client-pill ${clientPaidInlineHtml ? 'order-meta-client-money-pill' : ''}">${icon('user')} <span class="order-meta-client-name">${o.client || '—'}</span>${clientPaidInlineHtml}</span>
        <span class="order-meta-item order-meta-pill">${icon('phone')} ${o.phone || '—'}</span>
        <span class="order-meta-item order-meta-pill">${icon('calendar')} ${formatDate(o.date)}</span>
        <span class="order-meta-item order-meta-pill">${getWorkerDisplayPair(o.responsible, o.assistant)}</span>
        ${o.manager ? `<span class="order-meta-item order-meta-pill">${getWorkerDisplayName(o.manager)}</span>` : ''}
        ${(o.warehouse || supplierPaidInlineHtml) ? `<span class="order-meta-item order-meta-pill">${o.warehouse || 'Склад —'}${supplierPaidInlineHtml}</span>` : ''}
        
      </div>
      ${canQuickConfirm ? `
        <div onclick="event.stopPropagation()" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:10px;">
          <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:10px;align-items:end;">
            <label style="display:flex;flex-direction:column;gap:6px;min-width:0;">
              <span style="font-size:12px;color:var(--text3);">Складу</span>
              <input id="quick-supplier-${o.id}" type="number" inputmode="decimal" class="form-input" value="" placeholder="0" onclick="event.stopPropagation()">
            </label>
            <label style="display:flex;flex-direction:column;gap:6px;min-width:0;">
              <span style="font-size:12px;color:var(--text3);">Клиент оплатил</span>
              <input id="quick-client-${o.id}" type="number" inputmode="decimal" class="form-input" value="" placeholder="0" onclick="event.stopPropagation()">
            </label>
            <button id="quick-confirm-${o.id}" class="btn-primary" style="width:44px;height:44px;padding:0;font-size:22px;font-weight:800;line-height:1;" onclick="event.stopPropagation(); confirmSeniorOrderAmounts('${o.id}')" title="Подтвердить">+</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function closeOrderActionMenus() {
  document.querySelectorAll('.order-card-action-menu.active').forEach(menu => menu.classList.remove('active'));
}

function toggleOrderActionMenu(orderId, event) {
  event?.stopPropagation();
  const menu = Array.from(document.querySelectorAll('.order-card-action-menu'))
    .find(item => item.dataset.orderActionMenu === String(orderId));
  if (!menu) return;
  const isOpen = menu.classList.contains('active');
  closeOrderActionMenus();
  if (!isOpen) menu.classList.add('active');
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
    if (o.workerDone && currentRole !== 'senior') badges.push('<span class="status-badge status-done">✓ Выполнен</span>');
  }
  badges.push(statusBadge(getEffectivePaymentStatus(o)));
  return badges.join('');
}

function _isCurrentWorkerOrder(order) {
  return order && (order.responsible === currentWorkerName || order.assistant === currentWorkerName);
}

function _filterSpecialistOrdersByTab(list) {
  const today = todayStr();
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

function _getOrdersListSignature(scope, { search, dateF = '', statF = '', sort = '', ym = '' }) {
  return [
    scope,
    currentRole || '',
    currentOrderTab || '',
    currentWorkerTab || '',
    search || '',
    dateF || '',
    statF || '',
    sort || '',
    ym || '',
  ].join('|');
}

function _prepareVisibleOrders(list, signature) {
  if (lastOrdersListSignature !== signature) {
    ordersVisibleCount = 10;
    lastOrdersListSignature = signature;
  }
  return list.slice(0, ordersVisibleCount);
}

function loadMoreOrders() {
  ordersVisibleCount += 10;
  if (currentMonthFilter) {
    renderOrdersForMonth(currentMonthFilter);
  } else {
    renderOrders();
  }
}

function refreshOrdersView() {
  if (currentMonthFilter) {
    renderOrdersForMonth(currentMonthFilter);
  } else {
    renderOrders();
  }
}

function _renderOrdersListWithLoadMore(container, list, signature) {
  const visibleList = _prepareVisibleOrders(list, signature);
  const hasMore = visibleList.length < list.length;
  container.innerHTML = visibleList.map(o => renderOrderCard(o)).join('')
    + (hasMore ? `
      <div style="display:flex;justify-content:center;margin-top:14px;">
        <button class="btn-secondary" onclick="loadMoreOrders()">Подгрузить еще</button>
      </div>
    ` : '');
}

// ---------- РЕНДЕР СПИСКА ----------
function renderOrders() {
  populateOrderWorkerFilter();
  const search = (document.getElementById('filter-search')?.value || '').toLowerCase();
  const dateF  = document.getElementById('filter-date')?.value || '';
  const statF  = document.getElementById('filter-status')?.value || '';
  const workerF = document.getElementById('filter-worker')?.value || '';
  const sort   = document.getElementById('filter-sort')?.value || 'desc';

  let list = [...orders];

  if (currentRole === 'owner' || currentRole === 'manager') {
    if (currentOrderTab === 'planner') {
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

  if (search) list = list.filter(o =>
    (o.client  || '').toLowerCase().includes(search) ||
    (o.car     || '').toLowerCase().includes(search) ||
    (o.phone   || '').toLowerCase().includes(search) ||
    (o.id      || '').toLowerCase().includes(search)
  );
  if (dateF) list = list.filter(o => o.date === dateF);
  if (statF) list = list.filter(o => getEffectivePaymentStatus(o) === statF);
  if (workerF) list = list.filter(o => o.responsible === workerF || o.assistant === workerF || o.manager === workerF);

  list.sort((a, b) => {
    const ad = a.date || '';
    const bd = b.date || '';
    return sort === 'asc' ? ad.localeCompare(bd) : bd.localeCompare(ad);
  });

  const container = document.getElementById('orders-list');
  const signature = _getOrdersListSignature('all', { search, dateF, statF, sort, workerF });

  if (!list.length) {
    lastOrdersListSignature = signature;
    ordersVisibleCount = 10;
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

  _renderOrdersListWithLoadMore(container, list, signature);
}

function _isCallOrderVisibleInCurrentContext(o) {
  if (!o?.callStatus || o.ownWarehouse || o.workerDone || o.isCancelled) return false;
  if (currentRole !== 'manager') return true;
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
      ${canDelete ? `<button class="icon-action-btn icon-action-danger" title="Удалить" onclick="deleteOrder('${escapeAttr(o.id)}', event)">${icon('trash-2')}</button>` : ''}
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
        ${field(`${icon('tool')} Вид послуги`, o.serviceType)}
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
  if (!confirm('Удалить этот заказ? Это действие нельзя отменить.')) return;
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
    ['Молдинг', o.molding],
    ['Доп. работы', o.extraWork],
    ['Тату', o.tatu],
    ['Тонировка', o.toning],
    ['Доставка', o.delivery],
  ].filter(([, amount]) => Number(amount) > 0);
  const listedServicesTotal = services.reduce((sum, [, amount]) => sum + (Number(amount) || 0), 0);

  if (o.car) lines.push(`Авто: ${o.car}`);
  if (o.phone) lines.push(`Телефон: ${o.phone}`);
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
    const saved = await sbInsertOrder(duplicate);
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
    const cur = (document.getElementById('f-service-type')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
    const groups = [...new Set(SERVICE_TYPE_OPTIONS.map(item => item.group))];
    svcBox.innerHTML = groups.map(group => `
      <div class="service-group">
        <div class="service-group-title">${group}</div>
        <div class="service-group-options">
          ${SERVICE_TYPE_OPTIONS.filter(item => item.group === group).map(item => `
            <label class="checkbox">
              <input type="checkbox" value="${item.name}" ${cur.includes(item.name) ? 'checked' : ''} onchange="syncServiceTypes(this)">
              <span>${item.name}</span>
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

// ---------- ФУНКЦИИ ИСТОРИИ ОПЛАТ И ДОРАБОТКИ ----------

function toggleReworkSection() {}

function renderClientPayments() {
  const listEl = document.getElementById('client-payments-list');
  if (!listEl) return;
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
      <button type="button" class="icon-btn" style="width:20px;height:20px;" onclick="removeClientPayment(${idx})">
        <i data-lucide="trash-2" style="width:10px;height:10px;color:var(--red);"></i>
      </button>
    </div>
  `).join('');
  initIcons();
}

function renderSupplierPayments() {
  const listEl = document.getElementById('supplier-payments-list');
  if (!listEl) return;
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
      <button type="button" class="icon-btn" style="width:20px;height:20px;" onclick="removeSupplierPayment(${idx})">
        <i data-lucide="trash-2" style="width:10px;height:10px;color:var(--red);"></i>
      </button>
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

function addClientPayment() {
  const amtEl = document.getElementById('f-new-payment-amount');
  const dateEl = document.getElementById('f-new-payment-date');
  const methodEl = document.getElementById('f-payment-method');
  const amount = Number(amtEl.value);
  if (!amount || amount <= 0) return showToast('Введите сумму оплаты', 'error');
  const date = dateEl.value || todayStr();
  const method = normalizePaymentMethod(methodEl?.value || '');
  
  currentClientPayments.push({ amount, date, method, timestamp: new Date().toISOString() });
  amtEl.value = '';
  renderClientPayments();
  syncClientPaidFromPayments();
  recalcTotal();
}

function addSupplierPayment() {
  const amtEl = document.getElementById('f-new-supplier-payment-amount');
  const dateEl = document.getElementById('f-new-supplier-payment-date');
  const methodEl = document.getElementById('f-new-supplier-payment-method');
  const amount = Number(amtEl.value);
  if (!amount || amount <= 0) return showToast('Введите сумму поставщику', 'error');
  const date = dateEl.value || todayStr();
  const method = normalizePaymentMethod(methodEl?.value || '');

  currentSupplierPayments.push({ amount, date, method, timestamp: new Date().toISOString() });
  amtEl.value = '';
  renderSupplierPayments();
  syncSupplierPaidFromPayments();
  recalcTotal();
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
  editingOrderId = id;
  currentClientPayments = [];
  currentSupplierPayments = [];

  populateRefSelects();
  populateClientDatalist();
  setOrderModalPanel('order');

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

  // Разворачиваем финансовый блок при открытии
  const finBody = document.getElementById('finance-section-body');
  const finChevron = document.getElementById('finance-chevron');
  if (finBody) finBody.style.display = 'block';
  if (finChevron) finChevron.style.transform = 'rotate(180deg)';

  // Прячем live-total пока нет данных
  const liveTotalEl = document.getElementById('modal-live-total');
  if (liveTotalEl) liveTotalEl.style.display = 'none';

  applyOrderFormDateTimeDefaults();
  updateOrderSaveButtonLabel();
  renderSupplierPayments();
  renderClientPayments(); // рендерим историю оплат (изначально)
  syncSupplierPaidFromPayments();
  syncClientPaidFromPayments();
  initOrderVinDecoder();

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
  document.querySelectorAll('[data-order-modal-panel]').forEach(el => {
    el.style.display = el.dataset.orderModalPanel === nextPanel ? '' : 'none';
  });
  document.querySelectorAll('[data-order-modal-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.orderModalTab === nextPanel);
  });
}

function updateOrderSaveButtonLabel() {
  const status = document.getElementById('f-order-status')?.value || '';
  const label = document.getElementById('order-save-label');
  const btn = document.getElementById('order-save-btn');
  if (btn) {
    btn.classList.remove('order-save-selection', 'order-save-call', 'order-save-planner', 'order-save-cancelled', 'order-save-own-warehouse');
  }
  if (!label) return;
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
    svcHidden.value = o.serviceType || '';
    syncServiceTypes(null, false);
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
  // перерисовать чекбоксы комплектации
  const confArr = (o.configuration || '').split(',');
  document.querySelectorAll('#f-configuration-checkboxes input[type="checkbox"]').forEach(el => {
    el.checked = confArr.includes(el.value);
  });
  syncConfiguration();
}

function clearOrderForm() {
  const ids = [
    'f-date','f-time','f-responsible','f-client','f-phone','f-address','f-vin','f-car','f-code',
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
  document.querySelectorAll('#service-type-checkboxes input[type="checkbox"]').forEach(el => el.checked = false);
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

// Collapse финансового блока
function toggleFinanceSection() {
  const body = document.getElementById('finance-section-body');
  const chevron = document.getElementById('finance-chevron');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
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
  const missing = [];

  if (status === '') {
    if (!data.phone) missing.push('номер телефона');
    if (!data.car) missing.push('автомобиль');
  }

  if (status === 'call') {
    if (!data.manager) missing.push('менеджер');
    if (!data.phone) missing.push('номер телефона');
    if (!data.car) missing.push('автомобиль');
  }

  if (status === 'inWork') {
    if (!data.responsible) missing.push('ответственный');
    if (!data.assistant) missing.push('помощник');
    if (!data.phone) missing.push('номер телефона');
    if (!data.car) missing.push('автомобиль');
    if (!data.manager) missing.push('менеджер');
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
    const result = await sbSaveOrderWithCash(data, {
      isNew,
      cashEntries,
      rollbackOrder: existingOrder,
    });
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

    closeOrderModal();
    if (currentMonthFilter) {
      renderOrdersForMonth(currentMonthFilter);
    } else {
      renderMonths();
    }
    renderOrders();
    renderHome();
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
  const search = (document.getElementById('filter-month-search')?.value || '').toLowerCase();
  const filterVal = document.getElementById('filter-month')?.value || '';

  const map = {};
  for (const o of orders) {
    if (!o.date) continue;
    const year = o.date.slice(0, 4);
    if (window.currentYearFilter && year !== window.currentYearFilter) continue;
    
    const ym = o.date.slice(0, 7);
    if (filterVal && ym !== filterVal) continue;
    if (search) {
      const haystack = [o.client, o.phone, o.car, o.id, o.responsible, o.code,
        o.equipment, o.notes, o.author,
        o.paymentStatus, o.paymentMethod, o.glass, o.mount, o.molding,
        o.extraWork, o.tatu, o.toning].map(v => String(v||'')).join(' ').toLowerCase();
      if (!haystack.includes(search)) continue;
    }
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
  const search = (document.getElementById('filter-search')?.value || '').toLowerCase();
  const dateF  = document.getElementById('filter-date')?.value || '';
  const statF  = document.getElementById('filter-status')?.value || '';
  const workerF = document.getElementById('filter-worker')?.value || '';
  const sort   = document.getElementById('filter-sort')?.value || 'desc';

  let list = orders.filter(o => o.date && o.date.slice(0, 7) === ym);

  if (currentRole === 'owner' || currentRole === 'manager') {
    if (currentOrderTab === 'planner') {
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

  if (search) list = list.filter(o =>
    (o.client  || '').toLowerCase().includes(search) ||
    (o.car     || '').toLowerCase().includes(search) ||
    (o.phone   || '').toLowerCase().includes(search) ||
    (o.id      || '').toLowerCase().includes(search)
  );
  if (dateF) list = list.filter(o => o.date === dateF);
  if (statF) list = list.filter(o => getEffectivePaymentStatus(o) === statF);
  if (workerF) list = list.filter(o => o.responsible === workerF || o.assistant === workerF || o.manager === workerF);
  list.sort((a, b) => {
    const ad = a.date || '';
    const bd = b.date || '';
    return sort === 'asc' ? ad.localeCompare(bd) : bd.localeCompare(ad);
  });

  const container = document.getElementById('orders-list');
  const signature = _getOrdersListSignature('month', { search, dateF, statF, sort, workerF, ym });

  if (!list.length) {
    lastOrdersListSignature = signature;
    ordersVisibleCount = 10;
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icon('clipboard-list')}</div>
        <h3>Записей нет</h3>
        <p>В этом месяце нет заказов</p>
      </div>`;
    return;
  }

  _renderOrdersListWithLoadMore(container, list, signature);
}

// ---------- WORKER DONE — СПЕЦИАЛИСТ ОТМЕЧАЕТ ВЫПОЛНЕНИЕ ----------

async function toggleWorkerDone(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o) return;
  if (o.responsible !== currentWorkerName) return;
  if (!isOrderFinanciallyActive(o)) {
    showToast('Выполнить можно только заказ в работе', 'error');
    return;
  }
  if (o.workerDone) return;
  if (!confirm(`Отметить заказ ${o.id} выполненным? После этого будет начислена зарплата.`)) return;
  o.workerDone = true;
  try {
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

    // 3. Глобальные бонусы по тату/тонировке
    (workers || []).forEach(worker => {
      const bonus = _calcTatuBonus(worker.name, order) + _calcToningBonus(worker.name, order);
      if (bonus > 0) {
        affectedWorkers.add(worker.name);
        amounts[worker.name] = (amounts[worker.name] || 0) + bonus;
      }
    });

    // 4. Менеджер — если указан в поле manager заказа и имеет systemRole === 'manager'
    const managerName = order.manager || '';
    if (managerName && workers.find(x => x.name === managerName && x.systemRole === 'manager')) {
      affectedWorkers.add(managerName);
      amounts[managerName] = (amounts[managerName] || 0) + _calcManagerSalary(order);
    }
  }


  // Всегда берём актуальные записи ЗП по этому заказу из БД
  let existingInDb = [];
  try {
    existingInDb = await sbFetchSalariesByOrder(order.id) || [];
  } catch (e) { /* если упало — продолжаем с пустым массивом */ }

  // После первого выполнения заказа ЗП по этому order_id считается зафиксированной:
  // последующие правки сумм/полей заказа не должны менять уже начисленные записи.
  if (order.workerDone && existingInDb.length) {
    if (typeof workerSalaries !== 'undefined') {
      try {
        workerSalaries = await sbFetchWorkerSalaries(currentWorkerName);
      } catch (e) { /* не критично */ }
    }
    return;
  }

  const workerNamesToProcess = new Set([...Object.keys(amounts), ...existingInDb.map(s => s.worker_name)]);
  existingInDb.forEach(s => affectedWorkers.add(s.worker_name));

  for (const workerName of workerNamesToProcess) {
    const amount = amounts[workerName] || 0;
    const existingEntry = existingInDb.find(s => s.worker_name === workerName);

    if (amount > 0) {
      if (!existingEntry) {
        await sbInsertWorkerSalary({ worker_name: workerName, date: order.date, amount, order_id: order.id });
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

function _canSyncDailyBaseSalaryForWorker(workerName) {
  if (!workerName) return false;
  if (currentRole === 'owner') return true;
  if (workerName === currentWorkerName) return true;
  if (currentRole !== 'senior' && currentRole !== 'extra') return false;
  return getSeniorWorkedAssistants().some(worker => worker.name === workerName);
}

async function _syncDailyBaseSalaryEntry(workerName, date) {
  if (!workerName || !date) return;

  const amount = calcDailyBaseSalary(workerName, date);
  const orderId = _dailyBaseOrderId();

  let entries = [];
  try {
    entries = await sbFetchWorkerSalaries(workerName) || [];
  } catch (e) {
    return;
  }

  const dayEntries = entries.filter(s => s.date === date && s.order_id === orderId);
  const primaryEntry = dayEntries[0] || null;
  const duplicateEntries = dayEntries.slice(1);

  if (amount > 0) {
    if (!primaryEntry) {
      await sbInsertWorkerSalary({ worker_name: workerName, date, amount, order_id: orderId });
    } else if (Number(primaryEntry.amount) !== amount) {
      await sbUpdateWorkerSalary(primaryEntry.id, amount);
    }
  } else if (primaryEntry) {
    await sbDeleteWorkerSalary(primaryEntry.id);
  }

  for (const duplicateEntry of duplicateEntries) {
    await sbDeleteWorkerSalary(duplicateEntry.id);
  }
}

// ---------- ТАБЫ ЗАКАЗОВ ----------

function initOrderTabs() {
  const tabsEl = document.getElementById('orders-tabs');

  if (currentRole === 'owner' || currentRole === 'manager') {
    if (tabsEl) {
      tabsEl.style.display = 'flex';
      tabsEl.innerHTML = `
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
}

// синхронизация чекбоксов услуг с hidden-полем
function syncServiceTypes(changedEl = null, recalc = true) {
  const box = document.querySelectorAll('#service-type-checkboxes input[type="checkbox"]');
  if (changedEl?.value === CUSTOM_SERVICE_TYPE_NAME && changedEl.checked) {
    box.forEach(el => {
      if (el !== changedEl) el.checked = false;
    });
  } else if (changedEl?.checked) {
    box.forEach(el => {
      if (el.value === CUSTOM_SERVICE_TYPE_NAME) el.checked = false;
    });
  }
  const vals = [...box].filter(el => el.checked).map(el => el.value);
  const hidden = document.getElementById('f-service-type');
  if (hidden) hidden.value = vals.join(', ');
  if (recalc) recalcTotal();
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
