// ============================================================
// FINANCE.JS — экран финансов (только для owner)
// ============================================================

// Зарплаты из БД: массив { id, worker_name, date, amount }
let allSalaries = [];

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
  const reports = getManualSalaryReports(entries);
  const byWorker = {};

  for (const entry of reports) {
    const workerName = entry.worker_name;
    const manualAmount = Number(entry.amount) || 0;
    const autoAmount = calcDaySalary(workerName, entry.date);
    const summary = getWorkerCompletedOrdersSummary(workerName, entry.date);
    const deviationPct = getSalaryDeviationPct(manualAmount, autoAmount);

    if (!byWorker[workerName]) {
      byWorker[workerName] = {
        workerName,
        manualTotal: 0,
        autoTotal: 0,
        revenueTotal: 0,
        ordersCount: 0,
        reportDays: 0,
        overclaimTotal: 0,
        anomalyDays: 0,
        maxDeviationPct: 0,
      };
    }

    byWorker[workerName].manualTotal += manualAmount;
    byWorker[workerName].autoTotal += autoAmount;
    byWorker[workerName].revenueTotal += summary.totalAmount;
    byWorker[workerName].ordersCount += summary.count;
    byWorker[workerName].reportDays += 1;
    byWorker[workerName].overclaimTotal += Math.max(0, manualAmount - autoAmount);
    byWorker[workerName].anomalyDays += deviationPct > 0.10 ? 1 : 0;
    byWorker[workerName].maxDeviationPct = Math.max(byWorker[workerName].maxDeviationPct, deviationPct);
  }

  const workersAnalytics = Object.values(byWorker);
  const sortDesc = (key) => [...workersAnalytics].sort((a, b) => (b[key] || 0) - (a[key] || 0)).slice(0, 5);

  return {
    workers: workersAnalytics,
    topOrders: sortDesc('ordersCount'),
    topManualSalary: sortDesc('manualTotal'),
    topAutoSalary: sortDesc('autoTotal'),
    topRevenue: sortDesc('revenueTotal'),
    topOverclaim: sortDesc('overclaimTotal'),
    topAvgPerOrder: [...workersAnalytics]
      .map(item => ({ ...item, avgPerOrder: item.ordersCount ? item.manualTotal / item.ordersCount : 0 }))
      .sort((a, b) => (b.avgPerOrder || 0) - (a.avgPerOrder || 0))
      .slice(0, 5),
  };
}

function getSalaryPeriodAnalytics(entries = allSalaries, mode = 'year') {
  const reports = getManualSalaryReports(entries);
  const map = {};

  for (const entry of reports) {
    const key = mode === 'year'
      ? entry.date.slice(0, 4)
      : entry.date.slice(0, 7);
    if (!map[key]) {
      map[key] = {
        key,
        manualTotal: 0,
        autoTotal: 0,
        overclaimTotal: 0,
        anomaliesCount: 0,
        reportsCount: 0,
      };
    }
    const manualAmount = Number(entry.amount) || 0;
    const autoAmount = calcDaySalary(entry.worker_name, entry.date);
    const deviationPct = getSalaryDeviationPct(manualAmount, autoAmount);

    map[key].manualTotal += manualAmount;
    map[key].autoTotal += autoAmount;
    map[key].overclaimTotal += Math.max(0, manualAmount - autoAmount);
    map[key].anomaliesCount += deviationPct > 0.10 ? 1 : 0;
    map[key].reportsCount += 1;
  }

  return Object.values(map).sort((a, b) => b.key.localeCompare(a.key));
}

