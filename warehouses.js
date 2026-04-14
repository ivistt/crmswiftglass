// ============================================================
// WAREHOUSES.JS — склады и дропшипперы
// ============================================================

let currentWarehouseFilter = null;
let currentDropshipperFilter = null;

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

  const debtOrders = list.filter(o => getSupplierDebt(o) > 0);
  const paidOrders = list.filter(o => getSupplierDebt(o) <= 0);
  container.innerHTML = renderWarehouseOrderGroup('Не оплаченные (с долгом)', debtOrders, true)
    + renderWarehouseOrderGroup('Все остальные записи', paidOrders, false);
  initIcons();
}

function renderWarehouseOrderGroup(title, list, isDebt) {
  if (!list.length) return '';
  return `
    <div style="font-size:15px;font-weight:800;color:${isDebt ? 'var(--red)' : 'var(--text2)'};margin:16px 0 10px;">${title}</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${list.map(o => {
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
              <span class="order-meta-item">${icon('calendar')} ${formatDate(o.date)}</span>
              <span class="order-meta-item">${icon('clock')} ${o.time || '—'}</span>
              <span class="order-meta-item">${icon('user')} ${o.client || '—'}</span>
              ${o.warehouseCode ? `<span class="order-meta-item mono">${icon('hash')} ${o.warehouseCode}</span>` : ''}
            </div>
          </div>
        `;
      }).join('')}
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
    return `
      <div class="home-card" onclick="openDropshipperDetail('${escapeAttr(name)}')">
        <div style="font-size:12px;color:var(--text3);font-weight:600;">Записей: ${rows.length}</div>
        <div style="margin-top:auto;padding-top:12px;">
          <div style="font-size:20px;font-weight:800;margin-bottom:6px;">${escapeHtml(name)}</div>
          <div style="font-size:20px;font-weight:800;color:var(--yellow);">${total.toLocaleString('ru')} ₴</div>
        </div>
      </div>
    `;
  }).join('');
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
  let html = '';
  Object.keys(tree).sort((a, b) => b.localeCompare(a)).forEach(year => {
    html += `<div style="font-size:18px;font-weight:800;margin:22px 0 10px;">${year}</div>`;
    Object.keys(tree[year]).sort((a, b) => b.localeCompare(a)).forEach(month => {
      html += `<div style="font-size:15px;font-weight:800;color:var(--text2);margin:14px 0 8px;">${monthNames[Number(month) - 1]}</div>`;
      Object.keys(tree[year][month]).sort((a, b) => b.localeCompare(a)).forEach(day => {
        const rows = tree[year][month][day];
        const total = rows.reduce((sum, o) => sum + (Number(o.dropshipperPayout) || 0), 0);
        html += `<div style="font-size:13px;font-weight:700;color:var(--text3);margin:12px 0 8px;">${formatDate(day)} · ${total.toLocaleString('ru')} ₴</div>`;
        html += rows.map(o => `
          <div class="order-card" onclick="openOrderDetail('${o.id}')">
            <div class="order-card-top">
              <div class="order-card-left"><span class="order-id">${o.id}</span><span class="order-name">${o.car || '—'}</span></div>
              <div style="font-size:15px;font-weight:900;color:var(--yellow);">${Number(o.dropshipperPayout).toLocaleString('ru')} ₴</div>
            </div>
            <div class="order-card-meta">
              <span class="order-meta-item">${icon('clock')} ${o.time || '—'}</span>
              <span class="order-meta-item">${icon('user')} ${o.client || '—'}</span>
              <span class="order-meta-item">${icon('phone')} ${o.phone || '—'}</span>
            </div>
          </div>
        `).join('');
      });
    });
  });
  container.innerHTML = html;
  initIcons();
}
