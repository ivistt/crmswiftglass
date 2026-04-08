// ============================================================
// CLIENTS.JS — экран клиентов и детальный экран клиента
// ============================================================

function renderClients() {
  const search = (document.getElementById('filter-client-search')?.value || '').toLowerCase();

  let list = getClients();

  if (search) list = list.filter(c =>
    (c.name  || '').toLowerCase().includes(search) ||
    (c.phone || '').toLowerCase().includes(search)
  );

  const container = document.getElementById('clients-list');

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👥</div>
        <h3>Клиенты не найдены</h3>
        <p>Клиенты появляются автоматически при создании заказов</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map(c => `
    <div class="client-card" onclick="openClientDetail('${encodeURIComponent(c.phone || c.name)}')">
      <div class="client-name">${c.name}</div>
      <div class="client-phone">${c.phone || '—'}</div>
      <div class="client-orders">📋 Заказов: ${c.orders.length}</div>
    </div>
  `).join('');
}

function openClientDetail(key) {
  const decoded = decodeURIComponent(key);
  const clients = getClients();
  const c = clients.find(x => (x.phone || x.name) === decoded);
  if (!c) return;

  const totalSpent = c.orders.reduce((s, o) => s + (Number(o.total) || 0), 0);

  const el = document.getElementById('client-detail-content');
  el.innerHTML = `
    <div class="detail-header">
      <div class="detail-header-top">
        <div>
            <div class="detail-title">${c.name}</div>
            <div class="detail-subtitle">${c.phone || '—'}</div>
          </div>
        <div>
          <div style="font-size:12px;color:var(--text3);margin-bottom:2px;">Всего потрачено</div>
          <div style="font-size:24px;font-weight:800;color:var(--accent);">${totalSpent.toLocaleString('ru')} ₴</div>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">📋 История заказов (${c.orders.length})</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${c.orders.map(o => `
          <div class="order-card" onclick="openOrderDetail('${o.id}')">
            <div class="order-card-top">
              <div class="order-card-left">
                <span class="order-id">${o.id}</span>
                <span class="order-name">${o.car || '—'}</span>
              </div>
              <div style="display:flex;gap:8px;">
                ${statusBadge(o.paymentStatus)}
              </div>
            </div>
            <div class="order-card-meta">
              <span class="order-meta-item">🗓️ ${formatDate(o.date)}</span>
              <span class="order-meta-item">🚧 ${o.responsible || '—'}</span>
              ${((Number(o.total) || 0) + (Number(o.income) || 0) + (Number(o.delivery) || 0)) > 0 ? `<span class="order-meta-item" style="font-weight:700;color:var(--accent);">💰 ${((Number(o.total) || 0) + (Number(o.income) || 0) + (Number(o.delivery) || 0)).toLocaleString('ru')} ₴</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  showScreen('client-detail');
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return parts[0][0].toUpperCase() + parts[1][0].toUpperCase();
  return name[0].toUpperCase();
}

// ============================================================
// СОЗДАНИЕ КЛИЕНТА
// ============================================================

// Хранилище локально-созданных клиентов (без заказов)
let manualClients = [];

function openClientModal() {
  document.getElementById('c-name').value = '';
  document.getElementById('c-phone').value = '';
  document.getElementById('client-modal').classList.add('active');
  setTimeout(() => document.getElementById('c-name').focus(), 100);
}

function closeClientModal() {
  document.getElementById('client-modal').classList.remove('active');
}

async function saveClient() {
  const name  = document.getElementById('c-name').value.trim();
  const phone = document.getElementById('c-phone').value.trim();

  if (!name) {
    alert('Введите имя клиента');
    document.getElementById('c-name').focus();
    return;
  }

  // Проверяем дубли среди существующих клиентов из заказов
  const existing = getClients();
  const key = phone || name;
  if (existing.find(c => (c.phone || c.name) === key)) {
    showToast('Клиент с таким телефоном/именем уже существует', 'error');
    return;
  }

  const saveBtn = document.getElementById('client-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳'; }

  try {
    // Сохраняем как пустой заказ-заглушку в Supabase чтобы клиент появился в базе,
    // либо просто добавляем локально в manualClients
    manualClients.push({ name, phone, orders: [] });
    closeClientModal();
    renderClients();
    showToast('Клиент добавлен ✓');
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Сохранить'; }
  }
}
