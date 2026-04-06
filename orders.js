// ============================================================
// ORDERS.JS — список заказов, детали, модал создания/редактирования
// ============================================================

let editingOrderId  = null;      // null = новый, иначе id редактируемого
let currentOrderTab = 'inwork';  // 'inwork' | 'notinwork' | 'all' — для owner/manager
let currentWorkerTab = 'relevant'; // 'relevant' | 'all' — для специалистов



// ---------- КНОПКА ДОБАВИТЬ ----------
function setupOrderActions() {
  const el = document.getElementById('orders-actions');
  if (canCreateOrder()) {
    el.innerHTML = `<button class="btn-primary" onclick="openOrderModal(null)">+ Добавить запись</button>`;
  } else {
    el.innerHTML = '';
  }
}

// ---------- РЕНДЕР КАРТОЧКИ ЗАКАЗА ----------
function renderOrderCard(o) {
  const canMark = canMarkWorkerDone() && !o.statusDone &&
    (o.responsible === currentWorkerName || o.assistant === currentWorkerName);
  return `
    <div class="order-card" onclick="openOrderDetail('${o.id}')">
      <div class="order-card-top">
        <div class="order-card-left">
          <span class="order-id">${o.id}</span>
          <span class="order-name">${o.car || '—'}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${statusBadge(o.paymentStatus)}
          ${mountBadge(o.mount)}
          ${canMark ? `
            <button
              class="btn-check-done ${o.workerDone ? 'done' : ''}"
              onclick="event.stopPropagation(); toggleWorkerDone('${o.id}')"
              title="${o.workerDone ? 'Отменить выполнение' : 'Отметить выполненным'}"
            >
              <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <polyline points="2,7 5.5,10.5 12,3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          ` : ''}
        </div>
      </div>
      <div class="order-card-meta">
        <span class="order-meta-item">👤 ${o.client || '—'}</span>
        <span class="order-meta-item">☎️ ${o.phone || '—'}</span>
        <span class="order-meta-item">🗓️ ${formatDate(o.date)}</span>
        <span class="order-meta-item">🚧 ${o.responsible || '—'}${o.assistant ? ' + ' + o.assistant : ''}</span>
        ${o.total ? `<span class="order-meta-item" style="font-weight:700;color:var(--accent);">💰 ${Number(o.total).toLocaleString('ru')} ₴</span>` : ''}
      </div>
    </div>
  `;
}

// ---------- РЕНДЕР СПИСКА ----------
function renderOrders() {
  const search = (document.getElementById('filter-search')?.value || '').toLowerCase();
  const dateF  = document.getElementById('filter-date')?.value || '';
  const statF  = document.getElementById('filter-status')?.value || '';
  const sort   = document.getElementById('filter-sort')?.value || 'desc';

  let list = [...orders];

  if (currentRole === 'owner' || currentRole === 'manager') {
    if (currentOrderTab === 'inwork') {
      list = list.filter(o => o.inWork);
    } else if (currentOrderTab === 'notinwork') {
      list = list.filter(o => !o.inWork);
    }
    // 'all' — без фильтра
  } else {
    // Специалисты: только свои заказы
    list = list.filter(o =>
      o.responsible === currentWorkerName || o.assistant === currentWorkerName
    );
    if (currentWorkerTab === 'relevant') {
      // Актуальные = inWork и ещё не отмечены выполненными
      list = list.filter(o => o.inWork && !o.workerDone);
    }
    // 'all' — все свои без фильтра
  }

  if (search) list = list.filter(o =>
    (o.client  || '').toLowerCase().includes(search) ||
    (o.car     || '').toLowerCase().includes(search) ||
    (o.phone   || '').toLowerCase().includes(search) ||
    (o.id      || '').toLowerCase().includes(search)
  );
  if (dateF) list = list.filter(o => o.date === dateF);
  if (statF) list = list.filter(o => o.paymentStatus === statF);

  list.sort((a, b) => sort === 'asc'
    ? a.date.localeCompare(b.date)
    : b.date.localeCompare(a.date)
  );

  const container = document.getElementById('orders-list');

  if (!list.length) {
    const msg = (currentRole !== 'owner' && currentRole !== 'manager' && currentWorkerTab === 'relevant')
      ? '<h3>Нет актуальных записей</h3><p>Все задачи выполнены 🎉</p>'
      : '<h3>Записей не найдено</h3><p>Попробуйте изменить фильтры или добавьте новую запись</p>';
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div>${msg}</div>`;
    return;
  }

  container.innerHTML = list.map(o => renderOrderCard(o)).join('');
}

