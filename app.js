// ============================================================
// APP.JS — навигация, главный экран
// ============================================================

let currentMonthFilter = null;
let ownerPaymentFilters = { client: true, supplier: true, dropshipper: true, fop: true, manual: true };
let ownerCashSelectedWorker = '';
let ownerCashCurrencyView = 'uah';
let ownerCashConfirmFilter = 'all';
const OWNER_FOP_SELECTION_KEY = 'Oleg Starshiy__fop';
let calendarCursorDate = new Date();
let calendarWorkerFilters = [];
const THEME_STORAGE_KEY = 'crm_theme';

// Fallback если data.js старой версии (без carDirectory)
if (typeof carDirectory === 'undefined') {
  window.carDirectory = [];
}

function getCurrentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = nextTheme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch (e) {}
  updateThemeAssets();
  updateThemeToggleButton();
}

function toggleTheme() {
  applyTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark');
}

function updateThemeToggleButton() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  const isDark = getCurrentTheme() === 'dark';
  btn.title = isDark ? 'Включить светлую тему' : 'Включить темную тему';
  btn.innerHTML = `<i data-lucide="${isDark ? 'sun' : 'moon'}" style="width:15px;height:15px;"></i>`;
  initIcons();
}

function updateThemeAssets() {
  const isDark = getCurrentTheme() === 'dark';
  const sources = {
    main: isDark ? 'images/logo.svg' : 'images/logo-d.svg',
    loader: isDark ? 'images/logo-loader.svg' : 'images/logo-loader-d.svg',
  };
  document.querySelectorAll('[data-theme-logo]').forEach(img => {
    const key = img.dataset.themeLogo;
    if (sources[key] && img.getAttribute('src') !== sources[key]) {
      img.setAttribute('src', sources[key]);
    }
  });
}

function clearCacheAndReload() {
  const preserve = new Map();
  try {
    ['crm_role', 'crm_token', 'crm_worker_name', THEME_STORAGE_KEY].forEach(key => {
      const value = localStorage.getItem(key);
      if (value !== null) preserve.set(key, value);
    });
    localStorage.clear();
    preserve.forEach((value, key) => localStorage.setItem(key, value));
  } catch (e) {}

  try {
    sessionStorage.clear();
  } catch (e) {}

  if (typeof orders !== 'undefined') orders = [];
  if (typeof workers !== 'undefined') workers = [];
  if (typeof carDirectory !== 'undefined') carDirectory = [];
  if (typeof workerSalaries !== 'undefined') workerSalaries = [];
  if (typeof assistantWorkerSalaries !== 'undefined') assistantWorkerSalaries = [];
  if (typeof workerCashLog !== 'undefined') workerCashLog = [];
  if (typeof allSalaries !== 'undefined') allSalaries = [];
  if (typeof manualClients !== 'undefined') manualClients = [];
  if (typeof currentClientPayments !== 'undefined') currentClientPayments = [];
  if (typeof currentSupplierPayments !== 'undefined') currentSupplierPayments = [];
  if (typeof window !== 'undefined') {
    window.allCashLog = [];
  }

  location.reload();
}

async function initApp() {
  updateThemeAssets();
  updateThemeToggleButton();
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
    if (navHome)    navHome.style.display    = canViewDashboard() ? '' : 'none';
    if (navCash)    navCash.style.display    = currentWorkerName === 'Sasha Manager' ? '' : 'none';
    if (navProfile) navProfile.style.display = '';
    if (navClients) navClients.style.display = canViewClients() ? '' : 'none';
    if (navWorkers) navWorkers.style.display = 'none';
    document.getElementById('app')?.classList.remove('no-navbar');
  } else {
    // Специалисты: Записи + ЗП, касса только для старших
    if (navClients) navClients.style.display = 'none';
    if (navWorkers) navWorkers.style.display = 'none';
    if (bottomNav) bottomNav.style.display = '';
    if (navHome)   navHome.style.display   = 'none';
    if (navCash)   navCash.style.display   = currentRole === 'junior' ? 'none' : '';
    if (navProfile) navProfile.style.display = '';
    document.getElementById('app')?.classList.remove('no-navbar');
  }
}

function setActiveNav(name) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const map = { home: 'nav-home', months: 'nav-orders', orders: 'nav-orders', clients: 'nav-clients', workers: 'nav-workers', cash: 'nav-cash', profile: 'nav-profile', 'owner-today': 'nav-home', calendar: 'nav-home' };
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

async function openOwnerCashScreen() {
  if (!canViewOwnerCash()) return;
  try { window.allCashLog = await sbFetchAllCashLog(); } catch(e) { window.allCashLog = window.allCashLog || []; }
  renderOwnerCashScreen();
  showScreen('owner-cash');
}

async function openOwnerSalaryScreen() {
  if (!canViewFinance()) return;
  if (typeof loadAllSalaries === 'function') await loadAllSalaries();
  if (typeof renderOwnerSalaryScreen === 'function') renderOwnerSalaryScreen();
  showScreen('owner-salary');
}

async function openOwnerPaymentsScreen() {
  if (!canViewOwnerPayments()) return;
  try { window.allCashLog = await sbFetchAllCashLog(); } catch(e) { window.allCashLog = window.allCashLog || []; }
  renderOwnerPaymentsScreen();
  showScreen('owner-payments');
}

function openOwnerTodayScreen() {
  if (!canViewOwnerToday()) return;
  renderOwnerTodayScreen();
  showScreen('owner-today');
}

function openCalendarScreen() {
  if (!canViewCalendar()) return;
  renderCalendarScreen();
  showScreen('calendar');
  setActiveNav('calendar');
}

function getCalendarPlannerOrders() {
  return (orders || []).filter(order => order.inWork && !order.workerDone && !order.isCancelled && order.date);
}

function getCalendarWorkerNames() {
  const names = new Set();
  getCalendarPlannerOrders().forEach(order => {
    [order.responsible, order.assistant, order.manager].filter(Boolean).forEach(name => names.add(name));
  });
  return Array.from(names).sort((a, b) => getWorkerDisplayName(a).localeCompare(getWorkerDisplayName(b), 'ru'));
}

function orderMatchesCalendarWorkers(order) {
  if (!calendarWorkerFilters.length) return true;
  return calendarWorkerFilters.some(workerName =>
    order.responsible === workerName || order.assistant === workerName || order.manager === workerName
  );
}

function setCalendarMonth(offset) {
  const current = calendarCursorDate instanceof Date && !Number.isNaN(calendarCursorDate.getTime())
    ? calendarCursorDate
    : new Date();
  calendarCursorDate = new Date(current.getFullYear(), current.getMonth() + offset, 1);
  renderCalendarScreen();
}

function setCalendarWorkerFilter(workerName, checked) {
  const name = String(workerName || '');
  if (!name) return;
  if (checked) {
    if (!calendarWorkerFilters.includes(name)) calendarWorkerFilters.push(name);
  } else {
    calendarWorkerFilters = calendarWorkerFilters.filter(item => item !== name);
  }
  renderCalendarScreen();
}

function clearCalendarWorkerFilters() {
  calendarWorkerFilters = [];
  renderCalendarScreen();
}

function formatCalendarMonthTitle(date) {
  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

function calendarDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function renderCalendarScreen() {
  const container = document.getElementById('calendar-content');
  if (!container) return;

  const cursor = calendarCursorDate instanceof Date && !Number.isNaN(calendarCursorDate.getTime())
    ? calendarCursorDate
    : new Date();
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDay.getDay() + 6) % 7;
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const todayKey = getLocalDateString();

  const plannerOrders = getCalendarPlannerOrders()
    .filter(order => String(order.date || '').startsWith(monthKey))
    .filter(orderMatchesCalendarWorkers);

  const byDate = {};
  plannerOrders.forEach(order => {
    const key = String(order.date || '').slice(0, 10);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(order);
  });

  const workerNames = getCalendarWorkerNames();
  const workerFiltersHtml = workerNames.length ? workerNames.map(workerName => {
    const checked = calendarWorkerFilters.includes(workerName);
    return `
      <label class="calendar-worker-pill ${checked ? 'active' : ''}">
        <input type="checkbox" ${checked ? 'checked' : ''} onchange="setCalendarWorkerFilter('${escapeAttr(workerName)}', this.checked)">
        <span>${escapeHtml(getWorkerDisplayName(workerName) || workerName)}</span>
      </label>
    `;
  }).join('') : '<div style="font-size:13px;color:var(--text3);">В планерке пока нет заказов с сотрудниками</div>';

  const weekdayHtml = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
    .map(day => `<div class="calendar-weekday">${day}</div>`)
    .join('');

  let daysHtml = '';
  for (let i = 0; i < startOffset; i++) {
    daysHtml += '<div class="calendar-day calendar-day-empty"></div>';
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const key = calendarDateKey(date);
    const dayOrders = byDate[key] || [];
    const dayTotal = dayOrders.reduce((sum, order) => sum + getOrderClientTotalAmount(order), 0);
    daysHtml += `
      <div class="calendar-day ${key === todayKey ? 'today' : ''} ${dayOrders.length ? 'has-orders' : ''}" onclick="openCalendarDayModal('${key}')">
        <div class="calendar-day-top">
          <span class="calendar-day-number">${day}</span>
          ${dayOrders.length ? `<span class="calendar-day-count">${dayOrders.length}</span>` : ''}
        </div>
        ${dayOrders.length ? `<div class="calendar-day-total">${dayTotal.toLocaleString('ru')} ₴</div>` : ''}
      </div>
    `;
  }

  container.innerHTML = `
    <div class="calendar-toolbar">
      <button class="btn-secondary calendar-nav-btn" onclick="setCalendarMonth(-1)">${icon('chevron-right')}</button>
      <div>
        <div class="calendar-title">${formatCalendarMonthTitle(firstDay)}</div>
        <div class="calendar-subtitle">${plannerOrders.length} заказов · ${plannerOrders.reduce((sum, order) => sum + getOrderClientTotalAmount(order), 0).toLocaleString('ru')} ₴</div>
      </div>
      <button class="btn-secondary calendar-nav-btn" onclick="setCalendarMonth(1)">${icon('chevron-right')}</button>
    </div>

    <div class="calendar-filters-card">
      <div class="calendar-filters-head">
        <div class="calendar-filters-title">Сотрудники</div>
        ${calendarWorkerFilters.length ? '<button class="btn-secondary" style="font-size:12px;padding:6px 10px;" onclick="clearCalendarWorkerFilters()">Все</button>' : ''}
      </div>
      <div class="calendar-worker-pills">${workerFiltersHtml}</div>
    </div>

    <div class="calendar-grid-card">
      <div class="calendar-grid calendar-weekdays">${weekdayHtml}</div>
      <div class="calendar-grid">${daysHtml}</div>
    </div>
  `;
  initIcons();
}

