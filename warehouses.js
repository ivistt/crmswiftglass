// ============================================================
// WAREHOUSES.JS — склады и дропшипперы
// ============================================================

let currentWarehouseFilter = null;
let currentDropshipperFilter = null;
let warehousePaymentFilter = 'all';

function getSupplierDebt(order) {
  return Math.max(0, (Number(order.purchase) || 0) - (Number(order.check) || 0));
}

function getWarehouseReturnAmount(order) {
  if (!order?.isCancelled) return 0;
  return Math.max(0, (Number(order.purchase) || 0) || (Number(order.check) || 0));
}

function isWarehouseRelevantOrder(order) {
  if (!order) return false;
  if (isOrderFinanciallyActive(order)) return true;
  return !!order.isCancelled && !!(order.warehouse || order.warehouseCode) && getWarehouseReturnAmount(order) > 0;
}

function getWarehouseBalanceAmount(order) {
  return order?.isCancelled ? getWarehouseReturnAmount(order) : getSupplierDebt(order);
}

function getWarehouseTotals(list) {
  return (list || []).reduce((totals, order) => {
    if (order.isCancelled) {
      totals.returns += getWarehouseReturnAmount(order);
      totals.returnCount += getWarehouseReturnAmount(order) > 0 ? 1 : 0;
    } else {
      const debt = getSupplierDebt(order);
      totals.debt += debt;
      totals.debtCount += debt > 0 ? 1 : 0;
    }
    return totals;
  }, { debt: 0, returns: 0, debtCount: 0, returnCount: 0 });
}

function renderWarehouseTotalsLabel(totals, emptyLabel = 'Без долга') {
  const parts = [];
  if (totals.debt > 0) parts.push(`Долг: ${totals.debt.toLocaleString('ru')} ₴`);
  if (totals.returns > 0) parts.push(`Возврат: ${totals.returns.toLocaleString('ru')} ₴`);
  return parts.join(' · ') || emptyLabel;
}

function getWarehouseTotalsColor(totals) {
  if (totals.returns > 0) return 'var(--yellow)';
  return totals.debt > 0 ? 'var(--red)' : 'var(--accent)';
}

function openWarehousesScreen() {
  currentWarehouseFilter = null;
  renderWarehousesScreen();
  showScreen('warehouses');
}

function renderWarehousesScreen() {
  const container = document.getElementById('warehouses-list');
  if (!container) return;

  const warehouseOrders = orders.filter(isWarehouseRelevantOrder);
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
    const totals = getWarehouseTotals(list);
    return `
      <div class="home-card" style="display:flex;flex-direction:column;min-height:120px;" onclick="openWarehouseDetail('${escapeAttr(w)}')">
        <div style="font-size:12px;color:var(--text3);font-weight:600;letter-spacing:0.04em;">
          Записей: ${list.length} · С долгом: ${totals.debtCount} · Возврат: ${totals.returnCount}
        </div>
        <div style="margin-top:auto;padding-top:12px;">
          <div style="font-size:20px;font-weight:800;line-height:1.2;margin-bottom:6px;">${escapeHtml(w)}</div>
          <div style="font-size:18px;color:${getWarehouseTotalsColor(totals)};font-weight:700;">
            ${renderWarehouseTotalsLabel(totals)}
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
    .filter(o => isWarehouseRelevantOrder(o) && (o.warehouse || 'Без склада') === w)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.time || '').localeCompare(a.time || ''));

  if (!list.length) {
    container.innerHTML = '<div class="empty-state">Записей нет</div>';
    return;
  }

  const filteredList = list.filter(o => {
    if (warehousePaymentFilter === 'all') return true;
    if (warehousePaymentFilter === 'returns') return getWarehouseReturnAmount(o) > 0;
    const hasDebt = getSupplierDebt(o) > 0;
    return warehousePaymentFilter === 'debt' ? (!o.isCancelled && hasDebt) : (!o.isCancelled && !hasDebt);
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
      <button class="orders-tab ${warehousePaymentFilter === 'returns' ? 'active' : ''}" onclick="setWarehousePaymentFilter('returns')">Возвраты</button>
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
  const years = Object.keys(tree).sort((a, b) => b.localeCompare(a));

  return years.map(year => {
    const months = Object.keys(tree[year]).sort((a, b) => b.localeCompare(a));
    const yearOrders = months.flatMap(month => Object.values(tree[year][month]).flat());
    const yearTotals = getWarehouseTotals(yearOrders);
    const yearKey = 'warehouse-year-' + year.replace(/[^a-zA-Z0-9а-яА-Я_-]/g, '-');

    const monthsHtml = months.map(month => {
      const days = Object.keys(tree[year][month]).sort((a, b) => b.localeCompare(a));
      const monthOrders = Object.values(tree[year][month]).flat();
      const monthTotals = getWarehouseTotals(monthOrders);
      const monthKey = 'warehouse-month-' + month.replace(/[^a-zA-Z0-9а-яА-Я_-]/g, '-');
      const monthTitle = month === 'Без даты' ? 'Без даты' : monthNames[Number(month.slice(5, 7)) - 1];

      const daysHtml = days.map(day => {
        const rows = tree[year][month][day].sort((a, b) => (b.time || '').localeCompare(a.time || ''));
        const dayTotals = getWarehouseTotals(rows);
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
              <div style="font-size:13px;font-weight:800;color:${getWarehouseTotalsColor(dayTotals)};white-space:nowrap;">
                ${renderWarehouseTotalsLabel(dayTotals)}
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
            <div style="font-size:14px;font-weight:800;color:${getWarehouseTotalsColor(monthTotals)};white-space:nowrap;">
              ${renderWarehouseTotalsLabel(monthTotals)}
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
          <div style="font-size:18px;font-weight:800;color:${getWarehouseTotalsColor(yearTotals)};">
            ${renderWarehouseTotalsLabel(yearTotals)}
          </div>
        </div>
        <div id="profile-month-body-${yearKey}" style="display:none;padding:0 0 8px;">${monthsHtml}</div>
      </div>
    `;
  }).join('');
}