// ---------- ДЕТАЛЬНЫЙ ЭКРАН ЗАКАЗА ----------
function openOrderDetail(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;

  const el = document.getElementById('order-detail-content');

  const canEdit   = currentRole === 'owner' || currentRole === 'senior' || currentRole === 'manager';
  const canDelete = canDeleteOrder();

  // Кнопки в топ-баре рядом с "назад"
  const actionsEl = document.getElementById('order-detail-actions');
  if (actionsEl) {
    actionsEl.innerHTML = `
      ${canEdit   ? `<button class="icon-action-btn" title="Редактировать" onclick="openOrderModal('${o.id}')">✏️</button>` : ''}
      ${canDelete ? `<button class="icon-action-btn icon-action-danger" title="Удалить" onclick="deleteOrder('${o.id}')">🗑️</button>` : ''}
    `;
  }

  el.innerHTML = `
    <div class="detail-header">
      <div class="detail-header-top">
        <div>
          <div style="font-size:12px;color:var(--text3);font-family:'JetBrains Mono',monospace;margin-bottom:6px;">${o.id}</div>
          <div class="detail-title">${o.car || '—'}</div>
          <div class="detail-subtitle">🗓️ ${formatDate(o.date)}${o.time ? ' · 🕐 ' + o.time : ''} &nbsp;·&nbsp; 🚧 ${o.responsible || '—'}</div>
        </div>
        <div class="detail-badges">
          ${o.statusDone ? '<span class="status-badge" style="background:#16A34A;color:#fff;">✅ Выполнен</span>' : ''}
          ${o.inWork ? '<span class="status-badge" style="background:#F59E0B;color:#fff;">🔨 В работу</span>' : ''}
          ${statusBadge(o.paymentStatus)}
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">📋 Основная информация</div>
      <div class="detail-grid">
        ${field('👤 Клиент', o.client)}
        ${field('☎️ Телефон', o.phone, 'mono')}
        ${field('🚗 Авто', o.car)}
        ${field('🔢 Єврокод', o.code, 'mono')}
        ${field('🕐 Время', o.time)}
        ${field('📦 Склад', o.warehouse)}
        ${field('📃 Комплектація', o.equipment)}
        ${field('👥 Менеджер', o.author)}
        ${field('С Подбора', o.selection)}
      </div>
      ${o.notes ? `<div style="margin-top:14px;padding:12px;background:var(--surface2);border-radius:8px;font-size:13px;color:var(--text2);">📝 ${o.notes}</div>` : ''}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">⚙️ Послуги та роботи</div>
      <div class="detail-grid">
        ${field('⚙️ Монтаж', o.mount ? o.mount + ' ₴' : '')}
        ${field('🛠️ Вид послуги', o.serviceType)}
        ${field('🔘 Скло', o.glass)}
        ${field('*️⃣ Молдинг', o.molding)}
        ${field('⚙️ Доп. работы', o.extraWork)}
        ${field('*️⃣ Тату', o.tatu)}
        ${field('Тонировка', o.toning)}
        ${field('🚛 Доставка', o.delivery ? o.delivery + ' ₴' : '')}
      </div>
    </div>

    ${canViewFinance() ? `
    <div class="detail-section">
      <div class="detail-section-title">💸 Фінанси</div>
      <div class="detail-grid">
        ${field('💸 Статус розрахунку', o.paymentStatus)}
        ${field('Сверка', o.check ? o.check + ' ₴' : '')}
        ${field('Расчёт долга', o.debt ? o.debt + ' ₴' : '')}
        ${field('📌 Загальна сума', o.total ? o.total + ' ₴' : '', 'mono')}
        ${field('📍 10%', o.percent10 ? o.percent10 + ' ₴' : '')}
        ${field('📍 20%', o.percent20 ? o.percent20 + ' ₴' : '')}
        ${field('Молдинг Автор', o.moldingAuthor)}
        ${field('🤝 Партнер', o.partner)}
        ${field('📦 Статус оплати постачальнику', o.supplierStatus)}
        ${field('➖ Закупка', o.purchase ? o.purchase + ' ₴' : '')}
        ${field('➕ Приход', o.income ? o.income + ' ₴' : '')}
        ${field('🟰 Остаток', o.remainder !== undefined ? o.remainder + ' ₴' : '')}
        ${field('Оплата', o.paymentMethod)}
        ${field('∆ Склад', o.warehouseDelta)}
      </div>
    </div>
    ` : ''}
  `;

  showScreen('order-detail');
}

