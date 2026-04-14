// ============================================================
// CLIENTS.JS — экран клиентов и детальный экран клиента
// ============================================================

let currentClientDetailKey = null;

function renderClients() {
  const search = (document.getElementById('filter-client-search')?.value || '').toLowerCase();
  const sort = document.getElementById('filter-client-sort')?.value || 'debt-desc';
  const debtFilter = document.getElementById('filter-client-debt')?.value || 'all';

  let list = getClients().map(client => ({ ...client, debt: getClientDebtTotal(client) }));

  if (search) list = list.filter(c =>
    (c.name  || '').toLowerCase().includes(search) ||
    (c.phone || '').toLowerCase().includes(search)
  );
  if (debtFilter === 'debt') list = list.filter(c => c.debt > 0);
  if (debtFilter === 'no-debt') list = list.filter(c => c.debt <= 0);

  list.sort((a, b) => {
    if (sort === 'debt-asc') return a.debt - b.debt || (a.name || '').localeCompare(b.name || '');
    if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
    return b.debt - a.debt || (a.name || '').localeCompare(b.name || '');
  });

  const container = document.getElementById('clients-list');

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icon('users')}</div>
        <h3>Клиенты не найдены</h3>
        <p>Клиенты появляются автоматически при создании заказов</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map(c => `
    <div class="client-card" onclick="openClientDetail('${encodeURIComponent(c.phone || c.name)}')">
      <div class="client-info">
        <div class="client-name">${c.name}</div>
        <div class="client-phone">${c.phone || '—'}</div>
        <div class="client-phone">${c.address || '—'}</div>
        <div class="client-orders">${icon('clipboard-list')} Заказов: ${c.orders.length}</div>
      </div>
      <div class="client-debt-pill ${c.debt > 0 ? 'has-debt' : 'no-debt'}">
        <span>${c.debt > 0 ? 'С долгом' : 'Без долга'}</span>
        <strong>${c.debt.toLocaleString('ru')} ₴</strong>
      </div>
    </div>
  `).join('');
}

function getOrderDebtLeft(order) {
  if (order?.isCancelled) return 0;
  return Math.max(0, getOrderClientTotalAmount(order) - (Number(order?.debt) || 0));
}

function getClientDebtTotal(client) {
  return (client?.orders || []).reduce((sum, order) => sum + getOrderDebtLeft(order), 0);
}

function openClientDetail(key) {
  currentClientDetailKey = key;
  const decoded = decodeURIComponent(key);
  const clients = getClients();
  const c = clients.find(x => (x.phone || x.name) === decoded);
  if (!c) return;

  const totalSpent = c.orders.reduce((s, o) => s + getOrderClientTotalAmount(o), 0);
  const totalDebt = getClientDebtTotal(c);
  const debtOrders = c.orders.filter(o => getOrderDebtLeft(o) > 0);
  const clientTotalsHtml = `
    <div style="text-align:right;">
      ${canViewFinance()
        ? `
          <div style="font-size:12px;color:var(--text3);margin-bottom:2px;">Всего потрачено</div>
          <div style="font-size:24px;font-weight:800;color:var(--accent);">${totalSpent.toLocaleString('ru')} ₴</div>
        `
        : ''}
      <div style="font-size:12px;color:${totalDebt > 0 ? 'var(--red)' : 'var(--text3)'};font-weight:800;margin-top:4px;">Долг: ${totalDebt.toLocaleString('ru')} ₴</div>
    </div>
      `;

  const el = document.getElementById('client-detail-content');
  el.innerHTML = `
    <div class="detail-header">
      <div class="detail-header-top">
        <div>
            <div class="detail-title">${c.name}</div>
            <div class="detail-subtitle">${c.phone || '—'}${c.address ? ' · ' + c.address : ''}</div>
          </div>
        ${clientTotalsHtml}
      </div>
    </div>

    ${debtOrders.length ? `
      <div class="detail-section">
        <div class="detail-section-title">${icon('alert-triangle')} Заказы с долгом (${debtOrders.length})</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${debtOrders.map(o => renderClientOrderHistoryCard(o, true)).join('')}
        </div>
      </div>
    ` : ''}

    <div class="detail-section">
      <div class="detail-section-title">${icon('clipboard-list')} История заказов (${c.orders.length})</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${c.orders.map(o => renderClientOrderHistoryCard(o)).join('')}
      </div>
    </div>
  `;

  showScreen('client-detail');
}

function renderClientOrderHistoryCard(o, compact = false) {
  const total = getOrderClientTotalAmount(o);
  const paid = Number(o.debt) || 0;
  const left = getOrderDebtLeft(o);
  return `
    <div class="order-card" onclick="openOrderDetail('${o.id}')">
      <div class="order-card-top">
        <div class="order-card-left">
          <div class="order-card-status-row">
            <span class="order-id">${o.id}</span>
            ${statusBadge(getEffectivePaymentStatus(o))}
            ${left > 0 ? `<span class="status-badge status-debt">Долг ${left.toLocaleString('ru')} ₴</span>` : ''}
          </div>
          <span class="order-name">${o.car || '—'}</span>
        </div>
      </div>
      <div class="order-card-meta">
        <span class="order-meta-item">${icon('calendar')} ${formatDate(o.date)}</span>
        <span class="order-meta-item">${icon('hard-hat')} ${getWorkerDisplayName(o.responsible) || '—'}</span>
        ${total > 0 ? `<span class="order-meta-item" style="font-weight:700;color:var(--accent);">${icon('coins')} ${paid.toLocaleString('ru')} / ${total.toLocaleString('ru')} ₴</span>` : ''}
        ${!compact && left > 0 ? `<span class="order-meta-item" style="font-weight:800;color:var(--red);">Осталось ${left.toLocaleString('ru')} ₴</span>` : ''}
      </div>
    </div>
  `;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return parts[0][0].toUpperCase() + parts[1][0].toUpperCase();
  return name[0].toUpperCase();
}

// ============================================================
// СОЗДАНИЕ КЛИЕНТА
// ============================================================

// Хранилище локально-созданных клиентов (без заказов)
let manualClients = [];

async function loadManualClients() {
  try {
    manualClients = await sbFetchManualClients();
  } catch (e) {
    manualClients = [];
    showToast('Ошибка загрузки базы клиентов: ' + e.message, 'error');
  }
}

function openClientModal() {
  document.getElementById('c-name').value = '';
  document.getElementById('c-phone').value = '';
  document.getElementById('c-address').value = '';
  document.getElementById('client-modal').classList.add('active');
  setTimeout(() => document.getElementById('c-name').focus(), 100);
}

function closeClientModal() {
  document.getElementById('client-modal').classList.remove('active');
}

async function saveClient() {
  const name  = document.getElementById('c-name').value.trim();
  const phone = document.getElementById('c-phone').value.trim();
  const address = document.getElementById('c-address').value.trim();

  if (!name) {
    alert('Введите имя клиента');
    document.getElementById('c-name').focus();
    return;
  }

  // Проверяем дубли среди существующих клиентов из заказов
  const existing = getClients();
  const key = phone || name;
  if (existing.find(c => (c.phone || c.name) === key)) {
    showToast('Клиент с таким телефоном/именем уже существует', 'error');
    return;
  }

  const saveBtn = document.getElementById('client-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳'; }

  try {
    const created = await sbInsertManualClient({ name, phone, address });
    manualClients.push(created || { name, phone, address, orders: [] });
    closeClientModal();
    renderClients();
    showToast('Клиент добавлен ✓');
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Сохранить'; }
  }
}
