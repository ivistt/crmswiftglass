// ============================================================
// WORKERS.JS — экран сотрудников, модал редактирования
// ============================================================

async function loadWorkers() {
  try {
    workers = await sbFetchWorkers();
  } catch (e) {
    showToast('Ошибка загрузки сотрудников: ' + e.message, 'error');
  }
}

function renderWorkers() {
  const container = document.getElementById('workers-list');

  if (!workers.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👷</div>
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
          <div class="worker-name">${w.name}</div>
          <div class="worker-role">${w.role}</div>
          <div class="worker-order-count">📋 ${orderCount} заказов</div>
        </div>
        ${currentRole === 'owner' ? `
          <button class="btn-edit-worker" onclick="openWorkerEditModal('${w.id}')" title="Редактировать">
            <i data-lucide="pencil" style="width:14px;height:14px;"></i>
            <span>Edit</span>
          </button>
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
          <div class="modal-title">✏️ Редактировать сотрудника</div>
          <button class="modal-close" onclick="closeWorkerEditModal()">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:16px;">

          <div id="worker-edit-name-display" style="font-weight:800;font-size:17px;"></div>

          <!-- Пароль -->
          <div class="form-group">
            <label class="form-label">🔑 Новый пароль</label>
            <input class="form-input" type="text" id="we-password" placeholder="Оставьте пустым — без изменений" autocomplete="new-password">
          </div>

          <!-- Роль -->
          <div class="form-group">
            <label class="form-label">👤 Роль (системная)</label>
            <select class="form-select" id="we-role">
              <option value="senior">senior — Старший специалист</option>
              <option value="junior">junior — Младший специалист</option>
              <option value="manager">manager — Менеджер</option>
            </select>
          </div>

          <!-- Формула ЗП -->
          <div class="form-group" id="we-formula-group">
            <label class="form-label">📐 Формула зарплаты</label>
            <input class="form-input" id="we-formula" type="text"
              placeholder="напр. percent * 0.20"
              style="font-family:monospace;font-size:14px;">
            <div style="font-size:11px;color:var(--text3);margin-top:5px;line-height:1.6;">
              Переменная: <code style="color:var(--accent);">percent</code> — прибыль за день<br>
              <code style="color:var(--accent);">percent * 0.20</code> — 20% от прибыли<br>
              <code style="color:var(--accent);">500 + percent * 0.15</code> — ставка + %<br>
              <code style="color:var(--accent);">1200</code> — фиксированная ставка
            </div>
          </div>

          <!-- Проблемы -->
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:0.04em;">⚠️ ПРОБЛЕМЫ</div>
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
  document.getElementById('worker-edit-name-display').textContent = w.name;
  document.getElementById('we-password').value = '';
  document.getElementById('we-role').value = w.systemRole || 'senior';
  document.getElementById('we-formula').value = w.salaryFormula || DEFAULT_SALARY_FORMULA?.[w.systemRole] || '';
  document.getElementById('we-error').style.display = 'none';

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
  if (group) group.style.display = (role === 'manager') ? 'none' : '';
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

  const password = document.getElementById('we-password').value.trim();
  const role     = document.getElementById('we-role').value;
  const formula  = document.getElementById('we-formula').value.trim();

  const btn = document.getElementById('we-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    const updates = {
      systemRole: role,
      salaryFormula: formula || null,
    };
    if (password) updates.password = password;

    await sbUpdateWorker(_editWorkerId, updates);

    // Обновляем локально
    Object.assign(w, updates);
    w.systemRole = role;
    w.salaryFormula = formula || null;

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
          <div class="modal-title">⚠️ Добавить проблему</div>
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
  document.getElementById('pm-date').value    = new Date().toISOString().slice(0, 10);

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