// ---------- УДАЛЕНИЕ ----------
async function deleteOrder(id) {
  if (!confirm('Удалить этот заказ? Это действие нельзя отменить.')) return;
  try {
    await sbDeleteOrder(id);
    orders = orders.filter(o => o.id !== id);
    showToast('Запись удалена');
    goHome();
  } catch (e) {
    showToast('Ошибка удаления: ' + e.message, 'error');
  }
}

// ---------- ЗАПОЛНЕНИЕ СЕЛЕКТОВ ИЗ СПРАВОЧНИКОВ ----------
function populateRefSelects() {
  // Марки авто
  const carSel = document.getElementById('f-car');
  if (carSel) {
    const cur = carSel.value;
    carSel.innerHTML = '<option value="">— выбрать —</option>' +
      refCars.map(c => `<option value="${c.model}">${c.model}</option>`).join('');
    if (cur) carSel.value = cur;
  }

  // Склады
  const whSel = document.getElementById('f-warehouse');
  if (whSel) {
    const cur = whSel.value;
    whSel.innerHTML = '<option value="">— выбрать —</option>' +
      refWarehouses.map(w => `<option value="${w.name}">${w.name}</option>`).join('');
    if (cur) whSel.value = cur;
  }

  // Комплектации
  const eqSel = document.getElementById('f-equipment');
  if (eqSel) {
    const cur = eqSel.value;
    eqSel.innerHTML = '<option value="">— выбрать —</option>' +
      refEquipment.map(e => `<option value="${e.name}">${e.name}</option>`).join('');
    if (cur) eqSel.value = cur;
  }

  // Услуги
  const svcSel = document.getElementById('f-service-type');
  if (svcSel) {
    const cur = svcSel.value;
    svcSel.innerHTML = '<option value="">— выбрать —</option>' +
      refServices.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    if (cur) svcSel.value = cur;
  }

  // Статусы расчёта
  const psSel = document.getElementById('f-payment-status');
  if (psSel) {
    const cur = psSel.value;
    psSel.innerHTML = '<option value="">—</option>' +
      refPaymentStatuses.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    if (cur) psSel.value = cur;
  }

  // Партнёры
  const partSel = document.getElementById('f-partner');
  if (partSel) {
    const cur = partSel.value;
    partSel.innerHTML = '<option value="">— выбрать —</option>' +
      refPartners.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    if (cur) partSel.value = cur;
  }

  // Статусы оплаты поставщику
  const ssSel = document.getElementById('f-supplier-status');
  if (ssSel) {
    const cur = ssSel.value;
    ssSel.innerHTML = '<option value="">—</option>' +
      refSupplierStatuses.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    if (cur) ssSel.value = cur;
  }

  // Ответственный — только старшие специалисты
  const respSel = document.getElementById('f-responsible');
  if (respSel) {
    const cur = respSel.value;
    respSel.innerHTML = '<option value="">— выбрать —</option>' +
      workers
        .filter(w => w.systemRole === 'senior')
        .map(w => `<option value="${w.name}">${w.name} (${w.role})</option>`).join('');
    if (cur) respSel.value = cur;
  }

  const authorSel = document.getElementById('f-author');
  if (authorSel) {
    const cur = authorSel.value;
    authorSel.innerHTML = '<option value="">— выбрать —</option>' +
      workers.map(w => `<option value="${w.name}">${w.name}</option>`).join('');
    if (cur) authorSel.value = cur;
  }

  // Помощник — старший или младший специалист
  const assistantSel = document.getElementById('f-assistant');
  if (assistantSel) {
    const cur = assistantSel.value;
    assistantSel.innerHTML = '<option value="">— нет —</option>' +
      workers
        .filter(w => w.systemRole === 'senior' || w.systemRole === 'junior')
        .map(w => `<option value="${w.name}">${w.name} (${w.role})</option>`).join('');
    if (cur) assistantSel.value = cur;
  }
}

// Список вариантов менеджера (из скриншота)
const MANAGER_OPTIONS = [
  '📌 Подбор Саня Шепель',
  '✅📄 Занёс',
  '✅ Отгрузка Саня Шепель',
  '💳 Безнал',
  '📌 Подбор Макс',
  '✅ Отгрузка Макс',
  '💳 На оплату',
  '✅ Отгрузка Рома',
];

