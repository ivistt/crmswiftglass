// ============================================================
// FINANCE.JS — экран финансов (только для owner)
// ============================================================

// Зарплаты из БД: массив { id, worker_name, date, amount }
let allSalaries = [];
let ownerPendingSalaryOpen = false;
let ownerManualSalaryEntriesOpen = false;
let ownerSalarySelectedWorker = '';

function toggleOwnerPendingSalaryPanel() {
  ownerPendingSalaryOpen = !ownerPendingSalaryOpen;
  renderOwnerSalaryScreen();
}

function toggleOwnerManualSalaryEntriesPanel() {
  ownerManualSalaryEntriesOpen = !ownerManualSalaryEntriesOpen;
  renderOwnerSalaryScreen();
}
function getFinanceSalaryEntries(entries = allSalaries) {
  return (entries || [])
    .filter(isRelevantSalaryEntry)
    .filter(entry => entry?.worker_name && entry.date)
    .filter(entry => !isSalaryWithdrawalEntry(entry));
}

function calcFinanceTotals(monthKey = '') {
  const relevantOrders = (orders || [])
    .filter(isOrderFinanciallyActive)
    .filter(order => !monthKey || String(order.date || '').startsWith(monthKey));
  const salaryTotal = getFinanceSalaryEntries()
    .filter(entry => !monthKey || String(entry.date || '').startsWith(monthKey))
    .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

  let clientIncome = 0;
  let purchaseTotal = 0;
  let moldingExpense = 0;
  let toningExpense = 0;

  for (const order of relevantOrders) {
    clientIncome += getOrderClientPaidAmount(order);
    purchaseTotal += Number(order.purchase) || 0;
    moldingExpense += (Number(order.molding) || 0) * 0.2;
    toningExpense += (Number(order.toning) || 0) * 0.2;
  }

  const expenses = purchaseTotal + moldingExpense + toningExpense + salaryTotal;
  const revenue = clientIncome - expenses;

  return {
    orders: relevantOrders,
    clientIncome,
    purchaseTotal,
    moldingExpense,
    toningExpense,
    salaryTotal,
    expenses,
    revenue,
  };
}

function getManualSalaryReports(entries = allSalaries) {
  return (entries || []).filter(isManualSalaryReportEntry);
}

function getSalaryDeviationPct(manualAmount, autoAmount) {
  const manual = Number(manualAmount) || 0;
  const autoVal = Number(autoAmount) || 0;
  if (autoVal <= 0) return manual > 0 ? 1 : 0;
  return Math.abs(manual - autoVal) / autoVal;
}

function financeEscapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getSalaryAnomalies(entries = allSalaries) {
  return getManualSalaryReports(entries)
    .map(entry => {
      const autoAmount = calcDaySalary(entry.worker_name, entry.date);
      const manualAmount = Number(entry.amount) || 0;
      const deviationPct = getSalaryDeviationPct(manualAmount, autoAmount);
      const summary = getWorkerCompletedOrdersSummary(entry.worker_name, entry.date);
      return {
        entry,
        workerName: entry.worker_name,
        date: entry.date,
        manualAmount,
        autoAmount,
        deviationPct,
        summary,
      };
    })
    .filter(item => item.deviationPct > 0.10)
    .sort((a, b) => {
      if (b.deviationPct !== a.deviationPct) return b.deviationPct - a.deviationPct;
      return (b.date || '').localeCompare(a.date || '');
    });
}

function getSalaryAnalytics(entries = allSalaries) {
  const salaryEntries = getOwnerSalaryEntries(entries);
  const byWorker = {};
  const linkedOrderIdsByWorker = {};

  salaryEntries.forEach(entry => {
    const workerName = entry.worker_name;
    if (!workerName) return;
    if (!byWorker[workerName]) {
      byWorker[workerName] = {
        workerName,
        salaryTotal: 0,
      };
    }
    byWorker[workerName].salaryTotal += Number(entry.amount) || 0;

    const resolvedOrderId = typeof resolveSalaryEntryOrderId === 'function'
      ? resolveSalaryEntryOrderId(entry.order_id)
      : String(entry.order_id || '').trim();
    if (!resolvedOrderId) return;
    if (!linkedOrderIdsByWorker[workerName]) linkedOrderIdsByWorker[workerName] = new Set();
    linkedOrderIdsByWorker[workerName].add(resolvedOrderId);
  });

  const workersAnalytics = Object.values(byWorker).map(item => ({
    ...item,
    ordersCount: linkedOrderIdsByWorker[item.workerName]?.size || 0,
  }));

  const topOrders = [...workersAnalytics]
    .sort((a, b) => (b.ordersCount || 0) - (a.ordersCount || 0))
    .slice(0, 5);

  const topSalary = [...workersAnalytics]
    .sort((a, b) => (b.salaryTotal || 0) - (a.salaryTotal || 0))
    .slice(0, 5);

  const biggestOrders = (orders || [])
    .filter(order => !order?.isCancelled)
    .map(order => ({
      id: order.id,
      client: order.client || '',
      car: order.car || '',
      date: order.date || '',
      totalAmount: typeof getOrderClientTotalAmount === 'function'
        ? getOrderClientTotalAmount(order)
        : ((Number(order?.total) || 0) + (Number(order?.income) || 0) + (Number(order?.delivery) || 0)),
    }))
    .sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0))
    .slice(0, 5);

  return {
    topOrders,
    topSalary,
    biggestOrders,
  };
}

function renderSalaryAnalyticsSection(entries = allSalaries) {
  const analytics = getSalaryAnalytics(entries);
  const renderWorkerRanking = (title, items, valueFn, subtitleFn = null, color = 'var(--text)') => `
    <div style="padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface2);">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:10px;letter-spacing:0.04em;">${title}</div>
      ${items.length ? items.map(item => `
        <div class="sal-nav-row" onclick="salaryNavPush({worker:'${financeEscapeAttr(item.workerName)}'})" style="padding:10px 0;">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;">
            <div class="worker-avatar" style="width:34px;height:34px;font-size:12px;border-radius:10px;">${getInitials(item.workerName)}</div>
            <div style="min-width:0;">
              <div style="font-size:14px;font-weight:700;">${item.workerName}</div>
              ${subtitleFn ? `<div style="font-size:12px;color:var(--text3);margin-top:2px;">${subtitleFn(item)}</div>` : ''}
            </div>
          </div>
          <div style="font-size:14px;font-weight:800;color:${color};margin-left:12px;">${valueFn(item)}</div>
        </div>
      `).join('') : '<div style="font-size:13px;color:var(--text3);">Нет данных</div>'}
    </div>
  `;
  const renderOrderRanking = (title, items) => `
    <div style="padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface2);">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:10px;letter-spacing:0.04em;">${title}</div>
      ${items.length ? items.map(item => `
        <div class="sal-nav-row" onclick="openSalaryEntryOrder('${financeEscapeAttr(item.id)}', event)" style="padding:10px 0;">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;">
            <div class="worker-avatar" style="width:34px;height:34px;font-size:11px;border-radius:10px;">${escapeHtml(String(item.id || '—').replace('SG-', ''))}</div>
            <div style="min-width:0;">
              <div style="font-size:14px;font-weight:700;">${escapeHtml(item.id || '—')}</div>
              <div style="font-size:12px;color:var(--text3);margin-top:2px;">${escapeHtml(item.client || item.car || '—')}${item.date ? ' · ' + escapeHtml(formatDate(item.date)) : ''}</div>
            </div>
          </div>
          <div style="font-size:14px;font-weight:800;color:var(--accent);margin-left:12px;">${(Number(item.totalAmount) || 0).toLocaleString('ru')} ₴</div>
        </div>
      `).join('') : '<div style="font-size:13px;color:var(--text3);">Нет данных</div>'}
    </div>
  `;

  return `
    <div style="margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;color:var(--text3);margin-bottom:8px;letter-spacing:0.04em;">АНАЛИТИКА</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;">
        ${renderWorkerRanking('Больше всего заказов', analytics.topOrders, item => item.ordersCount, item => `ЗП: ${(Number(item.salaryTotal) || 0).toLocaleString('ru')} ₴`, 'var(--accent)')}
        ${renderWorkerRanking('Больше всего ЗП', analytics.topSalary, item => (Number(item.salaryTotal) || 0).toLocaleString('ru') + ' ₴', item => `Заказов: ${item.ordersCount}`, 'var(--yellow)')}
        ${renderOrderRanking('Самый большой заказ', analytics.biggestOrders)}
      </div>
    </div>
  `;
}

async function loadAllSalaries() {
  try {
    allSalaries = await sbFetchAllSalaries();
  } catch (e) {
    showToast('Ошибка загрузки зарплат: ' + e.message, 'error');
  }
}


// Строим salaryData из allSalaries для совместимости с renderFinanceMonth
function buildSalaryData() {
  const map = {};
  for (const s of getManualSalaryReports()) {
    const ym = s.date.slice(0, 7);
    if (!map[ym]) map[ym] = {};
    // Суммируем если несколько записей за разные дни одного месяца
    map[ym][s.worker_name] = (map[ym][s.worker_name] || 0) + Number(s.amount);
  }
  return map;
}

