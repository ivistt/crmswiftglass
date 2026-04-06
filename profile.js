// ============================================================
// PROFILE.JS — экран профиля специалиста (учёт зарплат)
// ============================================================

let workerSalaries = [];
let workerProblems = [];
let currentCash    = 0;

async function loadWorkerSalaries() {
  if (currentRole === 'owner' || currentRole === 'manager') return;
  try {
    workerSalaries = await sbFetchWorkerSalaries(currentWorkerName);
  } catch (e) {
    showToast('Ошибка загрузки зарплат: ' + e.message, 'error');
  }
}

async function loadWorkerProblems() {}

function loadCash() {
  const raw = localStorage.getItem(`cash_${currentWorkerName}`) || '0';
  currentCash = Number(raw) || 0;
}

function saveCash() {
  const val = Number(document.getElementById('cash-input')?.value) || 0;
  currentCash = val;
  localStorage.setItem(`cash_${currentWorkerName}`, String(val));
  showToast('Касса обновлена');
  renderProfile();
}

function openProfileScreen() {
  loadCash();
  renderProfile();
  showScreen('profile');
  setActiveNav('profile');
}

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

  // Суммы из записей worker_salaries
  const monthTotal = workerSalaries
    .filter(s => s.date.startsWith(currentMonth))
    .reduce((sum, s) => sum + Number(s.amount), 0);

  const yearTotal = workerSalaries
    .filter(s => s.date.startsWith(currentYear))
    .reduce((sum, s) => sum + Number(s.amount), 0);

  // Сегодняшняя ЗП — из записей по заказам за сегодня
  const todayAmount = workerSalaries
    .filter(s => s.date === today)
    .reduce((sum, s) => sum + Number(s.amount), 0);

  // История: группируем по месяцам → дням → заказам
  // workerSalaries: { id, worker_name, date, amount, order_id }
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

    + (currentRole === 'senior'
      ? '<div class="profile-today-card" style="margin-top:12px;">'
        + '<div class="profile-today-label"><i data-lucide="wallet" style="width:15px;height:15px;"></i> Касса (наличка)</div>'
        + '<div style="display:flex;align-items:center;gap:10px;margin-top:8px;">'
        + '<input id="cash-input" class="form-input" type="number" value="' + currentCash + '" style="flex:1;" placeholder="0" />'
        + '<button class="btn-secondary" onclick="saveCash()">Сохранить</button>'
        + '</div>'
        + '<div style="font-size:12px;color:var(--text3);margin-top:6px;">Сумма переносится на следующий день автоматически</div>'
        + '</div>'
      : '')

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

function entries_count(dayMap) {
  return Object.values(dayMap).reduce((s, arr) => s + arr.length, 0);
}

function toggleProfileMonth(key) {
  const body    = document.getElementById('profile-month-body-' + key);
  const chevron = document.getElementById('pchevron-' + key);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}
