// ============================================================
// APP.JS — навигация, главный экран
// ============================================================

let currentMonthFilter = null;
let ownerPaymentFilters = { client: true, supplier: true };

// Fallback если data.js старой версии (без carDirectory)
if (typeof carDirectory === 'undefined') {
  window.carDirectory = [];
}

async function initApp() {
  const minDelay = new Promise(r => setTimeout(r, 2000));
  const tasks = [loadOrders(), loadWorkers(), loadRefData(), loadWorkerSalaries(), minDelay];
  if (typeof loadManualClients === 'function' && canViewClients()) {
    tasks.push(loadManualClients());
  }
  if (currentRole === 'owner') {
    tasks.push((async () => {
      try { window.allCashLog = await sbFetchAllCashLog(); } catch(e) { window.allCashLog = []; }
    })());
    tasks.push((async () => {
      try {
        if (typeof loadAllSalaries === 'function') await loadAllSalaries();
      } catch (e) {
        if (typeof allSalaries !== 'undefined') allSalaries = [];
      }
    })());
  }
  await Promise.all(tasks);
  updateNavbarVisibility();
  if (currentRole === 'owner') {
    renderHome();
    showScreen('home');
    setActiveNav('home');
  } else {
    openOrdersScreen();
  }
  const loader = document.getElementById('app-loading');
  if (loader) {
    loader.classList.add('hiding');
    setTimeout(() => loader.remove(), 400);
  }
}

function updateNavbarVisibility() {
  const navClients = document.getElementById('nav-clients');
  const navWorkers = document.getElementById('nav-workers');
  const navHome    = document.getElementById('nav-home');
  const bottomNav  = document.getElementById('bottom-navbar');

  const navCash    = document.getElementById('nav-cash');
  const navProfile = document.getElementById('nav-profile');

  if (currentRole === 'owner') {
    // Владелец: Главная + Записи (без клиентов и команды)
    if (bottomNav)  bottomNav.style.display  = '';
    if (navHome)    navHome.style.display    = '';
    if (navCash)    navCash.style.display    = 'none';
    if (navProfile) navProfile.style.display = 'none';
    if (navClients) navClients.style.display = 'none';
    if (navWorkers) navWorkers.style.display = 'none';
    document.getElementById('app')?.classList.remove('no-navbar');
  } else if (currentRole === 'manager') {
    // Менеджер: Записи
    if (bottomNav)  bottomNav.style.display  = '';
    if (navHome)    navHome.style.display    = 'none';
    if (navCash)    navCash.style.display    = 'none';
    if (navProfile) navProfile.style.display = 'none';
    if (navClients) navClients.style.display = canViewClients() ? '' : 'none';
    if (navWorkers) navWorkers.style.display = 'none';
    document.getElementById('app')?.classList.remove('no-navbar');
  } else {
    // Специалисты: Записи + Касса + ЗП (без кнопки добавить)
    if (navClients) navClients.style.display = 'none';
    if (navWorkers) navWorkers.style.display = 'none';
    if (bottomNav) bottomNav.style.display = '';
    if (navHome)   navHome.style.display   = 'none';
    if (navCash)   navCash.style.display   = '';
    if (navProfile) navProfile.style.display = '';
    document.getElementById('app')?.classList.remove('no-navbar');
  }
}

function setActiveNav(name) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const map = { home: 'nav-home', months: 'nav-orders', orders: 'nav-orders', clients: 'nav-clients', workers: 'nav-workers', cash: 'nav-cash', profile: 'nav-profile', 'owner-today': 'nav-home' };
  const id = map[name];
  if (id) { const el = document.getElementById(id); if (el) el.classList.add('active'); }
}

function navTo(section) {
  if (section === 'home') { goHome(); }
  else if (section === 'orders') { openOrdersScreen(); }
  else if (section === 'clients') { openClientsScreen(); }
  else if (section === 'workers') { openWorkersScreen(); }
  else if (section === 'cash') { openCashScreen(); }
  else if (section === 'profile') { openProfileScreen(); }
}

function openFinanceScreen() {
  if (!canViewFinance()) return;
  renderFinance();
  showScreen('finance');
}

function openOwnerCashScreen() {
  if (currentRole !== 'owner') return;
  renderOwnerCashScreen();
  showScreen('owner-cash');
}

function openOwnerPaymentsScreen() {
  if (currentRole !== 'owner') return;
  renderOwnerPaymentsScreen();
  showScreen('owner-payments');
}

function openOwnerTodayScreen() {
  if (currentRole !== 'owner') return;
  renderOwnerTodayScreen();
  showScreen('owner-today');
}

