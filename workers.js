// ============================================================
// WORKERS.JS — экран сотрудников, модал редактирования
// ============================================================

const WORKER_PERMISSION_DEFINITIONS = [
  { key: 'orders_view_all', label: 'Видеть все заказы' },
  { key: 'orders_create', label: 'Создавать заказы' },
  { key: 'orders_edit', label: 'Редактировать заказы' },
  { key: 'orders_delete', label: 'Удалять заказы' },
  { key: 'clients_view', label: 'Видеть клиентов' },
  { key: 'workers_view', label: 'Видеть сотрудников' },
  { key: 'warehouses_view', label: 'Видеть склады' },
  { key: 'dropshippers_manage', label: 'Видеть и вести дропшипперов' },
  { key: 'calendar_view', label: 'Видеть календарь' },
  { key: 'groups_view', label: 'Видеть группы' },
  { key: 'personal_cash_view', label: 'Видеть личную кассу' },
  { key: 'cash_add_entries', label: 'Добавлять записи в кассу' },
  { key: 'finance_view', label: 'Видеть выручку' },
  { key: 'owner_cash_view', label: 'Видеть общую кассу' },
  { key: 'owner_expenses_view', label: 'Видеть расходы' },
  { key: 'owner_payments_view', label: 'Видеть оплаты' },
  { key: 'order_payments_manage', label: 'Добавлять оплаты по заказу' },
  { key: 'order_services_edit', label: 'Менять услуги в заказе' },
  { key: 'order_complete', label: 'Отмечать заказ выполненным' },
  { key: 'special_service_status', label: 'Подтверждать тату и тонировку' },
  { key: 'special_service_tatu', label: 'Делает тату' },
  { key: 'special_service_toning', label: 'Делает тонировку' },
];

const WORKER_ROLE_PERMISSION_PRESETS = {
  manager: {
    orders_view_all: true,
    orders_create: true,
    orders_edit: true,
    clients_view: true,
    workers_view: false,
    warehouses_view: true,
    dropshippers_manage: false,
    calendar_view: false,
    groups_view: false,
    personal_cash_view: false,
    cash_add_entries: false,
    finance_view: false,
    owner_cash_view: false,
    owner_expenses_view: false,
    owner_payments_view: false,
    order_payments_manage: true,
    order_services_edit: true,
    order_complete: false,
    special_service_status: false,
    special_service_tatu: false,
    special_service_toning: false,
  },
  senior: {
    orders_view_all: false,
    orders_create: false,
    orders_edit: true,
    clients_view: false,
    workers_view: false,
    warehouses_view: false,
    dropshippers_manage: false,
    calendar_view: false,
    groups_view: false,
    personal_cash_view: true,
    cash_add_entries: true,
    finance_view: false,
    owner_cash_view: false,
    owner_expenses_view: false,
    owner_payments_view: false,
    order_payments_manage: true,
    order_services_edit: true,
    order_complete: true,
    special_service_status: false,
    special_service_tatu: false,
    special_service_toning: false,
  },
  junior: {
    orders_view_all: false,
    orders_create: false,
    orders_edit: false,
    clients_view: false,
    workers_view: false,
    warehouses_view: false,
    dropshippers_manage: false,
    calendar_view: false,
    groups_view: false,
    personal_cash_view: false,
    cash_add_entries: false,
    finance_view: false,
    owner_cash_view: false,
    owner_expenses_view: false,
    owner_payments_view: false,
    order_payments_manage: false,
    order_services_edit: false,
    order_complete: false,
    special_service_status: false,
    special_service_tatu: false,
    special_service_toning: false,
  },
  extra: {
    orders_view_all: false,
    orders_create: false,
    orders_edit: true,
    clients_view: false,
    workers_view: false,
    warehouses_view: false,
    dropshippers_manage: false,
    calendar_view: false,
    groups_view: false,
    personal_cash_view: true,
    cash_add_entries: true,
    finance_view: false,
    owner_cash_view: false,
    owner_expenses_view: false,
    owner_payments_view: false,
    order_payments_manage: true,
    order_services_edit: true,
    order_complete: true,
    special_service_status: false,
    special_service_tatu: false,
    special_service_toning: false,
  },
};

