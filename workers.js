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
