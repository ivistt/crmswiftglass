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
  { key: 'car_directory_view', label: 'Видеть справочник авто' },
  { key: 'warehouses_view', label: 'Видеть склады' },
  { key: 'own_warehouse_view', label: 'Видеть вкладку Наш склад' },
  { key: 'dropshippers_manage', label: 'Видеть и вести дропшипперов' },
  { key: 'calendar_view', label: 'Видеть календарь' },
  { key: 'groups_view', label: 'Видеть группы' },
  { key: 'selectable_as_manager', label: 'Можно выбирать менеджером в заказе' },
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
  { key: 'action_panel_view', label: 'Показать панель-островок' },
  { key: 'action_panel_reminders', label: 'Островок: напоминания' },
  { key: 'action_panel_client_data', label: 'Островок: данные для клиента' },
  { key: 'client_statement_print', label: 'Может видеть сверку' },
];

const WORKER_ROLE_PERMISSION_PRESETS = {
  owner: {
    orders_view_all: true,
    orders_create: true,
    orders_edit: true,
    clients_view: true,
    workers_view: true,
    car_directory_view: true,
    warehouses_view: true,
    dropshippers_manage: true,
    calendar_view: true,
    groups_view: true,
    selectable_as_manager: false,
    personal_cash_view: true,
    cash_add_entries: true,
    finance_view: true,
    owner_cash_view: true,
    owner_expenses_view: true,
    owner_payments_view: true,
    order_payments_manage: true,
    order_services_edit: true,
    order_complete: true,
    special_service_status: true,
    special_service_tatu: true,
    special_service_toning: true,
    own_warehouse_view: true,
    action_panel_view: true,
    action_panel_reminders: true,
    action_panel_client_data: true,
    client_statement_print: true,
  },
  manager: {
    orders_view_all: true,
    orders_create: true,
    orders_edit: true,
    clients_view: true,
    workers_view: false,
    car_directory_view: false,
    warehouses_view: true,
    dropshippers_manage: false,
    calendar_view: false,
    groups_view: false,
    selectable_as_manager: true,
    personal_cash_view: true,
    cash_add_entries: true,
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
    own_warehouse_view: false,
    action_panel_view: false,
    action_panel_reminders: false,
    action_panel_client_data: false,
    client_statement_print: false,
  },
  senior: {
    orders_view_all: false,
    orders_create: false,
    orders_edit: true,
    clients_view: false,
    workers_view: false,
    car_directory_view: false,
    warehouses_view: false,
    dropshippers_manage: false,
    calendar_view: false,
    groups_view: false,
    selectable_as_manager: false,
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
    own_warehouse_view: false,
    action_panel_view: false,
    action_panel_reminders: false,
    action_panel_client_data: false,
    client_statement_print: false,
  },
  junior: {
    orders_view_all: false,
    orders_create: false,
    orders_edit: false,
    clients_view: false,
    workers_view: false,
    car_directory_view: false,
    warehouses_view: false,
    dropshippers_manage: false,
    calendar_view: false,
    groups_view: false,
    selectable_as_manager: false,
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
    own_warehouse_view: false,
    action_panel_view: false,
    action_panel_reminders: false,
    action_panel_client_data: false,
    client_statement_print: false,
  },
  extra: {
    orders_view_all: false,
    orders_create: false,
    orders_edit: true,
    clients_view: false,
    workers_view: false,
    car_directory_view: false,
    warehouses_view: false,
    dropshippers_manage: false,
    calendar_view: false,
    groups_view: false,
    selectable_as_manager: false,
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
    own_warehouse_view: false,
    action_panel_view: false,
    action_panel_reminders: false,
    action_panel_client_data: false,
    client_statement_print: false,
  },
};