function renderWarehouseOrderCard(o) {
  const debt = getSupplierDebt(o);
  const returnAmount = getWarehouseReturnAmount(o);
  const isReturn = returnAmount > 0;
  const cardClickAction = (currentRole === 'owner' || currentRole === 'manager')
    ? `openOrderModal('${escapeAttr(o.id)}')`
    : `openOrderDetail('${escapeAttr(o.id)}')`;
  return `
    <div class="order-card ${getOrderCardStateClass(o)}" onclick="${cardClickAction}">
      <div class="order-card-top">
        <div class="order-card-left">
          <span class="order-id">${o.id}</span>
          <span class="order-name">${o.car || '—'}</span>
        </div>
        <div style="font-size:13px;font-weight:800;color:${isReturn ? 'var(--yellow)' : (debt > 0 ? 'var(--red)' : 'var(--accent)')};">
          ${isReturn ? 'Возврат: ' + returnAmount.toLocaleString('ru') + ' ₴' : (debt > 0 ? 'Долг: ' + debt.toLocaleString('ru') + ' ₴' : 'Оплачено')}
        </div>
      </div>
      <div class="order-card-meta">
        ${o.isCancelled ? `<span class="order-meta-item" style="color:var(--red);font-weight:700;">Отменен</span>` : ''}
        <span class="order-meta-item">${icon('clock')} ${o.time || '—'}</span>
        <span class="order-meta-item">${icon('user')} ${o.client || '—'}</span>
        ${o.warehouseCode ? `<span class="order-meta-item mono">${icon('hash')} ${o.warehouseCode}</span>` : ''}
        ${Number(o.purchase) > 0 ? `<span class="order-meta-item">${icon('package')} ${Number(o.purchase).toLocaleString('ru')} ₴</span>` : ''}
        ${Number(o.check) > 0 ? `<span class="order-meta-item">Оплачено поставщику: ${Number(o.check).toLocaleString('ru')} ₴</span>` : ''}
      </div>
    </div>
  `;
}

function openDropshippersScreen() {
  if (!canManageDropshippers()) return;
  currentDropshipperFilter = null;
  renderDropshippersScreen();
  showScreen('dropshippers');
}

