// ============================================================
// PROFILE.JS — экран профиля специалиста (учёт зарплат + касса)
// ============================================================

let workerSalaries = [];
let workerProblems = [];
let workerCashLog  = [];  // записи кассы текущего специалиста

// ── ЗАГРУЗКА ─────────────────────────────────────────────────

async function loadWorkerSalaries() {
  if (currentRole === 'owner' || currentRole === 'manager') return;
  try {
    workerSalaries = await sbFetchWorkerSalaries(currentWorkerName);
  } catch (e) {
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
      + '<div style="margin-top:24px;padding:16px;background:var(--surface2);border-radius:14px;text-align:center;color:var(--text3);font-size:14px;">'
      + 'Зарплата менеджера устанавливается владельцем'
      + '</div>';
    initIcons();
    return;
  }

  const _now = new Date();
  const today = _now.getFullYear() + '-'
    + String(_now.getMonth() + 1).padStart(2, '0') + '-'
    + String(_now.getDate()).padStart(2, '0');
  const currentYear  = today.slice(0, 4);
  const currentMonth = today.slice(0, 7);

  const monthTotal = workerSalaries
    .filter(s => s.date.startsWith(currentMonth))
    .reduce((sum, s) => sum + Number(s.amount), 0);

  const yearTotal = workerSalaries
    .filter(s => s.date.startsWith(currentYear))
    .reduce((sum, s) => sum + Number(s.amount), 0);

  const todayAmount = workerSalaries
    .filter(s => s.date === today)
    .reduce((sum, s) => sum + Number(s.amount), 0);

  // История зарплат
  const byMonth = {};
  for (const s of workerSalaries.filter(s => s && Number(s.amount) > 0)) {
    const ym = s.date.slice(0, 7);
    if (!byMonth[ym]) byMonth[ym] = {};
    if (!byMonth[ym][s.date]) byMonth[ym][s.date] = [];
    byMonth[ym][s.date].push(s);
  }

  const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь',
    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

  const sortedMonths = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));

  let salaryHistoryHtml = '';
  if (sortedMonths.length) {
    salaryHistoryHtml = sortedMonths.map(ym => {
      const parts     = ym.split('-');
      const monthName = MONTH_NAMES[parseInt(parts[1]) - 1];
      const days      = Object.keys(byMonth[ym]).sort((a, b) => b.localeCompare(a));
      const monthSum  = days.reduce((s, d) => s + byMonth[ym][d].reduce((a, e) => a + Number(e.amount), 0), 0);

      const daysHtml = days.map(date => {
        const entries = byMonth[ym][date];
        const daySum  = entries.reduce((s, e) => s + Number(e.amount), 0);
        const ordersHtml = entries.filter(Boolean).map(e => {
          const order = orders.find(o => o.id === e.order_id);
          const label = order
            ? `${order.id} · ${order.car || order.client || '—'}`
            : (e.order_id ? e.order_id : 'Начисление');
          return '<div style="display:flex;justify-content:space-between;align-items:center;'
            + 'padding:6px 0 6px 12px;border-left:2px solid var(--border);">'
            + '<div style="font-size:12px;color:var(--text3);">' + label + '</div>'
            + '<div style="font-size:13px;font-weight:700;color:var(--accent);">' + Number(e.amount).toLocaleString('ru') + ' \u20B4</div>'
            + '</div>';
        }).join('');

        return '<div style="padding:10px 0;border-bottom:1px solid var(--border);">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
          + '<div style="font-size:14px;color:var(--text2);font-weight:600;">' + formatDate(date) + '</div>'
          + '<div style="font-weight:800;color:var(--accent);">' + daySum.toLocaleString('ru') + ' \u20B4</div>'
          + '</div>'
          + ordersHtml
          + '</div>';
      }).join('');

      return '<div class="fin-month-card">'
        + '<div class="fin-month-header" onclick="toggleProfileMonth(\'sal-' + ym + '\')">'
        + '<div><div class="fin-month-name">' + monthName + ' ' + parts[0] + '</div>'
        + '<div class="fin-month-sub">' + entries_count(byMonth[ym]) + ' заказов</div></div>'
        + '<div style="display:flex;align-items:center;gap:14px;">'
        + '<div style="font-size:18px;font-weight:800;color:var(--accent);">' + monthSum.toLocaleString('ru') + ' \u20B4</div>'
        + '<i data-lucide="chevron-down" style="width:16px;height:16px;color:var(--text3);transition:transform 0.2s;" id="pchevron-sal-' + ym + '"></i>'
        + '</div></div>'
        + '<div id="profile-month-body-sal-' + ym + '" style="display:none;padding:0 16px 16px;">' + daysHtml + '</div>'
        + '</div>';
    }).join('');
  } else {
    salaryHistoryHtml = '<div class="empty-state"><div class="empty-state-icon">💰</div><h3>Записей нет</h3>'
      + '<p>ЗП начислится автоматически после отметки выполненных заказов</p></div>';
  }

  const cashBalance = calcCashBalance(workerCashLog);
  const cashHtml = currentRole === 'senior' ? renderCashSection(cashBalance, today) : '';

  el.innerHTML = ''
    + '<div class="profile-header">'
    + '<div class="worker-avatar" style="width:56px;height:56px;font-size:20px;border-radius:16px;flex-shrink:0;">' + getInitials(currentWorkerName) + '</div>'
    + '<div><div style="font-size:20px;font-weight:800;">' + currentWorkerName + '</div>'
    + '<div style="font-size:13px;color:var(--text3);margin-top:2px;">' + (ROLE_LABELS[currentRole] || currentRole) + '</div></div>'
    + '</div>'

    + '<div class="profile-summary">'
    + '<div class="profile-summary-card"><div class="profile-summary-label">За этот месяц</div>'
    + '<div class="profile-summary-value">' + monthTotal.toLocaleString('ru') + ' \u20B4</div></div>'
    + '<div class="profile-summary-card"><div class="profile-summary-label">За этот год</div>'
    + '<div class="profile-summary-value">' + yearTotal.toLocaleString('ru') + ' \u20B4</div></div>'
    + '</div>'

    + cashHtml

    + '<div class="profile-today-card">'
    + '<div class="profile-today-label"><i data-lucide="calendar-check" style="width:15px;height:15px;"></i> Зарплата — ' + formatDate(today) + '</div>'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;">'
    + '<div style="font-size:24px;font-weight:800;color:var(--accent);">' + todayAmount.toLocaleString('ru') + ' \u20B4</div>'
    + '<div style="font-size:11px;color:var(--text3);padding:4px 10px;background:var(--surface2);border-radius:8px;">авто</div>'
    + '</div></div>'

    + '<div style="font-size:13px;font-weight:700;color:var(--text3);margin-top:8px;margin-bottom:4px;letter-spacing:0.04em;">ИСТОРИЯ ЗАРПЛАТ</div>'
    + '<div style="display:flex;flex-direction:column;gap:12px;">' + salaryHistoryHtml + '</div>';

  initIcons();
}