const WORKER_SALARY_RULE_DEFINITIONS = [
  { key: 'selectedServices', label: 'Выбранные услуги', kind: 'toggle' },
  { key: 'attendanceBase', label: 'Ставка за смену', kind: 'money' },
  { key: 'glassMarginPct', label: 'Маржа стекла', kind: 'percent' },
  { key: 'moldingPct', label: 'Молдинг', kind: 'percent' },
  { key: 'extraWorkPct', label: 'Доп. работы', kind: 'percent' },
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

function getWorkerClientCopyFields(workerLike) {
  const fields = workerLike?.clientCopyFields?.fields;
  if (!Array.isArray(fields)) return [];
  return fields
    .map((field, index) => ({
      key: String(field?.key || `worker-copy-${index + 1}`),
      title: String(field?.title || '').trim(),
      text: String(field?.text || '').trim(),
    }))
    .filter(field => field.title || field.text);
}

function renderWorkerClientCopyFieldsEditor(workerLike = {}) {
  const fields = getWorkerClientCopyFields(workerLike);
  return `
    <div class="worker-copy-editor">
      <div class="worker-copy-editor-head">
        <div>
          <strong>Личные тексты сотрудника</strong>
          <small>Если оставить пустым — сотрудник увидит общие тексты владельца</small>
        </div>
        <button class="btn-secondary" type="button" onclick="addWorkerClientCopyField()">
          <i data-lucide="plus" style="width:14px;height:14px;"></i> Добавить
        </button>
      </div>
      <div class="owner-copy-settings-list" id="we-client-copy-fields">
        ${fields.map(field => renderWorkerClientCopyFieldEditor(field)).join('')}
      </div>
    </div>
  `;
}

function renderWorkerClientCopyFieldEditor(field = {}) {
  return `
    <div class="owner-copy-field" data-worker-copy-row data-key="${escapeAttr(field.key || `worker-copy-${Date.now()}`)}">
      <input class="form-input" data-worker-copy-title value="${escapeAttr(field.title || '')}" placeholder="Название, например: Адрес">
      <button type="button" class="icon-btn" onclick="this.closest('[data-worker-copy-row]').remove()" title="Удалить">
        <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
      </button>
      <textarea class="form-input" data-worker-copy-text placeholder="Текст для копирования">${escapeHtml(field.text || '')}</textarea>
    </div>
  `;
}

function addWorkerClientCopyField() {
  document.getElementById('we-client-copy-fields')?.insertAdjacentHTML('beforeend', renderWorkerClientCopyFieldEditor({ key: `worker-copy-${Date.now()}` }));
  initIcons();
  const rows = document.querySelectorAll('[data-worker-copy-row]');
  rows[rows.length - 1]?.querySelector('[data-worker-copy-title]')?.focus();
}

function collectWorkerClientCopyFields() {
  const fields = Array.from(document.querySelectorAll('[data-worker-copy-row]')).map((row, index) => ({
    key: String(row.dataset.key || `worker-copy-${index + 1}`),
    title: row.querySelector('[data-worker-copy-title]')?.value?.trim() || '',
    text: row.querySelector('[data-worker-copy-text]')?.value?.trim() || '',
  })).filter(field => field.title && field.text);
  return fields.length ? { fields, updatedAt: new Date().toISOString() } : null;
}

let _workerOrderCardLayoutDraft = null;
let _workerOrderCardLayoutUseDefault = true;

function getEditableOrderCardLayoutForWorker(workerLike) {
  const role = workerLike?.systemRole || workerLike?.system_role || document.getElementById('we-role')?.value || 'junior';
  return typeof getResolvedOrderCardLayout === 'function'
    ? getResolvedOrderCardLayout({ ...workerLike, systemRole: role })
    : { groups: [] };
}

function renderWorkerOrderCardLayoutEditor(workerLike) {
  const role = workerLike?.systemRole || workerLike?.system_role || document.getElementById('we-role')?.value || 'junior';
  const definitions = typeof getOrderCardLayoutFieldDefinitions === 'function' ? getOrderCardLayoutFieldDefinitions() : [];
  const defaultLayout = typeof getOrderCardLayoutDefaults === 'function' ? getOrderCardLayoutDefaults(role) : { groups: [] };
  const activeLayout = _workerOrderCardLayoutUseDefault ? defaultLayout : (_workerOrderCardLayoutDraft || defaultLayout);
  const usedFields = new Set((activeLayout.groups || []).flatMap(group => group.fields || []));
  return ''
    + '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">'
    + '<label class="worker-permission-row" style="padding:0;border:0;">'
    + '<span class="worker-permission-label">Индивидуальная схема карточки</span>'
    + '<span class="worker-permission-switch ' + (!_workerOrderCardLayoutUseDefault ? 'active' : '') + '">'
    + `<input type="checkbox" id="we-order-card-custom-toggle" ${!_workerOrderCardLayoutUseDefault ? 'checked' : ''} onchange="toggleWorkerOrderCardCustom(this)">`
    + '<span class="worker-permission-slider"></span>'
    + '</span>'
    + '</label>'
    + '<button class="btn-secondary" type="button" onclick="resetWorkerOrderCardLayoutToRole()">Стандарт роли</button>'
    + '</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-bottom:10px;">Настраивает только карточки заказов в списке.</div>'
    + (!_workerOrderCardLayoutUseDefault ? ((activeLayout.groups || []).map((group, groupIndex) => {
      const remainingFields = definitions.filter(item => !usedFields.has(item.key) || (group.fields || []).includes(item.key));
      return ''
        + '<div style="padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--surface2);margin-bottom:10px;">'
        + '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">'
        + `<input class="form-input" style="flex:1;min-width:0;" value="${escapeAttr(group.title || '')}" placeholder="Название группы" oninput="renameWorkerOrderCardGroup(${groupIndex}, this.value)">`
        + `<button class="icon-btn" type="button" onclick="moveWorkerOrderCardGroup(${groupIndex}, -1)" ${groupIndex === 0 ? 'disabled' : ''}>${icon('chevron-up')}</button>`
        + `<button class="icon-btn" type="button" onclick="moveWorkerOrderCardGroup(${groupIndex}, 1)" ${groupIndex === activeLayout.groups.length - 1 ? 'disabled' : ''}>${icon('chevron-down')}</button>`
        + `<button class="icon-btn" type="button" onclick="removeWorkerOrderCardGroup(${groupIndex})">${icon('trash-2')}</button>`
        + '</div>'
        + ((group.fields || []).map((fieldKey, fieldIndex) => {
          const label = definitions.find(item => item.key === fieldKey)?.label || fieldKey;
          return ''
            + '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--border);">'
            + `<div style="flex:1;font-size:13px;font-weight:700;color:var(--text2);">${escapeHtml(label)}</div>`
            + `<button class="icon-btn" type="button" onclick="moveWorkerOrderCardField(${groupIndex}, ${fieldIndex}, -1)" ${fieldIndex === 0 ? 'disabled' : ''}>${icon('chevron-up')}</button>`
            + `<button class="icon-btn" type="button" onclick="moveWorkerOrderCardField(${groupIndex}, ${fieldIndex}, 1)" ${fieldIndex === group.fields.length - 1 ? 'disabled' : ''}>${icon('chevron-down')}</button>`
            + `<button class="icon-btn" type="button" onclick="removeWorkerOrderCardField(${groupIndex}, '${escapeAttr(fieldKey)}')">${icon('x')}</button>`
            + '</div>';
        }).join(''))
        + '<div style="display:flex;gap:8px;align-items:center;margin-top:8px;">'
        + `<select class="form-select" id="we-order-card-group-add-${groupIndex}" style="flex:1;min-width:0;">`
        + '<option value="">— добавить поле —</option>'
        + remainingFields
          .filter(item => !(group.fields || []).includes(item.key))
          .map(item => `<option value="${escapeAttr(item.key)}">${escapeHtml(item.label)}</option>`)
          .join('')
        + '</select>'
        + `<button class="btn-secondary" type="button" onclick="addWorkerOrderCardField(${groupIndex})">Добавить поле</button>`
        + '</div>'
        + '</div>';
    }).join('') || '<div style="font-size:12px;color:var(--text3);padding:6px 0;">Групп пока нет</div>')
      + '<div style="display:flex;justify-content:flex-end;margin-top:8px;">'
      + '<button class="btn-primary" type="button" onclick="addWorkerOrderCardGroup()">+ Группа</button>'
      + '</div>'
      : '<div style="font-size:12px;color:var(--text3);padding:10px;border:1px dashed var(--border);border-radius:10px;">Используется стандартная схема для роли.</div>');
}

function rerenderWorkerOrderCardLayoutEditor() {
  const container = document.getElementById('we-order-card-layout-card');
  const worker = workers.find(x => x.id === _editWorkerId) || { systemRole: document.getElementById('we-role')?.value || 'junior', orderCardLayout: null };
  if (!container) return;
  container.innerHTML = renderWorkerOrderCardLayoutEditor(worker);
  initIcons();
}

function toggleWorkerOrderCardCustom(input) {
  _workerOrderCardLayoutUseDefault = !input?.checked;
  if (!_workerOrderCardLayoutUseDefault && !_workerOrderCardLayoutDraft) {
    const worker = workers.find(x => x.id === _editWorkerId) || { systemRole: document.getElementById('we-role')?.value || 'junior', orderCardLayout: null };
    _workerOrderCardLayoutDraft = getEditableOrderCardLayoutForWorker(worker);
  }
  rerenderWorkerOrderCardLayoutEditor();
}

function resetWorkerOrderCardLayoutToRole() {
  _workerOrderCardLayoutUseDefault = true;
  _workerOrderCardLayoutDraft = null;
  rerenderWorkerOrderCardLayoutEditor();
}

function addWorkerOrderCardGroup() {
  const role = document.getElementById('we-role')?.value || 'junior';
  if (!_workerOrderCardLayoutDraft) _workerOrderCardLayoutDraft = getEditableOrderCardLayoutForWorker({ systemRole: role });
  _workerOrderCardLayoutUseDefault = false;
  _workerOrderCardLayoutDraft.groups.push({ id: `custom-${Date.now()}-${_workerOrderCardLayoutDraft.groups.length}`, title: 'Новая группа', fields: [] });
  rerenderWorkerOrderCardLayoutEditor();
}

function removeWorkerOrderCardGroup(index) {
  if (!_workerOrderCardLayoutDraft?.groups?.[index]) return;
  _workerOrderCardLayoutDraft.groups.splice(index, 1);
  rerenderWorkerOrderCardLayoutEditor();
}

function moveWorkerOrderCardGroup(index, delta) {
  if (!_workerOrderCardLayoutDraft?.groups?.[index]) return;
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= _workerOrderCardLayoutDraft.groups.length) return;
  const [item] = _workerOrderCardLayoutDraft.groups.splice(index, 1);
  _workerOrderCardLayoutDraft.groups.splice(nextIndex, 0, item);
  rerenderWorkerOrderCardLayoutEditor();
}