async function renderFinance() {
  await loadAllSalaries();
  const container = document.getElementById('finance-content');
  const currentMonthKey = (typeof getLocalDateString === 'function' ? getLocalDateString() : new Date().toISOString().slice(0, 10)).slice(0, 7);

  // Группируем заказы по месяцам
  const map = {};
  for (const o of orders) {
    if (!o.date || !isOrderFinanciallyActive(o)) continue;
    const ym = o.date.slice(0, 7);
    if (!map[ym]) map[ym] = [];
    map[ym].push(o);
  }

  const keys = Object.keys(map).sort((a, b) => b.localeCompare(a));

  if (!keys.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <h3>Данных нет</h3>
        <p>Добавьте записи, чтобы увидеть финансовую сводку</p>
      </div>`;
    return;
  }

  const overall = calcFinanceTotals();
  const currentMonthTotals = calcFinanceTotals(currentMonthKey);

  container.innerHTML = `
    <!-- Инструменты архивации -->
    <div style="display:flex;gap:10px;margin-bottom:8px;flex-wrap:wrap;">
      <button class="btn-primary" style="flex:1;min-width:140px;display:flex;align-items:center;justify-content:center;gap:6px;" onclick="backupToSupabase()">
        <i data-lucide="cloud-upload" style="width:14px;height:14px;"></i> Backup в Supabase
      </button>
      <button class="btn-secondary" style="flex:1;min-width:120px;display:flex;align-items:center;justify-content:center;gap:6px;" onclick="exportAllJSON()">
        <i data-lucide="download" style="width:14px;height:14px;"></i> Скачать JSON
      </button>
      <button class="btn-secondary" style="flex:1;min-width:120px;display:flex;align-items:center;justify-content:center;gap:6px;" onclick="exportAllCSV()">
        <i data-lucide="file-spreadsheet" style="width:14px;height:14px;"></i> CSV файлы
      </button>
      <button class="btn-danger" style="flex:1;min-width:140px;display:flex;align-items:center;justify-content:center;gap:6px;" onclick="deleteDoneOrders()">
        <i data-lucide="trash-2" style="width:14px;height:14px;"></i> Удалить выполненные
      </button>
    </div>
    <div id="backup-history-wrap" style="margin-bottom:16px;">
      <div id="backup-history-bar" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface2);border-radius:12px;cursor:pointer;border:1px solid var(--border);" onclick="toggleBackupHistory()">
        <span style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:7px;">
          <i data-lucide="history" style="width:14px;height:14px;color:var(--text3);"></i>
          История бэкапов
        </span>
        <i data-lucide="chevron-down" id="backup-history-chevron" style="width:14px;height:14px;color:var(--text3);transition:transform 0.2s;"></i>
      </div>
      <div id="backup-history-body" style="display:none;"></div>
    </div>

    <!-- Общая сводка -->
    <div class="fin-summary">
      <div class="fin-summary-title">Общая сводка</div>
      <div class="fin-summary-grid">
        ${finSummaryItem('Выручка', overall.revenue, overall.revenue >= 0 ? 'var(--accent)' : 'var(--red)')}
        ${finSummaryItem('Затраты', overall.expenses, 'var(--red)')}
        ${finSummaryItem('Приход', overall.clientIncome, 'var(--accent)')}
        ${finSummaryItem('Фактический приход', currentMonthTotals.clientIncome, 'var(--blue)')}
        ${finSummaryItem('Зарплаты', overall.salaryTotal, 'var(--yellow)')}
      </div>
    </div>

    <!-- По месяцам -->
    <div style="display:flex;flex-direction:column;gap:16px;">
      ${keys.map(ym => renderFinanceMonth(ym, map[ym])).join('')}
    </div>
  `;

  initIcons();
}

function calcTotalSalaries(ym) {
  return getFinanceSalaryEntries()
    .filter(entry => !ym || entry.date.startsWith(ym))
    .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
}

function renderFinanceMonth(ym, monthOrders) {
  const [year, month] = ym.split('-');
  const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь',
    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const monthName = MONTH_NAMES[parseInt(month) - 1];

  const monthTotals = calcFinanceTotals(ym);
  const monthSalaries = monthTotals.salaryTotal;

  return `
    <div class="fin-month-card">
      <div class="fin-month-header" onclick="toggleFinMonth('${ym}')">
        <div>
          <div class="fin-month-name">${monthName} ${year}</div>
          <div class="fin-month-sub">${monthOrders.length} записей</div>
        </div>
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="text-align:right;">
            <div style="font-size:11px;color:var(--text3);margin-bottom:2px;">Выручка</div>
            <div style="font-size:18px;font-weight:800;color:${monthTotals.revenue >= 0 ? 'var(--accent)' : 'var(--red)'};">${monthTotals.revenue.toLocaleString('ru')} ₴</div>
          </div>
          <i data-lucide="chevron-down" style="width:16px;height:16px;color:var(--text3);transition:transform 0.2s;" id="chevron-${ym}"></i>
        </div>
      </div>

      <div class="fin-month-body" id="fin-body-${ym}" style="display:none;">

        <!-- Финансовые показатели -->
        <div class="fin-section-title">📊 Показатели</div>
        <div class="fin-metrics-grid">
          ${finMetric('Выручка', monthTotals.revenue, monthTotals.revenue >= 0 ? 'var(--accent)' : 'var(--red)')}
          ${finMetric('Затраты', monthTotals.expenses, 'var(--red)')}
          ${finMetric('Приход', monthTotals.clientIncome, 'var(--blue)')}
          ${finMetric('Зарплаты', monthSalaries, 'var(--yellow)')}
        </div>

        <!-- Зарплаты сотрудников (из профилей) -->
        <div class="fin-section-title" style="margin-top:16px;display:flex;align-items:center;justify-content:space-between;">
          <span>${icon('coins')} Зарплаты сотрудников</span>
          <button class="fin-add-salary-btn" onclick="openOwnerSalaryScreen()">
            <i data-lucide="external-link" style="width:12px;height:12px;"></i> Подробнее
          </button>
        </div>
        <div id="fin-salaries-${ym}">
          ${renderSalaryRowsCompact(ym)}
        </div>


      </div>
    </div>
  `;
}

// Компактный вид зарплат внутри месяца финансов
function renderSalaryRowsCompact(ym) {
  const rows = getFinanceSalaryEntries().filter(s => s.date.startsWith(ym));
  if (!rows.length) {
    return `<div style="font-size:13px;color:var(--text3);padding:8px 0;">Зарплаты не внесены</div>`;
  }
  const byWorker = {};
  for (const s of rows) {
    if (!byWorker[s.worker_name]) {
      byWorker[s.worker_name] = { manual: 0, auto: 0 };
    }
    byWorker[s.worker_name].manual += Number(s.amount);
    byWorker[s.worker_name].auto += calcDaySalary(s.worker_name, s.date);
  }
  return Object.entries(byWorker).map(([name, totals]) => {
    const w = workers.find(x => x.name === name);
    const showFormula = w && (w.systemRole === 'senior' || w.systemRole === 'junior');
    const formula     = w ? (w.salaryFormula || DEFAULT_SALARY_FORMULA[w.systemRole] || '') : '';
    const wid         = w ? w.id : null;
    const isOff = getSalaryDeviationPct(totals.manual, totals.auto) > 0.10;

    const formulaBadge = showFormula && wid ? `
      <div style="display:flex;align-items:center;gap:5px;margin-top:3px;flex-wrap:wrap;">
        <span style="font-size:11px;color:var(--text3);">Формула:</span>
        <code id="ff-display-${wid}" style="font-size:11px;color:var(--accent);background:var(--surface2);padding:1px 6px;border-radius:4px;">${escapeHtml(formula) || '—'}</code>
        <button id="ff-edit-${wid}" class="icon-btn" title="Изменить формулу" style="width:20px;height:20px;border-radius:5px;padding:0;"
          onclick="openFormulaModal('${wid}', '${financeEscapeAttr(name)}', '${financeEscapeAttr(formula)}')">
          <i data-lucide="pencil" style="width:9px;height:9px;"></i>
        </button>
      </div>
    ` : '';

    return `
      <div class="fin-salary-row" style="flex-wrap:wrap;align-items:flex-start;gap:4px;">
        <div class="fin-salary-worker" style="flex:1;min-width:0;">
          <div class="worker-avatar" style="width:28px;height:28px;font-size:11px;border-radius:8px;flex-shrink:0;">${getInitials(name)}</div>
          <div style="min-width:0;">
            <div style="font-size:13px;">${name}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px;">Ориентир: ${totals.auto.toLocaleString('ru')} ₴</div>
            ${formulaBadge}
          </div>
        </div>
        <span style="font-weight:700;color:${isOff ? '#ef4444' : 'var(--yellow)'};font-size:14px;align-self:center;">${totals.manual.toLocaleString('ru')} ₴</span>
      </div>
    `;
  }).join('');
}

// ============================================================
// ДЕТАЛЬНЫЙ ЭКРАН ЗАРПЛАТ
// ============================================================

// Стек навигации: 'workers' | { anomalies: true } | { worker: name } | { worker, year } | { worker, year, month } | { periodMonth } | { periodMonth, periodDay }
let salaryNavStack = [];
let editingManualSalaryId = '';

function getOwnerManualSalaryEntries(entries = allSalaries) {
  return (entries || []).filter(isOwnerManualSalaryEntry);
}

function getOwnerSalaryEntries(entries = allSalaries) {
  return (entries || [])
    .filter(entry => entry?.worker_name && entry.date && Number(entry.amount) !== 0);
}

function getOwnerSalaryWorkerNames(entries = getOwnerSalaryEntries()) {
  const names = new Set();
  (workers || []).forEach(worker => {
    if (worker?.name) names.add(worker.name);
  });
  (entries || []).forEach(entry => {
    if (entry?.worker_name) names.add(entry.worker_name);
  });
  return Array.from(names).sort((a, b) => String(a).localeCompare(String(b), 'ru'));
}

function getOwnerSalaryBalance(workerName, entries = getOwnerSalaryEntries()) {
  return (entries || [])
    .filter(entry => entry.worker_name === workerName)
    .filter(entry => isSalaryEntryOpenForCurrentAccumulation(entry, entries))
    .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
}

function setOwnerSalarySelectedWorker(workerName) {
  ownerSalarySelectedWorker = workerName || '';
  salaryNavStack = [];
  openOwnerSalaryHistoryModal(ownerSalarySelectedWorker);
}

function getOwnerSalaryHistoryTitle(workerName) {
  return escapeHtml(getWorkerDisplayName(workerName) || workerName || 'История ЗП');
}

function getOwnerSalaryHistoryHtml(workerName) {
  const salaryEntries = getOwnerSalaryEntries();
  if (!workerName) {
    return `
      <div class="fin-month-card owner-cash-history-card">
        <div class="owner-cash-history-title">
          <div>
            <div class="fin-month-name">История ЗП</div>
            <div class="fin-month-sub">Выберите сотрудника сверху</div>
          </div>
        </div>
      </div>
    `;
  }
  return renderOwnerEmployeeSalaryHistory(workerName, salaryEntries);
}

function openOwnerSalaryHistoryModal(workerName) {
  ownerSalarySelectedWorker = workerName || '';
  let modal = document.getElementById('owner-salary-history-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'owner-salary-history-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="modal" style="max-width:720px;">
      <div class="modal-header">
        <div>
          <div class="modal-title">${getOwnerSalaryHistoryTitle(workerName)}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px;">История ЗП сотрудника</div>
        </div>
        <button class="modal-close" onclick="closeOwnerSalaryHistoryModal()">${icon('x')}</button>
      </div>
      <div class="modal-body" style="padding-top:0;">
        ${getOwnerSalaryHistoryHtml(workerName)}
      </div>
    </div>
  `;
  modal.classList.add('active');
  initIcons();
}

function closeOwnerSalaryHistoryModal() {
  document.getElementById('owner-salary-history-modal')?.classList.remove('active');
}

function getSalaryEntryKindLabel(entry) {
  if (isSalaryWithdrawalEntry(entry)) return 'Снятие';
  if (isWorkAttendanceEntry(entry)) return 'Выход';
  if (isOwnerManualSalaryEntry(entry)) return 'Ручная';
  if (entry.entry_type === 'auto' || entry.order_id) return 'Авто';
  return 'Запись';
}

