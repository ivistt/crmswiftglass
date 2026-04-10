// ============================================================
// PROFILE.JS — экран профиля специалиста (учёт зарплат + касса)
// ============================================================

let workerSalaries = [];
let workerProblems = [];
let workerCashLog  = [];  // записи кассы текущего специалиста
let assistantWorkerSalaries = [];
let cashSearchQuery = '';

// ── ЗАГРУЗКА ─────────────────────────────────────────────────

async function loadWorkerSalaries() {
  if (currentRole === 'owner' || currentRole === 'manager') return;
  try {
    workerSalaries = await sbFetchWorkerSalaries(currentWorkerName);
    assistantWorkerSalaries = [];
    const assistant = getAttachedAssistantWorker();
    if (currentRole === 'senior' && assistant?.name) {
      assistantWorkerSalaries = await sbFetchWorkerSalaries(assistant.name);
    }
  } catch (e) {
    assistantWorkerSalaries = [];
    showToast('Ошибка загрузки зарплат: ' + e.message, 'error');
  }
}

async function loadWorkerCashLog() {
  if (currentRole !== 'senior') return;
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
  await loadWorkerCashLog();
  renderProfile();
  showScreen('profile');
  setActiveNav('profile');
}

// ── РЕНДЕР ПРОФИЛЯ ───────────────────────────────────────────

