// ============================================================
// AUTH.JS — авторизация через Cloudflare Worker
// ============================================================

async function doLogin() {
  const pwd   = document.getElementById('auth-password').value.trim();
  const errEl = document.getElementById('auth-error');
  const btn   = document.getElementById('auth-login-btn');

  if (!pwd) return;

  btn.disabled = true;
  btn.textContent = '⏳';
  errEl.style.display = 'none';

  try {
    const res  = await fetch(`${WORKER_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd }),
    });
    const data = await res.json();

    if (!data.ok) {
      errEl.style.display = 'block';
      document.getElementById('auth-password').value = '';
      document.getElementById('auth-password').focus();
      return;
    }

    currentRole       = data.role;
    currentWorkerName = data.workerName || '';
    sessionToken      = data.token;
    localStorage.setItem('crm_role',        data.role);
    localStorage.setItem('crm_token',       data.token);
    localStorage.setItem('crm_worker_name', data.workerName || '');

    _showApp(data.role, data.workerName);
    initIcons();
    initApp();

  } catch (e) {
    errEl.textContent = 'Ошибка соединения';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Войти →';
  }
}

function doLogout() {
  currentRole       = null;
  currentWorkerName = null;
  sessionToken      = null;
  localStorage.removeItem('crm_role');
  localStorage.removeItem('crm_token');
  localStorage.removeItem('crm_worker_name');

  document.getElementById('auth-password').value = '';
  document.getElementById('app').style.display   = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('auth-error').style.display  = 'none';
  document.getElementById('auth-error').textContent    = 'Неверный пароль';
}

function autoLogin() {
  const savedRole  = localStorage.getItem('crm_role');
  const savedToken = localStorage.getItem('crm_token');
  const savedName  = localStorage.getItem('crm_worker_name') || '';

  if (!savedRole || !savedToken) return;

  // Проверяем что токен не содержит не-ASCII символов (старый формат с кириллицей)
  // Если содержит — сбрасываем и показываем экран входа
  if (!/^[\x00-\x7F]*$/.test(savedToken)) {
    localStorage.removeItem('crm_role');
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_worker_name');
    return;
  }

  currentRole       = savedRole;
  currentWorkerName = savedName;
  sessionToken      = savedToken;

  _showApp(savedRole, savedName);
  initIcons();
  initApp();
}

function _showApp(role, workerName) {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display         = 'flex';

  // Пересоздаём лоадер при каждом входе (при повторном логине он уже удалён)
  let loader = document.getElementById('app-loading');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'app-loading';
    loader.innerHTML = `
      <div class="loader-ring">
        <div class="loader-glow"></div>
        <svg viewBox="0 0 64 64"><circle class="loader-ring-track" cx="32" cy="32" r="28"/><circle class="loader-ring-arc" cx="32" cy="32" r="28"/></svg>
      </div>
      <div class="loader-greeting">Привет, <span id="loader-name">...</span>!</div>
      <div class="loader-sub">Загружаем данные</div>
    `;
    document.getElementById('app').prepend(loader);
  }

  // Вставляем имя в лоадер
  const loaderName = document.getElementById('loader-name');
  if (loaderName) loaderName.textContent = workerName || 'друг';

  const badge = document.getElementById('role-badge');
  if (role === 'owner') {
    badge.textContent = '👑 ' + (workerName || 'Владелец');
  } else {
    const roleLabel = ROLE_LABELS[role] || role;
    badge.textContent = workerName ? `${workerName} · ${roleLabel.replace(/^.\s/, '')}` : roleLabel;
  }
  badge.className = 'role-badge role-' + role;
}
