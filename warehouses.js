// ============================================================
// WAREHOUSES.JS — Склады и долги перед поставщиками
// ============================================================

let currentWarehouseFilter = null;

function openWarehousesScreen() {
  currentWarehouseFilter = null;
  renderWarehousesScreen();
  showScreen('warehouses');
}

function renderWarehousesScreen() {
  const container = document.getElementById('warehouses-list');
  if (!container) return;
  // Ищем все неоплаченные/частично оплаченные заказы
  const debtOrders = orders.filter(o => 
    !o.isCancelled &&
    (o.supplierStatus === 'Не оплачено' || o.supplierStatus === 'Частично оплачено')
  );

  if (!debtOrders.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">✅</div>
        <h3>Все поставщики оплачены</h3>
      </div>
    `;
    return;
  }

  // Группируем по складам
  const map = {};
  for (const o of debtOrders) {
    const w = o.warehouse || 'Без склада';
    if (!map[w]) map[w] = [];
    map[w].push(o);
  }

  const keys = Object.keys(map).sort();
  container.innerHTML = keys.map(w => {
    const list = map[w];
    const totalDebt = list.reduce((sum, o) => {
      const debt = (Number(o.purchase) || 0) - (Number(o.check) || 0);
      return sum + (debt > 0 ? debt : 0);
    }, 0);

    return `
      <div class="home-card" style="display:flex;flex-direction:column;min-height:110px;" onclick="openWarehouseDetail('${escapeAttr(w)}')">
        <div style="font-size:12px;color:var(--text3);font-weight:600;letter-spacing:0.04em;">
          Заказов: ${list.length}
        </div>
        <div style="margin-top:auto;padding-top:12px;">
          <div style="font-size:20px;font-weight:800;line-height:1.2;margin-bottom:6px;">${escapeHtml(w)}</div>
          <div style="font-size:18px;color:var(--red);font-weight:700;">Долг: ${totalDebt.toLocaleString('ru')} ₴</div>
        </div>
      </div>
    `;
  }).join('');
  initIcons();
}

function openWarehouseDetail(w) {
  currentWarehouseFilter = w;
  const titleEl = document.getElementById('warehouse-detail-title');
  if (titleEl) titleEl.textContent = `Склад: ${w}`;
  renderWarehouseDetail();
  showScreen('warehouse-detail');
}

function renderWarehouseDetail() {
  const container = document.getElementById('warehouse-detail-body');
  if (!container) return;
  const w = currentWarehouseFilter;
  
  const debtOrders = orders.filter(o => 
    !o.isCancelled &&
    (o.warehouse || 'Без склада') === w &&
    (o.supplierStatus === 'Не оплачено' || o.supplierStatus === 'Частично оплачено')
  );

  if (!debtOrders.length) {
    container.innerHTML = '<div class="empty-state">Нет неоплаченных заказов</div>';
    return;
  }

  // Группировка Год -> Месяц -> День
  const tree = {};
  for (const o of debtOrders) {
    if (!o.date) continue; // Формат "YYYY-MM-DD"
    const year = o.date.slice(0, 4);
    const month = o.date.slice(5, 7);
    const day = o.date; // full date
    
    if (!tree[year]) tree[year] = {};
    if (!tree[year][month]) tree[year][month] = {};
    if (!tree[year][month][day]) tree[year][month][day] = [];
    
    tree[year][month][day].push(o);
  }

  const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  
  let html = '';
  const years = Object.keys(tree).sort((a,b) => b.localeCompare(a)); // по убыванию
  
  for (const year of years) {
    html += `<div style="font-size:18px;font-weight:800;color:var(--text);margin:24px 0 12px;">${year} год</div>`;
    const months = Object.keys(tree[year]).sort((a,b) => b.localeCompare(a));
    
    for (const month of months) {
      html += `<div style="font-size:15px;font-weight:700;color:var(--text2);margin:16px 0 8px;padding-left:8px;border-left:2px solid var(--border);">${MONTH_NAMES[parseInt(month)-1]}</div>`;
      const days = Object.keys(tree[year][month]).sort((a,b) => b.localeCompare(a));
      
      for (const day of days) {
        html += `<div style="font-size:13px;font-weight:600;color:var(--text3);margin:12px 0 8px 16px;">${formatDate(day)}</div>`;
        const dayOrders = tree[year][month][day].sort((a,b) => (b.time || '').localeCompare(a.time || ''));
        
        for (const o of dayOrders) {
          const debt = (Number(o.purchase) || 0) - (Number(o.check) || 0);
          const badgeColor = o.supplierStatus === 'Частично оплачено' ? 'var(--yellow)' : 'var(--red)';
          html += `
            <div class="order-card" style="margin-left:16px; margin-bottom:8px;" onclick="openOrderDetail('${o.id}')">
              <div class="order-card-top">
                <div class="order-card-left">
                  <span class="order-id">${o.id}</span>
                  <span class="order-name">${o.car || '—'}</span>
                </div>
                <div style="font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;border:1px solid ${badgeColor};color:${badgeColor};">${o.supplierStatus}</div>
              </div>
              <div class="order-card-meta" style="flex-wrap:nowrap;justify-content:space-between;align-items:center;">
                <span class="order-meta-item" style="color:var(--text3);">⏰ ${o.time || '—'}</span>
                <span class="order-meta-item" style="font-weight:800;color:var(--red);font-size:14px;">Долг: ${debt.toLocaleString('ru')} ₴</span>
              </div>
            </div>
          `;
        }
      }
    }
  }

  container.innerHTML = html;
  initIcons();
}
