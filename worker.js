export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Session-Token',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);
    const sb  = env.SUPABASE_URL;
    const key = env.SUPABASE_KEY;
    const sbHeaders = {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Prefer': 'return=representation',
    };

    // ── /login ──────────────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/login') {
      const { password } = await request.json().catch(() => ({}));
      if (!password) return Response.json({ ok: false }, { status: 401, headers: cors });

      // Владелец — по-прежнему из env
      if (password === env.PASS_OWNER) {
        const token = await makeToken('owner', 'Maks', env.SESSION_SECRET);
        return Response.json({ ok: true, role: 'owner', workerName: 'Maks', token }, { headers: cors });
      }

      // Работники — ищем по pin_hash в таблице workers
      const pinHash = await sha256(password);
      const res = await fetch(
        `${sb}/rest/v1/workers?pin_hash=eq.${pinHash}&limit=1`,
        { headers: sbHeaders }
      );
      const rows = await res.json();

      if (!Array.isArray(rows) || !rows.length) {
        return Response.json({ ok: false }, { status: 401, headers: cors });
      }

      const worker = rows[0];
      // role в таблице хранится как 'senior' | 'junior'
      const role = worker.system_role || 'junior';
      const token = await makeToken(role, worker.name, env.SESSION_SECRET);
      return Response.json({ ok: true, role, workerName: worker.name, token }, { headers: cors });
    }

    // ── Все остальные запросы требуют валидный токен ─────────
    const token   = request.headers.get('X-Session-Token') || '';
    const session = await verifyToken(token, env.SESSION_SECRET);
    if (!session) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: cors });
    }
    const { role: authedRole } = session;

    // ── /api/workers/set-pin ─────────────────────────────────
    // Установка PIN сотруднику (только owner)
    if (url.pathname === '/api/workers/set-pin' && request.method === 'POST') {
      if (authedRole !== 'owner') {
        return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
      }
      const { workerId, pin } = await request.json().catch(() => ({}));
      if (!workerId || !pin) {
        return Response.json({ ok: false, error: 'workerId and pin required' }, { status: 400, headers: cors });
      }
      const pinHash = await sha256(String(pin));
      await fetch(`${sb}/rest/v1/workers?id=eq.${encodeURIComponent(workerId)}`, {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({ pin_hash: pinHash }),
      });
      return Response.json({ ok: true }, { headers: cors });
    }

    // ── /api/orders ──────────────────────────────────────────
    if (url.pathname === '/api/orders') {
      if (request.method === 'GET') {
        const res  = await fetch(`${sb}/rest/v1/orders?order=date.desc&limit=10000`, { headers: sbHeaders });
        const data = await res.json();
        return Response.json(data, { headers: cors });
      }
      if (request.method === 'POST') {
        const body = await request.json();
        const res  = await fetch(`${sb}/rest/v1/orders`, { method: 'POST', headers: sbHeaders, body: JSON.stringify(body) });
        const data = await res.json();
        return Response.json(data, { headers: cors });
      }
    }

    if (url.pathname.startsWith('/api/orders/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      if (request.method === 'PATCH') {
        const body = await request.json();
        const res  = await fetch(`${sb}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: sbHeaders, body: JSON.stringify(body) });
        const data = await res.json();
        return Response.json(data, { headers: cors });
      }
      if (request.method === 'DELETE') {
        if (authedRole !== 'owner') return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
        await fetch(`${sb}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: sbHeaders });
        return Response.json({ ok: true }, { headers: cors });
      }
    }

    // ── /api/orders/done ─────────────────────────────────────
    if (url.pathname === '/api/orders/done' && request.method === 'DELETE') {
      if (authedRole !== 'owner') return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
      await fetch(`${sb}/rest/v1/orders?status_done=eq.true`, { method: 'DELETE', headers: sbHeaders });
      return Response.json({ ok: true }, { headers: cors });
    }

    // ── /api/workers ─────────────────────────────────────────
    if (url.pathname === '/api/workers') {
      if (request.method === 'GET') {
        // Возвращаем без pin_hash — клиенту он не нужен
        const res  = await fetch(`${sb}/rest/v1/workers?order=created_at.asc&limit=10000&select=id,name,role,note,system_role`, { headers: sbHeaders });
        const data = await res.json();
        return Response.json(data, { headers: cors });
      }
      if (request.method === 'POST') {
        if (authedRole !== 'owner') return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
        const body = await request.json();
        const res  = await fetch(`${sb}/rest/v1/workers`, { method: 'POST', headers: sbHeaders, body: JSON.stringify(body) });
        const data = await res.json();
        return Response.json(data, { headers: cors });
      }
    }

    if (url.pathname.startsWith('/api/workers/') && !url.pathname.includes('set-pin') && request.method === 'DELETE') {
      if (authedRole !== 'owner') return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
      const id = url.pathname.split('/').pop();
      await fetch(`${sb}/rest/v1/workers?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: sbHeaders });
      return Response.json({ ok: true }, { headers: cors });
    }

    // ── /api/ref/:table ──────────────────────────────────────
    if (url.pathname.startsWith('/api/ref/')) {
      const table   = url.pathname.split('/').pop();
      const allowed = ['ref_cars','ref_warehouses','ref_equipment','ref_services',
                       'ref_payment_statuses','ref_partners','ref_supplier_statuses'];
      if (!allowed.includes(table)) return new Response('Not found', { status: 404, headers: cors });
      const res  = await fetch(`${sb}/rest/v1/${table}?order=created_at.asc&limit=10000`, { headers: sbHeaders });
      const data = await res.json();
      return Response.json(data, { headers: cors });
    }

    return new Response('Not found', { status: 404, headers: cors });
  }
};

// ── helpers ──────────────────────────────────────────────────
async function sha256(message) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function makeToken(role, workerName, secret) {
  // Токен: "role.hash" — только ASCII в заголовке
  // workerName хранится на клиенте в localStorage отдельно
  const hash = await sha256(role + '.' + secret);
  return role + '.' + hash;
}

async function verifyToken(token, secret) {
  if (!token) return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx === -1) return null;
  const role = token.slice(0, dotIdx);
  const hash = token.slice(dotIdx + 1);
  const validRoles = ['owner', 'senior', 'junior'];
  if (!validRoles.includes(role)) return null;
  const expected = await sha256(role + '.' + secret);
  if (hash !== expected) return null;
  return { role };
}
