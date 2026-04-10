// ============================================================
// ORDERS.JS — список заказов, детали, модал создания/редактирования
// ============================================================

let editingOrderId  = null;      // null = новый, иначе id редактируемого
let currentOrderTab = 'selection';  // 'selection' | 'planner' | 'done' — для owner/manager
let currentWorkerTab = 'today'; // 'today' | 'done' | 'future' | 'past' | 'all' — для специалистов
let ordersVisibleCount = 10;
let lastOrdersListSignature = '';
const SERVICE_TYPE_OPTIONS = [
  'Монтаж лобового',
  'Монтаж бокового',
  'Монтаж заднего',
  'Срезка лобового',
  'Срезка бокового',
  'Срезка заднего',
  'Вклейка лобового',
  'Вклейка бокового',
  'Вклейка заднего',
];

function canMarkWorkerDone() {
  // Галочка доступна только специалисту (senior) для своих заказов
  return currentRole === 'senior';
}

function canQuickConfirmOrderAmounts(order) {
  return currentRole === 'senior' && order?.responsible === currentWorkerName && !order?.isCancelled && !order?.workerDone;
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

function calcClientPaymentStatus(totalPaid, totalAmount) {
  const paid = Number(totalPaid) || 0;
  const total = Number(totalAmount) || 0;
  if (paid <= 0) return 'Не оплачено';
  if (total > 0 && paid >= total) return 'Оплачено';
  return 'Частично оплачено';
}

function calcSupplierPaymentStatus(totalPaid, glassPurchase) {
  const paid = Number(totalPaid) || 0;
  const purchase = Number(glassPurchase) || 0;
  if (paid <= 0) return 'Не оплачено';
  if (purchase > 0 && paid >= purchase) return 'Оплачено';
  return 'Частично оплачено';
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
      timestamp: new Date().toISOString(),
    });
  }

  if (newClientPaymentAmount > 0) {
    nextClientPayments.push({
      amount: newClientPaymentAmount,
      date: todayStr(),
      timestamp: new Date().toISOString(),
    });
  }

  const totalSupplierPaid = nextSupplierPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalClientPaid = nextClientPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const checkDiff = totalSupplierPaid - oldCheck;
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

  if (btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = 'Сохранение...';
  }

  try {
    const saved = await sbUpdateOrder(updatedOrder);
    const mergedOrder = { ...saved, ...updatedOrder };
    const idx = orders.findIndex(x => x.id === orderId);
    if (idx !== -1) orders[idx] = mergedOrder;

    if (checkEl) checkEl.value = '';
    if (debtEl) debtEl.value = '';

    if (checkDiff !== 0) {
      const amount = -checkDiff;
      const typeStr = checkDiff > 0 ? 'Списание' : 'Возврат';
      const fDate = saved.date ? formatDate(saved.date) : '—';
      const fTime = saved.time || '—';
      const fCar = saved.car || '—';
      const targetWorker = saved.responsible || currentWorkerName;
      const cashComment = `${typeStr} за стекло ${saved.id}, ${fDate} ${fTime}, авто: ${fCar}, склад: ${saved.warehouse || '—'}`;

      const cashEntry = await sbInsertCashEntry({
        worker_name: targetWorker,
        amount,
        comment: cashComment,
      });

      if (typeof workerCashLog !== 'undefined' && targetWorker === currentWorkerName) {
        workerCashLog.unshift(cashEntry);
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
  const el = document.getElementById('orders-actions');
  if (canCreateOrder()) {
    el.innerHTML = `<button class="btn-primary" onclick="openOrderModal(null)">+ Добавить запись</button>`;
  } else {
    el.innerHTML = '';
  }
}

// ---------- РЕНДЕР КАРТОЧКИ ЗАКАЗА ----------
function renderOrderCard(o) {
  const canMark = canMarkWorkerDone() &&
    o.responsible === currentWorkerName;
  const canQuickConfirm = canQuickConfirmOrderAmounts(o);
  return `
    <div class="order-card" onclick="openOrderDetail('${o.id}')">
      <div class="order-card-top">
        <div class="order-card-left">
          <span class="order-id">${o.id}</span>
          <span class="order-name">${o.car || '—'}</span>
          ${getOrderClientTotal(o) > 0 ? `<span class="order-meta-item" style="font-weight:700;"><span style="color:var(--yellow);">${(Number(o.debt) || 0).toLocaleString('ru')}</span><span style="color:var(--text3);font-weight:600;">/</span><span style="color:var(--accent);">${getOrderClientTotal(o).toLocaleString('ru')}</span></span>` : ''}
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${o.isCancelled ? '<span class="status-badge" style="background:var(--red,#DC2626);color:#fff;">Отменен</span>' : ''}
          ${o.workerDone && !o.isCancelled ? '<span class="status-badge status-done">✓ Выполнен</span>' : ''}
          ${statusBadge(getEffectivePaymentStatus(o))}
          ${canMark ? `
            <button
              class="btn-check-done ${o.workerDone ? 'done' : ''}"
              onclick="event.stopPropagation(); toggleWorkerDone('${o.id}')"
              title="${o.workerDone ? 'Отменить выполнение' : 'Отметить выполненным'}"
            >
              <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <polyline points="2,7 5.5,10.5 12,3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          ` : ''}
        </div>
      </div>
      <div class="order-card-meta">
        <span class="order-meta-item">☎️ ${o.phone || '—'}</span>
        <span class="order-meta-item">🗓️ ${formatDate(o.date)}</span>
        <span class="order-meta-item">🚧 ${o.responsible || '—'}${o.assistant ? ' + ' + o.assistant : ''}</span>
        ${o.warehouse ? `<span class="order-meta-item">🏭 ${o.warehouse}</span>` : ''}
        ${(Number(o.check) > 0 || Number(o.purchase) > 0) ? `<span class="order-meta-item" style="font-weight:700;color:var(--text2);">${(Number(o.check) || 0).toLocaleString('ru')}/${(Number(o.purchase) || 0).toLocaleString('ru')}</span>` : ''}
        <span class="order-meta-item">${o.client || '—'}</span>
      </div>
      ${canQuickConfirm ? `
        <div onclick="event.stopPropagation()" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:10px;">
          <div style="font-size:12px;font-weight:700;color:var(--text3);letter-spacing:0.04em;">ПОДТВЕРЖДЕНИЕ СУММ</div>
          <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:10px;align-items:end;">
            <label style="display:flex;flex-direction:column;gap:6px;min-width:0;">
              <span style="font-size:12px;color:var(--text3);">Складу</span>
              <input id="quick-supplier-${o.id}" type="number" inputmode="decimal" class="form-input" value="" placeholder="0" onclick="event.stopPropagation()">
            </label>
            <label style="display:flex;flex-direction:column;gap:6px;min-width:0;">
              <span style="font-size:12px;color:var(--text3);">Клиент оплатил</span>
              <input id="quick-client-${o.id}" type="number" inputmode="decimal" class="form-input" value="" placeholder="0" onclick="event.stopPropagation()">
            </label>
            <button id="quick-confirm-${o.id}" class="btn-primary" style="white-space:nowrap;height:44px;" onclick="event.stopPropagation(); confirmSeniorOrderAmounts('${o.id}')">Подтвердить</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function _isCurrentWorkerOrder(order) {
  return order && (order.responsible === currentWorkerName || order.assistant === currentWorkerName);
}

function _filterSpecialistOrdersByTab(list) {
  const today = todayStr();
  const ownOrders = list.filter(o => _isCurrentWorkerOrder(o) && !o.isCancelled);

  if (currentWorkerTab === 'today') {
    return ownOrders.filter(o => o.inWork && !o.workerDone && o.date === today);
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
  const search = (document.getElementById('filter-search')?.value || '').toLowerCase();
  const dateF  = document.getElementById('filter-date')?.value || '';
  const statF  = document.getElementById('filter-status')?.value || '';
  const sort   = document.getElementById('filter-sort')?.value || 'desc';

  let list = [...orders];

  if (currentRole === 'owner' || currentRole === 'manager') {
    if (currentOrderTab === 'planner') {
      list = list.filter(o => o.inWork && !o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'selection') {
      list = list.filter(o => !o.inWork && !o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'done') {
      list = list.filter(o => o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'debt') {
      list = list.filter(o => !o.isCancelled && ['Не оплачено', 'Частично оплачено'].includes(getEffectivePaymentStatus(o)));
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

  list.sort((a, b) => {
    const ad = a.date || '';
    const bd = b.date || '';
    return sort === 'asc' ? ad.localeCompare(bd) : bd.localeCompare(ad);
  });

  const container = document.getElementById('orders-list');
  const signature = _getOrdersListSignature('all', { search, dateF, statF, sort });

  if (!list.length) {
    lastOrdersListSignature = signature;
    ordersVisibleCount = 10;
    const specialistEmptyMap = {
      today: '<h3>Нет сегодняшних записей</h3><p>На сегодня задач нет</p>',
      done: '<h3>Нет выполненных записей</h3><p>Пока ничего не завершено</p>',
      future: '<h3>Нет будущих записей</h3><p>Будущих задач пока нет</p>',
      past: '<h3>Нет прошедших записей</h3><p>Просроченных задач нет</p>',
      all: '<h3>Записей не найдено</h3><p>У вас пока нет заказов</p>',
    };
    const msg = (currentRole !== 'owner' && currentRole !== 'manager')
      ? (specialistEmptyMap[currentWorkerTab] || specialistEmptyMap.all)
      : '<h3>Записей не найдено</h3><p>Попробуйте изменить фильтры или добавьте новую запись</p>';
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div>${msg}</div>`;
    return;
  }

  _renderOrdersListWithLoadMore(container, list, signature);
}

// ---------- ДЕТАЛЬНЫЙ ЭКРАН ЗАКАЗА ----------
function openOrderDetail(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;

  const el = document.getElementById('order-detail-content');

  const canEdit   = currentRole === 'owner' || currentRole === 'manager';
  const canDelete = canDeleteOrder();

  // Кнопки в топ-баре рядом с "назад"
  const actionsEl = document.getElementById('order-detail-actions');
  if (actionsEl) {
    actionsEl.innerHTML = `
      <button class="icon-action-btn" title="Скопировать данные" onclick="copyOrderSummary('${o.id}')">📋</button>
      ${canEdit   ? `<button class="icon-action-btn" title="Редактировать" onclick="openOrderModal('${o.id}')">✏️</button>` : ''}
      ${canDelete ? `<button class="icon-action-btn icon-action-danger" title="Удалить" onclick="deleteOrder('${o.id}')">🗑️</button>` : ''}
    `;
  }

  el.innerHTML = `
    <div class="detail-header">
      <div class="detail-header-top">
        <div>
          <div style="font-size:12px;color:var(--text3);font-family:'JetBrains Mono',monospace;margin-bottom:6px;">${o.id}</div>
          <div class="detail-title">${o.car || '—'}</div>
          <div class="detail-subtitle">🗓️ ${formatDate(o.date)}${o.time ? ' · 🕐 ' + o.time : ''} &nbsp;·&nbsp; 🚧 ${o.responsible || '—'}</div>
        </div>
        <div class="detail-badges">
          ${o.inWork ? '<span class="status-badge" style="background:#F59E0B;color:#fff;">🔨 Планёрка</span>' : ''}
          ${statusBadge(getEffectivePaymentStatus(o))}
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">📋 Основная информация</div>
      <div class="detail-grid">
        ${field('👤 Клиент', o.client)}
        ${field('☎️ Телефон', o.phone, 'mono')}
        ${field('📍 Место', o.address)}
        ${field('🚗 Авто', o.car)}
        ${field('🔢 Єврокод', o.code, 'mono')}
        ${field('🕐 Время', o.time)}
        ${field('👥 Менеджер', o.author)}
        ${field('📋 Отв. менеджер', o.manager)}
      </div>
      ${o.notes ? `<div style="margin-top:14px;padding:12px;background:var(--surface2);border-radius:8px;font-size:13px;color:var(--text2);">📝 ${o.notes}</div>` : ''}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">⚙️ Послуги та роботи</div>
      <div class="detail-grid">
        ${field('⚙️ Монтаж', o.mount ? o.mount + ' ₴' : '')}
        ${field('🛠️ Вид послуги', o.serviceType)}
        ${field('*️⃣ Молдинг', o.molding)}
        ${field('⚙️ Доп. работы', o.extraWork)}
        ${field('*️⃣ Доп услуги', o.tatu)}
        ${field('Тонировка', o.toning)}
        ${field('🚛 Доставка', o.delivery ? o.delivery + ' ₴' : '')}
      </div>
    </div>

    ${(canViewFinance() || (currentRole === 'extra' && (o.responsible === currentWorkerName || o.assistant === currentWorkerName))) ? `
    <div class="detail-section">
      <div class="detail-section-title">💸 Финансы</div>
      <div class="detail-grid">
    ${field('Расчёт долга клиента', getEffectivePaymentStatus(o))}
    ${field('Сумма поставщику', o.check ? o.check + ' ₴' : '')}
    ${field('Расчёт долга', o.debt ? o.debt + ' ₴' : '')}
    ${field('Дата расчёта долга', formatDate(o.debtDate))}
    ${field('📌 Общая сумма работ', o.total ? o.total + ' ₴' : '', 'mono')}
        ${field('Молдинг Автор', o.moldingAuthor)}
        ${field('🤝 Партнер', o.partner)}
        ${field('📦 Статус оплати постачальнику', getEffectiveSupplierStatus(o))}
        ${field('Сумма покупки стекла', o.purchase ? o.purchase + ' ₴' : '')}
        ${field('Сумма продажи стекла', o.income ? o.income + ' ₴' : '')}
        ${field('Маржа с продажи стекла', o.remainder !== undefined ? o.remainder + ' ₴' : '')}
        ${field('Дропшиппер', o.dropshipper)}
        ${field('Выплата дропшипперу', o.dropshipperPayout ? o.dropshipperPayout + ' ₴' : '')}
        ${field('Выплата менеджеру (стекло)', o.payoutManagerGlass ? o.payoutManagerGlass + ' ₴' : '')}
        ${field('Выплата ответственному (стекло)', o.payoutRespGlass ? o.payoutRespGlass + ' ₴' : '')}
        ${field('Выплата Лёше (тонировка)', o.payoutLesha ? o.payoutLesha + ' ₴' : '')}
        ${field('Выплата Роме (тату)', o.payoutRoma ? o.payoutRoma + ' ₴' : '')}
        ${field('Выплата за доп. работы (ответств.)', o.payoutExtraResp ? o.payoutExtraResp + ' ₴' : '')}
        ${field('Выплата за доп. работы (помощ.)', o.payoutExtraAssist ? o.payoutExtraAssist + ' ₴' : '')}
        ${field('Выплата за молдинг (ответств.)', o.payoutMoldingResp ? o.payoutMoldingResp + ' ₴' : '')}
        ${field('Выплата за молдинг (помощ.)', o.payoutMoldingAssist ? o.payoutMoldingAssist + ' ₴' : '')}
        ${field('Маржа общая', o.marginTotal !== undefined ? o.marginTotal + ' ₴' : '')}
        ${field('Способ оплаты', o.paymentMethod)}
      </div>
    </div>
    ` : ''}
  `;

  showScreen('order-detail');
}

// ---------- УДАЛЕНИЕ ----------
async function deleteOrder(id) {
  if (!confirm('Удалить этот заказ? Это действие нельзя отменить.')) return;
  try {
    await sbDeleteOrder(id);
    orders = orders.filter(o => o.id !== id);
    showToast('Запись удалена');
    goHome();
  } catch (e) {
    showToast('Ошибка удаления: ' + e.message, 'error');
  }
}

// ---------- КОПИРОВАНИЕ ДАННЫХ ЗАКАЗА ----------
function copyOrderSummary(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;

  const lines = [];
  const worksTotal = Number(o.total) || 0;
  const glassTotal = Number(o.income) || 0;
  const fullTotal = worksTotal + glassTotal + (Number(o.delivery) || 0);

  if (o.phone)      lines.push(`Номер клиента: ${o.phone}`);
  if (o.mount)      lines.push(`Стоимость монтажа: ${Number(o.mount).toLocaleString('ru')} ₴`);
  if (o.molding)    lines.push(`Стоимость молдинга: ${Number(o.molding).toLocaleString('ru')} ₴`);
  if (o.extraWork)  lines.push(`Стоимость доп работа: ${Number(o.extraWork).toLocaleString('ru')} ₴`);
  if (o.tatu)       lines.push(`Доп услуга: ${Number(o.tatu).toLocaleString('ru')} ₴`);
  if (o.income)     lines.push(`Стоимость стекла: ${glassTotal.toLocaleString('ru')} ₴`);
  if (o.delivery)   lines.push(`Стоимость доставки: ${Number(o.delivery).toLocaleString('ru')} ₴`);
  if (worksTotal)   lines.push(`Общая стоимость услуг: ${worksTotal.toLocaleString('ru')} ₴`);
  if (glassTotal)   lines.push(`Общая стоимость стекла: ${glassTotal.toLocaleString('ru')} ₴`);
  if (fullTotal)    lines.push(`Общая стоимость всего заказа: ${fullTotal.toLocaleString('ru')} ₴`);

  const text = lines.join('\n');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Дані скопійовано 📋');
    }).catch(() => {
      _fallbackCopy(text);
    });
  } else {
    _fallbackCopy(text);
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
    showToast('Дані скопійовано 📋');
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
    if (senior.assistant) {
      // Ищем опцию без учёта регистра и лишних пробелов
      const matchedOption = Array.from(asSel.options).find(o => norm(o.value) === norm(senior.assistant));
      if (matchedOption) {
        asSel.value = matchedOption.value;
      } else {
        console.warn(`Assistant "${senior.assistant}" for ${respName} not found in dropdown options.`);
      }
    } else {
      asSel.value = '';
    }
  }
}