const WORKER_SALARY_RULE_DEFINITIONS = [
  { key: 'selectedServices', label: 'Выбранные услуги', kind: 'toggle' },
  { key: 'attendanceBase', label: 'Ставка за смену', kind: 'money' },
  { key: 'glassMarginPct', label: 'Маржа стекла', kind: 'percent' },
  { key: 'moldingPct', label: 'Молдинг', kind: 'percent' },
  { key: 'tatuBonusPct', label: 'Бонус тату', kind: 'percent' },
  { key: 'toningBonusPct', label: 'Бонус тонировки', kind: 'percent' },
  { key: 'serviceAdjustments.mount', label: 'Монтаж доплата', kind: 'moneySigned' },
  { key: 'serviceAdjustments.cut', label: 'Срезка доплата', kind: 'moneySigned' },
  { key: 'serviceAdjustments.glue', label: 'Вклейка доплата', kind: 'moneySigned' },
];

function getWorkerPermissionPreset(systemRole) {
  return { ...(WORKER_ROLE_PERMISSION_PRESETS[systemRole] || WORKER_ROLE_PERMISSION_PRESETS.junior) };
}

function getWorkerPermissionState(workerLike) {
  if (typeof resolveWorkerPermissionState === 'function') {
    return resolveWorkerPermissionState(workerLike);
  }
  const systemRole = workerLike?.systemRole || workerLike?.system_role || 'junior';
  return {
    ...getWorkerPermissionPreset(systemRole),
    ...((workerLike && typeof workerLike.permissions === 'object' && workerLike.permissions) || {}),
  };
}

function renderWorkerPermissionRows(workerLike) {
  const permissions = getWorkerPermissionState(workerLike);
  return WORKER_PERMISSION_DEFINITIONS.map(item => {
    const checked = !!permissions[item.key];
    return `
      <label class="worker-permission-row">
        <span class="worker-permission-label">${escapeHtml(item.label)}</span>
        <span class="worker-permission-switch ${checked ? 'active' : ''}">
          <input type="checkbox" id="we-perm-${escapeAttr(item.key)}" ${checked ? 'checked' : ''} onchange="syncWorkerPermissionSwitch(this)">
          <span class="worker-permission-slider"></span>
        </span>
      </label>
    `;
  }).join('');
}

function syncWorkerPermissionSwitch(input) {
  const wrapper = input?.closest('.worker-permission-switch');
  if (!wrapper) return;
  wrapper.classList.toggle('active', !!input.checked);
}

function collectWorkerPermissionState() {
  return WORKER_PERMISSION_DEFINITIONS.reduce((acc, item) => {
    acc[item.key] = !!document.getElementById(`we-perm-${item.key}`)?.checked;
    return acc;
  }, {});
}

function getWorkerSalaryRuleState(workerLike) {
  const workerName = workerLike?.name || '';
  const rule = typeof getSalaryRule === 'function'
    ? getSalaryRule(workerName)
    : {};
  const serviceAdjustments = rule.serviceAdjustments || {};
  return {
    selectedServices: !!rule.selectedServices,
    attendanceBase: Number(rule.attendanceBase || rule.dailyBaseIfCompleted) || 0,
    glassMarginPct: Math.round((Number(rule.glassMarginPct) || 0) * 100),
    moldingPct: Math.round((Number(rule.moldingPct) || 0) * 100),
    tatuBonusPct: Math.round((Number(rule.tatuBonusPct) || 0) * 100),
    toningBonusPct: Math.round((Number(rule.toningBonusPct) || 0) * 100),
    'serviceAdjustments.mount': Number(serviceAdjustments.mount) || 0,
    'serviceAdjustments.cut': Number(serviceAdjustments.cut) || 0,
    'serviceAdjustments.glue': Number(serviceAdjustments.glue) || 0,
  };
}