function getSalaryEntryOrderMeta(entry) {
  const orderId = String(entry?.order_id || '').trim();
  if (!orderId) return { client: '', car: '', services: '' };
  const order = (orders || []).find(item => String(item?.id || '') === orderId);
  return {
    client: String(order?.client || '').trim(),
    car: String(order?.car || order?.client || '').trim(),
    services: typeof formatOrderServiceTypeText === 'function'
      ? String(formatOrderServiceTypeText(order?.serviceType || '') || '').trim()
      : '',
  };
}

function renderOwnerSalaryEntryRow(entry, { showWorker = false, showEdit = false } = {}) {
  const amount = Number(entry.amount) || 0;
  const history = getSalaryEditHistory(entry);
  const canEdit = showEdit && !isSalaryWithdrawalEntry(entry) && !isSalaryEntryClosedByWithdrawal(entry);
  const canDelete = showEdit && currentRole === 'owner' && !isSalaryWithdrawalEntry(entry) && !isSalaryEntryClosedByWithdrawal(entry);
  const orderMeta = getSalaryEntryOrderMeta(entry);
  const linkedOrderId = typeof resolveSalaryEntryOrderId === 'function' ? resolveSalaryEntryOrderId(entry.order_id) : '';
  return `<div style="padding:10px 0;border-bottom:1px solid var(--border);${linkedOrderId ? 'cursor:pointer;' : ''}" ${linkedOrderId ? `onclick="openSalaryEntryOrder('${financeEscapeAttr(entry.order_id)}', event)"` : ''}>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
      <div style="min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          ${showWorker ? `<span style="font-size:13px;font-weight:800;color:var(--text);">${escapeHtml(getWorkerDisplayName(entry.worker_name))}</span>` : ''}
          <span style="font-size:12px;font-weight:800;color:var(--text2);">${escapeHtml(entry.order_id || '—')}</span>
          <span style="font-size:10px;font-weight:900;color:var(--accent);background:rgba(29,233,182,.12);border:1px solid rgba(29,233,182,.22);border-radius:999px;padding:2px 6px;">${getSalaryEntryKindLabel(entry)}</span>
        </div>
        ${orderMeta.client ? `<div style="font-size:12px;color:var(--text);margin-top:4px;font-weight:700;">${escapeHtml(orderMeta.client)}</div>` : ''}
        ${orderMeta.car ? `<div style="font-size:12px;color:var(--text3);margin-top:4px;">${escapeHtml(orderMeta.car)}</div>` : ''}
        ${orderMeta.services ? `<div style="font-size:11px;color:var(--accent);margin-top:4px;">${escapeHtml(orderMeta.services)}</div>` : ''}
        ${entry.comment ? `<div style="font-size:12px;color:var(--text2);margin-top:5px;">${escapeHtml(entry.comment)}</div>` : ''}
        ${history.length ? `<div style="font-size:11px;color:var(--text3);margin-top:4px;">Отредактировано владельцем: ${history.length}</div>` : ''}
      </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <span style="font-size:13px;font-weight:900;color:${amount >= 0 ? 'var(--accent)' : '#ef4444'};white-space:nowrap;">${amount.toLocaleString('ru')} ₴</span>
        ${canEdit ? `<button class="icon-btn" title="Редактировать" onclick="event.stopPropagation(); editPendingSalaryEntry('${entry.id}')" style="width:28px;height:28px;border-radius:7px;"><i data-lucide="pencil" style="width:12px;height:12px;"></i></button>` : ''}
        ${canDelete ? `<button class="icon-btn icon-action-danger" title="Удалить" onclick="event.stopPropagation(); deleteSalaryEntry('${entry.id}')" style="width:28px;height:28px;border-radius:7px;"><i data-lucide="trash-2" style="width:12px;height:12px;"></i></button>` : ''}
      </div>
    </div>
  </div>`;
}

function renderOwnerSalaryOverview(entries = getOwnerSalaryEntries()) {
  const workerNames = getOwnerSalaryWorkerNames(entries);
  const rows = workerNames.map(name => ({
    workerName: name,
    balance: getOwnerSalaryBalance(name, entries),
    recordsCount: entries.filter(entry => entry.worker_name === name).length,
  }));
  const total = rows.reduce((sum, row) => sum + row.balance, 0);

  return `
    <div class="fin-month-card" style="margin-bottom:12px;">
      <div style="padding:14px 16px;border-bottom:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
          <div>
            <div class="fin-month-name">Текущая ЗП</div>
            <div class="fin-month-sub">Баланс считает начисления, ручные записи и снятия</div>
          </div>
          <div style="font-size:22px;font-weight:900;color:${total >= 0 ? 'var(--accent)' : '#ef4444'};white-space:nowrap;">${total.toLocaleString('ru')} ₴</div>
        </div>
      </div>
      <div style="padding:12px 16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;">
        ${rows.length ? rows.map(row => `
          <div class="owner-cash-worker-row" onclick="setOwnerSalarySelectedWorker('${financeEscapeAttr(row.workerName)}')">
            <div>
              <div class="owner-cash-worker-name">${escapeHtml(getWorkerDisplayName(row.workerName) || row.workerName)}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:3px;">${row.recordsCount} зап.</div>
            </div>
            <div class="owner-cash-worker-balance" style="color:${row.balance >= 0 ? 'var(--accent)' : '#ef4444'};">${row.balance.toLocaleString('ru')} ₴</div>
          </div>
        `).join('') : `
          <div style="font-size:13px;color:var(--text3);">Сотрудники не найдены</div>
        `}
      </div>
    </div>
  `;
}