function populateAuthorCheckboxes() {
  const box = document.getElementById('f-author-checkboxes');
  if (!box) return;
  const cur = (document.getElementById('f-author')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
  box.innerHTML = MANAGER_OPTIONS.map(opt => `
    <label style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:var(--surface2);border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;border:1.5px solid ${cur.includes(opt) ? 'var(--accent)' : 'transparent'};">
      <input type="checkbox" value="${opt}" ${cur.includes(opt) ? 'checked' : ''}
        onchange="syncAuthorField()" style="accent-color:var(--accent);width:15px;height:15px;">
      ${opt}
    </label>
  `).join('');
}

function syncAuthorField() {
  const checked = [...document.querySelectorAll('#f-author-checkboxes input:checked')].map(el => el.value);
  document.getElementById('f-author').value = checked.join(', ');
  // обновить border чекбоксов
  document.querySelectorAll('#f-author-checkboxes label').forEach(lbl => {
    const cb = lbl.querySelector('input');
    lbl.style.borderColor = cb.checked ? 'var(--accent)' : 'transparent';
  });
}

// Клиенты — datalist
function populateClientDatalist() {
  const clientList = document.getElementById('client-list');
  if (!clientList) return;
  clientList.innerHTML = getClients()
    .map(c => `<option value="${c.name}">${c.name}${c.phone ? ' · ' + c.phone : ''}</option>`)
    .join('');
}

// Автозаполнение кода и кодирования при выборе марки авто
function onCarSelect() {
  const carSel = document.getElementById('f-car');
  const model = carSel?.value;
  if (!model) return;
  const found = refCars.find(c => c.model === model);
  if (!found) return;
  const codeEl = document.getElementById('f-code');
  const codingEl = document.getElementById('f-coding');
  if (codeEl && found.eurocode)  codeEl.value   = found.eurocode;
  if (codingEl && found.coding)  codingEl.value = found.coding;
}

// ---------- МОДАЛ СОЗДАНИЯ / РЕДАКТИРОВАНИЯ ----------
function openOrderModal(id) {
  editingOrderId = id;

  // Заполнить все селекты из справочников
  populateRefSelects();
  populateClientDatalist();
  populateAuthorCheckboxes();

  if (id) {
    // РЕДАКТИРОВАНИЕ
    const o = orders.find(x => x.id === id);
    if (!o) return;
    document.getElementById('order-modal-title').textContent = `Редактировать ${o.id}`;
    fillOrderForm(o);
    // Блокировка цены если уже сохранён
    setPriceFieldsLocked(o.priceLocked && !canEditPrice(o));
  } else {
    // НОВЫЙ
    document.getElementById('order-modal-title').textContent = 'Новая запись';
    clearOrderForm();
    setPriceFieldsLocked(false);
    document.getElementById('f-date').value = todayStr();
  }

  // Автозаполнение по имени клиента → телефон + авто
  const clientEl = document.getElementById('f-client');
  const newClient = clientEl.cloneNode(true);
  clientEl.parentNode.replaceChild(newClient, clientEl);
  newClient.addEventListener('input', function() {
    const name = this.value.trim();
    if (!name) return;
    const clients = getClients();
    const match = clients.find(cl => cl.name === name);
    if (match) {
      const phoneEl2 = document.getElementById('f-phone');
      if (phoneEl2) phoneEl2.value = match.phone || '';
      const carSel = document.getElementById('f-car');
      if (carSel && match.orders.length) {
        const lastCar = match.orders[match.orders.length - 1].car || '';
        carSel.value = lastCar;
        onCarSelect();
      }
    }
  });

  // Автозаполнение по телефону → имя + авто
  const phoneEl = document.getElementById('f-phone');
  // Клонируем элемент чтобы убрать старые слушатели
  const newPhone = phoneEl.cloneNode(true);
  phoneEl.parentNode.replaceChild(newPhone, phoneEl);
  newPhone.addEventListener('input', function() {
    const phone = this.value.trim();
    if (!phone || phone.length < 5) return;
    const clients = getClients();
    const match = clients.find(cl => (cl.phone || '').includes(phone));
    if (match) {
      const nameEl = document.getElementById('f-client');
      nameEl.value = match.name;
      const carSel = document.getElementById('f-car');
      if (carSel && match.orders.length) {
        const lastCar = match.orders[match.orders.length - 1].car || '';
        carSel.value = lastCar;
        onCarSelect();
      }
    }
  });

  // Авторасчёт total из полей работ
  ['f-mount','f-glass','f-molding','f-extra-work','f-tatu','f-toning','f-delivery'].forEach(fid => {
    const el = document.getElementById(fid);
    if (!el) return;
    const newEl = el.cloneNode(true);
    el.parentNode.replaceChild(newEl, el);
    newEl.addEventListener('input', recalcTotal);
  });

  // Автопересчёт финансов
  const totalEl = document.getElementById('f-total');
  const newTotal = totalEl.cloneNode(true);
  totalEl.parentNode.replaceChild(newTotal, totalEl);
  newTotal.addEventListener('input', recalcPercents);

  const purchaseEl = document.getElementById('f-purchase');
  const newPurchase = purchaseEl.cloneNode(true);
  purchaseEl.parentNode.replaceChild(newPurchase, purchaseEl);
  newPurchase.addEventListener('input', recalcRemainder);

  const incomeEl = document.getElementById('f-income');
  const newIncome = incomeEl.cloneNode(true);
  incomeEl.parentNode.replaceChild(newIncome, incomeEl);
  newIncome.addEventListener('input', recalcRemainder);

  document.getElementById('order-modal').classList.add('active');
}

function closeOrderModal() {
  document.getElementById('order-modal').classList.remove('active');
  editingOrderId = null;
}

function fillOrderForm(o) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
  set('f-date', o.date);
  set('f-time', o.time);
  set('f-responsible', o.responsible);
  set('f-client', o.client);
  set('f-phone', o.phone);
  set('f-car', o.car);
  set('f-code', o.code);
  set('f-warehouse', o.warehouse);
  set('f-equipment', o.equipment);
  set('f-notes', o.notes);
  set('f-mount', o.mount);
  set('f-service-type', o.serviceType);
  set('f-glass', o.glass);
  set('f-molding', o.molding);
  set('f-extra-work', o.extraWork);
  set('f-tatu', o.tatu);
  set('f-toning', o.toning);
  set('f-delivery', o.delivery);
  set('f-author', o.author);
  set('f-selection', o.selection);
  set('f-payment-status', o.paymentStatus);
  set('f-check', o.check);
  set('f-debt', o.debt);
  set('f-total', o.total);
  set('f-percent10', o.percent10);
  set('f-percent20', o.percent20);
  set('f-molding-author', o.moldingAuthor);
  set('f-partner', o.partner);
  set('f-supplier-status', o.supplierStatus);
  set('f-purchase', o.purchase);
  set('f-income', o.income);
  set('f-remainder', o.remainder);
  set('f-payment-method', o.paymentMethod);
  set('f-warehouse-delta', o.warehouseDelta);
  const sdEl = document.getElementById('f-status-done');
  if (sdEl) sdEl.checked = !!o.statusDone;
  const iwEl = document.getElementById('f-in-work');
  if (iwEl) iwEl.checked = !!o.inWork;
  const asEl = document.getElementById('f-assistant');
  if (asEl) asEl.value = o.assistant || '';
  // перерисовать чекбоксы менеджера с текущим значением
  populateAuthorCheckboxes();
}