// --- ЗАГРУЗКА ЗАКАЗОВ ---
async function loadOrders() {
  const btn = document.getElementById('refresh-btn');
  if (btn) { btn.innerHTML = '<i data-lucide="loader" style="width:15px;height:15px;"></i>'; btn.disabled = true; initIcons(); }
  try {
    orders = await sbFetchOrders();
  } catch (e) {
    showToast('Ошибка загрузки: ' + e.message, 'error');
  } finally {
    if (btn) { btn.innerHTML = '<i data-lucide="refresh-cw" style="width:15px;height:15px;"></i>'; btn.disabled = false; initIcons(); }
  }
}

async function refreshOrders() {
  window.location.reload();
}

// --- НАВИГАЦИЯ ---
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('active');
  updateHomeBackLabels();

  setActiveNav(name);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateHomeBackLabels() {
  const label = 'Назад';
  document.querySelectorAll('[data-back-home-label]').forEach(el => {
    el.textContent = label;
  });
}

function goHome() {
  if (currentRole === 'owner') {
    renderHome();
    showScreen('home');
  } else {
    openOrdersScreen();
  }
}

// --- ГЛАВНЫЙ ЭКРАН ---
function renderHome() {
  const name = currentWorkerName || '';
  const greetings = {
    owner:   'Добро пожаловать, ' + (name || 'Владелец'),
    manager: 'Добро пожаловать, ' + (name || 'Менеджер'),
    senior:  'Добро пожаловать, ' + (name || 'Специалист'),
    junior:  'Добро пожаловать' + (name ? ', ' + name : ''),
  };
  document.getElementById('home-greeting').textContent = greetings[currentRole] || 'Добро пожаловать';
  document.getElementById('screen-home')?.classList.toggle('owner-dashboard-screen', currentRole === 'owner');

  const container = document.getElementById('home-cards');
  container.classList.toggle('owner-dashboard-cards', currentRole === 'owner');
  container.innerHTML = '';

  // Карточка "Записи" — акцентная (бирюзовая)
  container.innerHTML += `
    <div class="home-card home-card-accent" onclick="openOrdersScreen()">
      <div class="home-card-icon-wrap">
        <i data-lucide="clipboard-list" style="width:22px;height:22px;"></i>
      </div>
      <h3>Записи</h3>
      <p>Заказы и работы</p>
      <div class="home-card-count">${orders.length}</div>
    </div>
  `;

  if (currentRole === 'owner') {
    const today = getLocalDateString();
    const todayOrders = orders.filter(o => !o.isCancelled && o.date === today);
    const todayTotal = todayOrders.reduce((sum, o) => sum + getOrderClientTotalAmount(o), 0);
    container.innerHTML += `
      <div class="home-card" onclick="openOwnerTodayScreen()">
        <div class="home-card-icon-wrap home-card-icon-dim">
          <i data-lucide="calendar-days" style="width:22px;height:22px;"></i>
        </div>
        <h3>Сегодня</h3>
        <p>${todayOrders.length} заказов</p>
        <div class="home-card-count" style="font-size:22px; color: var(--accent);">${todayTotal.toLocaleString('ru')} ₴</div>
      </div>
    `;

    const totalCash = (window.allCashLog || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    container.innerHTML += `
      <div class="home-card" onclick="openOwnerCashScreen()">
        <div class="home-card-icon-wrap home-card-icon-dim">
          <i data-lucide="wallet" style="width:22px;height:22px;"></i>
        </div>
        <h3>Касса</h3>
        <p>Сумма на руках</p>
        <div class="home-card-count" style="font-size:22px; color: var(--accent);">${totalCash.toLocaleString('ru')} ₴</div>
      </div>
    `;
  }

  if (canViewFinance()) {
    const debtOrders = orders.filter(o => !o.isCancelled && (o.supplierStatus === 'Не оплачено' || o.supplierStatus === 'Частично'));
    const debtSum = debtOrders.reduce((sum, o) => {
      const debt = (Number(o.purchase) || 0) - (Number(o.check) || 0);
      return sum + (debt > 0 ? debt : 0);
    }, 0);

    container.innerHTML += `
      <div class="home-card" onclick="openWarehousesScreen()">
        <div class="home-card-icon-wrap home-card-icon-dim">
          <i data-lucide="package" style="width:22px;height:22px;"></i>
        </div>
        <h3>Склады</h3>
        <p>Долги поставщикам</p>
        <div class="home-card-count" style="font-size:20px; color: var(--red);">${debtSum.toLocaleString('ru')} ₴</div>
      </div>
    `;
  }

  if (canViewClients()) {
    const clients = getClients();
    container.innerHTML += `
      <div class="home-card" onclick="openClientsScreen()">
        <div class="home-card-icon-wrap home-card-icon-dim">
          <i data-lucide="users" style="width:22px;height:22px;"></i>
        </div>
        <h3>Клиенты</h3>
        <p>База клиентов</p>
        <div class="home-card-count">${clients.length}</div>
      </div>
    `;
  }

  if (canViewWorkers()) {
    container.innerHTML += `
      <div class="home-card" onclick="openWorkersScreen()">
        <div class="home-card-icon-wrap home-card-icon-dim">
          <i data-lucide="hard-hat" style="width:22px;height:22px;"></i>
        </div>
        <h3>Сотрудники</h3>
        <p>База сотрудников</p>
        <div class="home-card-count">${workers.length}</div>
      </div>
    `;
  }

  if (canViewFinance()) {
    const totalSum = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
    container.innerHTML += `
      <div class="home-card" onclick="openFinanceScreen()">
        <div class="home-card-icon-wrap home-card-icon-dim">
          <i data-lucide="trending-up" style="width:22px;height:22px;"></i>
        </div>
        <h3>Выручка</h3>
        <p>Финансы по месяцам</p>
        <div class="home-card-count" style="font-size:22px;">${totalSum.toLocaleString('ru')} ₴</div>
      </div>
    `;
  }

  if (currentRole === 'owner') {
    const paymentEntries = getOwnerPaymentEntries();
    const paymentsTotal = paymentEntries.reduce((sum, entry) => sum + entry.amount, 0);
    const paymentMethodsCount = new Set(paymentEntries.map(entry => entry.method)).size;
    container.innerHTML += `
      <div class="home-card" onclick="openOwnerPaymentsScreen()">
        <div class="home-card-icon-wrap home-card-icon-dim">
          <i data-lucide="credit-card" style="width:22px;height:22px;"></i>
        </div>
        <h3>Оплаты</h3>
        <p>${paymentMethodsCount ? `Способов: ${paymentMethodsCount}` : 'По способам оплаты'}</p>
        <div class="home-card-count" style="font-size:22px; color: var(--accent);">${paymentsTotal.toLocaleString('ru')} ₴</div>
      </div>
    `;

    const salaryEntries = (typeof getManualSalaryReports === 'function') ? getManualSalaryReports() : [];
    const currentYm = getLocalDateString().slice(0, 7);
    const monthSalaryTotal = salaryEntries
      .filter(s => s.date && s.date.startsWith(currentYm))
      .reduce((sum, s) => sum + Number(s.amount), 0);
    const anomaliesCount = (typeof getSalaryAnomalies === 'function') ? getSalaryAnomalies().length : 0;
    container.innerHTML += `
      <div class="home-card" onclick="openSalaryDetail()">
        <div class="home-card-icon-wrap home-card-icon-dim">
          <i data-lucide="wallet-cards" style="width:22px;height:22px;"></i>
        </div>
        <h3>ЗП</h3>
        <p>${anomaliesCount > 0 ? `Аномалий: ${anomaliesCount}` : 'Проверка зарплат'}</p>
        <div class="home-card-count" style="font-size:22px; color: ${anomaliesCount > 0 ? 'var(--red)' : 'var(--yellow)'};">${monthSalaryTotal.toLocaleString('ru')} ₴</div>
      </div>
    `;

    container.innerHTML += `
      <div class="home-card" onclick="openCarDirectoryScreen()">
        <div class="home-card-icon-wrap home-card-icon-dim">
          <i data-lucide="car" style="width:22px;height:22px;"></i>
        </div>
        <h3>Справочник авто</h3>
        <p>Марки и еврокоды</p>
        <div class="home-card-count">${carDirectory.length}</div>
      </div>
    `;
  }

  initIcons();
}

function _ownerCashEntryDate(entry) {
  if (!entry?.created_at) return '';
  return new Date(entry.created_at).toISOString().slice(0, 10);
}

function getOwnerPaymentEntries() {
  const entries = [];

  for (const order of (orders || [])) {
    if (!order || order.isCancelled) continue;

    const clientTotal = getOrderClientTotalAmount(order);
    const clientPayments = (order.clientPayments || [])
      .filter(payment => Number(payment.amount) > 0 && normalizePaymentMethod(payment.method));

    if (clientPayments.length) {
      let clientPaidSoFar = 0;
      clientPayments.forEach(payment => {
        const amount = Number(payment.amount) || 0;
        clientPaidSoFar += amount;
        entries.push({
          type: 'client',
          title: 'Оплата клиента',
          amount,
          method: normalizePaymentMethod(payment.method),
          date: payment.date || order.date || '',
          paidSoFar: clientPaidSoFar,
          totalDue: clientTotal,
          order,
        });
      });
    } else if (order.paymentMethod && Number(order.debt) > 0) {
      entries.push({
        type: 'client',
        title: 'Оплата клиента',
        amount: Number(order.debt) || 0,
        method: normalizePaymentMethod(order.paymentMethod),
        date: order.date || '',
        paidSoFar: Number(order.debt) || 0,
        totalDue: clientTotal,
        order,
      });
    }

    let supplierPaidSoFar = 0;
    (order.supplierPayments || []).forEach(payment => {
      const method = normalizePaymentMethod(payment.method);
      const amount = Number(payment.amount) || 0;
      if (amount > 0) supplierPaidSoFar += amount;
      if (!amount || !method || isCashPaymentMethod(method)) return;
      entries.push({
        type: 'supplier',
        title: 'Оплата поставщику',
        amount: -amount,
        method,
        date: payment.date || order.date || '',
        paidSoFar: supplierPaidSoFar,
        totalDue: Number(order.purchase) || 0,
        order,
      });
    });
  }

  return entries.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function renderOwnerPaymentProgress(entry) {
  const paid = Number(entry?.paidSoFar) || 0;
  const total = Number(entry?.totalDue) || 0;
  if (!paid && !total) return '';

  const label = entry.type === 'supplier' ? 'Поставщику оплачено' : 'Клиент оплатил';
  return `
    <span class="order-meta-item" style="color:var(--yellow);font-weight:700;">
      ${label}: ${paid.toLocaleString('ru')} / ${total.toLocaleString('ru')} ₴
    </span>
  `;
}

function setOwnerPaymentFilter(type, checked) {
  ownerPaymentFilters[type] = checked;
  renderOwnerPaymentsScreen();
}

function renderOwnerPaymentFilters() {
  return `
    <div class="owner-payment-filters">
      <label class="checkbox order-flag-checkbox">
        <input type="checkbox" ${ownerPaymentFilters.client ? 'checked' : ''} onchange="setOwnerPaymentFilter('client', this.checked)">
        <span>Приходы клиента</span>
      </label>
      <label class="checkbox order-flag-checkbox">
        <input type="checkbox" ${ownerPaymentFilters.supplier ? 'checked' : ''} onchange="setOwnerPaymentFilter('supplier', this.checked)">
        <span>Расходы поставщику</span>
      </label>
    </div>
  `;
}

function _ownerTodayGroupKey(order) {
  const responsible = order?.responsible || 'Без ответственного';
  const worker = (workers || []).find(w => w.name === order?.responsible);
  const assistant = order?.assistant || worker?.assistant || '';
  return `${responsible}__${assistant || 'Без помощника'}`;
}

function _ownerTodayGroupLabel(group) {
  if (!group.assistant) return getWorkerDisplayName(group.responsible);
  return getWorkerDisplayPair(group.responsible, group.assistant);
}

function renderOwnerTodayScreen() {
  const container = document.getElementById('owner-today-content');
  if (!container) return;

  const today = getLocalDateString();
  const dayOrders = (orders || [])
    .filter(o => !o.isCancelled && o.date === today)
    .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));

  if (!dayOrders.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icon('calendar')}</div>
        <h3>На сегодня заказов нет</h3>
        <p>Когда на ${formatDate(today)} появятся заказы, они будут собраны по группам сотрудников</p>
      </div>
    `;
    initIcons();
    return;
  }

  const groups = {};
  for (const order of dayOrders) {
    const responsible = order.responsible || 'Без ответственного';
    const worker = (workers || []).find(w => w.name === order.responsible);
    const assistant = order.assistant || worker?.assistant || '';
    const key = _ownerTodayGroupKey(order);
    if (!groups[key]) {
      groups[key] = { responsible, assistant, orders: [], total: 0 };
    }
    groups[key].orders.push(order);
    groups[key].total += getOrderClientTotalAmount(order);
  }

  const groupList = Object.values(groups)
    .sort((a, b) => b.total - a.total || b.orders.length - a.orders.length || _ownerTodayGroupLabel(a).localeCompare(_ownerTodayGroupLabel(b), 'ru'));
  const totalAmount = dayOrders.reduce((sum, order) => sum + getOrderClientTotalAmount(order), 0);

  container.innerHTML = `
    <div class="owner-today-summary">
      <div class="owner-today-summary-item">
        <span class="owner-today-summary-label">Заказы</span>
        <strong>${dayOrders.length}</strong>
        <small>${formatDate(today)}</small>
      </div>
      <div class="owner-today-summary-item">
        <span class="owner-today-summary-label">Группы</span>
        <strong>${groupList.length}</strong>
        <small>сотрудники</small>
      </div>
      <div class="owner-today-summary-item owner-today-summary-item--accent">
        <span class="owner-today-summary-label">Сумма</span>
        <strong>${totalAmount.toLocaleString('ru')} ₴</strong>
        <small>заказы</small>
      </div>
    </div>

    ${groupList.map((group, index) => {
      const key = `owner-today-group-${index}`;
      const ordersHtml = group.orders.map(order => renderOrderCard(order)).join('');
      return `
        <div class="fin-month-card" style="margin-bottom:14px;">
          <div class="fin-month-header" onclick="toggleProfileMonth('${key}')">
            <div style="min-width:0;display:flex;align-items:center;gap:10px;">
              <i data-lucide="chevron-down" style="width:16px;height:16px;color:var(--text3);transition:transform 0.2s;flex-shrink:0;" id="pchevron-${key}"></i>
              <div style="min-width:0;">
                <div class="fin-month-name" style="white-space:normal;word-break:break-word;">${_ownerTodayGroupLabel(group)}</div>
                <div class="fin-month-sub">${group.orders.length} заказов</div>
              </div>
            </div>
            <div style="font-size:18px;font-weight:800;color:var(--accent);white-space:nowrap;">${group.total.toLocaleString('ru')} ₴</div>
          </div>
          <div id="profile-month-body-${key}" style="display:block;padding:0 12px 12px;">
            ${ordersHtml}
          </div>
        </div>
      `;
    }).join('')}
  `;

  initIcons();
}

function renderOwnerPaymentsScreen() {
  const container = document.getElementById('owner-payments-content');
  if (!container) return;

  const allPaymentEntries = getOwnerPaymentEntries();
  const paymentEntries = allPaymentEntries.filter(entry => ownerPaymentFilters[entry.type]);

  if (!allPaymentEntries.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icon('credit-card')}</div>
        <h3>Оплат нет</h3>
        <p>Когда в заказах появятся оплаты клиента или безналичные оплаты поставщику, они будут собраны здесь</p>
      </div>
    `;
    initIcons();
    return;
  }

  if (!paymentEntries.length) {
    container.innerHTML = `
      ${renderOwnerPaymentFilters()}
      <div class="empty-state">
        <div class="empty-state-icon">${icon('credit-card')}</div>
        <h3>Нет записей по фильтру</h3>
        <p>Включите приходы или расходы, чтобы увидеть движения оплат</p>
      </div>
    `;
    initIcons();
    return;
  }

  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const byMethod = {};

  for (const entry of paymentEntries) {
    const method = entry.method || '—';
    const date = entry.date || '';
    const year = date ? date.slice(0, 4) : 'Без даты';
    const month = date ? date.slice(0, 7) : 'Без даты';
    const day = date || 'Без даты';

    if (!byMethod[method]) byMethod[method] = { total: 0, years: {} };
    byMethod[method].total += entry.amount;
    if (!byMethod[method].years[year]) byMethod[method].years[year] = { total: 0, months: {} };
    byMethod[method].years[year].total += entry.amount;
    if (!byMethod[method].years[year].months[month]) byMethod[method].years[year].months[month] = { total: 0, days: {} };
    byMethod[method].years[year].months[month].total += entry.amount;
    if (!byMethod[method].years[year].months[month].days[day]) byMethod[method].years[year].months[month].days[day] = { total: 0, entries: [] };
    byMethod[method].years[year].months[month].days[day].total += entry.amount;
    byMethod[method].years[year].months[month].days[day].entries.push(entry);
  }

  const methodNames = Object.keys(byMethod).sort((a, b) => byMethod[b].total - byMethod[a].total);

  container.innerHTML = renderOwnerPaymentFilters() + methodNames.map(method => {
    const methodData = byMethod[method];
    const methodKey = 'owner-pay-method-' + btoa(unescape(encodeURIComponent(method))).replace(/[^a-zA-Z0-9]/g, '');
    const yearsHtml = Object.keys(methodData.years).sort((a, b) => b.localeCompare(a)).map(year => {
      const yearData = methodData.years[year];
      const yearKey = `${methodKey}-year-${year}`;
      const monthsHtml = Object.keys(yearData.months).sort((a, b) => b.localeCompare(a)).map(monthKey => {
        const monthData = yearData.months[monthKey];
        const monthToggleKey = `${yearKey}-month-${monthKey}`;
        const monthName = monthKey === 'Без даты' ? 'Без даты' : `${monthNames[Number(monthKey.slice(5, 7)) - 1] || monthKey} ${monthKey.slice(0, 4)}`;
        const daysHtml = Object.keys(monthData.days).sort((a, b) => b.localeCompare(a)).map(day => {
          const dayData = monthData.days[day];
          const dayKey = `${monthToggleKey}-day-${day}`;
          const ordersHtml = dayData.entries.map(entry => {
            const order = entry.order || {};
            const amount = Number(entry.amount) || 0;
            const isExpense = amount < 0;
            const total = Number(entry.totalDue) || 0;
            return `
              <div class="order-card" style="margin:8px 0 0;cursor:pointer;" onclick="openOrderDetail('${order.id}')">
                <div class="order-card-top">
                  <div class="order-card-left">
                    <span class="order-id">${order.id}</span>
                    <span class="order-name">${order.car || order.client || '—'}</span>
                  </div>
                  <div style="font-size:16px;font-weight:800;color:${isExpense ? 'var(--red)' : 'var(--accent)'};">${amount.toLocaleString('ru')} ₴</div>
                </div>
                <div class="order-card-meta">
                  <span class="order-meta-item">${entry.title}</span>
                  ${renderOwnerPaymentProgress(entry)}
                  <span class="order-meta-item">${order.client || '—'}</span>
                  <span class="order-meta-item">${order.phone || '—'}</span>
                  ${total ? `<span class="order-meta-item">Общая сумма: ${total.toLocaleString('ru')} ₴</span>` : ''}
                </div>
              </div>
            `;
          }).join('');

          return `
            <div style="border-bottom:1px solid var(--border);">
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;cursor:pointer;" onclick="toggleProfileMonth('${dayKey}')">
                <div style="display:flex;align-items:center;gap:8px;">
                  <i data-lucide="chevron-right" style="width:13px;height:13px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${dayKey}"></i>
                  <div style="font-size:13px;color:var(--text2);font-weight:600;">${day === 'Без даты' ? day : formatDate(day)}</div>
                  <div style="font-size:11px;color:var(--text3);">${dayData.entries.length} зап.</div>
                </div>
                <div style="font-size:13px;font-weight:800;color:${dayData.total < 0 ? 'var(--red)' : 'var(--accent)'};">${dayData.total.toLocaleString('ru')} ₴</div>
              </div>
              <div id="profile-month-body-${dayKey}" style="display:none;padding:0 0 10px;">
                ${ordersHtml}
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
                <div style="font-size:11px;color:var(--text3);">${Object.keys(monthData.days).length} дн.</div>
              </div>
              <div style="font-size:14px;font-weight:800;color:${monthData.total < 0 ? 'var(--red)' : 'var(--accent)'};">${monthData.total.toLocaleString('ru')} ₴</div>
            </div>
            <div id="profile-month-body-${monthToggleKey}" style="display:none;background:var(--surface2);border-radius:0 0 8px 8px;">
              ${daysHtml}
            </div>
          </div>
        `;
      }).join('');

      return `
        <div style="border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;cursor:pointer;" onclick="toggleProfileMonth('${yearKey}')">
            <div style="display:flex;align-items:center;gap:8px;">
              <i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${yearKey}"></i>
              <div style="font-size:14px;font-weight:700;color:var(--text2);">${year}</div>
              <div style="font-size:11px;color:var(--text3);">${Object.keys(yearData.months).length} мес.</div>
            </div>
            <div style="font-size:14px;font-weight:800;color:${yearData.total < 0 ? 'var(--red)' : 'var(--accent)'};">${yearData.total.toLocaleString('ru')} ₴</div>
          </div>
          <div id="profile-month-body-${yearKey}" style="display:none;background:var(--surface2);border-radius:0 0 8px 8px;">
            ${monthsHtml}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="fin-month-card" style="margin-bottom:12px;">
        <div class="fin-month-header" onclick="toggleProfileMonth('${methodKey}')">
          <div style="min-width:0;display:flex;align-items:center;gap:10px;">
            <i data-lucide="chevron-down" style="width:16px;height:16px;color:var(--text3);transition:transform 0.2s;flex-shrink:0;" id="pchevron-${methodKey}"></i>
            <div style="min-width:0;">
              <div class="fin-month-name" style="white-space:normal;word-break:break-word;">${method}</div>
              <div class="fin-month-sub">${Object.keys(methodData.years).length} год.</div>
            </div>
          </div>
          <div style="font-size:18px;font-weight:800;color:${methodData.total < 0 ? 'var(--red)' : 'var(--accent)'};white-space:nowrap;">${methodData.total.toLocaleString('ru')} ₴</div>
        </div>
        <div id="profile-month-body-${methodKey}" style="display:none;padding:0 0 8px;">${yearsHtml}</div>
      </div>
    `;
  }).join('');

  initIcons();
}

function renderOwnerCashScreen() {
  const container = document.getElementById('owner-cash-content');
  if (!container) return;

  const seniorNames = (workers || [])
    .filter(w => w.systemRole === 'senior')
    .map(w => w.name);

  const logs = [...(window.allCashLog || [])]
    .filter(entry => seniorNames.includes(entry.worker_name))
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

  const balances = {};
  const snapshotsByDay = {};
  for (const entry of logs) {
    const workerName = entry.worker_name;
    balances[workerName] = (balances[workerName] || 0) + (Number(entry.amount) || 0);
    const day = _ownerCashEntryDate(entry);
    if (!day) continue;
    if (!snapshotsByDay[day]) snapshotsByDay[day] = {};
    snapshotsByDay[day][workerName] = balances[workerName];
  }

  const currentCashRows = seniorNames.map(name => ({
    workerName: name,
    balance: Number(balances[name] || 0),
  }));
  const currentCashTotal = currentCashRows.reduce((sum, row) => sum + row.balance, 0);
  const currentCashHtml = `
    <div class="fin-month-card" style="margin-bottom:12px;">
      <div style="padding:14px 16px;border-bottom:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
          <div>
            <div class="fin-month-name">Текущая касса</div>
            <div class="fin-month-sub">Общий остаток по всем старшим специалистам</div>
          </div>
          <div style="font-size:22px;font-weight:900;color:${currentCashTotal >= 0 ? 'var(--accent)' : '#ef4444'};white-space:nowrap;">${currentCashTotal.toLocaleString('ru')} ₴</div>
        </div>
      </div>
      <div style="padding:12px 16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;">
        ${currentCashRows.length ? currentCashRows.map(row => `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:12px;">
            <div style="font-size:13px;font-weight:700;color:var(--text2);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(row.workerName)}</div>
            <div style="font-size:15px;font-weight:900;color:${row.balance >= 0 ? 'var(--accent)' : '#ef4444'};white-space:nowrap;">${row.balance.toLocaleString('ru')} ₴</div>
          </div>
        `).join('') : `
          <div style="font-size:13px;color:var(--text3);">Старшие специалисты не найдены</div>
        `}
      </div>
    </div>
  `;

  if (!logs.length) {
    container.innerHTML = currentCashHtml + `
      <div class="empty-state">
        <div class="empty-state-icon">${icon('banknote')}</div>
        <h3>Записей кассы нет</h3>
        <p>Когда у старших специалистов появятся движения по кассе, они будут показаны здесь</p>
      </div>
    `;
    initIcons();
    return;
  }

  const tree = {};
  Object.keys(snapshotsByDay).forEach(day => {
    const year = day.slice(0, 4);
    const month = day.slice(0, 7);
    if (!tree[year]) tree[year] = {};
    if (!tree[year][month]) tree[year][month] = [];
    tree[year][month].push(day);
  });

  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const years = Object.keys(tree).sort((a, b) => b.localeCompare(a));

  container.innerHTML = currentCashHtml + years.map(year => {
    const yearKey = `owner-cash-year-${year}`;
    const monthsHtml = Object.keys(tree[year]).sort((a, b) => b.localeCompare(a)).map(monthKey => {
      const monthToggleKey = `owner-cash-month-${monthKey}`;
      const [, month] = monthKey.split('-');
      const days = tree[year][monthKey].sort((a, b) => b.localeCompare(a));

      const daysHtml = days.map(day => {
        const dayToggleKey = `owner-cash-day-${day}`;
        const snapshot = snapshotsByDay[day] || {};
        const rows = seniorNames.map(name => ({
          workerName: name,
          balance: Number(snapshot[name] || 0),
        }));
        const total = rows.reduce((sum, row) => sum + row.balance, 0);

        return `
          <div style="border-bottom:1px solid var(--border);">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;cursor:pointer;" onclick="toggleProfileMonth('${dayToggleKey}')">
              <div style="display:flex;align-items:center;gap:8px;">
                <i data-lucide="chevron-right" style="width:13px;height:13px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${dayToggleKey}"></i>
                <div style="font-size:13px;color:var(--text2);font-weight:600;">${formatDate(day)}</div>
              </div>
              <div style="font-size:13px;font-weight:800;color:${total >= 0 ? 'var(--accent)' : '#ef4444'};">${total.toLocaleString('ru')} ₴</div>
            </div>
            <div id="profile-month-body-${dayToggleKey}" style="display:none;padding:0 12px 8px 28px;">
              <div style="display:flex;flex-direction:column;gap:8px;">
                ${rows.map(row => `
                  <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;">
                    <div style="font-size:13px;font-weight:600;color:var(--text2);">${row.workerName}</div>
                    <div style="font-size:14px;font-weight:800;color:${row.balance >= 0 ? 'var(--accent)' : '#ef4444'};">${row.balance.toLocaleString('ru')} ₴</div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div style="border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;cursor:pointer;" onclick="toggleProfileMonth('${monthToggleKey}')">
            <div style="display:flex;align-items:center;gap:8px;">
              <i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${monthToggleKey}"></i>
              <div style="font-size:14px;font-weight:700;color:var(--text2);">${monthNames[Number(month) - 1] || monthKey}</div>
              <div style="font-size:11px;color:var(--text3);">${days.length} дн.</div>
            </div>
          </div>
          <div id="profile-month-body-${monthToggleKey}" style="display:none;padding-left:12px;background:var(--surface2);border-radius:0 0 8px 8px;">
            ${daysHtml}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="fin-month-card" style="margin-bottom:12px;">
        <div class="fin-month-header" onclick="toggleProfileMonth('${yearKey}')">
          <div style="display:flex;align-items:center;gap:10px;">
            <i data-lucide="chevron-down" style="width:16px;height:16px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${yearKey}"></i>
            <div>
              <div class="fin-month-name">${year}</div>
              <div class="fin-month-sub">${Object.keys(tree[year]).length} мес.</div>
            </div>
          </div>
        </div>
        <div id="profile-month-body-${yearKey}" style="display:none;padding:0 0 8px;">${monthsHtml}</div>
      </div>
    `;
  }).join('');

  initIcons();
}

// --- ОТКРЫТИЕ РАЗДЕЛОВ ---
function openOrdersScreen() {
  window.currentYearFilter = null;
  currentMonthFilter = null;
  initOrderTabs();
  if (typeof renderYears === 'function') renderYears();
  setupYearsActions();
  showScreen('years');
}

function setupYearsActions() {
  const backTopbar = document.getElementById('years-back-topbar');
  if (backTopbar) {
    backTopbar.style.display = currentRole === 'owner' ? 'flex' : 'none';
  }

  const el = document.getElementById('years-actions');
  if (el) {
    if (canCreateOrder()) {
      el.innerHTML = `<button class="btn-primary" style="display:flex;align-items:center;gap:6px;" onclick="openOrderModal(null)"><i data-lucide="plus" style="width:14px;height:14px;"></i> Добавить запись</button>`;
      initIcons();
    } else {
      el.innerHTML = '';
    }
  }
}

function setupMonthsActions() {
  const el = document.getElementById('months-actions');
  if (canCreateOrder()) {
    el.innerHTML = `<button class="btn-primary" style="display:flex;align-items:center;gap:6px;" onclick="openOrderModal(null)"><i data-lucide="plus" style="width:14px;height:14px;"></i> Добавить запись</button>`;
    initIcons();
  } else {
    el.innerHTML = '';
  }
}

function goBackFromOrder() {
  if (currentMonthFilter) {
    renderOrdersForMonth(currentMonthFilter);
    showScreen('orders');
  } else if (currentRole !== 'owner' && currentRole !== 'manager') {
    setupOrderActions();
    renderOrders();
    showScreen('orders');
  } else {
    renderMonths();
    showScreen('months');
  }
}

function openClientsScreen() {
  if (!canViewClients()) return;
  renderClients();
  showScreen('clients');
}

async function openWorkersScreen() {
  if (!canViewWorkers()) return;
  // Загружаем проблемы если ещё не загружены
  if (typeof allProblems === 'undefined' || !allProblems) {
    try { allProblems = await sbFetchAllProblems(); } catch(e) { allProblems = []; }
  }
  renderWorkers();
  showScreen('workers');
}

function openCarDirectoryScreen() {
  if (currentRole !== 'owner') return;
  if (typeof renderCarDirectory === 'function') renderCarDirectory();
  showScreen('car-directory');
}