function renderOwnerEmployeeSalaryHistory(workerName, entries = getOwnerSalaryEntries()) {
  const rows = (entries || [])
    .filter(entry => entry.worker_name === workerName)
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const total = getSalaryAccumulatedForWithdraw(workerName, rows);
  const workerKey = String(workerName || '').replace(/[^a-zA-Z0-9_-]+/g, '-');

  if (!rows.length) {
    return `
      <div class="fin-month-card owner-cash-history-card">
        <div class="owner-cash-history-title">
          <div>
            <div class="fin-month-name">${escapeHtml(getWorkerDisplayName(workerName) || workerName)}</div>
            <div class="fin-month-sub">История ЗП сотрудника</div>
          </div>
        </div>
        <div class="empty-state" style="padding:24px 12px;">
          <div class="empty-state-icon">${icon('receipt')}</div>
          <h3>Начислений нет</h3>
          <p>У этого сотрудника пока нет записей ЗП</p>
        </div>
      </div>
    `;
  }

  const tree = {};
  for (const entry of rows) {
    const date = entry.date || 'Без даты';
    const year = date === 'Без даты' ? 'Без даты' : date.slice(0, 4);
    const month = date === 'Без даты' ? 'Без даты' : date.slice(0, 7);
    if (!tree[year]) tree[year] = {};
    if (!tree[year][month]) tree[year][month] = {};
    if (!tree[year][month][date]) tree[year][month][date] = [];
    tree[year][month][date].push(entry);
  }

  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const yearsHtml = Object.keys(tree).sort((a, b) => b.localeCompare(a)).map(year => {
    const months = Object.keys(tree[year]).sort((a, b) => b.localeCompare(a));
    const yearSum = months.reduce((sum, monthKey) => sum + Object.values(tree[year][monthKey]).flat().reduce((acc, entry) => {
      if (isSalaryWithdrawalEntry(entry)) return acc;
      return acc + (Number(entry.amount) || 0);
    }, 0), 0);
    const yearKey = `owner-salary-worker-${workerKey}-year-${year}`;
    const monthsHtml = months.map(monthKey => {
      const days = Object.keys(tree[year][monthKey]).sort((a, b) => b.localeCompare(a));
      const monthSum = days.reduce((sum, day) => sum + tree[year][monthKey][day].reduce((acc, entry) => {
        if (isSalaryWithdrawalEntry(entry)) return acc;
        return acc + (Number(entry.amount) || 0);
      }, 0), 0);
      const monthToggleKey = `${yearKey}-month-${monthKey}`;
      const monthName = monthKey === 'Без даты' ? 'Без даты' : `${monthNames[Number(monthKey.slice(5, 7)) - 1] || monthKey} ${monthKey.slice(0, 4)}`;
      const daysHtml = days.map(day => {
        const dayEntries = tree[year][monthKey][day];
        const withdrawals = dayEntries.filter(isSalaryWithdrawalEntry);
        const accruals = dayEntries.filter(entry => !isSalaryWithdrawalEntry(entry));
        const dayTotal = accruals.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
        const dayKey = `${monthToggleKey}-day-${day}`;
        const renderedRows = [
          ...accruals.map(entry => renderOwnerSalaryEntryRow(entry, { showEdit: true })),
          ...withdrawals.map(entry => renderOwnerSalaryEntryRow(entry, { showEdit: true })),
        ].join('');
        return `
          <div style="border-bottom:1px solid var(--border);">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;cursor:pointer;" onclick="toggleProfileMonth('${dayKey}')">
              <div style="display:flex;align-items:center;gap:8px;">
                <i data-lucide="chevron-right" style="width:13px;height:13px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${dayKey}"></i>
                <div style="font-size:13px;color:var(--text2);font-weight:600;">${day === 'Без даты' ? day : formatDate(day)}</div>
                <div style="font-size:11px;color:var(--text3);">${dayEntries.length} зап.</div>
              </div>
              <div style="font-size:13px;font-weight:800;color:${dayTotal >= 0 ? 'var(--accent)' : '#ef4444'};">${dayTotal.toLocaleString('ru')} ₴</div>
            </div>
            <div id="profile-month-body-${dayKey}" style="display:none;padding:0 12px 10px 28px;">
              ${renderedRows}
            </div>
          </div>
        `;
      }).join('');

      return `
        <div style="border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;cursor:pointer;" onclick="toggleProfileMonth('${monthToggleKey}')">
            <div style="display:flex;align-items:center;gap:8px;">
              <i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${monthToggleKey}"></i>
              <div style="font-size:14px;font-weight:700;color:var(--text2);">${monthName}</div>
              <div style="font-size:11px;color:var(--text3);">${days.length} дн.</div>
            </div>
            <div style="font-size:14px;font-weight:800;color:${monthSum >= 0 ? 'var(--accent)' : '#ef4444'};">${monthSum.toLocaleString('ru')} ₴</div>
          </div>
          <div id="profile-month-body-${monthToggleKey}" style="display:none;background:var(--surface2);border-radius:0 0 8px 8px;">
            ${daysHtml}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div style="border-bottom:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;cursor:pointer;" onclick="toggleProfileMonth('${yearKey}')">
          <div style="display:flex;align-items:center;gap:8px;">
            <i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${yearKey}"></i>
            <div style="font-size:14px;font-weight:800;color:var(--text);">${year}</div>
            <div style="font-size:11px;color:var(--text3);">${months.length} мес.</div>
          </div>
          <div style="font-size:14px;font-weight:900;color:${yearSum >= 0 ? 'var(--accent)' : '#ef4444'};">${yearSum.toLocaleString('ru')} ₴</div>
        </div>
        <div id="profile-month-body-${yearKey}" style="display:none;">
          ${monthsHtml}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="fin-month-card owner-cash-history-card">
      <div class="owner-cash-history-title">
        <div>
          <div class="fin-month-name">${escapeHtml(getWorkerDisplayName(workerName) || workerName)}</div>
          <div class="fin-month-sub">История ЗП сотрудника</div>
        </div>
        <div style="font-size:18px;font-weight:900;color:${total >= 0 ? 'var(--accent)' : '#ef4444'};white-space:nowrap;">${total.toLocaleString('ru')} ₴</div>
      </div>
      <div style="border-top:1px solid var(--border);">
        ${yearsHtml}
      </div>
    </div>
  `;
}

function renderOwnerSalaryScreen() {
  const container = document.getElementById('owner-salary-content');
  if (!container) return;

  const salaryEntries = getOwnerSalaryEntries();
  const salaryOverviewHtml = renderOwnerSalaryOverview(salaryEntries);
  const pendingSalaryHtml = renderOwnerPendingSalaryPanel();
  const manualSalaryHtml = renderOwnerManualSalaryPanel();
  const analyticsHtml = renderSalaryAnalyticsSection(salaryEntries);

  container.innerHTML = salaryOverviewHtml
    + pendingSalaryHtml
    + manualSalaryHtml
    + analyticsHtml
    + '<button class="subtle-reload-btn" style="margin-top:12px;" onclick="clearCacheAndReload()">Очистить кеш и перезагрузить</button>';
  initIcons();
}

function rerenderOwnerSalaryViews() {
  const ownerScreenActive = document.getElementById('screen-owner-salary')?.classList.contains('active');
  if (ownerScreenActive) {
    renderOwnerSalaryScreen();
  }
  if (document.getElementById('owner-salary-history-modal')?.classList.contains('active') && ownerSalarySelectedWorker) {
    openOwnerSalaryHistoryModal(ownerSalarySelectedWorker);
  }
  if (!ownerScreenActive) renderSalaryScreen();
}

function getSalaryEditHistory(entry) {
  if (!entry?.edit_history) return [];
  if (Array.isArray(entry.edit_history)) return entry.edit_history;
  try {
    const parsed = JSON.parse(entry.edit_history);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function isSalaryEntryClosedByWithdrawal(entry, entries = allSalaries) {
  if (!entry?.worker_name) return false;
  return !isSalaryEntryOpenForCurrentAccumulation(entry, entries);
}

function getPendingOwnerSalaryEntries(entries = allSalaries) {
  return (entries || [])
    .filter(entry => entry && Number(entry.amount) !== 0)
    .filter(entry => !isSalaryWithdrawalEntry(entry))
    .filter(entry => !isSalaryEntryClosedByWithdrawal(entry, entries))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function renderOwnerPendingSalaryPanel() {
  const entries = getPendingOwnerSalaryEntries().slice(0, 80);
  const isOpen = ownerPendingSalaryOpen;
  const html = entries.length
    ? entries.map(entry => {
      const amount = Number(entry.amount) || 0;
      const typeLabel = isOwnerManualSalaryEntry(entry) ? 'Ручная' : (entry.entry_type === 'auto' || entry.order_id ? 'Авто' : 'Начисление');
      const history = getSalaryEditHistory(entry);
      const orderMeta = getSalaryEntryOrderMeta(entry);
      const latestEdit = history[history.length - 1] || null;
      const latestEditHtml = latestEdit
        ? `<div style="font-size:11px;color:var(--text3);margin-top:4px;">Отредактировано владельцем: ${Number(latestEdit.amount_before || 0).toLocaleString('ru')} → ${Number(latestEdit.amount_after || 0).toLocaleString('ru')} ₴</div>`
        : '';
      const linkedOrderId = typeof resolveSalaryEntryOrderId === 'function' ? resolveSalaryEntryOrderId(entry.order_id) : '';
      return `<div style="padding:10px 0;border-bottom:1px solid var(--border);${linkedOrderId ? 'cursor:pointer;' : ''}" ${linkedOrderId ? `onclick="openSalaryEntryOrder('${financeEscapeAttr(entry.order_id)}', event)"` : ''}>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
          <div style="min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span style="font-size:13px;font-weight:800;color:var(--text);">${escapeHtml(getWorkerDisplayName(entry.worker_name))}</span>
              <span style="font-size:10px;font-weight:900;color:var(--accent);background:rgba(29,233,182,.12);border:1px solid rgba(29,233,182,.22);border-radius:999px;padding:2px 6px;">${typeLabel}</span>
            </div>
            <div style="font-size:12px;color:var(--text3);margin-top:3px;">${formatDate(entry.date)} · ${escapeHtml(entry.order_id || '—')}</div>
            ${orderMeta.client ? `<div style="font-size:12px;color:var(--text);margin-top:4px;font-weight:700;">${escapeHtml(orderMeta.client)}</div>` : ''}
            ${orderMeta.car ? `<div style="font-size:12px;color:var(--text3);margin-top:4px;">${escapeHtml(orderMeta.car)}</div>` : ''}
            ${orderMeta.services ? `<div style="font-size:11px;color:var(--accent);margin-top:4px;">${escapeHtml(orderMeta.services)}</div>` : ''}
            ${entry.comment ? `<div style="font-size:12px;color:var(--text2);margin-top:5px;">${escapeHtml(entry.comment)}</div>` : ''}
            ${latestEditHtml}
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <span style="font-size:13px;font-weight:900;color:${amount >= 0 ? 'var(--accent)' : '#ef4444'};white-space:nowrap;">${amount.toLocaleString('ru')} ₴</span>
            <button class="icon-btn" title="Редактировать начисление" onclick="event.stopPropagation(); editPendingSalaryEntry('${entry.id}')" style="width:28px;height:28px;border-radius:7px;">
              <i data-lucide="pencil" style="width:12px;height:12px;"></i>
            </button>
            <button class="icon-btn icon-action-danger" title="Удалить начисление" onclick="event.stopPropagation(); deleteSalaryEntry('${entry.id}')" style="width:28px;height:28px;border-radius:7px;">
              <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
            </button>
          </div>
        </div>
      </div>`;
    }).join('')
    : '<div style="font-size:12px;color:var(--text3);padding:8px 0;">Ожидающих начислений нет</div>';

  return `<div class="profile-today-card" style="margin-bottom:12px;">
    <button type="button" onclick="toggleOwnerPendingSalaryPanel()" style="width:100%;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;background:none;border:none;padding:0;color:inherit;text-align:left;cursor:pointer;">
      <div>
        <div class="profile-today-label"><i data-lucide="clock" style="width:15px;height:15px;"></i> Ожидающие начисления</div>
        <div style="font-size:11px;color:var(--text3);margin-top:6px;">Можно редактировать до снятия ЗП сотрудником или старшим.</div>
      </div>
      <i data-lucide="${isOpen ? 'chevron-up' : 'chevron-down'}" style="width:16px;height:16px;color:var(--text3);margin-top:2px;flex-shrink:0;"></i>
    </button>
    <div style="display:${isOpen ? 'block' : 'none'};margin-top:8px;">${html}</div>
  </div>`;
}

function renderOwnerManualSalaryPanel() {
  const workerOptions = (workers || [])
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'))
    .map(worker => `<option value="${financeEscapeAttr(worker.name)}">${escapeHtml(getWorkerDisplayName(worker.name))}</option>`)
    .join('');
  const orderOptions = (orders || [])
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.id || '').localeCompare(String(a.id || '')))
    .map(order => {
      const label = `${order.id} · ${order.car || order.client || '—'}${order.date ? ' · ' + formatDate(order.date) : ''}`;
      return `<option value="${financeEscapeAttr(order.id)}">${escapeHtml(label)}</option>`;
    })
    .join('');
  const entries = getOwnerManualSalaryEntries()
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const entriesHtml = entries.length
    ? entries.map(entry => {
      const amount = Number(entry.amount) || 0;
      const linkedOrderId = typeof resolveSalaryEntryOrderId === 'function' ? resolveSalaryEntryOrderId(entry.order_id) : '';
      return `<div style="padding:10px 0;border-bottom:1px solid var(--border);${linkedOrderId ? 'cursor:pointer;' : ''}" ${linkedOrderId ? `onclick="openSalaryEntryOrder('${financeEscapeAttr(entry.order_id)}', event)"` : ''}>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
          <div style="min-width:0;">
            <div style="font-size:13px;font-weight:800;color:var(--text);">${escapeHtml(getWorkerDisplayName(entry.worker_name))}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:3px;">${formatDate(entry.date)} · Заказ ${escapeHtml(entry.order_id || '—')}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:5px;">${escapeHtml(entry.comment || '')}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <span style="font-size:13px;font-weight:900;color:${amount >= 0 ? 'var(--accent)' : '#ef4444'};white-space:nowrap;">${amount.toLocaleString('ru')} ₴</span>
            <button class="icon-btn" title="Редактировать" onclick="event.stopPropagation(); startEditManualSalary('${entry.id}')" style="width:28px;height:28px;border-radius:7px;">
              <i data-lucide="pencil" style="width:12px;height:12px;"></i>
            </button>
            <button class="icon-btn icon-action-danger" title="Удалить" onclick="event.stopPropagation(); deleteSalaryEntry('${entry.id}')" style="width:28px;height:28px;border-radius:7px;">
              <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
            </button>
          </div>
        </div>
      </div>`;
    }).join('')
    : '<div style="font-size:12px;color:var(--text3);padding:8px 0;">Ручных записей пока нет</div>';

  return `<div class="profile-today-card" style="margin-bottom:12px;">
    <div class="profile-today-label"><i data-lucide="plus-circle" style="width:15px;height:15px;"></i> Ручная запись ЗП</div>
    <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin-top:12px;">
      <div class="form-group">
        <label class="form-label">Сотрудник</label>
        <select class="form-select" id="manual-salary-worker">${workerOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Дата</label>
        <input class="form-input" type="date" id="manual-salary-date" value="${getLocalDateString()}">
      </div>
    </div>
    <div class="form-group" style="margin-top:10px;">
      <label class="form-label">Заказ</label>
      <select class="form-select" id="manual-salary-order">${orderOptions}</select>
    </div>
    <div class="form-group" style="margin-top:10px;">
      <label class="form-label">Сумма (+ или -)</label>
      <input class="form-input" type="number" id="manual-salary-amount" placeholder="например 500 или -300">
    </div>
    <div class="form-group" style="margin-top:10px;">
      <label class="form-label">Комментарий</label>
      <textarea class="form-input" id="manual-salary-comment" rows="2" placeholder="За что начисление или списание"></textarea>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;">
      <button class="btn-primary" id="manual-salary-save-btn" onclick="saveOwnerManualSalary()">Добавить запись</button>
      <button class="btn-secondary" id="manual-salary-cancel-btn" onclick="cancelEditManualSalary()" style="display:none;">Отмена</button>
    </div>
    <div style="margin-top:16px;display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;" onclick="toggleOwnerManualSalaryEntriesPanel()">
      <div style="font-size:12px;font-weight:800;color:var(--text3);letter-spacing:0.04em;">РУЧНЫЕ ЗАПИСИ</div>
      <i data-lucide="${ownerManualSalaryEntriesOpen ? 'chevron-down' : 'chevron-right'}" style="width:14px;height:14px;color:var(--text3);"></i>
    </div>
    ${ownerManualSalaryEntriesOpen ? `<div style="margin-top:6px;">${entriesHtml}</div>` : ''}
  </div>`;
}

async function openSalaryDetail() {
  if (currentRole === 'owner' && typeof openOwnerSalaryScreen === 'function') {
    await openOwnerSalaryScreen();
    return;
  }
  salaryNavStack = [];
  if (currentRole === 'owner') await loadAllSalaries();
  renderSalaryScreen();
  document.getElementById('salary-detail-modal').classList.add('active');
  initIcons();
}

function closeSalaryDetail() {
  document.getElementById('salary-detail-modal').classList.remove('active');
}

function renderSalaryScreen() {
  const state = salaryNavStack[salaryNavStack.length - 1] || null;
  const container = document.getElementById('salary-detail-body');
  const title     = document.getElementById('salary-detail-title');
  const backBtn   = document.getElementById('salary-detail-back');
  const manualReports = getManualSalaryReports();
  const salaryEntries = getOwnerSalaryEntries();

  if (backBtn) backBtn.style.display = salaryNavStack.length > 0 ? 'flex' : 'none';

  if (!state) {
    title.textContent = 'Зарплаты сотрудников';
    const salaryOverviewHtml = renderOwnerSalaryOverview(salaryEntries);
    const selectedWorkerHistoryHtml = ownerSalarySelectedWorker
      ? renderOwnerEmployeeSalaryHistory(ownerSalarySelectedWorker, salaryEntries)
      : '';
    const manualSalaryHtml = renderOwnerManualSalaryPanel();
    const pendingSalaryHtml = renderOwnerPendingSalaryPanel();
    const analyticsHtml = renderSalaryAnalyticsSection(salaryEntries);
    container.innerHTML = salaryOverviewHtml
      + selectedWorkerHistoryHtml
      + pendingSalaryHtml
      + manualSalaryHtml
      + analyticsHtml;

  } else if (state.anomalies) {
    title.textContent = 'Аномалии ЗП';
    const anomalies = getSalaryAnomalies(manualReports);
    if (!anomalies.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${icon('check')}</div><h3>Аномалий нет</h3><p>Все внесённые ЗП укладываются в порог 10%</p></div>`;
      initIcons();
      return;
    }
    container.innerHTML = anomalies.map(item => `
      <div class="sal-nav-row" onclick="salaryNavPush({worker:'${financeEscapeAttr(item.workerName)}',year:'${item.date.slice(0,4)}',month:'${item.date.slice(5,7)}'})">
        <div style="display:flex;align-items:center;gap:12px;min-width:0;">
          <div class="worker-avatar" style="width:40px;height:40px;font-size:13px;border-radius:12px;background:rgba(239,68,68,0.14);color:#ef4444;">${getInitials(item.workerName)}</div>
          <div style="min-width:0;">
            <div style="font-weight:700;font-size:15px;">${item.workerName}</div>
            <div style="font-size:12px;color:var(--text3);">${formatDate(item.date)} · ${item.summary.count} заказов · ${item.summary.totalAmount.toLocaleString('ru')} ₴</div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px;">Ориентир ${item.autoAmount.toLocaleString('ru')} ₴ · Внесено ${item.manualAmount.toLocaleString('ru')} ₴</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-weight:800;font-size:15px;color:#ef4444;">${Math.round(item.deviationPct * 100)}%</span>
          <i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text3);"></i>
        </div>
      </div>
    `).join('');

  } else if (state.periodMonth && !state.periodDay) {
    const ym = state.periodMonth;
    const [year, month] = ym.split('-');
    const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь',
      'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    title.textContent = `${MONTH_NAMES[parseInt(month) - 1]} ${year}`;
    const rows = manualReports
      .filter(s => s.date.startsWith(ym))
      .sort((a, b) => b.date.localeCompare(a.date) || String(a.worker_name).localeCompare(String(b.worker_name), 'ru'));
    const byDay = {};
    for (const row of rows) {
      if (!byDay[row.date]) {
        byDay[row.date] = { rows: [], manualTotal: 0, autoTotal: 0, anomaliesCount: 0 };
      }
      const manualAmount = Number(row.amount) || 0;
      const autoAmount = calcDaySalary(row.worker_name, row.date);
      const deviationPct = getSalaryDeviationPct(manualAmount, autoAmount);
      byDay[row.date].rows.push(row);
      byDay[row.date].manualTotal += manualAmount;
      byDay[row.date].autoTotal += autoAmount;
      if (deviationPct > 0.10) byDay[row.date].anomaliesCount += 1;
    }
    const days = Object.keys(byDay).sort((a, b) => b.localeCompare(a));
    container.innerHTML = days.map(day => {
      const dayData = byDay[day];
      return `
        <div class="sal-nav-row" onclick="salaryNavPush({periodMonth:'${financeEscapeAttr(ym)}',periodDay:'${day}'})">
          <div>
            <div style="font-weight:700;font-size:15px;">${formatDate(day)}</div>
            <div style="font-size:12px;color:var(--text3);">Ориентир: ${dayData.autoTotal.toLocaleString('ru')} ₴ · Записей: ${dayData.rows.length}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="text-align:right;">
              <div style="font-size:12px;font-weight:700;color:${dayData.anomaliesCount ? '#ef4444' : 'var(--text3)'};">${dayData.anomaliesCount ? `Аномалий: ${dayData.anomaliesCount}` : 'Без аномалий'}</div>
              <div style="font-weight:800;font-size:16px;color:${dayData.anomaliesCount ? '#ef4444' : 'var(--yellow)'};">${dayData.manualTotal.toLocaleString('ru')} ₴</div>
            </div>
            <i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text3);"></i>
          </div>
        </div>
      `;
    }).join('') || '<div style="color:var(--text3);padding:16px 0;">Нет записей</div>';

  } else if (state.periodMonth && state.periodDay) {
    title.textContent = formatDate(state.periodDay);
    const rows = manualReports
      .filter(s => s.date === state.periodDay)
      .sort((a, b) => String(a.worker_name).localeCompare(String(b.worker_name), 'ru'));
    if (!rows.length) {
      container.innerHTML = '<div style="color:var(--text3);padding:16px 0;">Нет записей</div>';
      initIcons();
      return;
    }
    const total = rows.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const autoTotal = rows.reduce((sum, s) => sum + calcDaySalary(s.worker_name, s.date), 0);
    container.innerHTML = `
      <div style="font-size:13px;color:var(--text3);margin-bottom:12px;">
        Ориентир за день: <span style="font-weight:800;color:var(--accent);font-size:15px;">${autoTotal.toLocaleString('ru')} ₴</span>
        <span style="margin-left:10px;">Внесено: <span style="font-weight:800;color:${getSalaryDeviationPct(total, autoTotal) > 0.10 ? '#ef4444' : 'var(--yellow)'};font-size:15px;">${total.toLocaleString('ru')} ₴</span></span>
      </div>
      ${rows.map(entry => {
        const autoAmount = calcDaySalary(entry.worker_name, entry.date);
        const manualAmount = Number(entry.amount) || 0;
        const diffPct = getSalaryDeviationPct(manualAmount, autoAmount);
        const isOff = diffPct > 0.10;
        const summary = getWorkerCompletedOrdersSummary(entry.worker_name, entry.date);
        const ordersHtml = summary.orders.length
          ? '<div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;">'
            + summary.orders.map(order => `<div style="font-size:12px;color:var(--text3);">${escapeHtml(order.id)} · ${escapeHtml(order.car || '—')}</div>`).join('')
            + '</div>'
          : '<div style="font-size:12px;color:var(--text3);margin-top:10px;">Заказов нет</div>';
        return `<div style="padding:12px 0;border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="font-weight:700;font-size:15px;">${entry.worker_name}</div>
              <div style="font-size:12px;color:var(--text3);margin-top:4px;">Выполнено: ${summary.count} · Сумма заказов: ${summary.totalAmount.toLocaleString('ru')} ₴</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:12px;color:var(--text3);">Ориентир: <span style="font-weight:700;color:var(--accent);">${autoAmount.toLocaleString('ru')} ₴</span></div>
              <div style="font-size:14px;font-weight:800;color:${isOff ? '#ef4444' : 'var(--yellow)'};margin-top:4px;">Внесено: ${manualAmount.toLocaleString('ru')} ₴</div>
              ${autoAmount > 0 ? `<div style="font-size:11px;color:${isOff ? '#ef4444' : 'var(--text3)'};margin-top:2px;">Отклонение: ${Math.round(diffPct * 100)}%</div>` : ''}
            </div>
          </div>
          ${ordersHtml}
        </div>`;
      }).join('')}
    `;

  } else if (state.worker && !state.year) {
    // Уровень 2: года сотрудника
    title.textContent = getWorkerDisplayName(state.worker);
    const rows = salaryEntries.filter(s => s.worker_name === state.worker);
    const years = [...new Set(rows.map(s => s.date.slice(0, 4)))].sort((a, b) => b - a);
    container.innerHTML = years.map(year => {
      const yearRows = rows.filter(s => s.date.startsWith(year));
      const total = yearRows.reduce((sum, s) => sum + Number(s.amount), 0);
      return `
        <div class="sal-nav-row" onclick="salaryNavPush({worker:'${financeEscapeAttr(state.worker)}',year:'${year}'})">
          <div>
            <div style="font-weight:700;font-size:15px;">${year}</div>
            <div style="font-size:12px;color:var(--text3);">Записей: ${yearRows.length}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-weight:800;font-size:16px;color:${total >= 0 ? 'var(--accent)' : '#ef4444'};">${total.toLocaleString('ru')} ₴</span>
            <i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text3);"></i>
          </div>
        </div>
      `;
    }).join('') || '<div style="color:var(--text3);padding:16px 0;">Нет записей</div>';

  } else if (state.worker && state.year && !state.month) {
    // Уровень 3: месяцы
    const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь',
      'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    title.textContent = state.year;
    const rows = salaryEntries.filter(s => s.worker_name === state.worker && s.date.startsWith(state.year));
    const months = [...new Set(rows.map(s => s.date.slice(5, 7)))].sort((a, b) => b - a);
    container.innerHTML = months.map(m => {
      const ym = `${state.year}-${m}`;
      const monthRows = rows.filter(s => s.date.startsWith(ym));
      const total = monthRows.reduce((sum, s) => sum + Number(s.amount), 0);
      return `
        <div class="sal-nav-row" onclick="salaryNavPush({worker:'${financeEscapeAttr(state.worker)}',year:'${state.year}',month:'${m}'})">
          <div>
            <div style="font-weight:700;font-size:15px;">${MONTH_NAMES[parseInt(m)-1]}</div>
            <div style="font-size:12px;color:var(--text3);">Записей: ${monthRows.length}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-weight:800;font-size:16px;color:${total >= 0 ? 'var(--accent)' : '#ef4444'};">${total.toLocaleString('ru')} ₴</span>
            <i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text3);"></i>
          </div>
        </div>
      `;
    }).join('') || '<div style="color:var(--text3);padding:16px 0;">Нет записей</div>';

  } else if (state.worker && state.year && state.month) {
    // Уровень 4: дни → записи
    const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь',
      'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    const ym = `${state.year}-${state.month}`;
    title.textContent = `${MONTH_NAMES[parseInt(state.month)-1]} ${state.year}`;
    const rows = salaryEntries
      .filter(s => s.worker_name === state.worker && s.date.startsWith(ym))
      .sort((a, b) => b.date.localeCompare(a.date) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const total = rows.reduce((sum, s) => sum + Number(s.amount), 0);

    // Группируем по дням
    const byDay = {};
    for (const s of rows) {
      if (!byDay[s.date]) byDay[s.date] = [];
      byDay[s.date].push(s);
    }
    const sortedDays = Object.keys(byDay).sort((a, b) => b.localeCompare(a));

    const daysHtml = sortedDays.map(date => {
      const dayRows = byDay[date];
      const dayTotal = dayRows.reduce((sum, s) => sum + Number(s.amount), 0);
      return `<div style="padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
          <div>
            <div style="font-size:14px;font-weight:600;color:var(--text2);">${formatDate(date)}</div>
            <div style="margin-top:6px;font-size:12px;color:var(--text3);">Записей: ${dayRows.length}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:14px;font-weight:800;color:${dayTotal >= 0 ? 'var(--accent)' : '#ef4444'};margin-top:4px;">${dayTotal.toLocaleString('ru')} ₴</div>
          </div>
        </div>
        <div style="padding-left:10px;">${dayRows.map(entry => renderOwnerSalaryEntryRow(entry, { showEdit: true })).join('')}</div>
      </div>`;
    }).join('');

    container.innerHTML = `
      <div style="font-size:13px;color:var(--text3);margin-bottom:12px;">
        Итого за месяц: <span style="font-weight:800;color:${total >= 0 ? 'var(--accent)' : '#ef4444'};font-size:15px;">${total.toLocaleString('ru')} ₴</span>
      </div>
      ${daysHtml || '<div style="color:var(--text3);padding:16px 0;">Нет записей</div>'}
    `;
  }

  initIcons();
}

function salaryNavPush(state) {
  salaryNavStack.push(state);
  renderSalaryScreen();
}

function salaryNavBack() {
  salaryNavStack.pop();
  renderSalaryScreen();
}

function fillManualSalaryForm(entry) {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
  };
  set('manual-salary-worker', entry?.worker_name || '');
  set('manual-salary-date', entry?.date || getLocalDateString());
  set('manual-salary-order', entry?.order_id || '');
  set('manual-salary-amount', entry?.amount ?? '');
  set('manual-salary-comment', entry?.comment || '');
  const saveBtn = document.getElementById('manual-salary-save-btn');
  const cancelBtn = document.getElementById('manual-salary-cancel-btn');
  if (saveBtn) saveBtn.textContent = editingManualSalaryId ? 'Сохранить запись' : 'Добавить запись';
  if (cancelBtn) cancelBtn.style.display = editingManualSalaryId ? '' : 'none';
}

function startEditManualSalary(id) {
  const entry = getOwnerManualSalaryEntries().find(row => row.id === id);
  if (!entry) return;
  editingManualSalaryId = id;
  fillManualSalaryForm(entry);
  document.getElementById('manual-salary-worker')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEditManualSalary() {
  editingManualSalaryId = '';
  fillManualSalaryForm(null);
}

async function saveOwnerManualSalary() {
  if (currentRole !== 'owner') return;
  const workerName = document.getElementById('manual-salary-worker')?.value || '';
  const date = document.getElementById('manual-salary-date')?.value || getLocalDateString();
  const orderId = document.getElementById('manual-salary-order')?.value || '';
  const amount = Number(document.getElementById('manual-salary-amount')?.value);
  const comment = (document.getElementById('manual-salary-comment')?.value || '').trim();

  if (!workerName) return showToast('Выберите сотрудника', 'error');
  if (!orderId) return showToast('Выберите заказ', 'error');
  if (!Number.isFinite(amount) || amount === 0) return showToast('Введите сумму, можно с минусом', 'error');
  if (!comment) return showToast('Комментарий обязателен', 'error');

  const saveBtn = document.getElementById('manual-salary-save-btn');
  if (saveBtn) saveBtn.disabled = true;

  const payload = {
    worker_name: workerName,
    date,
    amount,
    order_id: orderId,
    entry_type: 'manual',
    comment,
    created_by: currentWorkerName || 'owner',
  };

  try {
    const saved = editingManualSalaryId
      ? await sbUpdateWorkerSalary(editingManualSalaryId, payload)
      : await sbInsertWorkerSalary(payload);
    if (editingManualSalaryId) {
      const idx = allSalaries.findIndex(row => row.id === editingManualSalaryId);
      if (idx !== -1) allSalaries[idx] = { ...allSalaries[idx], ...saved };
    } else if (saved) {
      allSalaries.unshift(saved);
    }
    editingManualSalaryId = '';
    rerenderOwnerSalaryViews();
    renderHome();
    showToast('Ручная запись ЗП сохранена ✓');
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function editPendingSalaryEntry(id) {
  if (currentRole !== 'owner') return;
  const entry = (allSalaries || []).find(row => row.id === id);
  if (!entry) return showToast('Запись ЗП не найдена', 'error');
  if (isSalaryEntryClosedByWithdrawal(entry)) {
    showToast('Эта зарплата уже снята, редактировать нельзя', 'error');
    return;
  }

  const currentAmount = Number(entry.amount) || 0;
  const amountRaw = prompt('Новая сумма ЗП', String(currentAmount));
  if (amountRaw === null) return;
  const amount = Number(String(amountRaw).replace(',', '.'));
  if (!Number.isFinite(amount) || amount === 0) {
    showToast('Введите сумму, можно с минусом', 'error');
    return;
  }

  const comment = prompt('Комментарий к изменению', entry.comment || 'Отредактировано владельцем');
  if (comment === null) return;
  const cleanComment = String(comment || '').trim();
  if (!cleanComment) {
    showToast('Комментарий обязателен', 'error');
    return;
  }

  try {
    const updated = await sbUpdateWorkerSalary(id, {
      amount,
      comment: cleanComment,
    });
    const idx = allSalaries.findIndex(row => row.id === id);
    if (idx !== -1) allSalaries[idx] = { ...allSalaries[idx], ...updated };
    rerenderOwnerSalaryViews();
    renderHome();
    showToast('Начисление обновлено ✓');
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}

function startEditSalary(id, currentAmount) {
  document.getElementById('sal-display-' + id).style.display = 'none';
  document.getElementById('sal-edit-btn-' + id).style.display = 'none';
  document.getElementById('sal-input-' + id).style.display = '';
  document.getElementById('sal-save-btn-' + id).style.display = '';
  const input = document.getElementById('sal-input-' + id);
  input.focus();
  input.select();
}

async function saveEditSalary(id, ym) {
  const input = document.getElementById('sal-input-' + id);
  const amount = Number(input.value);
  if (isNaN(amount) || amount < 0) { showToast('Введите корректную сумму', 'error'); return; }

  const saveBtn = document.getElementById('sal-save-btn-' + id);
  if (saveBtn) saveBtn.disabled = true;

  try {
    const updated = await sbUpdateWorkerSalary(id, amount);
    const idx = allSalaries.findIndex(s => s.id === id);
    if (idx !== -1) allSalaries[idx].amount = amount;

    // Обновляем отображение без перерисовки всего экрана
    document.getElementById('sal-display-' + id).textContent = amount.toLocaleString('ru') + ' ₴';
    document.getElementById('sal-display-' + id).style.display = '';
    document.getElementById('sal-edit-btn-' + id).style.display = '';
    input.style.display = 'none';
    if (saveBtn) { saveBtn.disabled = false; saveBtn.style.display = 'none'; }
    showToast('Сохранено ✓');
  } catch(e) {
    showToast('Ошибка: ' + e.message, 'error');
    if (saveBtn) saveBtn.disabled = false;
  }
}

function toggleFinMonth(ym) {
  const body = document.getElementById('fin-body-' + ym);
  const chevron = document.getElementById('chevron-' + ym);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
  initIcons();
}

function finSummaryItem(label, value, color) {
  return `
    <div class="fin-summary-item">
      <div class="fin-summary-label">${label}</div>
      <div class="fin-summary-value" style="color:${color};">${value.toLocaleString('ru')} ₴</div>
    </div>
  `;
}

function finMetric(label, value, color) {
  return `
    <div class="fin-metric">
      <div class="fin-metric-label">${label}</div>
      <div class="fin-metric-value" style="color:${color};">${value.toLocaleString('ru')} ₴</div>
    </div>
  `;
}





// Зарплаты добавляются сотрудниками самостоятельно через экран профиля

async function deleteSalaryEntry(id, ym) {
  const entry = (allSalaries || []).find(s => s.id === id);
  if (!entry) {
    showToast('Запись ЗП не найдена', 'error');
    return;
  }
  if (isSalaryWithdrawalEntry(entry) || isSalaryEntryClosedByWithdrawal(entry)) {
    showToast('Архивную запись ЗП удалять нельзя', 'error');
    return;
  }
  if (!confirm('Удалить запись о зарплате?')) return;
  try {
    await sbDeleteWorkerSalary(id);
    allSalaries = allSalaries.filter(s => s.id !== id);
    // Обновляем компактный блок зарплат в карточке месяца
    const salEl = document.getElementById('fin-salaries-' + ym);
    if (salEl) { salEl.innerHTML = renderSalaryRowsCompact(ym); initIcons(); }
    // Если открыт детальный экран — перерисовываем его тоже
    rerenderOwnerSalaryViews();
    showToast('Удалено');
  } catch(e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}


// ============================================================
// BACKUP В SUPABASE
// ============================================================

function buildBackupPayload(freshProblems) {
  // Маппим все поля заказа точно как они хранятся в БД (через orderToRow)
  const orderRows = orders.map(o => ({
    id: o.id, date: o.date || null, time: o.time || null,
    responsible: o.responsible || null, client: o.client || null,
    phone: o.phone || null, car: o.car || null, code: o.code || null,
    notes: o.notes || null,
    mount: Number(o.mount) || 0, service_type: o.serviceType || null,
    molding: Number(o.molding) || 0, extra_work: Number(o.extraWork) || 0,
    tatu: Number(o.tatu) || 0, toning: Number(o.toning) || 0,
    delivery: Number(o.delivery) || 0, author: o.author || null,
    payment_status: o.paymentStatus || null, check_sum: Number(o.check) || 0,
    debt: Number(o.debt) || 0, debt_date: o.debtDate || null,
    total: Number(o.total) || 0, molding_author: o.moldingAuthor || null,
    partner: o.partner || null, supplier_status: o.supplierStatus || null,
    purchase: Number(o.purchase) || 0, income: Number(o.income) || 0,
    remainder: Number(o.remainder) || 0, payment_method: o.paymentMethod || null,
    drop_shipper: o.dropshipper || null, drop_shipper_payout: Number(o.dropshipperPayout) || 0,
    toning_external: !!o.toningExternal, margin_total: Number(o.marginTotal) || 0,
    payout_manager_glass: Number(o.payoutManagerGlass) || 0,
    payout_resp_glass: Number(o.payoutRespGlass) || 0,
    payout_lesha: Number(o.payoutLesha) || 0, payout_roma: Number(o.payoutRoma) || 0,
    payout_extra_resp: Number(o.payoutExtraResp) || 0,
    payout_extra_assist: Number(o.payoutExtraAssist) || 0,
    payout_molding_resp: Number(o.payoutMoldingResp) || 0,
    payout_molding_assist: Number(o.payoutMoldingAssist) || 0,
    status_done: !!o.statusDone, in_work: !!o.inWork,
    worker_done: !!o.workerDone, assistant: o.assistant || null,
    price_locked: !!o.priceLocked,
    // legacy поля — могут быть null если не использовались
    selection: o.selection || null,
    percent10: Number(o.percent10) || 0,
    percent20: Number(o.percent20) || 0,
    warehouse_delta: o.warehouseDelta || null,
  }));

  return {
    orders:               orderRows,
    workers:              workers.map(w => ({
                            id: w.id, name: w.name, role: w.role || null,
                            system_role: w.systemRole || null, note: w.note || null,
                            salary_formula: w.salaryFormula || null,
                          })),
    worker_salaries:      allSalaries.map(s => ({
                            id: s.id, worker_name: s.worker_name,
                            date: s.date, amount: Number(s.amount),
                            order_id: s.order_id || null,
                            entry_type: s.entry_type || null,
                            comment: s.comment || null,
                            created_by: s.created_by || null,
                          })),
    worker_problems:      (freshProblems || []).map(p => ({
                            id: p.id, worker_name: p.worker_name,
                            date: p.date, description: p.description || null,
                            created_at: p.created_at || null,
                          })),
    clients:              (typeof manualClients !== 'undefined' ? manualClients : []).map(c => ({
                            id: c.id || null, name: c.name || '', phone: c.phone || null,
                          })),
    ref_cars:             refCars             || [],
    ref_partners:         refPartners         || [],
    ref_payment_statuses: refPaymentStatuses  || [],
    ref_supplier_statuses:refSupplierStatuses || [],
    ref_warehouses:       refWarehouses       || [],
    ref_dropshippers:     refDropshippers     || [],
    ref_equipment:        refEquipment        || [],
    car_directory:        carDirectory        || [],
  };
}

async function backupToSupabase() {
  const btn = document.querySelector('[onclick="backupToSupabase()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader" style="width:14px;height:14px;"></i> Сохраняю...'; initIcons(); }

  try {
    // Загружаем worker_problems свежо — они могут быть не в памяти
    let freshProblems = [];
    try { freshProblems = await sbFetchAllProblems(); } catch(e) { /* не критично */ }

    const payload = buildBackupPayload(freshProblems);
    const tableCount = Object.keys(payload).length;
    const label   = `manual — ${orders.length} заказов · ${tableCount} таблиц · ${new Date().toLocaleString('ru')}`;

    const res = await fetch(`${WORKER_URL}/api/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken || '' },
      body: JSON.stringify({ label, payload }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }
    const data = await res.json();
    showToast(`Backup сохранён в Supabase (ID: ${data.id})`);
    // Обновляем историю если она открыта
    const body = document.getElementById('backup-history-body');
    if (body && body.style.display !== 'none') loadBackupHistory();
  } catch (e) {
    showToast('Ошибка backup: ' + e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="cloud-upload" style="width:14px;height:14px;"></i> Backup в Supabase';
      initIcons();
    }
  }
}

async function toggleBackupHistory() {
  const body    = document.getElementById('backup-history-body');
  const chevron = document.getElementById('backup-history-chevron');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  if (isOpen) {
    body.style.display = 'none';
    if (chevron) chevron.style.transform = '';
  } else {
    body.style.display = 'block';
    if (chevron) chevron.style.transform = 'rotate(180deg)';
    await loadBackupHistory();
  }
}

async function loadBackupHistory() {
  const body = document.getElementById('backup-history-body');
  if (!body) return;
  body.innerHTML = '<div style="padding:12px 14px;font-size:13px;color:var(--text3);">Загрузка...</div>';

  try {
    const res = await fetch(`${WORKER_URL}/api/backup`, {
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken || '' },
    });
    if (!res.ok) throw new Error(await res.text());
    const list = await res.json();

    if (!Array.isArray(list) || !list.length) {
      body.innerHTML = '<div style="padding:12px 14px;font-size:13px;color:var(--text3);">Бэкапов пока нет</div>';
      return;
    }

    body.innerHTML = `
      <div style="border:1px solid var(--border);border-top:none;border-radius:0 0 12px 12px;overflow:hidden;">
        ${list.map((b, i) => {
          const dt = new Date(b.created_at).toLocaleString('ru', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
          return `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:${i < list.length-1 ? '1px solid var(--border)' : 'none'};background:var(--surface);">
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(b.label || '—')}</div>
                <div style="font-size:11px;color:var(--text3);margin-top:2px;">${dt} · ID ${b.id}</div>
              </div>
              <button class="btn-secondary" style="padding:5px 10px;font-size:12px;display:flex;align-items:center;gap:5px;flex-shrink:0;" onclick="downloadBackup(${b.id})">
                <i data-lucide="download" style="width:12px;height:12px;"></i> JSON
              </button>
              <button class="icon-action-btn icon-action-danger" title="Удалить" onclick="deleteBackup(${b.id})" style="flex-shrink:0;">${icon('trash-2')}</button>
            </div>
          `;
        }).join('')}
      </div>
    `;
    initIcons();
  } catch (e) {
    body.innerHTML = `<div style="padding:12px 14px;font-size:13px;color:var(--red);">Ошибка: ${e.message}</div>`;
  }
}