function clearOrderForm() {
  const ids = [
    'f-date','f-time','f-responsible','f-client','f-phone','f-car','f-code',
    'f-warehouse','f-equipment','f-notes','f-mount','f-service-type','f-glass','f-molding',
    'f-extra-work','f-tatu','f-toning','f-delivery','f-author','f-selection',
    'f-payment-status','f-check','f-debt','f-total','f-percent10','f-percent20',
    'f-molding-author','f-partner','f-supplier-status','f-purchase','f-income',
    'f-remainder','f-payment-method','f-warehouse-delta'
  ];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const sdEl = document.getElementById('f-status-done');
  if (sdEl) sdEl.checked = false;
  const iwEl = document.getElementById('f-in-work');
  if (iwEl) iwEl.checked = true;
}

function setPriceFieldsLocked(locked) {
  const priceFields = ['f-total','f-check','f-debt','f-payment-status','f-payment-method','f-purchase','f-income','f-partner','f-supplier-status'];
  priceFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (locked) {
      el.setAttribute('readonly', 'true');
      el.setAttribute('disabled', 'true');
    } else {
      el.removeAttribute('readonly');
      el.removeAttribute('disabled');
    }
  });
}

// Автопересчёт
function recalcPercents() {
  const total = Number(document.getElementById('f-total').value) || 0;
  document.getElementById('f-percent10').value = Math.round(total * 0.10);
  document.getElementById('f-percent20').value = Math.round(total * 0.20);
  recalcRemainder();
}

