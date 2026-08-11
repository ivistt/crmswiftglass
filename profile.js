// ============================================================
// PROFILE.JS — экраны ЗП и кассы специалиста
// ============================================================

let workerSalaries = [];
let workerProblems = [];
let workerCashLog  = [];  // записи кассы текущего специалиста
let workerCashSummary = null;
let workerCashLogComplete = false;
let workerCashFastLoadPromise = null;
let workerCashFullLoadPromise = null;
let workerCashLoadVersion = 0;
const WORKER_CASH_PAGE_SIZE = 200;
let workerCashNextOffset = 0;
let workerCashHasMore = false;
let workerCashPageLoading = false;
let assistantWorkerSalaries = [];
let cashSearchQuery = '';
let selectedAssistantSalaryName = '';
let profileSalaryMonthCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let workAttendanceSaving = false;

function canManageAssistantSalary() {
  return currentRole === 'senior' || currentRole === 'extra';
}

function canAccessPersonalCash() {
  return currentUserHasPermission('personal_cash_view', currentRole === 'senior' || currentRole === 'extra');
}

function canAddPersonalCashEntries() {
  return currentUserHasPermission('cash_add_entries', currentRole === 'senior' || currentRole === 'extra');
}

function currentWorkerHasFopCashRoute() {
  return (typeof getPaymentMethods === 'function' ? getPaymentMethods() : [])
    .some(row =>
      row?.active !== false
      && String(row?.method_type || '').trim().toLowerCase() === 'fop'
      && String(row?.worker_name || '').trim() === currentWorkerName
    );
}

