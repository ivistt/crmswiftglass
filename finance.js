// ============================================================
// FINANCE.JS — экран финансов (только для owner)
// ============================================================

// Хранилище зарплат: { 'YYYY-MM': { 'workerName': amount } }
let salaryData = {};

function renderFinance() {
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
  let total = 0;
  const months = ym ? [ym] : Object.keys(salaryData);
  for (const m of months) {
    if (!salaryData[m]) continue;
    for (const name of Object.keys(salaryData[m])) {
      total += Number(salaryData[m][name]) || 0;
    }
  }
  return total;
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

        <!-- Зарплаты -->
        <div class="fin-section-title" style="margin-top:16px;">
          💰 Зарплаты
          <button class="fin-add-salary-btn" onclick="openSalaryModal('${ym}')">
            <i data-lucide="plus" style="width:12px;height:12px;"></i> Добавить
          </button>
        </div>
        <div id="fin-salaries-${ym}">
          ${renderSalaryRows(ym)}
        </div>

      </div>
    </div>
  `;
}

function renderSalaryRows(ym) {
  const data = salaryData[ym] || {};
  const names = Object.keys(data);

  if (!names.length) {
    return `<div style="font-size:13px;color:var(--text3);padding:10px 0;">
      Зарплаты не добавлены
    </div>`;
  }

  return names.map(name => `
    <div class="fin-salary-row">
      <div class="fin-salary-worker">
        <div class="worker-avatar" style="width:32px;height:32px;font-size:12px;border-radius:10px;">${getInitials(name)}</div>
        <span>${name}</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-weight:700;color:var(--yellow);">${Number(data[name]).toLocaleString('ru')} ₴</span>
        <button class="icon-btn" style="width:28px;height:28px;border-radius:7px;" onclick="deleteSalary('${ym}','${name}')">
          <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
        </button>
      </div>
    </div>
  `).join('');
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

// ============================================================
// МОДАЛ ЗАРПЛАТ
// ============================================================

let _salaryModalYm = null;

function openSalaryModal(ym) {
  _salaryModalYm = ym;
  const sel = document.getElementById('salary-worker-select');
  if (sel) {
    sel.innerHTML = '<option value="">— выбрать сотрудника —</option>' +
      workers.map(w => `<option value="${w.name}">${w.name}</option>`).join('');
  }
  if (document.getElementById('salary-amount')) {
    document.getElementById('salary-amount').value = '';
  }
  document.getElementById('salary-modal').classList.add('active');
  initIcons();
}

function closeSalaryModal() {
  document.getElementById('salary-modal').classList.remove('active');
}

function saveSalary() {
  const ym     = _salaryModalYm;
  const worker = document.getElementById('salary-worker-select').value;
  const amount = Number(document.getElementById('salary-amount').value);

  if (!worker) { alert('Выберите сотрудника'); return; }
  if (!amount) { alert('Введите сумму'); return; }

  if (!salaryData[ym]) salaryData[ym] = {};
  salaryData[ym][worker] = (salaryData[ym][worker] || 0) + amount;

  closeSalaryModal();
  // Перерисовываем строки зарплат и итог
  const salEl = document.getElementById('fin-salaries-' + ym);
  if (salEl) salEl.innerHTML = renderSalaryRows(ym);
  showToast('Зарплата добавлена ✓');
  initIcons();
}

function deleteSalary(ym, workerName) {
  if (!salaryData[ym]) return;
  delete salaryData[ym][workerName];
  const salEl = document.getElementById('fin-salaries-' + ym);
  if (salEl) salEl.innerHTML = renderSalaryRows(ym);
  showToast('Удалено');
  initIcons();
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
