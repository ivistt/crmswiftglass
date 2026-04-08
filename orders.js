// ============================================================
// ORDERS.JS — список заказов, детали, модал создания/редактирования
// ============================================================

let editingOrderId  = null;      // null = новый, иначе id редактируемого
let currentOrderTab = 'selection';  // 'selection' | 'planner' | 'done' — для owner/manager
let currentWorkerTab = 'relevant'; // 'relevant' | 'all' — для специалистов

function canMarkWorkerDone() {
  // Галочка доступна только специалисту (senior) для своих заказов
  return currentRole === 'senior';
}



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
    o.responsible === currentWorkerName;
  return `
    <div class="order-card" onclick="openOrderDetail('${o.id}')">
      <div class="order-card-top">
        <div class="order-card-left">
          <span class="order-id">${o.id}</span>
          <span class="order-name">${o.car || '—'}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${o.isCancelled ? '<span class="status-badge" style="background:var(--red,#DC2626);color:#fff;">Отменен</span>' : ''}
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
    if (currentOrderTab === 'planner') {
      list = list.filter(o => o.inWork && !o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'selection') {
      list = list.filter(o => !o.inWork && !o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'done') {
      list = list.filter(o => o.workerDone && !o.isCancelled);
    } else if (currentOrderTab === 'debt') {
      list = list.filter(o => !o.isCancelled && (o.paymentStatus === 'Не оплачено' || o.paymentStatus === 'Частично оплачено'));
    } else if (currentOrderTab === 'cancelled') {
      list = list.filter(o => o.isCancelled);
    }
  } else {
    // Специалисты: только свои заказы
    list = list.filter(o =>
      (o.responsible === currentWorkerName || o.assistant === currentWorkerName) && !o.isCancelled
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

  list.sort((a, b) => {
    const ad = a.date || '';
    const bd = b.date || '';
    return sort === 'asc' ? ad.localeCompare(bd) : bd.localeCompare(ad);
  });

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
          ${o.inWork ? '<span class="status-badge" style="background:#F59E0B;color:#fff;">🔨 Планёрка</span>' : ''}
          ${statusBadge(o.paymentStatus)}
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">📋 Основная информация</div>
      <div class="detail-grid">
        ${field('👤 Клиент', o.client)}
        ${field('☎️ Телефон', o.phone, 'mono')}
        ${field('📍 Место', o.address)}
        ${field('🚗 Авто', o.car)}
        ${field('🔢 Єврокод', o.code, 'mono')}
        ${field('🕐 Время', o.time)}
        ${field('👥 Менеджер', o.author)}
        ${field('📋 Отв. менеджер', o.manager)}
      </div>
      ${o.notes ? `<div style="margin-top:14px;padding:12px;background:var(--surface2);border-radius:8px;font-size:13px;color:var(--text2);">📝 ${o.notes}</div>` : ''}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">⚙️ Послуги та роботи</div>
      <div class="detail-grid">
        ${field('⚙️ Монтаж', o.mount ? o.mount + ' ₴' : '')}
        ${field('🛠️ Вид послуги', o.serviceType)}
        ${field('*️⃣ Молдинг', o.molding)}
        ${field('⚙️ Доп. работы', o.extraWork)}
        ${field('*️⃣ Тату', o.tatu)}
        ${field('Тонировка', o.toning)}
        ${field('🚛 Доставка', o.delivery ? o.delivery + ' ₴' : '')}
      </div>
    </div>

    ${(canViewFinance() || (currentRole === 'extra' && (o.responsible === currentWorkerName || o.assistant === currentWorkerName))) ? `
    <div class="detail-section">
      <div class="detail-section-title">💸 Финансы</div>
      <div class="detail-grid">
    ${field('Расчёт долга клиента', o.paymentStatus)}
    ${field('Сумма поставщику', o.check ? o.check + ' ₴' : '')}
    ${field('Расчёт долга', o.debt ? o.debt + ' ₴' : '')}
    ${field('Дата расчёта долга', formatDate(o.debtDate))}
    ${field('📌 Общая сумма работ', o.total ? o.total + ' ₴' : '', 'mono')}
        ${field('Молдинг Автор', o.moldingAuthor)}
        ${field('🤝 Партнер', o.partner)}
        ${field('📦 Статус оплати постачальнику', o.supplierStatus)}
        ${field('Сумма покупки стекла', o.purchase ? o.purchase + ' ₴' : '')}
        ${field('Сумма продажи стекла', o.income ? o.income + ' ₴' : '')}
        ${field('Маржа с продажи стекла', o.remainder !== undefined ? o.remainder + ' ₴' : '')}
        ${field('Дропшиппер', o.dropshipper)}
        ${field('Выплата дропшипперу', o.dropshipperPayout ? o.dropshipperPayout + ' ₴' : '')}
        ${field('Выплата менеджеру (стекло)', o.payoutManagerGlass ? o.payoutManagerGlass + ' ₴' : '')}
        ${field('Выплата ответственному (стекло)', o.payoutRespGlass ? o.payoutRespGlass + ' ₴' : '')}
        ${field('Выплата Лёше (тонировка)', o.payoutLesha ? o.payoutLesha + ' ₴' : '')}
        ${field('Выплата Роме (тату)', o.payoutRoma ? o.payoutRoma + ' ₴' : '')}
        ${field('Выплата за доп. работы (ответств.)', o.payoutExtraResp ? o.payoutExtraResp + ' ₴' : '')}
        ${field('Выплата за доп. работы (помощ.)', o.payoutExtraAssist ? o.payoutExtraAssist + ' ₴' : '')}
        ${field('Выплата за молдинг (ответств.)', o.payoutMoldingResp ? o.payoutMoldingResp + ' ₴' : '')}
        ${field('Выплата за молдинг (помощ.)', o.payoutMoldingAssist ? o.payoutMoldingAssist + ' ₴' : '')}
        ${field('Маржа общая', o.marginTotal !== undefined ? o.marginTotal + ' ₴' : '')}
        ${field('Способ оплаты', o.paymentMethod)}
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
function populateCarDatalist() {
  // теперь просто инициализируем ac — данные берутся напрямую из refCars
}