async function downloadBackup(id) {
  try {
    showToast('Загружаю бэкап...');
    const res = await fetch(`${WORKER_URL}/api/backup/${id}`, {
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken || '' },
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const dt   = new Date(data.created_at).toISOString().slice(0, 10);
    a.href = url;
    a.download = `swiftglass_backup_${dt}_id${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    showToast('Ошибка скачивания: ' + e.message, 'error');
  }
}

async function deleteBackup(id) {
  if (!confirm('Удалить этот бэкап из базы?')) return;
  try {
    const res = await fetch(`${WORKER_URL}/api/backup/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken || '' },
    });
    if (!res.ok) throw new Error(await res.text());
    showToast('Бэкап удалён');
    loadBackupHistory();
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}

// ============================================================
// ЭКСПОРТ JSON (для Supabase) + CSV
// ============================================================

// ---------- JSON EXPORT ----------
async function exportAllJSON() {
  const date = new Date().toISOString().slice(0, 10);
  const btn  = document.querySelector('[onclick="exportAllJSON()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Подготовка...'; }

  try {
    const orderRows = orders.map(o => ({
      id: o.id, date: o.date || null, time: o.time || null,
      responsible: o.responsible || null, client: o.client || null,
      phone: o.phone || null, car: o.car || null, code: o.code || null,
      notes: o.notes || null,
      mount: Number(o.mount) || 0, service_type: o.serviceType || null,
      molding: Number(o.molding) || 0, extra_work: Number(o.extraWork) || 0,
      tatu: Number(o.tatu) || 0, toning: Number(o.toning) || 0,
      delivery: Number(o.delivery) || 0,
      author: o.author || null,
      payment_status: o.paymentStatus || null,
      check_sum: Number(o.check) || 0,
      debt: Number(o.debt) || 0, debt_date: o.debtDate || null,
      total: Number(o.total) || 0,
      molding_author: o.moldingAuthor || null,
      partner: o.partner || null,
      supplier_status: o.supplierStatus || null,
      purchase: Number(o.purchase) || 0,
      income: Number(o.income) || 0,
      remainder: Number(o.remainder) || 0,
      payment_method: o.paymentMethod || null,
      drop_shipper: o.dropshipper || null,
      drop_shipper_payout: Number(o.dropshipperPayout) || 0,
      toning_external: !!o.toningExternal,
      margin_total: Number(o.marginTotal) || 0,
      payout_manager_glass: Number(o.payoutManagerGlass) || 0,
      payout_resp_glass: Number(o.payoutRespGlass) || 0,
      payout_lesha: Number(o.payoutLesha) || 0,
      payout_roma: Number(o.payoutRoma) || 0,
      payout_extra_resp: Number(o.payoutExtraResp) || 0,
      payout_extra_assist: Number(o.payoutExtraAssist) || 0,
      payout_molding_resp: Number(o.payoutMoldingResp) || 0,
      payout_molding_assist: Number(o.payoutMoldingAssist) || 0,
      status_done: !!o.statusDone,
      in_work: !!o.inWork,
      worker_done: !!o.workerDone,
      assistant: o.assistant || null,
      price_locked: !!o.priceLocked,
    }));

    const workerRows = workers.map(w => ({
      id: w.id, name: w.name, role: w.role || null,
      system_role: w.systemRole || null, note: w.note || null,
      salary_formula: w.salaryFormula || null,
    }));

    const salaryRows = allSalaries.map(s => ({
      id: s.id, worker_name: s.worker_name,
      date: s.date, amount: Number(s.amount), order_id: s.order_id || null,
      entry_type: s.entry_type || null, comment: s.comment || null, created_by: s.created_by || null,
    }));

    const backup = {
      _meta: {
        exported_at: new Date().toISOString(),
        app: 'SwiftGlass CRM',
        version: '1.0',
        // Инструкция по импорту в Supabase:
        // 1. Откройте Supabase Dashboard → Table Editor
        // 2. Для каждой таблицы: Insert → Import data → JSON
        //    или используйте SQL: INSERT INTO tablename SELECT * FROM json_populate_recordset(...)
        // 3. Таблицы: orders, workers, clients, worker_salaries, ref_cars,
        //    ref_partners, car_directory и др.
      },
      tables: {
        orders:          { count: orderRows.length,   rows: orderRows  },
        workers:         { count: workerRows.length,  rows: workerRows },
        clients:         { count: (typeof manualClients !== 'undefined' ? manualClients.length : 0), rows: (typeof manualClients !== 'undefined' ? manualClients : []) },
        worker_salaries: { count: salaryRows.length,  rows: salaryRows },
        ref_cars:             { count: (refCars||[]).length,             rows: refCars||[]             },
        ref_partners:         { count: (refPartners||[]).length,         rows: refPartners||[]         },
        ref_payment_statuses: { count: (refPaymentStatuses||[]).length,  rows: refPaymentStatuses||[]  },
        ref_supplier_statuses:{ count: (refSupplierStatuses||[]).length, rows: refSupplierStatuses||[] },
        ref_warehouses:       { count: (refWarehouses||[]).length,       rows: refWarehouses||[]       },
        ref_dropshippers:     { count: (refDropshippers||[]).length,     rows: refDropshippers||[]     },
        car_directory:        { count: (carDirectory||[]).length,        rows: carDirectory||[]        },
      }
    };

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `swiftglass_backup_${date}.json`;
    a.click();
    URL.revokeObjectURL(url);

    const totalRows = orderRows.length + workerRows.length + salaryRows.length;
    showToast(`Backup готов — ${totalRows} записей в 1 файле`);
  } catch (e) {
    showToast('Ошибка экспорта: ' + e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="database" style="width:14px;height:14px;"></i> Backup JSON';
      initIcons();
    }
  }
}

