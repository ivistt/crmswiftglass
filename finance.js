// ============================================================
// FINANCE.JS — экран финансов (только для owner)
// ============================================================

// Зарплаты из БД: массив { id, worker_name, date, amount }
let allSalaries = [];
let allProblems = [];

async function loadAllSalaries() {
  try {
    allSalaries = await sbFetchAllSalaries();
  } catch (e) {
    showToast('Ошибка загрузки зарплат: ' + e.message, 'error');
  }
}

async function loadAllProblems() {
  try {
    allProblems = await sbFetchAllProblems();
  } catch (e) {
    showToast('Ошибка загрузки проблем: ' + e.message, 'error');
  }
}

// Строим salaryData из allSalaries для совместимости с renderFinanceMonth
function buildSalaryData() {
  const map = {};
  for (const s of allSalaries) {
    const ym = s.date.slice(0, 7);
    if (!map[ym]) map[ym] = {};
    // Суммируем если несколько записей за разные дни одного месяца
    map[ym][s.worker_name] = (map[ym][s.worker_name] || 0) + Number(s.amount);
  }
  return map;
}

async function renderFinance() {
  await Promise.all([loadAllSalaries(), loadAllProblems()]);
  const container = document.getElementById('finance-content');

  // Группируем заказы по месяцам
  const map = {};
  for (const o of orders) {
    if (!o.date) continue;
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
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
      <button class="btn-secondary" style="display:flex;align-items:center;gap:6px;" onclick="exportAllCSV()">
        <i data-lucide="download" style="width:14px;height:14px;"></i> Скачать все таблицы
      </button>
      <button class="btn-danger" style="display:flex;align-items:center;gap:6px;" onclick="deleteDoneOrders()">
        <i data-lucide="trash-2" style="width:14px;height:14px;"></i> Удалить выполненные
      </button>
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
  return allSalaries
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

        <!-- Проблемы сотрудников -->
        <div class="fin-section-title" style="margin-top:16px;display:flex;align-items:center;justify-content:space-between;">
          <span>⚠️ Проблемы сотрудников</span>
          <button class="fin-add-salary-btn" onclick="openAddProblemModal('${ym}')">
            <i data-lucide="plus" style="width:12px;height:12px;"></i> Добавить
          </button>
        </div>
        <div id="fin-problems-${ym}">
          ${renderProblemRowsCompact(ym)}
        </div>

      </div>
    </div>
  `;
}

// Компактный вид зарплат внутри месяца финансов
function renderSalaryRowsCompact(ym) {
  const rows = allSalaries.filter(s => s.date.startsWith(ym));
  if (!rows.length) {
    return `<div style="font-size:13px;color:var(--text3);padding:8px 0;">Зарплаты не внесены</div>`;
  }
  const byWorker = {};
  for (const s of rows) {
    if (!byWorker[s.worker_name]) byWorker[s.worker_name] = 0;
    byWorker[s.worker_name] += Number(s.amount);
  }
  return Object.entries(byWorker).map(([name, total]) => `
    <div class="fin-salary-row">
      <div class="fin-salary-worker">
        <div class="worker-avatar" style="width:28px;height:28px;font-size:11px;border-radius:8px;">${getInitials(name)}</div>
        <span style="font-size:13px;">${name}</span>
      </div>
      <span style="font-weight:700;color:var(--yellow);font-size:14px;">${total.toLocaleString('ru')} ₴</span>
    </div>
  `).join('');
}

// ============================================================
// ДЕТАЛЬНЫЙ ЭКРАН ЗАРПЛАТ
// ============================================================

// Стек навигации: 'workers' | { worker: name } | { worker, year } | { worker, year, month }
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

  if (backBtn) backBtn.style.display = salaryNavStack.length > 0 ? 'flex' : 'none';

  if (!state) {
    // Уровень 1: все сотрудники
    title.textContent = 'Зарплаты сотрудников';
    const workerNames = [...new Set(allSalaries.map(s => s.worker_name))].sort();
    if (!workerNames.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💰</div><h3>Данных нет</h3></div>`;
      return;
    }
    container.innerHTML = workerNames.map(name => {
      const total = allSalaries.filter(s => s.worker_name === name).reduce((sum, s) => sum + Number(s.amount), 0);
      return `
        <div class="sal-nav-row" onclick="salaryNavPush({worker:'${name}'})">
          <div style="display:flex;align-items:center;gap:12px;">
            <div class="worker-avatar" style="width:40px;height:40px;font-size:14px;border-radius:12px;">${getInitials(name)}</div>
            <div>
              <div style="font-weight:700;font-size:15px;">${name}</div>
              <div style="font-size:12px;color:var(--text3);">За всё время</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-weight:800;font-size:16px;color:var(--yellow);">${total.toLocaleString('ru')} ₴</span>
            <i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text3);"></i>
          </div>
        </div>
      `;
    }).join('');

  } else if (state.worker && !state.year) {
    // Уровень 2: года сотрудника
    title.textContent = state.worker;
    const rows = allSalaries.filter(s => s.worker_name === state.worker);
    const years = [...new Set(rows.map(s => s.date.slice(0, 4)))].sort((a, b) => b - a);
    container.innerHTML = years.map(year => {
      const total = rows.filter(s => s.date.startsWith(year)).reduce((sum, s) => sum + Number(s.amount), 0);
      return `
        <div class="sal-nav-row" onclick="salaryNavPush({worker:'${state.worker}',year:'${year}'})">
          <div style="font-weight:700;font-size:15px;">${year}</div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-weight:800;font-size:16px;color:var(--yellow);">${total.toLocaleString('ru')} ₴</span>
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
    const rows = allSalaries.filter(s => s.worker_name === state.worker && s.date.startsWith(state.year));
    const months = [...new Set(rows.map(s => s.date.slice(5, 7)))].sort((a, b) => b - a);
    container.innerHTML = months.map(m => {
      const ym = `${state.year}-${m}`;
      const total = rows.filter(s => s.date.startsWith(ym)).reduce((sum, s) => sum + Number(s.amount), 0);
      return `
        <div class="sal-nav-row" onclick="salaryNavPush({worker:'${state.worker}',year:'${state.year}',month:'${m}'})">
          <div style="font-weight:700;font-size:15px;">${MONTH_NAMES[parseInt(m)-1]}</div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-weight:800;font-size:16px;color:var(--yellow);">${total.toLocaleString('ru')} ₴</span>
            <i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text3);"></i>
          </div>
        </div>
      `;
    }).join('') || '<div style="color:var(--text3);padding:16px 0;">Нет записей</div>';

  } else if (state.worker && state.year && state.month) {
    // Уровень 4: дни с редактированием
    const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь',
      'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    const ym = `${state.year}-${state.month}`;
    title.textContent = `${MONTH_NAMES[parseInt(state.month)-1]} ${state.year}`;
    const rows = allSalaries
      .filter(s => s.worker_name === state.worker && s.date.startsWith(ym))
      .sort((a, b) => b.date.localeCompare(a.date));
    const total = rows.reduce((sum, s) => sum + Number(s.amount), 0);

    container.innerHTML = `
      <div style="font-size:13px;color:var(--text3);margin-bottom:12px;">
        Итого за месяц: <span style="font-weight:800;color:var(--yellow);font-size:15px;">${total.toLocaleString('ru')} ₴</span>
      </div>
      ${rows.map(s => `
        <div class="sal-day-row" id="sal-row-${s.id}">
          <div style="font-size:14px;color:var(--text2);font-weight:600;">${formatDate(s.date)}</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="sal-amount-display" id="sal-display-${s.id}" style="font-weight:700;color:var(--yellow);font-size:15px;">${Number(s.amount).toLocaleString('ru')} ₴</div>
            <input class="form-input sal-amount-input" id="sal-input-${s.id}"
              type="number" value="${s.amount}"
              style="display:none;width:90px;height:32px;font-size:14px;padding:4px 8px;">
            <button class="icon-btn" title="Редактировать" id="sal-edit-btn-${s.id}"
              onclick="startEditSalary('${s.id}', ${s.amount})"
              style="width:28px;height:28px;border-radius:8px;">
              <i data-lucide="pencil" style="width:12px;height:12px;"></i>
            </button>
            <button class="icon-btn" title="Сохранить" id="sal-save-btn-${s.id}"
              onclick="saveEditSalary('${s.id}', '${ym}')"
              style="display:none;width:28px;height:28px;border-radius:8px;background:var(--accent);color:#000;">
              <i data-lucide="check" style="width:12px;height:12px;"></i>
            </button>
            <button class="icon-btn" title="Удалить" id="sal-del-btn-${s.id}"
              onclick="deleteSalaryEntry('${s.id}', '${ym}')"
              style="width:28px;height:28px;border-radius:8px;">
              <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
            </button>
          </div>
        </div>
      `).join('') || '<div style="color:var(--text3);padding:16px 0;">Нет записей</div>'}
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

// Компактный вид проблем внутри месяца финансов
function renderProblemRowsCompact(ym) {
  const rows = allProblems.filter(p => p.date.startsWith(ym));
  if (!rows.length) {
    return `<div style="font-size:13px;color:var(--text3);padding:8px 0;">Проблем не зафиксировано</div>`;
  }
  return rows.map(p => `
    <div style="background:var(--surface2);border-radius:10px;padding:10px 12px;margin-bottom:6px;border-left:3px solid var(--red,#DC2626);display:flex;align-items:flex-start;gap:10px;">
      <div style="flex:1;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
          <div class="worker-avatar" style="width:22px;height:22px;font-size:9px;border-radius:6px;">${getInitials(p.worker_name)}</div>
          <span style="font-size:13px;font-weight:600;">${p.worker_name}</span>
          ${p.partner ? `<span style="font-size:11px;color:var(--text3);">+ ${p.partner}</span>` : ''}
        </div>
        <div style="font-size:12px;color:var(--text2);">${p.description}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;">
          ${formatDate(p.date)}${p.order_id ? ` · ${p.order_id}` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
        <div style="font-size:15px;font-weight:800;color:var(--red,#DC2626);white-space:nowrap;">${Number(p.amount).toLocaleString('ru')} ₴</div>
        <button class="icon-btn" title="Удалить" onclick="deleteProblemEntry('${p.id}', '${ym}')">
          <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
        </button>
      </div>
    </div>
  `).join('');
}

let _problemYm = null;

function openAddProblemModal(ym) {
  _problemYm = ym;
  const partnerOptions = workers
    .map(w => `<option value="${w.name}">${w.name}</option>`)
    .join('');

  const modal = document.createElement('div');
  modal.id = 'problem-modal';
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title">⚠️ Добавить проблему</div>
        <button class="modal-close" onclick="document.getElementById('problem-modal').remove()">✕</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
        <div class="form-group">
          <label class="form-label">Сотрудник</label>
          <select class="form-select" id="pm-worker">
            <option value="">— выбрать —</option>
            ${partnerOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Сумма (₴)</label>
          <input class="form-input" type="number" id="pm-amount" placeholder="0">
        </div>
        <div class="form-group">
          <label class="form-label">Описание</label>
          <input class="form-input" type="text" id="pm-desc" placeholder="Напр. разбитое стекло">
        </div>
        <div class="form-group">
          <label class="form-label">Заказ (необязательно)</label>
          <input class="form-input" type="text" id="pm-order" placeholder="SG-XXXX">
        </div>
        <div class="form-group">
          <label class="form-label">Напарник (необязательно)</label>
          <select class="form-select" id="pm-partner">
            <option value="">— нет —</option>
            ${partnerOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Дата</label>
          <input class="form-input" type="date" id="pm-date" value="${new Date().toISOString().slice(0,10)}">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('problem-modal').remove()">Отмена</button>
        <button class="btn-primary" id="pm-save-btn" style="background:var(--red,#DC2626);" onclick="saveNewProblem()">
          <i data-lucide="save" style="width:14px;height:14px;"></i> Сохранить
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  initIcons();
}

async function saveNewProblem() {
  const workerName = document.getElementById('pm-worker')?.value;
  const amount     = Number(document.getElementById('pm-amount')?.value);
  const desc       = document.getElementById('pm-desc')?.value.trim();
  const orderId    = document.getElementById('pm-order')?.value.trim();
  const partner    = document.getElementById('pm-partner')?.value;
  const date       = document.getElementById('pm-date')?.value;

  if (!workerName) { showToast('Выберите сотрудника', 'error'); return; }
  if (!amount || amount <= 0) { showToast('Введите сумму', 'error'); return; }
  if (!desc) { showToast('Введите описание', 'error'); return; }

  const btn = document.getElementById('pm-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    const saved = await sbInsertWorkerProblem({
      worker_name: workerName,
      date,
      amount,
      description: desc,
      partner: partner || null,
      order_id: orderId || null,
    });
    allProblems.unshift(saved);
    document.getElementById('problem-modal')?.remove();
    const el = document.getElementById('fin-problems-' + _problemYm);
    if (el) { el.innerHTML = renderProblemRowsCompact(_problemYm); initIcons(); }
    showToast('Проблема добавлена ✓');
  } catch(e) {
    showToast('Ошибка: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="save" style="width:14px;height:14px;"></i> Сохранить'; initIcons(); }
  }
}

async function deleteProblemEntry(id, ym) {
  if (!confirm('Удалить запись о проблеме?')) return;
  try {
    await sbDeleteWorkerProblem(id);
    allProblems = allProblems.filter(p => p.id !== id);
    const el = document.getElementById('fin-problems-' + ym);
    if (el) { el.innerHTML = renderProblemRowsCompact(ym); initIcons(); }
    showToast('Удалено');
  } catch(e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}

// Зарплаты добавляются сотрудниками самостоятельно через экран профиля

async function deleteSalaryEntry(id, ym) {
  if (!confirm('Удалить запись о зарплате?')) return;
  try {
    await sbDeleteWorkerSalary(id);
    allSalaries = allSalaries.filter(s => s.id !== id);
    const salEl = document.getElementById('fin-salaries-' + ym);
    if (salEl) { salEl.innerHTML = renderSalaryRows(ym); initIcons(); }
    showToast('Удалено');
  } catch(e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}

// ============================================================
// ЭКСПОРТ CSV + УДАЛЕНИЕ ВЫПОЛНЕННЫХ
// ============================================================

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
    // 1. orders — берём из памяти (уже загружены)
    const orderRows = orders.map(o => ({
      id: o.id, date: o.date, time: o.time || '',
      responsible: o.responsible || '', client: o.client || '',
      phone: o.phone || '', car: o.car || '', code: o.code || '',
      coding: o.coding || '', warehouse: o.warehouse || '',
      equipment: o.equipment || '', notes: o.notes || '',
      mount: o.mount || '', service_type: o.serviceType || '',
      glass: o.glass || '', molding: o.molding || '',
      extra_work: o.extraWork || '', tatu: o.tatu || '',
      toning: o.toning || '', delivery: o.delivery || 0,
      author: o.author || '', selection: o.selection || '',
      payment_status: o.paymentStatus || '', check_sum: o.check || 0,
      debt: o.debt || 0, total: o.total || 0,
      percent10: o.percent10 || 0, percent20: o.percent20 || 0,
      molding_author: o.moldingAuthor || '', partner: o.partner || '',
      supplier_status: o.supplierStatus || '', purchase: o.purchase || 0,
      income: o.income || 0, remainder: o.remainder || 0,
      payment_method: o.paymentMethod || '',
      warehouse_delta: o.warehouseDelta || '',
      status_done: o.statusDone ? 'true' : 'false',
      in_work: o.inWork ? 'true' : 'false',
    }));
    downloadCsv(`orders_${date}.csv`, makeCsv(orderRows));
    await new Promise(r => setTimeout(r, 400));

    // 2. workers — из памяти
    const workerRows = workers.map(w => ({
      id: w.id, name: w.name, role: w.role || '', note: w.note || '',
    }));
    downloadCsv(`workers_${date}.csv`, makeCsv(workerRows));
    await new Promise(r => setTimeout(r, 400));

    // 3. ref таблицы — запрашиваем свежие данные
    const refTables = [
      'ref_cars', 'ref_warehouses', 'ref_equipment',
      'ref_services', 'ref_payment_statuses',
      'ref_partners', 'ref_supplier_statuses',
    ];
    for (const table of refTables) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?limit=10000`,
        { headers: sbHeaders }
      );
      if (!res.ok) { showToast(`Ошибка загрузки ${table}`, 'error'); continue; }
      const rows = await res.json();
      if (rows.length) downloadCsv(`${table}_${date}.csv`, makeCsv(rows));
      await new Promise(r => setTimeout(r, 300));
    }

    showToast(`Экспорт завершён — ${orders.length} записей`);
  } catch (e) {
    showToast('Ошибка экспорта: ' + e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="download" style="width:14px;height:14px;"></i> Скачать все таблицы';
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