function renderProfile() {
  const el = document.getElementById('profile-content');

  if (currentRole === 'manager') {
    el.innerHTML = ''
      + '<div class="profile-header">'
      + '<div class="worker-avatar" style="width:56px;height:56px;font-size:20px;border-radius:16px;flex-shrink:0;">' + getInitials(currentWorkerName) + '</div>'
      + '<div><div style="font-size:20px;font-weight:800;">' + currentWorkerName + '</div>'
      + '<div style="font-size:13px;color:var(--text3);margin-top:2px;">' + (ROLE_LABELS[currentRole] || currentRole) + '</div></div>'
      + '</div>'
      + renderSalaryRuleCard(currentWorkerName)
      + '<div style="margin-top:12px;padding:16px;background:var(--surface2);border-radius:14px;text-align:center;color:var(--text3);font-size:14px;">'
      + 'Зарплата начисляется владельцем'
      + '</div>';
    initIcons();
    return;
  }

  const today = getLocalDateString();
  const attachedAssistant = getAttachedAssistantWorker();
  const relevantSalaryEntries = workerSalaries.filter(isRelevantSalaryEntry);
  const manualReports = relevantSalaryEntries.filter(isManualSalaryReportEntry);
  const accTotal = relevantSalaryEntries.reduce((sum, s) => sum + Number(s.amount), 0);
  const todayReport = manualReports.find(s => s.date === today) || null;
  const todayAmount = Number(todayReport?.amount) || 0;
  const todaySummary = getWorkerCompletedOrdersSummary(currentWorkerName, today);
  const salaryHistoryHtml = buildWorkerSalaryHistory(currentWorkerName, relevantSalaryEntries);
  const assistantRelevantEntries = assistantWorkerSalaries.filter(isRelevantSalaryEntry);
  const assistantManualReports = assistantRelevantEntries.filter(isManualSalaryReportEntry);
  const assistantTodayReport = attachedAssistant
    ? (assistantManualReports.find(s => s.date === today) || null)
    : null;
  const assistantTodayAmount = Number(assistantTodayReport?.amount) || 0;
  const assistantTodaySummary = attachedAssistant
    ? getWorkerCompletedOrdersSummary(attachedAssistant.name, today)
    : null;

  const cashBalance = calcCashBalance(workerCashLog);
  const cashHtml = currentRole === 'senior' ? renderCashSection(cashBalance, today) : '';
  const salaryRuleHtml = renderSalaryRuleCard(currentWorkerName);
  const todayOrdersHtml = renderSalaryOrdersList(todaySummary.orders);
  const salaryGroupHtml = ''
    + '<div class="profile-today-card" style="margin-top:12px;">'
    + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;">'
    + '<div>'
    + '<div class="profile-today-label"><i data-lucide="wallet-cards" style="width:15px;height:15px;"></i> Зарплата</div>'
    + '<div style="font-size:28px;font-weight:800;color:var(--accent);margin-top:4px;">' + accTotal.toLocaleString('ru') + ' \u20B4</div>'
    + '<div style="font-size:11px;color:var(--text3);">накопления</div>'
    + '</div>'
    + '<button class="btn-primary" style="padding:0 24px;min-height:44px;border-radius:14px;font-weight:800;" onclick="withdrawSalary()" ' + (accTotal <= 0 ? 'disabled' : '') + '>Снять ЗП</button>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:minmax(0,1fr);gap:12px;">'
    + (currentRole !== 'junior'
      ? renderTodaySalarySubmission(todayReport, todaySummary, {
          workerName: currentWorkerName,
          editable: true
        })
      : '')
    + '<div style="padding:14px;background:var(--surface2);border-radius:12px;border:1px solid var(--border);">'
    + '<div class="profile-today-label"><i data-lucide="calendar-check" style="width:15px;height:15px;"></i> Зарплата — ' + formatDate(today) + '</div>'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;">'
    + '<div style="font-size:24px;font-weight:800;color:var(--accent);">' + todayAmount.toLocaleString('ru') + ' \u20B4</div>'
    + '<div style="font-size:11px;color:var(--text3);padding:4px 10px;background:var(--surface3);border-radius:8px;">'
    + (currentRole === 'junior' ? 'записал старший' : 'записано')
    + '</div>'
    + '</div>'
    + '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:var(--text3);">'
    + '<span>Выполнено: ' + todaySummary.count + '</span>'
    + '</div>'
    + todayOrdersHtml
    + '</div>'
    + salaryRuleHtml
    + '<div>'
    + '<div style="font-size:12px;font-weight:700;color:var(--text3);margin-bottom:8px;letter-spacing:0.04em;">ИСТОРИЯ ЗАРПЛАТ</div>'
    + '<div style="display:flex;flex-direction:column;gap:12px;">' + salaryHistoryHtml + '</div>'
    + '</div>'
    + (currentRole === 'senior' && attachedAssistant
      ? renderAssistantSalarySection(attachedAssistant, assistantTodayReport, assistantTodaySummary, assistantTodayAmount)
      : '')
    + '</div>'
    + '</div>';

  el.innerHTML = ''
    + '<div class="profile-header">'
    + '<div class="worker-avatar" style="width:56px;height:56px;font-size:20px;border-radius:16px;flex-shrink:0;">' + getInitials(currentWorkerName) + '</div>'
    + '<div><div style="font-size:20px;font-weight:800;">' + currentWorkerName + '</div>'
    + '<div style="font-size:13px;color:var(--text3);margin-top:2px;">' + (ROLE_LABELS[currentRole] || currentRole) + '</div></div>'
    + '</div>'
    + cashHtml
    + salaryGroupHtml;

  initIcons();
}

function renderSalarySubmissionCard({ title, inputId, buttonLabel, buttonAction, value, disabled, hint, label = 'Сумма ЗП за сегодня' }) {
  return ''
    + '<div style="padding:14px;background:var(--surface2);border-radius:12px;border:1px solid var(--border);">'
    + '<div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:10px;letter-spacing:0.04em;">' + title + '</div>'
    + '<div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;">'
    + '<label style="flex:1;min-width:180px;display:flex;flex-direction:column;gap:6px;">'
    + '<span style="font-size:12px;color:var(--text3);">' + label + '</span>'
    + '<input class="form-input" type="number" id="' + inputId + '" placeholder="0" value="' + escapeHtml(String(value)) + '" ' + disabled + '>'
    + '</label>'
    + '<button class="btn-primary" style="min-height:44px;padding:0 24px;" onclick="' + buttonAction + '" ' + disabled + '>' + buttonLabel + '</button>'
    + '</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:8px;">' + hint + '</div>'
    + '</div>';
}