function renderSalaryAnalyticsSection(entries = allSalaries) {
  const analytics = getSalaryAnalytics(entries);
  const anomalies = getSalaryAnomalies(entries);
  const byYear = getSalaryPeriodAnalytics(entries, 'year');
  const byMonth = getSalaryPeriodAnalytics(entries, 'month');
  const totalManual = analytics.workers.reduce((sum, item) => sum + item.manualTotal, 0);
  const totalAuto = analytics.workers.reduce((sum, item) => sum + item.autoTotal, 0);
  const totalOverclaim = analytics.workers.reduce((sum, item) => sum + item.overclaimTotal, 0);

  const summaryCards = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px;">
      <div style="padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface2);">
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px;">Заявлено ЗП</div>
        <div style="font-size:20px;font-weight:800;color:var(--yellow);">${totalManual.toLocaleString('ru')} ₴</div>
      </div>
      <div style="padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface2);">
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px;">Ориентир по формулам</div>
        <div style="font-size:20px;font-weight:800;color:var(--accent);">${totalAuto.toLocaleString('ru')} ₴</div>
      </div>
      <div style="padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface2);">
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px;">Потенциальная переплата</div>
        <div style="font-size:20px;font-weight:800;color:${totalOverclaim > 0 ? '#ef4444' : 'var(--accent)'};">${totalOverclaim.toLocaleString('ru')} ₴</div>
      </div>
      <div style="padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface2);">
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px;">Аномалии</div>
        <div style="font-size:20px;font-weight:800;color:${anomalies.length ? '#ef4444' : 'var(--accent)'};">${anomalies.length}</div>
      </div>
    </div>
  `;

  const renderRanking = (title, items, valueFn, subtitleFn = null, color = 'var(--text)') => `
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

  const renderPeriodCards = (title, items, formatter) => `
    <div style="margin-top:12px;">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:10px;letter-spacing:0.04em;">${title}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">
        ${items.length ? items.map(item => `
          <div style="padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface2);">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;">
              <div style="font-size:14px;font-weight:800;color:var(--text);">${formatter(item.key)}</div>
              <div style="font-size:12px;font-weight:700;color:${item.anomaliesCount ? '#ef4444' : 'var(--text3)'};">${item.anomaliesCount ? `Аномалий: ${item.anomaliesCount}` : 'Без аномалий'}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text3);">
              <div>Заявлено: <span style="font-weight:700;color:var(--yellow);">${item.manualTotal.toLocaleString('ru')} ₴</span></div>
              <div>Ориентир: <span style="font-weight:700;color:var(--accent);">${item.autoTotal.toLocaleString('ru')} ₴</span></div>
              <div>Переплата: <span style="font-weight:700;color:${item.overclaimTotal > 0 ? '#ef4444' : 'var(--text3)'};">${item.overclaimTotal.toLocaleString('ru')} ₴</span></div>
              <div>Дней с ЗП: <span style="font-weight:700;color:var(--text2);">${item.reportsCount}</span></div>
            </div>
          </div>
        `).join('') : '<div style="font-size:13px;color:var(--text3);">Нет данных</div>'}
      </div>
    </div>
  `;

  const formatMonthKey = (key) => {
    const [year, month] = key.split('-');
    const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    return `${monthNames[Number(month) - 1] || key} ${year}`;
  };

  return `
    <div style="margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;color:var(--text3);margin-bottom:8px;letter-spacing:0.04em;">АНАЛИТИКА</div>
      ${summaryCards}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;">
        ${renderRanking('Больше всего заказов', analytics.topOrders, item => item.ordersCount, item => `Заявлено: ${item.manualTotal.toLocaleString('ru')} ₴`, 'var(--accent)')}
        ${renderRanking('Больше всего заявлено ЗП', analytics.topManualSalary, item => item.manualTotal.toLocaleString('ru') + ' ₴', item => `Заказов: ${item.ordersCount}`, 'var(--yellow)')}
        ${renderRanking('Больше всего по формулам', analytics.topAutoSalary, item => item.autoTotal.toLocaleString('ru') + ' ₴', item => `Заявлено: ${item.manualTotal.toLocaleString('ru')} ₴`, 'var(--accent)')}
        ${renderRanking('Самые крупные суммы заказов', analytics.topRevenue, item => item.revenueTotal.toLocaleString('ru') + ' ₴', item => `Заказов: ${item.ordersCount}`, 'var(--text)')}
        ${renderRanking('Риск переплаты', analytics.topOverclaim, item => item.overclaimTotal.toLocaleString('ru') + ' ₴', item => `Макс. отклонение: ${Math.round(item.maxDeviationPct * 100)}%`, '#ef4444')}
        ${renderRanking('ЗП за заказ', analytics.topAvgPerOrder, item => Math.round(item.avgPerOrder).toLocaleString('ru') + ' ₴', item => `Заказов: ${item.ordersCount}`, 'var(--yellow)')}
      </div>
      ${renderPeriodCards('По годам', byYear, key => key)}
      ${renderPeriodCards('По месяцам', byMonth, formatMonthKey)}
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

  // Группируем заказы по месяцам
  const map = {};
  for (const o of orders) {
    if (!o.date || o.isCancelled) continue;
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

  // Итоги по всем месяцам
  let grandTotal = 0, grandPurchase = 0, grandIncome = 0;
  for (const ym of keys) {
    for (const o of map[ym]) {
      grandTotal    += Number(o.total)    || 0;
      grandPurchase += Number(o.purchase) || 0;
      grandIncome   += Number(o.income)   || 0;
    }
  }
  const grandProfit     = grandIncome - grandPurchase;
  const grandSalaries   = calcTotalSalaries();

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
        ${finSummaryItem('Выручка', grandTotal, 'var(--text)')}
        ${finSummaryItem('Затраты', grandPurchase, 'var(--red)')}
        ${finSummaryItem('Приход', grandIncome, 'var(--accent)')}
        ${finSummaryItem('Прибыль', grandProfit, grandProfit >= 0 ? 'var(--accent)' : 'var(--red)')}
        ${finSummaryItem('Зарплаты', grandSalaries, 'var(--yellow)')}
        ${finSummaryItem('Прибыль за вычетом зарплат', grandProfit - grandSalaries, (grandProfit - grandSalaries) >= 0 ? 'var(--accent)' : 'var(--red)')}
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
  // ym — опционально, если не указан — все месяцы
  return getManualSalaryReports()
    .filter(s => !ym || s.date.startsWith(ym))
    .reduce((sum, s) => sum + Number(s.amount), 0);
}

function renderFinanceMonth(ym, monthOrders) {
  const [year, month] = ym.split('-');
  const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь',
    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const monthName = MONTH_NAMES[parseInt(month) - 1];

  let total = 0, purchase = 0, income = 0;
  for (const o of monthOrders) {
    total    += Number(o.total)    || 0;
    purchase += Number(o.purchase) || 0;
    income   += Number(o.income)   || 0;
  }
  const profit         = income - purchase;
  const monthSalaries  = calcTotalSalaries(ym);
  const profitAfterSal = profit - monthSalaries;

  return `
    <div class="fin-month-card">
      <div class="fin-month-header" onclick="toggleFinMonth('${ym}')">
        <div>
          <div class="fin-month-name">${monthName} ${year}</div>
          <div class="fin-month-sub">${monthOrders.length} записей</div>
        </div>
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="text-align:right;">
            <div style="font-size:11px;color:var(--text3);margin-bottom:2px;">Прибыль</div>
            <div style="font-size:18px;font-weight:800;color:${profit >= 0 ? 'var(--accent)' : 'var(--red)'};">${profit.toLocaleString('ru')} ₴</div>
          </div>
          <i data-lucide="chevron-down" style="width:16px;height:16px;color:var(--text3);transition:transform 0.2s;" id="chevron-${ym}"></i>
        </div>
      </div>

      <div class="fin-month-body" id="fin-body-${ym}" style="display:none;">

        <!-- Финансовые показатели -->
        <div class="fin-section-title">📊 Показатели</div>
        <div class="fin-metrics-grid">
          ${finMetric('Выручка', total, 'var(--text)')}
          ${finMetric('Затраты (закупка)', purchase, 'var(--red)')}
          ${finMetric('Приход', income, 'var(--blue)')}
          ${finMetric('Прибыль общая', profit, profit >= 0 ? 'var(--accent)' : 'var(--red)')}
          ${finMetric('Прибыль с учётом затрат', profit, profit >= 0 ? 'var(--accent)' : 'var(--red)')}
          ${finMetric('Зарплаты', monthSalaries, 'var(--yellow)')}
          ${finMetric('Прибыль за вычетом зарплат', profitAfterSal, profitAfterSal >= 0 ? 'var(--accent)' : 'var(--red)')}
        </div>

        <!-- Зарплаты сотрудников (из профилей) -->
        <div class="fin-section-title" style="margin-top:16px;display:flex;align-items:center;justify-content:space-between;">
          <span>💰 Зарплаты сотрудников</span>
          <button class="fin-add-salary-btn" onclick="openSalaryDetail()">
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
  const rows = getManualSalaryReports().filter(s => s.date.startsWith(ym));
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

