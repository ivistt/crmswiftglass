// ============================================================
// CLIENTS.JS — экран клиентов и детальный экран клиента
// ============================================================

let currentClientDetailKey = null;
let clientStatementClientKey = null;
let clientStatementMode = 'single';
let editingClientKey = null;
let editingClientOriginal = null;

const CLIENT_STATEMENT_COMPANY = {
  name: 'ФОП БАБЕНКО ОЛЕГ АНАТОЛІЙОВИЧ',
  taxId: '2937309974',
  iban: 'UA033052990000026003004928133',
  bank: 'АТ КБ «ПриватБанк»',
};

function getClientStatementClient() {
  if (!clientStatementClientKey) return null;
  const decoded = decodeURIComponent(clientStatementClientKey);
  return getClients().find(client => (client.phone || client.name) === decoded) || null;
}

function getClientStatementPeriod() {
  if (clientStatementMode === 'range') {
    const from = document.getElementById('client-statement-from-date')?.value || '';
    const to = document.getElementById('client-statement-to-date')?.value || '';
    if (!from || !to) return { error: 'Укажите начало и конец периода' };
    if (from > to) return { error: 'Дата начала не может быть позже даты окончания' };
    return { from, to, label: from === to ? formatDate(from) : `${formatDate(from)} — ${formatDate(to)}` };
  }

  const date = document.getElementById('client-statement-single-date')?.value || '';
  if (!date) return { error: 'Выберите дату' };
  return { from: date, to: date, label: formatDate(date) };
}

function getClientStatementRows(client, period) {
  if (!client || !period?.from || !period?.to) return [];
  return (client.orders || [])
    .filter(order => order?.workerDone && !order?.isCancelled && !isOrderDeleted(order))
    .filter(order => String(order?.date || '') >= period.from && String(order?.date || '') <= period.to)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))
      || String(a.time || '').localeCompare(String(b.time || ''))
      || String(a.id || '').localeCompare(String(b.id || '')))
    .map(order => {
      const total = getOrderClientTotalAmount(order);
      const paid = getOrderClientPaidAmount(order);
      return {
        id: formatClientStatementOrderId(order.id),
        date: order.date || '',
        car: order.car || '—',
        total,
        paid,
        left: Math.max(0, total - paid),
      };
    });
}

function getClientStatementTotals(rows) {
  return (rows || []).reduce((totals, row) => {
    totals.total += Number(row?.total) || 0;
    totals.paid += Number(row?.paid) || 0;
    totals.left += Number(row?.left) || 0;
    return totals;
  }, { total: 0, paid: 0, left: 0 });
}

function formatClientStatementMoney(value) {
  return `${(Number(value) || 0).toLocaleString('uk-UA')} ₴`;
}

function formatClientStatementOrderId(id) {
  const raw = String(id || '').trim();
  if (!raw || raw === '—') return '—';
  const sgMatch = raw.match(/^SG-(\d+)$/i);
  if (sgMatch) return `SG-${sgMatch[1].padStart(4, '0')}`;
  if (/^\d+$/.test(raw)) return `SG-${raw.padStart(4, '0')}`;
  return raw;
}