// ── КАССА — РЕНДЕР СЕКЦИИ ────────────────────────────────────
// Разбита на: Текущая (сегодня) + Архив (года → месяцы → дни)

function renderCashSection(balance, today) {
  const balanceColor = balance >= 0 ? 'var(--accent)' : '#ef4444';

  // Разделяем лог на сегодня и архив
  const todayLog   = workerCashLog.filter(e => _cashEntryDate(e) === today);
  const archiveLog = workerCashLog.filter(e => _cashEntryDate(e) !== today);

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
    + '<button class="btn-secondary" style="font-size:12px;padding:6px 10px;color:#ef4444;border-color:#ef4444;" onclick="submitCash()">Сдать кассу</button>'
    + '</div>'
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
    + (archiveLog.length ? archiveHtml : '<div style="text-align:center;color:var(--text3);font-size:13px;padding:10px 0;">Архив пуст</div>')
    + '</div>'

    + '</div>';
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

// ── СДАТЬ КАССУ ──────────────────────────────────────────────

async function submitCash() {
  const balance = calcCashBalance(workerCashLog);
  if (balance === 0) {
    showToast('Касса уже пустая', 'error');
    return;
  }
  if (!confirm(`Сдать кассу? Текущий баланс ${balance.toLocaleString('ru')} ₴ будет обнулён.`)) return;

  try {
    const entry = await sbInsertCashEntry({
      worker_name: currentWorkerName,
      amount: -balance,
      comment: 'Сдача кассы',
    });
    workerCashLog.unshift(entry);
    renderProfile();
    showToast('Касса сдана ✓');
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
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