function renderTodaySalarySubmission(todayReport, todaySummary, options = {}) {
  const currentValue = Number(todayReport?.amount) || '';
  const editable = options.editable !== false;
  const disabled = !editable || todaySummary.count < 1 ? 'disabled' : '';
  const hint = !editable
    ? (options.readOnlyHint || 'Эту сумму вносит старший специалист')
    : (todaySummary.count < 1
      ? 'Сначала нужен хотя бы 1 выполненный заказ за сегодня'
      : `Выполнено ${todaySummary.count} заказ(ов) за сегодня`);

  if (!editable) {
    return ''
      + '<div style="padding:14px;background:var(--surface2);border-radius:12px;border:1px solid var(--border);">'
      + '<div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:10px;letter-spacing:0.04em;">СЕГОДНЯШНЯЯ ЗП</div>'
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">'
      + '<div>'
      + '<div style="font-size:12px;color:var(--text3);">Сумма за сегодня</div>'
      + '<div style="font-size:28px;font-weight:800;color:var(--accent);margin-top:4px;">' + Number(currentValue || 0).toLocaleString('ru') + ' \u20B4</div>'
      + '</div>'
      + '<div style="font-size:11px;color:var(--text3);padding:4px 10px;background:var(--surface3);border-radius:8px;">заполняет старший</div>'
      + '</div>'
      + '<div style="font-size:11px;color:var(--text3);margin-top:8px;">' + hint + '</div>'
      + '</div>';
  }

  return renderSalarySubmissionCard({
    title: 'ВНЕСТИ СЕГОДНЯШНЮЮ ЗП',
    inputId: 'today-salary-input',
    buttonLabel: 'Сохранить',
    buttonAction: 'saveTodaySalaryReport()',
    value: currentValue,
    disabled,
    hint
  });
}

function renderAssistantSalarySection(assistantWorker, todayReport, todaySummary, todayAmount) {
  return ''
    + '<div style="padding:14px;background:rgba(29,233,182,.06);border-radius:12px;border:1px solid rgba(29,233,182,.2);">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;">'
    + '<div>'
    + '<div style="font-size:12px;font-weight:700;color:var(--text2);letter-spacing:0.04em;">ПОМОЩНИК</div>'
    + '<div style="font-size:20px;font-weight:800;color:var(--text1);margin-top:4px;">' + escapeHtml(assistantWorker.name) + '</div>'
    + '</div>'
    + '<div style="font-size:11px;color:var(--text3);padding:4px 10px;background:rgba(255,255,255,.04);border-radius:999px;">прикреплён к вам</div>'
    + '</div>'
    + renderSalarySubmissionCard({
      title: 'ВНЕСТИ СЕГОДНЯШНЮЮ ЗП ПОМОЩНИКУ',
      inputId: 'assistant-today-salary-input',
      buttonLabel: 'Сохранить',
      buttonAction: 'saveAssistantTodaySalaryReport()',
      value: Number(todayReport?.amount) || '',
      disabled: todaySummary.count < 1 ? 'disabled' : '',
      hint: todaySummary.count < 1
        ? 'У помощника пока нет выполненных заказов за сегодня'
        : `У помощника выполнено ${todaySummary.count} заказ(ов) за сегодня`,
      label: 'Сумма ЗП помощнику за сегодня'
    })
    + '<div style="padding:14px;margin-top:12px;background:var(--surface2);border-radius:12px;border:1px solid var(--border);">'
    + '<div class="profile-today-label"><i data-lucide="calendar-check" style="width:15px;height:15px;"></i> ЗП помощника — ' + formatDate(getLocalDateString()) + '</div>'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;">'
    + '<div style="font-size:24px;font-weight:800;color:var(--accent);">' + todayAmount.toLocaleString('ru') + ' \u20B4</div>'
    + '<div style="font-size:11px;color:var(--text3);padding:4px 10px;background:var(--surface3);border-radius:8px;">записано вами</div>'
    + '</div>'
    + '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:var(--text3);">'
    + '<span>Выполнено: ' + todaySummary.count + '</span>'
    + '</div>'
    + renderSalaryOrdersList(todaySummary.orders)
    + '</div>'
    + '</div>';
}

