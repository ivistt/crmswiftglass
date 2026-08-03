// ============================================================
// CLIENTS.JS — экран клиентов и детальный экран клиента
// ============================================================

let currentClientDetailKey = null;
let clientStatementClientKey = null;
let clientStatementMode = 'single';

function getClientStatementClient() {
  if (!clientStatementClientKey) return null;
  const decoded = decodeURIComponent(clientStatementClientKey);
  return getClients().find(client => (client.phone || client.name) === decoded) || null;
}

function getClientStatementPeriod() {
  if (clientStatementMode === 'range') {
    const from = document.getElementById('client-statement-from-date')?.value || '';
    const to = document.getElementById('client-statement-to-date')?.value || '';
    if (!from || !to) return { error: 'Укажите начало и конец периода' };
    if (from > to) return { error: 'Дата начала не может быть позже даты окончания' };
    return { from, to, label: from === to ? formatDate(from) : `${formatDate(from)} — ${formatDate(to)}` };
  }

  const date = document.getElementById('client-statement-single-date')?.value || '';
  if (!date) return { error: 'Выберите дату' };
  return { from: date, to: date, label: formatDate(date) };
}

function getClientStatementRows(client, period) {
  if (!client || !period?.from || !period?.to) return [];
  return (client.orders || [])
    .filter(order => order?.workerDone && !order?.isCancelled && !isOrderDeleted(order))
    .filter(order => String(order?.date || '') >= period.from && String(order?.date || '') <= period.to)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))
      || String(a.time || '').localeCompare(String(b.time || ''))
      || String(a.id || '').localeCompare(String(b.id || '')))
    .map(order => {
      const total = getOrderClientTotalAmount(order);
      const paid = getOrderClientPaidAmount(order);
      return {
        date: order.date || '',
        car: order.car || '—',
        total,
        paid,
        left: Math.max(0, total - paid),
      };
    });
}

function getClientStatementTotals(rows) {
  return (rows || []).reduce((totals, row) => {
    totals.total += Number(row?.total) || 0;
    totals.paid += Number(row?.paid) || 0;
    totals.left += Number(row?.left) || 0;
    return totals;
  }, { total: 0, paid: 0, left: 0 });
}

function formatClientStatementMoney(value) {
  return `${(Number(value) || 0).toLocaleString('ru')} ₴`;
}

function openClientStatementModal(key) {
  if (currentRole !== 'owner') return;
  clientStatementClientKey = key || currentClientDetailKey;
  const client = getClientStatementClient();
  if (!client) return showToast('Клиент не найден', 'error');

  const today = typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0, 10);
  const singleInput = document.getElementById('client-statement-single-date');
  const fromInput = document.getElementById('client-statement-from-date');
  const toInput = document.getElementById('client-statement-to-date');
  if (singleInput) singleInput.value = today;
  if (fromInput) fromInput.value = today;
  if (toInput) toInput.value = today;
  const nameEl = document.getElementById('client-statement-client-name');
  if (nameEl) nameEl.textContent = client.name || 'Клиент';

  setClientStatementMode('single');
  document.getElementById('client-statement-modal')?.classList.add('active');
  renderClientStatementPreview();
  initIcons();
}

function closeClientStatementModal() {
  document.getElementById('client-statement-modal')?.classList.remove('active');
  clientStatementClientKey = null;
}

function setClientStatementMode(mode) {
  clientStatementMode = mode === 'range' ? 'range' : 'single';
  document.querySelectorAll('[data-client-statement-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.clientStatementMode === clientStatementMode);
  });
  const isRange = clientStatementMode === 'range';
  const singleWrap = document.getElementById('client-statement-single-wrap');
  const fromWrap = document.getElementById('client-statement-from-wrap');
  const toWrap = document.getElementById('client-statement-to-wrap');
  if (singleWrap) singleWrap.style.display = isRange ? 'none' : '';
  if (fromWrap) fromWrap.style.display = isRange ? '' : 'none';
  if (toWrap) toWrap.style.display = isRange ? '' : 'none';
  renderClientStatementPreview();
}