// Стек навигации: 'workers' | { anomalies: true } | { worker: name } | { worker, year } | { worker, year, month }
let salaryNavStack = [];

function openSalaryDetail() {
  salaryNavStack = [];
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

  if (backBtn) backBtn.style.display = salaryNavStack.length > 0 ? 'flex' : 'none';

  if (!state) {
    // Уровень 1: все сотрудники
    title.textContent = 'Зарплаты сотрудников';
    const workerNames = [...new Set(manualReports.map(s => s.worker_name))].sort();
    const anomalies = getSalaryAnomalies(manualReports);
    if (!workerNames.length && !anomalies.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💰</div><h3>Данных нет</h3></div>`;
      return;
    }
    const anomaliesHtml = `
      <div class="sal-nav-row" onclick="salaryNavPush({anomalies:true})" style="
        margin-bottom:10px;
        padding:16px 18px;
        border:1px solid ${anomalies.length ? 'rgba(239,68,68,0.24)' : 'var(--border)'};
        background:${anomalies.length ? 'linear-gradient(180deg, rgba(239,68,68,0.10), rgba(239,68,68,0.04))' : 'var(--surface2)'};
        box-shadow:${anomalies.length ? 'inset 0 1px 0 rgba(255,255,255,0.03)' : 'none'};
      ">
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="worker-avatar" style="
            width:40px;
            height:40px;
            font-size:14px;
            border-radius:12px;
            background:${anomalies.length ? 'rgba(239,68,68,0.18)' : 'var(--surface3)'};
            color:${anomalies.length ? '#ff5f5f' : 'var(--text3)'};
            border:${anomalies.length ? '1px solid rgba(239,68,68,0.22)' : '1px solid var(--border)'};
          ">!</div>
          <div>
            <div style="font-weight:700;font-size:15px;">Аномалии</div>
            <div style="font-size:12px;color:${anomalies.length ? 'rgba(255,255,255,0.72)' : 'var(--text3)'};">${anomalies.length ? `${anomalies.length} несостыковок` : 'Несостыковок нет'}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="
            min-width:34px;
            height:34px;
            display:inline-flex;
            align-items:center;
            justify-content:center;
            padding:0 10px;
            border-radius:999px;
            background:${anomalies.length ? 'rgba(239,68,68,0.16)' : 'var(--surface3)'};
            color:${anomalies.length ? '#ff5f5f' : 'var(--accent)'};
            font-weight:800;
            font-size:15px;
          ">${anomalies.length}</span>
          <i data-lucide="chevron-right" style="width:16px;height:16px;color:${anomalies.length ? 'rgba(255,255,255,0.55)' : 'var(--text3)'};"></i>
        </div>
      </div>
    `;
    const analyticsHtml = renderSalaryAnalyticsSection(manualReports);
    const workersHtml = workerNames.map(name => {
      const rows = manualReports.filter(s => s.worker_name === name);
      const total = rows.reduce((sum, s) => sum + Number(s.amount), 0);
      const autoTotal = rows.reduce((sum, s) => sum + calcDaySalary(name, s.date), 0);
      const isOff = getSalaryDeviationPct(total, autoTotal) > 0.10;
      return `
        <div class="sal-nav-row" onclick="salaryNavPush({worker:'${financeEscapeAttr(name)}'})">
          <div style="display:flex;align-items:center;gap:12px;">
            <div class="worker-avatar" style="width:40px;height:40px;font-size:14px;border-radius:12px;">${getInitials(name)}</div>
            <div>
              <div style="font-weight:700;font-size:15px;">${name}</div>
              <div style="font-size:12px;color:var(--text3);">Ориентир: ${autoTotal.toLocaleString('ru')} ₴</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-weight:800;font-size:16px;color:${isOff ? '#ef4444' : 'var(--yellow)'};">${total.toLocaleString('ru')} ₴</span>
            <i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text3);"></i>
          </div>
        </div>
      `;
    }).join('');
    container.innerHTML = analyticsHtml + anomaliesHtml + workersHtml;

  } else if (state.anomalies) {
    title.textContent = 'Аномалии ЗП';
    const anomalies = getSalaryAnomalies(manualReports);
    if (!anomalies.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><h3>Аномалий нет</h3><p>Все внесённые ЗП укладываются в порог 10%</p></div>';
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

  } else if (state.worker && !state.year) {
    // Уровень 2: года сотрудника
    title.textContent = state.worker;
    const rows = manualReports.filter(s => s.worker_name === state.worker);
    const years = [...new Set(rows.map(s => s.date.slice(0, 4)))].sort((a, b) => b - a);
    container.innerHTML = years.map(year => {
      const yearRows = rows.filter(s => s.date.startsWith(year));
      const total = yearRows.reduce((sum, s) => sum + Number(s.amount), 0);
      const autoTotal = yearRows.reduce((sum, s) => sum + calcDaySalary(state.worker, s.date), 0);
      const isOff = getSalaryDeviationPct(total, autoTotal) > 0.10;
      return `
        <div class="sal-nav-row" onclick="salaryNavPush({worker:'${financeEscapeAttr(state.worker)}',year:'${year}'})">
          <div>
            <div style="font-weight:700;font-size:15px;">${year}</div>
            <div style="font-size:12px;color:var(--text3);">Ориентир: ${autoTotal.toLocaleString('ru')} ₴</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-weight:800;font-size:16px;color:${isOff ? '#ef4444' : 'var(--yellow)'};">${total.toLocaleString('ru')} ₴</span>
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
    const rows = manualReports.filter(s => s.worker_name === state.worker && s.date.startsWith(state.year));
    const months = [...new Set(rows.map(s => s.date.slice(5, 7)))].sort((a, b) => b - a);
    container.innerHTML = months.map(m => {
      const ym = `${state.year}-${m}`;
      const monthRows = rows.filter(s => s.date.startsWith(ym));
      const total = monthRows.reduce((sum, s) => sum + Number(s.amount), 0);
      const autoTotal = monthRows.reduce((sum, s) => sum + calcDaySalary(state.worker, s.date), 0);
      const isOff = getSalaryDeviationPct(total, autoTotal) > 0.10;
      return `
        <div class="sal-nav-row" onclick="salaryNavPush({worker:'${financeEscapeAttr(state.worker)}',year:'${state.year}',month:'${m}'})">
          <div>
            <div style="font-weight:700;font-size:15px;">${MONTH_NAMES[parseInt(m)-1]}</div>
            <div style="font-size:12px;color:var(--text3);">Ориентир: ${autoTotal.toLocaleString('ru')} ₴</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-weight:800;font-size:16px;color:${isOff ? '#ef4444' : 'var(--yellow)'};">${total.toLocaleString('ru')} ₴</span>
            <i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text3);"></i>
          </div>
        </div>
      `;
    }).join('') || '<div style="color:var(--text3);padding:16px 0;">Нет записей</div>';

  } else if (state.worker && state.year && state.month) {
    // Уровень 4: дни → заказы
    const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь',
      'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    const ym = `${state.year}-${state.month}`;
    title.textContent = `${MONTH_NAMES[parseInt(state.month)-1]} ${state.year}`;
    const rows = manualReports
      .filter(s => s.worker_name === state.worker && s.date.startsWith(ym))
      .sort((a, b) => b.date.localeCompare(a.date));
    const total = rows.reduce((sum, s) => sum + Number(s.amount), 0);
    const autoTotal = rows.reduce((sum, s) => sum + calcDaySalary(state.worker, s.date), 0);

    // Группируем по дням
    const byDay = {};
    for (const s of rows) {
      if (!byDay[s.date]) byDay[s.date] = [];
      byDay[s.date].push(s);
    }
    const sortedDays = Object.keys(byDay).sort((a, b) => b.localeCompare(a));

    const daysHtml = sortedDays.map(date => {
      const entry = byDay[date][0];
      const manualAmount = Number(entry.amount) || 0;
      const autoAmount = calcDaySalary(state.worker, date);
      const diffPct = getSalaryDeviationPct(manualAmount, autoAmount);
      const isOff = diffPct > 0.10;
      const summary = getWorkerCompletedOrdersSummary(state.worker, date);
      const ordersHtml = summary.orders.length
        ? '<div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;">'
          + summary.orders.map(order => `<div style="font-size:12px;color:var(--text3);">${escapeHtml(order.id)} · ${escapeHtml(order.car || '—')}</div>`).join('')
          + '</div>'
        : '<div style="font-size:12px;color:var(--text3);margin-top:10px;">Заказов нет</div>';
      return `<div style="padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
          <div>
            <div style="font-size:14px;font-weight:600;color:var(--text2);">${formatDate(date)}</div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:6px;font-size:12px;color:var(--text3);">
              <span>Выполнено: ${summary.count}</span>
              <span>Сумма заказов: ${summary.totalAmount.toLocaleString('ru')} ₴</span>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px;color:var(--text3);">Ориентир: <span style="font-weight:700;color:var(--accent);">${autoAmount.toLocaleString('ru')} ₴</span></div>
            <div style="font-size:14px;font-weight:800;color:${isOff ? '#ef4444' : 'var(--yellow)'};margin-top:4px;">Внесено: ${manualAmount.toLocaleString('ru')} ₴</div>
            ${autoAmount > 0 ? `<div style="font-size:11px;color:${isOff ? '#ef4444' : 'var(--text3)'};margin-top:2px;">Отклонение: ${Math.round(diffPct * 100)}%</div>` : ''}
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;">
          <button class="icon-btn" title="Удалить" onclick="deleteSalaryEntry('${entry.id}', '${ym}')"
            style="width:24px;height:24px;border-radius:6px;">
            <i data-lucide="trash-2" style="width:10px;height:10px;"></i>
          </button>
        </div>
        ${ordersHtml}
      </div>`;
    }).join('');

    container.innerHTML = `
      <div style="font-size:13px;color:var(--text3);margin-bottom:12px;">
        Ориентир за месяц: <span style="font-weight:800;color:var(--accent);font-size:15px;">${autoTotal.toLocaleString('ru')} ₴</span>
        <span style="margin-left:10px;">Внесено: <span style="font-weight:800;color:${getSalaryDeviationPct(total, autoTotal) > 0.10 ? '#ef4444' : 'var(--yellow)'};font-size:15px;">${total.toLocaleString('ru')} ₴</span></span>
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
  if (!confirm('Удалить запись о зарплате?')) return;
  try {
    await sbDeleteWorkerSalary(id);
    allSalaries = allSalaries.filter(s => s.id !== id);
    // Обновляем компактный блок зарплат в карточке месяца
    const salEl = document.getElementById('fin-salaries-' + ym);
    if (salEl) { salEl.innerHTML = renderSalaryRowsCompact(ym); initIcons(); }
    // Если открыт детальный экран — перерисовываем его тоже
    renderSalaryScreen();
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
                          })),
    worker_problems:      (freshProblems || []).map(p => ({
                            id: p.id, worker_name: p.worker_name,
                            date: p.date, description: p.description || null,
                            created_at: p.created_at || null,
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
              <button class="icon-action-btn icon-action-danger" title="Удалить" onclick="deleteBackup(${b.id})" style="flex-shrink:0;">🗑️</button>
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
        // 3. Таблицы: orders, workers, worker_salaries, ref_cars,
        //    ref_partners, car_directory и др.
      },
      tables: {
        orders:          { count: orderRows.length,   rows: orderRows  },
        workers:         { count: workerRows.length,  rows: workerRows },
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