function renderDropshippersScreen() {
  const container = document.getElementById('dropshippers-list');
  if (!container) return;
  const list = orders.filter(o => isOrderFinanciallyActive(o) && o.dropshipper && Number(o.dropshipperPayout) > 0);
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

const DROPSHIPPER_CASH_PAYMENT_WORKERS = {
  'Оплата наличка Олег': 'Oleg Starshiy',
  'Оплата наличка Лёша': 'Lyosha',
};

function getDropshipperPaymentMethods() {
  const base = PAYMENT_METHOD_OPTIONS || [];
  return ['Оплата наличка Олег', 'Оплата наличка Лёша', ...base];
}

function normalizeDropshipperWorkerText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-z0-9а-яіїєґ\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function leadingSymbol(value) {
  const first = Array.from(String(value || '').trim())[0] || '';
  return /[a-z0-9а-яіїєґ]/i.test(first) ? '' : first;
}

function findWorkerForDropshipper(dropshipperName) {
  const target = normalizeDropshipperWorkerText(dropshipperName);
  const targetSymbol = leadingSymbol(dropshipperName);
  const targetTokens = target.split(' ').filter(token => token.length > 1);
  if (!target) return null;

  return (workers || []).find(worker => {
    const labels = [worker.name, worker.alias, getWorkerDisplayName(worker.name)].filter(Boolean);
    if (labels.some(label => normalizeDropshipperWorkerText(label) === target)) return true;

    if (!targetSymbol || !labels.some(label => leadingSymbol(label) === targetSymbol)) return false;
    return labels.some(label => {
      const tokens = normalizeDropshipperWorkerText(label).split(' ').filter(token => token.length > 1);
      return tokens.some(token => targetTokens.includes(token));
    });
  }) || null;
}

function renderDropshipperAdjustmentForm() {
  if (!canManageDropshippers()) return '';
  const linkedWorker = findWorkerForDropshipper(currentDropshipperFilter);
  const hint = linkedWorker
    ? `Связано с кассой: ${escapeHtml(getWorkerDisplayName(linkedWorker.name))}`
    : 'Сотрудник не найден, корректировка изменит только выплаты дропшиппера.';

  return `
    <div style="padding:14px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;margin-bottom:14px;">
      <div style="font-size:12px;font-weight:800;color:var(--text3);letter-spacing:0.04em;margin-bottom:10px;">КОРРЕКТИРОВКА</div>
      <div style="display:grid;grid-template-columns:minmax(120px,160px) minmax(0,1fr) auto;gap:10px;align-items:end;">
        <label style="display:flex;flex-direction:column;gap:6px;min-width:0;">
          <span class="form-label" style="margin:0;">Сумма</span>
          <input class="form-input" type="number" id="dropshipper-adjustment-amount" placeholder="+500 или -500">
        </label>
        <label style="display:flex;flex-direction:column;gap:6px;min-width:0;">
          <span class="form-label" style="margin:0;">Комментарий</span>
          <input class="form-input" type="text" id="dropshipper-adjustment-comment" placeholder="Напр. ошибся с суммой">
        </label>
        <button class="btn-primary" id="dropshipper-adjustment-save-btn" style="min-height:44px;font-weight:800;" onclick="saveDropshipperAdjustment()">Записать</button>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:8px;">${hint}</div>
    </div>
  `;
}

function dropshipperTreeKey(prefix, value) {
  return prefix + '-' + String(value || 'none').replace(/[^a-zA-Z0-9а-яА-Я_-]/g, '-');
}

function renderDropshipperOrderCard(o) {
  const due = Number(o.dropshipperPayout) || 0;
  const paid = getDropshipperPaid(o);
  const left = Math.max(0, due - paid);
  return `
    <div class="order-card ${getOrderCardStateClass(o)}" onclick="openOrderDetail('${o.id}')">
      <div class="order-card-top">
        <div class="order-card-left"><span class="order-id">${o.id}</span><span class="order-name">${o.car || '—'}</span></div>
        <div style="font-size:15px;font-weight:900;color:${left > 0 ? 'var(--yellow)' : 'var(--accent)'};">${due.toLocaleString('ru')} ₴</div>
      </div>
      <div class="order-card-meta">
        <span class="order-meta-item">${icon('clock')} ${o.time || '—'}</span>
        <span class="order-meta-item">${icon('user')} ${o.client || '—'}</span>
        <span class="order-meta-item">${icon('phone')} ${o.phone || '—'}</span>
        <span class="order-meta-item">Выплачено: ${paid.toLocaleString('ru')} ₴</span>
        <span class="order-meta-item">Осталось: ${left.toLocaleString('ru')} ₴</span>
      </div>
    </div>
  `;
}

function renderDropshipperOrdersTree(list) {
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
  const sumDue = rows => rows.reduce((sum, o) => sum + (Number(o.dropshipperPayout) || 0), 0);
  return Object.keys(tree).sort((a, b) => b.localeCompare(a)).map(year => {
    const months = Object.keys(tree[year]).sort((a, b) => b.localeCompare(a));
    const yearOrders = months.flatMap(month => Object.values(tree[year][month]).flat());
    const yearKey = dropshipperTreeKey('drop-orders-year', year);
    const monthsHtml = months.map(month => {
      const days = Object.keys(tree[year][month]).sort((a, b) => b.localeCompare(a));
      const monthOrders = Object.values(tree[year][month]).flat();
      const monthKey = dropshipperTreeKey('drop-orders-month', month);
      const monthTitle = month === 'Без даты' ? 'Без даты' : monthNames[Number(month.slice(5, 7)) - 1];
      const daysHtml = days.map(day => {
        const rows = tree[year][month][day].sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));
        const dayKey = dropshipperTreeKey('drop-orders-day', day);
        return `
          <div style="border-bottom:1px solid var(--border);">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;cursor:pointer;" onclick="toggleProfileMonth('${dayKey}')">
              <div style="display:flex;align-items:center;gap:8px;">
                <i data-lucide="chevron-right" style="width:13px;height:13px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${dayKey}"></i>
                <div><div style="font-size:13px;color:var(--text2);font-weight:700;">${day === 'Без даты' ? 'Без даты' : formatDate(day)}</div><div style="font-size:11px;color:var(--text3);">Заказов: ${rows.length}</div></div>
              </div>
              <div style="font-size:13px;font-weight:800;color:var(--yellow);white-space:nowrap;">${sumDue(rows).toLocaleString('ru')} ₴</div>
            </div>
            <div id="profile-month-body-${dayKey}" style="display:none;padding:0 12px 12px 34px;"><div style="display:flex;flex-direction:column;gap:8px;">${rows.map(renderDropshipperOrderCard).join('')}</div></div>
          </div>
        `;
      }).join('');
      return `
        <div style="border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;cursor:pointer;" onclick="toggleProfileMonth('${monthKey}')">
            <div style="display:flex;align-items:center;gap:8px;"><i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${monthKey}"></i><div><div style="font-size:14px;font-weight:800;color:var(--text2);">${monthTitle}</div><div style="font-size:11px;color:var(--text3);">${days.length} дней · ${monthOrders.length} заказов</div></div></div>
            <div style="font-size:14px;font-weight:800;color:var(--yellow);white-space:nowrap;">${sumDue(monthOrders).toLocaleString('ru')} ₴</div>
          </div>
          <div id="profile-month-body-${monthKey}" style="display:none;padding-left:12px;background:var(--surface2);border-radius:0 0 8px 8px;">${daysHtml}</div>
        </div>
      `;
    }).join('');
    return `
      <div class="fin-month-card" style="margin-bottom:8px;">
        <div class="fin-month-header" onclick="toggleProfileMonth('${yearKey}')">
          <div style="display:flex;align-items:center;gap:10px;"><i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${yearKey}"></i><div><div class="fin-month-name">${year === 'Без даты' ? 'Без даты' : year + ' год'}</div><div class="fin-month-sub">${months.length} мес. · ${yearOrders.length} заказов</div></div></div>
          <div style="font-size:18px;font-weight:800;color:var(--yellow);">${sumDue(yearOrders).toLocaleString('ru')} ₴</div>
        </div>
        <div id="profile-month-body-${yearKey}" style="display:none;padding:0 0 8px;">${monthsHtml}</div>
      </div>
    `;
  }).join('');
}

