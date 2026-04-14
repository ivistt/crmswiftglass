// ============================================================
// WAREHOUSES.JS — склады и дропшипперы
// ============================================================

let currentWarehouseFilter = null;
let currentDropshipperFilter = null;
let warehousePaymentFilter = 'all';

function getSupplierDebt(order) {
  return Math.max(0, (Number(order.purchase) || 0) - (Number(order.check) || 0));
}

function openWarehousesScreen() {
  currentWarehouseFilter = null;
  renderWarehousesScreen();
  showScreen('warehouses');
}

function renderWarehousesScreen() {
  const container = document.getElementById('warehouses-list');
  if (!container) return;

  const warehouseOrders = orders.filter(o => !o.isCancelled);
  if (!warehouseOrders.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${icon('package')}</div><h3>Записей нет</h3></div>`;
    return;
  }

  const map = {};
  for (const o of warehouseOrders) {
    const w = o.warehouse || 'Без склада';
    if (!map[w]) map[w] = [];
    map[w].push(o);
  }

  container.innerHTML = Object.keys(map).sort().map(w => {
    const list = map[w];
    const debtList = list.filter(o => getSupplierDebt(o) > 0);
    const totalDebt = debtList.reduce((sum, o) => sum + getSupplierDebt(o), 0);
    return `
      <div class="home-card" style="display:flex;flex-direction:column;min-height:120px;" onclick="openWarehouseDetail('${escapeAttr(w)}')">
        <div style="font-size:12px;color:var(--text3);font-weight:600;letter-spacing:0.04em;">
          Записей: ${list.length} · С долгом: ${debtList.length}
        </div>
        <div style="margin-top:auto;padding-top:12px;">
          <div style="font-size:20px;font-weight:800;line-height:1.2;margin-bottom:6px;">${escapeHtml(w)}</div>
          <div style="font-size:18px;color:${totalDebt > 0 ? 'var(--red)' : 'var(--accent)'};font-weight:700;">
            ${totalDebt > 0 ? 'Долг: ' + totalDebt.toLocaleString('ru') + ' ₴' : 'Без долга'}
          </div>
        </div>
      </div>
    `;
  }).join('');
  initIcons();
}

function openWarehouseDetail(w) {
  currentWarehouseFilter = w;
  const titleEl = document.getElementById('warehouse-detail-title');
  if (titleEl) titleEl.textContent = `Склад: ${w}`;
  renderWarehouseDetail();
  showScreen('warehouse-detail');
}

function renderWarehouseDetail() {
  const container = document.getElementById('warehouse-detail-body');
  if (!container) return;
  const w = currentWarehouseFilter;
  const list = orders
    .filter(o => !o.isCancelled && (o.warehouse || 'Без склада') === w)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.time || '').localeCompare(a.time || ''));

  if (!list.length) {
    container.innerHTML = '<div class="empty-state">Записей нет</div>';
    return;
  }

  const filteredList = list.filter(o => {
    if (warehousePaymentFilter === 'all') return true;
    const hasDebt = getSupplierDebt(o) > 0;
    return warehousePaymentFilter === 'debt' ? hasDebt : !hasDebt;
  });

  container.innerHTML = renderWarehousePaymentFilters()
    + (filteredList.length ? renderWarehouseOrderTree(filteredList) : '<div class="empty-state">Записей по фильтру нет</div>');
  initIcons();
}

function renderWarehousePaymentFilters() {
  return `
    <div class="orders-tabs" style="border-bottom:none;margin-bottom:14px;padding-bottom:0;">
      <button class="orders-tab ${warehousePaymentFilter === 'all' ? 'active' : ''}" onclick="setWarehousePaymentFilter('all')">Все</button>
      <button class="orders-tab ${warehousePaymentFilter === 'debt' ? 'active' : ''}" onclick="setWarehousePaymentFilter('debt')">С долгом</button>
      <button class="orders-tab ${warehousePaymentFilter === 'paid' ? 'active' : ''}" onclick="setWarehousePaymentFilter('paid')">Оплаченные</button>
    </div>
  `;
}

function setWarehousePaymentFilter(type) {
  warehousePaymentFilter = type || 'all';
  renderWarehouseDetail();
}

function renderWarehouseOrderTree(list) {
  if (!list.length) return '';
  const tree = {};
  list.forEach(o => {
    const date = o.date || 'Без даты';
    const year = date === 'Без даты' ? 'Без даты' : date.slice(0, 4);
    const month = date === 'Без даты' ? 'Без даты' : date.slice(0, 7);
    if (!tree[year]) tree[year] = {};
    if (!tree[year][month]) tree[year][month] = {};
    if (!tree[year][month][date]) tree[year][month][date] = [];
    tree[year][month][date].push(o);
  });

  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const sumDebt = rows => rows.reduce((sum, o) => sum + getSupplierDebt(o), 0);
  const years = Object.keys(tree).sort((a, b) => b.localeCompare(a));

  return years.map(year => {
    const months = Object.keys(tree[year]).sort((a, b) => b.localeCompare(a));
    const yearOrders = months.flatMap(month => Object.values(tree[year][month]).flat());
    const yearDebt = sumDebt(yearOrders);
    const yearKey = 'warehouse-year-' + year.replace(/[^a-zA-Z0-9а-яА-Я_-]/g, '-');

    const monthsHtml = months.map(month => {
      const days = Object.keys(tree[year][month]).sort((a, b) => b.localeCompare(a));
      const monthOrders = Object.values(tree[year][month]).flat();
      const monthDebt = sumDebt(monthOrders);
      const monthKey = 'warehouse-month-' + month.replace(/[^a-zA-Z0-9а-яА-Я_-]/g, '-');
      const monthTitle = month === 'Без даты' ? 'Без даты' : monthNames[Number(month.slice(5, 7)) - 1];

      const daysHtml = days.map(day => {
        const rows = tree[year][month][day].sort((a, b) => (b.time || '').localeCompare(a.time || ''));
        const dayDebt = sumDebt(rows);
        const dayKey = 'warehouse-day-' + day.replace(/[^a-zA-Z0-9а-яА-Я_-]/g, '-');
        const ordersHtml = rows.map(o => renderWarehouseOrderCard(o)).join('');

        return `
          <div style="border-bottom:1px solid var(--border);">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;cursor:pointer;" onclick="toggleProfileMonth('${dayKey}')">
              <div style="display:flex;align-items:center;gap:8px;">
                <i data-lucide="chevron-right" style="width:13px;height:13px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${dayKey}"></i>
                <div>
                  <div style="font-size:13px;color:var(--text2);font-weight:700;">${day === 'Без даты' ? 'Без даты' : formatDate(day)}</div>
                  <div style="font-size:11px;color:var(--text3);">Записей: ${rows.length}</div>
                </div>
              </div>
              <div style="font-size:13px;font-weight:800;color:${dayDebt > 0 ? 'var(--red)' : 'var(--accent)'};white-space:nowrap;">
                ${dayDebt > 0 ? dayDebt.toLocaleString('ru') + ' ₴' : 'Без долга'}
              </div>
            </div>
            <div id="profile-month-body-${dayKey}" style="display:none;padding:0 12px 12px 34px;">
              <div style="display:flex;flex-direction:column;gap:8px;">${ordersHtml}</div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div style="border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;cursor:pointer;" onclick="toggleProfileMonth('${monthKey}')">
            <div style="display:flex;align-items:center;gap:8px;">
              <i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${monthKey}"></i>
              <div>
                <div style="font-size:14px;font-weight:800;color:var(--text2);">${monthTitle}</div>
                <div style="font-size:11px;color:var(--text3);">${days.length} дней · ${monthOrders.length} записей</div>
              </div>
            </div>
            <div style="font-size:14px;font-weight:800;color:${monthDebt > 0 ? 'var(--red)' : 'var(--accent)'};white-space:nowrap;">
              ${monthDebt > 0 ? monthDebt.toLocaleString('ru') + ' ₴' : 'Без долга'}
            </div>
          </div>
          <div id="profile-month-body-${monthKey}" style="display:none;padding-left:12px;background:var(--surface2);border-radius:0 0 8px 8px;">${daysHtml}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="fin-month-card" style="margin-bottom:8px;">
        <div class="fin-month-header" onclick="toggleProfileMonth('${yearKey}')">
          <div style="display:flex;align-items:center;gap:10px;">
            <i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${yearKey}"></i>
            <div>
              <div class="fin-month-name">${year === 'Без даты' ? 'Без даты' : year + ' год'}</div>
              <div class="fin-month-sub">${months.length} мес. · ${yearOrders.length} записей</div>
            </div>
          </div>
          <div style="font-size:18px;font-weight:800;color:${yearDebt > 0 ? 'var(--red)' : 'var(--accent)'};">
            ${yearDebt > 0 ? yearDebt.toLocaleString('ru') + ' ₴' : 'Без долга'}
          </div>
        </div>
        <div id="profile-month-body-${yearKey}" style="display:none;padding:0 0 8px;">${monthsHtml}</div>
      </div>
    `;
  }).join('');
}

function renderWarehouseOrderCard(o) {
  const debt = getSupplierDebt(o);
  return `
    <div class="order-card" onclick="openOrderDetail('${o.id}')">
      <div class="order-card-top">
        <div class="order-card-left">
          <span class="order-id">${o.id}</span>
          <span class="order-name">${o.car || '—'}</span>
        </div>
        <div style="font-size:13px;font-weight:800;color:${debt > 0 ? 'var(--red)' : 'var(--accent)'};">
          ${debt > 0 ? 'Долг: ' + debt.toLocaleString('ru') + ' ₴' : 'Оплачено'}
        </div>
      </div>
      <div class="order-card-meta">
        <span class="order-meta-item">${icon('clock')} ${o.time || '—'}</span>
        <span class="order-meta-item">${icon('user')} ${o.client || '—'}</span>
        ${o.warehouseCode ? `<span class="order-meta-item mono">${icon('hash')} ${o.warehouseCode}</span>` : ''}
        ${Number(o.purchase) > 0 ? `<span class="order-meta-item">${icon('package')} ${Number(o.purchase).toLocaleString('ru')} ₴</span>` : ''}
      </div>
    </div>
  `;
}

function openDropshippersScreen() {
  currentDropshipperFilter = null;
  renderDropshippersScreen();
  showScreen('dropshippers');
}

function renderDropshippersScreen() {
  const container = document.getElementById('dropshippers-list');
  if (!container) return;
  const list = orders.filter(o => !o.isCancelled && o.dropshipper && Number(o.dropshipperPayout) > 0);
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${icon('handshake')}</div><h3>Выплат нет</h3></div>`;
    return;
  }
  const map = {};
  list.forEach(o => {
    if (!map[o.dropshipper]) map[o.dropshipper] = [];
    map[o.dropshipper].push(o);
  });
  container.innerHTML = Object.keys(map).sort().map(name => {
    const rows = map[name];
    const total = rows.reduce((sum, o) => sum + (Number(o.dropshipperPayout) || 0), 0);
    const paid = rows.reduce((sum, o) => sum + getDropshipperPaid(o), 0);
    const left = Math.max(0, total - paid);
    return `
      <div class="home-card" onclick="openDropshipperDetail('${escapeAttr(name)}')">
        <div style="font-size:12px;color:var(--text3);font-weight:600;">Записей: ${rows.length} · Осталось: ${left.toLocaleString('ru')} ₴</div>
        <div style="margin-top:auto;padding-top:12px;">
          <div style="font-size:20px;font-weight:800;margin-bottom:6px;">${escapeHtml(name)}</div>
          <div style="font-size:20px;font-weight:800;color:var(--yellow);">${total.toLocaleString('ru')} ₴</div>
          <div style="font-size:12px;color:var(--accent);font-weight:800;margin-top:4px;">Выплачено: ${paid.toLocaleString('ru')} ₴</div>
        </div>
      </div>
    `;
  }).join('');
}