function getCalendarOrdersForDate(dateKey) {
  const key = String(dateKey || '').slice(0, 10);
  return getCalendarPlannerOrders()
    .filter(order => String(order.date || '').slice(0, 10) === key)
    .filter(orderMatchesCalendarWorkers)
    .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
}

function openCalendarDayModal(dateKey) {
  const dayOrders = getCalendarOrdersForDate(dateKey);
  let modal = document.getElementById('calendar-day-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'calendar-day-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  const filtersLabel = calendarWorkerFilters.length
    ? calendarWorkerFilters.map(name => getWorkerDisplayName(name) || name).join(', ')
    : 'Все сотрудники';

  const ordersHtml = dayOrders.length ? dayOrders.map(order => `
    <div class="calendar-modal-order" onclick="closeCalendarDayModal(); openOrderModal('${escapeAttr(order.id)}')">
      <div class="calendar-modal-order-top">
        <div>
          <div class="calendar-modal-order-title">${escapeHtml(order.car || order.client || order.id)}</div>
          <div class="calendar-modal-order-sub">${escapeHtml(order.client || '—')} · ${escapeHtml(order.phone || '—')}</div>
        </div>
        <div class="calendar-modal-order-time">${escapeHtml(order.time || '—')}</div>
      </div>
      <div class="calendar-modal-order-meta">
        <span>${icon('user')} ${escapeHtml(getWorkerDisplayPair(order.responsible, order.assistant) || '—')}</span>
        ${order.manager ? `<span>${icon('users')} ${escapeHtml(getWorkerDisplayName(order.manager) || order.manager)}</span>` : ''}
        ${order.address ? `<span>${escapeHtml(order.address)}</span>` : ''}
      </div>
    </div>
  `).join('') : `
    <div class="empty-state" style="padding:24px 12px;">
      <div class="empty-state-icon">${icon('calendar')}</div>
      <h3>Заказов нет</h3>
      <p>На этот день в планерке нет заказов по выбранному фильтру</p>
    </div>
  `;

  modal.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-header">
        <div>
          <div class="modal-title">${formatDate(dateKey)}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px;">${escapeHtml(filtersLabel)} · ${dayOrders.length} заказов</div>
        </div>
        <button class="modal-close" onclick="closeCalendarDayModal()">${icon('x')}</button>
      </div>
      <div class="modal-body">
        <div class="calendar-modal-orders">${ordersHtml}</div>
      </div>
    </div>
  `;
  modal.classList.add('active');
  initIcons();
}

function closeCalendarDayModal() {
  document.getElementById('calendar-day-modal')?.classList.remove('active');
}

// --- ЗАГРУЗКА ЗАКАЗОВ ---
async function loadOrders() {
  const btn = document.getElementById('refresh-btn');
  if (btn) { btn.innerHTML = '<i data-lucide="loader" style="width:15px;height:15px;"></i>'; btn.disabled = true; initIcons(); }
  try {
    orders = await sbFetchOrders();
    if (typeof refreshActiveOrdersViews === 'function') refreshActiveOrdersViews();
  } catch (e) {
    showToast('Ошибка загрузки: ' + e.message, 'error');
  } finally {
    if (btn) { btn.innerHTML = '<i data-lucide="refresh-cw" style="width:15px;height:15px;"></i>'; btn.disabled = false; initIcons(); }
  }
}

function getOrdersDataSignature(list = orders) {
  const stableStringify = value => {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  };

  return stableStringify((list || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id))));
}

function refreshActiveOrdersViews() {
  if (document.getElementById('screen-home')?.classList.contains('active')) renderHome();
  if (document.getElementById('screen-months')?.classList.contains('active')) renderMonths();
  if (document.getElementById('screen-orders')?.classList.contains('active')) {
    currentMonthFilter ? renderOrdersForMonth(currentMonthFilter) : renderOrders();
  }
  if (document.getElementById('screen-order-detail')?.classList.contains('active') && typeof currentOrderDetailId !== 'undefined' && currentOrderDetailId) {
    openOrderDetail(currentOrderDetailId);
  }
  if (document.getElementById('screen-clients')?.classList.contains('active')) renderClients();
  if (document.getElementById('screen-client-detail')?.classList.contains('active') && typeof currentClientDetailKey !== 'undefined' && currentClientDetailKey) {
    openClientDetail(currentClientDetailKey);
  }
  if (document.getElementById('screen-workers')?.classList.contains('active')) renderWorkers();
  if (document.getElementById('screen-owner-payments')?.classList.contains('active')) renderOwnerPaymentsScreen();
  if (document.getElementById('screen-owner-cash')?.classList.contains('active')) renderOwnerCashScreen();
  if (document.getElementById('screen-calendar')?.classList.contains('active')) renderCalendarScreen();
}

async function refreshOrders() {
  const btn = document.getElementById('refresh-btn');
  const beforeSignature = getOrdersDataSignature();
  const beforeCashSignature = currentRole === 'owner'
    ? JSON.stringify((window.allCashLog || []).slice().sort((a, b) => String(a.id || a.created_at).localeCompare(String(b.id || b.created_at))))
    : '';

  if (btn) {
    btn.disabled = true;
    btn.dataset.state = 'loading';
    btn.innerHTML = '<i data-lucide="loader" style="width:15px;height:15px;"></i>';
    initIcons();
  }

  try {
    orders = await sbFetchOrders();
    if (currentRole === 'owner') {
      try { window.allCashLog = await sbFetchAllCashLog(); } catch(e) { window.allCashLog = window.allCashLog || []; }
    }
    const afterCashSignature = currentRole === 'owner'
      ? JSON.stringify((window.allCashLog || []).slice().sort((a, b) => String(a.id || a.created_at).localeCompare(String(b.id || b.created_at))))
      : '';
    const unchanged = beforeSignature === getOrdersDataSignature() && beforeCashSignature === afterCashSignature;
    refreshActiveOrdersViews();
    showToast(unchanged ? 'Данные актуальны: изменений в базе нет' : 'Данные из базы обновлены ✓');

    if (btn) {
      btn.dataset.state = unchanged ? 'unchanged' : 'updated';
      btn.innerHTML = unchanged
        ? '<i data-lucide="check" style="width:15px;height:15px;"></i>'
        : '<i data-lucide="refresh-cw" style="width:15px;height:15px;"></i>';
      initIcons();
      setTimeout(() => {
        btn.dataset.state = '';
        btn.innerHTML = '<i data-lucide="refresh-cw" style="width:15px;height:15px;"></i>';
        initIcons();
      }, 1800);
    }
  } catch (e) {
    showToast('Ошибка обновления: ' + e.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// --- НАВИГАЦИЯ ---
function showScreen(name) {
  const activeScreen = document.querySelector('.screen.active');
  const activeScreenId = activeScreen?.id || '';
  if (activeScreenId === 'screen-orders' && name !== 'orders') {
    if (typeof resetOrdersFilters === 'function') resetOrdersFilters();
  }
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
  if (canViewDashboard()) {
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

  if (canViewOwnerToday()) {
    const today = getLocalDateString();
    const todayOrders = orders.filter(o => isOrderFinanciallyActive(o) && o.date === today);
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
  }

  if (canViewCalendar()) {
    const monthKey = getLocalDateString().slice(0, 7);
    const monthPlannerOrders = getCalendarPlannerOrders().filter(o => String(o.date || '').startsWith(monthKey));
    const monthPlannerTotal = monthPlannerOrders.reduce((sum, o) => sum + getOrderClientTotalAmount(o), 0);
    container.innerHTML += `
      <div class="home-card" onclick="openCalendarScreen()">
        <div class="home-card-icon-wrap home-card-icon-dim">
          <i data-lucide="calendar" style="width:22px;height:22px;"></i>
        </div>
        <h3>Календарь</h3>
        <p>Планерка по дням</p>
        <div class="home-card-count" style="font-size:22px; color: var(--accent);">${monthPlannerTotal.toLocaleString('ru')} ₴</div>
      </div>
    `;
  }

  if (currentRole === 'owner') {
    const totalCash = getOwnerCurrentCashTotal();
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
    const debtOrders = orders.filter(o => typeof isWarehouseRelevantOrder === 'function'
      ? isWarehouseRelevantOrder(o)
      : (isOrderFinanciallyActive(o) && (o.supplierStatus === 'Не оплачено' || o.supplierStatus === 'Частично')));
    const debtSum = debtOrders.reduce((sum, o) => {
      if (typeof getWarehouseBalanceAmount === 'function') return sum + getWarehouseBalanceAmount(o);
      const debt = (Number(o.purchase) || 0) - (Number(o.check) || 0);
      return sum + (debt > 0 ? debt : 0);
    }, 0);

    container.innerHTML += `
      <div class="home-card" onclick="openWarehousesScreen()">
        <div class="home-card-icon-wrap home-card-icon-dim">
          <i data-lucide="package" style="width:22px;height:22px;"></i>
        </div>
        <h3>Склады</h3>
        <p>Долги и возвраты</p>
        <div class="home-card-count" style="font-size:20px; color: var(--red);">${debtSum.toLocaleString('ru')} ₴</div>
      </div>
    `;

  }

  if (canManageDropshippers()) {
    const dropshipperOrders = orders.filter(o => isOrderFinanciallyActive(o) && o.dropshipper && Number(o.dropshipperPayout) > 0);
    const dropshipperTotal = dropshipperOrders.reduce((sum, o) => {
      const paid = (o.dropshipperPayments || []).reduce((acc, payment) => acc + (Number(payment.amount) || 0), 0);
      return sum + Math.max(0, (Number(o.dropshipperPayout) || 0) - paid);
    }, 0);
    container.innerHTML += `
      <div class="home-card" onclick="openDropshippersScreen()">
        <div class="home-card-icon-wrap home-card-icon-dim">
          <i data-lucide="handshake" style="width:22px;height:22px;"></i>
        </div>
        <h3>Дропшипперы</h3>
        <p>Остаток к выплате</p>
        <div class="home-card-count" style="font-size:20px; color: var(--yellow);">${dropshipperTotal.toLocaleString('ru')} ₴</div>
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
    const totalSum = orders.filter(isOrderFinanciallyActive).reduce((s, o) => s + (Number(o.total) || 0), 0);
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

    const salaryEntries = (typeof getFinanceSalaryEntries === 'function')
      ? getFinanceSalaryEntries()
      : ((typeof allSalaries !== 'undefined' && Array.isArray(allSalaries))
        ? allSalaries.filter(entry => entry?.worker_name && entry.date && Number(entry.amount) !== 0 && !(typeof isSalaryWithdrawalEntry === 'function' && isSalaryWithdrawalEntry(entry)))
        : []);
    const currentYm = getLocalDateString().slice(0, 7);
    const monthSalaryTotal = salaryEntries
      .filter(s => s.date && s.date.startsWith(currentYm))
      .reduce((sum, s) => sum + Number(s.amount), 0);
    const anomaliesCount = (typeof getSalaryAnomalies === 'function') ? getSalaryAnomalies().length : 0;
    container.innerHTML += `
      <div class="home-card" onclick="openOwnerSalaryScreen()">
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

function getOwnerCashSeniorNames() {
  const names = (workers || [])
    .filter(w => w.systemRole === 'senior' || w.systemRole === 'extra')
    .map(w => w.name);
  if ((workers || []).some(w => w.name === 'Sasha Manager') && !names.includes('Sasha Manager')) {
    names.push('Sasha Manager');
  }
  if (!names.includes(OWNER_PENDING_CASH_WORKER_NAME)) {
    names.push(OWNER_PENDING_CASH_WORKER_NAME);
  }
  return names;
}

function getOwnerCashLogs(confirmFilter = ownerCashConfirmFilter) {
  const seniorNames = getOwnerCashSeniorNames();
  return [...(window.allCashLog || [])]
    .filter(entry => entry?.manual_payment !== true)
    .filter(entry => seniorNames.includes(entry.worker_name))
    .filter(entry => {
      const account = String(entry?.cash_account || 'cash').toLowerCase();
      if (account === 'fop') return false;
      if (entry.worker_name === OWNER_PENDING_CASH_WORKER_NAME) {
        return account === 'cash' && !!getPaymentMethodFromSourceKey(entry?.fop_source_key);
      }
      return account === 'cash';
    })
    .filter(entry => {
      const isConfirmable = isConfirmableCashEntry(entry);
      if (confirmFilter === 'confirmed') return !isConfirmable || entry.fop_confirmed === true;
      if (confirmFilter === 'pending') return isConfirmable && entry.fop_confirmed !== true;
      return true;
    });
}

function getOwnerCashBalanceLogs() {
  return getOwnerCashLogs('confirmed');
}

function getOwnerCurrencyCashLogs() {
  const seniorNames = getOwnerCashSeniorNames();
  return [...(window.allCashLog || [])]
    .filter(entry => entry?.manual_payment !== true)
    .filter(entry => seniorNames.includes(entry.worker_name))
    .filter(isCurrencyCashEntry);
}

function getOwnerCurrentCashTotal() {
  return getOwnerCashBalanceLogs().reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

function getOwnerCashSafeKey(value) {
  return btoa(unescape(encodeURIComponent(String(value || '')))).replace(/[^a-zA-Z0-9]/g, '');
}

function getOwnerCashEntryTime(entry) {
  if (!entry?.created_at) return '';
  const date = new Date(entry.created_at);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function escapeOwnerCashJsString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function setOwnerCashSelectedWorker(workerName) {
  ownerCashSelectedWorker = workerName || '';
  openOwnerCashHistoryModal(ownerCashSelectedWorker);
}

function getOwnerFopCashLogs(confirmFilter = ownerCashConfirmFilter) {
  return [...(window.allCashLog || [])]
    .filter(entry => String(entry?.cash_account || '').toLowerCase() === 'fop')
    .filter(entry => entry.worker_name === 'Oleg Starshiy')
    .filter(entry => {
      if (confirmFilter === 'confirmed') return entry.fop_confirmed === true;
      if (confirmFilter === 'pending') return entry.fop_confirmed !== true;
      return true;
    });
}

function setOwnerCashConfirmFilter(filter) {
  ownerCashConfirmFilter = ['all', 'confirmed', 'pending'].includes(filter) ? filter : 'all';
  renderOwnerCashScreen();
  if (document.getElementById('owner-cash-history-modal')?.classList.contains('active') && ownerCashSelectedWorker && ownerCashCurrencyView === 'uah') {
    openOwnerCashHistoryModal(ownerCashSelectedWorker);
  }
}

function setOwnerCashCurrencyView(currency) {
  ownerCashCurrencyView = currency === 'usd' ? 'usd' : 'uah';
  renderOwnerCashScreen();
  if (document.getElementById('owner-cash-history-modal')?.classList.contains('active') && ownerCashSelectedWorker) {
    openOwnerCashHistoryModal(ownerCashSelectedWorker);
  }
}

function getOwnerCashHistoryTitle(workerKey) {
  if (workerKey === OWNER_FOP_SELECTION_KEY) return 'БАБЕНКО';
  return getWorkerDisplayName(workerKey) || workerKey || 'Касса';
}

function getOwnerCashHistoryHtml(workerKey) {
  const logs = getOwnerCashLogs()
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  const fopLogs = getOwnerFopCashLogs()
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  const currencyLogs = getOwnerCurrencyCashLogs()
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

  if (ownerCashCurrencyView === 'usd') {
    return renderOwnerEmployeeCurrencyCashHistory(workerKey, currencyLogs) || `
      <div class="fin-month-card owner-cash-history-card">
        <div class="owner-cash-history-title">
          <div>
            <div class="fin-month-name">${escapeHtml(getOwnerCashHistoryTitle(workerKey))}</div>
            <div class="fin-month-sub">История валютной кассы</div>
          </div>
        </div>
        <div class="empty-state" style="padding:24px 12px;">
          <div class="empty-state-icon">${icon('banknote')}</div>
          <h3>Движений нет</h3>
          <p>В этой валюте у сотрудника пока нет записей</p>
        </div>
      </div>
    `;
  }

  if (workerKey === OWNER_FOP_SELECTION_KEY) {
    return renderOwnerEmployeeFopCashHistory(fopLogs);
  }
  return renderOwnerEmployeeCashHistory(workerKey, logs);
}

function openOwnerCashHistoryModal(workerKey) {
  if (!workerKey) return;
  let modal = document.getElementById('owner-cash-history-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'owner-cash-history-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }
  ownerCashSelectedWorker = workerKey;
  const title = `${getOwnerCashHistoryTitle(workerKey)}${ownerCashCurrencyView === 'usd' ? ' · $' : ''}`;
  modal.innerHTML = `
    <div class="modal" style="max-width:760px;max-height:88vh;display:flex;flex-direction:column;">
      <div class="modal-header" style="flex-shrink:0;">
        <div class="modal-title">${escapeHtml(title)}</div>
        <button class="modal-close" onclick="closeOwnerCashHistoryModal()">${icon('x')}</button>
      </div>
      <div class="modal-body" style="overflow-y:auto;flex:1;">
        ${getOwnerCashHistoryHtml(workerKey)}
      </div>
    </div>
  `;
  modal.classList.add('active');
  initIcons();
}

function closeOwnerCashHistoryModal() {
  document.getElementById('owner-cash-history-modal')?.classList.remove('active');
  ownerCashSelectedWorker = '';
}

function getOwnerCashEditableWorkers() {
  return getOwnerCashSeniorNames().filter(Boolean);
}

function renderOwnerCashWorkerOptions(selectedWorker = '') {
  return getOwnerCashEditableWorkers().map(workerName =>
    `<option value="${escapeAttr(workerName)}" ${workerName === selectedWorker ? 'selected' : ''}>${escapeHtml(getWorkerDisplayName(workerName) || workerName)}</option>`
  ).join('');
}

function openOwnerCashEntryModal(entryId = '') {
  if (currentRole !== 'owner') return;
  const entry = entryId
    ? (window.allCashLog || []).find(item => String(item.id) === String(entryId))
    : null;
  const selectedWorker = entry?.worker_name || ownerCashSelectedWorker || getOwnerCashEditableWorkers()[0] || '';

  let modal = document.getElementById('owner-cash-entry-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'owner-cash-entry-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <div class="modal-header">
        <div class="modal-title">${entry ? 'Редактировать кассу' : 'Добавить в кассу'}</div>
        <button class="modal-close" onclick="closeOwnerCashEntryModal()">${icon('x')}</button>
      </div>
      <div class="modal-body" style="display:grid;gap:12px;">
        <input type="hidden" id="owner-cash-entry-id" value="${escapeAttr(entry?.id || '')}">
        <div class="form-group">
          <label class="form-label">Сотрудник</label>
          <select class="form-select" id="owner-cash-worker">
            ${renderOwnerCashWorkerOptions(selectedWorker)}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Сумма</label>
          <input class="form-input" type="number" id="owner-cash-amount" placeholder="Например 500 или -500" value="${escapeAttr(entry ? String(Number(entry.amount) || 0) : '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Комментарий</label>
          <textarea class="form-input" id="owner-cash-comment" rows="3" placeholder="Причина записи">${escapeHtml(entry?.comment || '')}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeOwnerCashEntryModal()">Отмена</button>
        <button class="btn-primary" id="owner-cash-save-btn" onclick="saveOwnerCashEntry()">${entry ? 'Сохранить' : 'Добавить'}</button>
      </div>
    </div>
  `;
  modal.classList.add('active');
  initIcons();
}

function closeOwnerCashEntryModal() {
  document.getElementById('owner-cash-entry-modal')?.classList.remove('active');
}

async function saveOwnerCashEntry() {
  if (currentRole !== 'owner') return;
  const id = document.getElementById('owner-cash-entry-id')?.value || '';
  const workerName = document.getElementById('owner-cash-worker')?.value || '';
  const amount = Number(document.getElementById('owner-cash-amount')?.value);
  const comment = String(document.getElementById('owner-cash-comment')?.value || '').trim();
  const btn = document.getElementById('owner-cash-save-btn');

  if (!workerName) return showToast('Выберите сотрудника', 'error');
  if (!amount) return showToast('Введите сумму', 'error');
  if (!comment) return showToast('Введите комментарий', 'error');

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Сохранение...';
  }

  try {
    let saved;
    if (id) {
      saved = await sbUpdateCashEntry(id, {
        worker_name: workerName,
        amount,
        comment,
      });
      const idx = (window.allCashLog || []).findIndex(entry => String(entry.id) === String(id));
      if (idx !== -1) window.allCashLog[idx] = { ...window.allCashLog[idx], ...saved };
    } else {
      saved = await sbInsertCashEntry({
        worker_name: workerName,
        amount,
        comment,
        cash_account: 'cash',
      });
      if (!Array.isArray(window.allCashLog)) window.allCashLog = [];
      if (saved) window.allCashLog.unshift(saved);
    }

    closeOwnerCashEntryModal();
    ownerCashSelectedWorker = workerName;
    renderOwnerCashScreen();
    renderHome();
    showToast(id ? 'Запись кассы обновлена ✓' : 'Запись кассы добавлена ✓');
  } catch (e) {
    showToast('Ошибка кассы: ' + e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = id ? 'Сохранить' : 'Добавить';
    }
  }
}