function renderDropshipperPaymentsTree(list) {
  const payments = [];
  list.forEach(order => {
    (order.dropshipperPayments || []).forEach(payment => {
      payments.push({ ...payment, order });
    });
  });
  if (!payments.length) return '<div class="empty-state">Выплат пока нет</div>';
  const tree = {};
  payments.forEach(payment => {
    const date = payment.date || 'Без даты';
    const year = date === 'Без даты' ? 'Без даты' : date.slice(0, 4);
    const month = date === 'Без даты' ? 'Без даты' : date.slice(0, 7);
    if (!tree[year]) tree[year] = {};
    if (!tree[year][month]) tree[year][month] = {};
    if (!tree[year][month][date]) tree[year][month][date] = [];
    tree[year][month][date].push(payment);
  });
  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const sumPayments = rows => rows.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  return Object.keys(tree).sort((a, b) => b.localeCompare(a)).map(year => {
    const months = Object.keys(tree[year]).sort((a, b) => b.localeCompare(a));
    const yearPayments = months.flatMap(month => Object.values(tree[year][month]).flat());
    const yearKey = dropshipperTreeKey('drop-pay-year', year);
    const monthsHtml = months.map(month => {
      const days = Object.keys(tree[year][month]).sort((a, b) => b.localeCompare(a));
      const monthPayments = Object.values(tree[year][month]).flat();
      const monthKey = dropshipperTreeKey('drop-pay-month', month);
      const monthTitle = month === 'Без даты' ? 'Без даты' : monthNames[Number(month.slice(5, 7)) - 1];
      const daysHtml = days.map(day => {
        const rows = tree[year][month][day];
        const dayKey = dropshipperTreeKey('drop-pay-day', day);
        const rowsHtml = rows.map(payment => `
          <div class="order-card ${getOrderCardStateClass(payment.order)}" onclick="openOrderDetail('${payment.order.id}')">
            <div class="order-card-top">
              <div class="order-card-left"><span class="order-id">${payment.order.id}</span><span class="order-name">${payment.order.car || payment.order.client || '—'}</span></div>
              <div style="font-size:15px;font-weight:900;color:${Number(payment.amount) < 0 ? 'var(--red)' : 'var(--accent)'};">${Number(payment.amount).toLocaleString('ru')} ₴</div>
            </div>
            <div class="order-card-meta">
              <span class="order-meta-item">${payment.adjustment ? 'Корректировка' : normalizePaymentMethod(payment.method)}</span>
              ${payment.comment ? `<span class="order-meta-item">${escapeHtml(payment.comment)}</span>` : ''}
              <span class="order-meta-item">${payment.order.client || '—'}</span>
              <span class="order-meta-item">${payment.order.phone || '—'}</span>
            </div>
          </div>
        `).join('');
        return `
          <div style="border-bottom:1px solid var(--border);">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;cursor:pointer;" onclick="toggleProfileMonth('${dayKey}')">
              <div style="display:flex;align-items:center;gap:8px;"><i data-lucide="chevron-right" style="width:13px;height:13px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${dayKey}"></i><div><div style="font-size:13px;color:var(--text2);font-weight:700;">${day === 'Без даты' ? 'Без даты' : formatDate(day)}</div><div style="font-size:11px;color:var(--text3);">Выплат: ${rows.length}</div></div></div>
              <div style="font-size:13px;font-weight:800;color:${sumPayments(rows) < 0 ? 'var(--red)' : 'var(--accent)'};white-space:nowrap;">${sumPayments(rows).toLocaleString('ru')} ₴</div>
            </div>
            <div id="profile-month-body-${dayKey}" style="display:none;padding:0 12px 12px 34px;"><div style="display:flex;flex-direction:column;gap:8px;">${rowsHtml}</div></div>
          </div>
        `;
      }).join('');
      return `
        <div style="border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;cursor:pointer;" onclick="toggleProfileMonth('${monthKey}')">
            <div style="display:flex;align-items:center;gap:8px;"><i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${monthKey}"></i><div><div style="font-size:14px;font-weight:800;color:var(--text2);">${monthTitle}</div><div style="font-size:11px;color:var(--text3);">${days.length} дней · ${monthPayments.length} выплат</div></div></div>
            <div style="font-size:14px;font-weight:800;color:${sumPayments(monthPayments) < 0 ? 'var(--red)' : 'var(--accent)'};white-space:nowrap;">${sumPayments(monthPayments).toLocaleString('ru')} ₴</div>
          </div>
          <div id="profile-month-body-${monthKey}" style="display:none;padding-left:12px;background:var(--surface2);border-radius:0 0 8px 8px;">${daysHtml}</div>
        </div>
      `;
    }).join('');
    return `
      <div class="fin-month-card" style="margin-bottom:8px;">
        <div class="fin-month-header" onclick="toggleProfileMonth('${yearKey}')">
          <div style="display:flex;align-items:center;gap:10px;"><i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${yearKey}"></i><div><div class="fin-month-name">${year === 'Без даты' ? 'Без даты' : year + ' год'}</div><div class="fin-month-sub">${months.length} мес. · ${yearPayments.length} выплат</div></div></div>
          <div style="font-size:18px;font-weight:800;color:${sumPayments(yearPayments) < 0 ? 'var(--red)' : 'var(--accent)'};">${sumPayments(yearPayments).toLocaleString('ru')} ₴</div>
        </div>
        <div id="profile-month-body-${yearKey}" style="display:none;padding:0 0 8px;">${monthsHtml}</div>
      </div>
    `;
  }).join('');
}

