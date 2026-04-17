// ============================================================
// PROFILE.JS — экраны ЗП и кассы специалиста
// ============================================================

let workerSalaries = [];
let workerProblems = [];
let workerCashLog  = [];  // записи кассы текущего специалиста
let assistantWorkerSalaries = [];
let cashSearchQuery = '';
let selectedAssistantSalaryName = '';
const FOP_CASH_WORKER_NAME = 'Oleg Starshiy';
const MANAGER_CARD_CASH_WORKER_NAME = 'Sasha Manager';

function canManageAssistantSalary() {
  return currentRole === 'senior' || currentRole === 'extra';
}

// ── ЗАГРУЗКА ─────────────────────────────────────────────────

async function loadWorkerSalaries() {
  if (currentRole === 'owner') return;
  try {
    workerSalaries = await sbFetchWorkerSalaries(currentWorkerName);
    assistantWorkerSalaries = [];
    const assistants = getSeniorWorkedAssistants();
    if (canManageAssistantSalary() && assistants.length) {
      if (!assistants.some(w => w.name === selectedAssistantSalaryName)) {
        selectedAssistantSalaryName = assistants[0].name;
      }
      if (selectedAssistantSalaryName) {
        assistantWorkerSalaries = await sbFetchWorkerSalaries(selectedAssistantSalaryName);
      }
    } else {
      selectedAssistantSalaryName = '';
    }
  } catch (e) {
    assistantWorkerSalaries = [];
    showToast('Ошибка загрузки зарплат: ' + e.message, 'error');
  }
}

async function loadWorkerCashLog() {
  if (currentRole !== 'senior' && currentWorkerName !== MANAGER_CARD_CASH_WORKER_NAME) return;
  try {
    workerCashLog = await sbFetchCashLog(currentWorkerName);
  } catch (e) {
    workerCashLog = [];
  }
}

// Текущий баланс кассы = сумма всех записей
function calcCashBalance(log) {
  return (log || []).reduce((s, e) => s + Number(e.amount), 0);
}

// ── ОТКРЫТИЕ ЭКРАНА ──────────────────────────────────────────

async function openProfileScreen() {
  await loadWorkerSalaries();
  if (currentWorkerName === MANAGER_CARD_CASH_WORKER_NAME) await loadWorkerCashLog();
  renderProfile();
  showScreen('profile');
  setActiveNav('profile');
}

async function openCashScreen() {
  await loadWorkerCashLog();
  renderCashScreen();
  showScreen('cash');
  setActiveNav('cash');
}

// ── РЕНДЕР ЗП ────────────────────────────────────────────────

function renderProfile() {
  const el = document.getElementById('profile-content');

  if (currentRole === 'manager') {
    const relevantSalaryEntries = workerSalaries.filter(isRelevantSalaryEntry);
    const accTotal = relevantSalaryEntries.reduce((sum, s) => sum + Number(s.amount), 0);
    const salaryHistoryHtml = buildWorkerSalaryHistory(currentWorkerName, relevantSalaryEntries);
    const managerCardHtml = currentWorkerName === MANAGER_CARD_CASH_WORKER_NAME
      ? renderManagerCardCashSection()
      : '';
    el.innerHTML = ''
      + '<div class="profile-header">'
      + '<div class="worker-avatar" style="width:56px;height:56px;font-size:20px;border-radius:16px;flex-shrink:0;">' + getInitials(currentWorkerName) + '</div>'
      + '<div><div style="font-size:20px;font-weight:800;">' + getWorkerDisplayName(currentWorkerName) + '</div>'
      + '<div style="font-size:13px;color:var(--text3);margin-top:2px;">' + (ROLE_LABELS[currentRole] || currentRole) + '</div></div>'
      + '</div>'
      + renderWorkAttendanceCard()
      + '<div class="profile-summary" style="margin-top:12px;">'
      + '<div class="profile-summary-card"><div class="profile-summary-label">Накоплено</div><div class="profile-summary-value">' + accTotal.toLocaleString('ru') + ' ₴</div></div>'
      + '<div class="profile-summary-card"><div class="profile-summary-label">Сегодня</div><div class="profile-summary-value">' + getTodayAttendanceAmount().toLocaleString('ru') + ' ₴</div></div>'
      + '</div>'
      + '<div class="profile-today-card" style="margin-top:12px;">'
      + '<div style="font-size:12px;font-weight:800;color:var(--text3);margin-bottom:12px;letter-spacing:0.04em;">ИСТОРИЯ ЗАРПЛАТ</div>'
      + '<div style="display:flex;flex-direction:column;gap:12px;">' + salaryHistoryHtml + '</div>'
      + '</div>'
      + managerCardHtml;
    initIcons();
    return;
  }

  const today = getLocalDateString();
  const selectedAssistant = getSelectedAssistantWorker();
  const workedAssistants = getSeniorWorkedAssistants();
  const relevantSalaryEntries = workerSalaries.filter(isRelevantSalaryEntry);
  const accTotal = getSalaryAccumulatedForWithdraw(currentWorkerName, workerSalaries);
  const todayAmount = getSalaryAccrualForDate(relevantSalaryEntries, today);
  const todaySummary = getWorkerCompletedOrdersSummary(currentWorkerName, today);
  const salaryHistoryHtml = buildWorkerSalaryHistory(currentWorkerName, relevantSalaryEntries);
  const assistantRelevantEntries = assistantWorkerSalaries.filter(isRelevantSalaryEntry);
  const assistantTodayAmount = selectedAssistant ? getSalaryAccrualForDate(assistantRelevantEntries, today) : 0;
  const assistantAccTotal = selectedAssistant ? getSalaryAccumulatedForWithdraw(selectedAssistant.name, assistantWorkerSalaries) : 0;
  const assistantTodaySummary = selectedAssistant
    ? getWorkerCompletedOrdersSummary(selectedAssistant.name, today)
    : null;
  const salaryGroupHtml = ''
    + renderWorkerSalarySection({
        title: 'Ваша зарплата',
        accumulated: accTotal,
        todayAmount,
        todaySummary,
        withdrawAction: 'withdrawSalary()',
        withdrawDisabled: accTotal <= 0,
        showWithdraw: currentRole !== 'junior',
        attendanceHtml: renderWorkAttendanceCard()
      })
    + '<div class="profile-today-card" style="margin-top:12px;">'
    + '<div style="font-size:12px;font-weight:800;color:var(--text3);margin-bottom:12px;letter-spacing:0.04em;">ИСТОРИЯ ЗАРПЛАТ</div>'
    + '<div style="display:flex;flex-direction:column;gap:12px;">' + salaryHistoryHtml + '</div>'
    + '</div>'
    + (canManageAssistantSalary() && workedAssistants.length
      ? renderAssistantSalarySection(workedAssistants, selectedAssistant, null, assistantTodaySummary, assistantTodayAmount, assistantAccTotal)
      : '');

  el.innerHTML = ''
    + '<div class="profile-header">'
    + '<div class="worker-avatar" style="width:56px;height:56px;font-size:20px;border-radius:16px;flex-shrink:0;">' + getInitials(currentWorkerName) + '</div>'
    + '<div><div style="font-size:20px;font-weight:800;">' + getWorkerDisplayName(currentWorkerName) + '</div>'
    + '<div style="font-size:13px;color:var(--text3);margin-top:2px;">' + (ROLE_LABELS[currentRole] || currentRole) + '</div></div>'
    + '</div>'
    + salaryGroupHtml;

  initIcons();
}