function pluralClientStatementRu(value, forms) {
  const n = Math.abs(Number(value) || 0) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

function clientStatementTripletToWordsUa(value, gender = 'male') {
  const units = {
    male: ['', 'один', 'два', 'три', 'чотири', "п'ять", 'шість', 'сім', 'вісім', "дев'ять"],
    female: ['', 'одна', 'дві', 'три', 'чотири', "п'ять", 'шість', 'сім', 'вісім', "дев'ять"],
  };
  const teens = ['десять', 'одинадцять', 'дванадцять', 'тринадцять', 'чотирнадцять', "п'ятнадцять", 'шістнадцять', 'сімнадцять', 'вісімнадцять', "дев'ятнадцять"];
  const tens = ['', '', 'двадцять', 'тридцять', 'сорок', "п'ятдесят", 'шістдесят', 'сімдесят', 'вісімдесят', "дев'яносто"];
  const hundreds = ['', 'сто', 'двісті', 'триста', 'чотириста', "п'ятсот", 'шістсот', 'сімсот', 'вісімсот', "дев'ятсот"];
  const n = Number(value) || 0;
  const parts = [];
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  if (h) parts.push(hundreds[h]);
  if (t === 1) {
    parts.push(teens[u]);
  } else {
    if (t) parts.push(tens[t]);
    if (u) parts.push((units[gender] || units.male)[u]);
  }
  return parts.join(' ');
}

function formatClientStatementMoneyWordsUa(value) {
  const amount = Math.max(0, Number(value) || 0);
  let hryvnia = Math.floor(amount);
  let kop = Math.round((amount - hryvnia) * 100);
  if (kop >= 100) {
    hryvnia += 1;
    kop = 0;
  }
  const scales = [
    { forms: ['', '', ''], gender: 'female' },
    { forms: ['тисяча', 'тисячі', 'тисяч'], gender: 'female' },
    { forms: ['мільйон', 'мільйони', 'мільйонів'], gender: 'male' },
    { forms: ['мільярд', 'мільярди', 'мільярдів'], gender: 'male' },
  ];
  if (!hryvnia) return `нуль гривень ${String(kop).padStart(2, '0')} копійок`;

  const words = [];
  let rest = hryvnia;
  let scaleIndex = 0;
  while (rest > 0 && scaleIndex < scales.length) {
    const triplet = rest % 1000;
    if (triplet) {
      const scale = scales[scaleIndex];
      const tripletWords = clientStatementTripletToWordsUa(triplet, scale.gender);
      const scaleWord = scaleIndex ? pluralClientStatementRu(triplet, scale.forms) : '';
      words.unshift([tripletWords, scaleWord].filter(Boolean).join(' '));
    }
    rest = Math.floor(rest / 1000);
    scaleIndex += 1;
  }

  const hryvniaWord = pluralClientStatementRu(hryvnia, ['гривня', 'гривні', 'гривень']);
  return `${words.join(' ')} ${hryvniaWord} ${String(kop).padStart(2, '0')} копійок`;
}

function parseClientStatementDate(dateString) {
  const parts = String(dateString || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) return new Date();
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatClientStatementLongDateUa(dateString) {
  const months = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
  const date = dateString instanceof Date ? dateString : parseClientStatementDate(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  return `${day} ${months[date.getMonth()]} ${date.getFullYear()} р.`;
}

function getClientStatementDateString(date = new Date()) {
  if (typeof todayStr === 'function') return todayStr();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getClientInvoiceName(client, order = null) {
  return String(client?.alias || client?.name || order?.client || 'Покупець').trim();
}

function buildClientInvoiceBuyerHtml(client, order = null, details = '') {
  const invoiceName = getClientInvoiceName(client, order);
  const requisites = String(client?.requisites || '').trim();
  const requisitesHtml = requisites
    ? requisites.split('\n').map(line => escapeHtml(line.trim())).filter(Boolean).join('<br>')
    : '';
  return `
    ${escapeHtml(invoiceName || 'Покупець')}
    ${requisitesHtml ? `<span class="party-note">${requisitesHtml}</span>` : ''}
    ${details ? `<span class="party-note">${details}</span>` : ''}
  `;
}

function getClientStatementNumber(client, period) {
  const raw = String(client?.phone || client?.name || 'client').replace(/\D/g, '').slice(-4);
  const datePart = String(period?.to || period?.from || '').replace(/\D/g, '').slice(2);
  return [datePart || '000000', raw || '0000'].join('-');
}

function openClientStatementModal(key) {
  if (!canPrintClientStatement()) return;
  clientStatementClientKey = key || currentClientDetailKey;
  const client = getClientStatementClient();
  if (!client) return showToast('Клиент не найден', 'error');

  const today = typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0, 10);
  const singleInput = document.getElementById('client-statement-single-date');
  const fromInput = document.getElementById('client-statement-from-date');
  const toInput = document.getElementById('client-statement-to-date');
  if (singleInput) singleInput.value = today;
  if (fromInput) fromInput.value = today;
  if (toInput) toInput.value = today;
  const nameEl = document.getElementById('client-statement-client-name');
  if (nameEl) nameEl.textContent = client.name || 'Клиент';

  setClientStatementMode('single');
  document.getElementById('client-statement-modal')?.classList.add('active');
  renderClientStatementPreview();
  initIcons();
}

function closeClientStatementModal() {
  document.getElementById('client-statement-modal')?.classList.remove('active');
  clientStatementClientKey = null;
}

function setClientStatementMode(mode) {
  clientStatementMode = mode === 'range' ? 'range' : 'single';
  document.querySelectorAll('[data-client-statement-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.clientStatementMode === clientStatementMode);
  });
  const isRange = clientStatementMode === 'range';
  const singleWrap = document.getElementById('client-statement-single-wrap');
  const fromWrap = document.getElementById('client-statement-from-wrap');
  const toWrap = document.getElementById('client-statement-to-wrap');
  if (singleWrap) singleWrap.style.display = isRange ? 'none' : '';
  if (fromWrap) fromWrap.style.display = isRange ? '' : 'none';
  if (toWrap) toWrap.style.display = isRange ? '' : 'none';
  renderClientStatementPreview();
}

function renderClientStatementPreview() {
  const preview = document.getElementById('client-statement-preview');
  const printButton = document.getElementById('client-statement-print-btn');
  if (!preview) return;
  const client = getClientStatementClient();
  const period = getClientStatementPeriod();
  if (!client || period.error) {
    preview.innerHTML = `<div class="client-statement-preview-empty">${escapeHtml(period.error || 'Клиент не найден')}</div>`;
    if (printButton) printButton.disabled = true;
    return;
  }

  const rows = getClientStatementRows(client, period);
  if (!rows.length) {
    preview.innerHTML = '<div class="client-statement-preview-empty">За выбранный период нет завершённых заказов</div>';
    if (printButton) printButton.disabled = true;
    return;
  }

  const totals = getClientStatementTotals(rows);
  preview.innerHTML = `
    <div class="client-statement-preview-title">${escapeHtml(period.label)} · заказов: ${rows.length}</div>
    <div class="client-statement-preview-grid">
      <div class="client-statement-preview-item">
        <div class="client-statement-preview-label">К оплате</div>
        <div class="client-statement-preview-value">${formatClientStatementMoney(totals.total)}</div>
      </div>
      <div class="client-statement-preview-item client-statement-preview-item--paid">
        <div class="client-statement-preview-label">Оплачено</div>
        <div class="client-statement-preview-value">${formatClientStatementMoney(totals.paid)}</div>
      </div>
      <div class="client-statement-preview-item client-statement-preview-item--left">
        <div class="client-statement-preview-label">Остаток</div>
        <div class="client-statement-preview-value">${formatClientStatementMoney(totals.left)}</div>
      </div>
    </div>
  `;
  if (printButton) printButton.disabled = false;
}

function buildClientStatementPrintHtml(client, period, rows) {
  const totals = getClientStatementTotals(rows);
  const phone = String(client?.phone || '').trim();
  const address = String(client?.address || '').trim();
  const clientDetails = [
    phone ? `тел. ${phone}` : '',
    address ? `адреса: ${address}` : '',
  ].filter(Boolean).map(escapeHtml).join(', ');
  const invoiceNumber = formatClientStatementOrderId(rows?.[0]?.id || getClientStatementNumber(client, period));
  const invoiceDate = rows?.[0]?.date || getClientStatementDateString();
  const invoiceTitle = `Рахунок на оплату № ${invoiceNumber} від ${formatClientStatementLongDateUa(invoiceDate)}`;
  const bodyRows = rows.map((row, index) => `
    <tr>
      <td class="col-number">${index + 1}</td>
      <td class="col-id">${escapeHtml(row.id || '—')}</td>
      <td class="col-date">${escapeHtml(formatDate(row.date))}</td>
      <td>${escapeHtml(row.car || '—')}</td>
      <td class="money">${escapeHtml(formatClientStatementMoney(row.total))}</td>
      <td class="money">${escapeHtml(formatClientStatementMoney(row.paid))}</td>
      <td class="money">${escapeHtml(formatClientStatementMoney(row.left))}</td>
    </tr>
  `).join('');
  const rowsWord = pluralClientStatementRu(rows.length, ['замовлення', 'замовлення', 'замовлень']);
  const totalLeftWords = formatClientStatementMoneyWordsUa(totals.left);

  return `<!doctype html>
  <html lang="uk">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(invoiceTitle)}</title>
    <style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #000; background: #fff; font-family: Arial, sans-serif; font-size: 12px; line-height: 1.2; }
      .sheet { width: 100%; min-height: 297mm; padding: 13mm 12mm; }
      .notice {
        margin: 0 auto 10px;
        max-width: 930px;
        border: 1.5px solid #000;
        padding: 4px 10px;
        text-align: center;
        font-size: 10px;
        line-height: 1.15;
      }
      .payment-title {
        margin: 0 0 3px;
        text-align: center;
        font-size: 15px;
        font-weight: 800;
      }
      .payment-box {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 18px;
        margin: 0 auto 28px;
        max-width: 930px;
        border: 1.5px solid #000;
        padding: 22px 70px 20px;
      }
      .payment-line { display: grid; grid-template-columns: 86px 1fr; gap: 10px; align-items: center; margin-bottom: 8px; }
      .payment-label { font-size: 11px; }
      .payment-value { min-height: 19px; border-bottom: 1.5px solid #000; padding: 2px 4px 3px; font-weight: 800; }
      .payment-value.boxed { border: 1.5px solid #000; text-align: center; }
      .payment-value.plain { border-bottom: 0; }
      .credit-title { margin: 29px 0 3px; text-align: center; font-size: 11px; }
      h1 {
        margin: 0 0 7px 4px;
        padding-bottom: 5px;
        border-bottom: 2px solid #000;
        font-size: 21px;
        line-height: 1.15;
      }
      .parties { margin: 13px 4px 24px; }
      .party-row { display: grid; grid-template-columns: 126px 1fr; gap: 12px; margin-bottom: 9px; }
      .party-label { text-decoration: underline; }
      .party-value { font-size: 14px; font-weight: 800; }
      .party-note { display: block; margin-top: 3px; font-size: 11px; font-weight: 400; }
      .contract-row { display: grid; grid-template-columns: 86px 1fr; gap: 12px; margin-top: 22px; font-size: 14px; }
      table.statement-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .statement-table th,
      .statement-table td { border: 1.5px solid #000; padding: 5px 4px; vertical-align: top; }
      .statement-table th { background: #e9e9e9; text-align: center; font-size: 13px; font-weight: 800; }
      .statement-table td { font-size: 11px; }
      .col-number { width: 42px; text-align: center; }
      .col-id { width: 82px; text-align: center; }
      .col-date { width: 82px; text-align: center; white-space: nowrap; }
      .col-car { width: auto; }
      .col-money { width: 118px; }
      .money { text-align: right; white-space: nowrap; }
      .totals {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 250px;
        gap: 24px;
        margin-top: 10px;
        align-items: start;
      }
      .totals-table { width: 100%; border-collapse: collapse; font-size: 14px; font-weight: 800; }
      .totals-table td { padding: 2px 4px; }
      .totals-table td:first-child { text-align: right; }
      .totals-table td:last-child { text-align: right; white-space: nowrap; }
      .amount-text { margin: 18px 4px 0; font-size: 12px; }
      .amount-text strong { display: block; margin-top: 4px; font-size: 14px; }
      .footer-line { margin: 14px 4px 0; border-top: 2px solid #000; }
      .signature {
        display: grid;
        grid-template-columns: 220px 1fr;
        gap: 240px;
        margin: 18px 28px 0;
        font-size: 14px;
        font-weight: 800;
      }
      .signature-line { border-bottom: 1.5px solid #000; height: 18px; }
      .signature-stamp { display: block; width: 160px; max-height: 90px; object-fit: contain; margin-top: -16px; }
      @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style>
  </head>
  <body>
    <main class="sheet">
      <div class="notice">
        Увага! Оплата цього рахунку означає погодження з умовами поставки товарів. Повідомлення про оплату є обов'язковим, в іншому випадку не гарантується наявність товарів на складі. Товар відпускається за фактом надходження коштів на р/р Постачальника, самовивозом, за наявності довіреності та паспорта.
      </div>

      <div class="payment-title">Зразок заповнення платіжного доручення</div>
      <section class="payment-box">
        <div>
          <div class="payment-line">
            <div class="payment-label">Отримувач</div>
            <div class="payment-value plain">${escapeHtml(CLIENT_STATEMENT_COMPANY.name)}</div>
          </div>
          <div class="payment-line">
            <div class="payment-label">Код</div>
            <div class="payment-value boxed">${escapeHtml(CLIENT_STATEMENT_COMPANY.taxId)}</div>
          </div>
          <div class="payment-line">
            <div class="payment-label">Банк отримувача</div>
            <div class="payment-value">${escapeHtml(CLIENT_STATEMENT_COMPANY.bank)}</div>
          </div>
        </div>
        <div>
          <div class="credit-title">КРЕДИТ рах. №</div>
          <div class="payment-line">
            <div class="payment-label">IBAN</div>
            <div class="payment-value boxed">${escapeHtml(CLIENT_STATEMENT_COMPANY.iban)}</div>
          </div>
        </div>
      </section>

      <h1>${escapeHtml(invoiceTitle)}</h1>

      <section class="parties">
        <div class="party-row">
          <div class="party-label">Постачальник:</div>
          <div class="party-value">
            ${escapeHtml(CLIENT_STATEMENT_COMPANY.name)}
            <span class="party-note">РНОКПП: ${escapeHtml(CLIENT_STATEMENT_COMPANY.taxId)}, IBAN: ${escapeHtml(CLIENT_STATEMENT_COMPANY.iban)}, банк: ${escapeHtml(CLIENT_STATEMENT_COMPANY.bank)}</span>
          </div>
        </div>
        <div class="party-row">
          <div class="party-label">Покупець:</div>
          <div class="party-value">${buildClientInvoiceBuyerHtml(client, null, clientDetails)}</div>
        </div>
      </section>

      <table class="statement-table">
        <colgroup>
          <col style="width:42px;">
          <col style="width:82px;">
          <col style="width:82px;">
          <col>
          <col style="width:118px;">
          <col style="width:118px;">
          <col style="width:118px;">
        </colgroup>
        <thead>
          <tr>
            <th class="col-number">№</th>
            <th class="col-id">ID замовлення</th>
            <th>Дата</th>
            <th class="col-car">Автомобіль</th>
            <th class="col-money">Загальна сума до сплати</th>
            <th class="col-money">Сплачена сума</th>
            <th class="col-money">Залишок до сплати</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>

      <section class="totals">
        <div></div>
        <table class="totals-table">
          <tr>
            <td>Разом:</td>
            <td>${escapeHtml(formatClientStatementMoney(totals.total))}</td>
          </tr>
          <tr>
            <td>Сплачено:</td>
            <td>${escapeHtml(formatClientStatementMoney(totals.paid))}</td>
          </tr>
          <tr>
            <td>Залишок:</td>
            <td>${escapeHtml(formatClientStatementMoney(totals.left))}</td>
          </tr>
        </table>
      </section>

      <section class="amount-text">
        Всього ${rows.length} ${rowsWord}, на суму ${escapeHtml(formatClientStatementMoney(totals.total))}.
        <strong>Залишок до сплати: ${escapeHtml(totalLeftWords.charAt(0).toUpperCase() + totalLeftWords.slice(1))}</strong>
      </section>

      <div class="footer-line"></div>
      <section class="signature">
        <div></div>
        <div>
          Виписав(ла):
          <div class="signature-line"></div>
          <img class="signature-stamp" src="images/shtamp.png" alt="">
        </div>
      </section>
    </main>
  </body>
  </html>`;
}

function getClientOrderInvoiceItems(order) {
  const items = [];
  const serviceSelections = typeof getOrderServiceSelections === 'function'
    ? getOrderServiceSelections(order?.serviceType)
    : (typeof parseOrderServiceSelections === 'function' ? parseOrderServiceSelections(order?.serviceType) : []);
  const serviceNames = (serviceSelections || [])
    .map(item => {
      if (typeof formatOrderServiceLabel === 'function') return formatOrderServiceLabel(item.name, item.qty);
      const qty = Math.max(1, Number(item?.qty) || 1);
      return qty > 1 ? `${item.name} ×${qty}` : item.name;
    })
    .filter(Boolean);
  const workAmount = Number(order?.total) || 0;
  const glassAmount = Number(order?.income) || 0;
  const deliveryAmount = Number(order?.delivery) || 0;
  const workDetails = [
    ['Монтаж', order?.mount],
    ['Молдинг', order?.molding],
    ['Додаткові роботи', order?.extraWork],
    ['Тату', order?.tatu],
    ['Тонування', order?.toning],
  ]
    .map(([title, amount]) => ({ title, amount: Number(amount) || 0 }))
    .filter(item => item.amount > 0);
  const workDetailsTotal = workDetails.reduce((sum, item) => sum + item.amount, 0);

  workDetails.forEach(item => {
    items.push({
      title: item.title,
      qty: 1,
      unit: 'посл.',
      price: item.amount,
      sum: item.amount,
    });
  });

  if (workAmount > workDetailsTotal) {
    const restAmount = workAmount - workDetailsTotal;
    items.push({
      title: serviceNames.length ? serviceNames.join(', ') : `Роботи за замовленням ${formatClientStatementOrderId(order?.id)}`,
      qty: 1,
      unit: 'посл.',
      price: restAmount,
      sum: restAmount,
    });
  } else if (workAmount > 0 && !workDetails.length) {
    items.push({
      title: serviceNames.length ? serviceNames.join(', ') : `Роботи за замовленням ${formatClientStatementOrderId(order?.id)}`,
      qty: 1,
      unit: 'посл.',
      price: workAmount,
      sum: workAmount,
    });
  }
  if (glassAmount > 0) {
    const glassParts = ['Скло автомобільне'];
    if (order?.car) glassParts.push(order.car);
    if (order?.code) glassParts.push(order.code);
    items.push({
      title: glassParts.join(' '),
      qty: 1,
      unit: 'шт',
      price: glassAmount,
      sum: glassAmount,
    });
  }
  if (deliveryAmount > 0) {
    items.push({
      title: 'Доставка',
      qty: 1,
      unit: 'посл.',
      price: deliveryAmount,
      sum: deliveryAmount,
    });
  }
  if (!items.length) {
    const total = getOrderClientTotalAmount(order);
    items.push({
      title: `Послуги за замовленням ${formatClientStatementOrderId(order?.id)}`,
      qty: 1,
      unit: 'посл.',
      price: total,
      sum: total,
    });
  }
  return items;
}

function buildClientOrderInvoicePrintHtml(client, order) {
  const invoiceNumber = formatClientStatementOrderId(order?.id);
  const invoiceDate = order?.date || getClientStatementDateString();
  const invoiceTitle = `Рахунок на оплату № ${invoiceNumber} від ${formatClientStatementLongDateUa(invoiceDate)}`;
  const phone = String(order?.phone || client?.phone || '').trim();
  const address = String(order?.address || client?.address || '').trim();
  const clientDetails = [
    phone ? `тел. ${phone}` : '',
    address ? `адреса: ${address}` : '',
  ].filter(Boolean).map(escapeHtml).join(', ');
  const items = getClientOrderInvoiceItems(order);
  const total = items.reduce((sum, item) => sum + (Number(item.sum) || 0), 0);
  const totalWords = formatClientStatementMoneyWordsUa(total);
  const itemRows = items.map((item, index) => `
    <tr>
      <td class="col-number">${index + 1}</td>
      <td>${escapeHtml(item.title || '—')}</td>
      <td class="qty">${escapeHtml(String(item.qty || 1))}</td>
      <td class="unit">${escapeHtml(item.unit || 'посл.')}</td>
      <td class="money">${escapeHtml(formatClientStatementMoney(item.price))}</td>
      <td class="money">${escapeHtml(formatClientStatementMoney(item.sum))}</td>
    </tr>
  `).join('');

  return `<!doctype html>
  <html lang="uk">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(invoiceTitle)}</title>
    <style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #000; background: #fff; font-family: Arial, sans-serif; font-size: 12px; line-height: 1.2; }
      .sheet { width: 100%; min-height: 297mm; padding: 13mm 12mm; }
      .notice {
        margin: 0 auto 10px;
        max-width: 930px;
        border: 1.5px solid #000;
        padding: 4px 10px;
        text-align: center;
        font-size: 10px;
        line-height: 1.15;
      }
      .payment-title { margin: 0 0 3px; text-align: center; font-size: 15px; font-weight: 800; }
      .payment-box {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 18px;
        margin: 0 auto 28px;
        max-width: 930px;
        border: 1.5px solid #000;
        padding: 22px 70px 20px;
      }
      .payment-line { display: grid; grid-template-columns: 86px 1fr; gap: 10px; align-items: center; margin-bottom: 8px; }
      .payment-label { font-size: 11px; }
      .payment-value { min-height: 19px; border-bottom: 1.5px solid #000; padding: 2px 4px 3px; font-weight: 800; }
      .payment-value.boxed { border: 1.5px solid #000; text-align: center; }
      .payment-value.plain { border-bottom: 0; }
      .credit-title { margin: 29px 0 3px; text-align: center; font-size: 11px; }
      h1 {
        margin: 0 0 7px 4px;
        padding-bottom: 5px;
        border-bottom: 2px solid #000;
        font-size: 21px;
        line-height: 1.15;
      }
      .parties { margin: 13px 4px 24px; }
      .party-row { display: grid; grid-template-columns: 126px 1fr; gap: 12px; margin-bottom: 9px; }
      .party-label { text-decoration: underline; }
      .party-value { font-size: 14px; font-weight: 800; }
      .party-note { display: block; margin-top: 3px; font-size: 11px; font-weight: 400; }
      table.invoice-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .invoice-table th,
      .invoice-table td { border: 1.5px solid #000; padding: 5px 4px; vertical-align: top; }
      .invoice-table th { background: #e1e1e1; text-align: center; font-size: 20px; line-height: 1; font-weight: 900; }
      .invoice-table td { font-size: 12px; }
      .col-number { width: 5%; text-align: center; }
      .col-title { width: auto; text-align: left !important; }
      .col-qty { width: 10%; }
      .col-unit { width: 21%; }
      .col-price,
      .col-sum { width: 13%; }
      .qty,
      .unit { text-align: center; white-space: nowrap; }
      .money { text-align: right; white-space: nowrap; }
      .totals {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 250px;
        gap: 24px;
        margin-top: 10px;
        align-items: start;
      }
      .totals-table { width: 100%; border-collapse: collapse; font-size: 14px; font-weight: 800; }
      .totals-table td { padding: 2px 4px; }
      .totals-table td:first-child { text-align: right; }
      .totals-table td:last-child { text-align: right; white-space: nowrap; }
      .amount-text { margin: 18px 4px 0; font-size: 12px; }
      .amount-text strong { display: block; margin-top: 4px; font-size: 14px; }
      .footer-line { margin: 14px 4px 0; border-top: 2px solid #000; }
      .signature {
        display: grid;
        grid-template-columns: 220px 1fr;
        gap: 240px;
        margin: 18px 28px 0;
        font-size: 14px;
        font-weight: 800;
      }
      .signature-line { border-bottom: 1.5px solid #000; height: 18px; }
      .signature-stamp { display: block; width: 160px; max-height: 90px; object-fit: contain; margin-top: -16px; }
      @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style>
  </head>
  <body>
    <main class="sheet">
      <div class="notice">
        Увага! Оплата цього рахунку означає погодження з умовами поставки товарів. Повідомлення про оплату є обов'язковим, в іншому випадку не гарантується наявність товарів на складі. Товар відпускається за фактом надходження коштів на р/р Постачальника, самовивозом, за наявності довіреності та паспорта.
      </div>

      <div class="payment-title">Зразок заповнення платіжного доручення</div>
      <section class="payment-box">
        <div>
          <div class="payment-line">
            <div class="payment-label">Отримувач</div>
            <div class="payment-value plain">${escapeHtml(CLIENT_STATEMENT_COMPANY.name)}</div>
          </div>
          <div class="payment-line">
            <div class="payment-label">Код</div>
            <div class="payment-value boxed">${escapeHtml(CLIENT_STATEMENT_COMPANY.taxId)}</div>
          </div>
          <div class="payment-line">
            <div class="payment-label">Банк отримувача</div>
            <div class="payment-value">${escapeHtml(CLIENT_STATEMENT_COMPANY.bank)}</div>
          </div>
        </div>
        <div>
          <div class="credit-title">КРЕДИТ рах. №</div>
          <div class="payment-line">
            <div class="payment-label">IBAN</div>
            <div class="payment-value boxed">${escapeHtml(CLIENT_STATEMENT_COMPANY.iban)}</div>
          </div>
        </div>
      </section>

      <h1>${escapeHtml(invoiceTitle)}</h1>

      <section class="parties">
        <div class="party-row">
          <div class="party-label">Постачальник:</div>
          <div class="party-value">
            ${escapeHtml(CLIENT_STATEMENT_COMPANY.name)}
            <span class="party-note">РНОКПП: ${escapeHtml(CLIENT_STATEMENT_COMPANY.taxId)}, IBAN: ${escapeHtml(CLIENT_STATEMENT_COMPANY.iban)}, банк: ${escapeHtml(CLIENT_STATEMENT_COMPANY.bank)}</span>
          </div>
        </div>
        <div class="party-row">
          <div class="party-label">Покупець:</div>
          <div class="party-value">${buildClientInvoiceBuyerHtml(client, order, clientDetails)}</div>
        </div>
      </section>

      <table class="invoice-table">
        <colgroup>
          <col style="width:5%;">
          <col>
          <col style="width:10%;">
          <col style="width:21%;">
          <col style="width:13%;">
          <col style="width:13%;">
        </colgroup>
        <thead>
          <tr>
            <th class="col-number">№</th>
            <th class="col-title">Товари (роботи, послуги)</th>
            <th class="col-qty">Кіл-сть</th>
            <th class="col-unit">Од.</th>
            <th class="col-price">Ціна</th>
            <th class="col-sum">Сума</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <section class="totals">
        <div></div>
        <table class="totals-table">
          <tr>
            <td>Разом:</td>
            <td>${escapeHtml(formatClientStatementMoney(total))}</td>
          </tr>
        </table>
      </section>

      <section class="amount-text">
        Всього найменувань ${items.length}, на суму ${escapeHtml(formatClientStatementMoney(total))}.
        <strong>${escapeHtml(totalWords.charAt(0).toUpperCase() + totalWords.slice(1))}</strong>
      </section>

      <div class="footer-line"></div>
      <section class="signature">
        <div></div>
        <div>
          Виписав(ла):
          <div class="signature-line"></div>
          <img class="signature-stamp" src="images/shtamp.png" alt="">
        </div>
      </section>
    </main>
  </body>
  </html>`;
}

function printClientHtmlDocument(html) {
  const existingFrame = document.getElementById('client-statement-print-frame');
  if (existingFrame) existingFrame.remove();

  const printFrame = document.createElement('iframe');
  printFrame.id = 'client-statement-print-frame';
  printFrame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(printFrame);

  const printDocument = printFrame.contentWindow?.document;
  if (!printDocument) {
    printFrame.remove();
    showToast('Не удалось открыть печать', 'error');
    return false;
  }
  printDocument.open();
  printDocument.write(html);
  printDocument.close();
  setTimeout(() => {
    try {
      printFrame.contentWindow?.focus();
      printFrame.contentWindow?.print();
    } finally {
      setTimeout(() => printFrame.remove(), 1200);
    }
  }, 180);
  return true;
}

function printClientStatement() {
  if (!canPrintClientStatement()) return;
  const client = getClientStatementClient();
  const period = getClientStatementPeriod();
  if (!client) return showToast('Клиент не найден', 'error');
  if (period.error) return showToast(period.error, 'error');
  const rows = getClientStatementRows(client, period);
  if (!rows.length) return showToast('За выбранный период нет завершённых заказов', 'error');

  if (!printClientHtmlDocument(buildClientStatementPrintHtml(client, period, rows))) return;
  closeClientStatementModal();
}

function printClientOrderInvoice(orderId) {
  if (!canPrintClientStatement()) return;
  const order = (orders || []).find(item => String(item.id) === String(orderId));
  if (!order) return showToast('Заказ не найден', 'error');
  const decoded = decodeURIComponent(currentClientDetailKey || '');
  const client = getClients().find(item => (item.phone || item.name) === decoded)
    || { name: order.client || '', alias: order.client || '', requisites: '', phone: order.phone || '', address: order.address || '', orders: [order] };
  printClientHtmlDocument(buildClientOrderInvoicePrintHtml(client, order));
}

function buildClientDebtCopyText(client) {
  const debtOrders = (client?.orders || []).filter(order => getOrderDebtLeft(order) > 0);
  if (!debtOrders.length) return '';
  const lines = debtOrders.map(order => {
    const services = formatOrderServiceTypeText(order?.serviceType || '') || '—';
    const total = getOrderClientTotalAmount(order);
    const debtLeft = getOrderDebtLeft(order);
    return [
      formatDate(order.date),
      `Авто: ${order.car || '—'}`,
      `Услуги: ${services}`,
      `Общая сумма: ${total.toLocaleString('ru')} ₴`,
      `Остаток долга: ${debtLeft.toLocaleString('ru')} ₴`,
    ].join('\n');
  });
  const totalAmount = debtOrders.reduce((sum, order) => sum + getOrderClientTotalAmount(order), 0);
  const totalDebt = debtOrders.reduce((sum, order) => sum + getOrderDebtLeft(order), 0);
  return `${client.name || 'Клиент'}\n\n${lines.join('\n\n')}\n\nИтого по заказам: ${totalAmount.toLocaleString('ru')} ₴\nИтого долг: ${totalDebt.toLocaleString('ru')} ₴`;
}

async function copyClientDebtSummary(key) {
  const decoded = decodeURIComponent(key || '');
  const client = getClients().find(item => (item.phone || item.name) === decoded);
  if (!client) return;
  const text = buildClientDebtCopyText(client);
  if (!text) {
    showToast('У клиента нет заказов с долгом', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Сводка долга скопирована ✓');
  } catch (e) {
    showToast('Не удалось скопировать', 'error');
  }
}

function renderClients() {
  const search = (document.getElementById('filter-client-search')?.value || '').toLowerCase();
  const sort = document.getElementById('filter-client-sort')?.value || 'debt-desc';
  const debtFilter = document.getElementById('filter-client-debt')?.value || 'all';

  let list = getClients().map(client => ({ ...client, debt: getClientDebtTotal(client) }));

  if (search) list = list.filter(c =>
    (c.name  || '').toLowerCase().includes(search) ||
    (c.alias || '').toLowerCase().includes(search) ||
    (c.requisites || '').toLowerCase().includes(search) ||
    (c.phone || '').toLowerCase().includes(search)
  );
  if (debtFilter === 'debt') list = list.filter(c => c.debt > 0);
  if (debtFilter === 'no-debt') list = list.filter(c => c.debt <= 0);

  list.sort((a, b) => {
    if (sort === 'debt-asc') return a.debt - b.debt || (a.name || '').localeCompare(b.name || '');
    if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
    return b.debt - a.debt || (a.name || '').localeCompare(b.name || '');
  });

  const container = document.getElementById('clients-list');

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icon('users')}</div>
        <h3>Клиенты не найдены</h3>
        <p>Клиенты появляются автоматически при создании заказов</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map(c => `
    <div class="client-card" onclick="openClientDetail('${escapeAttr(encodeURIComponent(c.phone || c.name))}')">
      <div class="client-info">
        <div class="client-name">${c.name}</div>
        ${c.alias && c.alias !== c.name ? `<div class="client-phone">Псевдоним: ${escapeHtml(c.alias)}</div>` : ''}
        <div class="client-phone">${c.phone || '—'}</div>
        <div class="client-phone">${c.address || '—'}</div>
        <div class="client-orders">${icon('clipboard-list')} Заказов: ${c.orders.length}</div>
      </div>
      <div class="client-debt-pill ${c.debt > 0 ? 'has-debt' : 'no-debt'}">
        <span>${c.debt > 0 ? 'С долгом' : 'Без долга'}</span>
        <strong>${c.debt.toLocaleString('ru')} ₴</strong>
      </div>
    </div>
  `).join('');
}

function getOrderDebtLeft(order) {
  if (!order || order.isCancelled || isOrderDeleted(order) || !order.workerDone) return 0;
  return Math.max(0, getOrderClientTotalAmount(order) - getOrderClientPaidAmount(order));
}

function getClientDebtTotal(client) {
  return (client?.orders || []).reduce((sum, order) => sum + getOrderDebtLeft(order), 0);
}

function openClientDetail(key) {
  currentClientDetailKey = key;
  const decoded = decodeURIComponent(key);
  const clients = getClients();
  const c = clients.find(x => (x.phone || x.name) === decoded);
  if (!c) return;

  const totalSpent = c.orders.filter(isOrderFinanciallyActive).reduce((s, o) => s + getOrderClientTotalAmount(o), 0);
  const totalDebt = getClientDebtTotal(c);
  const debtOrders = c.orders.filter(o => getOrderDebtLeft(o) > 0);
  const clientTotalsHtml = `
    <div style="text-align:right;">
      ${canViewFinance()
        ? `
          <div style="font-size:12px;color:var(--text3);margin-bottom:2px;">Всего потрачено</div>
          <div style="font-size:24px;font-weight:800;color:var(--accent);">${totalSpent.toLocaleString('ru')} ₴</div>
        `
        : ''}
      <div style="font-size:12px;color:${totalDebt > 0 ? 'var(--red)' : 'var(--text3)'};font-weight:800;margin-top:4px;">Долг: ${totalDebt.toLocaleString('ru')} ₴</div>
    </div>
      `;

  const el = document.getElementById('client-detail-content');
  el.innerHTML = `
    <div class="detail-header">
      <div class="detail-header-top">
        <div>
            <div class="detail-title">${c.name}</div>
            <div class="detail-subtitle">${c.phone || '—'}${c.address ? ' · ' + c.address : ''}</div>
          </div>
        <div style="display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;">
          ${currentRole === 'owner' || currentRole === 'manager' ? `<button class="btn-secondary" onclick="event.stopPropagation(); openClientNameEditModal('${escapeAttr(encodeURIComponent(c.phone || c.name))}')">${icon('pencil')} Клиент</button>` : ''}
          ${canPrintClientStatement() ? `<button class="btn-secondary" onclick="event.stopPropagation(); openClientStatementModal('${escapeAttr(encodeURIComponent(c.phone || c.name))}')">${icon('printer')} Сверка</button>` : ''}
          ${debtOrders.length ? `<button class="btn-secondary" onclick="event.stopPropagation(); copyClientDebtSummary('${escapeAttr(encodeURIComponent(c.phone || c.name))}')">${icon('copy')} Скопировать</button>` : ''}
        ${clientTotalsHtml}
        </div>
      </div>
    </div>

    ${debtOrders.length ? `
      <div class="detail-section">
        <div class="detail-section-title">${icon('alert-triangle')} Заказы с долгом (${debtOrders.length})</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${debtOrders.map(o => renderClientOrderHistoryCard(o, true)).join('')}
        </div>
      </div>
    ` : ''}

    <div class="detail-section">
      <div class="detail-section-title">${icon('clipboard-list')} История заказов (${c.orders.length})</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${c.orders.map(o => renderClientOrderHistoryCard(o)).join('')}
      </div>
    </div>
  `;

  showScreen('client-detail');
}

function renderClientOrderHistoryCard(o, compact = false) {
  const total = getOrderClientTotalAmount(o);
  const paid = getOrderClientPaidAmount(o);
  const left = getOrderDebtLeft(o);
  return `
    <div class="order-card ${getOrderCardStateClass(o)}" onclick="openOrderDetail('${escapeAttr(o.id)}')">
      <div class="order-card-top">
        <div class="order-card-left">
          <div class="order-card-status-row">
            <span class="order-id">${o.id}</span>
            ${statusBadge(getEffectivePaymentStatus(o))}
            ${left > 0 ? `<span class="status-badge status-debt">Долг ${left.toLocaleString('ru')} ₴</span>` : ''}
          </div>
          <span class="order-name">${o.car || '—'}</span>
        </div>
        ${canPrintClientStatement() ? `
          <button class="btn-secondary" style="padding:7px 10px;min-height:0;" onclick="event.stopPropagation(); printClientOrderInvoice('${escapeAttr(o.id)}')">
            ${icon('printer')} Сверка
          </button>
        ` : ''}
      </div>
      <div class="order-card-meta">
        <span class="order-meta-item">${icon('calendar')} ${formatDate(o.date)}</span>
        <span class="order-meta-item">${icon('hard-hat')} ${getWorkerDisplayName(o.responsible) || '—'}</span>
        ${total > 0 ? `<span class="order-meta-item" style="font-weight:700;color:var(--accent);">${icon('coins')} ${paid.toLocaleString('ru')} / ${total.toLocaleString('ru')} ₴</span>` : ''}
        ${!compact && left > 0 ? `<span class="order-meta-item" style="font-weight:800;color:var(--red);">Осталось ${left.toLocaleString('ru')} ₴</span>` : ''}
      </div>
    </div>
  `;
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

async function loadManualClients() {
  try {
    manualClients = await sbFetchManualClients();
  } catch (e) {
    manualClients = [];
    showToast('Ошибка загрузки базы клиентов: ' + e.message, 'error');
  }
}

function openClientModal() {
  editingClientKey = null;
  editingClientOriginal = null;
  const title = document.getElementById('client-modal-title');
  if (title) title.textContent = 'Новый клиент';
  document.getElementById('c-name').value = '';
  document.getElementById('c-phone').value = '';
  document.getElementById('c-address').value = '';
  document.getElementById('c-alias').value = '';
  document.getElementById('c-requisites').value = '';
  ['c-phone', 'c-address'].forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;
    input.disabled = false;
    const group = input.closest('.form-group');
    if (group) group.style.display = '';
  });
  document.getElementById('client-modal').classList.add('active');
  setTimeout(() => document.getElementById('c-name').focus(), 100);
}

function closeClientModal() {
  document.getElementById('client-modal').classList.remove('active');
  editingClientKey = null;
  editingClientOriginal = null;
}

async function saveClient() {
  const name  = document.getElementById('c-name').value.trim();
  const phone = document.getElementById('c-phone').value.trim();
  const address = document.getElementById('c-address').value.trim();
  const alias = document.getElementById('c-alias')?.value.trim() || name;
  const requisites = document.getElementById('c-requisites')?.value.trim() || '';

  if (!name) {
    alert('Введите имя клиента');
    document.getElementById('c-name').focus();
    return;
  }

  if (editingClientOriginal) {
    return saveClientNameEdit(name);
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
    const created = await sbInsertManualClient({ name, phone, address, alias, requisites });
    manualClients.push(created || { name, phone, address, alias, requisites, orders: [] });
    closeClientModal();
    renderClients();
    showToast('Клиент добавлен ✓');
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Сохранить'; }
  }
}

function openClientNameEditModal(key) {
  if (currentRole !== 'owner' && currentRole !== 'manager') return;
  const decoded = decodeURIComponent(key || currentClientDetailKey || '');
  const client = getClients().find(item => (item.phone || item.name) === decoded);
  if (!client) return showToast('Клиент не найден', 'error');

  editingClientKey = key || encodeURIComponent(client.phone || client.name);
  editingClientOriginal = {
    id: client.id || '',
    name: client.name || '',
    phone: client.phone || '',
    address: client.address || '',
    alias: client.alias || client.name || '',
    requisites: client.requisites || '',
    key: client.phone || client.name || '',
    orderIds: (client.orders || []).map(order => order.id).filter(Boolean),
  };

  const title = document.getElementById('client-modal-title');
  if (title) title.textContent = 'Редактировать клиента';
  document.getElementById('c-name').value = client.name || '';
  document.getElementById('c-phone').value = client.phone || '';
  document.getElementById('c-address').value = client.address || '';
  document.getElementById('c-alias').value = client.alias || client.name || '';
  document.getElementById('c-requisites').value = client.requisites || '';
  ['c-phone', 'c-address'].forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;
    input.disabled = true;
    const group = input.closest('.form-group');
    if (group) group.style.display = 'none';
  });
  document.getElementById('client-modal').classList.add('active');
  setTimeout(() => document.getElementById('c-name').focus(), 100);
  initIcons();
}

