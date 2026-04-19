// ============================================================
// WORKERS.JS — экран сотрудников, модал редактирования
// ============================================================

async function loadWorkers() {
  try {
    workers = await sbFetchWorkers();
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
  return (str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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

          <!-- Условия ЗП (readonly, из SALARY_CONFIG) -->
          <div class="form-group" id="we-formula-group">
            <label class="form-label">${icon('coins')} Условия зарплаты</label>
            <div id="we-salary-rule-display" style="background:var(--surface2);border-radius:10px;padding:10px 14px;"></div>
            <div style="font-size:11px;color:var(--text3);margin-top:5px;">Условия задаются в <code>SALARY_CONFIG</code> в файле <code>data.js</code></div>
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
  document.getElementById('we-role').value = w.systemRole || 'senior';
  // Показываем условия ЗП из SALARY_CONFIG
  _renderWeSalaryRule(w.name);
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
  if (group) group.style.display = (role === 'manager') ? 'none' : '';
  if (asGroup) asGroup.style.display = (role === 'senior') ? '' : 'none';
  // Перерисовываем условия ЗП при смене роли
  const w = workers.find(x => x.id === _editWorkerId);
  if (w) _renderWeSalaryRule(w.name);
}

function _renderWeSalaryRule(workerName) {
  const container = document.getElementById('we-salary-rule-display');
  if (!container || typeof SALARY_CONFIG === 'undefined' || typeof getSalaryRule === 'undefined') return;

  const rule = getSalaryRule(workerName);
  const rows = [];

  if (rule.base)
    rows.push(['Ставка за день', rule.base.toLocaleString('ru') + ' ₴']);
  if (rule.dailyBaseIfCompleted)
    rows.push(['Ставка за день с заказами', rule.dailyBaseIfCompleted.toLocaleString('ru') + ' ₴']);
  if (rule.attendanceBase)
    rows.push(['Ставка по кнопке "Я в работе"', rule.attendanceBase.toLocaleString('ru') + ' ₴']);
  if (rule.baseIfResp)
    rows.push(['Доплата за день (если ответственный)', rule.baseIfResp.toLocaleString('ru') + ' ₴']);
  if (rule.glassMarginPct)
    rows.push(['Маржа стекла', Math.round(rule.glassMarginPct * 100) + '%']);
  if (rule.moldingPct)
    rows.push(['Молдинг', Math.round(rule.moldingPct * 100) + '%']);
  if (rule.servicesPct)
    rows.push(['Услуги (монтаж и др.)', Math.round(rule.servicesPct * 100) + '%']);
  if (rule.selectedServices) {
    const adj = rule.serviceAdjustments || {};
    const details = [
      adj.mount ? `монтаж ${adj.mount > 0 ? '+' : ''}${adj.mount}` : '',
      adj.cut ? `срезка ${adj.cut > 0 ? '+' : ''}${adj.cut}` : '',
      adj.glue ? `вклейка ${adj.glue > 0 ? '+' : ''}${adj.glue}` : '',
    ].filter(Boolean).join(', ');
    rows.push(['Выбранные услуги', details || 'по прайсу']);
  }
  if (rule.tatuBonusPct)
    rows.push(['Бонус тату', Math.round(rule.tatuBonusPct * 100) + '%']);
  if (rule.toningBonusPct)
    rows.push(['Бонус тонировки', Math.round(rule.toningBonusPct * 100) + '%']);

  if (!rows.length) {
    container.innerHTML = '<div style="font-size:13px;color:var(--text3);">Условия не заданы</div>';
    return;
  }

  const formulaParts = [];
  if (rule.base) formulaParts.push(rule.base + ' ₴');
  if (rule.dailyBaseIfCompleted) formulaParts.push(rule.dailyBaseIfCompleted + ' ₴/день с заказом');
  if (rule.attendanceBase) formulaParts.push(rule.attendanceBase + ' ₴/выход');
  if (rule.baseIfResp) formulaParts.push(rule.baseIfResp + ' ₴ (если отв.)');
  if (rule.glassMarginPct) formulaParts.push('маржа × ' + Math.round(rule.glassMarginPct * 100) + '%');
  if (rule.moldingPct) formulaParts.push('молдинг × ' + Math.round(rule.moldingPct * 100) + '%');
  if (rule.servicesPct) formulaParts.push('услуги × ' + Math.round(rule.servicesPct * 100) + '%');
  if (rule.selectedServices) formulaParts.push('выбранные услуги');

  container.innerHTML =
    rows.map((r, i) =>
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;' +
      (i < rows.length - 1 ? 'border-bottom:1px solid var(--border);' : '') + '">' +
      '<span style="font-size:12px;color:var(--text3);">' + r[0] + '</span>' +
      '<span style="font-size:13px;font-weight:700;color:var(--text);">' + r[1] + '</span>' +
      '</div>'
    ).join('') +
    '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">' +
    '<div style="font-size:10px;color:var(--text3);margin-bottom:3px;letter-spacing:0.04em;">ФОРМУЛА</div>' +
    '<code style="font-size:12px;color:var(--accent);">' + formulaParts.join(' + ') + '</code>' +
    '</div>';
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
  const role      = document.getElementById('we-role').value;
  const assistant = document.getElementById('we-assistant')?.value || '';

  const btn = document.getElementById('we-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    const updates = {
      systemRole: role,
      alias: alias,
      assistant: assistant,
    };
    if (password) updates.password = password;

    await sbUpdateWorker(_editWorkerId, updates);

    // Обновляем локально
    Object.assign(w, updates);
    w.systemRole = role;
    w.alias = alias;
    w.assistant = assistant;

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