function renderClientStatementPreview() {
  const preview = document.getElementById('client-statement-preview');
  const printButton = document.getElementById('client-statement-print-btn');
  if (!preview) return;
  const client = getClientStatementClient();
  const period = getClientStatementPeriod();
  if (!client || period.error) {
    preview.innerHTML = `<div class="client-statement-preview-empty">${escapeHtml(period.error || 'Клиент не найден')}</div>`;
    if (printButton) printButton.disabled = true;
    return;
  }

  const rows = getClientStatementRows(client, period);
  if (!rows.length) {
    preview.innerHTML = '<div class="client-statement-preview-empty">За выбранный период нет завершённых заказов</div>';
    if (printButton) printButton.disabled = true;
    return;
  }

  const totals = getClientStatementTotals(rows);
  preview.innerHTML = `
    <div class="client-statement-preview-title">${escapeHtml(period.label)} · заказов: ${rows.length}</div>
    <div class="client-statement-preview-grid">
      <div class="client-statement-preview-item">
        <div class="client-statement-preview-label">К оплате</div>
        <div class="client-statement-preview-value">${formatClientStatementMoney(totals.total)}</div>
      </div>
      <div class="client-statement-preview-item client-statement-preview-item--paid">
        <div class="client-statement-preview-label">Оплачено</div>
        <div class="client-statement-preview-value">${formatClientStatementMoney(totals.paid)}</div>
      </div>
      <div class="client-statement-preview-item client-statement-preview-item--left">
        <div class="client-statement-preview-label">Остаток</div>
        <div class="client-statement-preview-value">${formatClientStatementMoney(totals.left)}</div>
      </div>
    </div>
  `;
  if (printButton) printButton.disabled = false;
}

function buildClientStatementPrintHtml(client, period, rows) {
  const totals = getClientStatementTotals(rows);
  const phone = String(client?.phone || '').trim();
  const address = String(client?.address || '').trim();
  const details = [phone, address].filter(Boolean).map(escapeHtml).join(' · ');
  const bodyRows = rows.map(row => `
    <tr>
      <td>${escapeHtml(formatDate(row.date))}</td>
      <td>${escapeHtml(row.car || '—')}</td>
      <td class="money">${escapeHtml(formatClientStatementMoney(row.total))}</td>
      <td class="money paid">${escapeHtml(formatClientStatementMoney(row.paid))}</td>
      <td class="money left">${escapeHtml(formatClientStatementMoney(row.left))}</td>
    </tr>
  `).join('');

  return `<!doctype html>
  <html lang="ru">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Сверка — ${escapeHtml(client?.name || 'Клиент')}</title>
    <style>
      @page { size: A4; margin: 16mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #15171b; font-family: Arial, sans-serif; font-size: 12px; }
      .receipt { width: 100%; }
      .top { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 18px; border-bottom: 2px solid #15171b; }
      h1 { margin: 0; font-size: 24px; letter-spacing: -0.4px; }
      .client { margin-top: 6px; font-size: 14px; font-weight: 700; }
      .details { margin-top: 4px; color: #60646c; }
      .period { text-align: right; }
      .period strong { display: block; margin-top: 4px; font-size: 15px; }
      table { width: 100%; margin-top: 22px; border-collapse: collapse; }
      th { padding: 9px 10px; border-bottom: 1px solid #9da1aa; color: #60646c; font-size: 10px; text-align: left; text-transform: uppercase; }
      td { padding: 12px 10px; border-bottom: 1px solid #dde0e5; }
      .money { text-align: right; white-space: nowrap; }
      .paid { color: #087f5b; }
      .left { color: #c92a2a; }
      tfoot td { padding-top: 14px; border-top: 2px solid #15171b; border-bottom: 0; font-size: 13px; font-weight: 800; }
      .generated { margin-top: 28px; color: #777b83; font-size: 10px; }
      @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style>
  </head>
  <body>
    <main class="receipt">
      <div class="top">
        <div>
          <h1>Сверка с клиентом</h1>
          <div class="client">${escapeHtml(client?.name || 'Клиент')}</div>
          ${details ? `<div class="details">${details}</div>` : ''}
        </div>
        <div class="period">Период<strong>${escapeHtml(period.label)}</strong></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Дата</th>
            <th>Автомобиль</th>
            <th class="money">Общая сумма к оплате</th>
            <th class="money">Оплаченная сумма</th>
            <th class="money">Остаток к оплате</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="2">Итого</td>
            <td class="money">${escapeHtml(formatClientStatementMoney(totals.total))}</td>
            <td class="money paid">${escapeHtml(formatClientStatementMoney(totals.paid))}</td>
            <td class="money left">${escapeHtml(formatClientStatementMoney(totals.left))}</td>
          </tr>
        </tfoot>
      </table>
      <div class="generated">Сформировано: ${escapeHtml(new Date().toLocaleString('ru-RU'))}</div>
    </main>
  </body>
  </html>`;
}