async function deleteOwnerCashEntry(id) {
  if (currentRole !== 'owner' || !id) return;
  const entry = (window.allCashLog || []).find(item => String(item.id) === String(id));
  const hardDelete = !!String(entry?.deleted_at || '').trim();
  const message = hardDelete
    ? 'Удалить эту запись кассы безвозвратно? Восстановить ее уже не получится.'
    : 'Переместить эту запись кассы в удаленные? Ее можно будет восстановить позже.';
  if (!confirm(message)) return;
  try {
    if (hardDelete) {
      await sbDeleteCashEntry(id);
      if (Array.isArray(window.allCashLog)) {
        window.allCashLog = window.allCashLog.filter(entry => String(entry.id) !== String(id));
      }
    } else {
      const deletedAt = new Date().toISOString();
      const saved = await sbUpdateCashEntry(id, {
        deleted_at: deletedAt,
        deleted_by: currentWorkerName || currentRole || 'owner',
      });
      if (Array.isArray(window.allCashLog)) {
        window.allCashLog = window.allCashLog.map(item =>
          String(item.id) === String(id)
            ? { ...item, ...saved, deleted_at: saved?.deleted_at || deletedAt, deleted_by: saved?.deleted_by || currentWorkerName || currentRole || 'owner' }
            : item
        );
      }
    }
    renderOwnerCashScreen();
    renderHome();
    showToast(hardDelete ? 'Запись кассы удалена безвозвратно' : 'Запись кассы перемещена в удаленные');
  } catch (e) {
    showToast('Ошибка удаления кассы: ' + e.message, 'error');
  }
}