function renameWorkerOrderCardGroup(index, value) {
  if (!_workerOrderCardLayoutDraft?.groups?.[index]) return;
  _workerOrderCardLayoutDraft.groups[index].title = String(value || '');
}

function addWorkerOrderCardField(groupIndex) {
  const select = document.getElementById(`we-order-card-group-add-${groupIndex}`);
  const fieldKey = String(select?.value || '').trim();
  if (!fieldKey || !_workerOrderCardLayoutDraft?.groups?.[groupIndex]) return;
  const alreadyUsed = _workerOrderCardLayoutDraft.groups.some(group => (group.fields || []).includes(fieldKey));
  if (alreadyUsed) return;
  _workerOrderCardLayoutDraft.groups[groupIndex].fields.push(fieldKey);
  rerenderWorkerOrderCardLayoutEditor();
}

function removeWorkerOrderCardField(groupIndex, fieldKey) {
  if (!_workerOrderCardLayoutDraft?.groups?.[groupIndex]) return;
  _workerOrderCardLayoutDraft.groups[groupIndex].fields = (_workerOrderCardLayoutDraft.groups[groupIndex].fields || []).filter(item => item !== fieldKey);
  rerenderWorkerOrderCardLayoutEditor();
}

function moveWorkerOrderCardField(groupIndex, fieldIndex, delta) {
  const fields = _workerOrderCardLayoutDraft?.groups?.[groupIndex]?.fields;
  if (!Array.isArray(fields) || !fields[fieldIndex]) return;
  const nextIndex = fieldIndex + delta;
  if (nextIndex < 0 || nextIndex >= fields.length) return;
  const [item] = fields.splice(fieldIndex, 1);
  fields.splice(nextIndex, 0, item);
  rerenderWorkerOrderCardLayoutEditor();
}