function recalcRemainder() {
  const income   = Number(document.getElementById('f-income').value) || 0;
  const purchase = Number(document.getElementById('f-purchase').value) || 0;
  document.getElementById('f-remainder').value = income - purchase;
}

function recalcTotal() {
  const sum = ['f-mount','f-glass','f-molding','f-extra-work','f-tatu','f-toning','f-delivery']
    .reduce((s, id) => s + (Number(document.getElementById(id)?.value) || 0), 0);
  const totalEl = document.getElementById('f-total');
  if (totalEl) { totalEl.value = sum; recalcPercents(); }
}

// ---------- СОХРАНЕНИЕ ----------
async function saveOrder() {
  const get  = id => document.getElementById(id)?.value?.trim() || '';
  const getN = id => Number(document.getElementById(id)?.value) || 0;

  const isNew = !editingOrderId;

  const data = {
    id:              isNew ? generateOrderId() : editingOrderId,
    date:            get('f-date'),
    time:            get('f-time'),
    responsible:     get('f-responsible'),
    client:          get('f-client'),
    phone:           get('f-phone'),
    car:             get('f-car'),
    code:            get('f-code'),
    coding:          '',
    warehouse:       get('f-warehouse'),
    equipment:       get('f-equipment'),
    notes:           get('f-notes'),
    mount:           getN('f-mount'),
    serviceType:     get('f-service-type'),
    glass:           getN('f-glass'),
    molding:         getN('f-molding'),
    extraWork:       getN('f-extra-work'),
    tatu:            getN('f-tatu'),
    toning:          getN('f-toning'),
    delivery:        getN('f-delivery'),
    author:          get('f-author'),
    selection:       get('f-selection'),
    paymentStatus:   get('f-payment-status'),
    check:           getN('f-check'),
    debt:            getN('f-debt'),
    total:           getN('f-total'),
    percent10:       getN('f-percent10'),
    percent20:       getN('f-percent20'),
    moldingAuthor:   get('f-molding-author'),
    partner:         get('f-partner'),
    supplierStatus:  get('f-supplier-status'),
    purchase:        getN('f-purchase'),
    income:          getN('f-income'),
    remainder:       getN('f-remainder'),
    paymentMethod:   get('f-payment-method'),
    warehouseDelta:  get('f-warehouse-delta'),
    statusDone:      document.getElementById('f-status-done')?.checked || false,
    inWork:          document.getElementById('f-in-work')?.checked || false,
    workerDone:      isNew ? false : (orders.find(x => x.id === editingOrderId)?.workerDone || false),
    assistant:       document.getElementById('f-assistant')?.value || '',
    priceLocked:     true,
  };

  if (!data.date || !data.client) {
    alert('Пожалуйста, заполните обязательные поля: Дата и Клиент');
    return;
  }

  const saveBtn = document.getElementById('order-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Сохранение...'; }

  try {
    if (isNew) {
      const saved = await sbInsertOrder(data);
      orders.unshift(saved);
      showToast('Запись создана ✓');
    } else {
      const saved = await sbUpdateOrder(data);
      const idx = orders.findIndex(o => o.id === editingOrderId);
      if (idx !== -1) orders[idx] = saved;
      showToast('Запись обновлена ✓');
    }
    closeOrderModal();
    renderOrders();
    renderHome();
  } catch (e) {
    showToast('Ошибка сохранения: ' + e.message, 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Сохранить'; }
  }
}

// ---------- ХЕЛПЕРЫ ----------
function statusBadge(status) {
  const map = {
    'Оплачено':    'status-paid',
    'Частично':    'status-partial',
    'Не оплачено': 'status-unpaid',
    'Долг':        'status-debt',
  };
  if (!status) return '';
  return `<span class="status-badge ${map[status] || ''}">${status}</span>`;
}

function mountBadge(mount) {
  const map = {
    'Выполнен':    'mount-done',
    'В процессе':  'mount-process',
    'Не выполнен': 'mount-not',
  };
  if (!mount) return '';
  return `<span class="mount-badge ${map[mount] || ''}">${mount}</span>`;
}

function field(label, value, cls = '') {
  const empty = !value || value === '0' || value === '' || value === 0;
  return `
    <div class="detail-field">
      <label>${label}</label>
      <div class="field-value ${cls} ${empty ? 'empty' : ''}">${empty ? '—' : value}</div>
    </div>
  `;
}

function formatDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

// ---------- ЭКРАН МЕСЯЦЕВ ----------
const MONTH_NAMES_RU = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'
];