async function restoreOwnerCashEntry(id) {
  if (currentRole !== 'owner' || !id) return;
  try {
    const saved = await sbUpdateCashEntry(id, {
      deleted_at: null,
      deleted_by: null,
    });
    if (Array.isArray(window.allCashLog)) {
      window.allCashLog = window.allCashLog.map(item =>
        String(item.id) === String(id)
          ? { ...item, ...saved, deleted_at: null, deleted_by: null }
          : item
      );
    }
    closeOwnerDeletedCashModal();
    renderOwnerCashScreen();
    renderHome();
    showToast('Запись кассы восстановлена ✓');
  } catch (e) {
    showToast('Ошибка восстановления кассы: ' + e.message, 'error');
  }
}

function openOwnerDeletedCashModal() {
  if (currentRole !== 'owner') return;
  let modal = document.getElementById('owner-deleted-cash-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'owner-deleted-cash-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }
  const deletedEntries = (window.allCashLog || [])
    .filter(entry => !!String(entry?.deleted_at || '').trim())
    .sort((a, b) => new Date(b.deleted_at || b.created_at || 0) - new Date(a.deleted_at || a.created_at || 0));
  const rowsHtml = deletedEntries.length
    ? deletedEntries.map(entry => {
        const amount = Number(entry.amount) || 0;
        const deletedAt = entry.deleted_at ? new Date(entry.deleted_at).toLocaleString('ru-RU') : '—';
        return `
          <div class="owner-cash-entry-row">
            <div class="owner-cash-entry-main">
              <div class="owner-cash-entry-comment">${escapeHtml(getWorkerDisplayName(entry.worker_name) || entry.worker_name || '—')} · ${escapeHtml(getCashEntryDisplayComment(entry) || 'Без комментария')}</div>
              <div class="owner-cash-entry-meta">Удалено: ${escapeHtml(deletedAt)}${entry.deleted_by ? ' · ' + escapeHtml(entry.deleted_by) : ''}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="owner-cash-entry-amount" style="color:${amount >= 0 ? 'var(--accent)' : '#ef4444'};">${amount.toLocaleString('ru')} ₴</div>
              <button class="icon-btn" title="Восстановить" onclick="event.stopPropagation(); restoreOwnerCashEntry('${escapeAttr(entry.id)}')">${icon('refresh-cw')}</button>
              <button class="icon-btn icon-action-danger" title="Удалить безвозвратно" onclick="event.stopPropagation(); deleteOwnerCashEntry('${escapeAttr(entry.id)}')">${icon('trash-2')}</button>
            </div>
          </div>
        `;
      }).join('')
    : '<div class="empty-state" style="padding:24px 12px;"><div class="empty-state-icon">' + icon('trash-2') + '</div><h3>Удаленных записей нет</h3></div>';
  modal.innerHTML = `
    <div class="modal" style="max-width:760px;max-height:88vh;display:flex;flex-direction:column;">
      <div class="modal-header" style="flex-shrink:0;">
        <div class="modal-title">Удаленные записи кассы</div>
        <button class="modal-close" onclick="closeOwnerDeletedCashModal()">${icon('x')}</button>
      </div>
      <div class="modal-body" style="overflow-y:auto;flex:1;">
        <div class="fin-month-card owner-cash-history-card">
          <div class="owner-cash-history-title">
            <div>
              <div class="fin-month-name">Корзина кассы</div>
              <div class="fin-month-sub">${deletedEntries.length} зап.</div>
            </div>
          </div>
          <div style="padding:12px;">${rowsHtml}</div>
        </div>
      </div>
    </div>
  `;
  modal.classList.add('active');
  initIcons();
}

