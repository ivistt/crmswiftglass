// ============================================================
// WORKERS.JS — экран сотрудников, модал добавления, управление PIN
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
    const showFormula = w.systemRole === 'senior' || w.systemRole === 'junior';
    const formula     = w.salaryFormula || DEFAULT_SALARY_FORMULA[w.systemRole] || '';

    const formulaBlock = showFormula ? `
      <div style="margin-top:6px;">
        <div id="wf-display-${w.id}" style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:11px;color:var(--text3);">Формула зп:</span>
          <code style="font-size:11px;font-weight:700;color:var(--accent);background:var(--surface2);padding:2px 7px;border-radius:5px;">${escapeHtml(formula) || '<span style="color:var(--text3);font-style:italic;">не задана</span>'}</code>
          <button class="icon-btn" title="Изменить формулу" style="width:22px;height:22px;border-radius:6px;"
            onclick="openFormulaModal('${w.id}', '${escapeAttr(w.name)}', '${escapeAttr(formula)}')">
            <i data-lucide="pencil" style="width:10px;height:10px;"></i>
          </button>
        </div>
      </div>
    ` : '';

    return `
      <div class="worker-card">
        <div class="worker-avatar">${getInitials(w.name)}</div>
        <div class="worker-info" style="flex:1;min-width:0;">
          <div class="worker-name">${w.name}</div>
          <div class="worker-role">${w.role}</div>
          ${w.note ? `<div style="font-size:12px;color:var(--text3);margin-top:2px;">${w.note}</div>` : ''}
          ${formulaBlock}
        </div>
        <div class="worker-actions" style="display:flex;gap:6px;flex-shrink:0;">
          <button class="icon-btn" title="Установить PIN" onclick="openPinModal('${w.id}', '${escapeAttr(w.name)}')">
            <i data-lucide="key-round" style="width:14px;height:14px;"></i>
          </button>
          <button class="icon-btn" title="Удалить" onclick="deleteWorker('${w.id}')">
            <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  initIcons();
}

function escapeAttr(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── МОДАЛ ФОРМУЛЫ ЗАРПЛАТЫ ───────────────────────────────────

let _formulaWorkerId   = null;
let _formulaWorkerName = null;

function openFormulaModal(workerId, workerName, currentFormula) {
  _formulaWorkerId   = workerId;
  _formulaWorkerName = workerName;

  let modal = document.getElementById('formula-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'formula-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">📐 Формула зарплаты</div>
          <button class="modal-close" onclick="closeFormulaModal()">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
          <div id="formula-worker-label" style="font-weight:700;font-size:15px;"></div>

          <div class="form-group">
            <label class="form-label">Формула</label>
            <input class="form-input" type="text" id="formula-input"
              placeholder="напр. percent * 0.20"
              style="font-family:monospace;font-size:14px;">
            <div style="font-size:11px;color:var(--text3);margin-top:5px;line-height:1.5;">
              Переменная: <code style="color:var(--accent);">percent</code> — прибыль за день (выручка − закупка по выполненным заказам)<br>
              Примеры:<br>
              <code style="color:var(--accent);">percent * 0.20</code> — 20% от прибыли<br>
              <code style="color:var(--accent);">500 + percent * 0.15</code> — ставка 500 + 15%<br>
              <code style="color:var(--accent);">1200</code> — фиксированная ставка
            </div>
          </div>

          <div id="formula-preview" style="display:none;padding:10px 12px;background:var(--surface2);border-radius:10px;font-size:13px;">
            <span style="color:var(--text3);">Результат за сегодня: </span>
            <span id="formula-preview-value" style="font-weight:800;color:var(--accent);"></span>
          </div>

          <div id="formula-error" style="display:none;color:var(--red,#DC2626);font-size:12px;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeFormulaModal()">Отмена</button>
          <button class="btn-primary" id="formula-save-btn" onclick="saveFormula()">
            <i data-lucide="save" style="width:14px;height:14px;"></i> Сохранить
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById('formula-worker-label').textContent = workerName;
  const input = document.getElementById('formula-input');
  input.value = currentFormula || '';
  document.getElementById('formula-error').style.display   = 'none';
  document.getElementById('formula-preview').style.display = 'none';

  // Живой предпросмотр при вводе
  input.oninput = () => _updateFormulaPreview(input.value);

  modal.classList.add('active');
  initIcons();
  setTimeout(() => input.focus(), 100);
  _updateFormulaPreview(input.value);
}

function _updateFormulaPreview(formula) {
  const previewEl = document.getElementById('formula-preview');
  const valueEl   = document.getElementById('formula-preview-value');
  const errEl     = document.getElementById('formula-error');
  if (!formula.trim()) { previewEl.style.display = 'none'; errEl.style.display = 'none'; return; }

  const today  = new Date().toISOString().slice(0, 10);
  const result = evalSalaryFormula(formula, _formulaWorkerName, today);
  errEl.style.display = 'none';
  if (result === null) {
    previewEl.style.display = 'none';
    errEl.textContent = 'Ошибка в формуле — проверьте синтаксис';
    errEl.style.display = 'block';
  } else {
    previewEl.style.display = 'block';
    valueEl.textContent = result.toLocaleString('ru') + ' ₴';
  }
}

function closeFormulaModal() {
  const modal = document.getElementById('formula-modal');
  if (modal) modal.classList.remove('active');
}

async function saveFormula() {
  const formula = (document.getElementById('formula-input')?.value || '').trim();
  const errEl   = document.getElementById('formula-error');
  errEl.style.display = 'none';

  // Валидация
  if (formula) {
    const today = new Date().toISOString().slice(0, 10);
    const test  = evalSalaryFormula(formula, _formulaWorkerName, today);
    if (test === null) {
      errEl.textContent = 'Ошибка в формуле — проверьте синтаксис';
      errEl.style.display = 'block';
      return;
    }
  }

  const btn = document.getElementById('formula-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    await sbUpdateWorkerFormula(_formulaWorkerId, formula);

    // Обновляем локальный массив
    const w = workers.find(x => x.id === _formulaWorkerId);
    if (w) w.salaryFormula = formula;

    // Пересчитываем зп за сегодня для этого сотрудника
    if (w) await _recalcTodaySalaryForWorker(w.name);

    closeFormulaModal();
    renderWorkers();
    showToast('Формула сохранена ✓');
  } catch (e) {
    errEl.textContent = 'Ошибка сохранения: ' + e.message;
    errEl.style.display = 'block';
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="save" style="width:14px;height:14px;"></i> Сохранить'; initIcons(); }
  }
}

// Пересчитывает зп за сегодня для конкретного сотрудника
// Используется когда владелец меняет формулу
async function _recalcTodaySalaryForWorker(workerName) {
  const today  = new Date().toISOString().slice(0, 10);
  const amount = calcDaySalary(workerName, today);
  // Ищем запись за сегодня в allSalaries (если финансы уже загружены)
  if (typeof allSalaries !== 'undefined') {
    const existing = allSalaries.find(s => s.worker_name === workerName && s.date === today);
    try {
      if (existing) {
        await sbUpdateWorkerSalary(existing.id, amount);
        existing.amount = amount;
      } else if (amount > 0) {
        const saved = await sbInsertWorkerSalary({ worker_name: workerName, date: today, amount });
        allSalaries.push(saved);
      }
    } catch (e) {
      console.error('Recalc salary error:', e);
    }
  }
}

// ── ДОБАВЛЕНИЕ СОТРУДНИКА ────────────────────────────────────

function openWorkerModal() {
  document.getElementById('w-name').value = '';
  document.getElementById('w-role').value = 'Старший специалист';
  document.getElementById('w-system-role').value = 'senior';
  document.getElementById('w-note').value = '';
  document.getElementById('worker-modal').classList.add('active');
  setTimeout(() => document.getElementById('w-name').focus(), 100);
}

function closeWorkerModal() {
  document.getElementById('worker-modal').classList.remove('active');
}

async function saveWorker() {
  const name       = document.getElementById('w-name').value.trim();
  const role       = document.getElementById('w-role').value;
  const systemRole = document.getElementById('w-system-role').value;
  const note       = document.getElementById('w-note').value.trim();

  if (!name) {
    alert('Введите имя сотрудника');
    document.getElementById('w-name').focus();
    return;
  }

  const saveBtn = document.querySelector('#worker-modal .btn-primary');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳'; }

  try {
    const saved = await sbInsertWorker({ name, role, systemRole, note });
    workers.push(saved);
    closeWorkerModal();
    renderWorkers();
    renderHome();
    showToast('Сотрудник добавлен ✓');
  } catch (e) {
    showToast('Ошибка сохранения: ' + e.message, 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Сохранить'; }
  }
}

async function deleteWorker(id) {
  if (!confirm('Удалить этого сотрудника?')) return;
  try {
    await sbDeleteWorker(id);
    workers = workers.filter(w => w.id !== id);
    renderWorkers();
    renderHome();
    showToast('Сотрудник удалён');
  } catch (e) {
    showToast('Ошибка удаления: ' + e.message, 'error');
  }
}

// ── PIN MODAL ────────────────────────────────────────────────

let _pinWorkerId   = null;
let _pinWorkerName = null;

function openPinModal(workerId, workerName) {
  _pinWorkerId   = workerId;
  _pinWorkerName = workerName;
  document.getElementById('pin-worker-label').textContent = workerName;
  document.getElementById('pin-input').value = '';
  document.getElementById('pin-confirm').value = '';
  document.getElementById('pin-error').style.display = 'none';
  document.getElementById('pin-modal').classList.add('active');
  setTimeout(() => document.getElementById('pin-input').focus(), 100);
}

function closePinModal() {
  document.getElementById('pin-modal').classList.remove('active');
}

async function savePin() {
  const pin     = document.getElementById('pin-input').value.trim();
  const confirm = document.getElementById('pin-confirm').value.trim();
  const errEl   = document.getElementById('pin-error');

  errEl.style.display = 'none';

  if (!pin) { errEl.textContent = 'Введите PIN'; errEl.style.display = 'block'; return; }
  if (pin.length < 4) { errEl.textContent = 'PIN — минимум 4 символа'; errEl.style.display = 'block'; return; }
  if (pin !== confirm) { errEl.textContent = 'PIN-коды не совпадают'; errEl.style.display = 'block'; return; }

  const saveBtn = document.getElementById('pin-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳'; }

  try {
    await sbSetWorkerPin(_pinWorkerId, pin);
    closePinModal();
    showToast(`PIN для ${_pinWorkerName} обновлён ✓`);
  } catch (e) {
    errEl.textContent = 'Ошибка: ' + e.message;
    errEl.style.display = 'block';
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '🔑 Сохранить PIN'; }
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

  container.innerHTML = workers.map(w => `
    <div class="worker-card">
      <div class="worker-avatar">${getInitials(w.name)}</div>
      <div class="worker-info">
        <div class="worker-name">${w.name}</div>
        <div class="worker-role">${w.role}</div>
        ${w.note ? `<div style="font-size:12px;color:var(--text3);margin-top:2px;">${w.note}</div>` : ''}
      </div>
      <div class="worker-actions" style="display:flex;gap:6px;">
        <button class="icon-btn" title="Установить PIN" onclick="openPinModal('${w.id}', '${escapeAttr(w.name)}')">
          <i data-lucide="key-round" style="width:14px;height:14px;"></i>
        </button>
        <button class="icon-btn" title="Удалить" onclick="deleteWorker('${w.id}')">
          <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
        </button>
      </div>
    </div>
  `).join('');

  initIcons();
}

function escapeAttr(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function openWorkerModal() {
  document.getElementById('w-name').value = '';
  document.getElementById('w-role').value = 'Старший специалист';
  document.getElementById('w-system-role').value = 'senior';
  document.getElementById('w-note').value = '';
  document.getElementById('worker-modal').classList.add('active');
  setTimeout(() => document.getElementById('w-name').focus(), 100);
}

function closeWorkerModal() {
  document.getElementById('worker-modal').classList.remove('active');
}

async function saveWorker() {
  const name       = document.getElementById('w-name').value.trim();
  const role       = document.getElementById('w-role').value;
  const systemRole = document.getElementById('w-system-role').value;
  const note       = document.getElementById('w-note').value.trim();

  if (!name) {
    alert('Введите имя сотрудника');
    document.getElementById('w-name').focus();
    return;
  }

  const saveBtn = document.querySelector('#worker-modal .btn-primary');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳'; }

  try {
    const saved = await sbInsertWorker({ name, role, systemRole, note });
    workers.push(saved);
    closeWorkerModal();
    renderWorkers();
    renderHome();
    showToast('Сотрудник добавлен ✓');
  } catch (e) {
    showToast('Ошибка сохранения: ' + e.message, 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Сохранить'; }
  }
}

async function deleteWorker(id) {
  if (!confirm('Удалить этого сотрудника?')) return;
  try {
    await sbDeleteWorker(id);
    workers = workers.filter(w => w.id !== id);
    renderWorkers();
    renderHome();
    showToast('Сотрудник удалён');
  } catch (e) {
    showToast('Ошибка удаления: ' + e.message, 'error');
  }
}