function getDropshipperPaid(order) {
  return (order?.dropshipperPayments || []).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
}

function openDropshipperDetail(name) {
  currentDropshipperFilter = name;
  const titleEl = document.getElementById('dropshipper-detail-title');
  if (titleEl) titleEl.textContent = `Дропшиппер: ${name}`;
  renderDropshipperDetail();
  showScreen('dropshipper-detail');
}

function renderDropshipperDetail() {
  const container = document.getElementById('dropshipper-detail-body');
  if (!container) return;
  const list = orders.filter(o => !o.isCancelled && o.dropshipper === currentDropshipperFilter && Number(o.dropshipperPayout) > 0);
  const totalDue = list.reduce((sum, o) => sum + (Number(o.dropshipperPayout) || 0), 0);
  const totalPaid = list.reduce((sum, o) => sum + getDropshipperPaid(o), 0);
  const totalLeft = Math.max(0, totalDue - totalPaid);
  const tree = {};
  list.forEach(o => {
    if (!o.date) return;
    const year = o.date.slice(0, 4);
    const month = o.date.slice(5, 7);
    if (!tree[year]) tree[year] = {};
    if (!tree[year][month]) tree[year][month] = {};
    if (!tree[year][month][o.date]) tree[year][month][o.date] = [];
    tree[year][month][o.date].push(o);
  });
  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  let html = `
    <div class="profile-summary" style="margin-bottom:14px;">
      <div class="profile-summary-card">
        <div class="profile-summary-label">К выплате</div>
        <div class="profile-summary-value" style="color:var(--yellow);">${totalDue.toLocaleString('ru')} ₴</div>
      </div>
      <div class="profile-summary-card">
        <div class="profile-summary-label">Выплачено</div>
        <div class="profile-summary-value">${totalPaid.toLocaleString('ru')} ₴</div>
      </div>
      <div class="profile-summary-card">
        <div class="profile-summary-label">Осталось</div>
        <div class="profile-summary-value" style="color:${totalLeft > 0 ? 'var(--red)' : 'var(--accent)'};">${totalLeft.toLocaleString('ru')} ₴</div>
      </div>
    </div>
    <button class="btn-primary" style="width:100%;min-height:44px;margin-bottom:14px;font-weight:800;" onclick="openDropshipperPaymentModal()" ${totalLeft <= 0 ? 'disabled' : ''}>Выплатить</button>
  `;
  Object.keys(tree).sort((a, b) => b.localeCompare(a)).forEach(year => {
    html += `<div style="font-size:18px;font-weight:800;margin:22px 0 10px;">${year}</div>`;
    Object.keys(tree[year]).sort((a, b) => b.localeCompare(a)).forEach(month => {
      html += `<div style="font-size:15px;font-weight:800;color:var(--text2);margin:14px 0 8px;">${monthNames[Number(month) - 1]}</div>`;
      Object.keys(tree[year][month]).sort((a, b) => b.localeCompare(a)).forEach(day => {
        const rows = tree[year][month][day];
        const total = rows.reduce((sum, o) => sum + (Number(o.dropshipperPayout) || 0), 0);
        const paid = rows.reduce((sum, o) => sum + getDropshipperPaid(o), 0);
        html += `<div style="font-size:13px;font-weight:700;color:var(--text3);margin:12px 0 8px;">${formatDate(day)} · ${total.toLocaleString('ru')} ₴</div>`;
        html += rows.map(o => `
          <div class="order-card" onclick="openOrderDetail('${o.id}')">
            <div class="order-card-top">
              <div class="order-card-left"><span class="order-id">${o.id}</span><span class="order-name">${o.car || '—'}</span></div>
              <div style="font-size:15px;font-weight:900;color:${Math.max(0, Number(o.dropshipperPayout) - getDropshipperPaid(o)) > 0 ? 'var(--yellow)' : 'var(--accent)'};">${Number(o.dropshipperPayout).toLocaleString('ru')} ₴</div>
            </div>
            <div class="order-card-meta">
              <span class="order-meta-item">${icon('clock')} ${o.time || '—'}</span>
              <span class="order-meta-item">${icon('user')} ${o.client || '—'}</span>
              <span class="order-meta-item">${icon('phone')} ${o.phone || '—'}</span>
              <span class="order-meta-item">Выплачено: ${getDropshipperPaid(o).toLocaleString('ru')} ₴</span>
              <span class="order-meta-item">Осталось: ${Math.max(0, Number(o.dropshipperPayout) - getDropshipperPaid(o)).toLocaleString('ru')} ₴</span>
            </div>
          </div>
        `).join('');
      });
    });
  });
  container.innerHTML = html;
  initIcons();
}