function normalizeSalaryMonthCursor(value) {
  const date = value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatSalaryMonthTitle(date) {
  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const safeDate = normalizeSalaryMonthCursor(date);
  return `${monthNames[safeDate.getMonth()]} ${safeDate.getFullYear()}`;
}

function getSalaryMonthKey(date) {
  const safeDate = normalizeSalaryMonthCursor(date);
  return `${safeDate.getFullYear()}-${String(safeDate.getMonth() + 1).padStart(2, '0')}`;
}

function setProfileSalaryMonth(offset) {
  const current = normalizeSalaryMonthCursor(profileSalaryMonthCursor);
  profileSalaryMonthCursor = new Date(current.getFullYear(), current.getMonth() + offset, 1);
  renderProfile();
}

function getWorkerSalaryMonthSummary(workerName, entries, cursorDate = new Date()) {
  const monthKey = getSalaryMonthKey(cursorDate);
  const monthEntries = (entries || [])
    .filter(isRelevantSalaryEntry)
    .filter(entry => String(entry?.date || '').startsWith(monthKey));
  const byDate = {};
  monthEntries.forEach(entry => {
    const date = String(entry?.date || '').slice(0, 10);
    if (!date) return;
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(entry);
  });
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
  return dates.reduce((acc, date) => {
    const visualDay = getWorkerSalaryVisualDayData(workerName, date, byDate[date]);
    acc.amount += Number(visualDay.visualAmount) || 0;
    acc.orders += Number(visualDay.summary?.count) || 0;
    acc.days += 1;
    return acc;
  }, {
    monthKey,
    title: formatSalaryMonthTitle(cursorDate),
    amount: 0,
    orders: 0,
    days: 0,
  });
}

function renderWorkerSalaryMonthCard(workerName, entries, cursorDate = new Date(), changeHandler = 'setProfileSalaryMonth') {
  const summary = getWorkerSalaryMonthSummary(workerName, entries, cursorDate);
  const prevAction = String(changeHandler || '').includes('__OFFSET__')
    ? String(changeHandler).replace('__OFFSET__', '-1')
    : `${changeHandler}(-1)`;
  const nextAction = String(changeHandler || '').includes('__OFFSET__')
    ? String(changeHandler).replace('__OFFSET__', '1')
    : `${changeHandler}(1)`;
  return ''
    + '<div class="profile-today-card" style="margin-top:12px;">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">'
    + '<button class="btn-secondary calendar-nav-btn" type="button" onclick="' + prevAction + '" style="flex-shrink:0;">' + icon('chevron-right') + '</button>'
    + '<div style="text-align:center;min-width:0;flex:1;">'
    + '<div style="font-size:12px;font-weight:800;color:var(--text3);letter-spacing:0.04em;">ЗП ЗА МЕСЯЦ</div>'
    + '<div style="font-size:18px;font-weight:900;color:var(--text);margin-top:4px;">' + escapeHtml(summary.title) + '</div>'
    + '</div>'
    + '<button class="btn-secondary calendar-nav-btn" type="button" onclick="' + nextAction + '" style="flex-shrink:0;transform:rotate(180deg);">' + icon('chevron-right') + '</button>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:14px;">'
    + '<div style="padding:12px;border-radius:12px;background:var(--surface2);border:1px solid var(--border);">'
    + '<div style="font-size:11px;color:var(--text3);">Начислено</div>'
    + '<div style="font-size:20px;font-weight:900;color:' + (summary.amount >= 0 ? 'var(--accent)' : '#ef4444') + ';margin-top:4px;">' + summary.amount.toLocaleString('ru') + ' ₴</div>'
    + '</div>'
    + '<div style="padding:12px;border-radius:12px;background:var(--surface2);border:1px solid var(--border);">'
    + '<div style="font-size:11px;color:var(--text3);">Заказов</div>'
    + '<div style="font-size:20px;font-weight:900;color:var(--text);margin-top:4px;">' + summary.orders + '</div>'
    + '</div>'
    + '<div style="padding:12px;border-radius:12px;background:var(--surface2);border:1px solid var(--border);">'
    + '<div style="font-size:11px;color:var(--text3);">Дней</div>'
    + '<div style="font-size:20px;font-weight:900;color:var(--text);margin-top:4px;">' + summary.days + '</div>'
    + '</div>'
    + '</div>'
    + '</div>';
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

async function loadWorkerProblems() {
  if (currentRole === 'owner') return;
  try {
    workerProblems = await sbFetchWorkerProblems(currentWorkerName);
  } catch (e) {
    workerProblems = [];
  }
}

async function loadWorkerCashLog() {
  if (!canAccessPersonalCash()) return;
  try {
    workerCashLog = await sbFetchCashLog(currentWorkerName);
    workerCashLogComplete = true;
    workerCashNextOffset = workerCashLog.length;
    workerCashHasMore = false;
  } catch (e) {
    workerCashLog = [];
    workerCashLogComplete = false;
    workerCashNextOffset = 0;
    workerCashHasMore = false;
  }
}

async function loadWorkerCashFastState({ force = false } = {}) {
  if (!canAccessPersonalCash()) return false;
  if (!force && workerCashFastLoadPromise) return workerCashFastLoadPromise;
  const loadVersion = ++workerCashLoadVersion;

  const fastPromise = Promise.all([
    sbFetchCashSummary(currentWorkerName),
    sbFetchCashLogPage(currentWorkerName, { limit: WORKER_CASH_PAGE_SIZE }),
  ]).then(([summary, page]) => {
    if (loadVersion !== workerCashLoadVersion) return false;
    const summaryRows = Array.isArray(summary?.workers) ? summary.workers : [];
    const hasAccountBreakdown = summaryRows.every(row =>
      Object.prototype.hasOwnProperty.call(row || {}, 'confirmed_cash_uah')
      && Object.prototype.hasOwnProperty.call(row || {}, 'confirmed_fop_uah')
    );
    if (!hasAccountBreakdown) {
      throw new Error('Cash summary SQL must be updated');
    }
    workerCashSummary = summary;
    const pageRows = Array.isArray(page?.rows) ? page.rows : [];
    workerCashLog = pageRows;
    workerCashNextOffset = Math.max(0, Number(page?.nextOffset) || pageRows.length);
    workerCashHasMore = page?.hasMore === true;
    workerCashLogComplete = !workerCashHasMore;
    return true;
  }).catch(error => {
    console.warn('Fast worker cash load unavailable:', error);
    if (loadVersion === workerCashLoadVersion) workerCashSummary = null;
    return false;
  }).finally(() => {
    if (workerCashFastLoadPromise === fastPromise) workerCashFastLoadPromise = null;
  });
  workerCashFastLoadPromise = fastPromise;

  return workerCashFastLoadPromise;
}

async function loadWorkerCashFullState({ force = false } = {}) {
  if (!canAccessPersonalCash()) return false;
  if (!force && workerCashLogComplete) return true;
  if (!force && workerCashFullLoadPromise) return workerCashFullLoadPromise;
  const loadVersion = workerCashLoadVersion;

  const fullPromise = sbFetchCashLog(currentWorkerName)
    .then(rows => {
      if (loadVersion !== workerCashLoadVersion) return false;
      workerCashLog = Array.isArray(rows) ? rows : [];
      workerCashLogComplete = true;
      workerCashNextOffset = workerCashLog.length;
      workerCashHasMore = false;
      return true;
    })
    .catch(error => {
      console.warn('Full worker cash load failed:', error);
      return false;
    })
    .finally(() => {
      if (workerCashFullLoadPromise === fullPromise) workerCashFullLoadPromise = null;
    });
  workerCashFullLoadPromise = fullPromise;

  return workerCashFullLoadPromise;
}

async function loadWorkerCashCompleteState() {
  if (!canAccessPersonalCash()) return false;
  const loadVersion = ++workerCashLoadVersion;
  const [summaryResult, logResult] = await Promise.allSettled([
    sbFetchCashSummary(currentWorkerName),
    sbFetchCashLog(currentWorkerName),
  ]);
  if (loadVersion !== workerCashLoadVersion) return false;

  if (summaryResult.status === 'fulfilled') {
    const summary = summaryResult.value;
    const summaryRows = Array.isArray(summary?.workers) ? summary.workers : [];
    const hasAccountBreakdown = summaryRows.every(row =>
      Object.prototype.hasOwnProperty.call(row || {}, 'confirmed_cash_uah')
      && Object.prototype.hasOwnProperty.call(row || {}, 'confirmed_fop_uah')
    );
    workerCashSummary = hasAccountBreakdown ? summary : null;
  } else {
    console.warn('Worker cash summary load failed:', summaryResult.reason);
    workerCashSummary = null;
  }

  if (logResult.status !== 'fulfilled') {
    console.warn('Full worker cash load failed:', logResult.reason);
    workerCashLogComplete = false;
    workerCashHasMore = false;
    return false;
  }

  workerCashLog = Array.isArray(logResult.value) ? logResult.value : [];
  workerCashLogComplete = true;
  workerCashNextOffset = workerCashLog.length;
  workerCashHasMore = false;
  return true;
}

async function loadWorkerCashCompleteHistory(button = null) {
  if (button) {
    button.disabled = true;
    button.textContent = 'Загрузка…';
  }
  const ok = await loadWorkerCashFullState();
  if (ok) renderCashScreen();
  else if (button) {
    button.disabled = false;
    button.textContent = 'Вся история';
  }
}

async function loadMoreWorkerCashHistory(button = null) {
  if (workerCashPageLoading || !workerCashHasMore || !currentWorkerName) return;
  workerCashPageLoading = true;
  if (button) {
    button.disabled = true;
    button.textContent = 'Загрузка…';
  }

  try {
    const page = await sbFetchCashLogPage(currentWorkerName, {
      offset: workerCashNextOffset,
      limit: WORKER_CASH_PAGE_SIZE,
    });
    const pageRows = Array.isArray(page?.rows) ? page.rows : [];
    const existingIds = new Set((workerCashLog || []).map(entry => String(entry?.id || '')).filter(Boolean));
    const uniqueRows = pageRows.filter(entry => {
      const id = String(entry?.id || '');
      return !id || !existingIds.has(id);
    });
    workerCashLog = [...(workerCashLog || []), ...uniqueRows];
    workerCashNextOffset = Math.max(workerCashNextOffset, Number(page?.nextOffset) || workerCashNextOffset);
    workerCashHasMore = page?.hasMore === true;
    workerCashLogComplete = !workerCashHasMore;
    renderCashScreen();
  } catch (error) {
    showToast('Ошибка загрузки истории: ' + error.message, 'error');
    if (button) {
      button.disabled = false;
      button.textContent = 'Загрузить ещё';
    }
  } finally {
    workerCashPageLoading = false;
  }
}

// Текущий баланс кассы = сумма всех записей
function calcCashBalance(log) {
  return (log || []).reduce((s, e) => s + Number(e.amount), 0);
}

function hasWorkerCashSummary() {
  return !!workerCashSummary
    && typeof workerCashSummary === 'object'
    && Array.isArray(workerCashSummary.workers);
}

function getWorkerCashSummaryAmount(field) {
  if (!hasWorkerCashSummary()) return null;
  if (!workerCashSummary.workers.some(row => Object.prototype.hasOwnProperty.call(row || {}, field))) {
    return workerCashSummary.workers.length ? null : 0;
  }
  return workerCashSummary.workers.reduce(
    (sum, row) => sum + (Number(row?.[field]) || 0),
    0
  );
}

function getWorkerCashReverseBalanceMap(log = [], currentBalance = 0, amountGetter = entry => Number(entry?.amount) || 0) {
  const map = new Map();
  let balance = Number(currentBalance) || 0;
  [...(log || [])]
    .filter(entry => !String(entry?.deleted_at || '').trim())
    .sort((a, b) => {
      const at = new Date(a?.created_at || a?.fop_date || 0).getTime();
      const bt = new Date(b?.created_at || b?.fop_date || 0).getTime();
      if (at !== bt) return bt - at;
      return String(b?.id || '').localeCompare(String(a?.id || ''));
    })
    .forEach(entry => {
      const id = String(entry?.id || '').trim();
      if (id) map.set(id, balance);
      balance -= Number(amountGetter(entry)) || 0;
    });
  return map;
}

// ── ОТКРЫТИЕ ЭКРАНА ──────────────────────────────────────────

async function openProfileScreen() {
  await loadWorkerSalaries();
  await loadWorkerProblems();
  renderProfile();
  showScreen('profile');
  setActiveNav('profile');
}

async function openCashScreen() {
  await loadWorkerCashCompleteState();
  renderCashScreen();
  showScreen('cash');
  setActiveNav('cash');
}

// ── РЕНДЕР ЗП ────────────────────────────────────────────────

function renderProfile() {
  const el = document.getElementById('profile-content');

  if (currentRole === 'manager') {
    const relevantSalaryEntries = workerSalaries.filter(isRelevantSalaryEntry);
    const today = getLocalDateString();
    const accTotal = getSalaryAccumulatedForWithdraw(currentWorkerName, workerSalaries);
    const todayAmount = getSalaryAccrualForDateWithExpectedBase(currentWorkerName, relevantSalaryEntries, today);
    const salaryHistoryHtml = buildWorkerSalaryHistory(currentWorkerName, relevantSalaryEntries);
    el.innerHTML = ''
      + '<div class="profile-header">'
      + '<div class="worker-avatar" style="width:56px;height:56px;font-size:20px;border-radius:16px;flex-shrink:0;">' + getInitials(currentWorkerName) + '</div>'
      + '<div><div style="font-size:20px;font-weight:800;">' + getWorkerDisplayName(currentWorkerName) + '</div>'
      + '<div style="font-size:13px;color:var(--text3);margin-top:2px;">' + (ROLE_LABELS[currentRole] || currentRole) + '</div></div>'
      + '</div>'
      + renderWorkAttendanceCard()
      + '<div class="profile-summary" style="margin-top:12px;">'
      + '<div class="profile-summary-card"><div class="profile-summary-label">Накоплено</div><div class="profile-summary-value">' + accTotal.toLocaleString('ru') + ' ₴</div>'
      + (canAccessPersonalCash() ? '<button class="btn-primary" style="margin-top:10px;min-height:36px;padding:0 14px;border-radius:8px;font-weight:800;" onclick="withdrawSalary()" ' + (accTotal <= 0 ? 'disabled' : '') + '>Снять ЗП</button>' : '')
      + '</div>'
      + '<div class="profile-summary-card"><div class="profile-summary-label">Сегодня</div><div class="profile-summary-value">' + todayAmount.toLocaleString('ru') + ' ₴</div></div>'
      + '</div>'
      + renderWorkerSalaryMonthCard(currentWorkerName, relevantSalaryEntries, profileSalaryMonthCursor)
      + '<div class="profile-today-card" style="margin-top:12px;">'
      + '<div style="font-size:12px;font-weight:800;color:var(--text3);margin-bottom:12px;letter-spacing:0.04em;">ИСТОРИЯ ЗАРПЛАТ</div>'
      + '<div style="display:flex;flex-direction:column;gap:12px;">' + salaryHistoryHtml + '</div>'
      + '</div>'
      + renderWorkerProblemsBlock()
      + '<button class="subtle-reload-btn" style="margin-top:12px;" onclick="clearCacheAndReload()">Очистить кеш и перезагрузить</button>';
    initIcons();
    return;
  }

  const today = getLocalDateString();
  const selectedAssistant = getSelectedAssistantWorker();
  const workedAssistants = getSeniorWorkedAssistants();
  const relevantSalaryEntries = workerSalaries.filter(isRelevantSalaryEntry);
  const accTotal = getSalaryAccumulatedForWithdraw(currentWorkerName, workerSalaries);
  const todayAmount = getSalaryAccrualForDateWithExpectedBase(currentWorkerName, relevantSalaryEntries, today);
  const todaySummary = getWorkerCompletedOrdersSummary(currentWorkerName, today);
  const salaryHistoryHtml = buildWorkerSalaryHistory(currentWorkerName, relevantSalaryEntries);
  const assistantRelevantEntries = assistantWorkerSalaries.filter(isRelevantSalaryEntry);
  const assistantTodayAmount = selectedAssistant ? getSalaryAccrualForDateWithExpectedBase(selectedAssistant.name, assistantRelevantEntries, today) : 0;
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
    + renderWorkerSalaryMonthCard(currentWorkerName, relevantSalaryEntries, profileSalaryMonthCursor)
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
    + salaryGroupHtml
    + renderWorkerProblemsBlock()
    + '<button class="subtle-reload-btn" style="margin-top:12px;" onclick="clearCacheAndReload()">Очистить кеш и перезагрузить</button>';

  initIcons();
}

function renderWorkerProblemsBlock() {
  if (currentRole === 'owner') return '';
  const items = (workerProblems || [])
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const listHtml = items.length
    ? items.map(problem => {
        const amount = Number(problem.amount) || 0;
        const meta = [
          problem.date ? formatDate(problem.date) : '',
          problem.order_id || '',
          problem.partner ? 'с ' + problem.partner : ''
        ].filter(Boolean).join(' · ');
        return ''
          + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:10px 12px;background:var(--surface2);border-radius:8px;border-left:2px solid var(--red,#DC2626);">'
          + '<div style="min-width:0;">'
          + '<div style="font-size:13px;font-weight:700;color:var(--text);">' + escapeHtml(problem.description || 'Проблема') + '</div>'
          + (meta ? '<div style="font-size:11px;color:var(--text3);margin-top:3px;">' + escapeHtml(meta) + '</div>' : '')
          + '</div>'
          + '<div style="font-size:13px;font-weight:900;color:var(--red,#DC2626);white-space:nowrap;">' + amount.toLocaleString('ru') + ' ₴</div>'
          + '</div>';
      }).join('')
    : '<div style="font-size:13px;color:var(--text3);text-align:center;padding:12px;background:var(--surface2);border-radius:8px;">Проблем не зафиксировано</div>';

  return ''
    + '<div class="profile-today-card" style="margin-top:12px;">'
    + '<div style="font-size:12px;font-weight:800;color:var(--text3);margin-bottom:12px;letter-spacing:0.04em;">ПРОБЛЕМЫ</div>'
    + '<div style="display:flex;flex-direction:column;gap:8px;">' + listHtml + '</div>'
    + '</div>';
}

function renderCashScreen() {
  const el = document.getElementById('cash-content');
  if (!el) return;

  if (!canAccessPersonalCash()) {
    el.innerHTML = ''
      + '<div class="profile-header">'
      + '<div class="worker-avatar" style="width:56px;height:56px;font-size:20px;border-radius:16px;flex-shrink:0;">' + getInitials(currentWorkerName) + '</div>'
      + '<div><div style="font-size:20px;font-weight:800;">' + getWorkerDisplayName(currentWorkerName) + '</div>'
      + '<div style="font-size:13px;color:var(--text3);margin-top:2px;">Касса</div></div>'
      + '</div>'
      + '<div class="profile-today-card" style="margin-top:12px;">'
      + '<div style="font-size:14px;color:var(--text3);text-align:center;">У вас нет доступа к кассе</div>'
      + '</div>';
    initIcons();
    return;
  }

  const today = getLocalDateString();
  const nonFopCashLog = (workerCashLog || []).filter(entry => !isFopCashEntry(entry));
  const currencyCashLog = nonFopCashLog.filter(isCurrencyCashEntry);
  const fopCashLog = (workerCashLog || []).filter(isFopCashEntry);
  const pendingPersonalCashLog = (workerCashLog || []).filter(isPendingPersonalConfirmableCashEntry);
  const pendingCardCashLog = pendingPersonalCashLog.filter(isCardCashEntry);
  const unifiedCashHistoryLog = nonFopCashLog.filter(entry => {
    if (isCurrencyCashEntry(entry) && !isCurrencyCashTransferEntry(entry)) return false;
    return true;
  });
  const confirmedUnifiedCashLog = nonFopCashLog.filter(entry => {
    if (isCurrencyCashEntry(entry) && !isCurrencyCashTransferEntry(entry)) return false;
    if (isPendingPersonalConfirmableCashEntry(entry)) return false;
    return true;
  });
  const confirmedFopCashLog = fopCashLog.filter(entry => getCashEntryApprovalStatus(entry) === 'confirmed');
  const pendingFopCashLog = fopCashLog.filter(entry => getCashEntryApprovalStatus(entry) !== 'confirmed');
  const summaryCashBalance = getWorkerCashSummaryAmount('confirmed_cash_uah');
  const summaryCurrencyBalance = getWorkerCashSummaryAmount('usd');
  const summaryFopBalance = getWorkerCashSummaryAmount('confirmed_fop_uah');
  const cashBalance = summaryCashBalance !== null ? summaryCashBalance : calcCashBalance(confirmedUnifiedCashLog);
  const currencyBalance = summaryCurrencyBalance !== null ? summaryCurrencyBalance : calcCurrencyCashBalance(currencyCashLog);
  const fopBalance = summaryFopBalance !== null ? summaryFopBalance : calcCashBalance(confirmedFopCashLog);

  el.innerHTML = ''
    + '<div class="profile-header">'
    + '<div class="worker-avatar" style="width:56px;height:56px;font-size:20px;border-radius:16px;flex-shrink:0;">' + getInitials(currentWorkerName) + '</div>'
    + '<div><div style="font-size:20px;font-weight:800;">' + getWorkerDisplayName(currentWorkerName) + '</div>'
    + '<div style="font-size:13px;color:var(--text3);margin-top:2px;">Касса</div></div>'
    + '</div>'
    + (!workerCashLogComplete
      ? '<div class="profile-today-card" style="margin-top:12px;padding:12px 14px;">'
        + '<div style="font-size:12px;color:#ef4444;">Не удалось загрузить полный архив кассы. Обновите страницу.</div>'
        + '</div>'
      : '')
    + renderCashSection(unifiedCashHistoryLog, cashBalance, today, {
      title: 'Касса',
      account: 'cash',
      buttonText: '+ Запись',
      balanceLog: confirmedUnifiedCashLog,
      pendingEntries: pendingCardCashLog,
      pendingLabel: 'ОЖИДАЮТ ПОДТВЕРЖДЕНИЯ (КАРТА)',
      defaultPendingComment: 'Карта',
      archiveKeyPrefix: 'cash',
      extraButtonsHtml: '<button class="btn-secondary" style="font-size:12px;padding:6px 10px;" onclick="openCashEntryModal(\'currency-back\')">Из $</button>'
    })
    + renderCurrencyCashSection(currencyCashLog, currencyBalance, today)
    + ((currentWorkerHasFopCashRoute() || fopCashLog.length)
      ? renderCashSection(fopCashLog, fopBalance, today, {
          title: 'Касса БАБЕНКО',
          account: 'fop',
          buttonText: '+ БАБЕНКО',
          balanceLog: confirmedFopCashLog,
          pendingEntries: pendingFopCashLog
        })
      : '')
    + renderWorkerDropshipperCashSection();

  initIcons();
}

function getSalaryAccrualForDate(entries, date) {
  return (entries || [])
    .filter(entry => entry.date === date && !isSalaryWithdrawalEntry(entry))
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
}

function getOpenSalaryEntriesForWorker(workerName, entries) {
  return (entries || [])
    .filter(isRelevantSalaryEntry)
    .filter(entry => !workerName || entry.worker_name === workerName)
    .filter(entry => isSalaryEntryOpenForCurrentAccumulation(entry, entries));
}

function getSalaryBaseEntryId() {
  return (typeof _dailyBaseOrderId === 'function') ? _dailyBaseOrderId() : 'Ставка за день';
}

function hasSalaryBaseEntry(entries, date) {
  const baseOrderId = getSalaryBaseEntryId();
  return (entries || []).some(entry => entry.date === date && entry.order_id === baseOrderId);
}

function getSalaryAccrualForDateWithExpectedBase(workerName, entries, date) {
  const relevantEntries = getOpenSalaryEntriesForWorker(workerName, entries);
  return getSalaryAccrualForDate(relevantEntries, date);
}

function getSalaryAccumulatedForWithdraw(workerName, entries) {
  const relevantEntries = getOpenSalaryEntriesForWorker(workerName, entries);
  return relevantEntries.reduce((sum, s) => sum + Number(s.amount), 0);
}

function getWorkerSalaryVisualDayData(workerName, date, dateEntries) {
  const withdrawals = (dateEntries || []).filter(isSalaryWithdrawalEntry);
  const accruals = (dateEntries || []).filter(entry => !isSalaryWithdrawalEntry(entry));
  const summary = getWorkerCompletedOrdersSummary(workerName, date);
  const orderIds = new Set((summary.orders || []).map(order => order.id));
  const otherAccruals = accruals.filter(entry => isOwnerManualSalaryEntry(entry) || !orderIds.has(entry.order_id));
  const ordersAmount = (summary.orders || []).reduce((sum, order) => sum + (Number(order.amount) || 0), 0);
  const otherAmount = otherAccruals.reduce((sum, entry) => sum + Number(entry.amount), 0);
  return {
    summary,
    withdrawals,
    accruals,
    otherAccruals,
    visualAmount: ordersAmount + otherAmount,
  };
}

function renderWorkerSalarySection({ title, accumulated, todayAmount, todaySummary, withdrawAction, withdrawDisabled, showWithdraw = true, attendanceHtml = '' }) {
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
    + '</div>'
    + '</div>'
    + (attendanceHtml ? '<div style="margin-top:12px;">' + attendanceHtml + '</div>' : '')
    + '</div>';
}

function getTodayAttendanceEntry() {
  const today = getLocalDateString();
  const todayEntries = (workerSalaries || []).filter(entry => entry?.date === today);
  const attendanceEntries = todayEntries.filter(entry => isWorkAttendanceEntry(entry));
  if (!attendanceEntries.length) return null;
  const activeTotal = todayEntries.reduce((sum, entry) => {
    const amount = Number(entry?.amount) || 0;
    const orderId = String(entry?.order_id || '');
    const comment = String(entry?.comment || '');
    if (orderId === WORK_ATTENDANCE_ORDER_ID && amount > 0) return sum + amount;
    if (amount < 0 && orderId.startsWith('Отмена ЗП') && comment.includes('Отмена выхода в работу')) return sum + amount;
    return sum;
  }, 0);
  return activeTotal > 0 ? attendanceEntries[0] : null;
}

function getTodayAttendanceAmount() {
  return Number(getTodayAttendanceEntry()?.amount) || 0;
}

function renderWorkAttendanceCard() {
  if (typeof getShiftBaseAmount !== 'function') return '';
  const amount = Number(getShiftBaseAmount(currentWorkerName)) || 0;
  if (!amount) return '';
  const entry = getTodayAttendanceEntry();
  const isSaving = workAttendanceSaving;
  return ''
    + '<div style="padding:14px;background:var(--surface2);border-radius:12px;border:1px solid var(--border);">'
    + '<div class="profile-today-label"><i data-lucide="calendar-check" style="width:15px;height:15px;"></i> Смена</div>'
    + '<div style="font-size:12px;color:var(--text3);margin-top:6px;">Ставка за день: ' + amount.toLocaleString('ru') + ' ₴</div>'
    + '<button id="work-attendance-btn" class="' + (entry ? 'btn-secondary' : 'btn-primary') + '" style="margin-top:12px;width:100%;min-height:44px;font-weight:800;" onclick="toggleWorkAttendance()" ' + (isSaving ? 'disabled' : '') + '>'
    + (isSaving ? 'Сохраняем...' : (entry ? 'Я на смене ✓' : 'Я на смене'))
    + '</button>'
    + '</div>';
}

async function toggleWorkAttendance() {
  if (workAttendanceSaving) return;
  const amount = Number(typeof getShiftBaseAmount === 'function' ? getShiftBaseAmount(currentWorkerName) : 0) || 0;
  if (!amount) {
    showToast('Для вас ставка выхода не настроена', 'error');
    return;
  }
  const today = getLocalDateString();
  const existing = getTodayAttendanceEntry();
  workAttendanceSaving = true;
  renderProfile();
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
      if (created && !workerSalaries.some(entry => String(entry?.id || '') === String(created.id || ''))) workerSalaries.unshift(created);
      showToast('Смена отмечена ✓');
    }
    renderProfile();
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  } finally {
    workAttendanceSaving = false;
    renderProfile();
  }
}

function renderAssistantSalarySection(assistantWorkers, assistantWorker, todayReport, todaySummary, todayAmount, assistantAccTotal = 0) {
  const optionsHtml = assistantWorkers.map(worker =>
    `<option value="${escapeHtml(worker.name)}" ${assistantWorker?.name === worker.name ? 'selected' : ''}>${escapeHtml(getWorkerDisplayName(worker.name))}</option>`
  ).join('');
  const hasSelectedAssistant = !!assistantWorker?.name;

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
    + '</div>'
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
    if (order.responsible === currentWorkerName && order.extraAssistant) {
      names.add(order.extraAssistant);
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
    + orderItems.map(item => {
      const breakdown = Array.isArray(item.breakdown) ? item.breakdown : [];
      const breakdownHtml = breakdown.length
        ? '<div style="display:flex;flex-direction:column;gap:3px;margin-top:5px;">'
          + breakdown.map(part => '<div style="display:grid;grid-template-columns:minmax(0,max-content) max-content;align-items:center;column-gap:8px;color:var(--text3);font-size:11px;">'
            + '<span style="min-width:0;">' + escapeHtml(part.label || 'Начисление') + '</span>'
            + '<span style="white-space:nowrap;color:' + ((Number(part.amount) || 0) === 0 ? 'var(--yellow)' : 'inherit') + ';">' + (Number(part.amount) || 0).toLocaleString('ru') + ' ₴</span>'
            + '</div>').join('')
          + '</div>'
        : '';
      return '<div style="padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="openSalaryEntryOrder(\'' + escapeJsString(item.id) + '\', event)">'
        + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;font-size:12px;color:var(--text2);">'
        + '<div style="min-width:0;">'
        + '<div style="font-weight:800;color:var(--text);">' + escapeHtml(item.id) + ' · ' + escapeHtml(item.client || '—') + ' · ' + escapeHtml(item.car || '—') + '</div>'
        + '<div style="margin-top:5px;"><span style="display:inline-flex;font-size:10px;font-weight:900;color:var(--accent);background:rgba(29,233,182,.12);border:1px solid rgba(29,233,182,.22);border-radius:999px;padding:2px 6px;">Авто</span></div>'
        + breakdownHtml
        + '</div>'
        + '<span style="font-weight:800;color:var(--accent);white-space:nowrap;">' + (Number(item.amount) || 0).toLocaleString('ru') + ' ₴</span>'
        + '</div>'
        + '</div>';
    }).join('')
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
    const yearSum = months.reduce((sum, ym) => sum + Object.keys(tree[year][ym]).reduce((acc, date) => {
      const visualDay = getWorkerSalaryVisualDayData(workerName, date, tree[year][ym][date]);
      return acc + visualDay.visualAmount;
    }, 0), 0);
    const yearKey = 'sal-year-' + year;

    const monthsHtml = months.map(ym => {
      const parts = ym.split('-');
      const monthName = MONTH_NAMES[parseInt(parts[1]) - 1];
      const days = Object.keys(tree[year][ym]).sort((a, b) => b.localeCompare(a));
      const monthSum = days.reduce((sum, date) => {
        const visualDay = getWorkerSalaryVisualDayData(workerName, date, tree[year][ym][date]);
        return sum + visualDay.visualAmount;
      }, 0);
      const monthKey = 'sal-month-' + ym;

      const daysHtml = days.map(date => {
        const dateEntries = tree[year][ym][date];
        const { withdrawals, summary, otherAccruals, visualAmount } = getWorkerSalaryVisualDayData(workerName, date, dateEntries);
        const accrualAmount = visualAmount;
        const totalForDay = visualAmount;
        const dayKey = 'sal-day-' + date;
        const ordersHtml = renderSalaryOrdersList(summary.orders);
        const accrualsHtml = otherAccruals.length
          ? '<div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">'
            + otherAccruals.map(entry => {
              const isManual = isOwnerManualSalaryEntry(entry);
              const label = entry.order_id === WORK_ATTENDANCE_ORDER_ID
                ? 'Выход в работу'
                : (entry.order_id === MANUAL_SALARY_REPORT_ORDER_ID ? 'Дневная ЗП' : `${isManual ? 'Ручная запись' : 'Заказ'} ${entry.order_id || '—'}`);
              const history = typeof getSalaryEditHistory === 'function' ? getSalaryEditHistory(entry) : [];
              const editedHtml = history.length
                ? '<div style="font-size:11px;color:var(--text3);margin-top:2px;">Отредактировано владельцем</div>'
                : '';
              const linkedOrderId = typeof resolveSalaryEntryOrderId === 'function' ? resolveSalaryEntryOrderId(entry.order_id) : '';
              return '<div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--text2);' + (linkedOrderId ? 'cursor:pointer;' : '') + '"'
                + (linkedOrderId ? ' onclick="openSalaryEntryOrder(\'' + escapeJsString(entry.order_id) + '\', event)"' : '')
                + '>'
                + '<span>' + escapeHtml(label) + (entry.comment ? '<div style="font-size:11px;color:var(--text3);margin-top:2px;">' + escapeHtml(entry.comment) + '</div>' : '') + editedHtml + '</span>'
                + '<span style="font-weight:800;color:' + (Number(entry.amount) >= 0 ? 'var(--accent)' : '#ef4444') + ';white-space:nowrap;">' + Number(entry.amount).toLocaleString('ru') + ' ₴</span>'
                + '</div>';
            }).join('')
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
  return getCashEntryAccountType(entry) === CASH_ACCOUNT_FOP;
}

function isConfirmedFopCashEntry(entry) {
  return isFopCashEntry(entry) && getCashEntryApprovalStatus(entry) === 'confirmed';
}

function isPendingPersonalConfirmableCashEntry(entry) {
  if (!entry || isCurrencyCashEntry(entry)) return false;
  return isConfirmableCashEntry(entry) && getCashEntryApprovalStatus(entry) !== 'confirmed';
}

function isCardCashEntry(entry) {
  if (!entry || isCurrencyCashEntry(entry)) return false;
  if (getCashEntryAccountType(entry) !== CASH_ACCOUNT_CASH) return false;
  const paymentMethod = getCashEntryPaymentMethod(entry);
  if (!paymentMethod) return false;
  return !isCashPaymentMethod(paymentMethod) && !isFopPaymentMethod(paymentMethod);
}

function getCurrentWorkerDropshipperNames() {
  if (typeof findWorkerForDropshipper !== 'function') return [];
  return (refDropshippers || [])
    .map(row => row.name || '')
    .filter(name => {
      const worker = findWorkerForDropshipper(name);
      return worker?.name === currentWorkerName;
    });
}

function getProfileDropshipperPaid(order) {
  return (order?.dropshipperPayments || []).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
}

function renderWorkerDropshipperCashSection() {
  const dropshipperNames = getCurrentWorkerDropshipperNames();
  if (!dropshipperNames.length) return '';

  const list = (orders || [])
    .filter(order => isOrderFinanciallyActive(order))
    .filter(order => dropshipperNames.includes(order.dropshipper))
    .filter(order => Number(order.dropshipperPayout) > 0)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.time || '').localeCompare(String(a.time || '')));

  const done = list.filter(order => getProfileDropshipperPaid(order) >= (Number(order.dropshipperPayout) || 0));
  const pending = list.filter(order => getProfileDropshipperPaid(order) < (Number(order.dropshipperPayout) || 0));
  const pendingTotal = pending.reduce((sum, order) => sum + Math.max(0, (Number(order.dropshipperPayout) || 0) - getProfileDropshipperPaid(order)), 0);
  const doneTotal = done.reduce((sum, order) => sum + getProfileDropshipperPaid(order), 0);

  return '<div class="profile-today-card" style="margin-top:12px;">'
    + '<div class="profile-today-label"><i data-lucide="handshake" style="width:15px;height:15px;"></i> Оплата по дропу</div>'
    + '<div style="font-size:12px;color:var(--text3);margin-top:6px;">' + dropshipperNames.map(escapeHtml).join(', ') + '</div>'
    + '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin-top:12px;">'
    + '<div style="padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--surface2);">'
    + '<div style="font-size:11px;font-weight:800;color:var(--text3);letter-spacing:0.05em;">ОЖИДАЮЩИЕ</div>'
    + '<div style="font-size:22px;font-weight:900;color:var(--yellow);margin-top:6px;">' + pendingTotal.toLocaleString('ru') + ' ₴</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:3px;">Заказов: ' + pending.length + '</div>'
    + '</div>'
    + '<div style="padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--surface2);">'
    + '<div style="font-size:11px;font-weight:800;color:var(--text3);letter-spacing:0.05em;">ВЫПОЛНЕННЫЕ</div>'
    + '<div style="font-size:22px;font-weight:900;color:var(--accent);margin-top:6px;">' + doneTotal.toLocaleString('ru') + ' ₴</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:3px;">Заказов: ' + done.length + '</div>'
    + '</div>'
    + '</div>'
    + renderWorkerDropshipperOrdersGroup('ОЖИДАЮТ ОПЛАТЫ', pending, 'var(--yellow)')
    + renderWorkerDropshipperOrdersGroup('ВЫПОЛНЕННЫЕ', done, 'var(--accent)')
    + '</div>';
}

function renderWorkerDropshipperOrdersGroup(title, rows, color) {
  const html = rows.length
    ? rows.map(renderWorkerDropshipperOrderRow).join('')
    : '<div style="text-align:center;color:var(--text3);font-size:13px;padding:10px 0;">Заказов нет</div>';
  return '<div style="margin-top:14px;">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
    + '<div style="font-size:12px;font-weight:800;color:var(--text3);letter-spacing:0.04em;">' + escapeHtml(title) + '</div>'
    + '<div style="font-size:13px;font-weight:900;color:' + color + ';">' + rows.length + '</div>'
    + '</div>'
    + '<div style="background:var(--surface2);border-radius:10px;padding:0 12px;">'
    + html
    + '</div>'
    + '</div>';
}

function renderWorkerDropshipperOrderRow(order) {
  const due = Number(order.dropshipperPayout) || 0;
  const paid = getProfileDropshipperPaid(order);
  const left = Math.max(0, due - paid);
  const isDone = left <= 0;
  return '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="openOrderDetail(\'' + escapeJsString(order.id) + '\')">'
    + '<div style="min-width:0;">'
    + '<div style="font-size:13px;color:var(--text2);font-weight:800;">' + escapeHtml(order.car || order.id || '—') + '</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:2px;">' + escapeHtml(formatDate(order.date)) + (order.time ? ' · ' + escapeHtml(order.time) : '') + ' · ' + escapeHtml(order.client || '—') + '</div>'
    + '</div>'
    + '<div style="text-align:right;flex-shrink:0;">'
    + '<div style="font-size:15px;font-weight:900;color:' + (isDone ? 'var(--accent)' : 'var(--yellow)') + ';">' + paid.toLocaleString('ru') + ' / ' + due.toLocaleString('ru') + ' ₴</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:2px;">' + (isDone ? 'выполнено' : 'осталось ' + left.toLocaleString('ru') + ' ₴') + '</div>'
    + '</div>'
    + '</div>';
}

function renderCashSection(log, balance, today, options = {}) {
  const title = options.title || 'Касса (наличка)';
  const account = options.account || 'cash';
  const buttonText = options.buttonText || '+ Запись';
  const pendingEntries = options.pendingEntries || [];
  const balanceLog = Array.isArray(options.balanceLog) ? options.balanceLog : log;
  const balanceColor = balance >= 0 ? 'var(--accent)' : '#ef4444';
  const filteredLog = _filterCashLogByComment(log, cashSearchQuery);
  const balanceMap = !workerCashLogComplete && hasWorkerCashSummary()
    ? getWorkerCashReverseBalanceMap(balanceLog, balance)
    : (typeof getCashRunningBalanceMap === 'function' ? getCashRunningBalanceMap(balanceLog) : new Map());

  // Сегодня показываем быстрым блоком, но полный архив также включает текущий день.
  const todayLog   = filteredLog.filter(e => _cashEntryDate(e) === today);
  const archiveLog = filteredLog;

  // ── Текущая касса (сегодня) ──
  const todayBalance = todayLog.reduce((s, e) => s + Number(e.amount), 0);
  const todayColor   = todayBalance >= 0 ? 'var(--accent)' : '#ef4444';

  const todayRowsHtml = todayLog.length
    ? todayLog.map(e => _cashEntryRow(e, balanceMap)).join('')
    : '<div style="text-align:center;color:var(--text3);font-size:13px;padding:10px 0;">Сегодня записей нет</div>';

  // ── Архив (группировка: год → месяц → день) ──
  const archiveHtml = _buildCashArchive(archiveLog, options.archiveKeyPrefix || options.account || 'cash', balanceMap);

  return '<div class="profile-today-card" style="margin-top:12px;">'

    // Заголовок с балансом и кнопками
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">'
    + '<div>'
    + '<div class="profile-today-label"><i data-lucide="wallet" style="width:15px;height:15px;"></i> ' + escapeHtml(title) + '</div>'
    + '<div style="font-size:28px;font-weight:800;color:' + balanceColor + ';margin-top:4px;">' + balance.toLocaleString('ru') + ' \u20B4</div>'
    + '<div style="font-size:11px;color:var(--text3);">подтверждённый баланс</div>'
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">'
    + (options.hideAddButton || !canAddPersonalCashEntries() ? '' : '<button class="btn-secondary" style="font-size:12px;padding:6px 10px;" onclick="openCashEntryModal(\'' + account + '\')">' + escapeHtml(buttonText) + '</button>')
    + (options.extraButtonsHtml || '')
    + '</div>'
    + '</div>'

    + '<div style="margin-bottom:14px;">'
    + '<input class="form-input" type="text" placeholder="Поиск по комментарию или сумме..." value="' + escapeHtml(cashSearchQuery) + '" onkeydown="if(event.key === \'Enter\') setCashSearchQuery(this.value)">'
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
    + '<div style="font-size:12px;font-weight:700;color:var(--text3);letter-spacing:0.04em;margin-bottom:8px;">🗂 ПОЛНЫЙ АРХИВ</div>'
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
    return '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--border);">'
      + '<div style="min-width:0;flex:1 1 220px;">'
      + '<div style="font-size:13px;color:var(--text2);font-weight:700;">' + escapeHtml(entry.comment || defaultComment) + '</div>'
      + '<div style="font-size:11px;color:var(--text3);margin-top:2px;">' + escapeHtml(entry.fop_date || _cashEntryDate(entry) || '') + '</div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;flex:1 1 180px;">'
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
    const confirmationStamp = new Date().toISOString();
    const updated = await sbUpdateCashEntry(id, { fop_confirmed: true });
    const confirmedEntryPatch = {
      ...updated,
      fop_confirmed: true,
      approval_status: 'confirmed',
      approval_at: updated?.approval_at || confirmationStamp,
    };
    workerCashLog = (workerCashLog || []).map(entry => entry.id === id ? { ...entry, ...confirmedEntryPatch } : entry);
    if (Array.isArray(window.allCashLog)) {
      window.allCashLog = window.allCashLog.map(entry => entry.id === id ? { ...entry, ...confirmedEntryPatch } : entry);
    }
    if (Array.isArray(window.ownerCashRecentLog)) {
      window.ownerCashRecentLog = window.ownerCashRecentLog.map(entry => entry.id === id ? { ...entry, ...confirmedEntryPatch } : entry);
    }
    try {
      orders = await sbFetchOrders();
    } catch (ordersRefreshError) {
      console.warn('Failed to refresh orders after cash confirmation:', ordersRefreshError);
    }
    await refreshCurrentWorkerCashState();
    renderCashScreen();
    if (document.getElementById('screen-profile')?.classList.contains('active')) renderProfile();
    if (typeof refreshActiveOrdersViews === 'function') refreshActiveOrdersViews();
    const account = getCashEntryAccountType(updated);
    const paymentMethod = getCashEntryPaymentMethod(updated);
    if (account === 'fop') showToast('ФОП подтверждено ✓');
    else if (typeof isCardPaymentMethod === 'function' && isCardPaymentMethod(paymentMethod)) showToast('Карта подтверждена ✓');
    else if (paymentMethod) showToast(`Подтверждено: ${paymentMethod} ✓`);
    else showToast('Запись подтверждена ✓');
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}

async function setCashSearchQuery(value) {
  cashSearchQuery = value || '';
  if (cashSearchQuery.trim() && !workerCashLogComplete) {
    await loadWorkerCashFullState();
  }
  renderCashScreen();
}

function _filterCashLogByComment(log, query) {
  const normalized = (query || '').trim().toLowerCase();
  if (!normalized) return log || [];
  const amountQuery = typeof normalizeCashSearchNumber === 'function'
    ? normalizeCashSearchNumber(normalized)
    : (/^[+-]?\d+(?:[.,]\d+)?$/.test(normalized.replace(/\s+/g, '')) ? Number(normalized.replace(/\s+/g, '').replace(',', '.')) : null);
  if (amountQuery !== null && Number.isFinite(amountQuery)) {
    return (log || []).filter(e => Math.abs(Number(e?.amount || 0)) === Math.abs(amountQuery));
  }
  const words = normalized.split(/\s+/).filter(Boolean);
  return (log || []).filter(e => {
    const comment = String(getCashEntrySearchText(e) || '').toLowerCase();
    return words.every(word => comment.includes(word));
  });
}

// Возвращает дату записи кассы в формате YYYY-MM-DD
function _cashEntryDate(e) {
  if (!e.created_at) return '';
  return new Date(e.created_at).toISOString().slice(0, 10);
}

function _formatCashAmountWithBalance(amount, balance, currency = '\u20B4') {
  const sign = amount >= 0 ? '+' : '';
  const amountText = sign + amount.toLocaleString('ru') + ' ' + currency;
  if (!Number.isFinite(Number(balance))) return amountText;
  return amountText + ' (' + Number(balance).toLocaleString('ru') + ')';
}

function _formatCashEntryApprovalDateTime(value) {
  if (typeof formatCashEntryApprovalDateTime === 'function') {
    return formatCashEntryApprovalDateTime(value);
  }
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function _renderCashEntryApprovalBadge(e) {
  if (!isConfirmableCashEntry(e)) return '';
  const confirmed = getCashEntryApprovalStatus(e) === 'confirmed';
  const label = confirmed ? 'подтверждено' : 'ожидает подтверждения';
  const color = confirmed ? 'var(--accent)' : 'var(--yellow)';
  const approvedAt = confirmed ? _formatCashEntryApprovalDateTime(e?.approval_at || e?.approvalAt || '') : '';
  const timeLabel = approvedAt ? ' · ' + approvedAt : '';
  return '<span style="margin-left:6px;color:' + color + ';font-weight:800;">' + escapeHtml(label + timeLabel) + '</span>';
}

// Одна строка записи кассы
function _cashEntryRow(e, balanceMap = null) {
  const amt   = Number(e.amount);
  const color = amt >= 0 ? 'var(--accent)' : '#ef4444';
  const dt    = new Date(e.created_at);
  const time  = dt.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  const displayComment = getCashEntryDisplayComment(e);
  const displayMeta = getCashEntryDisplayMeta(e);
  const tagLabels = getCashEntryTagLabels(e);
  const account = getCashEntryAccountType(e);
  const paymentMethod = getCashEntryPaymentMethod(e);
  const isConfirmedCard = getCashEntryApprovalStatus(e) === 'confirmed'
    && account === 'cash'
    && paymentMethod
    && !isCashPaymentMethod(paymentMethod)
    && !isFopPaymentMethod(paymentMethod);
  const cardTag = isConfirmedCard
    ? '<span style="display:inline-flex;align-items:center;padding:2px 7px;border-radius:999px;background:rgba(29,233,182,.12);border:1px solid rgba(29,233,182,.22);color:var(--accent);font-size:10px;font-weight:800;margin-left:6px;">карта</span>'
    : '';
  const approvalBadge = _renderCashEntryApprovalBadge(e);
  const linkedOrderId = typeof getOrderIdFromCashEntry === 'function' ? getOrderIdFromCashEntry(e) : '';
  return '<div style="display:flex;justify-content:space-between;align-items:center;'
    + 'padding:10px 0;border-bottom:1px solid var(--border);' + (linkedOrderId ? 'cursor:pointer;' : '') + '"'
    + (linkedOrderId ? ' onclick="openOrderFromCashEntry(\'' + escapeJsString(e.id) + '\', event)"' : '')
    + '>'
    + '<div>'
    + '<div style="font-size:13px;color:var(--text2);display:flex;align-items:center;flex-wrap:wrap;">' + escapeHtml(displayComment || '—') + cardTag + '</div>'
    + (tagLabels.length
      ? '<div class="cash-entry-tags">' + tagLabels.map(label => '<span class="cash-entry-tag">' + escapeHtml(label) + '</span>').join('') + '</div>'
      : '')
    + '<div style="font-size:11px;color:var(--text3);margin-top:2px;">' + time + (displayMeta ? ' · ' + escapeHtml(displayMeta) : '') + approvalBadge + '</div>'
    + '</div>'
    + '<div style="font-size:15px;font-weight:800;color:' + color + ';white-space:nowrap;margin-left:12px;">'
    + _formatCashAmountWithBalance(amt, balanceMap?.get?.(String(e.id)), '\u20B4') + '</div>'
    + '</div>';
}

function renderCurrencyCashSection(log, balance, today) {
  const todayLog = (log || []).filter(e => _cashEntryDate(e) === today);
  const archiveLog = (log || []).filter(e => _cashEntryDate(e) !== today);
  const currencyAmountGetter = entry => Number(parseCurrencyCashEntry(entry)?.usdAmount) || 0;
  const balanceMap = !workerCashLogComplete && hasWorkerCashSummary()
    ? getWorkerCashReverseBalanceMap(log, balance, currencyAmountGetter)
    : (typeof getCashRunningBalanceMap === 'function'
      ? getCashRunningBalanceMap(log, currencyAmountGetter)
      : new Map());
  const todayBalance = calcCurrencyCashBalance(todayLog);
  const balanceColor = balance >= 0 ? 'var(--accent)' : '#ef4444';
  const todayColor = todayBalance >= 0 ? 'var(--accent)' : '#ef4444';
  const todayRowsHtml = todayLog.length
    ? todayLog.map(e => _currencyCashEntryRow(e, balanceMap)).join('')
    : '<div style="text-align:center;color:var(--text3);font-size:13px;padding:10px 0;">Сегодня обменов не было</div>';

  return '<div class="profile-today-card" style="margin-top:12px;">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">'
    + '<div>'
    + '<div class="profile-today-label"><i data-lucide="badge-dollar-sign" style="width:15px;height:15px;"></i> Касса (валютная)</div>'
    + '<div style="font-size:28px;font-weight:800;color:' + balanceColor + ';margin-top:4px;">' + balance.toLocaleString('ru') + ' $</div>'
    + '<div style="font-size:11px;color:var(--text3);">общий баланс в валюте</div>'
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">'
    + (canAddPersonalCashEntries()
      ? '<button class="btn-secondary" style="font-size:12px;padding:6px 10px;" onclick="openCashEntryModal(\'currency-entry\')">+ Запись</button>'
        + '<button class="btn-secondary" style="font-size:12px;padding:6px 10px;" onclick="openCashEntryModal(\'currency\')">+ Обмен</button>'
      : '')
    + '</div>'
    + '</div>'
    + '<div style="margin-bottom:16px;">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
    + '<div style="font-size:12px;font-weight:700;color:var(--text3);letter-spacing:0.04em;">' + icon('calendar') + ' СЕГОДНЯ</div>'
    + '<div style="font-size:15px;font-weight:800;color:' + todayColor + ';">' + (todayBalance >= 0 ? '+' : '') + todayBalance.toLocaleString('ru') + ' $</div>'
    + '</div>'
    + '<div style="background:var(--surface2);border-radius:10px;padding:0 12px;">'
    + todayRowsHtml
    + '</div>'
    + '</div>'
    + '<div>'
    + '<div style="font-size:12px;font-weight:700;color:var(--text3);letter-spacing:0.04em;margin-bottom:8px;">🗂 АРХИВ</div>'
    + (archiveLog.length ? _buildCurrencyCashArchive(archiveLog, balanceMap) : '<div style="text-align:center;color:var(--text3);font-size:13px;padding:10px 0;">Обменов пока нет</div>')
    + '</div>'
    + '</div>';
}

function _currencyCashEntryRow(entry, balanceMap = null) {
  const parsed = parseCurrencyCashEntry(entry);
  if (!parsed) return '';
  const dt = new Date(entry.created_at);
  const time = dt.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  const titleBase = parsed.usdAmount > 0 ? 'Обмен в валютную кассу' : 'Возврат из валютной кассы';
  const title = parsed.note ? titleBase + ' · ' + parsed.note : titleBase;
  const meta = [
    parsed.rate ? 'курс ' + parsed.rate.toLocaleString('ru') : '',
    parsed.uahAmount ? (parsed.usdAmount > 0 ? 'списано ' : 'получено ') + parsed.uahAmount.toLocaleString('ru') + ' ₴' : '',
  ].filter(Boolean).join(' · ');
  const amountColor = parsed.usdAmount >= 0 ? 'var(--accent)' : '#ef4444';
  return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);">'
    + '<div>'
    + '<div style="font-size:13px;color:var(--text2);">' + escapeHtml(title) + '</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:2px;">' + time + (meta ? ' · ' + escapeHtml(meta) : '') + '</div>'
    + '</div>'
    + '<div style="font-size:15px;font-weight:800;color:' + amountColor + ';white-space:nowrap;margin-left:12px;">'
    + _formatCashAmountWithBalance(parsed.usdAmount, balanceMap?.get?.(String(entry.id)), '$') + '</div>'
    + '</div>';
}

function _buildCurrencyCashArchive(log, balanceMap = null) {
  if (!log.length) return '';
  const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const tree = {};

  for (const entry of log) {
    const parsed = parseCurrencyCashEntry(entry);
    if (!parsed) continue;
    const d = _cashEntryDate(entry);
    if (!d) continue;
    const year = d.slice(0, 4);
    const month = d.slice(0, 7);
    const day = d;
    if (!tree[year]) tree[year] = {};
    if (!tree[year][month]) tree[year][month] = {};
    if (!tree[year][month][day]) tree[year][month][day] = [];
    tree[year][month][day].push(entry);
  }

  const years = Object.keys(tree).sort((a, b) => b.localeCompare(a));
  return years.map(year => {
    const yearEntries = Object.values(tree[year]).flatMap(month => Object.values(month).flat());
    const yearSum = calcCurrencyCashBalance(yearEntries);
    const yearKey = 'currency-cash-year-' + year;
    const monthsHtml = Object.keys(tree[year]).sort((a, b) => b.localeCompare(a)).map(ym => {
      const monthEntries = Object.values(tree[year][ym]).flat();
      const monthSum = calcCurrencyCashBalance(monthEntries);
      const monthKey = 'currency-cash-month-' + ym;
      const [, month] = ym.split('-');
      const daysHtml = Object.keys(tree[year][ym]).sort((a, b) => b.localeCompare(a)).map(day => {
        const entries = tree[year][ym][day];
        const daySum = calcCurrencyCashBalance(entries);
        const dayKey = 'currency-cash-day-' + day;
        const [dy, dm, dd] = day.split('-');
        return '<div style="border-bottom:1px solid var(--border);">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;cursor:pointer;" onclick="toggleProfileMonth(\'' + dayKey + '\')">'
          + '<div style="display:flex;align-items:center;gap:8px;">'
          + '<i data-lucide="chevron-right" style="width:13px;height:13px;color:var(--text3);transition:transform 0.2s;" id="pchevron-' + dayKey + '"></i>'
          + '<div style="font-size:13px;color:var(--text2);font-weight:600;">' + dd + '.' + dm + '.' + dy + '</div>'
          + '<div style="font-size:11px;color:var(--text3);">' + entries.length + ' зап.</div>'
          + '</div>'
          + '<div style="font-size:13px;font-weight:800;color:' + (daySum >= 0 ? 'var(--accent)' : '#ef4444') + ';">' + (daySum >= 0 ? '+' : '') + daySum.toLocaleString('ru') + ' $</div>'
          + '</div>'
          + '<div id="profile-month-body-' + dayKey + '" style="display:none;padding:0 12px 4px 28px;">'
          + entries.map(item => _currencyCashEntryRow(item, balanceMap)).join('')
          + '</div>'
          + '</div>';
      }).join('');

      return '<div style="border-bottom:1px solid var(--border);">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;cursor:pointer;" onclick="toggleProfileMonth(\'' + monthKey + '\')">'
        + '<div style="display:flex;align-items:center;gap:8px;">'
        + '<i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text3);transition:transform 0.2s;" id="pchevron-' + monthKey + '"></i>'
        + '<div style="font-size:14px;font-weight:700;color:var(--text2);">' + (MONTH_NAMES[parseInt(month, 10) - 1] || ym) + '</div>'
        + '<div style="font-size:11px;color:var(--text3);">' + Object.keys(tree[year][ym]).length + ' дн.</div>'
        + '</div>'
        + '<div style="font-size:14px;font-weight:800;color:' + (monthSum >= 0 ? 'var(--accent)' : '#ef4444') + ';">' + (monthSum >= 0 ? '+' : '') + monthSum.toLocaleString('ru') + ' $</div>'
        + '</div>'
        + '<div id="profile-month-body-' + monthKey + '" style="display:none;padding-left:12px;background:var(--surface2);border-radius:0 0 8px 8px;">'
        + daysHtml
        + '</div>'
        + '</div>';
    }).join('');

    return '<div class="fin-month-card" style="margin-bottom:8px;">'
      + '<div class="fin-month-header" onclick="toggleProfileMonth(\'' + yearKey + '\')">'
      + '<div style="display:flex;align-items:center;gap:10px;">'
      + '<i data-lucide="chevron-down" style="width:16px;height:16px;color:var(--text3);transition:transform 0.2s;" id="pchevron-' + yearKey + '"></i>'
      + '<div><div class="fin-month-name">' + year + ' год</div>'
      + '<div class="fin-month-sub">' + Object.keys(tree[year]).length + ' мес.</div>'
      + '</div></div>'
      + '<div style="font-size:18px;font-weight:800;color:' + (yearSum >= 0 ? 'var(--accent)' : '#ef4444') + ';">' + (yearSum >= 0 ? '+' : '') + yearSum.toLocaleString('ru') + ' $</div>'
      + '</div>'
      + '<div id="profile-month-body-' + yearKey + '" style="display:none;padding:0 0 8px;">'
      + monthsHtml
      + '</div>'
      + '</div>';
  }).join('');
}

// Строит архив: год → месяц → день (все сворачиваемые)
function _buildCashArchive(log, keyPrefix = 'cash', balanceMap = null) {
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
    const yearKey = keyPrefix + '-year-' + year;

    const monthsHtml = Object.keys(tree[year]).sort((a, b) => b.localeCompare(a)).map(ym => {
      const [y, m] = ym.split('-');
      const monthName = MONTH_NAMES[parseInt(m) - 1];
      const monthSum  = Object.values(tree[year][ym]).flat().reduce((s, e) => s + Number(e.amount), 0);
      const monthColor = monthSum >= 0 ? 'var(--accent)' : '#ef4444';
      const monthKey = keyPrefix + '-month-' + ym;

      const daysHtml = Object.keys(tree[year][ym]).sort((a, b) => b.localeCompare(a)).map(day => {
        const entries  = tree[year][ym][day];
        const daySum   = entries.reduce((s, e) => s + Number(e.amount), 0);
        const dayColor = daySum >= 0 ? 'var(--accent)' : '#ef4444';
        const dayKey   = keyPrefix + '-day-' + day;
        const [dy, dm, dd] = day.split('-');

        const rowsHtml = entries.map(e => _cashEntryRow(e, balanceMap)).join('');

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
  if (!canAddPersonalCashEntries()) return;
  window._cashAccount = account === 'fop'
    ? 'fop'
    : (account === 'currency' ? 'currency' : (account === 'currency-back' ? 'currency-back' : (account === 'currency-entry' ? 'currency-entry' : 'cash')));
  let modal = document.getElementById('cash-entry-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'cash-entry-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  if (window._cashAccount === 'currency' || window._cashAccount === 'currency-back') {
    modal.innerHTML = `
      <div class="modal" style="max-width:420px;">
        <div class="modal-header">
          <div class="modal-title">${icon('badge-dollar-sign')} ${window._cashAccount === 'currency-back' ? 'Возврат из валютной кассы' : 'Обмен в валютную кассу'}</div>
          <button class="modal-close" onclick="closeCashEntryModal()">
            <i data-lucide="x" style="width:16px;height:16px;"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-grid col-1">
            <div class="form-group">
              <label class="form-label">Курс обмена</label>
              <input class="form-input" type="text" inputmode="decimal" id="cash-rate-input" placeholder="Например 41.5">
            </div>
            <div class="form-group">
              <label class="form-label">Сумма в валюте ($)</label>
              <input class="form-input" type="text" inputmode="decimal" id="cash-usd-amount-input" placeholder="Например 100">
            </div>
            <div class="form-group">
              <label class="form-label">Комментарий</label>
              <input class="form-input" type="text" id="cash-comment-input" placeholder="${window._cashAccount === 'currency-back' ? 'Напр. сдал валюту в кассу' : 'Напр. обмен в кассе'}">
            </div>
            <div style="font-size:12px;color:var(--text3);padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface2);">
              ${window._cashAccount === 'currency-back'
                ? 'Сумма спишется из валютной кассы и появится в гривневой после сохранения'
                : 'Сумма спишется из гривневой кассы и появится в валютной после сохранения'}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeCashEntryModal()">Отмена</button>
          <button class="btn-primary" id="cash-entry-save-btn" style="display:flex;align-items:center;gap:6px;" onclick="saveCashEntry()">
            <i data-lucide="save" style="width:14px;height:14px;"></i>
            Сохранить
          </button>
        </div>
      </div>
    `;
  } else if (window._cashAccount === 'currency-entry') {
    modal.innerHTML = `
      <div class="modal" style="max-width:420px;">
        <div class="modal-header">
          <div class="modal-title">${icon('badge-dollar-sign')} Запись в валютную кассу</div>
          <button class="modal-close" onclick="closeCashEntryModal()">
            <i data-lucide="x" style="width:16px;height:16px;"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-grid col-1">
            <div class="form-group">
              <label class="form-label">Сумма ($)</label>
              <div style="display:flex;gap:8px;">
                <button class="btn-secondary" id="cash-sign-plus"
                  style="font-size:18px;font-weight:800;padding:8px 16px;"
                  onclick="setCashSign(1)">+</button>
                <button class="btn-secondary" id="cash-sign-minus"
                  style="font-size:18px;font-weight:800;padding:8px 16px;"
                  onclick="setCashSign(-1)">−</button>
                <input class="form-input" type="text" inputmode="decimal" id="cash-usd-amount-input"
                  placeholder="100" style="flex:1;">
              </div>
              <div style="font-size:11px;color:var(--text3);margin-top:4px;">+ приход &nbsp;·&nbsp; − расход</div>
            </div>
            <div class="form-group">
              <label class="form-label">Комментарий</label>
              <input class="form-input" type="text" id="cash-comment-input"
                placeholder="Напр. клиент дал наличные в $" required>
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
  } else {
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
                <input class="form-input" type="text" inputmode="decimal" id="cash-amount-input"
                  placeholder="500" style="flex:1;">
              </div>
              <div style="font-size:11px;color:var(--text3);margin-top:4px;">+ приход &nbsp;·&nbsp; − расход</div>
            </div>
            <div class="form-group">
              <label class="form-label">Категория расхода</label>
              <select class="form-select" id="cash-expense-category" onchange="updateCashExpenseMode()">
                <option value="">Обычная запись</option>
                ${getExpenseCategoryOptions().map(category => `<option value="${escapeAttr(category)}">${escapeHtml(category)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" id="cash-expense-warehouse-group">
              <label class="form-label">Склад</label>
              <select class="form-select" id="cash-expense-warehouse">
                <option value="">— выбрать —</option>
                ${getWarehouseNameOptions().map(warehouse => `<option value="${escapeAttr(warehouse)}">${escapeHtml(warehouse)}</option>`).join('')}
              </select>
            </div>
            <div id="cash-expense-hint" style="display:none;font-size:11px;color:var(--text3);margin-top:-4px;">
              Если выбрана категория, запись сохранится как расход автоматически.
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
    document.getElementById('cash-amount-input').value = '';
    document.getElementById('cash-comment-input').value = '';
    const titleEl = modal.querySelector('.modal-title');
    if (titleEl) {
      const titleByAccount = window._cashAccount === 'fop'
        ? ' Запись в кассу БАБЕНКО'
        : ' Запись в кассу';
      titleEl.innerHTML = icon('banknote') + titleByAccount;
    }
  }
  window._cashSign = 1;
  _updateCashSignButtons();
  updateCashExpenseMode();

  modal.classList.add('active');
  initIcons();
  setTimeout(() => {
    const targetId = (window._cashAccount === 'currency' || window._cashAccount === 'currency-back')
      ? 'cash-rate-input'
      : (window._cashAccount === 'currency-entry' ? 'cash-usd-amount-input' : 'cash-amount-input');
    document.getElementById(targetId)?.focus();
  }, 100);
}

function updateCashExpenseMode() {
  const category = String(document.getElementById('cash-expense-category')?.value || '').trim();
  const warehouseGroup = document.getElementById('cash-expense-warehouse-group');
  const warehouseSelect = document.getElementById('cash-expense-warehouse');
  const hint = document.getElementById('cash-expense-hint');
  const plus = document.getElementById('cash-sign-plus');
  const minus = document.getElementById('cash-sign-minus');
  const isExpense = !!category;
  const needsWarehouse = isExpense && isWarehouseExpenseCategory(category);

  if (warehouseGroup) warehouseGroup.style.display = isExpense ? '' : 'none';
  if (warehouseSelect) {
    warehouseSelect.disabled = !needsWarehouse;
    if (!needsWarehouse) warehouseSelect.value = '';
  }
  if (hint) hint.style.display = isExpense ? 'block' : 'none';
  if (plus) plus.disabled = isExpense;
  if (minus) minus.disabled = isExpense;
  if (isExpense) {
    window._cashSign = -1;
  }
  _updateCashSignButtons();
}

function closeCashEntryModal() {
  const modal = document.getElementById('cash-entry-modal');
  if (modal) modal.classList.remove('active');
}

async function refreshCurrentWorkerCashState() {
  if (!currentWorkerName) return;
  await loadWorkerCashCompleteState();
}

async function refreshCurrentWorkerSalaryState() {
  try {
    await loadWorkerSalaries();
  } catch (e) {
    console.warn('Failed to refresh worker salaries:', e);
  }
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
  const btn = document.getElementById('cash-entry-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    let entry;
    if (window._cashAccount === 'currency' || window._cashAccount === 'currency-back') {
      const parseDecimalInput = (value) => {
        const normalized = String(value || '').replace(',', '.').trim();
        return Number(normalized);
      };
      const rate = parseDecimalInput(document.getElementById('cash-rate-input')?.value);
      const usdAmount = parseDecimalInput(document.getElementById('cash-usd-amount-input')?.value);
      const note = document.getElementById('cash-comment-input')?.value.trim() || '';
      if (!rate || rate <= 0) {
        showToast('Введите курс обмена', 'error');
        document.getElementById('cash-rate-input')?.focus();
        return;
      }
      if (!usdAmount || usdAmount <= 0) {
        showToast('Введите сумму в валюте', 'error');
        document.getElementById('cash-usd-amount-input')?.focus();
        return;
      }
      const uahAmount = Math.round(rate * usdAmount * 100) / 100;
      if (window._cashAccount === 'currency-back') {
        const summaryCurrencyBalance = getWorkerCashSummaryAmount('usd');
        const currentCurrencyBalance = summaryCurrencyBalance !== null
          ? summaryCurrencyBalance
          : calcCurrencyCashBalance((workerCashLog || []).filter(item => !isFopCashEntry(item)).filter(isCurrencyCashEntry));
        if (usdAmount > currentCurrencyBalance) {
          showToast('Недостаточно валюты в кассе', 'error');
          return;
        }
      } else {
        const summaryCashBalance = getWorkerCashSummaryAmount('confirmed_cash_uah');
        const currentCashBalance = summaryCashBalance !== null
          ? summaryCashBalance
          : calcCashBalance((workerCashLog || [])
            .filter(item => !isFopCashEntry(item))
            .filter(item => !isPendingPersonalConfirmableCashEntry(item)));
        if (uahAmount > currentCashBalance) {
          showToast('Недостаточно гривны в кассе', 'error');
          return;
        }
      }
      entry = await sbInsertCashEntry({
        worker_name: currentWorkerName,
        amount: window._cashAccount === 'currency-back' ? uahAmount : -uahAmount,
        comment: buildCurrencyCashComment({ usdAmount: window._cashAccount === 'currency-back' ? -usdAmount : usdAmount, rate, uahAmount, note }),
        cash_account: 'cash',
        cash_owner: currentWorkerName,
        account_type: 'cash',
        payment_type: 'transfer',
        source_type: 'exchange',
        fop_confirmed: false,
        fop_date: null,
      });
    } else if (window._cashAccount === 'currency-entry') {
      const parseDecimalInput = (value) => {
        const normalized = String(value || '').replace(',', '.').trim();
        return Number(normalized);
      };
      const usdAmount = parseDecimalInput(document.getElementById('cash-usd-amount-input')?.value);
      const note = document.getElementById('cash-comment-input')?.value.trim() || '';
      const sign = window._cashSign || 1;
      if (!usdAmount || usdAmount <= 0) {
        showToast('Введите сумму в валюте', 'error');
        document.getElementById('cash-usd-amount-input')?.focus();
        return;
      }
      if (!note) {
        showToast('Введите комментарий', 'error');
        document.getElementById('cash-comment-input')?.focus();
        return;
      }
      const signedUsdAmount = usdAmount * sign;
      const summaryCurrencyBalance = getWorkerCashSummaryAmount('usd');
      const currentCurrencyBalance = summaryCurrencyBalance !== null
        ? summaryCurrencyBalance
        : calcCurrencyCashBalance((workerCashLog || []).filter(item => !isFopCashEntry(item)).filter(isCurrencyCashEntry));
      if (signedUsdAmount < 0 && Math.abs(signedUsdAmount) > currentCurrencyBalance) {
        showToast('Недостаточно валюты в кассе', 'error');
        return;
      }
      entry = await sbInsertCashEntry({
        worker_name: currentWorkerName,
        amount: 0,
        comment: buildCurrencyCashComment({ usdAmount: signedUsdAmount, rate: 0, uahAmount: 0, note }),
        cash_account: 'cash',
        cash_owner: currentWorkerName,
        account_type: 'cash',
        payment_type: 'transfer',
        source_type: 'exchange',
        fop_confirmed: false,
        fop_date: null,
      });
    } else {
      const rawAmt = Number(String(document.getElementById('cash-amount-input')?.value || '').replace(',', '.').trim());
      const comment = document.getElementById('cash-comment-input')?.value.trim();
      const expenseCategory = String(document.getElementById('cash-expense-category')?.value || '').trim();
      const expenseWarehouse = String(document.getElementById('cash-expense-warehouse')?.value || '').trim();
      const sign = window._cashSign || 1;

      if (!rawAmt || rawAmt <= 0) {
        showToast('Введите сумму', 'error');
        return;
      }
      if (!comment) {
        showToast('Введите комментарий', 'error');
        document.getElementById('cash-comment-input')?.focus();
        return;
      }
      if (expenseCategory && isWarehouseExpenseCategory(expenseCategory) && !expenseWarehouse) {
        showToast('Выберите склад', 'error');
        document.getElementById('cash-expense-warehouse')?.focus();
        return;
      }

      const isExpense = !!expenseCategory;
      const amount = isExpense ? -Math.abs(rawAmt) : (rawAmt * sign);
      const finalComment = isExpense
        ? buildExpenseCashComment({
            amount: rawAmt,
            category: expenseCategory,
            warehouse: expenseWarehouse,
            note: comment,
          })
        : comment;
      entry = await sbInsertCashEntry({
        worker_name: currentWorkerName,
        amount,
        comment: finalComment,
        cash_account: window._cashAccount === 'fop' ? CASH_ACCOUNT_FOP : CASH_ACCOUNT_CASH,
        cash_owner: currentWorkerName,
        account_type: window._cashAccount === 'fop' ? CASH_ACCOUNT_FOP : CASH_ACCOUNT_CASH,
        source_type: isExpense ? 'expense' : 'manual',
        expense_category: expenseCategory || null,
        warehouse_name: expenseWarehouse || null,
        fop_confirmed: false,
        fop_date: window._cashAccount === 'fop' ? getLocalDateString() : null,
      });
    }
    await refreshCurrentWorkerCashState();
    closeCashEntryModal();
    if (document.getElementById('screen-profile')?.classList.contains('active')) renderProfile();
    renderCashScreen();
    showToast(
      window._cashAccount === 'currency'
        ? 'Обмен в валютную кассу сохранен ✓'
        : (window._cashAccount === 'currency-back'
          ? 'Возврат из валютной кассы сохранен ✓'
          : (window._cashAccount === 'currency-entry' ? 'Запись в валютную кассу сохранена ✓' : 'Записано в кассу ✓'))
    );
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

  if (currentRole === 'senior' || currentRole === 'extra' || canAccessPersonalCash()) {
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

    await refreshCurrentWorkerSalaryState();
    if (sourceSenior === currentWorkerName && typeof workerCashLog !== 'undefined') {
      await refreshCurrentWorkerCashState();
    }

    renderProfile();
    showToast('Зарплата успешно снята ✓');
  } catch (e) {
    showToast('Ошибка при снятии ЗП: ' + e.message, 'error');
  }
}


// ── LEGACY FALLBACK: НАЛИЧНАЯ ОПЛАТА ИЗ СТАРОГО ЗАКАЗА ───────
// Нужен только для старых заказов без clientPayments:
// если такой заказ помечают выполненным, а наличка уже внесена в debt,
// надо один раз донести эту сумму в кассу ответственного.

function isLegacyCashOnlyOrder(order) {
  if (!order) return false;
  const hasPaymentHistory = Array.isArray(order.clientPayments) && order.clientPayments.length > 0;
  if (hasPaymentHistory) return false;
  if (!isCashPaymentMethod(order.paymentMethod)) return false;
  return (Number(order.debt) || 0) > 0;
}

async function addLegacyCashFromCompletedOrder(order) {
  if (currentRole !== 'senior') return;
  if (!isLegacyCashOnlyOrder(order)) return;
  const amount = Number(order.debt) || 0;

  try {
    await sbInsertCashEntry({
      worker_name: currentWorkerName,
      amount,
      comment: `Заказ ${order.id} · клиент: ${order.client || '—'} · авто: ${order.car || order.client || ''}`,
    });
    await refreshCurrentWorkerCashState();
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
  const shiftBase = Number(typeof getShiftBaseAmount === 'function' ? getShiftBaseAmount(workerName) : 0) || 0;
  if (shiftBase) {
    parts.push({ label: 'Ставка по кнопке "Я на смене"', value: shiftBase.toLocaleString('ru') + ' ₴' });
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
    const personalRates = rule.serviceRates || {};
    const details = typeof getServiceTypeOptions === 'function'
      ? getServiceTypeOptions()
        .filter(item => item.salaryCategory !== 'special' && item.salaryCategory !== 'custom')
        .map(item => {
          const hasPersonalRate = Object.prototype.hasOwnProperty.call(personalRates, item.name);
          const adjustment = hasPersonalRate ? 0 : (Number(adj[item.salaryCategory]) || 0);
          const amount = (hasPersonalRate ? Number(personalRates[item.name]) : (Number(item.rate) || 0)) + adjustment;
          return `${item.name}: ${amount.toLocaleString('ru')} ₴`;
        })
        .join(', ')
      : '';
    parts.push({ label: 'Выбранные услуги', value: details || 'по прайсу' });
  }
  if (rule.moldingPct) {
    parts.push({ label: 'Молдинг', value: Math.round(rule.moldingPct * 100) + '%' });
  }
  const hasExtraWorkPct = rule && Object.prototype.hasOwnProperty.call(rule, 'extraWorkPct');
  const extraWorkPct = hasExtraWorkPct ? (Number(rule.extraWorkPct) || 0) : 0.2;
  parts.push({ label: 'Доп. работы', value: Math.round(extraWorkPct * 100) + '%' });
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
  if (shiftBase) formulaParts.push(shiftBase + ' ₴/смена');
  if (rule.baseIfResp) formulaParts.push(rule.baseIfResp + ' ₴ (если отв.)');
  if (rule.glassMarginPct) formulaParts.push('маржа × ' + Math.round(rule.glassMarginPct * 100) + '%');
  if (rule.moldingPct) formulaParts.push('молдинг × ' + Math.round(rule.moldingPct * 100) + '%');
  formulaParts.push('доп. работы × ' + Math.round(extraWorkPct * 100) + '%');
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