function populateRefSelects() {
  // Марки авто — теперь datalist
  populateCarDatalist();

  // Услуги — чекбоксы
  const svcBox = document.getElementById('service-type-checkboxes');
  if (svcBox) {
    const cur = (document.getElementById('f-service-type')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
    svcBox.innerHTML = SERVICE_TYPE_OPTIONS.map(name => `
      <label class="checkbox">
        <input type="checkbox" value="${name}" ${cur.includes(name) ? 'checked' : ''} onchange="syncServiceTypes()">
        ${name}
      </label>
    `).join('');
  }

  // Статусы расчёта
  const psSel = document.getElementById('f-payment-status');
  if (psSel) {
    const cur = psSel.value;
    const opts = ['Оплачено', 'Не оплачено', 'Частично оплачено'];
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
      workers.map(w => `<option value="${w.name}">${w.name}</option>`).join('');
    if (cur) maSel.value = cur;
  }

  // Статусы оплаты поставщику
  const ssSel = document.getElementById('f-supplier-status');
  if (ssSel) {
    const cur = ssSel.value;
    const opts = ['Оплачено','Не оплачено','Частично оплачено'];
    ssSel.innerHTML = '<option value="">—</option>' + opts.map(s => `<option value="${s}">${s}</option>`).join('');
    if (cur) ssSel.value = cur;
  }

  // Помощник — старший или младший специалист
  const assistantSel = document.getElementById('f-assistant');
  if (assistantSel) {
    const cur = assistantSel.value;
    assistantSel.innerHTML = '<option value="">— выбрать / нет —</option>' + 
      workers.filter(w => ['senior', 'junior', 'extra'].includes(w.systemRole)).map(w => `<option value="${w.name}">${w.name} (${w.role})</option>`).join('');
    if (cur) assistantSel.value = cur;
  }

  // Ответственный — старшие специалисты
  const respSel = document.getElementById('f-responsible');
  if (respSel) {
    const cur = respSel.value;
    respSel.innerHTML = '<option value="">— выбрать —</option>' +
      workers.filter(w => ['senior', 'extra'].includes(w.systemRole)).map(w => `<option value="${w.name}">${w.name} (${w.role})</option>`).join('');
    if (cur) respSel.value = cur;
    
    // При смене ответственного — подставляем помощника
    respSel.onchange = () => applyAssistantForResponsible(respSel.value);
  }

  // Ответственный — доработка
  const reworkRespSel = document.getElementById('f-rework-responsible');
  if (reworkRespSel) {
    const cur = reworkRespSel.value;
    reworkRespSel.innerHTML = '<option value="">— выбрать —</option>' +
      workers.filter(w => ['senior', 'extra'].includes(w.systemRole)).map(w => `<option value="${w.name}">${w.name} (${w.role})</option>`).join('');
    if (cur) reworkRespSel.value = cur;
  }

  // Помощник — доработка
  const reworkAsSel = document.getElementById('f-rework-assistant');
  if (reworkAsSel) {
    const cur = reworkAsSel.value;
    reworkAsSel.innerHTML = '<option value="">— нет —</option>' +
      workers.filter(w => ['senior', 'junior', 'extra'].includes(w.systemRole)).map(w => `<option value="${w.name}">${w.name} (${w.role})</option>`).join('');
    if (cur) reworkAsSel.value = cur;
  }
}

let currentClientPayments = [];
let currentSupplierPayments = [];

// ---------- ФУНКЦИИ ИСТОРИИ ОПЛАТ И ДОРАБОТКИ ----------

function toggleReworkSection() {
  const body = document.getElementById('rework-section-body');
  const chevron = document.getElementById('rework-chevron');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}

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
}