function renderWorkerSalaryRuleRows(workerLike) {
  const values = getWorkerSalaryRuleState(workerLike);
  return WORKER_SALARY_RULE_DEFINITIONS.map(item => {
    const rawValue = values[item.key];
    const enabled = item.kind === 'toggle' ? !!rawValue : Number(rawValue) !== 0;
    const value = item.kind === 'toggle' ? '' : String(rawValue || 0);
    const placeholder = item.kind === 'percent' ? '%' : '₴';
    return `
      <label class="worker-setting-row">
        <span class="worker-setting-label">${escapeHtml(item.label)}</span>
        <span class="worker-setting-controls">
          <span class="worker-permission-switch ${enabled ? 'active' : ''}">
            <input
              type="checkbox"
              id="we-salary-enabled-${escapeAttr(item.key)}"
              ${enabled ? 'checked' : ''}
              onchange="syncWorkerSettingSwitch(this, '${escapeAttr(item.key)}')"
            >
            <span class="worker-permission-slider"></span>
          </span>
          ${item.kind === 'toggle' ? '' : `
            <span class="worker-setting-input-wrap ${enabled ? 'active' : ''}" id="we-salary-input-wrap-${escapeAttr(item.key)}">
              <input
                class="worker-setting-input"
                type="text"
                inputmode="decimal"
                id="we-salary-value-${escapeAttr(item.key)}"
                value="${escapeAttr(value)}"
                ${enabled ? '' : 'disabled'}
              >
              <span class="worker-setting-suffix">${placeholder}</span>
            </span>
          `}
        </span>
      </label>
    `;
  }).join('');
}

function syncWorkerSettingSwitch(input, key) {
  syncWorkerPermissionSwitch(input);
  const wrap = document.getElementById(`we-salary-input-wrap-${key}`);
  const field = document.getElementById(`we-salary-value-${key}`);
  const enabled = !!input?.checked;
  if (wrap) wrap.classList.toggle('active', enabled);
  if (field) {
    field.disabled = !enabled;
    if (!enabled) field.value = '0';
    else if (!String(field.value || '').trim()) field.value = '0';
  }
}

function collectWorkerSalaryRuleState() {
  const readNumber = (key, percent = false) => {
    const enabled = !!document.getElementById(`we-salary-enabled-${key}`)?.checked;
    if (!enabled) return 0;
    const raw = String(document.getElementById(`we-salary-value-${key}`)?.value || '')
      .replace(/\s+/g, '')
      .replace(',', '.')
      .trim();
    const value = Number(raw) || 0;
    return percent ? value / 100 : value;
  };
  return {
    selectedServices: !!document.getElementById('we-salary-enabled-selectedServices')?.checked,
    attendanceBase: readNumber('attendanceBase'),
    dailyBaseIfCompleted: 0,
    glassMarginPct: readNumber('glassMarginPct', true),
    moldingPct: readNumber('moldingPct', true),
    tatuBonusPct: readNumber('tatuBonusPct', true),
    toningBonusPct: readNumber('toningBonusPct', true),
    serviceAdjustments: {
      mount: readNumber('serviceAdjustments.mount'),
      cut: readNumber('serviceAdjustments.cut'),
      glue: readNumber('serviceAdjustments.glue'),
    },
  };
}

async function loadWorkers() {
  try {
    workers = await sbFetchWorkers();
    if (currentWorkerName && currentRole !== 'owner') {
      const currentWorker = workers.find(worker => worker.name === currentWorkerName);
      const nextRole = currentWorker?.systemRole || currentRole;
      if (nextRole && nextRole !== currentRole) {
        currentRole = nextRole;
        try {
          localStorage.setItem('crm_role', nextRole);
        } catch (e) {}
        const badge = document.getElementById('role-badge');
        if (badge) {
          const roleLabel = ROLE_LABELS[nextRole] || nextRole;
          badge.textContent = currentWorkerName ? `${currentWorkerName} · ${roleLabel.replace(/^.\s/, '')}` : roleLabel;
          badge.className = 'role-badge role-' + nextRole;
        }
        if (typeof updateNavbarVisibility === 'function') updateNavbarVisibility();
      }
    }
    if (currentRole !== 'owner') {
      workers = workers.map(worker => ({ ...worker, salaryFormula: '' }));
    }
  } catch (e) {
    showToast('Ошибка загрузки сотрудников: ' + e.message, 'error');
  }
}