function printClientStatement() {
  if (currentRole !== 'owner') return;
  const client = getClientStatementClient();
  const period = getClientStatementPeriod();
  if (!client) return showToast('Клиент не найден', 'error');
  if (period.error) return showToast(period.error, 'error');
  const rows = getClientStatementRows(client, period);
  if (!rows.length) return showToast('За выбранный период нет завершённых заказов', 'error');

  const printWindow = window.open('', '_blank', 'width=980,height=760');
  if (!printWindow) return showToast('Браузер заблокировал окно печати', 'error');
  printWindow.document.open();
  printWindow.document.write(buildClientStatementPrintHtml(client, period, rows));
  printWindow.document.close();
  printWindow.focus();
  closeClientStatementModal();
  setTimeout(() => printWindow.print(), 180);
}

function buildClientDebtCopyText(client) {
  const debtOrders = (client?.orders || []).filter(order => getOrderDebtLeft(order) > 0);
  if (!debtOrders.length) return '';
  const lines = debtOrders.map(order => {
    const services = formatOrderServiceTypeText(order?.serviceType || '') || '—';
    const total = getOrderClientTotalAmount(order);
    const debtLeft = getOrderDebtLeft(order);
    return [
      formatDate(order.date),
      `Авто: ${order.car || '—'}`,
      `Услуги: ${services}`,
      `Общая сумма: ${total.toLocaleString('ru')} ₴`,
      `Остаток долга: ${debtLeft.toLocaleString('ru')} ₴`,
    ].join('\n');
  });
  const totalAmount = debtOrders.reduce((sum, order) => sum + getOrderClientTotalAmount(order), 0);
  const totalDebt = debtOrders.reduce((sum, order) => sum + getOrderDebtLeft(order), 0);
  return `${client.name || 'Клиент'}\n\n${lines.join('\n\n')}\n\nИтого по заказам: ${totalAmount.toLocaleString('ru')} ₴\nИтого долг: ${totalDebt.toLocaleString('ru')} ₴`;
}

async function copyClientDebtSummary(key) {
  const decoded = decodeURIComponent(key || '');
  const client = getClients().find(item => (item.phone || item.name) === decoded);
  if (!client) return;
  const text = buildClientDebtCopyText(client);
  if (!text) {
    showToast('У клиента нет заказов с долгом', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Сводка долга скопирована ✓');
  } catch (e) {
    showToast('Не удалось скопировать', 'error');
  }
}

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
  if (!order || order.isCancelled || isOrderDeleted(order) || !order.workerDone) return 0;
  return Math.max(0, getOrderClientTotalAmount(order) - getOrderClientPaidAmount(order));
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

  const totalSpent = c.orders.filter(isOrderFinanciallyActive).reduce((s, o) => s + getOrderClientTotalAmount(o), 0);
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
        <div style="display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;">
          ${currentRole === 'owner' ? `<button class="btn-secondary" onclick="event.stopPropagation(); openClientStatementModal('${encodeURIComponent(c.phone || c.name)}')">${icon('printer')} Сверка</button>` : ''}
          ${debtOrders.length ? `<button class="btn-secondary" onclick="event.stopPropagation(); copyClientDebtSummary('${encodeURIComponent(c.phone || c.name)}')">${icon('copy')} Скопировать</button>` : ''}
        ${clientTotalsHtml}
        </div>
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
  const paid = getOrderClientPaidAmount(o);
  const left = getOrderDebtLeft(o);
  return `
    <div class="order-card ${getOrderCardStateClass(o)}" onclick="openOrderDetail('${o.id}')">
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
