// ============================================================
// APP.JS — навигация, главный экран
// ============================================================

let currentMonthFilter = null;

// Fallback если data.js старой версии (без carDirectory)
if (typeof carDirectory === 'undefined') {
  window.carDirectory = [];
}

async function initApp() {
  const minDelay = new Promise(r => setTimeout(r, 2000));
  const tasks = [loadOrders(), loadWorkers(), loadRefData(), loadWorkerSalaries(), minDelay];
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
  const navAdd     = document.getElementById('nav-add');
  const bottomNav  = document.getElementById('bottom-navbar');

  const navCash    = document.getElementById('nav-cash');
  const navProfile = document.getElementById('nav-profile');

  if (currentRole === 'owner') {
    // Владелец: Главная + Записи + Добавить (без клиентов и команды)
    if (bottomNav)  bottomNav.style.display  = '';
    if (navHome)    navHome.style.display    = '';
    if (navAdd)     navAdd.style.display     = '';
    if (navCash)    navCash.style.display    = 'none';
    if (navProfile) navProfile.style.display = 'none';
    if (navClients) navClients.style.display = 'none';
    if (navWorkers) navWorkers.style.display = 'none';
    document.getElementById('app')?.classList.remove('no-navbar');
  } else if (currentRole === 'manager') {
    // Менеджер: Записи + Добавить
    if (bottomNav)  bottomNav.style.display  = '';
    if (navHome)    navHome.style.display    = 'none';
    if (navAdd)     navAdd.style.display     = '';
    if (navCash)    navCash.style.display    = 'none';
    if (navProfile) navProfile.style.display = 'none';
    if (navClients) navClients.style.display = canViewClients() ? '' : 'none';
    if (navWorkers) navWorkers.style.display = 'none';
    document.getElementById('app')?.classList.remove('no-navbar');
  } else {
    // Специалисты: Записи + Касса + ЗП (без кнопки добавить)
    if (navAdd)     navAdd.style.display     = 'none';
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
  const map = { home: 'nav-home', months: 'nav-orders', orders: 'nav-orders', clients: 'nav-clients', workers: 'nav-workers', cash: 'nav-cash', profile: 'nav-profile' };
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

  const crumbMap = {
    home: null,
    years: 'Записи по годам',
    months: 'Записи',
    orders: 'Записи',
    clients: 'Клиенты',
    workers: 'Сотрудники',
    finance: 'Финансы',
    'owner-cash': 'Касса сотрудников',
    cash: null,
    profile: null,
    'order-detail': 'Детали заказа',
    'client-detail': 'Детали клиента',
    'car-directory': 'Справочник авто',
    warehouses: 'Склады (Долги)',
    'warehouse-detail': 'Детали склада',
  };
  const crumb = document.getElementById('breadcrumb');
  const crumbText = document.getElementById('breadcrumb-text');
  if (crumbMap[name]) {
    crumb.style.display = 'flex';
    crumbText.textContent = crumbMap[name];
  } else {
    crumb.style.display = 'none';
  }

  setActiveNav(name);
  window.scrollTo({ top: 0, behavior: 'smooth' });
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

  const container = document.getElementById('home-cards');
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

    const debtOrders = orders.filter(o => !o.isCancelled && (o.supplierStatus === 'Не оплачено' || o.supplierStatus === 'Частично оплачено'));
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

  if (currentRole === 'owner') {
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

function renderOwnerCashScreen() {
  const container = document.getElementById('owner-cash-content');
  if (!container) return;

  const seniorNames = (workers || [])
    .filter(w => w.systemRole === 'senior')
    .map(w => w.name);

  const logs = [...(window.allCashLog || [])]
    .filter(entry => seniorNames.includes(entry.worker_name))
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

  if (!logs.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💵</div>
        <h3>Записей кассы нет</h3>
        <p>Когда у старших специалистов появятся движения по кассе, они будут показаны здесь</p>
      </div>
    `;
    initIcons();
    return;
  }

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

  container.innerHTML = years.map(year => {
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