async function saveClientNameEdit(name) {
  const original = editingClientOriginal;
  if (!original) return;
  const alias = document.getElementById('c-alias')?.value.trim() || name;
  const requisites = document.getElementById('c-requisites')?.value.trim() || '';
  const nameChanged = name !== original.name;
  const invoiceFieldsChanged = alias !== (original.alias || original.name || '') || requisites !== (original.requisites || '');
  if (!nameChanged && !invoiceFieldsChanged) {
    closeClientModal();
    return;
  }

  const nextKey = original.phone || name;
  if (nameChanged) {
    const duplicate = getClients().find(client => {
      const key = client.phone || client.name;
      return key === nextKey && key !== original.key;
    });
    if (duplicate) {
      showToast('Клиент с таким именем уже существует', 'error');
      return;
    }
  }

  const saveBtn = document.getElementById('client-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳'; }

  try {
    const orderIds = original.orderIds || [];
    if (nameChanged) {
      const savedOrders = await Promise.all(orderIds.map(id => sbPatchOrderFields(id, { client: name })));
      savedOrders.forEach(savedOrder => {
        if (!savedOrder?.id) return;
        const idx = orders.findIndex(order => order.id === savedOrder.id);
        if (idx !== -1) orders[idx] = savedOrder;
      });
    }

    const savedClient = await sbUpsertManualClient({
      id: original.id || null,
      name,
      phone: original.phone,
      address: original.address,
      alias,
      requisites,
    });
    const manualIdx = manualClients.findIndex(client =>
      (original.id && client.id === original.id) ||
      ((client.phone || client.name) === original.key)
    );
    if (manualIdx !== -1) {
      manualClients[manualIdx] = { ...manualClients[manualIdx], ...savedClient, name, alias, requisites };
    } else {
      manualClients.push(savedClient || { name, phone: original.phone, address: original.address, alias, requisites, orders: [] });
    }

    const newKey = encodeURIComponent(original.phone || name);
    closeClientModal();
    renderClients();
    openClientDetail(newKey);
    showToast('Имя клиента обновлено ✓');
  } catch (e) {
    showToast('Ошибка переименования: ' + e.message, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i data-lucide="save" style="width:14px;height:14px;"></i> Сохранить';
      initIcons();
    }
  }
}