// Подставляет помощника по умолчанию для выбранного ответственного
function applyAssistantForResponsible(respName) {
  if (!respName) return;
  const norm   = s => (s || '').trim().toLowerCase();
  const senior = (workers || []).find(w => norm(w.name) === norm(respName));
  const asSel  = document.getElementById('f-assistant');

  if (asSel && senior) {
    if (senior.assistant) {
      // Ищем опцию без учёта регистра и лишних пробелов
      const matchedOption = Array.from(asSel.options).find(o => norm(o.value) === norm(senior.assistant));
      if (matchedOption) {
        asSel.value = matchedOption.value;
      } else {
        console.warn(`Assistant "${senior.assistant}" for ${respName} not found in dropdown options.`);
      }
    } else {
      asSel.value = '';
    }
  }
}

function populateRefSelects() {
  // Марки авто — теперь datalist
  populateCarDatalist();

  // Услуги — чекбоксы
  const svcBox = document.getElementById('service-type-checkboxes');
  if (svcBox) {
    const cur = (document.getElementById('f-service-type')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
    svcBox.innerHTML = refServices.map(s => `
      <label class="checkbox">
        <input type="checkbox" value="${s.name}" ${cur.includes(s.name) ? 'checked' : ''} onchange="syncServiceTypes()" style="accent-color:var(--accent);width:15px;height:15px;flex-shrink:0;">
        ${s.name}
      </label>
    `).join('');
  }

  // Статусы расчёта
  const psSel = document.getElementById('f-payment-status');
  if (psSel) {
    const cur = psSel.value;
    const opts = ['Оплачено', 'Не оплачено', 'Частично оплачено'];
    psSel.innerHTML = '<option value="">—</option>' + opts.map(s => `<option value="${s}">${s}</option>`).join('');
    if (cur) psSel.value = cur;
  }

  // Дропшипперы
  const dsSel = document.getElementById('f-dropshipper');
  if (dsSel) {
    const cur = dsSel.value;
    dsSel.innerHTML = '<option value="">— выбрать —</option>' +
      (refDropshippers || []).map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    if (cur) dsSel.value = cur;
  }

  // Партнёры
  const partSel = document.getElementById('f-partner');
  if (partSel) {
    const cur = partSel.value;
    partSel.innerHTML = '<option value="">— выбрать —</option>' +
      refPartners.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    if (cur) partSel.value = cur;
  }

  // Молдинг автор (работники)
  const maSel = document.getElementById('f-molding-author');
  if (maSel) {
    const cur = maSel.value;
    maSel.innerHTML = '<option value="">— выбрать —</option>' +
      workers.map(w => `<option value="${w.name}">${w.name}</option>`).join('');
    if (cur) maSel.value = cur;
  }

  // Статусы оплаты поставщику
  const ssSel = document.getElementById('f-supplier-status');
  if (ssSel) {
    const cur = ssSel.value;
    const opts = ['Оплачено','Не оплачено','Долг'];
    ssSel.innerHTML = '<option value="">—</option>' + opts.map(s => `<option value="${s}">${s}</option>`).join('');
    if (cur) ssSel.value = cur;
  }

  // Помощник — старший или младший специалист
  const assistantSel = document.getElementById('f-assistant');
  if (assistantSel) {
    const cur = assistantSel.value;
    assistantSel.innerHTML = '<option value="">— нет —</option>' +
      workers
        .filter(w => w.systemRole === 'senior' || w.systemRole === 'junior' || w.systemRole === 'extra')
        .map(w => `<option value="${w.name}">${w.name} (${w.role})</option>`).join('');
    if (cur) assistantSel.value = cur;
  }

  // Ответственный — только старшие специалисты
  const respSel = document.getElementById('f-responsible');
  if (respSel) {
    const cur = respSel.value;
    respSel.innerHTML = '<option value="">— выбрать —</option>' +
      workers
        .filter(w => w.systemRole === 'senior' || w.systemRole === 'extra')
        .map(w => `<option value="${w.name}">${w.name} (${w.role})</option>`).join('');
    if (cur) respSel.value = cur;

    // При смене ответственного — всегда подставляем его помощника
    respSel.onchange = () => {
      applyAssistantForResponsible(respSel.value);
    };
  }

  const authorSel = document.getElementById('f-author');
  if (authorSel) {
    const cur = authorSel.value;
    authorSel.innerHTML = '<option value="">— выбрать —</option>' +
      workers.map(w => `<option value="${w.name}">${w.name}</option>`).join('');
    if (cur) authorSel.value = cur;
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
    <label style="border-color:${cur.includes(opt) ? 'var(--accent)' : 'transparent'};">
      <input type="checkbox" value="${opt}" ${cur.includes(opt) ? 'checked' : ''}
        onchange="syncAuthorField()" style="accent-color:var(--accent);width:15px;height:15px;flex-shrink:0;">
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
  // теперь просто инициализируем ac — данные берутся напрямую из getClients()
}

// Автозаполнение кода и кодирования при выборе марки авто
function onCarSelect() {
  onCarInputChange(document.getElementById('f-car')?.value || '');
}

function onCarInputChange(val) {
  if (!val) return;
  const found = (refCars || []).find(c => c.model.toLowerCase() === val.toLowerCase());
  if (found) {
    const codeEl = document.getElementById('f-code');
    if (codeEl) codeEl.value = found.eurocode || '';
  }
}

// Обратный поиск: при вводе еврокода — заполняем поле авто
function onCodeInputChange(val) {
  if (!val) return;
  const q = val.trim().toLowerCase();
  const found = (refCars || []).find(c => c.eurocode && c.eurocode.toLowerCase() === q);
  if (found) {
    const carEl = document.getElementById('f-car');
    if (carEl) carEl.value = found.model;
  }
}

// toggleCodeLock removed — поле f-code теперь автокомплит без кнопки блокировки

// ---------- МОДАЛ СОЗДАНИЯ / РЕДАКТИРОВАНИЯ ----------
function openOrderModal(id) {
  editingOrderId = id;

  populateRefSelects();
  populateClientDatalist();
  populateAuthorCheckboxes();

  const cancelWrap = document.getElementById('cancel-toggle-wrap');
  if (cancelWrap) {
    cancelWrap.style.display = (currentRole === 'owner' || currentRole === 'manager') ? 'inline-flex' : 'none';
  }

  if (id) {
    // РЕДАКТИРОВАНИЕ
    const o = orders.find(x => x.id === id);
    if (!o) return;
    document.getElementById('order-modal-title').textContent = `Редактировать ${o.id}`;
    fillOrderForm(o);

    // После заполнения формы: если помощник не задан в заказе — подставляем по умолчанию
    {
      const asSel   = document.getElementById('f-assistant');
      const respSel = document.getElementById('f-responsible');
      if (asSel && respSel && respSel.value && !o.assistant) {
        applyAssistantForResponsible(respSel.value);
      }
    }

    // Блокировка цены если уже сохранён
    setPriceFieldsLocked(o.priceLocked && !canEditPrice(o));
  } else {
    // НОВЫЙ
    document.getElementById('order-modal-title').textContent = 'Новая запись';
    clearOrderForm();
    setPriceFieldsLocked(false);
    document.getElementById('f-date').value = todayStr();

    // Если текущий пользователь — senior, автоподставляем его и его помощника
    if (currentRole === 'senior' && currentWorkerName) {
      const respSel = document.getElementById('f-responsible');
      if (respSel) respSel.value = currentWorkerName;
      applyAssistantForResponsible(currentWorkerName);
    }
    // Для owner/manager: если один senior — подставляем его и его помощника
    else {
      const seniors = workers.filter(w => w.systemRole === 'senior');
      const respSel = document.getElementById('f-responsible');
      if (respSel && seniors.length === 1 && !respSel.value) {
        respSel.value = seniors[0].name;
        applyAssistantForResponsible(seniors[0].name);
      }
    }
  }

  // Автокомплит инициализируется глобально через acInit()
  // Сбрасываем состояние замка еврокода при открытии нового заказа
  const codeEl2 = document.getElementById('f-code');

  // f-code теперь управляется через acFilter/acSelect (автокомплит)

  // Авторасчёт total из полей работ
  ['f-mount','f-molding','f-extra-work','f-tatu','f-toning','f-delivery'].forEach(fid => {
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
  newTotal.addEventListener('input', recalcTotal);

  const purchaseEl = document.getElementById('f-purchase');
  const newPurchase = purchaseEl.cloneNode(true);
  purchaseEl.parentNode.replaceChild(newPurchase, purchaseEl);
  newPurchase.addEventListener('input', recalcMargin);

  const incomeEl = document.getElementById('f-income');
  const newIncome = incomeEl.cloneNode(true);
  incomeEl.parentNode.replaceChild(newIncome, incomeEl);
  newIncome.addEventListener('input', recalcMargin);

  const tonExtEl = document.getElementById('f-toning-external');
  if (tonExtEl) tonExtEl.addEventListener('change', () => { recalcFullMargins(); recalcTotal(); });

  // Сворачиваем финансовый блок при открытии
  const finBody = document.getElementById('finance-section-body');
  const finChevron = document.getElementById('finance-chevron');
  if (finBody) finBody.style.display = 'none';
  if (finChevron) finChevron.style.transform = '';

  // Прячем live-total пока нет данных
  const liveTotalEl = document.getElementById('modal-live-total');
  if (liveTotalEl) liveTotalEl.style.display = 'none';

  document.getElementById('order-modal').classList.add('active');

  // Начальный пересчёт итогов (при редактировании)
  setTimeout(recalcTotal, 50);
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
  set('f-address', o.address);
  set('f-car', o.car);
  set('f-code', o.code);
  set('f-notes', o.notes);
  set('f-mount', o.mount);
  set('f-molding', o.molding);
  set('f-extra-work', o.extraWork);
  set('f-tatu', o.tatu);
  set('f-toning', o.toning);
  set('f-delivery', o.delivery);
  set('f-author', o.author);
  set('f-manager', o.manager || '');
  set('f-check', o.check);
  set('f-debt', o.debt);
  set('f-debt-date', o.debtDate);
  set('f-total', o.total);
  set('f-molding-author', o.moldingAuthor);
  set('f-partner', o.partner);
  set('f-supplier-status', o.supplierStatus);
  set('f-purchase', o.purchase);
  set('f-income', o.income);
  set('f-remainder', o.remainder);
  set('f-payment-method', o.paymentMethod);
  set('f-dropshipper', o.dropshipper);
  const tonExtEl = document.getElementById('f-toning-external');
  if (tonExtEl) tonExtEl.checked = !!o.toningExternal;
  // услуги — чекбоксы
  const svcHidden = document.getElementById('f-service-type');
  if (svcHidden) {
    svcHidden.value = o.serviceType || '';
    syncServiceTypes(false);
  }
  set('f-margin-total', o.marginTotal);
  set('f-payout-dropshipper', o.payoutDropshipper);
  set('f-payout-manager-glass', o.payoutManagerGlass);
  set('f-payout-resp-glass', o.payoutRespGlass);
  set('f-payout-lesha', o.payoutLesha);
  set('f-payout-roma', o.payoutRoma);
  set('f-payout-extra-resp', o.payoutExtraResp);
  set('f-payout-extra-assist', o.payoutExtraAssist);
  set('f-payout-molding-resp', o.payoutMoldingResp);
  set('f-payout-molding-assist', o.payoutMoldingAssist);
  const iwEl = document.getElementById('f-in-work');
  if (iwEl) iwEl.checked = !!o.inWork;
  const cancelEl = document.getElementById('f-cancelled');
  if (cancelEl) cancelEl.checked = !!o.isCancelled;
  const asEl = document.getElementById('f-assistant');
  if (asEl) asEl.value = o.assistant || '';
  // перерисовать чекбоксы менеджера с текущим значением
  populateAuthorCheckboxes();
}

function clearOrderForm() {
  const ids = [
    'f-date','f-time','f-responsible','f-client','f-phone','f-address','f-car','f-code',
    'f-notes','f-mount','f-service-type','f-molding',
    'f-extra-work','f-tatu','f-toning','f-delivery','f-author',
    'f-payment-status','f-check','f-debt','f-debt-date','f-total',
    'f-molding-author','f-partner','f-supplier-status','f-purchase','f-income',
    'f-remainder','f-payment-method','f-dropshipper','f-margin-total',
    'f-payout-dropshipper','f-payout-manager-glass','f-payout-resp-glass',
    'f-payout-lesha','f-payout-roma','f-payout-extra-resp','f-payout-extra-assist',
    'f-payout-molding-resp','f-payout-molding-assist','f-assistant','f-manager'
  ];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const iwEl = document.getElementById('f-in-work');
  if (iwEl) iwEl.checked = false;
  const cancelEl = document.getElementById('f-cancelled');
  if (cancelEl) cancelEl.checked = false;
  const tonExtEl = document.getElementById('f-toning-external');
  if (tonExtEl) tonExtEl.checked = false;
  document.querySelectorAll('#service-type-checkboxes input[type="checkbox"]').forEach(el => el.checked = false);
  document.querySelectorAll('#f-author-checkboxes input[type="checkbox"]').forEach(el => {
    el.checked = false;
    const lbl = el.closest('label');
    if (lbl) lbl.style.borderColor = 'transparent';
  });
}

function setPriceFieldsLocked(locked) {
  const priceFields = ['f-total','f-check','f-debt','f-debt-date','f-payment-status','f-payment-method','f-purchase','f-income','f-partner','f-supplier-status'];
  priceFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'f-payment-status') return; // Now fully automated
    if (id === 'f-debt-date' && currentRole === 'senior') return;
    if (id === 'f-supplier-status' && currentRole === 'senior') return;

    const forceUnlock = (currentRole === 'owner' || currentRole === 'manager' || currentRole === 'extra');
    if (locked && !forceUnlock) {
      el.setAttribute('readonly', 'true');
      el.setAttribute('disabled', 'true');
    } else {
      el.removeAttribute('readonly');
      el.removeAttribute('disabled');
    }
  });
}

// Collapse финансового блока
function toggleFinanceSection() {
  const body = document.getElementById('finance-section-body');
  const chevron = document.getElementById('finance-chevron');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}

// Автопересчёт маржи и всех выплат
function recalcMargin() {
  recalcFullMargins();
  recalcTotal(); // обновляем итог стекла в шапке
}

function recalcTotal() {
  const worksSum = ['f-mount','f-molding','f-extra-work','f-tatu','f-toning']
    .reduce((s, id) => s + (Number(document.getElementById(id)?.value) || 0), 0);

  // Сумма продажи стекла из финансового блока
  const glassSum = Number(document.getElementById('f-income')?.value) || 0;
  // Доставка из финансового блока
  const deliverySum = Number(document.getElementById('f-delivery')?.value) || 0;
  const totalAll = worksSum + glassSum + deliverySum;

  // Скрытое поле (для сохранения — только работы, как было)
  const totalEl = document.getElementById('f-total');
  if (totalEl) totalEl.value = worksSum;

  // Обновляем визуальные итоги в секции работ
  const fmt = v => v.toLocaleString('ru') + ' \u20B4';
  const dispGlass = document.getElementById('display-total-glass');
  const dispWorks = document.getElementById('display-total-works');
  const dispAll   = document.getElementById('display-total-all');
  if (dispGlass) dispGlass.textContent = fmt(glassSum);
  if (dispWorks) dispWorks.textContent = fmt(worksSum);
  if (dispAll)   dispAll.textContent   = fmt(totalAll);

  // Обновляем live-счётчик в хедере модала
  const liveTotal = document.getElementById('modal-live-total');
  const liveGlass = document.getElementById('modal-total-glass');
  const liveWorks = document.getElementById('modal-total-works');
  const liveAll   = document.getElementById('modal-total-all');
  if (liveTotal) liveTotal.style.display = totalAll > 0 ? 'flex' : 'none';
  if (liveGlass) liveGlass.textContent = fmt(glassSum);
  if (liveWorks) liveWorks.textContent = fmt(worksSum);
  if (liveAll)   liveAll.textContent   = fmt(totalAll);

  // Авторасчет статуса оплаты
  const debtInput = document.getElementById('f-debt');
  const paymentStatusSel = document.getElementById('f-payment-status');
  if (debtInput && paymentStatusSel) {
    const debtVal = Number(debtInput.value) || 0;
    if (debtInput.value.trim() === '' || debtVal === 0) {
      paymentStatusSel.value = 'Не оплачено';
    } else if (debtVal >= totalAll && totalAll > 0) {
      paymentStatusSel.value = 'Оплачено';
    } else {
      paymentStatusSel.value = 'Частично оплачено';
    }
  }

  recalcFullMargins();
}

// ---------- СОХРАНЕНИЕ ----------
async function saveOrder() {
  const get  = id => document.getElementById(id)?.value?.trim() || '';
  const getN = id => Number(document.getElementById(id)?.value) || 0;

  const isNew = !editingOrderId;
  const existingOrder = isNew ? null : orders.find(o => o.id === editingOrderId);

  recalcMargin();

  const data = {
    id:              isNew ? generateOrderId() : editingOrderId,
    date:            get('f-date'),
    time:            get('f-time'),
    responsible:     get('f-responsible'),
    client:          get('f-client'),
    phone:           get('f-phone'),
    address:         get('f-address'),
    car:             get('f-car'),
    code:            get('f-code'),
    notes:           get('f-notes'),
    mount:           getN('f-mount'),
    serviceType:     get('f-service-type'),
    glass:           0,
    molding:         getN('f-molding'),
    extraWork:       getN('f-extra-work'),
    tatu:            getN('f-tatu'),
    toning:          getN('f-toning'),
    delivery:        getN('f-delivery'),
    author:          get('f-author'),
    paymentStatus:   get('f-payment-status'),
    check:           getN('f-check'),
    debt:            getN('f-debt'),
    debtDate:        get('f-debt-date'),
    total:           getN('f-total'),
    moldingAuthor:   get('f-molding-author'),
    partner:         get('f-partner'),
    supplierStatus:  get('f-supplier-status'),
    purchase:        getN('f-purchase'),
    income:          getN('f-income'),
    remainder:       getN('f-remainder'),
    paymentMethod:   get('f-payment-method'),
    dropshipper:     get('f-dropshipper'),
    dropshipperPayout: getN('f-payout-dropshipper'),
    statusDone:      existingOrder ? existingOrder.statusDone : false,
    inWork:          (currentRole === 'owner' || currentRole === 'manager')
      ? (document.getElementById('f-in-work')?.checked || false)
      : (existingOrder ? existingOrder.inWork : false),
    isCancelled:     (currentRole === 'owner' || currentRole === 'manager')
      ? (document.getElementById('f-cancelled')?.checked || false)
      : (existingOrder ? !!existingOrder.isCancelled : false),
    workerDone:      isNew ? false : (orders.find(x => x.id === editingOrderId)?.workerDone || false),
    assistant:       document.getElementById('f-assistant')?.value || '',
    manager:         document.getElementById('f-manager')?.value || '',
    priceLocked:     (currentRole === 'senior') ? true : (existingOrder ? existingOrder.priceLocked : false),
    toningExternal:  document.getElementById('f-toning-external')?.checked || false,
    marginTotal:     getN('f-margin-total'),
    payoutDropshipper:     getN('f-payout-dropshipper'),
    payoutManagerGlass:    getN('f-payout-manager-glass'),
    payoutRespGlass:       getN('f-payout-resp-glass'),
    payoutLesha:           getN('f-payout-lesha'),
    payoutRoma:            getN('f-payout-roma'),
    payoutExtraResp:       getN('f-payout-extra-resp'),
    payoutExtraAssist:     getN('f-payout-extra-assist'),
    payoutMoldingResp:     getN('f-payout-molding-resp'),
    payoutMoldingAssist:   getN('f-payout-molding-assist'),
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
    if (currentMonthFilter) {
      renderOrdersForMonth(currentMonthFilter);
    } else {
      renderMonths();
    }
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
    'Оплачено':           'status-paid',
    'Частично оплачено':  'status-partial',
    'Не оплачено':        'status-unpaid',
    'Долг':               'status-debt',
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
        o.equipment, o.notes, o.author,
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
    if (currentOrderTab === 'planner') {
      list = list.filter(o => o.inWork && !o.workerDone);
    } else if (currentOrderTab === 'selection') {
      list = list.filter(o => !o.inWork && !o.workerDone);
    } else if (currentOrderTab === 'done') {
      list = list.filter(o => o.workerDone);
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
  list.sort((a, b) => {
    const ad = a.date || '';
    const bd = b.date || '';
    return sort === 'asc' ? ad.localeCompare(bd) : bd.localeCompare(ad);
  });

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
  if (o.responsible !== currentWorkerName) return;
  o.workerDone = !o.workerDone;
  try {
    await sbUpdateOrder(o);
    await _upsertOrderSalaries(o);
    // Автозачисление в кассу если наличка и заказ отмечен выполненным
    if (o.workerDone && typeof addCashFromOrder === 'function') {
      await addCashFromOrder(o);
    }
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

// Начислить / удалить записи ЗП для всех участников заказа
async function _upsertOrderSalaries(order) {
  const participants = [order.responsible, order.assistant].filter(Boolean);

  // Рома получает тату-бонус по всем заказам с tatu > 0 — даже если его нет в заказе
  const romaName = 'Рома';
  const hasRoma = participants.includes(romaName);
  const tatuBonus = (Number(order.tatu) || 0) > 0 ? Math.round((Number(order.tatu) || 0) * 0.20) : 0;
  if (!hasRoma && tatuBonus > 0) {
    participants.push('__roma_tatu__'); // виртуальный участник для тату-бонуса Роме
  }

  // Менеджер (Саша Менеджер или Макс) — если указан в поле manager заказа
  const managerName = order.manager || '';
  const SASHA_MANAGER = 'Саша Менеджер';
  if (managerName === SASHA_MANAGER && !participants.includes(SASHA_MANAGER)) {
    participants.push('__manager__'); // виртуальный участник
  }

  // Всегда берём актуальные записи ЗП по этому заказу из БД
  let existingInDb = [];
  try {
    existingInDb = await sbFetchSalariesByOrder(order.id) || [];
  } catch (e) { /* если упало — продолжаем с пустым массивом */ }

  for (const participant of participants) {
    // Определяем реальное имя и сумму
    let workerName, amount;

    if (participant === '__roma_tatu__') {
      workerName = romaName;
      amount = order.workerDone ? tatuBonus : 0;
    } else if (participant === '__manager__') {
      workerName = SASHA_MANAGER;
      const glassMargin = Math.max(0, (Number(order.income) || 0) - (Number(order.purchase) || 0));
      amount = order.workerDone ? (800 + Math.round(glassMargin * 0.10)) : 0;
    } else {
      workerName = participant;
      // Для Ромы если он в заказе — его обычная ЗП (без тату, тату уже в __roma_tatu__ или добавляем сюда)
      if (workerName === romaName && tatuBonus > 0) {
        // Рома в заказе + есть тату: обычная ЗП уже включает услуги (tatu в services),
        // но тату-бонус = дополнительные 20% сверх стандартного расчёта
        // calcOrderSalary уже считает 20% от всех услуг включая tatu,
        // значит тату-бонус НЕ удваиваем — просто используем стандартный calcOrderSalary
        amount = order.workerDone ? calcOrderSalary(workerName, order) : 0;
      } else {
        amount = order.workerDone ? calcOrderSalary(workerName, order) : 0;
      }
    }

    console.log('[salary]', workerName, '| amount:', amount);

    // Ищем существующую запись по worker_name
    const existingEntry = existingInDb.find(s => s.worker_name === workerName);

    if (order.workerDone && amount > 0) {
      if (!existingEntry) {
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
        <button class="orders-tab" id="tab-selection" onclick="setOrderTab('selection')">Подборка</button>
        <button class="orders-tab" id="tab-planner"   onclick="setOrderTab('planner')">Планёрка</button>
        <button class="orders-tab" id="tab-done"      onclick="setOrderTab('done')">Выполненные</button>
        <button class="orders-tab" id="tab-debt"      onclick="setOrderTab('debt')">Долг</button>
        <button class="orders-tab" id="tab-cancelled" onclick="setOrderTab('cancelled')">Отмененные</button>
      `;
    }
    setOrderTab('selection');
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
// Полный пересчёт маржи и выплат
function recalcFullMargins() {
  const val = id => Number(document.getElementById(id)?.value) || 0;
  const incomeGlass   = val('f-income');
  const purchaseGlass = val('f-purchase');
  const moldingSum    = val('f-molding');
  const extraSum      = val('f-extra-work');
  const toningSum     = val('f-toning');
  const tatuSum       = val('f-tatu');
  const total         = val('f-total');
  const toningExternal = document.getElementById('f-toning-external')?.checked || false;

  const marginGlass = incomeGlass - purchaseGlass;
  const costMolding = moldingSum * 0.4;
  const costToning  = toningSum * 0.4;

  const payoutDropshipper = document.getElementById('f-dropshipper')?.value ? marginGlass : 0;

  // Менеджер — только Саша Менеджер через поле f-manager
  const managerValue = document.getElementById('f-manager')?.value || '';
  const payoutManagerGlass = (managerValue === 'Саша Менеджер' && marginGlass > 0)
    ? Math.round(marginGlass * 0.10) : 0;

  // Старший responsible — Костя или Саша Смоков: 10% от маржи стекла
  const responsibleName = document.getElementById('f-responsible')?.value || '';
  const payoutRespGlass = (['Костя', 'Саша Смоков'].includes(responsibleName) && incomeGlass > 0)
    ? Math.round(marginGlass * 0.10) : 0;

  // Рома: 20% от tatu (всегда, если tatu > 0)
  const payoutRoma = tatuSum > 0 ? Math.round(tatuSum * 0.20) : 0;

  const payoutLesha       = toningExternal ? 0 : Math.round(toningSum * 0.20);
  const payoutExtraResp   = Math.round(extraSum * 0.20);
  const payoutExtraAssist = Math.round(extraSum * 0.20);
  const payoutMoldingResp   = Math.round(moldingSum * 0.20);
  const payoutMoldingAssist = Math.round(moldingSum * 0.20);

  const costs = purchaseGlass + costMolding + costToning;
  const payouts = payoutDropshipper + payoutManagerGlass + payoutRespGlass + payoutLesha + payoutRoma +
                  payoutExtraResp + payoutExtraAssist + payoutMoldingResp + payoutMoldingAssist;

  const marginTotal = total - costs - payouts;

  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = Math.round(v); };
  setVal('f-remainder',           marginGlass);
  setVal('f-margin-total',        marginTotal);
  setVal('f-payout-dropshipper',  payoutDropshipper);
  setVal('f-payout-manager-glass',payoutManagerGlass);
  setVal('f-payout-resp-glass',   payoutRespGlass);
  setVal('f-payout-lesha',        payoutLesha);
  setVal('f-payout-roma',         payoutRoma);
  setVal('f-payout-extra-resp',   payoutExtraResp);
  setVal('f-payout-extra-assist', payoutExtraAssist);
  setVal('f-payout-molding-resp', payoutMoldingResp);
  setVal('f-payout-molding-assist',payoutMoldingAssist);
}

// синхронизация чекбоксов услуг с hidden-полем
function syncServiceTypes(recalc = true) {
  const box = document.querySelectorAll('#service-type-checkboxes input[type="checkbox"]');
  const vals = [...box].filter(el => el.checked).map(el => el.value);
  const hidden = document.getElementById('f-service-type');
  if (hidden) hidden.value = vals.join(', ');
  if (recalc) recalcTotal();
}

// ============================================================
// AUTOCOMPLETE ENGINE — клиент и авто
// ============================================================

const _ac = {
  client: { activeIdx: -1 },
  car:    { activeIdx: -1 },
  code:   { activeIdx: -1 },
};

// Подсвечивает совпадающую часть строки
function acHighlight(str, query) {
  if (!query) return escapeHtml(str);
  const idx = str.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escapeHtml(str);
  return escapeHtml(str.slice(0, idx))
    + '<span class="ac-item-match">' + escapeHtml(str.slice(idx, idx + query.length)) + '</span>'
    + escapeHtml(str.slice(idx + query.length));
}

function acGetItems(type, query) {
  const q = (query || '').trim().toLowerCase();
  if (type === 'client') {
    const clients = getClients();
    return clients
      .filter(c => !q || c.name.toLowerCase().startsWith(q))
      .slice(0, 40)
      .map(c => ({
        label:   c.name,
        sub:     c.phone || '',
        value:   c.name,
        client:  c,
      }));
  }
  if (type === 'car') {
    const cars = refCars || [];
    return cars
      .filter(c => !q || c.model.toLowerCase().startsWith(q))
      .slice(0, 40)
      .map(c => ({
        label:   c.model,
        sub:     c.eurocode ? 'Еврокод: ' + c.eurocode : '',
        value:   c.model,
        car:     c,
      }));
  }
  if (type === 'code') {
    const cars = (refCars || []).filter(c => c.eurocode);
    return cars
      .filter(c => !q || c.eurocode.toLowerCase().startsWith(q))
      .slice(0, 40)
      .map(c => ({
        label: c.eurocode,
        sub:   c.model,
        value: c.eurocode,
        car:   c,
      }));
  }
  return [];
}

function acRender(type, query) {
  const listEl = document.getElementById('ac-' + type + '-list');
  if (!listEl) return;
  const items = acGetItems(type, query);
  _ac[type].activeIdx = -1;

  if (!items.length) {
    listEl.innerHTML = '<div class="ac-empty">Ничего не найдено</div>';
    return;
  }

  listEl.innerHTML = items.map((item, i) => `
    <div class="ac-item" data-idx="${i}"
      onmousedown="acSelect('${type}', ${i})"
      onmouseover="acSetActive('${type}', ${i})">
      <div class="ac-item-name">${acHighlight(item.label, query)}</div>
      ${item.sub ? `<div class="ac-item-sub">${escapeHtml(item.sub)}</div>` : ''}
    </div>
  `).join('');

  // Сохраняем items для выбора по индексу
  _ac[type]._items = items;
}

function acOpen(type) {
  const input  = document.getElementById('f-' + type);
  const listEl = document.getElementById('ac-' + type + '-list');
  if (!input || !listEl) return;
  acRender(type, input.value);
  listEl.classList.add('open');
}

function acFilter(type) {
  const input  = document.getElementById('f-' + type);
  const listEl = document.getElementById('ac-' + type + '-list');
  if (!input || !listEl) return;
  acRender(type, input.value);
  listEl.classList.add('open');
  // Для авто — пробуем заполнить еврокод при точном совпадении
  if (type === 'car') onCarInputChange(input.value);
  // Для кода — пробуем заполнить авто при точном совпадении
  if (type === 'code') onCodeInputChange(input.value);
}

function acBlur(type) {
  // Задержка чтобы onmousedown на item успел сработать раньше blur
  setTimeout(() => {
    const listEl = document.getElementById('ac-' + type + '-list');
    if (listEl) listEl.classList.remove('open');
    _ac[type].activeIdx = -1;
  }, 180);
}

function acSetActive(type, idx) {
  _ac[type].activeIdx = idx;
  const items = document.querySelectorAll('#ac-' + type + '-list .ac-item');
  items.forEach((el, i) => el.classList.toggle('ac-active', i === idx));
}

function acKey(event, type) {
  const listEl = document.getElementById('ac-' + type + '-list');
  if (!listEl || !listEl.classList.contains('open')) return;

  const items = listEl.querySelectorAll('.ac-item');
  let idx = _ac[type].activeIdx;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    idx = Math.min(idx + 1, items.length - 1);
    acSetActive(type, idx);
    items[idx]?.scrollIntoView({ block: 'nearest' });
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    idx = Math.max(idx - 1, 0);
    acSetActive(type, idx);
    items[idx]?.scrollIntoView({ block: 'nearest' });
  } else if (event.key === 'Enter') {
    if (idx >= 0) {
      event.preventDefault();
      acSelect(type, idx);
    }
  } else if (event.key === 'Escape') {
    listEl.classList.remove('open');
  }
}

function acSelect(type, idx) {
  const item = (_ac[type]._items || [])[idx];
  if (!item) return;

  if (type === 'client') {
    const input = document.getElementById('f-client');
    if (input) input.value = item.value;

    // Автозаполнение телефона
    const phoneEl = document.getElementById('f-phone');
    if (phoneEl && item.client?.phone) phoneEl.value = item.client.phone;

    // Автозаполнение последнего авто этого клиента
    const c = item.client;
    if (c && c.orders && c.orders.length) {
      const lastCar = c.orders[c.orders.length - 1].car || '';
      const carEl   = document.getElementById('f-car');
      if (carEl && lastCar) {
        carEl.value = lastCar;
        onCarInputChange(lastCar);
      }
    }
  }

  if (type === 'car') {
    const input = document.getElementById('f-car');
    if (input) input.value = item.value;

    // Автозаполнение еврокода из справочника
    const codeEl = document.getElementById('f-code');
    if (codeEl) codeEl.value = item.car?.eurocode || '';
  }

  if (type === 'code') {
    const input = document.getElementById('f-code');
    if (input) input.value = item.value;

    // Обратное заполнение: еврокод → авто
    const carEl = document.getElementById('f-car');
    if (carEl && item.car?.model) carEl.value = item.car.model;
  }

  // Закрываем список
  const listEl = document.getElementById('ac-' + type + '-list');
  if (listEl) listEl.classList.remove('open');
  _ac[type].activeIdx = -1;
}