function openDropshipperDetail(name) {
  if (!canManageDropshippers()) return;
  currentDropshipperFilter = name;
  const titleEl = document.getElementById('dropshipper-detail-title');
  if (titleEl) titleEl.textContent = `Дропшиппер: ${name}`;
  renderDropshipperDetail();
  showScreen('dropshipper-detail');
}

function renderDropshipperDetail() {
  const container = document.getElementById('dropshipper-detail-body');
  if (!container) return;
  const list = orders.filter(o => isOrderFinanciallyActive(o) && o.dropshipper === currentDropshipperFilter && Number(o.dropshipperPayout) > 0);
  const totalDue = list.reduce((sum, o) => sum + (Number(o.dropshipperPayout) || 0), 0);
  const totalPaid = list.reduce((sum, o) => sum + getDropshipperPaid(o), 0);
  const totalLeft = Math.max(0, totalDue - totalPaid);
  const pendingOrders = list.filter(o => getDropshipperPaid(o) < (Number(o.dropshipperPayout) || 0));
  const completedOrders = list.filter(o => getDropshipperPaid(o) >= (Number(o.dropshipperPayout) || 0));
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
    ${renderDropshipperAdjustmentForm()}
    ${renderDropshipperStatusOverview(pendingOrders, completedOrders)}
    <div style="font-size:12px;font-weight:800;color:var(--text3);letter-spacing:0.04em;margin:16px 0 10px;">ОЖИДАЮЩИЕ ОПЛАТЫ</div>
    ${pendingOrders.length ? renderDropshipperOrdersTree(pendingOrders) : '<div class="empty-state" style="padding:18px;"><h3>Ожидающих нет</h3><p>Все заказы этого дропшиппера закрыты по оплате</p></div>'}
    <div style="font-size:12px;font-weight:800;color:var(--text3);letter-spacing:0.04em;margin:18px 0 10px;">ВЫПОЛНЕННЫЕ</div>
    ${completedOrders.length ? renderDropshipperOrdersTree(completedOrders) : '<div class="empty-state" style="padding:18px;"><h3>Выполненных нет</h3><p>После выплаты заказы появятся здесь</p></div>'}
    <div style="font-size:12px;font-weight:800;color:var(--text3);letter-spacing:0.04em;margin:18px 0 10px;">ВЫПЛАТЫ</div>
    ${renderDropshipperPaymentsTree(list)}
  `;
  container.innerHTML = html;
  initIcons();
}

function renderDropshipperStatusOverview(pendingOrders, completedOrders) {
  const pendingLeft = pendingOrders.reduce((sum, o) => sum + Math.max(0, (Number(o.dropshipperPayout) || 0) - getDropshipperPaid(o)), 0);
  const completedPaid = completedOrders.reduce((sum, o) => sum + getDropshipperPaid(o), 0);
  return `
    <div class="profile-summary" style="margin-bottom:14px;">
      <div class="profile-summary-card">
        <div class="profile-summary-label">Ожидающие</div>
        <div class="profile-summary-value" style="color:var(--yellow);">${pendingLeft.toLocaleString('ru')} ₴</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px;">Заказов: ${pendingOrders.length}</div>
      </div>
      <div class="profile-summary-card">
        <div class="profile-summary-label">Выполненные</div>
        <div class="profile-summary-value" style="color:var(--accent);">${completedPaid.toLocaleString('ru')} ₴</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px;">Заказов: ${completedOrders.length}</div>
      </div>
    </div>
  `;
}

function openDropshipperPaymentModal() {
  const list = orders.filter(o => isOrderFinanciallyActive(o) && o.dropshipper === currentDropshipperFilter && Number(o.dropshipperPayout) > 0);
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
      getDropshipperPaymentMethods().map(method => `<option value="${escapeAttr(method)}">${escapeHtml(method)}</option>`).join('');
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
    .filter(o => isOrderFinanciallyActive(o) && o.dropshipper === currentDropshipperFilter && Number(o.dropshipperPayout) > 0)
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
    const cashWorkerName = DROPSHIPPER_CASH_PAYMENT_WORKERS[method] || '';
    if (cashWorkerName) {
      const cashEntry = await sbInsertCashEntry({
        worker_name: cashWorkerName,
        amount: -amount,
        comment: `Выплата дропшипперу ${currentDropshipperFilter}, ${formatDate(date)}`,
      });
      if (Array.isArray(window.allCashLog) && cashEntry) window.allCashLog.unshift(cashEntry);
      if (typeof workerCashLog !== 'undefined' && cashWorkerName === currentWorkerName && cashEntry) {
        workerCashLog.unshift(cashEntry);
      }
    }

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

async function saveDropshipperAdjustment() {
  if (!canManageDropshippers()) return;
  const amount = Number(document.getElementById('dropshipper-adjustment-amount')?.value) || 0;
  const comment = document.getElementById('dropshipper-adjustment-comment')?.value.trim() || '';
  if (!currentDropshipperFilter) return;
  if (!amount) return showToast('Введите сумму корректировки', 'error');
  if (!comment) return showToast('Введите комментарий', 'error');

  const targetOrder = orders
    .filter(o => isOrderFinanciallyActive(o) && o.dropshipper === currentDropshipperFilter && Number(o.dropshipperPayout) > 0)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.time || '').localeCompare(String(a.time || '')))[0];
  if (!targetOrder) return showToast('Нет заказа для корректировки', 'error');

  const btn = document.getElementById('dropshipper-adjustment-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Запись...'; }

  const date = todayStr();
  const timestamp = new Date().toISOString();
  const adjustment = {
    amount,
    date,
    method: 'Корректировка',
    dropshipper: currentDropshipperFilter,
    timestamp,
    adjustment: true,
    comment,
  };

  try {
    const nextOrder = {
      ...targetOrder,
      dropshipperPayments: [
        ...(targetOrder.dropshipperPayments || []),
        adjustment,
      ],
    };
    const saved = await sbUpdateOrder(nextOrder);
    const idx = orders.findIndex(o => o.id === targetOrder.id);
    if (idx !== -1) orders[idx] = saved || nextOrder;

    const linkedWorker = findWorkerForDropshipper(currentDropshipperFilter);
    if (linkedWorker) {
      const cashEntry = await sbInsertCashEntry({
        worker_name: linkedWorker.name,
        amount,
        comment: `Корректировка дропшиппера ${currentDropshipperFilter}: ${comment}`,
      });
      if (Array.isArray(window.allCashLog) && cashEntry) window.allCashLog.unshift(cashEntry);
      if (typeof workerCashLog !== 'undefined' && linkedWorker.name === currentWorkerName && cashEntry) {
        workerCashLog.unshift(cashEntry);
      }
    }

    renderDropshipperDetail();
    if (document.getElementById('screen-owner-payments')?.classList.contains('active')) renderOwnerPaymentsScreen();
    if (document.getElementById('screen-owner-cash')?.classList.contains('active')) renderOwnerCashScreen();
    showToast('Корректировка записана ✓');
  } catch (e) {
    showToast('Ошибка корректировки: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Записать'; }
  }
}