function openDropshipperPaymentModal() {
  const list = orders.filter(o => !o.isCancelled && o.dropshipper === currentDropshipperFilter && Number(o.dropshipperPayout) > 0);
  const totalLeft = list.reduce((sum, o) => sum + Math.max(0, (Number(o.dropshipperPayout) || 0) - getDropshipperPaid(o)), 0);
  let modal = document.getElementById('dropshipper-payment-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'dropshipper-payment-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:420px;">
        <div class="modal-header">
          <div class="modal-title">Выплата дропшипперу</div>
          <button class="modal-close" onclick="closeDropshipperPaymentModal()">
            <i data-lucide="x" style="width:16px;height:16px;"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-grid col-1">
            <div class="form-group">
              <label class="form-label">Дропшиппер</label>
              <input class="form-input" id="dropshipper-payment-name" disabled>
            </div>
            <div class="form-group">
              <label class="form-label">Сумма выплаты</label>
              <input class="form-input" type="number" id="dropshipper-payment-amount" placeholder="0">
            </div>
            <div class="form-group">
              <label class="form-label">Дата</label>
              <input class="form-input" type="date" id="dropshipper-payment-date">
            </div>
            <div class="form-group">
              <label class="form-label">Способ оплаты</label>
              <select class="form-select" id="dropshipper-payment-method"></select>
            </div>
            <div style="font-size:11px;color:var(--text3);">Выплата распределится по неоплаченным заказам этого дропшиппера.</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeDropshipperPaymentModal()">Отмена</button>
          <button class="btn-primary" id="dropshipper-payment-save-btn" onclick="saveDropshipperPayment()">Сохранить</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById('dropshipper-payment-name').value = currentDropshipperFilter || '';
  document.getElementById('dropshipper-payment-amount').value = totalLeft || '';
  document.getElementById('dropshipper-payment-date').value = todayStr();
  const methodEl = document.getElementById('dropshipper-payment-method');
  if (methodEl) {
    methodEl.innerHTML = '<option value="">— выбрать —</option>' +
      (PAYMENT_METHOD_OPTIONS || []).map(method => `<option value="${escapeAttr(method)}">${escapeHtml(method)}</option>`).join('');
  }
  modal.classList.add('active');
  initIcons();
}

function closeDropshipperPaymentModal() {
  document.getElementById('dropshipper-payment-modal')?.classList.remove('active');
}

async function saveDropshipperPayment() {
  const amount = Number(document.getElementById('dropshipper-payment-amount')?.value) || 0;
  const date = document.getElementById('dropshipper-payment-date')?.value || todayStr();
  const method = normalizePaymentMethod(document.getElementById('dropshipper-payment-method')?.value || '');
  if (!currentDropshipperFilter) return;
  if (amount <= 0) return showToast('Введите сумму выплаты', 'error');
  if (!method) return showToast('Выберите способ оплаты', 'error');

  const eligible = orders
    .filter(o => !o.isCancelled && o.dropshipper === currentDropshipperFilter && Number(o.dropshipperPayout) > 0)
    .map(o => ({ order: o, left: Math.max(0, (Number(o.dropshipperPayout) || 0) - getDropshipperPaid(o)) }))
    .filter(item => item.left > 0)
    .sort((a, b) => String(a.order.date || '').localeCompare(String(b.order.date || '')) || String(a.order.time || '').localeCompare(String(b.order.time || '')));
  const totalLeft = eligible.reduce((sum, item) => sum + item.left, 0);
  if (amount > totalLeft) return showToast('Сумма больше остатка по дропшипперу', 'error');

  const btn = document.getElementById('dropshipper-payment-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Сохранение...'; }

  let remaining = amount;
  const timestamp = new Date().toISOString();
  try {
    for (const item of eligible) {
      if (remaining <= 0) break;
      const part = Math.min(item.left, remaining);
      const nextOrder = {
        ...item.order,
        dropshipperPayments: [
          ...(item.order.dropshipperPayments || []),
          { amount: part, date, method, dropshipper: currentDropshipperFilter, timestamp },
        ],
      };
      const saved = await sbUpdateOrder(nextOrder);
      const idx = orders.findIndex(o => o.id === item.order.id);
      if (idx !== -1) orders[idx] = saved || nextOrder;
      remaining -= part;
    }
    closeDropshipperPaymentModal();
    renderDropshipperDetail();
    if (document.getElementById('screen-owner-payments')?.classList.contains('active')) renderOwnerPaymentsScreen();
    showToast('Выплата записана ✓');
  } catch (e) {
    showToast('Ошибка выплаты: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Сохранить'; }
  }
}