function renderMonths() {
  const search = (document.getElementById('filter-month-search')?.value || '').toLowerCase();
  const filterVal = document.getElementById('filter-month')?.value || '';

  const map = {};
  for (const o of orders) {
    if (!o.date) continue;
    const ym = o.date.slice(0, 7);
    if (filterVal && ym !== filterVal) continue;
    if (search) {
      const haystack = [o.client, o.phone, o.car, o.id, o.responsible, o.code,
        o.warehouse, o.equipment, o.notes, o.author, o.selection,
        o.paymentStatus, o.paymentMethod, o.glass, o.mount, o.molding,
        o.extraWork, o.tatu, o.toning].map(v => String(v||'')).join(' ').toLowerCase();
      if (!haystack.includes(search)) continue;
    }
    if (!map[ym]) map[ym] = [];
    map[ym].push(o);
  }

  const keys = Object.keys(map).sort((a, b) => b.localeCompare(a));
  const container = document.getElementById('months-list');

  if (!keys.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📅</div>
        <h3>Записей не найдено</h3>
        <p>Попробуйте изменить фильтр</p>
      </div>`;
    return;
  }

  container.innerHTML = keys.map(ym => {
    const [year, month] = ym.split('-');
    const monthName = MONTH_NAMES_RU[parseInt(month) - 1];
    const list = map[ym];
    const displayList = (currentRole === 'owner' || currentRole === 'manager') ? list : list.filter(o => o.inWork);
    const totalSum = list.reduce((s, o) => s + (Number(o.total) || 0), 0);
    return `
      <div class="home-card" style="display:flex;flex-direction:column;min-height:110px;" onclick="openMonthOrders('${ym}')">
        <div style="font-size:12px;color:var(--text3);font-weight:600;letter-spacing:0.04em;">${displayList.length} зап.${canViewFinance() ? ` &middot; ${totalSum.toLocaleString('ru')} &#x20B4;` : ''}</div>
        <div style="margin-top:auto;padding-top:12px;">
          <div style="font-size:26px;font-weight:800;line-height:1.1;">${monthName}</div>
          <div style="font-size:13px;color:var(--text3);margin-top:3px;">${year}</div>
        </div>
      </div>
    `;
  }).join('');
}

function openMonthOrders(ym) {
  currentMonthFilter = ym;
  const [year, month] = ym.split('-');
  const monthName = MONTH_NAMES_RU[parseInt(month) - 1];
  document.querySelector('#screen-orders .page-title').textContent = `📋 ${monthName} ${year}`;
  initOrderTabs();
  setupOrderActions();
  renderOrdersForMonth(ym);
  showScreen('orders');
}

function renderOrdersForMonth(ym) {
  const search = (document.getElementById('filter-search')?.value || '').toLowerCase();
  const statF  = document.getElementById('filter-status')?.value || '';
  const sort   = document.getElementById('filter-sort')?.value || 'desc';

  let list = orders.filter(o => o.date && o.date.slice(0, 7) === ym);

  if (currentRole === 'owner' || currentRole === 'manager') {
    if (currentOrderTab === 'inwork') {
      list = list.filter(o => o.inWork);
    } else if (currentOrderTab === 'notinwork') {
      list = list.filter(o => !o.inWork);
    }
  } else {
    // Специалисты: только свои заказы
    list = list.filter(o =>
      o.responsible === currentWorkerName || o.assistant === currentWorkerName
    );
    if (currentWorkerTab === 'relevant') {
      list = list.filter(o => o.inWork && !o.workerDone);
    }
  }

  if (search) list = list.filter(o =>
    (o.client  || '').toLowerCase().includes(search) ||
    (o.car     || '').toLowerCase().includes(search) ||
    (o.phone   || '').toLowerCase().includes(search) ||
    (o.id      || '').toLowerCase().includes(search)
  );
  if (statF) list = list.filter(o => o.paymentStatus === statF);
  list.sort((a, b) => sort === 'asc' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));

  const container = document.getElementById('orders-list');

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <h3>Записей нет</h3>
        <p>В этом месяце нет заказов</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map(o => renderOrderCard(o)).join('');
}

// ---------- WORKER DONE — СПЕЦИАЛИСТ ОТМЕЧАЕТ ВЫПОЛНЕНИЕ ----------

async function toggleWorkerDone(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o) return;
  // Только ответственный (responsible) может менять статус
  if (o.responsible !== currentWorkerName) return;
  o.workerDone = !o.workerDone;
  try {
    await sbUpdateOrder(o);
    await _upsertOrderSalaries(o);
    currentMonthFilter ? renderOrdersForMonth(currentMonthFilter) : renderOrders();
    showToast(o.workerDone ? '✓ Выполнено — ЗП начислена' : 'Отметка снята');
    if (document.getElementById('screen-profile')?.classList.contains('active')) {
      await loadWorkerSalaries();
      renderProfile();
    }
  } catch (e) {
    o.workerDone = !o.workerDone;
    showToast('Ошибка: ' + e.message, 'error');
  }
}

// Начислить / удалить записи ЗП для responsible + assistant по конкретному заказу
async function _upsertOrderSalaries(order) {
  const participants = [order.responsible, order.assistant].filter(Boolean);

  // Всегда берём актуальные записи ЗП по этому заказу из БД
  let existingInDb = [];
  try {
    existingInDb = await sbFetchSalariesByOrder(order.id) || [];
  } catch (e) { /* если упало — продолжаем с пустым массивом */ }

  for (const workerName of participants) {
    const existingEntry = existingInDb.find(s => s.worker_name === workerName);

    if (order.workerDone) {
      const amount = calcOrderSalary(workerName, order);
      console.log('[salary] workerName:', workerName, '| total:', order.total, '| purchase:', order.purchase, '| amount:', amount);
      if (amount <= 0) continue;
      if (!existingEntry) {
        // Дата ЗП = дата самого заказа, а не сегодня
        await sbInsertWorkerSalary({ worker_name: workerName, date: order.date, amount, order_id: order.id });
      } else {
        await sbUpdateWorkerSalary(existingEntry.id, amount);
      }
    } else {
      if (existingEntry) {
        await sbDeleteWorkerSalary(existingEntry.id);
      }
    }
  }

  // Обновляем локальный массив workerSalaries (только для текущего пользователя)
  if (typeof workerSalaries !== 'undefined') {
    try {
      workerSalaries = await sbFetchWorkerSalaries(currentWorkerName);
    } catch (e) { /* не критично */ }
  }
}

// ---------- ТАБЫ ЗАКАЗОВ ----------

function initOrderTabs() {
  const tabsEl = document.getElementById('orders-tabs');

  if (currentRole === 'owner' || currentRole === 'manager') {
    if (tabsEl) {
      tabsEl.style.display = 'flex';
      tabsEl.innerHTML = `
        <button class="orders-tab" id="tab-inwork"    onclick="setOrderTab('inwork')">В работе</button>
        <button class="orders-tab" id="tab-notinwork" onclick="setOrderTab('notinwork')">Выполненные</button>
        <button class="orders-tab" id="tab-all"       onclick="setOrderTab('all')">Все</button>
      `;
    }
    setOrderTab('inwork');
  } else {
    // Специалисты: Актуальные | Все мои
    if (tabsEl) {
      tabsEl.style.display = 'flex';
      tabsEl.innerHTML = `
        <button class="orders-tab orders-tab-relevant active" id="tab-relevant" onclick="setWorkerTab('relevant')">
          <span class="tab-dot"></span> Актуальные
        </button>
        <button class="orders-tab" id="tab-my-all" onclick="setWorkerTab('all')">Все мои</button>
      `;
    }
    currentWorkerTab = 'relevant';
    if (currentMonthFilter) {
      renderOrdersForMonth(currentMonthFilter);
    } else {
      renderOrders();
    }
  }
}

function setWorkerTab(tab) {
  currentWorkerTab = tab;
  document.querySelectorAll('.orders-tab').forEach(b => b.classList.remove('active'));
  const el = document.getElementById(tab === 'relevant' ? 'tab-relevant' : 'tab-my-all');
  if (el) el.classList.add('active');
  if (currentMonthFilter) {
    renderOrdersForMonth(currentMonthFilter);
  } else {
    renderOrders();
  }
}

function setOrderTab(tab) {
  currentOrderTab = tab;
  document.querySelectorAll('.orders-tab').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('tab-' + tab);
  if (el) el.classList.add('active');
  if (currentMonthFilter) {
    renderOrdersForMonth(currentMonthFilter);
  } else {
    renderOrders();
  }
}
