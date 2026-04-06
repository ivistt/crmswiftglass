// ============================================================
// CAR_DIRECTORY.JS — справочник автомобилей (марки + еврокоды)
// ============================================================

let editingCarDirId = null; // null = новая запись

// ---------- РЕНДЕР ТАБЛИЦЫ ----------
function renderCarDirectory() {
  const search = (document.getElementById('filter-car-dir-search')?.value || '').toLowerCase();

  let list = [...carDirectory].sort((a, b) => (a.model || '').localeCompare(b.model || '', 'ru'));

  if (search) {
    list = list.filter(c =>
      (c.model    || '').toLowerCase().includes(search) ||
      (c.eurocode || '').toLowerCase().includes(search)
    );
  }

  const container = document.getElementById('car-directory-list-screen');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🚗</div>
        <h3>${search ? 'Ничего не найдено' : 'Справочник пуст'}</h3>
        <p>${search ? 'Попробуйте изменить запрос' : 'Авто добавляются автоматически при создании заказов или вручную'}</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="car-dir-table">
      <div class="car-dir-header">
        <div class="car-dir-col-model">Марка и модель</div>
        <div class="car-dir-col-code">Еврокод</div>
        <div class="car-dir-col-actions"></div>
      </div>
      ${list.map(c => `
        <div class="car-dir-row">
          <div class="car-dir-col-model">
            <span class="car-dir-model">${c.model}</span>
          </div>
          <div class="car-dir-col-code">
            <span class="car-dir-code">${c.eurocode || '—'}</span>
          </div>
          <div class="car-dir-col-actions">
            <button class="icon-action-btn" title="Редактировать" onclick="openCarDirModal('${c.id}')">✏️</button>
            <button class="icon-action-btn icon-action-danger" title="Удалить" onclick="deleteCarDirEntry('${c.id}')">🗑️</button>
          </div>
        </div>
      `).join('')}
    </div>
    <div style="margin-top:12px;font-size:12px;color:var(--text3);text-align:center;">
      Всего: ${list.length} записей
    </div>
  `;
}

// ---------- МОДАЛ ----------
function openCarDirModal(id) {
  editingCarDirId = id || null;

  const titleEl = document.getElementById('car-dir-modal-title');
  const modelEl = document.getElementById('cd-model');
  const codeEl  = document.getElementById('cd-eurocode');

  if (id) {
    const entry = carDirectory.find(c => String(c.id) === String(id));
    if (!entry) return;
    titleEl.textContent  = 'Редактировать авто';
    modelEl.value        = entry.model    || '';
    codeEl.value         = entry.eurocode || '';
  } else {
    titleEl.textContent = 'Новый автомобиль';
    modelEl.value       = '';
    codeEl.value        = '';
  }

  document.getElementById('car-dir-modal').classList.add('active');
  setTimeout(() => modelEl.focus(), 100);
}

function closeCarDirModal() {
  document.getElementById('car-dir-modal').classList.remove('active');
  editingCarDirId = null;
}

// ---------- СОХРАНЕНИЕ ----------
async function saveCarDirEntry() {
  const model    = document.getElementById('cd-model').value.trim();
  const eurocode = document.getElementById('cd-eurocode').value.trim();

  if (!model) {
    showToast('Введите марку и модель', 'error');
    document.getElementById('cd-model').focus();
    return;
  }

  const btn = document.getElementById('car-dir-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    if (editingCarDirId) {
      const updated = await sbUpdateCarDirectory(editingCarDirId, model, eurocode);
      if (updated) {
        const idx = carDirectory.findIndex(c => String(c.id) === String(editingCarDirId));
        if (idx !== -1) carDirectory[idx] = updated;
      }
      showToast('Запись обновлена ✓');
    } else {
      const dupe = carDirectory.find(c => c.model.toLowerCase() === model.toLowerCase());
      if (dupe) {
        const updated = await sbUpdateCarDirectory(dupe.id, model, eurocode);
        if (updated) {
          const idx = carDirectory.findIndex(c => c.id === dupe.id);
          if (idx !== -1) carDirectory[idx] = updated;
        }
        showToast('Еврокод обновлён ✓');
      } else {
        const row = await sbUpsertCarDirectory(model, eurocode);
        if (row) carDirectory.push(row);
        showToast('Авто добавлено ✓');
      }
    }
    closeCarDirModal();
    renderCarDirectory();
    populateCarDatalist?.();
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

// ---------- УДАЛЕНИЕ ----------
async function deleteCarDirEntry(id) {
  const entry = carDirectory.find(c => String(c.id) === String(id));
  if (!entry) return;
  if (!confirm(`Удалить "${entry.model}" из справочника?`)) return;

  try {
    await sbDeleteCarDirectory(id);
    carDirectory = carDirectory.filter(c => String(c.id) !== String(id));
    renderCarDirectory();
    showToast('Запись удалена');
  } catch (e) {
    showToast('Ошибка удаления: ' + e.message, 'error');
  }
}