function syncSupplierPaidFromPayments() {
  const checkEl = document.getElementById('f-check');
  if (!checkEl) return;
  const totalPaid = currentSupplierPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  checkEl.value = String(totalPaid || 0);
}

function addClientPayment() {
  const amtEl = document.getElementById('f-new-payment-amount');
  const dateEl = document.getElementById('f-new-payment-date');
  const amount = Number(amtEl.value);
  if (!amount || amount <= 0) return showToast('Введите сумму оплаты', 'error');
  const date = dateEl.value || todayStr();
  
  currentClientPayments.push({ amount, date, timestamp: new Date().toISOString() });
  amtEl.value = '';
  renderClientPayments();
  syncClientPaidFromPayments();
  recalcTotal();
}

function addSupplierPayment() {
  const amtEl = document.getElementById('f-new-supplier-payment-amount');
  const dateEl = document.getElementById('f-new-supplier-payment-date');
  const amount = Number(amtEl.value);
  if (!amount || amount <= 0) return showToast('Введите сумму поставщику', 'error');
  const date = dateEl.value || todayStr();

  currentSupplierPayments.push({ amount, date, timestamp: new Date().toISOString() });
  amtEl.value = '';
  renderSupplierPayments();
  syncSupplierPaidFromPayments();
  recalcTotal();
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
  ['f-mount','f-molding','f-extra-work','f-tatu','f-toning',
   'f-rework-mount','f-rework-molding','f-rework-extra',
   'f-rework-tatu','f-rework-toning'].forEach(fid => {
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
  renderSupplierPayments();
  renderClientPayments(); // рендерим историю оплат (изначально)
  syncSupplierPaidFromPayments();
  syncClientPaidFromPayments();

  document.getElementById('order-modal').classList.add('active');

  // Начальный пересчёт итогов (при редактировании)
  setTimeout(recalcTotal, 50);
}

function closeOrderModal() {
  document.getElementById('order-modal').classList.remove('active');
  editingOrderId = null;
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
  set('f-car', o.car);
  set('f-code', o.code);
  set('f-notes', o.notes);
  set('f-mount', o.mount);
  set('f-molding', o.molding);
  set('f-extra-work', o.extraWork);
  set('f-tatu', o.tatu);
  set('f-toning', o.toning);
  set('f-delivery', o.delivery);
  set('f-warehouse', o.warehouse || '');
  set('f-warehouse-code', o.warehouseCode || '');
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
  set('f-payment-method', o.paymentMethod);
  set('f-dropshipper', o.dropshipper);
  const tonExtEl = document.getElementById('f-toning-external');
  if (tonExtEl) tonExtEl.checked = !!o.toningExternal;
  // услуги — чекбоксы
  const svcHidden = document.getElementById('f-service-type');
  if (svcHidden) {
    svcHidden.value = o.serviceType || '';
    syncServiceTypes(false);
  }
  set('f-margin-total', o.marginTotal);
  set('f-payout-dropshipper', o.payoutDropshipper);
  set('f-payout-manager-glass', o.payoutManagerGlass);
  set('f-payout-resp-glass', o.payoutRespGlass);
  set('f-payout-lesha', o.payoutLesha);
  set('f-payout-roma', o.payoutRoma);
  set('f-payout-extra-resp', o.payoutExtraResp);
  set('f-payout-extra-assist', o.payoutExtraAssist);
  set('f-payout-molding-resp', o.payoutMoldingResp);
  set('f-payout-molding-assist', o.payoutMoldingAssist);
  
  const onlyCutEl = document.getElementById('f-only-cut');
  if (onlyCutEl) onlyCutEl.checked = !!o.onlyCut;

  if (o.reworkData) {
    set('f-rework-responsible', o.reworkData.responsible);
    set('f-rework-assistant', o.reworkData.assistant);
    set('f-rework-mount', o.reworkData.mount);
    set('f-rework-molding', o.reworkData.molding);
    set('f-rework-extra', o.reworkData.extraWork);
    set('f-rework-tatu', o.reworkData.tatu);
    set('f-rework-toning', o.reworkData.toning);
  }

  const statusEl = document.getElementById('f-order-status');
  if (statusEl) { if (o.isCancelled) statusEl.value = 'cancelled'; else if (o.inWork) statusEl.value = 'inWork'; else statusEl.value = ''; }
  const asEl = document.getElementById('f-assistant');
  // перерисовать чекбоксы комплектации
  const confArr = (o.configuration || '').split(',');
  document.querySelectorAll('#f-configuration-checkboxes input[type="checkbox"]').forEach(el => {
    el.checked = confArr.includes(el.value);
  });
}

function clearOrderForm() {
  const ids = [
    'f-date','f-time','f-responsible','f-client','f-phone','f-address','f-car','f-code',
    'f-notes','f-mount','f-service-type','f-molding',
    'f-extra-work','f-tatu','f-toning','f-delivery','f-warehouse','f-warehouse-code','f-configuration',
    'f-payment-status','f-check','f-debt','f-debt-date','f-total',
    'f-supplier-status','f-purchase','f-income',
    'f-remainder','f-payment-method','f-dropshipper','f-margin-total',
    'f-payout-dropshipper','f-payout-manager-glass','f-payout-resp-glass',
    'f-payout-lesha','f-payout-roma','f-payout-extra-resp','f-payout-extra-assist',
    'f-payout-molding-resp','f-payout-molding-assist','f-assistant','f-manager',
    'f-rework-responsible','f-rework-assistant','f-rework-mount','f-rework-molding',
    'f-rework-extra','f-rework-tatu','f-rework-toning',
    'f-new-payment-amount','f-new-payment-date','f-new-supplier-payment-amount','f-new-supplier-payment-date'
  ];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  currentClientPayments = [];
  currentSupplierPayments = [];
  const orderStatusEl = document.getElementById('f-order-status');
  if (orderStatusEl) orderStatusEl.value = '';
  const onlyCutEl = document.getElementById('f-only-cut');
  if (onlyCutEl) onlyCutEl.checked = false;
  const tonExtEl = document.getElementById('f-toning-external');
  if (tonExtEl) tonExtEl.checked = false;
  document.querySelectorAll('#service-type-checkboxes input[type="checkbox"]').forEach(el => el.checked = false);
  document.querySelectorAll('#f-configuration-checkboxes input[type="checkbox"]').forEach(el => el.checked = false);
}

function setPriceFieldsLocked(locked) {
  const priceFields = ['f-total','f-check','f-debt','f-debt-date','f-payment-status','f-payment-method','f-purchase','f-income','f-supplier-status'];
  priceFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'f-payment-status') return; // Now fully automated
    if (id === 'f-debt-date' && currentRole === 'senior') return;
    if (id === 'f-supplier-status' && currentRole === 'senior') return;
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

  // Авторасчет статуса поставщика
  const checkInput = document.getElementById('f-check');
  const supplierStatusSel = document.getElementById('f-supplier-status');
  if (checkInput && supplierStatusSel) {
    const checkVal = Number(checkInput.value) || 0;
    supplierStatusSel.value = calcSupplierPaymentStatus(checkVal, glassPurchase);
  }

  recalcFullMargins();
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
    car:             get('f-car'),
    code:            get('f-code'),
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
    paymentMethod:   get('f-payment-method'),
    dropshipper:     get('f-dropshipper'),
    dropshipperPayout: getN('f-payout-dropshipper'),
    statusDone:      existingOrder ? existingOrder.statusDone : false,
    inWork:          (currentRole === 'owner' || currentRole === 'manager')
      ? (document.getElementById('f-order-status')?.value === 'inWork')
      : (existingOrder ? existingOrder.inWork : false),
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
    onlyCut:         document.getElementById('f-only-cut')?.checked || false,
    reworkData: {
      responsible: get('f-rework-responsible'),
      assistant: get('f-rework-assistant'),
      mount: getN('f-rework-mount'),
      molding: getN('f-rework-molding'),
      extraWork: getN('f-rework-extra'),
      tatu: getN('f-rework-tatu'),
      toning: getN('f-rework-toning'),
    },
    clientPayments: currentClientPayments,
    supplierPayments: currentSupplierPayments,
  };

  if (!data.date || !data.client) {
    alert('Пожалуйста, заполните обязательные поля: Дата и Клиент');
    return;
  }

  const saveBtn = document.getElementById('order-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Сохранение...'; }

  const oldCheck = Number(existingOrder ? existingOrder.check : 0) || 0;
  const newCheck = Number(data.check) || 0;
  const checkDiff = newCheck - oldCheck;

  try {
    if (isNew) {
      const saved = await sbInsertOrder(data);
      orders.unshift(saved);
      showToast('Запись создана ✓');
    } else {
      const saved = await sbUpdateOrder(data);
      const idx = orders.findIndex(o => o.id === editingOrderId);
      if (idx !== -1) orders[idx] = saved;
      showToast('Запись обновлена ✓');
    }

    // Автоматическое списание/возврат средств за оплату стекла из кассы ответственного
    if (currentRole === 'senior' && checkDiff !== 0) {
      const amount = -checkDiff; // если увеличилась сумма поставщику, баланс кассы уменьшается
      const typeStr = checkDiff > 0 ? 'Списание' : 'Возврат';
      const fDate = data.date ? formatDate(data.date) : '—';
      const fTime = data.time || '—';
      const fCar = data.car || '—';
      const targetWorker = data.responsible || currentWorkerName;
      
      const cashComment = `${typeStr} за стекло ${data.id}, ${fDate} ${fTime}, авто: ${fCar}, склад: ${data.warehouse || '—'}`;

      await sbInsertCashEntry({
        worker_name: targetWorker,
        amount: amount,
        comment: cashComment,
      });
      if (typeof workerCashLog !== 'undefined' && targetWorker === currentWorkerName) {
        workerCashLog.unshift({
          worker_name: targetWorker,
          amount: amount,
          comment: cashComment,
          created_at: new Date().toISOString()
        });
      }
      showToast(`${checkDiff > 0 ? 'Списано' : 'Возвращено'} ${Math.abs(checkDiff)} ₴ в кассу мастера ${targetWorker}`);
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
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Сохранить'; }
  }
}

// ---------- ХЕЛПЕРЫ ----------
function statusBadge(status) {
  const map = {
    'Оплачено':           'status-paid',
    'Частично оплачено':  'status-partial',
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

  if (!keys.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📅</div>
        <h3>Записей не найдено</h3>
      </div>`;
    return;
  }

  container.innerHTML = keys.map(year => {
    const list = map[year];
    const displayList = (currentRole === 'owner' || currentRole === 'manager') ? list : list.filter(o => o.inWork);
    const totalSum = list.reduce((s, o) => s + ((Number(o.total) || 0) + (Number(o.income) || 0) + (Number(o.delivery) || 0)), 0);
    return `
      <div class="home-card" style="display:flex;flex-direction:column;min-height:110px;" onclick="openYear('${year}')">
        <div style="font-size:12px;color:var(--text3);font-weight:600;letter-spacing:0.04em;">${displayList.length} зап.${canViewFinance() ? ` &middot; ${totalSum.toLocaleString('ru')} &#x20B4;` : ''}</div>
        <div style="margin-top:auto;padding-top:12px;">
          <div style="font-size:26px;font-weight:800;line-height:1.1;">${year} год</div>
        </div>
      </div>
    `;
  }).join('');
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

  if (!keys.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📅</div>
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
    const totalSum = list.reduce((s, o) => s + ((Number(o.total) || 0) + (Number(o.income) || 0) + (Number(o.delivery) || 0)), 0);
    return `
      <div class="home-card" style="display:flex;flex-direction:column;min-height:110px;" onclick="openMonthOrders('${ym}')">
        <div style="font-size:12px;color:var(--text3);font-weight:600;letter-spacing:0.04em;">${displayList.length} зап.${canViewFinance() ? ` &middot; ${totalSum.toLocaleString('ru')} &#x20B4;` : ''}</div>
        <div style="margin-top:auto;padding-top:12px;">
          <div style="font-size:26px;font-weight:800;line-height:1.1;">${monthName}</div>
          <div style="font-size:13px;color:var(--text3);margin-top:3px;">${year}</div>
        </div>
      </div>
    `;
  }).join('');
}

function openMonthOrders(ym) {
  currentMonthFilter = ym;
  const [year, month] = ym.split('-');
  const monthName = MONTH_NAMES_RU[parseInt(month) - 1];
  document.querySelector('#screen-orders .page-title').textContent = `📋 ${monthName} ${year}`;
  initOrderTabs();
  setupOrderActions();
  renderOrdersForMonth(ym);
  showScreen('orders');
}

function renderOrdersForMonth(ym) {
  const search = (document.getElementById('filter-search')?.value || '').toLowerCase();
  const statF  = document.getElementById('filter-status')?.value || '';
  const sort   = document.getElementById('filter-sort')?.value || 'desc';

  let list = orders.filter(o => o.date && o.date.slice(0, 7) === ym);

  if (currentRole === 'owner' || currentRole === 'manager') {
    if (currentOrderTab === 'planner') {
      list = list.filter(o => o.inWork && !o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'selection') {
      list = list.filter(o => !o.inWork && !o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'done') {
      list = list.filter(o => o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'debt') {
      list = list.filter(o => !o.isCancelled && ['Не оплачено', 'Частично оплачено'].includes(getEffectivePaymentStatus(o)));
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
  if (statF) list = list.filter(o => getEffectivePaymentStatus(o) === statF);
  list.sort((a, b) => {
    const ad = a.date || '';
    const bd = b.date || '';
    return sort === 'asc' ? ad.localeCompare(bd) : bd.localeCompare(ad);
  });

  const container = document.getElementById('orders-list');
  const signature = _getOrdersListSignature('month', { search, statF, sort, ym });

  if (!list.length) {
    lastOrdersListSignature = signature;
    ordersVisibleCount = 10;
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
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
  o.workerDone = !o.workerDone;
  try {
    await sbUpdateOrder(o);
    // Автозачисление в кассу если наличка и заказ отмечен выполненным
    if (o.workerDone && typeof addCashFromOrder === 'function') {
      await addCashFromOrder(o);
    }
    currentMonthFilter ? renderOrdersForMonth(currentMonthFilter) : renderOrders();
    showToast(o.workerDone ? '✓ Выполнено' : 'Отметка снята');
    if (document.getElementById('screen-profile')?.classList.contains('active')) {
      await loadWorkerSalaries();
      renderProfile();
    }
  } catch (e) {
    o.workerDone = !o.workerDone;
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

    // 3. Тату-бонус Ромы
    const romaName = 'Рома';
    const mainHasRoma = (order.responsible === romaName || order.assistant === romaName);
    const reworkHasRoma = (order.reworkData?.responsible === romaName || order.reworkData?.assistant === romaName);
    
    // Если Рома не участвовал в основной работе, но там было тату:
    if (!mainHasRoma && (Number(order.tatu) > 0)) {
       affectedWorkers.add(romaName);
       amounts[romaName] = (amounts[romaName] || 0) + Math.round(Number(order.tatu) * 0.20);
    }
    // Если Рома не участвовал в доработке, но там было тату:
    if (!reworkHasRoma && (Number(order.reworkData?.tatu) > 0)) {
       affectedWorkers.add(romaName);
       amounts[romaName] = (amounts[romaName] || 0) + Math.round(Number(order.reworkData.tatu) * 0.20);
    }

    // 4. Менеджер — если указан в поле manager заказа и имеет systemRole === 'manager'
    const managerName = order.manager || '';
    if (managerName && workers.find(x => x.name === managerName && x.systemRole === 'manager')) {
      affectedWorkers.add(managerName);
      if (!amounts[managerName]) {
        amounts[managerName] = _calcManagerSalary(order);
      }
    }
  }


  // Всегда берём актуальные записи ЗП по этому заказу из БД
  let existingInDb = [];
  try {
    existingInDb = await sbFetchSalariesByOrder(order.id) || [];
  } catch (e) { /* если упало — продолжаем с пустым массивом */ }

  const workerNamesToProcess = new Set([...Object.keys(amounts), ...existingInDb.map(s => s.worker_name)]);
  existingInDb.forEach(s => affectedWorkers.add(s.worker_name));

  for (const workerName of workerNamesToProcess) {
    const amount = amounts[workerName] || 0;
    const existingEntry = existingInDb.find(s => s.worker_name === workerName);

    console.log('[salary]', workerName, '| amount:', amount);

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
    await _syncDailyBaseSalaryEntry(workerName, order.date);
  }

  // Обновляем локальный массив workerSalaries (только для текущего пользователя)
  if (typeof workerSalaries !== 'undefined') {
    try {
      workerSalaries = await sbFetchWorkerSalaries(currentWorkerName);
    } catch (e) { /* не критично */ }
  }
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
        <button class="orders-tab" id="tab-planner"   onclick="setOrderTab('planner')">Планёрка</button>
        <button class="orders-tab" id="tab-done"      onclick="setOrderTab('done')">Выполненные</button>
        <button class="orders-tab" id="tab-debt"      onclick="setOrderTab('debt')">Долг</button>
        <button class="orders-tab" id="tab-cancelled" onclick="setOrderTab('cancelled')">Отмененные</button>
      `;
    }
    setOrderTab('selection');
  } else {
    // Специалисты: сегодняшние, выполненные, будущие, прошедшие, все мои
    if (tabsEl) {
      tabsEl.style.display = 'flex';
      tabsEl.innerHTML = `
        <button class="orders-tab orders-tab-relevant active" id="tab-today" onclick="setWorkerTab('today')"><span class="tab-dot"></span> Сегодняшние</button>
        <button class="orders-tab" id="tab-done-worker" onclick="setWorkerTab('done')">Выполненные</button>
        <button class="orders-tab" id="tab-future" onclick="setWorkerTab('future')">Будущие</button>
        <button class="orders-tab" id="tab-past" onclick="setWorkerTab('past')">Прошедшие</button>
        <button class="orders-tab" id="tab-my-all" onclick="setWorkerTab('all')">Все мои</button>
      `;
    }
    currentWorkerTab = 'today';
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
    today: 'tab-today',
    done: 'tab-done-worker',
    future: 'tab-future',
    past: 'tab-past',
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

  const marginGlass = incomeGlass - purchaseGlass;
  const costMolding = moldingSum * 0.4;
  const costToning  = toningSum * 0.4;

  const payoutDropshipper = document.getElementById('f-dropshipper')?.value ? marginGlass : 0;

  // Менеджер — только Саша Менеджер через поле f-manager
  const managerValue = document.getElementById('f-manager')?.value || '';
  const payoutManagerGlass = (managerValue === 'Саша Менеджер' && marginGlass > 0)
    ? Math.round(marginGlass * 0.10) : 0;

  // Старший responsible — Костя или Саша Смоков: 10% от маржи стекла
  const responsibleName = document.getElementById('f-responsible')?.value || '';
  const payoutRespGlass = (['Костя', 'Саша Смоков'].includes(responsibleName) && incomeGlass > 0)
    ? Math.round(marginGlass * 0.10) : 0;

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
function syncServiceTypes(recalc = true) {
  const box = document.querySelectorAll('#service-type-checkboxes input[type="checkbox"]');
  const vals = [...box].filter(el => el.checked).map(el => el.value);
  const hidden = document.getElementById('f-service-type');
  if (hidden) hidden.value = vals.join(', ');
  if (recalc) recalcTotal();
}

// ============================================================
// AUTOCOMPLETE ENGINE — клиент и авто
// ============================================================

const _ac = {
  client: { activeIdx: -1 },
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
      .filter(c => !q || (c.name || '').toLowerCase().includes(q))
      .slice(0, 40)
      .map(c => ({
        label:   c.name,
        sub:     c.phone || '',
        value:   c.name,
        client:  c,
      }));
  }
  if (type === 'car') {
    const cars = refCars || [];
    return cars
      .filter(c => !q || c.model.toLowerCase().startsWith(q))
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

  if (type === 'client') {
    const input = document.getElementById('f-client');
    if (input) input.value = item.value;

    // Автозаполнение телефона
    const phoneEl = document.getElementById('f-phone');
    if (phoneEl && item.client?.phone) phoneEl.value = item.client.phone;

    // Автозаполнение последнего авто этого клиента
    const c = item.client;
    if (c && c.orders && c.orders.length) {
      const lastCar = c.orders[c.orders.length - 1].car || '';
      const carEl   = document.getElementById('f-car');
      if (carEl && lastCar) {
        carEl.value = lastCar;
        onCarInputChange(lastCar);
      }
    }
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