function makeCsv(rows) {
  if (!rows.length) return '';
  const escape = v => {
    const s = String(v == null ? '' : v);
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  };
  const header = Object.keys(rows[0]).join(',');
  const body   = rows.map(r => Object.values(r).map(escape).join(','));
  return '\uFEFF' + [header, ...body].join('\n');
}

function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

async function exportAllCSV() {
  const date = new Date().toISOString().slice(0, 10);
  const btn  = document.querySelector('[onclick="exportAllCSV()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Загрузка...'; }

  try {
    // 1. orders — из памяти
    const orderRows = orders.map(o => ({
      id: o.id, date: o.date, time: o.time || '',
      responsible: o.responsible || '', client: o.client || '',
      phone: o.phone || '', car: o.car || '', code: o.code || '',
      notes: o.notes || '',
      mount: o.mount || 0, service_type: o.serviceType || '',
      molding: o.molding || 0, extra_work: o.extraWork || 0,
      tatu: o.tatu || 0, toning: o.toning || 0, delivery: o.delivery || 0,
      author: o.author || '',
      payment_status: o.paymentStatus || '', check_sum: o.check || 0,
      debt: o.debt || 0, debt_date: o.debtDate || '',
      total: o.total || 0,
      molding_author: o.moldingAuthor || '', partner: o.partner || '',
      supplier_status: o.supplierStatus || '', purchase: o.purchase || 0,
      income: o.income || 0, remainder: o.remainder || 0,
      payment_method: o.paymentMethod || '',
      drop_shipper: o.dropshipper || '',
      drop_shipper_payout: o.dropshipperPayout || 0,
      toning_external: o.toningExternal ? 'true' : 'false',
      margin_total: o.marginTotal || 0,
      payout_manager_glass: o.payoutManagerGlass || 0,
      payout_resp_glass: o.payoutRespGlass || 0,
      payout_lesha: o.payoutLesha || 0,
      payout_roma: o.payoutRoma || 0,
      payout_extra_resp: o.payoutExtraResp || 0,
      payout_extra_assist: o.payoutExtraAssist || 0,
      payout_molding_resp: o.payoutMoldingResp || 0,
      payout_molding_assist: o.payoutMoldingAssist || 0,
      status_done: o.statusDone ? 'true' : 'false',
      in_work: o.inWork ? 'true' : 'false',
      worker_done: o.workerDone ? 'true' : 'false',
      assistant: o.assistant || '',
    }));
    downloadCsv(`orders_${date}.csv`, makeCsv(orderRows));
    await new Promise(r => setTimeout(r, 400));

    // 2. workers — из памяти
    const workerRows = workers.map(w => ({
      id: w.id, name: w.name, role: w.role || '',
      system_role: w.systemRole || '', note: w.note || '',
      salary_formula: w.salaryFormula || '',
    }));
    downloadCsv(`workers_${date}.csv`, makeCsv(workerRows));
    await new Promise(r => setTimeout(r, 400));

    // 3. worker_salaries — из памяти (уже загружены)
    if (allSalaries.length) {
      const salRows = allSalaries.map(s => ({
        id: s.id, worker_name: s.worker_name,
        date: s.date, amount: s.amount, order_id: s.order_id || '',
        entry_type: s.entry_type || '', comment: s.comment || '', created_by: s.created_by || '',
      }));
      downloadCsv(`worker_salaries_${date}.csv`, makeCsv(salRows));
      await new Promise(r => setTimeout(r, 400));
    }

    // 4. ref таблицы — через Worker API
    const refFetches = [
      { name: 'ref_cars',             data: refCars },
      { name: 'ref_partners',         data: refPartners },
      { name: 'ref_payment_statuses', data: refPaymentStatuses },
      { name: 'ref_supplier_statuses',data: refSupplierStatuses },
      { name: 'ref_warehouses',       data: refWarehouses },
      { name: 'ref_dropshippers',     data: refDropshippers || [] },
      { name: 'car_directory',        data: carDirectory || [] },
    ];
    for (const { name, data } of refFetches) {
      if (data && data.length) {
        downloadCsv(`${name}_${date}.csv`, makeCsv(data));
        await new Promise(r => setTimeout(r, 200));
      }
    }

    showToast(`Экспорт завершён — ${orders.length} записей`);
  } catch (e) {
    showToast('Ошибка экспорта: ' + e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="download" style="width:14px;height:14px;"></i> Скачать';
      initIcons();
    }
  }
}