function closeOwnerDeletedCashModal() {
  document.getElementById('owner-deleted-cash-modal')?.classList.remove('active');
}

function renderOwnerEmployeeCashHistory(workerName, logs) {
  const rows = (logs || [])
    .filter(entry => entry.worker_name === workerName)
    .slice()
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  const total = rows.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  const workerKey = getOwnerCashSafeKey(workerName);

  if (!rows.length) {
    return `
      <div class="fin-month-card owner-cash-history-card">
        <div class="owner-cash-history-title">
          <div>
            <div class="fin-month-name">${escapeHtml(workerName)}</div>
            <div class="fin-month-sub">История кассы сотрудника</div>
          </div>
        </div>
        <div class="empty-state" style="padding:24px 12px;">
          <div class="empty-state-icon">${icon('receipt')}</div>
          <h3>Движений нет</h3>
          <p>У этого сотрудника пока нет записей в кассе</p>
        </div>
      </div>
    `;
  }

  const tree = {};
  for (const entry of rows) {
    const date = _ownerCashEntryDate(entry) || 'Без даты';
    const year = date === 'Без даты' ? 'Без даты' : date.slice(0, 4);
    const month = date === 'Без даты' ? 'Без даты' : date.slice(0, 7);
    if (!tree[year]) tree[year] = { total: 0, months: {} };
    tree[year].total += Number(entry.amount) || 0;
    if (!tree[year].months[month]) tree[year].months[month] = { total: 0, days: {} };
    tree[year].months[month].total += Number(entry.amount) || 0;
    if (!tree[year].months[month].days[date]) tree[year].months[month].days[date] = { total: 0, entries: [] };
    tree[year].months[month].days[date].total += Number(entry.amount) || 0;
    tree[year].months[month].days[date].entries.push(entry);
  }

  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const yearsHtml = Object.keys(tree).sort((a, b) => b.localeCompare(a)).map(year => {
    const yearData = tree[year];
    const yearKey = `owner-cash-worker-${workerKey}-year-${year}`;
    const monthsHtml = Object.keys(yearData.months).sort((a, b) => b.localeCompare(a)).map(monthKey => {
      const monthData = yearData.months[monthKey];
      const monthToggleKey = `${yearKey}-month-${monthKey}`;
      const monthName = monthKey === 'Без даты' ? 'Без даты' : `${monthNames[Number(monthKey.slice(5, 7)) - 1] || monthKey} ${monthKey.slice(0, 4)}`;
      const daysHtml = Object.keys(monthData.days).sort((a, b) => b.localeCompare(a)).map(day => {
        const dayData = monthData.days[day];
        const dayKey = `${monthToggleKey}-day-${day}`;
        const entriesHtml = dayData.entries.map(entry => {
          const amount = Number(entry.amount) || 0;
          const comment = getCashEntryDisplayComment(entry) || 'Без комментария';
          const extraMeta = getCashEntryDisplayMeta(entry);
          const time = getOwnerCashEntryTime(entry);
          const isCurrency = isCurrencyCashEntry(entry);
          const isConfirmable = isConfirmableCashEntry(entry);
          const isPendingConfirm = isConfirmable && entry?.fop_confirmed !== true;
          const account = String(entry?.cash_account || 'cash').toLowerCase();
          const paymentMethod = getPaymentMethodFromSourceKey(entry?.fop_source_key);
          const isConfirmedCard = entry?.fop_confirmed === true
            && account === 'cash'
            && paymentMethod
            && !isCashPaymentMethod(paymentMethod)
            && !isFopPaymentMethod(paymentMethod);
          const cardTag = isConfirmedCard
            ? '<span style="display:inline-flex;align-items:center;padding:2px 7px;border-radius:999px;background:rgba(29,233,182,.12);border:1px solid rgba(29,233,182,.22);color:var(--accent);font-size:10px;font-weight:800;margin-left:6px;">карта</span>'
            : '';
          return `
            <div class="owner-cash-entry-row">
              <div class="owner-cash-entry-main">
                <div class="owner-cash-entry-comment">${escapeHtml(comment)}${cardTag}</div>
                <div class="owner-cash-entry-meta">${time ? escapeHtml(time) : '—'}${extraMeta ? ' · ' + escapeHtml(extraMeta) : ''} ${renderOwnerCashEntryConfirmBadge(entry)}</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                ${isPendingConfirm ? `<button class="btn-primary" style="min-height:34px;padding:0 12px;border-radius:8px;font-size:12px;font-weight:800;" onclick="event.stopPropagation(); confirmOwnerCashEntry('${escapeOwnerCashJsString(entry.id)}')">Подтвердить</button>` : ''}
                <div class="owner-cash-entry-amount" style="color:${amount >= 0 ? 'var(--accent)' : '#ef4444'};">${amount.toLocaleString('ru')} ₴</div>
                ${isCurrency ? '' : `<button class="icon-btn" title="Редактировать" onclick="event.stopPropagation(); openOwnerCashEntryModal('${escapeAttr(entry.id)}')">${icon('pencil')}</button>`}
                <button class="icon-btn icon-action-danger" title="Удалить" onclick="event.stopPropagation(); deleteOwnerCashEntry('${escapeAttr(entry.id)}')">${icon('trash-2')}</button>
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
              <div style="font-size:13px;font-weight:800;color:${dayData.total >= 0 ? 'var(--accent)' : '#ef4444'};">${dayData.total.toLocaleString('ru')} ₴</div>
            </div>
            <div id="profile-month-body-${dayKey}" style="display:none;padding:0 12px 10px 28px;">
              ${entriesHtml}
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
            <div style="font-size:14px;font-weight:800;color:${monthData.total >= 0 ? 'var(--accent)' : '#ef4444'};">${monthData.total.toLocaleString('ru')} ₴</div>
          </div>
          <div id="profile-month-body-${monthToggleKey}" style="display:none;background:var(--surface2);border-radius:0 0 8px 8px;">
            ${daysHtml}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div style="border-bottom:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;cursor:pointer;" onclick="toggleProfileMonth('${yearKey}')">
          <div style="display:flex;align-items:center;gap:8px;">
            <i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${yearKey}"></i>
            <div style="font-size:14px;font-weight:800;color:var(--text);">${year}</div>
            <div style="font-size:11px;color:var(--text3);">${Object.keys(yearData.months).length} мес.</div>
          </div>
          <div style="font-size:14px;font-weight:900;color:${yearData.total >= 0 ? 'var(--accent)' : '#ef4444'};">${yearData.total.toLocaleString('ru')} ₴</div>
        </div>
        <div id="profile-month-body-${yearKey}" style="display:none;">
          ${monthsHtml}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="fin-month-card owner-cash-history-card">
      <div class="owner-cash-history-title">
        <div>
          <div class="fin-month-name">${escapeHtml(workerName)}</div>
          <div class="fin-month-sub">История кассы сотрудника</div>
        </div>
        <div style="font-size:18px;font-weight:900;color:${total >= 0 ? 'var(--accent)' : '#ef4444'};white-space:nowrap;">${total.toLocaleString('ru')} ₴</div>
      </div>
      <div>${yearsHtml}</div>
    </div>
  `;
}

function renderOwnerEmployeeFopCashHistory(logs) {
  const rows = (logs || [])
    .slice()
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  const total = rows.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  const workerKey = getOwnerCashSafeKey('oleg-fop');

  if (!rows.length) {
    return `
      <div class="fin-month-card owner-cash-history-card">
        <div class="owner-cash-history-title">
          <div>
            <div class="fin-month-name">Касса БАБЕНКО</div>
            <div class="fin-month-sub">История ФОП Бабенко</div>
          </div>
        </div>
        <div class="empty-state" style="padding:24px 12px;">
          <div class="empty-state-icon">${icon('receipt')}</div>
          <h3>Движений нет</h3>
          <p>По ФОП Бабенко пока нет записей</p>
        </div>
      </div>
    `;
  }

  const tree = {};
  for (const entry of rows) {
    const date = _ownerCashEntryDate(entry) || 'Без даты';
    const year = date === 'Без даты' ? 'Без даты' : date.slice(0, 4);
    const month = date === 'Без даты' ? 'Без даты' : date.slice(0, 7);
    if (!tree[year]) tree[year] = { total: 0, months: {} };
    tree[year].total += Number(entry.amount) || 0;
    if (!tree[year].months[month]) tree[year].months[month] = { total: 0, days: {} };
    tree[year].months[month].total += Number(entry.amount) || 0;
    if (!tree[year].months[month].days[date]) tree[year].months[month].days[date] = { total: 0, entries: [] };
    tree[year].months[month].days[date].total += Number(entry.amount) || 0;
    tree[year].months[month].days[date].entries.push(entry);
  }

  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const yearsHtml = Object.keys(tree).sort((a, b) => b.localeCompare(a)).map(year => {
    const yearData = tree[year];
    const yearKey = `owner-fop-worker-${workerKey}-year-${year}`;
    const monthsHtml = Object.keys(yearData.months).sort((a, b) => b.localeCompare(a)).map(monthKey => {
      const monthData = yearData.months[monthKey];
      const monthToggleKey = `${yearKey}-month-${monthKey}`;
      const monthName = monthKey === 'Без даты' ? 'Без даты' : `${monthNames[Number(monthKey.slice(5, 7)) - 1] || monthKey} ${monthKey.slice(0, 4)}`;
      const daysHtml = Object.keys(monthData.days).sort((a, b) => b.localeCompare(a)).map(day => {
        const dayData = monthData.days[day];
        const dayKey = `${monthToggleKey}-day-${day}`;
        const entriesHtml = dayData.entries.map(entry => {
          const amount = Number(entry.amount) || 0;
          const comment = getCashEntryDisplayComment(entry) || 'Без комментария';
          const time = getOwnerCashEntryTime(entry);
          return `
            <div class="owner-cash-entry-row">
              <div class="owner-cash-entry-main">
                <div class="owner-cash-entry-comment">${escapeHtml(comment)}</div>
                <div class="owner-cash-entry-meta">${time ? escapeHtml(time) : '—'} ${renderOwnerCashEntryConfirmBadge(entry)}</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <div class="owner-cash-entry-amount" style="color:${amount >= 0 ? 'var(--accent)' : '#ef4444'};">${amount.toLocaleString('ru')} ₴</div>
                <button class="icon-btn icon-action-danger" title="Удалить" onclick="event.stopPropagation(); deleteOwnerCashEntry('${escapeAttr(entry.id)}')">${icon('trash-2')}</button>
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
              <div style="font-size:13px;font-weight:800;color:${dayData.total >= 0 ? 'var(--accent)' : '#ef4444'};">${dayData.total.toLocaleString('ru')} ₴</div>
            </div>
            <div id="profile-month-body-${dayKey}" style="display:none;padding:0 12px 10px 28px;">${entriesHtml}</div>
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
            <div style="font-size:14px;font-weight:800;color:${monthData.total >= 0 ? 'var(--accent)' : '#ef4444'};">${monthData.total.toLocaleString('ru')} ₴</div>
          </div>
          <div id="profile-month-body-${monthToggleKey}" style="display:none;background:var(--surface2);border-radius:0 0 8px 8px;">${daysHtml}</div>
        </div>
      `;
    }).join('');

    return `
      <div style="border-bottom:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;cursor:pointer;" onclick="toggleProfileMonth('${yearKey}')">
          <div style="display:flex;align-items:center;gap:8px;">
            <i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${yearKey}"></i>
            <div style="font-size:14px;font-weight:800;color:var(--text);">${year}</div>
            <div style="font-size:11px;color:var(--text3);">${Object.keys(yearData.months).length} мес.</div>
          </div>
          <div style="font-size:14px;font-weight:900;color:${yearData.total >= 0 ? 'var(--accent)' : '#ef4444'};">${yearData.total.toLocaleString('ru')} ₴</div>
        </div>
        <div id="profile-month-body-${yearKey}" style="display:none;">${monthsHtml}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="fin-month-card owner-cash-history-card">
      <div class="owner-cash-history-title">
        <div>
          <div class="fin-month-name">Касса БАБЕНКО</div>
          <div class="fin-month-sub">История ФОП Бабенко</div>
        </div>
        <div style="font-size:18px;font-weight:900;color:${total >= 0 ? 'var(--accent)' : '#ef4444'};white-space:nowrap;">${total.toLocaleString('ru')} ₴</div>
      </div>
      <div>${yearsHtml}</div>
    </div>
  `;
}

function renderOwnerEmployeeCurrencyCashHistory(workerName, logs) {
  const rows = (logs || [])
    .filter(entry => entry.worker_name === workerName)
    .slice()
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  if (!rows.length) return '';

  const total = calcCurrencyCashBalance(rows);
  const workerKey = getOwnerCashSafeKey(workerName + '-currency');
  const tree = {};

  for (const entry of rows) {
    const parsed = parseCurrencyCashEntry(entry);
    if (!parsed) continue;
    const date = _ownerCashEntryDate(entry) || 'Без даты';
    const year = date === 'Без даты' ? 'Без даты' : date.slice(0, 4);
    const month = date === 'Без даты' ? 'Без даты' : date.slice(0, 7);
    if (!tree[year]) tree[year] = { total: 0, months: {} };
    tree[year].total += parsed.usdAmount;
    if (!tree[year].months[month]) tree[year].months[month] = { total: 0, days: {} };
    tree[year].months[month].total += parsed.usdAmount;
    if (!tree[year].months[month].days[date]) tree[year].months[month].days[date] = { total: 0, entries: [] };
    tree[year].months[month].days[date].total += parsed.usdAmount;
    tree[year].months[month].days[date].entries.push(entry);
  }

  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const yearsHtml = Object.keys(tree).sort((a, b) => b.localeCompare(a)).map(year => {
    const yearData = tree[year];
    const yearKey = `owner-currency-worker-${workerKey}-year-${year}`;
    const monthsHtml = Object.keys(yearData.months).sort((a, b) => b.localeCompare(a)).map(monthKey => {
      const monthData = yearData.months[monthKey];
      const monthToggleKey = `${yearKey}-month-${monthKey}`;
      const monthName = monthKey === 'Без даты' ? 'Без даты' : `${monthNames[Number(monthKey.slice(5, 7)) - 1] || monthKey} ${monthKey.slice(0, 4)}`;
      const daysHtml = Object.keys(monthData.days).sort((a, b) => b.localeCompare(a)).map(day => {
        const dayData = monthData.days[day];
        const dayKey = `${monthToggleKey}-day-${day}`;
        const entriesHtml = dayData.entries.map(entry => {
          const parsed = parseCurrencyCashEntry(entry);
          const time = getOwnerCashEntryTime(entry);
          const title = getCashEntryDisplayComment(entry) || 'Обмен в валютную кассу';
          const meta = getCashEntryDisplayMeta(entry);
          return `
            <div class="owner-cash-entry-row">
              <div class="owner-cash-entry-main">
                <div class="owner-cash-entry-comment">${escapeHtml(title)}</div>
                <div class="owner-cash-entry-meta">${time ? escapeHtml(time) : '—'}${meta ? ' · ' + escapeHtml(meta) : ''}</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <div class="owner-cash-entry-amount" style="color:${Number(parsed?.usdAmount || 0) >= 0 ? 'var(--accent)' : '#ef4444'};">${Number(parsed?.usdAmount || 0) >= 0 ? '+' : ''}${Number(parsed?.usdAmount || 0).toLocaleString('ru')} $</div>
                <button class="icon-btn icon-action-danger" title="Удалить" onclick="event.stopPropagation(); deleteOwnerCashEntry('${escapeAttr(entry.id)}')">${icon('trash-2')}</button>
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
              <div style="font-size:13px;font-weight:800;color:${dayData.total >= 0 ? 'var(--accent)' : '#ef4444'};">${dayData.total >= 0 ? '+' : ''}${dayData.total.toLocaleString('ru')} $</div>
            </div>
            <div id="profile-month-body-${dayKey}" style="display:none;padding:0 12px 10px 28px;">
              ${entriesHtml}
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
            <div style="font-size:14px;font-weight:800;color:${monthData.total >= 0 ? 'var(--accent)' : '#ef4444'};">${monthData.total >= 0 ? '+' : ''}${monthData.total.toLocaleString('ru')} $</div>
          </div>
          <div id="profile-month-body-${monthToggleKey}" style="display:none;background:var(--surface2);border-radius:0 0 8px 8px;">
            ${daysHtml}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div style="border-bottom:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;cursor:pointer;" onclick="toggleProfileMonth('${yearKey}')">
          <div style="display:flex;align-items:center;gap:8px;">
            <i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text3);transition:transform 0.2s;" id="pchevron-${yearKey}"></i>
            <div style="font-size:14px;font-weight:800;color:var(--text);">${year}</div>
            <div style="font-size:11px;color:var(--text3);">${Object.keys(yearData.months).length} мес.</div>
          </div>
          <div style="font-size:14px;font-weight:900;color:${yearData.total >= 0 ? 'var(--accent)' : '#ef4444'};">${yearData.total >= 0 ? '+' : ''}${yearData.total.toLocaleString('ru')} $</div>
        </div>
        <div id="profile-month-body-${yearKey}" style="display:none;">
          ${monthsHtml}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="fin-month-card owner-cash-history-card">
      <div class="owner-cash-history-title">
        <div>
          <div class="fin-month-name">${escapeHtml(workerName)}</div>
          <div class="fin-month-sub">История валютной кассы</div>
        </div>
        <div style="font-size:18px;font-weight:900;color:${total >= 0 ? 'var(--accent)' : '#ef4444'};white-space:nowrap;">${total >= 0 ? '+' : ''}${total.toLocaleString('ru')} $</div>
      </div>
      <div>${yearsHtml}</div>
    </div>
  `;
}

function renderOwnerCashEntryConfirmBadge(entry) {
  if (!isConfirmableCashEntry(entry)) return '';
  const confirmed = entry?.fop_confirmed === true;
  const label = confirmed ? 'подтверждено' : 'ожидает подтверждения';
  const color = confirmed ? 'var(--accent)' : 'var(--yellow)';
  return `<span style="margin-left:6px;color:${color};font-weight:800;">${label}</span>`;
}

async function confirmOwnerCashEntry(id) {
  if (currentRole !== 'owner' || !id) return;
  try {
    const updated = await sbUpdateCashEntry(id, { fop_confirmed: true });
    if (Array.isArray(window.allCashLog)) {
      window.allCashLog = window.allCashLog.map(entry =>
        entry.id === id ? { ...entry, ...updated, fop_confirmed: true } : entry
      );
    }
    renderOwnerCashScreen();
    const paymentMethod = getPaymentMethodFromSourceKey(updated?.fop_source_key);
    if (paymentMethod) showToast(`Подтверждено: ${paymentMethod} ✓`);
    else showToast('Запись подтверждена ✓');
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}

function isOwnerFopPaymentEntryVisible(entry) {
  if (entry?.manual_payment === true) return false;
  if (String(entry?.cash_account || '').toLowerCase() !== 'fop' || entry.fop_confirmed !== true) return false;
  const source = String(entry.fop_source_key || '');
  if (!source.startsWith('order:')) return true;
  const orderId = source.split(':')[1];
  const sourceOrder = (orders || []).find(order => String(order.id) === orderId);
  return isOrderFinanciallyActive(sourceOrder);
}

function getOwnerPaymentEntries() {
  const entries = [];

  for (const order of (orders || [])) {
    if (!isOrderFinanciallyActive(order)) continue;

    const clientTotal = getOrderClientTotalAmount(order);
    const clientPayments = (order.clientPayments || [])
      .filter(payment => Number(payment.amount) > 0 && normalizePaymentMethod(payment.method));

    if (clientPayments.length) {
      let clientPaidSoFar = 0;
      clientPayments.forEach(payment => {
        const amount = Number(payment.amount) || 0;
        const method = normalizePaymentMethod(payment.method);
        const isFop = isFopPaymentMethod(method);
        if (isFop) return;
        clientPaidSoFar += amount;
        entries.push({
          type: 'client',
          title: 'Оплата клиента',
          amount,
          method,
          date: payment.date || order.date || '',
          paidSoFar: clientPaidSoFar,
          totalDue: clientTotal,
          progressLabel: 'Клиент оплатил',
          order,
        });
      });
    } else if (order.paymentMethod && getOrderClientPaidAmount(order) > 0) {
      const method = normalizePaymentMethod(order.paymentMethod);
      const isFop = isFopPaymentMethod(method);
      if (!isFop) {
        entries.push({
          type: 'client',
          title: 'Оплата клиента',
          amount: getOrderClientPaidAmount(order),
          method,
          date: order.date || '',
          paidSoFar: getOrderClientPaidAmount(order),
          totalDue: clientTotal,
          progressLabel: 'Клиент оплатил',
          order,
        });
      }
    }

    let supplierPaidSoFar = 0;
    (order.supplierPayments || []).forEach(payment => {
      const method = normalizePaymentMethod(payment.method);
      const amount = Number(payment.amount) || 0;
      const isFop = isFopPaymentMethod(method);
      if (!amount || !method || isCashPaymentMethod(method) || isFop) return;
      if (amount > 0) supplierPaidSoFar += amount;
      entries.push({
        type: 'supplier',
        title: 'Оплата поставщику',
        amount: -amount,
        method,
        date: payment.date || order.date || '',
        paidSoFar: supplierPaidSoFar,
        totalDue: Number(order.purchase) || 0,
        progressLabel: 'Поставщику оплачено',
        order,
      });
    });

    let dropshipperPaidSoFar = 0;
    (order.dropshipperPayments || []).forEach(payment => {
      const method = normalizePaymentMethod(payment.method);
      const amount = Number(payment.amount) || 0;
      const isFop = isFopPaymentMethod(method);
      if (!amount || !method || isFop) return;
      if (amount > 0) dropshipperPaidSoFar += amount;
      entries.push({
        type: 'dropshipper',
        title: `Выплата дропшипперу${order.dropshipper ? ': ' + order.dropshipper : ''}`,
        amount: -amount,
        method,
        date: payment.date || order.date || '',
        paidSoFar: dropshipperPaidSoFar,
        totalDue: Number(order.dropshipperPayout) || 0,
        progressLabel: 'Дропшипперу выплачено',
        order,
      });
    });
  }

  (window.allCashLog || [])
    .filter(isOwnerFopPaymentEntryVisible)
    .forEach(entry => {
      entries.push({
        type: 'fop',
        title: 'Касса БАБЕНКО',
        amount: Number(entry.amount) || 0,
        method: 'БАБЕНКО',
        date: entry.fop_date || _ownerCashEntryDate(entry),
        cashEntry: entry,
      });
    });

  (window.allCashLog || [])
    .filter(entry => {
      const paymentMethod = getPaymentMethodFromSourceKey(entry?.fop_source_key);
      if (String(entry?.cash_account || '').toLowerCase() !== 'cash' || entry.fop_confirmed !== true) return false;
      if (!isSashaManagerCardPaymentMethod(paymentMethod)) return false;
      return !String(entry.fop_source_key || '').startsWith('order:');
    })
    .forEach(entry => {
      entries.push({
        type: 'client',
        title: 'Карта Саши',
        amount: Number(entry.amount) || 0,
        method: 'Карта Саши',
        date: entry.fop_date || _ownerCashEntryDate(entry),
        cashEntry: entry,
      });
    });

  (window.allCashLog || [])
    .filter(entry => entry?.manual_payment === true && normalizePaymentMethod(entry.manual_payment_method))
    .forEach(entry => {
      entries.push({
        type: 'manual',
        title: 'Ручная запись',
        amount: Number(entry.amount) || 0,
        method: normalizeManualOwnerPaymentMethod(entry.manual_payment_method),
        date: _ownerCashEntryDate(entry),
        cashEntry: entry,
      });
    });

  return entries.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function normalizeManualOwnerPaymentMethod(method) {
  const normalized = normalizePaymentMethod(method);
  return isFopPaymentMethod(normalized) ? 'БАБЕНКО' : normalized;
}

function renderOwnerPaymentProgress(entry) {
  const paid = Number(entry?.paidSoFar) || 0;
  const total = Number(entry?.totalDue) || 0;
  if (!paid && !total) return '';

  const label = entry.progressLabel || (entry.type === 'supplier'
    ? 'Поставщику оплачено'
    : (entry.type === 'dropshipper' ? 'Дропшипперу выплачено' : 'Клиент оплатил'));
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
      <label class="checkbox order-flag-checkbox">
        <input type="checkbox" ${ownerPaymentFilters.dropshipper ? 'checked' : ''} onchange="setOwnerPaymentFilter('dropshipper', this.checked)">
        <span>Выплаты дропшипперам</span>
      </label>
      <label class="checkbox order-flag-checkbox">
        <input type="checkbox" ${ownerPaymentFilters.fop ? 'checked' : ''} onchange="setOwnerPaymentFilter('fop', this.checked)">
        <span>БАБЕНКО</span>
      </label>
      <label class="checkbox order-flag-checkbox">
        <input type="checkbox" ${ownerPaymentFilters.manual ? 'checked' : ''} onchange="setOwnerPaymentFilter('manual', this.checked)">
        <span>Ручные записи</span>
      </label>
    </div>
  `;
}

function renderOwnerManualPaymentForm() {
  const methods = (PAYMENT_METHOD_OPTIONS || []).map(normalizePaymentMethod);
  return `
    <div class="owner-manual-payment-card">
      <div class="owner-manual-payment-title">Ручная запись</div>
      <div class="owner-manual-payment-grid">
        <label class="owner-manual-payment-field">
          <span class="form-label">Способ оплаты</span>
          <select class="form-select" id="owner-manual-payment-method">
            <option value="">— выбрать —</option>
            ${methods.map(method => `<option value="${escapeAttr(method)}">${escapeHtml(method)}</option>`).join('')}
          </select>
        </label>
        <label class="owner-manual-payment-field">
          <span class="form-label">Сумма</span>
          <input class="form-input" type="number" id="owner-manual-payment-amount" placeholder="-500 или 500">
        </label>
        <label class="owner-manual-payment-field owner-manual-payment-comment">
          <span class="form-label">Комментарий</span>
          <input class="form-input" type="text" id="owner-manual-payment-comment" placeholder="Напр. комиссия банка">
        </label>
        <button class="btn-primary owner-manual-payment-button" id="owner-manual-payment-save-btn" onclick="saveOwnerManualPayment()">Записать</button>
      </div>
      <div class="owner-manual-payment-hint">Минус — расход, плюс — приход. Запись появится в выбранной группе оплат.</div>
    </div>
  `;
}

async function saveOwnerManualPayment() {
  if (currentRole !== 'owner') return;
  const method = normalizePaymentMethod(document.getElementById('owner-manual-payment-method')?.value || '');
  const amount = Number(document.getElementById('owner-manual-payment-amount')?.value) || 0;
  const comment = document.getElementById('owner-manual-payment-comment')?.value.trim() || '';
  if (!method) return showToast('Выберите способ оплаты', 'error');
  if (!amount) return showToast('Введите сумму', 'error');
  if (!comment) return showToast('Введите комментарий', 'error');

  const btn = document.getElementById('owner-manual-payment-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Запись...'; }

  try {
    const entry = await sbInsertCashEntry({
      worker_name: 'OWNER_PAYMENTS',
      amount,
      comment,
      cash_account: 'cash',
      manual_payment: true,
      manual_payment_method: method,
    });
    if (Array.isArray(window.allCashLog) && entry) window.allCashLog.unshift(entry);
    renderOwnerPaymentsScreen();
    showToast('Запись добавлена ✓');
  } catch (e) {
    showToast('Ошибка записи: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Записать'; }
  }
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
    .filter(o => isOrderFinanciallyActive(o) && o.date === today)
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
      ${renderOwnerManualPaymentForm()}
      <div class="empty-state">
        <div class="empty-state-icon">${icon('credit-card')}</div>
        <h3>Оплат нет</h3>
        <p>Когда появятся оплаты или ручные записи, они будут собраны здесь</p>
      </div>
    `;
    initIcons();
    return;
  }

  if (!paymentEntries.length) {
    container.innerHTML = `
      ${renderOwnerManualPaymentForm()}
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

  container.innerHTML = renderOwnerManualPaymentForm() + renderOwnerPaymentFilters() + methodNames.map(method => {
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
            if (entry.type === 'fop' && entry.cashEntry) {
              const cashEntry = entry.cashEntry || {};
              return `
                <div class="order-card" style="margin:8px 0 0;cursor:default;">
                  <div class="order-card-top">
                    <div class="order-card-left">
                      <span class="order-id">БАБЕНКО</span>
                      <span class="order-name">${escapeHtml(cashEntry.comment || '—')}</span>
                    </div>
                    <div style="font-size:16px;font-weight:800;color:${isExpense ? 'var(--red)' : 'var(--accent)'};">${amount.toLocaleString('ru')} ₴</div>
                  </div>
                  <div class="order-card-meta">
                    <span class="order-meta-item">${escapeHtml(cashEntry.worker_name || '—')}</span>
                    <span class="order-meta-item">${entry.title}</span>
                  </div>
                </div>
              `;
            }
            if (entry.type === 'manual' && entry.cashEntry) {
              const cashEntry = entry.cashEntry || {};
              return `
                <div class="order-card" style="margin:8px 0 0;cursor:default;">
                  <div class="order-card-top">
                    <div class="order-card-left">
                      <span class="order-id">РУЧНАЯ</span>
                      <span class="order-name">${escapeHtml(cashEntry.comment || '—')}</span>
                    </div>
                    <div style="font-size:16px;font-weight:800;color:${isExpense ? 'var(--red)' : 'var(--accent)'};">${amount.toLocaleString('ru')} ₴</div>
                  </div>
                  <div class="order-card-meta">
                    <span class="order-meta-item">${entry.title}</span>
                    <span class="order-meta-item">${escapeHtml(cashEntry.manual_payment_method || entry.method || '—')}</span>
                  </div>
                </div>
              `;
            }
            if (entry.cashEntry && entry.method === 'Карта Саши') {
              const cashEntry = entry.cashEntry || {};
              return `
                <div class="order-card" style="margin:8px 0 0;cursor:default;">
                  <div class="order-card-top">
                    <div class="order-card-left">
                      <span class="order-id">КАРТА</span>
                      <span class="order-name">${escapeHtml(cashEntry.comment || '—')}</span>
                    </div>
                    <div style="font-size:16px;font-weight:800;color:${isExpense ? 'var(--red)' : 'var(--accent)'};">${amount.toLocaleString('ru')} ₴</div>
                  </div>
                  <div class="order-card-meta">
                    <span class="order-meta-item">${escapeHtml(cashEntry.worker_name || '—')}</span>
                    <span class="order-meta-item">${entry.title}</span>
                  </div>
                </div>
              `;
            }
            return `
              <div class="order-card ${getOrderCardStateClass(order)}" style="margin:8px 0 0;cursor:pointer;" onclick="openOrderDetail('${order.id}')">
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

  const seniorNames = getOwnerCashSeniorNames();
  const balanceLogs = getOwnerCashBalanceLogs()
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  const fopLogs = getOwnerFopCashLogs()
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  const currencyLogs = getOwnerCurrencyCashLogs()
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

  const balances = {};
  for (const entry of balanceLogs) {
    const workerName = entry.worker_name;
    balances[workerName] = (balances[workerName] || 0) + (Number(entry.amount) || 0);
  }

  const currencyBalances = {};
  for (const entry of currencyLogs) {
    const parsed = parseCurrencyCashEntry(entry);
    if (!parsed) continue;
    currencyBalances[entry.worker_name] = (currencyBalances[entry.worker_name] || 0) + parsed.usdAmount;
  }

  const currentCashRows = seniorNames.map(name => ({
    workerName: name,
    balance: Number(balances[name] || 0),
  }));
  const currentCurrencyRows = seniorNames.map(name => ({
    workerName: name,
    balance: Number(currencyBalances[name] || 0),
  }));
  const currentFopTotal = fopLogs
    .filter(entry => entry.fop_confirmed === true)
    .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  const currentCashTotal = currentCashRows.reduce((sum, row) => sum + row.balance, 0);
  const currentCurrencyTotal = currentCurrencyRows.reduce((sum, row) => sum + row.balance, 0);
  const isUahView = ownerCashCurrencyView !== 'usd';
  const total = isUahView ? currentCashTotal : currentCurrencyTotal;
  const rows = isUahView
    ? [
        ...currentCashRows,
        { workerName: OWNER_FOP_SELECTION_KEY, balance: currentFopTotal, label: 'БАБЕНКО' },
      ]
    : currentCurrencyRows;
  const filtersHtml = isUahView ? `
    <div class="owner-cash-confirm-filters">
      <button class="orders-tab ${ownerCashConfirmFilter === 'all' ? 'active' : ''}" onclick="setOwnerCashConfirmFilter('all')">Все</button>
      <button class="orders-tab ${ownerCashConfirmFilter === 'confirmed' ? 'active' : ''}" onclick="setOwnerCashConfirmFilter('confirmed')">Подтверждено</button>
      <button class="orders-tab ${ownerCashConfirmFilter === 'pending' ? 'active' : ''}" onclick="setOwnerCashConfirmFilter('pending')">Ожидает</button>
    </div>
  ` : '';
  const rowsHtml = rows.length
    ? rows.map(row => `
        <div class="owner-cash-worker-row" onclick="setOwnerCashSelectedWorker('${escapeAttr(row.workerName)}')">
          <div class="owner-cash-worker-name">${escapeHtml(row.label || getWorkerDisplayName(row.workerName) || row.workerName)}</div>
          <div class="owner-cash-worker-balance" style="color:${row.balance >= 0 ? 'var(--accent)' : '#ef4444'};">${row.balance.toLocaleString('ru')} ${isUahView ? '₴' : '$'}</div>
        </div>
      `).join('')
    : `<div style="font-size:13px;color:var(--text3);">${isUahView ? 'Сотрудники с кассой не найдены' : 'Валютных обменов пока нет'}</div>`;
  const currentCashHtml = `
    <div class="fin-month-card" style="margin-bottom:12px;">
      <div style="padding:14px 16px;border-bottom:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
          <div>
            <div class="fin-month-name">Текущая касса</div>
            <div class="fin-month-sub">${isUahView ? 'Баланс считает только подтвержденные записи' : 'Баланс в долларах после обмена из гривневой кассы'}</div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
            <div class="owner-cash-confirm-filters" style="padding:0;">
              <button class="orders-tab ${isUahView ? 'active' : ''}" onclick="setOwnerCashCurrencyView('uah')">₴</button>
              <button class="orders-tab ${!isUahView ? 'active' : ''}" onclick="setOwnerCashCurrencyView('usd')">$</button>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
              <div style="font-size:22px;font-weight:900;color:${total >= 0 ? 'var(--accent)' : '#ef4444'};white-space:nowrap;">${total.toLocaleString('ru')} ${isUahView ? '₴' : '$'}</div>
              ${isUahView ? `<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;"><button class="btn-secondary" style="font-size:12px;padding:6px 10px;" onclick="openOwnerCashEntryModal()">+ Запись</button><button class="btn-secondary" style="font-size:12px;padding:6px 10px;" onclick="openOwnerDeletedCashModal()">Корзина</button></div>` : ''}
            </div>
          </div>
        </div>
      </div>
      <div style="padding:12px 16px 0;">${filtersHtml}</div>
      <div style="padding:12px 16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;">
        ${rowsHtml}
      </div>
    </div>
  `;

  if (!balanceLogs.length && !fopLogs.length && !currencyLogs.length) {
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
  container.innerHTML = currentCashHtml;
  initIcons();
}

// --- ОТКРЫТИЕ РАЗДЕЛОВ ---
function openOrdersScreen() {
  window.currentYearFilter = null;
  currentMonthFilter = null;
  const titleEl = document.querySelector('#screen-orders .page-title');
  if (titleEl) {
    titleEl.innerHTML = `${icon('clipboard-list')} Записи`;
  }
  initOrderTabs();
  setupOrderActions();
  renderOrders();
  showScreen('orders');
  setActiveNav('orders');
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
  } else {
    setupOrderActions();
    renderOrders();
    showScreen('orders');
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