function getAttachedAssistantWorker() {
  if (currentRole !== 'senior') return null;
  const seniorWorker = (workers || []).find(w => w.systemRole === 'senior' && w.name === currentWorkerName);
  if (!seniorWorker?.assistant) return null;
  return (workers || []).find(w => w.name === seniorWorker.assistant) || null;
}

function renderSalaryOrdersList(orderItems) {
  if (!orderItems || !orderItems.length) {
    return '<div style="font-size:12px;color:var(--text3);margin-top:8px;">Заказов нет</div>';
  }
  return '<div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;">'
    + orderItems.map(item => '<div style="font-size:12px;color:var(--text3);">'
      + escapeHtml(item.id) + ' · ' + escapeHtml(item.car || '—')
      + '</div>').join('')
    + '</div>';
}

function buildWorkerSalaryHistory(workerName, entries) {
  const reportEntries = (entries || []).filter(isRelevantSalaryEntry);
  const byMonth = {};

  for (const entry of reportEntries) {
    const ym = entry.date.slice(0, 7);
    if (!byMonth[ym]) byMonth[ym] = {};
    if (!byMonth[ym][entry.date]) byMonth[ym][entry.date] = [];
    byMonth[ym][entry.date].push(entry);
  }

  const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь',
    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const sortedMonths = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));

  if (!sortedMonths.length) {
    return '<div class="empty-state"><div class="empty-state-icon">💰</div><h3>Записей нет</h3>'
      + '<p>Дневная зарплата появится здесь после сохранения</p></div>';
  }

  return sortedMonths.map(ym => {
    const parts = ym.split('-');
    const monthName = MONTH_NAMES[parseInt(parts[1]) - 1];
    const days = Object.keys(byMonth[ym]).sort((a, b) => b.localeCompare(a));
    const monthSum = days.reduce((sum, date) => sum + byMonth[ym][date].reduce((acc, e) => acc + Number(e.amount), 0), 0);

    const daysHtml = days.map(date => {
      const dateEntries = byMonth[ym][date];
      const report = dateEntries.find(isManualSalaryReportEntry) || null;
      const withdrawals = dateEntries.filter(isSalaryWithdrawalEntry);
      const summary = getWorkerCompletedOrdersSummary(workerName, date);
      const reportAmount = Number(report?.amount) || 0;
      const withdrawalsAmount = withdrawals.reduce((sum, entry) => sum + Number(entry.amount), 0);
      const totalForDay = reportAmount + withdrawalsAmount;
      const ordersHtml = renderSalaryOrdersList(summary.orders);
      const withdrawalsHtml = withdrawals.length
        ? '<div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">'
          + withdrawals.map(entry => '<div style="font-size:12px;color:#ef4444;">'
            + escapeHtml(entry.order_id || 'Выплата') + ': ' + Number(entry.amount).toLocaleString('ru') + ' ₴'
            + '</div>').join('')
          + '</div>'
        : '';

      return '<div style="padding:12px 0;border-bottom:1px solid var(--border);">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px;">'
        + '<div style="font-size:14px;color:var(--text2);font-weight:600;">' + formatDate(date) + '</div>'
        + '<div style="font-weight:800;color:var(--accent);">' + totalForDay.toLocaleString('ru') + ' \u20B4</div>'
        + '</div>'
        + '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--text3);">'
        + '<span>Выполнено: ' + summary.count + '</span>'
        + '<span>ЗП: ' + reportAmount.toLocaleString('ru') + ' \u20B4</span>'
        + '</div>'
        + ordersHtml
        + withdrawalsHtml
        + '</div>';
    }).join('');

    return '<div class="fin-month-card">'
      + '<div class="fin-month-header" onclick="toggleProfileMonth(\'sal-' + ym + '\')">'
      + '<div><div class="fin-month-name">' + monthName + ' ' + parts[0] + '</div>'
      + '<div class="fin-month-sub">' + days.length + ' дней</div></div>'
      + '<div style="display:flex;align-items:center;gap:14px;">'
      + '<div style="font-size:18px;font-weight:800;color:var(--accent);">' + monthSum.toLocaleString('ru') + ' \u20B4</div>'
      + '<i data-lucide="chevron-down" style="width:16px;height:16px;color:var(--text3);transition:transform 0.2s;" id="pchevron-sal-' + ym + '"></i>'
      + '</div></div>'
      + '<div id="profile-month-body-sal-' + ym + '" style="display:none;padding:0 16px 16px;">' + daysHtml + '</div>'
      + '</div>';
  }).join('');
}