async function deleteDoneOrders() {
  const doneOrders = orders.filter(o => o.statusDone);
  if (!doneOrders.length) {
    showToast('Нет выполненных заказов', 'error');
    return;
  }

  const confirmed = confirm(
    `Удалить ${doneOrders.length} выполненных заказов?\n\nКлиенты останутся в базе. Это действие нельзя отменить.`
  );
  if (!confirmed) return;

  const btn = document.querySelector('[onclick="deleteDoneOrders()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Удаление...'; }

  try {
    await sbDeleteDoneOrders();
    orders = orders.filter(o => !o.statusDone);
    renderFinance();
    renderHome();
    showToast(`Удалено ${doneOrders.length} записей`);
  } catch (e) {
    showToast('Ошибка удаления: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="trash-2" style="width:14px;height:14px;"></i> Удалить выполненные'; initIcons(); }
  }
}

// ============================================================
// МОДАЛ РЕДАКТИРОВАНИЯ ФОРМУЛЫ ЗП (из экрана финансов)
// ============================================================

let _formulaModalWorkerId = null;

function openFormulaModal(workerId, workerName, currentFormula) {
  _formulaModalWorkerId = workerId;

  let modal = document.getElementById('formula-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'formula-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">📐 Формула зарплаты</div>
          <button class="modal-close" onclick="closeFormulaModal()">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
          <div id="formula-modal-name" style="font-weight:800;font-size:16px;"></div>
          <div class="form-group">
            <label class="form-label">Формула</label>
            <input class="form-input" id="formula-modal-input" type="text"
              style="font-family:monospace;font-size:14px;"
              placeholder="напр. mount * 0.20">
            <div style="font-size:11px;color:var(--text3);margin-top:6px;line-height:1.7;">
              <b>Старший специалист</b> — переменная: <code style="color:var(--accent);">mount</code> (сумма монтажа)<br>
              <code style="color:var(--accent);">mount * 0.20</code> — 20% от монтажа<br>
              <code style="color:var(--accent);">mount * 0.25</code> — 25% от монтажа<br>
              <b>Младший специалист</b> — фикс. ставка:<br>
              <code style="color:var(--accent);">500</code> — 500 ₴ за каждый заказ
            </div>
          </div>
          <div id="formula-modal-error" style="display:none;color:var(--red,#DC2626);font-size:12px;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeFormulaModal()">Отмена</button>
          <button class="btn-primary" id="formula-modal-save-btn" onclick="saveFormulaModal()">
            <i data-lucide="save" style="width:14px;height:14px;"></i> Сохранить
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById('formula-modal-name').textContent = workerName;
  document.getElementById('formula-modal-input').value = currentFormula || '';
  document.getElementById('formula-modal-error').style.display = 'none';
  modal.classList.add('active');
  initIcons();
  setTimeout(() => document.getElementById('formula-modal-input').focus(), 100);
}

function closeFormulaModal() {
  const modal = document.getElementById('formula-modal');
  if (modal) modal.classList.remove('active');
  _formulaModalWorkerId = null;
}

async function saveFormulaModal() {
  if (!_formulaModalWorkerId) return;
  const formula = document.getElementById('formula-modal-input').value.trim();
  const errEl   = document.getElementById('formula-modal-error');
  const btn     = document.getElementById('formula-modal-save-btn');

  // Валидация формулы
  if (formula) {
    const testResult = evalSalaryFormula(formula, 1000);
    if (testResult === null) {
      errEl.textContent = 'Невалидная формула. Используйте только числа и переменную mount.';
      errEl.style.display = 'block';
      return;
    }
  }

  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  errEl.style.display = 'none';

  try {
    await sbUpdateWorkerFormula(_formulaModalWorkerId, formula);
    // Обновляем локально
    const w = workers.find(x => x.id === _formulaModalWorkerId);
    if (w) w.salaryFormula = formula;
    closeFormulaModal();
    // Перерисовываем финансы чтобы обновились бейджи формул
    await renderFinance();
    showToast('Формула обновлена ✓');
  } catch (e) {
    errEl.textContent = 'Ошибка: ' + e.message;
    errEl.style.display = 'block';
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="save" style="width:14px;height:14px;"></i> Сохранить';
      initIcons();
    }
  }
}