function renderCashScreen() {
  const el = document.getElementById('cash-content');
  if (!el) return;

  if (currentRole !== 'senior') {
    el.innerHTML = ''
      + '<div class="profile-header">'
      + '<div class="worker-avatar" style="width:56px;height:56px;font-size:20px;border-radius:16px;flex-shrink:0;">' + getInitials(currentWorkerName) + '</div>'
      + '<div><div style="font-size:20px;font-weight:800;">' + getWorkerDisplayName(currentWorkerName) + '</div>'
      + '<div style="font-size:13px;color:var(--text3);margin-top:2px;">Касса</div></div>'
      + '</div>'
      + '<div class="profile-today-card" style="margin-top:12px;">'
      + '<div style="font-size:14px;color:var(--text3);text-align:center;">Касса доступна только старшему специалисту</div>'
      + '</div>';
    initIcons();
    return;
  }

  const today = getLocalDateString();
  const regularCashLog = (workerCashLog || []).filter(entry => !isFopCashEntry(entry));
  const fopCashLog = (workerCashLog || []).filter(isFopCashEntry);
  const confirmedFopCashLog = fopCashLog.filter(entry => entry.fop_confirmed === true);
  const pendingFopCashLog = fopCashLog.filter(entry => entry.fop_confirmed !== true);
  const balance = calcCashBalance(regularCashLog);
  const fopBalance = calcCashBalance(confirmedFopCashLog);

  el.innerHTML = ''
    + '<div class="profile-header">'
    + '<div class="worker-avatar" style="width:56px;height:56px;font-size:20px;border-radius:16px;flex-shrink:0;">' + getInitials(currentWorkerName) + '</div>'
    + '<div><div style="font-size:20px;font-weight:800;">' + getWorkerDisplayName(currentWorkerName) + '</div>'
    + '<div style="font-size:13px;color:var(--text3);margin-top:2px;">Касса</div></div>'
    + '</div>'
    + renderCashSection(regularCashLog, balance, today, { title: 'Касса (наличка)', account: 'cash', buttonText: '+ Запись' })
    + (currentWorkerName === FOP_CASH_WORKER_NAME
      ? renderCashSection(confirmedFopCashLog, fopBalance, today, { title: 'Касса БАБЕНКО', account: 'fop', buttonText: '+ БАБЕНКО', pendingEntries: pendingFopCashLog })
      : '');

  initIcons();
}

function getSalaryAccrualForDate(entries, date) {
  return (entries || [])
    .filter(entry => entry.date === date && !isSalaryWithdrawalEntry(entry))
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
}

function getSalaryAccumulatedForWithdraw(workerName, entries) {
  const relevantEntries = (entries || []).filter(isRelevantSalaryEntry);
  let total = relevantEntries.reduce((sum, s) => sum + Number(s.amount), 0);
  if (typeof calcDailyBaseSalary !== 'function') return total;

  const dates = new Set((orders || [])
    .filter(order => order.workerDone && isOrderFinanciallyActive(order) && order.date)
    .map(order => order.date));

  dates.forEach(date => {
    const expectedBase = Number(calcDailyBaseSalary(workerName, date)) || 0;
    if (!expectedBase) return;
    const hasBaseEntry = relevantEntries.some(entry => entry.date === date && entry.order_id === 'Ставка за день');
    if (!hasBaseEntry) total += expectedBase;
  });

  return total;
}

function renderWorkerSalarySection({ title, accumulated, todayAmount, todaySummary, withdrawAction, withdrawDisabled, showWithdraw = true, attendanceHtml = '' }) {
  const safeSummary = todaySummary || { count: 0, orders: [] };
  return ''
    + '<div class="profile-today-card" style="margin-top:12px;">'
    + '<div class="profile-today-label"><i data-lucide="wallet-cards" style="width:15px;height:15px;"></i> ' + escapeHtml(title) + '</div>'
    + '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin-top:14px;">'
    + '<div style="padding:14px;background:var(--surface2);border-radius:12px;border:1px solid var(--border);">'
    + '<div style="font-size:11px;font-weight:800;color:var(--text3);letter-spacing:0.05em;">НАКОПЛЕНО</div>'
    + '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px;flex-wrap:wrap;">'
    + '<div style="font-size:28px;font-weight:900;color:var(--accent);">' + accumulated.toLocaleString('ru') + ' ₴</div>'
    + (showWithdraw ? '<button class="btn-primary" style="min-height:40px;padding:0 18px;border-radius:8px;font-weight:800;" onclick="' + withdrawAction + '" ' + (withdrawDisabled ? 'disabled' : '') + '>Снять</button>' : '')
    + '</div>'
    + '</div>'
    + '<div style="padding:14px;background:var(--surface2);border-radius:12px;border:1px solid var(--border);">'
    + '<div style="font-size:11px;font-weight:800;color:var(--text3);letter-spacing:0.05em;">ЗА СЕГОДНЯ</div>'
    + '<div style="font-size:28px;font-weight:900;color:var(--accent);margin-top:8px;">' + todayAmount.toLocaleString('ru') + ' ₴</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:6px;">Выполнено заказов: ' + safeSummary.count + '</div>'
    + '</div>'
    + '</div>'
    + (attendanceHtml ? '<div style="margin-top:12px;">' + attendanceHtml + '</div>' : '')
    + '<div style="margin-top:16px;">'
    + '<div style="font-size:12px;font-weight:800;color:var(--text3);letter-spacing:0.04em;margin-bottom:8px;">ЗАКАЗЫ ЗА СЕГОДНЯ</div>'
    + renderSalaryOrdersList(safeSummary.orders)
    + '</div>'
    + '</div>';
}

function getTodayAttendanceEntry() {
  const today = getLocalDateString();
  return (workerSalaries || []).find(entry => isWorkAttendanceEntry(entry) && entry.date === today) || null;
}

function getTodayAttendanceAmount() {
  return Number(getTodayAttendanceEntry()?.amount) || 0;
}

function renderWorkAttendanceCard() {
  if (typeof getSalaryRule !== 'function') return '';
  const rule = getSalaryRule(currentWorkerName);
  const amount = Number(rule.attendanceBase) || 0;
  if (!amount) return '';
  const entry = getTodayAttendanceEntry();
  return ''
    + '<div style="padding:14px;background:var(--surface2);border-radius:12px;border:1px solid var(--border);">'
    + '<div class="profile-today-label"><i data-lucide="calendar-check" style="width:15px;height:15px;"></i> Выход в работу</div>'
    + '<div style="font-size:12px;color:var(--text3);margin-top:6px;">Ставка за день: ' + amount.toLocaleString('ru') + ' ₴</div>'
    + '<button class="' + (entry ? 'btn-secondary' : 'btn-primary') + '" style="margin-top:12px;width:100%;min-height:44px;font-weight:800;" onclick="toggleWorkAttendance()">'
    + (entry ? 'Я сегодня в работе ✓' : 'Я в работе')
    + '</button>'
    + '</div>';
}

