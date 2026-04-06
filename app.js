// ============================================================
// APP.JS — навигация, главный экран
// ============================================================

let currentMonthFilter = null;

async function initApp() {
  const minDelay = new Promise(r => setTimeout(r, 2000));
  await Promise.all([loadOrders(), loadWorkers(), loadRefData(), loadWorkerSalaries(), minDelay]);
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

  if (navClients) navClients.style.display = canViewClients() ? '' : 'none';
  if (navWorkers) navWorkers.style.display = canViewWorkers() ? '' : 'none';

  const navProfile = document.getElementById('nav-profile');

  if (currentRole === 'owner') {
    if (bottomNav) bottomNav.style.display = '';
    if (navHome)   navHome.style.display   = '';
    if (navProfile) navProfile.style.display = 'none';
    document.getElementById('app')?.classList.remove('no-navbar');
  } else if (currentRole === 'manager') {
    // Менеджер: Записи + Клиенты + Профиль
    if (bottomNav) bottomNav.style.display = '';
    if (navHome)   navHome.style.display   = 'none';
    if (navProfile) navProfile.style.display = '';
    document.getElementById('app')?.classList.remove('no-navbar');
  } else {
    // Специалисты видят навбар с кнопками: Записи + Профиль
    if (bottomNav) bottomNav.style.display = '';
    if (navHome)   navHome.style.display   = 'none';
    if (navProfile) navProfile.style.display = '';
    document.getElementById('app')?.classList.remove('no-navbar');
  }
}

function setActiveNav(name) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const map = { home: 'nav-home', months: 'nav-orders', orders: 'nav-orders', clients: 'nav-clients', workers: 'nav-workers', profile: 'nav-profile' };
  const id = map[name];
  if (id) { const el = document.getElementById(id); if (el) el.classList.add('active'); }
}

function navTo(section) {
  if (section === 'home') { goHome(); }
  else if (section === 'orders') { openOrdersScreen(); }
  else if (section === 'clients') { openClientsScreen(); }
  else if (section === 'workers') { openWorkersScreen(); }
  else if (section === 'profile') { openProfileScreen(); }
}

function openFinanceScreen() {
  if (!canViewFinance()) return;
  renderFinance();
  showScreen('finance');
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
  await loadOrders();
  renderOrders();
  renderHome();
  showToast('Данные обновлены');
}

// --- НАВИГАЦИЯ ---
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('active');

  const crumbMap = {
    home: null,
    months: 'Записи',
    orders: 'Записи',
    clients: 'Клиенты',
    workers: 'Сотрудники',
    finance: 'Финансы',
    profile: null,
    'order-detail': 'Детали заказа',
    'client-detail': 'Детали клиента',
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
  }

  initIcons();
}

// --- ОТКРЫТИЕ РАЗДЕЛОВ ---
function openOrdersScreen() {
  currentMonthFilter = null;
  initOrderTabs();
  renderMonths();
  setupMonthsActions();
  showScreen('months');
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

function openWorkersScreen() {
  if (!canViewWorkers()) return;
  renderWorkers();
  showScreen('workers');
}