function getWorkerSalaryRuleState(workerLike) {
  const workerName = workerLike?.name || '';
  const rule = typeof getSalaryRule === 'function'
    ? getSalaryRule(workerName)
    : {};
  const serviceAdjustments = rule.serviceAdjustments || {};
  const serviceRates = rule.serviceRates || {};
  return {
    selectedServices: !!rule.selectedServices,
    attendanceBase: Number(rule.attendanceBase || rule.dailyBaseIfCompleted) || 0,
    glassMarginPct: Math.round((Number(rule.glassMarginPct) || 0) * 100),
    moldingPct: Math.round((Number(rule.moldingPct) || 0) * 100),
    extraWorkPct: Math.round((Number(rule.extraWorkPct) || 0.2) * 100),
    tatuBonusPct: Math.round((Number(rule.tatuBonusPct) || 0) * 100),
    toningBonusPct: Math.round((Number(rule.toningBonusPct) || 0) * 100),
    'serviceAdjustments.mount': Number(serviceAdjustments.mount) || 0,
    'serviceAdjustments.cut': Number(serviceAdjustments.cut) || 0,
    'serviceAdjustments.glue': Number(serviceAdjustments.glue) || 0,
    serviceRates: { ...serviceRates },
  };
}

function renderWorkerSalaryRuleRows(workerLike) {
  const values = getWorkerSalaryRuleState(workerLike);
  const selectedServicesEnabled = !!values.selectedServices;
  const serviceRatesHtml = typeof getServiceTypeOptions === 'function'
    ? '<div id="we-service-rates-block" style="display:' + (selectedServicesEnabled ? 'block' : 'none') + ';padding:10px 14px;border-bottom:1px solid var(--border);background:var(--surface2);">'
      + '<div style="font-size:12px;font-weight:900;color:var(--text3);margin-bottom:8px;">СТАВКИ ВЫБРАННЫХ УСЛУГ</div>'
      + getServiceTypeOptions()
        .filter(item => item.salaryCategory !== 'special' && item.salaryCategory !== 'custom')
        .map(item => {
          const hasPersonalRate = Object.prototype.hasOwnProperty.call(values.serviceRates || {}, item.name);
          const value = hasPersonalRate ? Number(values.serviceRates[item.name]) : '';
          return '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:13px;padding:4px 0;">'
          + '<span style="min-width:0;color:var(--text2);">' + escapeHtml(item.name) + '<span style="color:var(--text3);"> · база ' + Number(item.rate || 0).toLocaleString('ru') + ' ₴</span></span>'
          + '<span class="worker-setting-input-wrap active" style="min-width:92px;padding:5px 8px;">'
          + '<input class="worker-setting-input we-service-rate-input" type="text" inputmode="decimal" data-service-name="' + escapeAttr(item.name) + '" value="' + escapeAttr(value) + '" placeholder="' + escapeAttr(Number(item.rate || 0)) + '">'
          + '<span class="worker-setting-suffix">₴</span>'
          + '</span>'
          + '</div>';
        })
        .join('')
      + '</div>'
    : '';
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
      ${item.key === 'selectedServices' ? serviceRatesHtml : ''}
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
  if (key === 'selectedServices') {
    const block = document.getElementById('we-service-rates-block');
    if (block) block.style.display = enabled ? 'block' : 'none';
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
    extraWorkPct: readNumber('extraWorkPct', true),
    tatuBonusPct: readNumber('tatuBonusPct', true),
    toningBonusPct: readNumber('toningBonusPct', true),
    serviceAdjustments: {
      mount: readNumber('serviceAdjustments.mount'),
      cut: readNumber('serviceAdjustments.cut'),
      glue: readNumber('serviceAdjustments.glue'),
    },
    serviceRates: Array.from(document.querySelectorAll('.we-service-rate-input')).reduce((acc, input) => {
      const name = String(input?.dataset?.serviceName || '').trim();
      const raw = String(input?.value || '').replace(/\s+/g, '').replace(',', '.').trim();
      if (!name || raw === '') return acc;
      const value = Number(raw);
      if (Number.isFinite(value) && value >= 0) acc[name] = value;
      return acc;
    }, {}),
  };
}