async function toggleWorkAttendance() {
  const rule = getSalaryRule(currentWorkerName);
  const amount = Number(rule.attendanceBase) || 0;
  if (!amount) {
    showToast('Для вас ставка выхода не настроена', 'error');
    return;
  }
  const today = getLocalDateString();
  const existing = getTodayAttendanceEntry();
  try {
    if (existing) {
      await sbDeleteWorkerSalary(existing.id);
      workerSalaries = workerSalaries.filter(entry => entry.id !== existing.id);
      showToast('Выход в работу отменён');
    } else {
      const created = await sbInsertWorkerSalary({
        worker_name: currentWorkerName,
        amount,
        date: today,
        order_id: WORK_ATTENDANCE_ORDER_ID,
      });
      if (created) workerSalaries.unshift(created);
      showToast('Выход в работу отмечен ✓');
    }
    renderProfile();
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}

function renderAssistantSalarySection(assistantWorkers, assistantWorker, todayReport, todaySummary, todayAmount, assistantAccTotal = 0) {
  const optionsHtml = assistantWorkers.map(worker =>
    `<option value="${escapeHtml(worker.name)}" ${assistantWorker?.name === worker.name ? 'selected' : ''}>${escapeHtml(getWorkerDisplayName(worker.name))}</option>`
  ).join('');
  const hasSelectedAssistant = !!assistantWorker?.name;
  const safeSummary = todaySummary || { count: 0, orders: [] };

  return ''
    + '<div class="profile-today-card" style="margin-top:12px;background:rgba(29,233,182,.06);border-color:rgba(29,233,182,.2);">'
    + '<div class="profile-today-label"><i data-lucide="users" style="width:15px;height:15px;"></i> Помощник</div>'
    + '<div style="margin-top:12px;margin-bottom:12px;">'
    + '<select class="form-select" id="assistant-salary-select" onchange="changeAssistantSalaryWorker(this.value)">' + optionsHtml + '</select>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;">'
    + '<div style="padding:14px;background:var(--surface2);border-radius:12px;border:1px solid var(--border);">'
    + '<div style="font-size:11px;font-weight:800;color:var(--text3);letter-spacing:0.05em;">НАКОПЛЕНО</div>'
    + '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px;flex-wrap:wrap;">'
    + '<div style="font-size:28px;font-weight:900;color:var(--accent);">' + assistantAccTotal.toLocaleString('ru') + ' ₴</div>'
    + '<button class="btn-primary" style="min-height:40px;padding:0 18px;border-radius:8px;font-weight:800;" onclick="withdrawAssistantSalary()" ' + (!hasSelectedAssistant || assistantAccTotal <= 0 ? 'disabled' : '') + '>Снять</button>'
    + '</div>'
    + '</div>'
    + '<div style="padding:14px;background:var(--surface2);border-radius:12px;border:1px solid var(--border);">'
    + '<div style="font-size:11px;font-weight:800;color:var(--text3);letter-spacing:0.05em;">ЗА СЕГОДНЯ</div>'
    + '<div style="font-size:28px;font-weight:900;color:var(--accent);margin-top:8px;">' + todayAmount.toLocaleString('ru') + ' ₴</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:6px;">Выполнено заказов: ' + safeSummary.count + '</div>'
    + '</div>'
    + '</div>'
    + '<div style="margin-top:16px;">'
    + '<div style="font-size:12px;font-weight:800;color:var(--text3);letter-spacing:0.04em;margin-bottom:8px;">ЗАКАЗЫ ЗА СЕГОДНЯ</div>'
    + renderSalaryOrdersList(safeSummary.orders)
    + '</div>'
    + '</div>';
}

function getSeniorWorkedAssistants() {
  if (!canManageAssistantSalary()) return [];
  const names = new Set();
  (orders || []).forEach(order => {
    if (!order || order.isCancelled) return;
    if (order.responsible === currentWorkerName && order.assistant) {
      names.add(order.assistant);
    }
    if (order.reworkData?.responsible === currentWorkerName && order.reworkData?.assistant) {
      names.add(order.reworkData.assistant);
    }
  });

  return [...names]
    .map(name => (workers || []).find(w => w.name === name) || { name })
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
}

function getSelectedAssistantWorker() {
  const assistants = getSeniorWorkedAssistants();
  if (!assistants.length) return null;
  if (!assistants.some(worker => worker.name === selectedAssistantSalaryName)) {
    selectedAssistantSalaryName = assistants[0].name;
  }
  return assistants.find(worker => worker.name === selectedAssistantSalaryName) || assistants[0] || null;
}

async function changeAssistantSalaryWorker(name) {
  selectedAssistantSalaryName = name || '';
  assistantWorkerSalaries = [];
  if (selectedAssistantSalaryName) {
    try {
      assistantWorkerSalaries = await sbFetchWorkerSalaries(selectedAssistantSalaryName);
    } catch (e) {
      showToast('Ошибка загрузки зарплат помощника: ' + e.message, 'error');
    }
  }
  renderProfile();
}

function renderSalaryOrdersList(orderItems) {
  if (!orderItems || !orderItems.length) {
    return '<div style="font-size:12px;color:var(--text3);margin-top:8px;">Заказов нет</div>';
  }
  return '<div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;">'
    + orderItems.map(item => '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;color:var(--text3);">'
      + '<span>' + escapeHtml(item.id) + ' · ' + escapeHtml(item.car || '—') + '</span>'
      + '<span style="font-weight:800;color:var(--accent);white-space:nowrap;">' + (Number(item.amount) || 0).toLocaleString('ru') + ' ₴</span>'
      + '</div>').join('')
    + '</div>';
}

function buildWorkerSalaryHistory(workerName, entries) {
  const reportEntries = (entries || []).filter(isRelevantSalaryEntry);
  const tree = {};

  for (const entry of reportEntries) {
    if (!entry.date) continue;
    const year = entry.date.slice(0, 4);
    const ym = entry.date.slice(0, 7);
    if (!tree[year]) tree[year] = {};
    if (!tree[year][ym]) tree[year][ym] = {};
    if (!tree[year][ym][entry.date]) tree[year][ym][entry.date] = [];
    tree[year][ym][entry.date].push(entry);
  }

  const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь',
    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const years = Object.keys(tree).sort((a, b) => b.localeCompare(a));

  if (!years.length) {
    return `<div class="empty-state"><div class="empty-state-icon">${icon('coins')}</div><h3>Записей нет</h3>`
      + '<p>Дневная зарплата появится здесь после сохранения</p></div>';
  }

  return years.map(year => {
    const months = Object.keys(tree[year]).sort((a, b) => b.localeCompare(a));
    const yearSum = months.reduce((sum, ym) => sum + Object.values(tree[year][ym]).flat().reduce((acc, e) => acc + Number(e.amount), 0), 0);
    const yearKey = 'sal-year-' + year;

    const monthsHtml = months.map(ym => {
      const parts = ym.split('-');
      const monthName = MONTH_NAMES[parseInt(parts[1]) - 1];
      const days = Object.keys(tree[year][ym]).sort((a, b) => b.localeCompare(a));
      const monthSum = days.reduce((sum, date) => sum + tree[year][ym][date].reduce((acc, e) => acc + Number(e.amount), 0), 0);
      const monthKey = 'sal-month-' + ym;

      const daysHtml = days.map(date => {
        const dateEntries = tree[year][ym][date];
        const withdrawals = dateEntries.filter(isSalaryWithdrawalEntry);
        const accruals = dateEntries.filter(entry => !isSalaryWithdrawalEntry(entry));
        const summary = getWorkerCompletedOrdersSummary(workerName, date);
        const orderIds = new Set((summary.orders || []).map(order => order.id));
        const otherAccruals = accruals.filter(entry => !orderIds.has(entry.order_id));
        const accrualAmount = accruals.reduce((sum, entry) => sum + Number(entry.amount), 0);
        const withdrawalsAmount = withdrawals.reduce((sum, entry) => sum + Number(entry.amount), 0);
        const totalForDay = accrualAmount + withdrawalsAmount;
        const dayKey = 'sal-day-' + date;
        const ordersHtml = renderSalaryOrdersList(summary.orders);
        const accrualsHtml = otherAccruals.length
          ? '<div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">'
            + otherAccruals.map(entry => '<div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--text2);">'
              + '<span>' + escapeHtml(entry.order_id === WORK_ATTENDANCE_ORDER_ID ? 'Выход в работу' : (entry.order_id === MANUAL_SALARY_REPORT_ORDER_ID ? 'Дневная ЗП' : `Заказ ${entry.order_id || '—'}`)) + '</span>'
              + '<span style="font-weight:800;color:var(--accent);white-space:nowrap;">' + Number(entry.amount).toLocaleString('ru') + ' ₴</span>'
              + '</div>').join('')
            + '</div>'
          : '';
        const withdrawalsHtml = withdrawals.length
          ? '<div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">'
            + withdrawals.map(entry => '<div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;color:#ef4444;">'
              + '<span>' + escapeHtml(getSalaryWithdrawalActor(entry) ? `снял ${getWorkerDisplayName(getSalaryWithdrawalActor(entry))}` : 'снятие ЗП') + '</span>'
              + '<span style="font-weight:800;white-space:nowrap;">' + Number(entry.amount).toLocaleString('ru') + ' ₴</span>'
              + '</div>').join('')
            + '</div>'
          : '';

        return '<div style="border-bottom:1px solid var(--border);">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;cursor:pointer;" onclick="toggleProfileMonth(\'' + dayKey + '\')">'
          + '<div style="display:flex;align-items:center;gap:8px;">'
          + '<i data-lucide="chevron-right" style="width:13px;height:13px;color:var(--text3);transition:transform 0.2s;" id="pchevron-' + dayKey + '"></i>'
          + '<div><div style="font-size:13px;color:var(--text2);font-weight:700;">' + formatDate(date) + '</div>'
          + '<div style="font-size:11px;color:var(--text3);">Заказов: ' + summary.count + ' · ЗП: ' + accrualAmount.toLocaleString('ru') + ' ₴</div></div>'
          + '</div>'
          + '<div style="font-size:13px;font-weight:800;color:' + (totalForDay >= 0 ? 'var(--accent)' : '#ef4444') + ';white-space:nowrap;">' + totalForDay.toLocaleString('ru') + ' ₴</div>'
          + '</div>'
          + '<div id="profile-month-body-' + dayKey + '" style="display:none;padding:0 12px 12px 34px;">'
          + accrualsHtml
          + ordersHtml
          + withdrawalsHtml
          + '</div>'
          + '</div>';
      }).join('');

      return '<div style="border-bottom:1px solid var(--border);">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;cursor:pointer;" onclick="toggleProfileMonth(\'' + monthKey + '\')">'
        + '<div style="display:flex;align-items:center;gap:8px;">'
        + '<i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text3);transition:transform 0.2s;" id="pchevron-' + monthKey + '"></i>'
        + '<div><div style="font-size:14px;font-weight:800;color:var(--text2);">' + monthName + '</div>'
        + '<div style="font-size:11px;color:var(--text3);">' + days.length + ' дней</div></div>'
        + '</div>'
        + '<div style="font-size:14px;font-weight:800;color:var(--accent);white-space:nowrap;">' + monthSum.toLocaleString('ru') + ' ₴</div>'
        + '</div>'
        + '<div id="profile-month-body-' + monthKey + '" style="display:none;padding-left:12px;background:var(--surface2);border-radius:0 0 8px 8px;">' + daysHtml + '</div>'
        + '</div>';
    }).join('');

    return '<div class="fin-month-card" style="margin-bottom:8px;">'
      + '<div class="fin-month-header" onclick="toggleProfileMonth(\'' + yearKey + '\')">'
      + '<div style="display:flex;align-items:center;gap:10px;">'
      + '<i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text3);transition:transform 0.2s;" id="pchevron-' + yearKey + '"></i>'
      + '<div><div class="fin-month-name">' + year + ' год</div>'
      + '<div class="fin-month-sub">' + months.length + ' мес.</div></div>'
      + '</div>'
      + '<div style="font-size:18px;font-weight:800;color:var(--accent);">' + yearSum.toLocaleString('ru') + ' ₴</div>'
      + '</div>'
      + '<div id="profile-month-body-' + yearKey + '" style="display:none;padding:0 0 8px;">' + monthsHtml + '</div>'
      + '</div>';
  }).join('');
}

// ── БЛОК СНЯТИЙ ЗП ──────────────────────────────────────────
// Показывает помощнику: кто, когда и на сколько снял его зарплату

function buildWithdrawalsBlock(entries) {
  const withdrawals = (entries || [])
    .filter(isSalaryWithdrawalEntry)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (!withdrawals.length) return '';

  const rowsHtml = withdrawals.map(entry => {
    const actor = getSalaryWithdrawalActor(entry);
    const actorLabel = actor ? getWorkerDisplayName(actor) : 'старший';
    const amount = Math.abs(Number(entry.amount));
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;">'
      + '<div style="display:flex;align-items:center;gap:10px;">'
      + '<div style="width:32px;height:32px;border-radius:10px;background:rgba(239,68,68,.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
      + '<i data-lucide="arrow-down-left" style="width:15px;height:15px;color:#ef4444;"></i>'
      + '</div>'
      + '<div>'
      + '<div style="font-size:13px;font-weight:600;color:var(--text);">' + escapeHtml(actorLabel) + '</div>'
      + '<div style="font-size:11px;color:var(--text3);margin-top:2px;">' + escapeHtml(formatDate(entry.date)) + '</div>'
      + '</div>'
      + '</div>'
      + '<div style="font-size:15px;font-weight:800;color:#ef4444;">−' + amount.toLocaleString('ru') + ' \u20B4</div>'
      + '</div>';
  }).join('');

  return '<div class="profile-today-card" style="margin-top:12px;">'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">'
    + '<i data-lucide="hand-coins" style="width:15px;height:15px;color:#ef4444;"></i>'
    + '<div style="font-size:12px;font-weight:800;color:#ef4444;letter-spacing:0.04em;">СНЯТИЯ ЗАРПЛАТЫ</div>'
    + '</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-bottom:10px;">Кто и когда снял вашу накопленную зарплату</div>'
    + '<div style="background:var(--surface2);border-radius:12px;padding:0 14px;">'
    + rowsHtml
    + '</div>'
    + '</div>';
}

// ── КАССА — РЕНДЕР СЕКЦИИ ────────────────────────────────────
// Разбита на: Текущая (сегодня) + Архив (года → месяцы → дни)

function isFopCashEntry(entry) {
  return String(entry?.cash_account || '').toLowerCase() === 'fop';
}

function isManagerCardCashEntry(entry) {
  return String(entry?.cash_account || '').toLowerCase() === 'card';
}

function isConfirmedFopCashEntry(entry) {
  return isFopCashEntry(entry) && entry?.fop_confirmed === true;
}

function renderManagerCardCashSection() {
  const today = getLocalDateString();
  const cardCashLog = (workerCashLog || []).filter(isManagerCardCashEntry);
  const confirmedCardCashLog = cardCashLog.filter(entry => entry.fop_confirmed === true);
  const pendingCardCashLog = cardCashLog.filter(entry => entry.fop_confirmed !== true);
  return renderCashSection(confirmedCardCashLog, calcCashBalance(confirmedCardCashLog), today, {
    title: 'Касса карты Саши',
    account: 'card',
    buttonText: '+ Карта',
    pendingEntries: pendingCardCashLog,
    pendingLabel: 'ОЖИДАЮТ ПОДТВЕРЖДЕНИЯ ПО КАРТЕ',
    confirmToast: 'Карта Саши подтверждена ✓',
    defaultPendingComment: 'КАРТА САША',
    hideAddButton: true,
  });
}

function renderCashSection(log, balance, today, options = {}) {
  const title = options.title || 'Касса (наличка)';
  const account = options.account || 'cash';
  const buttonText = options.buttonText || '+ Запись';
  const pendingEntries = options.pendingEntries || [];
  const balanceColor = balance >= 0 ? 'var(--accent)' : '#ef4444';
  const filteredLog = _filterCashLogByComment(log, cashSearchQuery);

  // Разделяем лог на сегодня и архив
  const todayLog   = filteredLog.filter(e => _cashEntryDate(e) === today);
  const archiveLog = filteredLog.filter(e => _cashEntryDate(e) !== today);

  // ── Текущая касса (сегодня) ──
  const todayBalance = todayLog.reduce((s, e) => s + Number(e.amount), 0);
  const todayColor   = todayBalance >= 0 ? 'var(--accent)' : '#ef4444';

  const todayRowsHtml = todayLog.length
    ? todayLog.map(e => _cashEntryRow(e)).join('')
    : '<div style="text-align:center;color:var(--text3);font-size:13px;padding:10px 0;">Сегодня записей нет</div>';

  // ── Архив (группировка: год → месяц → день) ──
  const archiveHtml = _buildCashArchive(archiveLog);

  return '<div class="profile-today-card" style="margin-top:12px;">'

    // Заголовок с балансом и кнопками
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">'
    + '<div>'
    + '<div class="profile-today-label"><i data-lucide="wallet" style="width:15px;height:15px;"></i> ' + escapeHtml(title) + '</div>'
    + '<div style="font-size:28px;font-weight:800;color:' + balanceColor + ';margin-top:4px;">' + balance.toLocaleString('ru') + ' \u20B4</div>'
    + '<div style="font-size:11px;color:var(--text3);">общий баланс</div>'
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">'
    + (options.hideAddButton ? '' : '<button class="btn-secondary" style="font-size:12px;padding:6px 10px;" onclick="openCashEntryModal(\'' + account + '\')">' + escapeHtml(buttonText) + '</button>')
    + '</div>'
    + '</div>'

    + '<div style="margin-bottom:14px;">'
    + '<input class="form-input" type="text" placeholder="Поиск по комментарию..." value="' + escapeHtml(cashSearchQuery) + '" oninput="setCashSearchQuery(this.value)">'
    + '</div>'

    + (pendingEntries.length ? renderFopPendingEntries(pendingEntries, options) : '')

    // ── ТЕКУЩАЯ КАССА (сегодня) ──
    + '<div style="margin-bottom:16px;">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
    + '<div style="font-size:12px;font-weight:700;color:var(--text3);letter-spacing:0.04em;">' + icon('calendar') + ' СЕГОДНЯ</div>'
    + '<div style="font-size:15px;font-weight:800;color:' + todayColor + ';">'
    + (todayBalance >= 0 ? '+' : '') + todayBalance.toLocaleString('ru') + ' \u20B4'
    + '</div>'
    + '</div>'
    + '<div style="background:var(--surface2);border-radius:10px;padding:0 12px;">'
    + todayRowsHtml
    + '</div>'
    + '</div>'

    // ── АРХИВ ──
    + '<div>'
    + '<div style="font-size:12px;font-weight:700;color:var(--text3);letter-spacing:0.04em;margin-bottom:8px;">🗂 АРХИВ</div>'
    + (archiveLog.length ? archiveHtml : '<div style="text-align:center;color:var(--text3);font-size:13px;padding:10px 0;">Ничего не найдено</div>')
    + '</div>'

    + '</div>';
}

function renderFopPendingEntries(entries, options = {}) {
  const total = (entries || []).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const totalColor = total >= 0 ? 'var(--accent)' : '#ef4444';
  const label = options.pendingLabel || 'ОЖИДАЮТ ПОДТВЕРЖДЕНИЯ';
  const defaultComment = options.defaultPendingComment || 'БАБЕНКО';
  const rows = (entries || []).map(entry => {
    const amount = Number(entry.amount) || 0;
    const sign = amount >= 0 ? '+' : '';
    const color = amount >= 0 ? 'var(--accent)' : '#ef4444';
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">'
      + '<div style="min-width:0;">'
      + '<div style="font-size:13px;color:var(--text2);font-weight:700;">' + escapeHtml(entry.comment || defaultComment) + '</div>'
      + '<div style="font-size:11px;color:var(--text3);margin-top:2px;">' + escapeHtml(entry.fop_date || _cashEntryDate(entry) || '') + '</div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">'
      + '<div style="font-size:15px;font-weight:900;color:' + color + ';white-space:nowrap;">' + sign + amount.toLocaleString('ru') + ' \u20B4</div>'
      + '<button class="btn-primary" style="min-height:34px;padding:0 12px;border-radius:8px;font-size:12px;font-weight:800;" onclick="confirmFopCashEntry(\'' + escapeJsString(entry.id) + '\')">Подтвердить</button>'
      + '</div>'
      + '</div>';
  }).join('');

  return '<div style="margin-bottom:16px;">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
    + '<div style="font-size:12px;font-weight:800;color:var(--text3);letter-spacing:0.04em;">' + escapeHtml(label) + '</div>'
    + '<div style="font-size:15px;font-weight:900;color:' + totalColor + ';">' + (total >= 0 ? '+' : '') + total.toLocaleString('ru') + ' \u20B4</div>'
    + '</div>'
    + '<div style="background:var(--surface2);border-radius:10px;padding:0 12px;">'
    + rows
    + '</div>'
    + '</div>';
}

function escapeJsString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function confirmFopCashEntry(id) {
  if (!id) return;
  try {
    const updated = await sbUpdateCashEntry(id, { fop_confirmed: true });
    workerCashLog = (workerCashLog || []).map(entry => entry.id === id ? { ...entry, ...updated, fop_confirmed: true } : entry);
    if (Array.isArray(window.allCashLog)) {
      window.allCashLog = window.allCashLog.map(entry => entry.id === id ? { ...entry, ...updated, fop_confirmed: true } : entry);
    }
    renderCashScreen();
    if (document.getElementById('screen-profile')?.classList.contains('active')) renderProfile();
    const account = String(updated?.cash_account || '').toLowerCase();
    showToast(account === 'card' ? 'Карта Саши подтверждена ✓' : 'БАБЕНКО подтверждено ✓');
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}

function setCashSearchQuery(value) {
  cashSearchQuery = value || '';
  renderCashScreen();
}

function _filterCashLogByComment(log, query) {
  const normalized = (query || '').trim().toLowerCase();
  if (!normalized) return log || [];
  const words = normalized.split(/\s+/).filter(Boolean);
  return (log || []).filter(e => {
    const comment = String(e.comment || '').toLowerCase();
    return words.every(word => comment.includes(word));
  });
}

// Возвращает дату записи кассы в формате YYYY-MM-DD
function _cashEntryDate(e) {
  if (!e.created_at) return '';
  return new Date(e.created_at).toISOString().slice(0, 10);
}

// Одна строка записи кассы
function _cashEntryRow(e) {
  const amt   = Number(e.amount);
  const sign  = amt >= 0 ? '+' : '';
  const color = amt >= 0 ? 'var(--accent)' : '#ef4444';
  const dt    = new Date(e.created_at);
  const time  = dt.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  return '<div style="display:flex;justify-content:space-between;align-items:center;'
    + 'padding:10px 0;border-bottom:1px solid var(--border);">'
    + '<div>'
    + '<div style="font-size:13px;color:var(--text2);">' + escapeHtml(e.comment || '—') + '</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:2px;">' + time + '</div>'
    + '</div>'
    + '<div style="font-size:15px;font-weight:800;color:' + color + ';white-space:nowrap;margin-left:12px;">'
    + sign + amt.toLocaleString('ru') + ' \u20B4</div>'
    + '</div>';
}

// Строит архив: год → месяц → день (все сворачиваемые)
function _buildCashArchive(log) {
  if (!log.length) return '';

  const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь',
    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

  // Структура: { year: { month: { day: [entries] } } }
  const tree = {};
  for (const e of log) {
    const d = _cashEntryDate(e);
    if (!d) continue;
    const year  = d.slice(0, 4);
    const month = d.slice(0, 7);
    const day   = d;
    if (!tree[year])          tree[year] = {};
    if (!tree[year][month])   tree[year][month] = {};
    if (!tree[year][month][day]) tree[year][month][day] = [];
    tree[year][month][day].push(e);
  }

  const years = Object.keys(tree).sort((a, b) => b.localeCompare(a));

  return years.map(year => {
    const yearSum = Object.values(tree[year])
      .flatMap(m => Object.values(m).flat())
      .reduce((s, e) => s + Number(e.amount), 0);
    const yearColor = yearSum >= 0 ? 'var(--accent)' : '#ef4444';
    const yearKey = 'cash-year-' + year;

    const monthsHtml = Object.keys(tree[year]).sort((a, b) => b.localeCompare(a)).map(ym => {
      const [y, m] = ym.split('-');
      const monthName = MONTH_NAMES[parseInt(m) - 1];
      const monthSum  = Object.values(tree[year][ym]).flat().reduce((s, e) => s + Number(e.amount), 0);
      const monthColor = monthSum >= 0 ? 'var(--accent)' : '#ef4444';
      const monthKey = 'cash-month-' + ym;

      const daysHtml = Object.keys(tree[year][ym]).sort((a, b) => b.localeCompare(a)).map(day => {
        const entries  = tree[year][ym][day];
        const daySum   = entries.reduce((s, e) => s + Number(e.amount), 0);
        const dayColor = daySum >= 0 ? 'var(--accent)' : '#ef4444';
        const dayKey   = 'cash-day-' + day;
        const [dy, dm, dd] = day.split('-');

        const rowsHtml = entries.map(e => _cashEntryRow(e)).join('');

        return '<div style="border-bottom:1px solid var(--border);">'
          // День — заголовок
          + '<div style="display:flex;justify-content:space-between;align-items:center;'
          + 'padding:8px 12px;cursor:pointer;" onclick="toggleProfileMonth(\'' + dayKey + '\')">'
          + '<div style="display:flex;align-items:center;gap:8px;">'
          + '<i data-lucide="chevron-right" style="width:13px;height:13px;color:var(--text3);'
          + 'transition:transform 0.2s;" id="pchevron-' + dayKey + '"></i>'
          + '<div style="font-size:13px;color:var(--text2);font-weight:600;">' + dd + '.' + dm + '.' + dy + '</div>'
          + '<div style="font-size:11px;color:var(--text3);">' + entries.length + ' зап.</div>'
          + '</div>'
          + '<div style="font-size:13px;font-weight:800;color:' + dayColor + ';">'
          + (daySum >= 0 ? '+' : '') + daySum.toLocaleString('ru') + ' \u20B4</div>'
          + '</div>'
          // День — тело
          + '<div id="profile-month-body-' + dayKey + '" style="display:none;padding:0 12px 4px 28px;">'
          + rowsHtml
          + '</div>'
          + '</div>';
      }).join('');

      return '<div style="border-bottom:1px solid var(--border);">'
        // Месяц — заголовок
        + '<div style="display:flex;justify-content:space-between;align-items:center;'
        + 'padding:10px 12px;cursor:pointer;" onclick="toggleProfileMonth(\'' + monthKey + '\')">'
        + '<div style="display:flex;align-items:center;gap:8px;">'
        + '<i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text3);'
        + 'transition:transform 0.2s;" id="pchevron-' + monthKey + '"></i>'
        + '<div style="font-size:14px;font-weight:700;color:var(--text2);">' + monthName + '</div>'
        + '<div style="font-size:11px;color:var(--text3);">' + Object.keys(tree[year][ym]).length + ' дн.</div>'
        + '</div>'
        + '<div style="font-size:14px;font-weight:800;color:' + monthColor + ';">'
        + (monthSum >= 0 ? '+' : '') + monthSum.toLocaleString('ru') + ' \u20B4</div>'
        + '</div>'
        // Месяц — тело (дни)
        + '<div id="profile-month-body-' + monthKey + '" style="display:none;padding-left:12px;background:var(--surface2);border-radius:0 0 8px 8px;">'
        + daysHtml
        + '</div>'
        + '</div>';
    }).join('');

    return '<div class="fin-month-card" style="margin-bottom:8px;">'
      // Год — заголовок
      + '<div class="fin-month-header" onclick="toggleProfileMonth(\'' + yearKey + '\')">'
      + '<div style="display:flex;align-items:center;gap:10px;">'
      + '<i data-lucide="chevron-down" style="width:16px;height:16px;color:var(--text3);'
      + 'transition:transform 0.2s;" id="pchevron-' + yearKey + '"></i>'
      + '<div><div class="fin-month-name">' + year + ' год</div>'
      + '<div class="fin-month-sub">' + Object.keys(tree[year]).length + ' мес.</div>'
      + '</div></div>'
      + '<div style="font-size:18px;font-weight:800;color:' + yearColor + ';">'
      + (yearSum >= 0 ? '+' : '') + yearSum.toLocaleString('ru') + ' \u20B4</div>'
      + '</div>'
      // Год — тело (месяцы)
      + '<div id="profile-month-body-' + yearKey + '" style="display:none;padding:0 0 8px;">'
      + monthsHtml
      + '</div>'
      + '</div>';
  }).join('');
}

// ── МОДАЛ ДОБАВЛЕНИЯ ЗАПИСИ В КАССУ ─────────────────────────

function openCashEntryModal(account = 'cash') {
  window._cashAccount = account === 'fop' ? 'fop' : 'cash';
  let modal = document.getElementById('cash-entry-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'cash-entry-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:400px;">
        <div class="modal-header">
          <div class="modal-title">${icon('banknote')} Запись в кассу</div>
          <button class="modal-close" onclick="closeCashEntryModal()">
            <i data-lucide="x" style="width:16px;height:16px;"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-grid col-1">
            <div class="form-group">
              <label class="form-label">Сумма (₴)</label>
              <div style="display:flex;gap:8px;">
                <button class="btn-secondary" id="cash-sign-plus"
                  style="font-size:18px;font-weight:800;padding:8px 16px;"
                  onclick="setCashSign(1)">+</button>
                <button class="btn-secondary" id="cash-sign-minus"
                  style="font-size:18px;font-weight:800;padding:8px 16px;"
                  onclick="setCashSign(-1)">−</button>
                <input class="form-input" type="number" id="cash-amount-input"
                  placeholder="500" min="0" style="flex:1;">
              </div>
              <div style="font-size:11px;color:var(--text3);margin-top:4px;">+ приход &nbsp;·&nbsp; − расход</div>
            </div>
            <div class="form-group">
              <label class="form-label">Комментарий</label>
              <input class="form-input" type="text" id="cash-comment-input"
                placeholder="Напр. куплен клей, заказ SG-0042..." required>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeCashEntryModal()">Отмена</button>
          <button class="btn-primary" id="cash-entry-save-btn"
            style="display:flex;align-items:center;gap:6px;" onclick="saveCashEntry()">
            <i data-lucide="save" style="width:14px;height:14px;"></i>
            Сохранить
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById('cash-amount-input').value = '';
  document.getElementById('cash-comment-input').value = '';
  const titleEl = modal.querySelector('.modal-title');
  if (titleEl) {
    const titleByAccount = window._cashAccount === 'fop'
      ? ' Запись в кассу БАБЕНКО'
      : (window._cashAccount === 'card' ? ' Запись на карту Саши' : ' Запись в кассу');
    titleEl.innerHTML = icon('banknote') + titleByAccount;
  }
  window._cashSign = 1;
  _updateCashSignButtons();

  modal.classList.add('active');
  initIcons();
  setTimeout(() => document.getElementById('cash-amount-input').focus(), 100);
}

function closeCashEntryModal() {
  const modal = document.getElementById('cash-entry-modal');
  if (modal) modal.classList.remove('active');
}

function setCashSign(sign) {
  window._cashSign = sign;
  _updateCashSignButtons();
}

function _updateCashSignButtons() {
  const plus  = document.getElementById('cash-sign-plus');
  const minus = document.getElementById('cash-sign-minus');
  if (!plus || !minus) return;
  const sign = window._cashSign || 1;
  plus.style.background   = sign === 1  ? 'var(--accent)' : '';
  plus.style.color        = sign === 1  ? '#0a0a0f' : '';
  plus.style.borderColor  = sign === 1  ? 'var(--accent)' : '';
  minus.style.background  = sign === -1 ? '#ef4444' : '';
  minus.style.color       = sign === -1 ? '#fff' : '';
  minus.style.borderColor = sign === -1 ? '#ef4444' : '';
}

async function saveCashEntry() {
  const rawAmt  = Number(document.getElementById('cash-amount-input')?.value);
  const comment = document.getElementById('cash-comment-input')?.value.trim();
  const sign    = window._cashSign || 1;

  if (!rawAmt || rawAmt <= 0) {
    showToast('Введите сумму', 'error');
    return;
  }

  const amount = rawAmt * sign;
  const btn = document.getElementById('cash-entry-save-btn');
  if (!comment) {
    showToast('Введите комментарий', 'error');
    document.getElementById('cash-comment-input')?.focus();
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    const entry = await sbInsertCashEntry({
      worker_name: currentWorkerName,
      amount,
      comment,
      cash_account: window._cashAccount === 'fop' ? 'fop' : (window._cashAccount === 'card' ? 'card' : 'cash'),
      fop_confirmed: false,
      fop_date: (window._cashAccount === 'fop' || window._cashAccount === 'card') ? getLocalDateString() : null,
    });
    workerCashLog.unshift(entry);
    if (Array.isArray(window.allCashLog) && entry) window.allCashLog.unshift(entry);
    closeCashEntryModal();
    if (document.getElementById('screen-profile')?.classList.contains('active')) renderProfile();
    renderCashScreen();
    showToast('Записано в кассу ✓');
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="save" style="width:14px;height:14px;"></i> Сохранить';
      initIcons();
    }
  }
}

// ── СНЯТЬ ЗАРПЛАТУ ───────────────────────────────────────────

async function withdrawSalary() {
  const accTotal = getSalaryAccumulatedForWithdraw(currentWorkerName, workerSalaries);
  if (accTotal <= 0) {
    showToast('Нет накоплений для снятия', 'error');
    return;
  }

  if (currentRole === 'senior') {
    if (!confirm(`Снять ЗП на сумму ${accTotal.toLocaleString('ru')} ₴ из вашей кассы?`)) return;
    await performSalaryWithdrawal(currentWorkerName, currentWorkerName, accTotal);
  } else {
    // Для помощника открываем модалку выбора старшего
    showSeniorSelectionModal(accTotal);
  }
}

async function withdrawAssistantSalary() {
  const assistant = getSelectedAssistantWorker();
  if (!canManageAssistantSalary() || !assistant?.name) {
    showToast('Помощник не найден', 'error');
    return;
  }

  const accTotal = getSalaryAccumulatedForWithdraw(assistant.name, assistantWorkerSalaries);
  if (accTotal <= 0) {
    showToast('У помощника нет накоплений для снятия', 'error');
    return;
  }

  if (!confirm(`Снять ЗП помощника ${assistant.name} на сумму ${accTotal.toLocaleString('ru')} ₴ из вашей кассы?`)) return;
  await performSalaryWithdrawal(assistant.name, currentWorkerName, accTotal);
}

function showSeniorSelectionModal(amount) {
  let modal = document.getElementById('salary-senior-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'salary-senior-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  // Собираем старших специалистов
  const seniors = (workers || []).filter(w => w.systemRole === 'senior' && w.name !== currentWorkerName);
  let optionsHtml = seniors.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
  if (!optionsHtml) optionsHtml = '<option value="">Нет старших в штате</option>';

  modal.innerHTML = `
    <div class="modal" style="max-width:320px;">
      <div class="modal-header">
        <div class="modal-title">Снятие ЗП: ${amount} ₴</div>
        <button class="modal-close" onclick="document.getElementById('salary-senior-modal').classList.remove('active')"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label" style="font-size:12px;margin-bottom:8px;">Из кассы какого старшего списать деньги?</label>
          <select class="form-select" id="salary-senior-select">${optionsHtml}</select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" style="width:100%;" onclick="confirmJuniorWithdrawal(${amount})">Подтвердить снятие</button>
      </div>
    </div>
  `;
  modal.classList.add('active');
  initIcons();
}

window.confirmJuniorWithdrawal = async function(amount) {
  const select = document.getElementById('salary-senior-select');
  if (!select || !select.value) {
    showToast('Выберите старшего специалиста', 'error');
    return;
  }
  const seniorName = select.value;
  await performSalaryWithdrawal(currentWorkerName, seniorName, amount);
  const modal = document.getElementById('salary-senior-modal');
  if (modal) modal.classList.remove('active');
}

async function performSalaryWithdrawal(recipient, sourceSenior, amount) {
  try {
    const today = getLocalDateString();
    const isSelfWithdrawal = recipient === sourceSenior;
    const cashComment = isSelfWithdrawal
      ? 'Снятие ЗП'
      : `Снятие ЗП помощника ${recipient}`;
    const salaryWithdrawalLabel = `${SALARY_WITHDRAWAL_ORDER_ID} · снял ${sourceSenior}`;
    
    // 1. Снимаем сумму из кассы старшего (sourceSenior)
    const cashEntry = await sbInsertCashEntry({
      worker_name: sourceSenior,
      amount: -amount,
      comment: cashComment
    });
    
    // 2. Добавляем отрицательную запись в зарплату получателя (recipient)
    const salaryEntry = await sbInsertWorkerSalary({
      worker_name: recipient,
      amount: -amount,
      date: today,
      order_id: salaryWithdrawalLabel
    });
    
    if (recipient === currentWorkerName) {
      workerSalaries.unshift(salaryEntry);
    }
    const assistant = getSelectedAssistantWorker();
    if (assistant?.name && recipient === assistant.name) {
      assistantWorkerSalaries.unshift(salaryEntry);
    }
    if (sourceSenior === currentWorkerName && typeof workerCashLog !== 'undefined') {
      workerCashLog.unshift(cashEntry);
    }
    
    renderProfile();
    showToast('Зарплата успешно снята ✓');
  } catch (e) {
    showToast('Ошибка при снятии ЗП: ' + e.message, 'error');
  }
}


// ── АВТОЗАЧИСЛЕНИЕ В КАССУ ПРИ ВЫПОЛНЕНИИ ЗАКАЗА ─────────────
// Вызывается из orders.js после toggleWorkerDone

async function addCashFromOrder(order) {
  // Если у заказа есть история клиентских платежей — касса уже обновляется
  // автоматически в saveOrder() при добавлении каждого платежа.
  // Эта функция обрабатывает только legacy-заказы без clientPayments.
  if (currentRole !== 'senior') return;
  const hasPaymentHistory = Array.isArray(order.clientPayments) && order.clientPayments.length > 0;
  if (hasPaymentHistory) return;
  if ((order.paymentMethod || '').toLowerCase() !== 'наличка') return;
  const amount = Number(order.debt) || 0;
  if (amount <= 0) return;

  try {
    const entry = await sbInsertCashEntry({
      worker_name: currentWorkerName,
      amount,
      comment: `Заказ ${order.id} · ${order.car || order.client || ''}`,
    });
    workerCashLog.unshift(entry);
    showToast(`+${amount.toLocaleString('ru')} ₴ в кассу`);
  } catch (e) {
    console.error('Cash log error:', e);
  }
}

// ── УТИЛИТЫ ──────────────────────────────────────────────────

// Возвращает дату по локальному времени (не UTC!) в формате YYYY-MM-DD
function getLocalDateString() {
  const d = new Date();
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

function entries_count(dayMap) {
  return Object.values(dayMap).reduce((s, arr) => s + arr.length, 0);
}

// Универсальный тоггл для сворачиваемых секций профиля
// Поддерживает как chevron-down (годовые карточки) так и chevron-right (дни/месяцы в архиве)
function toggleProfileMonth(key) {
  const body    = document.getElementById('profile-month-body-' + key);
  const chevron = document.getElementById('pchevron-' + key);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) {
    // chevron-right поворачивается на 90deg, chevron-down на 180deg
    chevron.style.transform = isOpen ? '' : 'rotate(90deg)';
  }
}

// ── КАРТОЧКА УСЛОВИЙ ЗП ─────────────────────────────────────

function renderSalaryRuleCard(workerName) {
  if (typeof SALARY_CONFIG === 'undefined' || typeof getSalaryRule === 'undefined') return '';

  const rule = getSalaryRule(workerName);
  const parts = [];

  if (rule.base) {
    parts.push({ label: 'Ставка за день', value: rule.base.toLocaleString('ru') + ' ₴' });
  }
  if (rule.dailyBaseIfCompleted) {
    parts.push({ label: 'Ставка за день с заказами', value: rule.dailyBaseIfCompleted.toLocaleString('ru') + ' ₴' });
  }
  if (rule.attendanceBase) {
    parts.push({ label: 'Ставка по кнопке "Я в работе"', value: rule.attendanceBase.toLocaleString('ru') + ' ₴' });
  }
  if (rule.baseIfResp) {
    parts.push({ label: 'Доплата за день (если ответственный)', value: rule.baseIfResp.toLocaleString('ru') + ' ₴' });
  }
  if (rule.glassMarginPct) {
    parts.push({ label: 'Маржа стекла', value: Math.round(rule.glassMarginPct * 100) + '%' });
  }
  if (rule.servicesPct) {
    parts.push({ label: 'Услуги (монтаж и др.)', value: Math.round(rule.servicesPct * 100) + '%' });
  }
  if (rule.selectedServices) {
    const adj = rule.serviceAdjustments || {};
    const details = [
      adj.mount ? `монтаж ${adj.mount > 0 ? '+' : ''}${adj.mount}` : '',
      adj.cut ? `срезка ${adj.cut > 0 ? '+' : ''}${adj.cut}` : '',
      adj.glue ? `вклейка ${adj.glue > 0 ? '+' : ''}${adj.glue}` : '',
    ].filter(Boolean).join(', ');
    parts.push({ label: 'Выбранные услуги', value: details || 'по прайсу' });
  }
  if (rule.moldingPct) {
    parts.push({ label: 'Молдинг', value: Math.round(rule.moldingPct * 100) + '%' });
  }
  if (rule.tatuBonusPct) {
    parts.push({ label: 'Бонус тату', value: Math.round(rule.tatuBonusPct * 100) + '%' });
  }
  if (rule.toningBonusPct) {
    parts.push({ label: 'Бонус тонировки', value: Math.round(rule.toningBonusPct * 100) + '%' });
  }

  if (!parts.length) {
    parts.push({ label: 'Условия не заданы', value: '—' });
  }

  const rows = parts.map(p =>
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">'
    + '<div style="font-size:13px;color:var(--text2);">' + p.label + '</div>'
    + '<div style="font-size:14px;font-weight:700;color:var(--text);">' + p.value + '</div>'
    + '</div>'
  ).join('');

  // Формула одной строкой
  const formulaParts = [];
  if (rule.base) formulaParts.push(rule.base + ' ₴');
  if (rule.dailyBaseIfCompleted) formulaParts.push(rule.dailyBaseIfCompleted + ' ₴/день с заказом');
  if (rule.attendanceBase) formulaParts.push(rule.attendanceBase + ' ₴/выход');
  if (rule.baseIfResp) formulaParts.push(rule.baseIfResp + ' ₴ (если отв.)');
  if (rule.glassMarginPct) formulaParts.push('маржа × ' + Math.round(rule.glassMarginPct * 100) + '%');
  if (rule.moldingPct) formulaParts.push('молдинг × ' + Math.round(rule.moldingPct * 100) + '%');
  if (rule.servicesPct) formulaParts.push('услуги × ' + Math.round(rule.servicesPct * 100) + '%');
  if (rule.selectedServices) formulaParts.push('выбранные услуги');
  const formulaStr = formulaParts.join(' + ') || '—';

  return '<div style="margin-top:12px;margin-bottom:4px;">'
    + '<div style="font-size:13px;font-weight:700;color:var(--text3);margin-bottom:8px;letter-spacing:0.04em;">УСЛОВИЯ ЗП</div>'
    + '<div style="background:var(--surface2);border-radius:14px;padding:0 16px;">'
    + rows
    + '<div style="padding:10px 0 4px;">'
    + '<div style="font-size:11px;color:var(--text3);margin-bottom:4px;">Формула</div>'
    + '<code style="font-size:12px;color:var(--accent);background:var(--surface);padding:4px 8px;border-radius:6px;display:block;line-height:1.6;">'
    + escapeHtml(formulaStr)
    + '</code>'
    + '</div>'
    + '</div>'
    + '</div>';
}
