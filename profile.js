// ============================================================
// PROFILE.JS — экран профиля специалиста (учёт зарплат)
// ============================================================

let workerSalaries = []; // { id, worker_name, date, amount }

async function loadWorkerSalaries() {
  if (currentRole === 'owner') return;
  try {
    workerSalaries = await sbFetchWorkerSalaries(currentWorkerName);
  } catch (e) {
    showToast('Ошибка загрузки зарплат: ' + e.message, 'error');
  }
}

function openProfileScreen() {
  renderProfile();
  showScreen('profile');
  setActiveNav('profile');
}

function renderProfile() {
  const today = new Date().toISOString().slice(0, 10);
  const currentYear  = today.slice(0, 4);
  const currentMonth = today.slice(0, 7);

  // Считаем итоги
  const monthTotal = workerSalaries
    .filter(s => s.date.startsWith(currentMonth))
    .reduce((sum, s) => sum + Number(s.amount), 0);

  const yearTotal = workerSalaries
    .filter(s => s.date.startsWith(currentYear))
    .reduce((sum, s) => sum + Number(s.amount), 0);

  // Группируем по месяцам → дням
  const byMonth = {};
  for (const s of workerSalaries) {
    const ym = s.date.slice(0, 7);
    if (!byMonth[ym]) byMonth[ym] = {};
    byMonth[ym][s.date] = s;
  }

  const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь',
    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

  const sortedMonths = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));

  // Проверяем есть ли запись за сегодня
  const todayEntry = workerSalaries.find(s => s.date === today);

  const el = document.getElementById('profile-content');
  el.innerHTML = `
    <!-- Шапка профиля -->
    <div class="profile-header">
      <div class="worker-avatar" style="width:56px;height:56px;font-size:20px;border-radius:16px;flex-shrink:0;">
        ${getInitials(currentWorkerName)}
      </div>
      <div>
        <div style="font-size:20px;font-weight:800;">${currentWorkerName}</div>
        <div style="font-size:13px;color:var(--text3);margin-top:2px;">${ROLE_LABELS[currentRole] || currentRole}</div>
      </div>
    </div>

    <!-- Карточки итогов -->
    <div class="profile-summary">
      <div class="profile-summary-card">
        <div class="profile-summary-label">За этот месяц</div>
        <div class="profile-summary-value">${monthTotal.toLocaleString('ru')} ₴</div>
      </div>
      <div class="profile-summary-card">
        <div class="profile-summary-label">За этот год</div>
        <div class="profile-summary-value">${yearTotal.toLocaleString('ru')} ₴</div>
      </div>
    </div>

    <!-- Ввод за сегодня -->
    <div class="profile-today-card">
      <div class="profile-today-label">
        <i data-lucide="calendar-check" style="width:15px;height:15px;"></i>
        Сегодня — ${formatDate(today)}
      </div>
      ${todayEntry
        ? `<div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;">
            <div style="font-size:22px;font-weight:800;color:var(--accent);">${Number(todayEntry.amount).toLocaleString('ru')} ₴</div>
            <div style="font-size:12px;color:var(--text3);">Зафиксировано</div>
          </div>`
        : `<div style="display:flex;gap:8px;margin-top:10px;">
            <input class="form-input" type="number" id="profile-salary-input"
              placeholder="Сумма за день (₴)" style="flex:1;">
            <button class="btn-primary" style="display:flex;align-items:center;gap:6px;white-space:nowrap;"
              onclick="saveTodaySalary()">
              <i data-lucide="save" style="width:14px;height:14px;"></i>
              Сохранить
            </button>
          </div>`
      }
    </div>

    <!-- История по месяцам -->
    <div style="display:flex;flex-direction:column;gap:12px;margin-top:4px;">
      ${sortedMonths.length ? sortedMonths.map(ym => {
        const [year, month] = ym.split('-');
        const monthName = MONTH_NAMES[parseInt(month) - 1];
        const days = Object.keys(byMonth[ym]).sort((a, b) => b.localeCompare(a));
        const monthSum = days.reduce((s, d) => s + Number(byMonth[ym][d].amount), 0);

        return `
          <div class="fin-month-card">
            <div class="fin-month-header" onclick="toggleProfileMonth('${ym}')">
              <div>
                <div class="fin-month-name">${monthName} ${year}</div>
                <div class="fin-month-sub">${days.length} дней</div>
              </div>
              <div style="display:flex;align-items:center;gap:14px;">
                <div style="font-size:18px;font-weight:800;color:var(--accent);">${monthSum.toLocaleString('ru')} ₴</div>
                <i data-lucide="chevron-down" style="width:16px;height:16px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${ym}"></i>
              </div>
            </div>
            <div id="profile-month-body-${ym}" style="display:none;padding:0 16px 16px;">
              ${days.map(date => {
                const entry = byMonth[ym][date];
                return `
                  <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
                    <div style="font-size:14px;color:var(--text2);">${formatDate(date)}</div>
                    <div style="font-weight:700;color:var(--accent);">${Number(entry.amount).toLocaleString('ru')} ₴</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('') : `
        <div class="empty-state">
          <div class="empty-state-icon">💰</div>
          <h3>Записей нет</h3>
          <p>Введите сумму за сегодня выше</p>
        </div>
      `}
    </div>
  `;

  initIcons();
}

function toggleProfileMonth(ym) {
  const body    = document.getElementById('profile-month-body-' + ym);
  const chevron = document.getElementById('pchevron-' + ym);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}

async function saveTodaySalary() {
  const input = document.getElementById('profile-salary-input');
  const amount = Number(input?.value);
  if (!amount || amount <= 0) {
    showToast('Введите сумму', 'error');
    input?.focus();
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  const btn = document.querySelector('[onclick="saveTodaySalary()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    const saved = await sbInsertWorkerSalary({
      worker_name: currentWorkerName,
      date: today,
      amount,
    });
    workerSalaries.push(saved);
    renderProfile();
    showToast('Зарплата сохранена ✓');
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="save" style="width:14px;height:14px;"></i> Сохранить'; initIcons(); }
  }
}