async function loadWorkers() {
  try {
    workers = await sbFetchWorkers();
    if (currentWorkerName) {
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

  const paymentMethods = (typeof getPaymentMethods === 'function' ? getPaymentMethods() : [])
    .filter(row => row?.active !== false)
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.label || '').localeCompare(String(b.label || ''), 'ru'));

  const paymentMethodsCard = (currentRole === 'owner') ? `
    <div class="worker-card worker-card-simple" style="grid-column:1/-1;">
      <div class="worker-avatar">₴</div>
      <div class="worker-card-info">
        <div class="worker-name">Способы оплаты</div>
        <div class="worker-role">${paymentMethods.length ? `${paymentMethods.length} активных` : 'нет настроенных'}</div>
        <div class="worker-order-count" style="color:var(--text3);">
          Наличка — общий метод. Карта/ФОП — привязаны к сотруднику (касса у владельца) и требуют подтверждения.
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn-edit-worker" onclick="openPaymentMethodsModal()" title="Управлять">
          <i data-lucide="settings" style="width:14px;height:14px;"></i>
          <span>Manage</span>
        </button>
      </div>
    </div>
  ` : '';
  const serviceRates = typeof getServiceTypeOptions === 'function' ? getServiceTypeOptions() : [];
  const serviceRatesCard = (currentRole === 'owner') ? `
    <div class="worker-card worker-card-simple" style="grid-column:1/-1;">
      <div class="worker-avatar">₴</div>
      <div class="worker-card-info">
        <div class="worker-name">Ставки услуг</div>
        <div class="worker-role">${serviceRates.length ? `${serviceRates.length} услуг` : 'нет настроенных'}</div>
        <div class="worker-order-count" style="color:var(--text3);">
          Общий прайс для начисления ЗП. Индивидуальные ставки задаются в карточке сотрудника.
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn-edit-worker" onclick="openServiceRatesModal()" title="Управлять">
          <i data-lucide="settings" style="width:14px;height:14px;"></i>
          <span>Manage</span>
        </button>
      </div>
    </div>
  ` : '';

  container.innerHTML = paymentMethodsCard + serviceRatesCard + workers.map(w => {
    // Считаем количество заказов где сотрудник участвует
    const orderCount = orders.filter(o =>
      o.responsible === w.name || o.assistant === w.name
    ).length;

    return `
        <div class="worker-card worker-card-simple">
          <div class="worker-avatar">${getInitials(w.name)}</div>
          <div class="worker-card-info">
            <div class="worker-name">${getWorkerDisplayName(w.name)}</div>
            <div class="worker-role">${typeof getWorkerSystemRoleLabel === 'function' ? getWorkerSystemRoleLabel(w.systemRole) : w.role}</div>
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

// ── PAYMENT METHODS MODAL (owner only) ───────────────────────

let _editingPaymentMethodId = null;

function _renderPaymentMethodsTableRows() {
  const methods = (typeof getPaymentMethods === 'function' ? getPaymentMethods() : [])
    .filter(row => row?.active !== false)
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.label || '').localeCompare(String(b.label || ''), 'ru'));
  if (!methods.length) {
    return '<div style="font-size:12px;color:var(--text3);padding:10px 0;">Методов нет</div>';
  }
  return methods.map(row => {
    const type = String(row.method_type || '').toLowerCase();
    const owner = String(row.worker_name || '').trim();
    return `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="min-width:0;">
          <div style="font-size:13px;font-weight:800;color:var(--text2);">${escapeHtml(row.label || '—')}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px;">
            ${escapeHtml(type)}${owner ? ' · касса: ' + escapeHtml(getWorkerDisplayName(owner) || owner) : ''}${row.requires_confirmation ? ' · подтверждение' : ''}
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <button class="icon-btn" onclick="editPaymentMethod('${escapeAttr(row.id)}')" title="Редактировать">
            <i data-lucide="pencil" style="width:12px;height:12px;"></i>
          </button>
          <button class="icon-btn" onclick="deletePaymentMethod('${escapeAttr(row.id)}')" title="Удалить">
            <i data-lucide="trash-2" style="width:12px;height:12px;color:var(--red);"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function _renderPaymentMethodForm(methodRow = null) {
  const isEdit = !!methodRow?.id;
  const label = String(methodRow?.label || '').trim();
  const type = String(methodRow?.method_type || 'cash').trim().toLowerCase();
  const sortOrder = Number(methodRow?.sort_order) || 0;
  const workerOptions = ['<option value="">— выбрать —</option>']
    .concat((workers || []).map(w => `<option value="${escapeAttr(w.id)}">${escapeHtml(getWorkerDisplayName(w.name))}</option>`))
    .join('');
  return `
    <div style="padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface2);">
      <div style="font-size:12px;font-weight:900;color:var(--text2);margin-bottom:10px;">
        ${isEdit ? 'Редактировать метод' : 'Новый метод'}
      </div>
      <div class="form-grid">
        <div class="form-group span-full">
          <label class="form-label">Название</label>
          <input class="form-input" id="pm-label" value="${escapeAttr(label)}" placeholder="Напр. 👤 Иван 💳 ....">
        </div>
        <div class="form-group">
          <label class="form-label">Тип</label>
          <select class="form-select" id="pm-type" onchange="syncPaymentMethodOwnerVisibility()">
            <option value="cash" ${type === 'cash' ? 'selected' : ''}>cash (наличка)</option>
            <option value="card" ${type === 'card' ? 'selected' : ''}>card (карта)</option>
            <option value="fop" ${type === 'fop' ? 'selected' : ''}>fop (ФОП)</option>
          </select>
        </div>
        <div class="form-group" id="pm-owner-group">
          <label class="form-label">Сотрудник (владелец кассы)</label>
          <select class="form-select" id="pm-owner">
            ${workerOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Сортировка</label>
          <input class="form-input" id="pm-sort" inputmode="numeric" value="${escapeAttr(sortOrder)}" placeholder="0">
        </div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
        <button class="btn-secondary" onclick="resetPaymentMethodForm()">Отмена</button>
        <button class="btn-primary" onclick="savePaymentMethodForm()">${isEdit ? 'Сохранить' : 'Добавить'}</button>
      </div>
    </div>
  `;
}

function syncPaymentMethodOwnerVisibility() {
  const type = String(document.getElementById('pm-type')?.value || 'cash').trim().toLowerCase();
  const group = document.getElementById('pm-owner-group');
  if (group) group.style.display = (type === 'cash') ? 'none' : '';
}

function resetPaymentMethodForm() {
  _editingPaymentMethodId = null;
  const modal = document.getElementById('payment-methods-modal');
  if (modal) openPaymentMethodsModal();
}

function openPaymentMethodsModal() {
  if (currentRole !== 'owner') return;
  let modal = document.getElementById('payment-methods-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'payment-methods-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }
  const editing = (typeof getPaymentMethods === 'function' ? getPaymentMethods() : []).find(r => String(r?.id) === String(_editingPaymentMethodId)) || null;
  modal.innerHTML = `
    <div class="modal" style="max-width:760px;max-height:88vh;display:flex;flex-direction:column;">
      <div class="modal-header" style="flex-shrink:0;">
        <div class="modal-title">${icon('wallet')} Способы оплаты</div>
        <button class="modal-close" onclick="closePaymentMethodsModal()">${icon('x')}</button>
      </div>
      <div class="modal-body" style="overflow-y:auto;flex:1;">
        ${_renderPaymentMethodForm(editing)}
        <div style="margin-top:14px;background:var(--surface2);border-radius:12px;border:1px solid var(--border);padding:0 14px;">
          ${_renderPaymentMethodsTableRows()}
        </div>
      </div>
    </div>
  `;
  modal.classList.add('active');
  const ownerSel = document.getElementById('pm-owner');
  if (ownerSel) {
    const editingWorkerId = String(editing?.worker_id || '').trim();
    const editingWorkerName = String(editing?.worker_name || '').trim();
    const fallbackWorker = (workers || []).find(w => w.name === editingWorkerName);
    ownerSel.value = editingWorkerId || (fallbackWorker?.id ? String(fallbackWorker.id) : '');
  }
  syncPaymentMethodOwnerVisibility();
  initIcons();
}

function closePaymentMethodsModal() {
  document.getElementById('payment-methods-modal')?.classList.remove('active');
  _editingPaymentMethodId = null;
}

function editPaymentMethod(id) {
  _editingPaymentMethodId = id || null;
  openPaymentMethodsModal();
}

async function deletePaymentMethod(id) {
  if (currentRole !== 'owner') return;
  if (!confirm('Отключить этот способ оплаты?')) return;
  try {
    await sbDeletePaymentMethod(id);
    paymentMethods = await sbFetchPaymentMethods();
    openPaymentMethodsModal();
    if (typeof renderWorkers === 'function') renderWorkers();
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}

async function savePaymentMethodForm() {
  if (currentRole !== 'owner') return;
  const label = String(document.getElementById('pm-label')?.value || '').trim();
  const method_type = String(document.getElementById('pm-type')?.value || 'cash').trim().toLowerCase();
  const worker_id = String(document.getElementById('pm-owner')?.value || '').trim();
  const ownerWorker = (workers || []).find(w => String(w.id) === worker_id) || null;
  const worker_name = ownerWorker?.name || '';
  const sort_order = Number(document.getElementById('pm-sort')?.value) || 0;
  if (!label) return showToast('Введите название', 'error');
  if (!['cash', 'card', 'fop'].includes(method_type)) return showToast('Неверный тип', 'error');
  if (method_type !== 'cash' && !worker_name) return showToast('Выберите сотрудника', 'error');
  try {
    if (_editingPaymentMethodId) {
      await sbUpdatePaymentMethod(_editingPaymentMethodId, {
        label,
        method_type,
        worker_id: method_type === 'cash' ? null : worker_id,
        worker_name: method_type === 'cash' ? null : worker_name,
        sort_order,
        active: true
      });
    } else {
      await sbCreatePaymentMethod({
        label,
        method_type,
        worker_id: method_type === 'cash' ? null : worker_id,
        worker_name: method_type === 'cash' ? null : worker_name,
        sort_order,
        active: true
      });
    }
    paymentMethods = await sbFetchPaymentMethods();
    _editingPaymentMethodId = null;
    openPaymentMethodsModal();
    if (typeof renderWorkers === 'function') renderWorkers();
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}

// ── SERVICE RATES MODAL (owner only) ─────────────────────────

let _editingServiceRateId = null;

function _getServiceRateRows() {
  return (refServiceRates && refServiceRates.length ? refServiceRates : (typeof getServiceTypeOptions === 'function' ? getServiceTypeOptions() : []))
    .filter(row => row?.active !== false)
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
}

function getServiceRateSalaryCategoryOptions() {
  return [
    { value: 'mount', label: 'Монтаж' },
    { value: 'cut', label: 'Срезка' },
    { value: 'glue', label: 'Вклейка' },
    { value: 'special', label: 'Спецуслуги' },
    { value: 'custom', label: 'Нестандартные' },
  ];
}

function getServiceRateGroupOptions() {
  const baseOptions = (typeof getServiceTypeOptions === 'function' ? getServiceTypeOptions() : [])
    .map(item => String(item?.group || '').trim())
    .filter(Boolean);
  const savedOptions = (Array.isArray(refServiceRates) ? refServiceRates : [])
    .map(item => String(item?.service_group || '').trim())
    .filter(Boolean);
  return [...new Set([...baseOptions, ...savedOptions, 'Услуги'])];
}

function _renderServiceRateForm(row = null) {
  const isEdit = !!row?.id;
  const name = String(row?.name || '').trim();
  const rate = Number(row?.rate) || 0;
  const groupOptions = getServiceRateGroupOptions();
  const categoryOptions = getServiceRateSalaryCategoryOptions();
  const group = String(row?.service_group || groupOptions[0] || 'Услуги').trim();
  const category = String(row?.salary_category || 'custom').trim();
  const sortOrder = Number(row?.sort_order) || 0;
  return `
    <div style="padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface2);">
      <div style="font-size:12px;font-weight:900;color:var(--text2);margin-bottom:10px;">${isEdit ? 'Редактировать услугу' : 'Новая услуга'}</div>
      <div class="form-grid">
        <div class="form-group span-full">
          <label class="form-label">Название</label>
          <input class="form-input" id="sr-name" value="${escapeAttr(name)}" placeholder="Монтаж лобового">
        </div>
        <div class="form-group">
          <label class="form-label">Ставка</label>
          <input class="form-input" id="sr-rate" inputmode="decimal" value="${escapeAttr(rate)}">
        </div>
        <div class="form-group">
          <label class="form-label">Группа</label>
          <select class="form-select" id="sr-group">
            ${groupOptions.map(v => `<option value="${escapeAttr(v)}" ${group === v ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Категория ЗП</label>
          <select class="form-select" id="sr-category">
            ${categoryOptions.map(item => `<option value="${item.value}" ${category === item.value ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Сортировка</label>
          <input class="form-input" id="sr-sort" inputmode="numeric" value="${escapeAttr(sortOrder)}">
        </div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
        <button class="btn-secondary" onclick="resetServiceRateForm()">Отмена</button>
        <button class="btn-primary" onclick="saveServiceRateForm()">${isEdit ? 'Сохранить' : 'Добавить'}</button>
      </div>
    </div>
  `;
}

function _renderServiceRateRows() {
  const categoryLabelMap = Object.fromEntries(getServiceRateSalaryCategoryOptions().map(item => [item.value, item.label]));
  const rows = _getServiceRateRows();
  if (!rows.length) return '<div style="font-size:12px;color:var(--text3);padding:10px 0;">Услуг нет</div>';
  return rows.map(row => `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);">
      <div style="min-width:0;">
        <div style="font-size:13px;font-weight:800;color:var(--text2);">${escapeHtml(row.name || '—')}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;">${escapeHtml(row.service_group || 'Услуги')} · ${escapeHtml(categoryLabelMap[row.salary_category] || row.salary_category || 'Нестандартные')}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
        <div style="font-size:14px;font-weight:900;color:var(--accent);">${Number(row.rate || 0).toLocaleString('ru')} ₴</div>
        ${row.id ? `<button class="icon-btn" onclick="editServiceRate('${escapeAttr(row.id)}')" title="Редактировать"><i data-lucide="pencil" style="width:12px;height:12px;"></i></button>` : ''}
      </div>
    </div>
  `).join('');
}

function openServiceRatesModal() {
  if (currentRole !== 'owner') return;
  let modal = document.getElementById('service-rates-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'service-rates-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }
  const editing = _getServiceRateRows().find(r => String(r?.id) === String(_editingServiceRateId)) || null;
  modal.innerHTML = `
    <div class="modal" style="max-width:760px;max-height:88vh;display:flex;flex-direction:column;">
      <div class="modal-header" style="flex-shrink:0;">
        <div class="modal-title">${icon('wallet')} Ставки услуг</div>
        <button class="modal-close" onclick="closeServiceRatesModal()">${icon('x')}</button>
      </div>
      <div class="modal-body" style="overflow-y:auto;flex:1;">
        ${_renderServiceRateForm(editing)}
        <div style="margin-top:14px;background:var(--surface2);border-radius:12px;border:1px solid var(--border);padding:0 14px;">
          ${_renderServiceRateRows()}
        </div>
      </div>
    </div>
  `;
  modal.classList.add('active');
  initIcons();
}

function closeServiceRatesModal() {
  document.getElementById('service-rates-modal')?.classList.remove('active');
  _editingServiceRateId = null;
}

function editServiceRate(id) {
  _editingServiceRateId = id || null;
  openServiceRatesModal();
}

function resetServiceRateForm() {
  _editingServiceRateId = null;
  openServiceRatesModal();
}

async function saveServiceRateForm() {
  if (currentRole !== 'owner') return;
  const name = String(document.getElementById('sr-name')?.value || '').trim();
  const rate = Number(String(document.getElementById('sr-rate')?.value || '').replace(/\s+/g, '').replace(',', '.')) || 0;
  const fallbackGroup = getServiceRateGroupOptions()[0] || 'Услуги';
  const service_group = String(document.getElementById('sr-group')?.value || fallbackGroup).trim();
  const salary_category = String(document.getElementById('sr-category')?.value || 'custom').trim();
  const sort_order = Number(document.getElementById('sr-sort')?.value) || 0;
  if (!name) return showToast('Введите название', 'error');
  try {
    const payload = { name, rate, service_group, salary_category, sort_order, active: true };
    if (_editingServiceRateId) await sbUpdateServiceRate(_editingServiceRateId, payload);
    else await sbCreateServiceRate(payload);
    refServiceRates = await sbFetchRefOptional('ref_service_rates');
    _editingServiceRateId = null;
    openServiceRatesModal();
    if (typeof renderWorkers === 'function') renderWorkers();
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
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
  document.getElementById('w-telegram').value = '';
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
  const telegramNick = String(document.getElementById('w-telegram')?.value || '').trim().replace(/^@+/, '');
  const sysRole = document.getElementById('w-system-role').value;
  const note = document.getElementById('w-note').value.trim();
  const role = typeof getWorkerSystemRoleLabel === 'function' ? getWorkerSystemRoleLabel(sysRole) : sysRole;

  if (!name) {
    showToast('Введите имя', 'error');
    return;
  }

  try {
    const w = await sbInsertWorker({
      name: name,
      alias: alias,
      telegramNick,
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
            <label class="form-label">${icon('send')} Telegram @ник</label>
            <input class="form-input" type="text" id="we-telegram" placeholder="username">
          </div>

          <!-- Роль -->
          <div class="form-group">
            <label class="form-label">${icon('user')} Роль (системная)</label>
            <select class="form-select" id="we-role">
              <option value="owner">owner — Владелец</option>
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

          <div class="form-group">
            <label class="form-label">${icon('clipboard-copy')} Данные для клиента</label>
            <div class="worker-permissions-card worker-copy-card" id="we-client-copy-card"></div>
          </div>

          <div class="form-group">
            <label class="form-label">${icon('layout-template')} Карточка заказа</label>
            <div class="worker-permissions-card" id="we-order-card-layout-card"></div>
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
  document.getElementById('we-telegram').value = w.telegramNick || '';
  document.getElementById('we-role').value = w.systemRole || 'senior';
  // Показываем условия ЗП
  _renderWeSalaryRule(w);
  const permissionsCard = document.getElementById('we-permissions-card');
  if (permissionsCard) permissionsCard.innerHTML = renderWorkerPermissionRows(w);
  const clientCopyCard = document.getElementById('we-client-copy-card');
  if (clientCopyCard) clientCopyCard.innerHTML = renderWorkerClientCopyFieldsEditor(w);
  _workerOrderCardLayoutUseDefault = !w.orderCardLayout;
  _workerOrderCardLayoutDraft = w.orderCardLayout && typeof getResolvedOrderCardLayout === 'function'
    ? getResolvedOrderCardLayout({ ...w, orderCardLayout: w.orderCardLayout })
    : null;
  rerenderWorkerOrderCardLayoutEditor();
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
  if (_workerOrderCardLayoutUseDefault) {
    _workerOrderCardLayoutDraft = null;
  }
  rerenderWorkerOrderCardLayoutEditor();
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
  _workerOrderCardLayoutDraft = null;
  _workerOrderCardLayoutUseDefault = true;
}

async function saveWorkerEdit() {
  if (!_editWorkerId) return;
  const w = workers.find(x => x.id === _editWorkerId);
  if (!w) return;

  const password  = document.getElementById('we-password').value.trim();
  const alias     = document.getElementById('we-alias')?.value.trim() || '';
  const telegramNick = String(document.getElementById('we-telegram')?.value || '').trim().replace(/^@+/, '');
  const role      = document.getElementById('we-role').value;
  const displayRole = typeof getWorkerSystemRoleLabel === 'function' ? getWorkerSystemRoleLabel(role) : role;
  const assistant = document.getElementById('we-assistant')?.value || '';
  const permissions = collectWorkerPermissionState();
  const clientCopyFields = collectWorkerClientCopyFields();
  const orderCardLayout = _workerOrderCardLayoutUseDefault
    ? null
    : (typeof normalizeOrderCardLayout === 'function'
      ? normalizeOrderCardLayout(_workerOrderCardLayoutDraft, role)
      : _workerOrderCardLayoutDraft);
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
      telegramNick,
      assistant: assistant,
      note: w.note || '',
      permissions,
      clientCopyFields,
      orderCardLayout,
      salaryFormula,
    };
    if (password) updates.password = password;

    await sbUpdateWorker(_editWorkerId, updates);

    // Обновляем локально
    Object.assign(w, updates);
    w.role = displayRole;
    w.systemRole = role;
    w.alias = alias;
    w.telegramNick = telegramNick;
    w.assistant = assistant;
    w.permissions = permissions;
    w.clientCopyFields = clientCopyFields;
    w.orderCardLayout = orderCardLayout;
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