function renderWorkers() {
  const container = document.getElementById('workers-list');

  if (!workers.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icon('hard-hat')}</div>
        <h3>Сотрудников нет</h3>
        <p>Добавьте первого сотрудника, нажав кнопку выше</p>
      </div>`;
    return;
  }

  container.innerHTML = workers.map(w => {
    // Считаем количество заказов где сотрудник участвует
    const orderCount = orders.filter(o =>
      o.responsible === w.name || o.assistant === w.name
    ).length;

    return `
      <div class="worker-card worker-card-simple">
        <div class="worker-avatar">${getInitials(w.name)}</div>
        <div class="worker-card-info">
          <div class="worker-name">${getWorkerDisplayName(w.name)}</div>
          <div class="worker-role">${w.role}</div>
          <div class="worker-order-count">${icon('clipboard-list')} ${orderCount} заказов</div>
        </div>
        ${currentRole === 'owner' ? `
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn-edit-worker" onclick="openWorkerEditModal('${w.id}')" title="Редактировать">
              <i data-lucide="pencil" style="width:14px;height:14px;"></i>
              <span>Edit</span>
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  initIcons();
}

// ── УТИЛИТЫ ──────────────────────────────────────────────────

function escapeAttr(str) {
  return String(str ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── МОДАЛ ДОБАВЛЕНИЯ СОТРУДНИКА ──────────────────────────────

function openWorkerModal() {
  const m = document.getElementById('worker-modal');
  if (!m) return;
  document.getElementById('w-name').value = '';
  document.getElementById('w-alias').value = '';
  document.getElementById('w-role').value = 'Старший специалист';
  document.getElementById('w-system-role').value = 'senior';
  document.getElementById('w-note').value = '';
  m.classList.add('active');
}

function closeWorkerModal() {
  const m = document.getElementById('worker-modal');
  if (m) m.classList.remove('active');
}

async function saveWorker() {
  const name = document.getElementById('w-name').value.trim();
  const alias = document.getElementById('w-alias').value.trim();
  const role = document.getElementById('w-role').value;
  const sysRole = document.getElementById('w-system-role').value;
  const note = document.getElementById('w-note').value.trim();

  if (!name) {
    showToast('Введите имя', 'error');
    return;
  }

  try {
    const w = await sbInsertWorker({
      name: name,
      alias: alias,
      role: role,
      system_role: sysRole,
      note: note
    });
    
    if (w) {
      workers.push(w);
      renderWorkers();
      closeWorkerModal();
      showToast('Сотрудник добавлен ✓');
    }
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}

// ── МОДАЛ РЕДАКТИРОВАНИЯ СОТРУДНИКА ──────────────────────────

let _editWorkerId = null;

function openWorkerEditModal(workerId) {
  if (currentRole !== 'owner') return;

  _editWorkerId = workerId;
  const w = workers.find(x => x.id === workerId);
  if (!w) return;

  let modal = document.getElementById('worker-edit-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'worker-edit-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-height:90vh;overflow-y:auto;">
        <div class="modal-header">
          <div class="modal-title">${icon('pencil')} Редактировать сотрудника</div>
          <button class="modal-close" onclick="closeWorkerEditModal()">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:16px;">

          <div id="worker-edit-name-display" style="font-weight:800;font-size:17px;"></div>

          <!-- Пароль -->
          <div class="form-group">
            <label class="form-label">🔑 Новый пароль</label>
            <input class="form-input" type="text" id="we-password" placeholder="Оставьте пустым — без изменений" autocomplete="new-password">
          </div>

          <div class="form-group">
            <label class="form-label">${icon('star')} Псевдоним</label>
            <input class="form-input" type="text" id="we-alias" placeholder="Например: 🐻 Василий">
          </div>

          <div class="form-group">
            <label class="form-label">${icon('badge-check')} Роль в интерфейсе</label>
            <select class="form-select" id="we-display-role">
              <option value="Старший специалист">Старший специалист</option>
              <option value="Младший специалист">Младший специалист</option>
              <option value="Менеджер">Менеджер</option>
              <option value="Монтажник">Монтажник</option>
            </select>
          </div>

          <!-- Роль -->
          <div class="form-group">
            <label class="form-label">${icon('user')} Роль (системная)</label>
            <select class="form-select" id="we-role">
              <option value="senior">senior — Старший специалист</option>
              <option value="junior">junior — Младший специалист</option>
              <option value="manager">manager — Менеджер</option>
              <option value="extra">extra — Экстра спец. с полным доступом</option>
            </select>
          </div>

          <!-- Помощник (для senior) -->
          <div class="form-group" id="we-assistant-group">
            <label class="form-label">${icon('handshake')} Помощник по умолчанию</label>
            <select class="form-select" id="we-assistant">
              <option value="">— нет —</option>
            </select>
            <div style="font-size:11px;color:var(--text3);margin-top:4px;">
              Автоматически подставляется в новые заказы при выборе этого специалиста
            </div>
          </div>

          <!-- Условия ЗП -->
          <div class="form-group" id="we-formula-group">
            <label class="form-label">${icon('coins')} Условия зарплаты</label>
            <div class="worker-permissions-card" id="we-salary-rule-card"></div>
            <div style="font-size:11px;color:var(--text3);margin-top:5px;">Включите нужный пункт и задайте сумму или процент</div>
          </div>

          <div class="form-group">
            <label class="form-label">${icon('shield')} Права доступа</label>
            <div class="worker-permissions-card" id="we-permissions-card"></div>
          </div>

          <!-- Проблемы -->
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:0.04em;">${icon('alert-triangle')} ПРОБЛЕМЫ</div>
              <button class="fin-add-salary-btn" onclick="openAddProblemModalFromEdit()">
                <i data-lucide="plus" style="width:11px;height:11px;"></i> Добавить
              </button>
            </div>
            <div id="we-problems-list"></div>
          </div>

          <div id="we-error" style="display:none;color:var(--red,#DC2626);font-size:12px;"></div>
        </div>

        <div class="modal-footer" style="justify-content:space-between;">
          <button class="btn-secondary" style="color:var(--red,#DC2626);border-color:var(--red,#DC2626);"
            onclick="deleteWorkerFromModal()">
            <i data-lucide="trash-2" style="width:13px;height:13px;"></i> Удалить
          </button>
          <div style="display:flex;gap:8px;">
            <button class="btn-secondary" onclick="closeWorkerEditModal()">Отмена</button>
            <button class="btn-primary" id="we-save-btn" onclick="saveWorkerEdit()">
              <i data-lucide="save" style="width:14px;height:14px;"></i> Сохранить
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Заполняем поля
  document.getElementById('worker-edit-name-display').textContent = getWorkerDisplayName(w.name);
  document.getElementById('we-password').value = '';
  document.getElementById('we-alias').value = w.alias || '';
  document.getElementById('we-display-role').value = w.role || 'Старший специалист';
  document.getElementById('we-role').value = w.systemRole || 'senior';
  // Показываем условия ЗП
  _renderWeSalaryRule(w);
  const permissionsCard = document.getElementById('we-permissions-card');
  if (permissionsCard) permissionsCard.innerHTML = renderWorkerPermissionRows(w);
  document.getElementById('we-error').style.display = 'none';

  // Заполняем список помощников (только junior)
  const asSel = document.getElementById('we-assistant');
  if (asSel) {
    asSel.innerHTML = '<option value="">— нет —</option>' +
      workers
        .filter(x => x.systemRole === 'junior' && x.name !== w.name)
        .map(x => `<option value="${x.name}">${getWorkerDisplayName(x.name)}</option>`)
        .join('');
    asSel.value = w.assistant || '';
  }

  // Показываем/скрываем формулу в зависимости от роли
  _updateWeFormulaVisibility();
  document.getElementById('we-role').onchange = _updateWeFormulaVisibility;

  // Проблемы
  _renderWeProblems(w);

  modal.classList.add('active');
  initIcons();
}

function _updateWeFormulaVisibility() {
  const role = document.getElementById('we-role')?.value;
  const group = document.getElementById('we-formula-group');
  const asGroup = document.getElementById('we-assistant-group');
  if (group) group.style.display = '';
  if (asGroup) asGroup.style.display = (role === 'senior') ? '' : 'none';
  // Перерисовываем условия ЗП при смене роли
  const w = workers.find(x => x.id === _editWorkerId);
  if (w) _renderWeSalaryRule({ ...w, systemRole: role });
}

function _renderWeSalaryRule(workerLike) {
  const container = document.getElementById('we-salary-rule-card');
  if (!container) return;
  container.innerHTML = renderWorkerSalaryRuleRows(workerLike);
}

function _renderWeProblems(w) {
  const container = document.getElementById('we-problems-list');
  if (!container) return;

  const wProblems = (typeof allProblems !== 'undefined' ? allProblems : [])
    .filter(p => p.worker_name === w.name)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!wProblems.length) {
    container.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:4px 0;">Проблем не зафиксировано</div>';
    return;
  }

  container.innerHTML = wProblems.map(p =>
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;' +
    'padding:7px 10px;background:var(--surface2);border-radius:8px;margin-bottom:4px;' +
    'border-left:2px solid var(--red,#DC2626);">' +
      '<div style="min-width:0;">' +
        '<div style="font-size:12px;font-weight:600;color:var(--text);">' + p.description + '</div>' +
        '<div style="font-size:11px;color:var(--text3);margin-top:1px;">' +
          formatDate(p.date) + (p.order_id ? ' · ' + p.order_id : '') + (p.partner ? ' · с ' + p.partner : '') +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">' +
        '<span style="font-size:13px;font-weight:700;color:var(--red,#DC2626);">' + Number(p.amount).toLocaleString('ru') + ' ₴</span>' +
        '<button class="icon-btn" onclick="deleteWorkerProblemFromModal(\'' + p.id + '\')" style="width:22px;height:22px;border-radius:6px;">' +
          '<i data-lucide="trash-2" style="width:10px;height:10px;"></i>' +
        '</button>' +
      '</div>' +
    '</div>'
  ).join('');
  initIcons();
}

function closeWorkerEditModal() {
  const modal = document.getElementById('worker-edit-modal');
  if (modal) modal.classList.remove('active');
  _editWorkerId = null;
}

async function saveWorkerEdit() {
  if (!_editWorkerId) return;
  const w = workers.find(x => x.id === _editWorkerId);
  if (!w) return;

  const password  = document.getElementById('we-password').value.trim();
  const alias     = document.getElementById('we-alias')?.value.trim() || '';
  const displayRole = document.getElementById('we-display-role')?.value || '';
  const role      = document.getElementById('we-role').value;
  const assistant = document.getElementById('we-assistant')?.value || '';
  const permissions = collectWorkerPermissionState();
  const salaryFormula = typeof buildWorkerSalaryFormula === 'function'
    ? buildWorkerSalaryFormula(collectWorkerSalaryRuleState())
    : '';

  const btn = document.getElementById('we-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    const updates = {
      role: displayRole,
      systemRole: role,
      alias: alias,
      assistant: assistant,
      note: w.note || '',
      permissions,
      salaryFormula,
    };
    if (password) updates.password = password;

    await sbUpdateWorker(_editWorkerId, updates);

    // Обновляем локально
    Object.assign(w, updates);
    w.role = displayRole;
    w.systemRole = role;
    w.alias = alias;
    w.assistant = assistant;
    w.permissions = permissions;
    w.salaryFormula = salaryFormula;

    closeWorkerEditModal();
    renderWorkers();
    showToast('Сотрудник обновлён ✓');
  } catch (e) {
    const errEl = document.getElementById('we-error');
    if (errEl) { errEl.textContent = 'Ошибка: ' + e.message; errEl.style.display = 'block'; }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="save" style="width:14px;height:14px;"></i> Сохранить';
      initIcons();
    }
  }
}

async function deleteWorkerFromModal() {
  if (!_editWorkerId) return;
  const w = workers.find(x => x.id === _editWorkerId);
  if (!w) return;
  if (!confirm(`Удалить сотрудника «${w.name}»? Это действие нельзя отменить.`)) return;

  try {
    await sbDeleteWorker(_editWorkerId);
    workers = workers.filter(x => x.id !== _editWorkerId);
    closeWorkerEditModal();
    renderWorkers();
    showToast('Сотрудник удалён');
  } catch (e) {
    showToast('Ошибка удаления: ' + e.message, 'error');
  }
}

// Открытие модала "добавить проблему" из окна редактирования сотрудника
function openAddProblemModalFromEdit() {
  const w = workers.find(x => x.id === _editWorkerId);
  if (!w) return;
  // Закрываем редактор временно, откроем снова после добавления
  openAddProblemModal(w.name, () => {
    // callback после сохранения: перерисуем проблемы в модале
    _renderWeProblems(w);
  });
}

async function deleteWorkerProblemFromModal(problemId) {
  if (!confirm('Удалить запись о проблеме?')) return;
  try {
    await sbDeleteWorkerProblem(problemId);
    if (typeof allProblems !== 'undefined') {
      allProblems = allProblems.filter(p => p.id !== problemId);
    }
    const w = workers.find(x => x.id === _editWorkerId);
    if (w) _renderWeProblems(w);
    showToast('Удалено');
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}

// ── МОДАЛ ДОБАВЛЕНИЯ ПРОБЛЕМЫ ────────────────────────────────

let _problemWorkerName = null;
let _problemCallback   = null;

function openAddProblemModal(workerName, callback) {
  _problemWorkerName = workerName;
  _problemCallback   = callback || null;

  let modal = document.getElementById('problem-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'problem-modal';
    modal.className = 'modal-overlay';
    const partnerOptions = workers
      .map(w => `<option value="${w.name}">${w.name}</option>`)
      .join('');
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">${icon('alert-triangle')} Добавить проблему</div>
          <button class="modal-close" onclick="closeAddProblemModal()">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
          <div id="pm-worker-label" style="font-weight:700;font-size:15px;"></div>
          <div class="form-group">
            <label class="form-label">Сумма (₴)</label>
            <input class="form-input" type="number" id="pm-amount" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">Описание</label>
            <input class="form-input" type="text" id="pm-desc" placeholder="Напр. разбитое стекло">
          </div>
          <div class="form-group">
            <label class="form-label">Заказ (необязательно)</label>
            <input class="form-input" type="text" id="pm-order" placeholder="SG-XXXX">
          </div>
          <div class="form-group">
            <label class="form-label">Напарник (необязательно)</label>
            <select class="form-select" id="pm-partner">
              <option value="">— нет —</option>
              ${partnerOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Дата</label>
            <input class="form-input" type="date" id="pm-date">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeAddProblemModal()">Отмена</button>
          <button class="btn-primary" id="pm-save-btn" style="background:var(--red,#DC2626);" onclick="saveNewProblem()">
            <i data-lucide="save" style="width:14px;height:14px;"></i> Сохранить
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById('pm-worker-label').textContent = workerName;
  document.getElementById('pm-amount').value  = '';
  document.getElementById('pm-desc').value    = '';
  document.getElementById('pm-order').value   = '';
  document.getElementById('pm-partner').value = '';
  document.getElementById('pm-date').value    = getLocalDateString();

  modal.classList.add('active');
  initIcons();
  setTimeout(() => document.getElementById('pm-amount').focus(), 100);
}

function closeAddProblemModal() {
  const modal = document.getElementById('problem-modal');
  if (modal) modal.classList.remove('active');
}

async function saveNewProblem() {
  const amount = Number(document.getElementById('pm-amount')?.value);
  const desc   = document.getElementById('pm-desc')?.value.trim();
  const order  = document.getElementById('pm-order')?.value.trim();
  const partner= document.getElementById('pm-partner')?.value;
  const date   = document.getElementById('pm-date')?.value;

  if (!amount || amount <= 0) { showToast('Введите сумму', 'error'); return; }
  if (!desc) { showToast('Введите описание', 'error'); return; }

  const btn = document.getElementById('pm-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    const saved = await sbInsertWorkerProblem({
      worker_name: _problemWorkerName,
      date,
      amount,
      description: desc,
      partner: partner || null,
      order_id: order || null,
    });

    if (typeof allProblems !== 'undefined') {
      allProblems.unshift(saved);
    }

    closeAddProblemModal();
    if (typeof _problemCallback === 'function') _problemCallback();
    showToast('Проблема добавлена ✓');
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

async function deleteWorkerProblem(problemId, workerId) {
  if (!confirm('Удалить запись о проблеме?')) return;
  try {
    await sbDeleteWorkerProblem(problemId);
    if (typeof allProblems !== 'undefined') {
      allProblems = allProblems.filter(p => p.id !== problemId);
    }
    showToast('Удалено');
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}

// ── МОДАЛ КАССЫ СОТРУДНИКА (для owner) ───────────────────────

let _cashModalWorkerName = null;
let _ownerCashLog = [];

async function openWorkerCashModal(workerName) {
  if (currentRole !== 'owner') return;
  _cashModalWorkerName = workerName;

  let modal = document.getElementById('worker-cash-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'worker-cash-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:480px;max-height:85vh;display:flex;flex-direction:column;">
        <div class="modal-header" style="flex-shrink:0;">
          <div>
            <div class="modal-title" id="wcm-title">Касса</div>
            <div id="wcm-balance" style="font-size:22px;font-weight:800;margin-top:4px;"></div>
          </div>
          <button class="modal-close" onclick="closeWorkerCashModal()">
            <i data-lucide="x" style="width:16px;height:16px;"></i>
          </button>
        </div>
        <div class="modal-body" id="wcm-body" style="overflow-y:auto;flex:1;">
          <div style="text-align:center;color:var(--text3);padding:24px;">Загрузка...</div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById('wcm-title').textContent = `Касса — ${workerName}`;
  document.getElementById('wcm-balance').textContent = '...';
  document.getElementById('wcm-body').innerHTML = '<div style="text-align:center;color:var(--text3);padding:24px;">Загрузка...</div>';
  modal.classList.add('active');
  initIcons();

  try {
    _ownerCashLog = await sbFetchCashLog(workerName);
    _renderWorkerCashModal();
  } catch (e) {
    document.getElementById('wcm-body').innerHTML =
      `<div style="color:#ef4444;padding:16px;">Ошибка: ${e.message}</div>`;
  }
}

function _renderWorkerCashModal() {
  const log = _ownerCashLog || [];
  const balance = log.reduce((s, e) => s + Number(e.amount), 0);

  const balEl = document.getElementById('wcm-balance');
  if (balEl) {
    balEl.textContent = balance.toLocaleString('ru') + ' ₴';
    balEl.style.color = balance >= 0 ? 'var(--accent)' : '#ef4444';
  }

  const body = document.getElementById('wcm-body');
  if (!body) return;

  if (!log.length) {
    body.innerHTML = '<div style="text-align:center;color:var(--text3);font-size:13px;padding:24px;">Записей нет</div>';
    return;
  }

  const today = getLocalDateString();
  const todayLog   = log.filter(e => _cashEntryDate(e) === today);
  const archiveLog = log.filter(e => _cashEntryDate(e) !== today);

  const todayBalance = todayLog.reduce((s, e) => s + Number(e.amount), 0);
  const todayColor   = todayBalance >= 0 ? 'var(--accent)' : '#ef4444';

  const todayRowsHtml = todayLog.length
    ? '<div style="background:var(--surface2);border-radius:10px;padding:0 12px;">'
      + todayLog.map(e => _cashEntryRow(e)).join('')
      + '</div>'
    : '<div style="text-align:center;color:var(--text3);font-size:13px;padding:10px 0;">Сегодня записей нет</div>';

  const archiveHtml = archiveLog.length
    ? _buildCashArchive(archiveLog)
    : '<div style="text-align:center;color:var(--text3);font-size:13px;padding:10px 0;">Архив пуст</div>';

  body.innerHTML = ''
    // Сегодня
    + '<div style="margin-bottom:16px;">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
    + '<div style="font-size:12px;font-weight:700;color:var(--text3);letter-spacing:0.04em;">' + icon('calendar') + ' СЕГОДНЯ</div>'
    + '<div style="font-size:15px;font-weight:800;color:' + todayColor + ';">'
    + (todayBalance >= 0 ? '+' : '') + todayBalance.toLocaleString('ru') + ' ₴</div>'
    + '</div>'
    + todayRowsHtml
    + '</div>'
    // Архив
    + '<div>'
    + '<div style="font-size:12px;font-weight:700;color:var(--text3);letter-spacing:0.04em;margin-bottom:8px;">🗂 АРХИВ</div>'
    + archiveHtml
    + '</div>';

  initIcons();
}

function closeWorkerCashModal() {
  const modal = document.getElementById('worker-cash-modal');
  if (modal) modal.classList.remove('active');
  _cashModalWorkerName = null;
  _ownerCashLog = [];
}