// ── КАССА — РЕНДЕР СЕКЦИИ ────────────────────────────────────
// Разбита на: Текущая (сегодня) + Архив (года → месяцы → дни)

function renderCashSection(balance, today) {
  const balanceColor = balance >= 0 ? 'var(--accent)' : '#ef4444';
  const filteredLog = _filterCashLogByComment(workerCashLog, cashSearchQuery);

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
    + '<div class="profile-today-label"><i data-lucide="wallet" style="width:15px;height:15px;"></i> Касса (наличка)</div>'
    + '<div style="font-size:28px;font-weight:800;color:' + balanceColor + ';margin-top:4px;">' + balance.toLocaleString('ru') + ' \u20B4</div>'
    + '<div style="font-size:11px;color:var(--text3);">общий баланс</div>'
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">'
    + '<button class="btn-secondary" style="font-size:12px;padding:6px 10px;" onclick="openCashEntryModal()">+ Запись</button>'
    + '</div>'
    + '</div>'

    + '<div style="margin-bottom:14px;">'
    + '<input class="form-input" type="text" placeholder="Поиск по комментарию..." value="' + escapeHtml(cashSearchQuery) + '" oninput="setCashSearchQuery(this.value)">'
    + '</div>'

    // ── ТЕКУЩАЯ КАССА (сегодня) ──
    + '<div style="margin-bottom:16px;">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
    + '<div style="font-size:12px;font-weight:700;color:var(--text3);letter-spacing:0.04em;">📅 СЕГОДНЯ</div>'
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

function setCashSearchQuery(value) {
  cashSearchQuery = value || '';
  renderProfile();
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

function openCashEntryModal() {
  let modal = document.getElementById('cash-entry-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'cash-entry-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:400px;">
        <div class="modal-header">
          <div class="modal-title">💵 Запись в кассу</div>
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
                placeholder="Напр. куплен клей, заказ SG-0042...">
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
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    const entry = await sbInsertCashEntry({
      worker_name: currentWorkerName,
      amount,
      comment: comment || null,
    });
    workerCashLog.unshift(entry);
    closeCashEntryModal();
    renderProfile();
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

async function saveTodaySalaryReport() {
  const today = getLocalDateString();
  const summary = getWorkerCompletedOrdersSummary(currentWorkerName, today);
  if (summary.count < 1) {
    showToast('Нет выполненных заказов за сегодня', 'error');
    return;
  }

  const input = document.getElementById('today-salary-input');
  const amount = Number(input?.value);
  if (!amount || amount <= 0) {
    showToast('Введите сумму ЗП', 'error');
    return;
  }

  const existing = workerSalaries.find(entry => isManualSalaryReportEntry(entry) && entry.date === today);

  try {
    if (existing) {
      const updated = await sbUpdateWorkerSalary(existing.id, amount);
      const idx = workerSalaries.findIndex(entry => entry.id === existing.id);
      if (idx !== -1) workerSalaries[idx] = updated || { ...existing, amount };
    } else {
      const created = await sbInsertWorkerSalary({
        worker_name: currentWorkerName,
        amount,
        date: today,
        order_id: MANUAL_SALARY_REPORT_ORDER_ID,
      });
      if (created) workerSalaries.unshift(created);
    }

    renderProfile();
    showToast('Дневная ЗП сохранена ✓');
  } catch (e) {
    showToast('Ошибка сохранения ЗП: ' + e.message, 'error');
  }
}

async function saveAssistantTodaySalaryReport() {
  const assistant = getAttachedAssistantWorker();
  if (currentRole !== 'senior' || !assistant?.name) {
    showToast('Помощник не найден', 'error');
    return;
  }

  const today = getLocalDateString();
  const summary = getWorkerCompletedOrdersSummary(assistant.name, today);
  if (summary.count < 1) {
    showToast('У помощника нет выполненных заказов за сегодня', 'error');
    return;
  }

  const input = document.getElementById('assistant-today-salary-input');
  const amount = Number(input?.value);
  if (!amount || amount <= 0) {
    showToast('Введите сумму ЗП помощнику', 'error');
    return;
  }

  const existing = assistantWorkerSalaries.find(entry => isManualSalaryReportEntry(entry) && entry.date === today);

  try {
    if (existing) {
      const updated = await sbUpdateWorkerSalary(existing.id, amount);
      const idx = assistantWorkerSalaries.findIndex(entry => entry.id === existing.id);
      if (idx !== -1) assistantWorkerSalaries[idx] = updated || { ...existing, amount };
    } else {
      const created = await sbInsertWorkerSalary({
        worker_name: assistant.name,
        amount,
        date: today,
        order_id: MANUAL_SALARY_REPORT_ORDER_ID,
      });
      if (created) assistantWorkerSalaries.unshift(created);
    }

    renderProfile();
    showToast('ЗП помощнику сохранена ✓');
  } catch (e) {
    showToast('Ошибка сохранения ЗП помощнику: ' + e.message, 'error');
  }
}

// ── СНЯТЬ ЗАРПЛАТУ ───────────────────────────────────────────

async function withdrawSalary() {
  const accTotal = workerSalaries
    .filter(isRelevantSalaryEntry)
    .reduce((sum, s) => sum + Number(s.amount), 0);
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
    
    // 1. Снимаем сумму из кассы старшего (sourceSenior)
    const cashEntry = await sbInsertCashEntry({
      worker_name: sourceSenior,
      amount: -amount,
      comment: recipient === sourceSenior ? 'Снятие ЗП' : `Снятие ЗП - ${recipient}`
    });
    
    // 2. Добавляем отрицательную запись в зарплату получателя (recipient)
    const salaryEntry = await sbInsertWorkerSalary({
      worker_name: recipient,
      amount: -amount,
      date: today,
      order_id: SALARY_WITHDRAWAL_ORDER_ID
    });
    
    if (recipient === currentWorkerName) {
      workerSalaries.unshift(salaryEntry);
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
  if (currentRole !== 'senior') return;
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
  if (rule.baseIfResp) {
    parts.push({ label: 'Доплата за день (если ответственный)', value: rule.baseIfResp.toLocaleString('ru') + ' ₴' });
  }
  if (rule.glassMarginPct) {
    parts.push({ label: 'Маржа стекла', value: Math.round(rule.glassMarginPct * 100) + '%' });
  }
  if (rule.servicesPct) {
    parts.push({ label: 'Услуги (монтаж и др.)', value: Math.round(rule.servicesPct * 100) + '%' });
  }
  if (rule.tatuBonusPct) {
    parts.push({ label: 'Бонус тату', value: Math.round(rule.tatuBonusPct * 100) + '%' });
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
  if (rule.baseIfResp) formulaParts.push(rule.baseIfResp + ' ₴ (если отв.)');
  if (rule.glassMarginPct) formulaParts.push('маржа × ' + Math.round(rule.glassMarginPct * 100) + '%');
  if (rule.servicesPct) formulaParts.push('услуги × ' + Math.round(rule.servicesPct * 100) + '%');
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
