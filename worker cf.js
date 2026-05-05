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

      if (password === env.PASS_OWNER) {
        const token = await makeToken('owner', 'Maksim', env.SESSION_SECRET);
        return Response.json({ ok: true, role: 'owner', workerName: 'Максим', token }, { headers: cors });
      }

      if (password === env.PASS_OWNER2) {
        const token = await makeToken('owner', 'Vasiliy', env.SESSION_SECRET);
        return Response.json({ ok: true, role: 'owner', workerName: 'Василий', token }, { headers: cors });
      }

      const pinHash = await sha256(password);
      const res = await fetch(`${sb}/rest/v1/workers?pin_hash=eq.${pinHash}&limit=1`, { headers: sbHeaders });
      const rows = await res.json();

      if (!Array.isArray(rows) || !rows.length) {
        return Response.json({ ok: false }, { status: 401, headers: cors });
      }

      const worker = rows[0];
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
    if (session.role !== 'owner') {
      const liveWorker = await getWorkerByName(session.workerName, sb, sbHeaders).catch(() => null);
      if (liveWorker?.system_role) {
        session.role = liveWorker.system_role;
      }
    }
    const { role: authedRole } = session;

    // ── /api/workers/set-pin ─────────────────────────────────
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

    if (url.pathname === '/api/admin/test-telegram' && request.method === 'POST') {
      if (authedRole !== 'owner') {
        return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
      }
      const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
      const chatId = String(env.TELEGRAM_CHAT_ID || '').trim();
      if (!token || !chatId) {
        return Response.json({ ok: false, error: 'Telegram env missing' }, { status: 400, headers: cors });
      }
      const body = await request.json().catch(() => ({}));
      const text = String(body?.text || 'Тестовое сообщение из SwiftGlass').trim();
      const sent = await sendTelegramText(env, text);
      if (!sent?.ok) {
        return Response.json({
          ok: false,
          error: 'Telegram send failed',
          telegram_status: sent?.status || null,
          telegram_response: sent?.bodyText || sent?.error || '',
        }, { status: 500, headers: cors });
      }
      return Response.json({ ok: true }, { headers: cors });
    }

    // ── /api/orders ──────────────────────────────────────────
    if (url.pathname === '/api/orders') {
      if (request.method === 'GET') {
        const data = await fetchOrdersForSession(session, sb, sbHeaders);
        return Response.json(data, { headers: cors });
      }

      if (request.method === 'POST') {
        if (authedRole !== 'owner' && authedRole !== 'manager') {
          return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
        }

        const body = await request.json().catch(() => ({}));
        const data = await insertNewOrderWithMonotonicId(body, sb, sbHeaders);
        if (Array.isArray(data) && data[0]) {
          await syncOrderFopCashEntries(data[0], sb, sbHeaders);
          await syncOrderSashaManagerCashEntries(data[0], sb, sbHeaders);
          await maybeNotifyPlannerOrder(null, data[0], sb, sbHeaders, env);
        }
        return Response.json(data, { headers: cors });
      }
    }

    if (url.pathname === '/api/orders/save-with-cash' && request.method === 'POST') {
      if (authedRole === 'junior') {
        return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
      }

      const body = await request.json().catch(() => ({}));
      const isNew = body.is_new === true;
      const orderBody = body.order || {};
      const rollbackOrder = body.rollback_order || null;
      const cashEntries = Array.isArray(body.cash_entries) ? body.cash_entries : [];

      if (isNew && authedRole !== 'owner' && authedRole !== 'manager') {
        return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
      }
      if (!isNew && !orderBody.id) {
        return Response.json({ ok: false, error: 'Order id required' }, { status: 400, headers: cors });
      }

      let patchBody = orderBody;
      const previousOrder = isNew ? null : await getOrderById(orderBody.id, sb, sbHeaders);
      if (!isNew && !previousOrder) {
        return Response.json({ ok: false, error: 'Order not found' }, { status: 404, headers: cors });
      }

      if (!isNew && (authedRole === 'senior' || authedRole === 'extra')) {
        const currentWorker = await getWorkerByName(session.workerName, sb, sbHeaders);
        if (!(await isOwnOrderForSession(previousOrder, session, sb, sbHeaders)) && !canPatchSpecialServiceOnly(orderBody, previousOrder, session, currentWorker)) {
          return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
        }
          try {
            patchBody = buildSpecialistOrderPatch(orderBody, previousOrder, session, currentWorker);
          } catch (e) {
            return Response.json({ error: e.message || 'Invalid order patch' }, { status: 400, headers: cors });
          }
        if (!Object.keys(patchBody).length) {
          return Response.json({ ok: false, error: 'No allowed fields' }, { status: 400, headers: cors });
        }
      }

      const savedCashEntries = [];
      let savedOrder = null;

      try {
        const orderRes = isNew
          ? { ok: true, status: 200, json: async () => await insertNewOrderWithMonotonicId(orderBody, sb, sbHeaders) }
          : await fetch(`${sb}/rest/v1/orders?id=eq.${encodeURIComponent(orderBody.id)}`, {
              method: 'PATCH',
              headers: sbHeaders,
              body: JSON.stringify(patchBody),
            });

        if (!orderRes.ok) {
          return Response.json(await orderRes.text(), { status: orderRes.status, headers: cors });
        }

        const orderRows = await orderRes.json();
        savedOrder = Array.isArray(orderRows) ? orderRows[0] : null;
        if (!savedOrder) {
          throw new Error('Order was not saved');
        }

        for (const rawEntry of cashEntries) {
          const cashEntry = normalizeOrderSaveCashEntry(rawEntry);
          if (!cashEntry) continue;
          if (!(await canCreateOrderCashEntry(cashEntry, rawEntry, session, sb, sbHeaders))) {
            throw new Error('Forbidden cash entry');
          }

          const cashRes = await fetch(`${sb}/rest/v1/cash_log`, {
            method: 'POST',
            headers: sbHeaders,
            body: JSON.stringify(cashEntry),
          });
          if (!cashRes.ok) {
            throw new Error(await cashRes.text());
          }
          const cashRows = await cashRes.json();
          if (Array.isArray(cashRows) && cashRows[0]) savedCashEntries.push(cashRows[0]);
        }

        await syncOrderFopCashEntries(savedOrder, sb, sbHeaders);
        const sashaCashEntries = await syncOrderSashaManagerCashEntries(savedOrder, sb, sbHeaders);
        savedCashEntries.push(...sashaCashEntries);
        await maybeNotifyPlannerOrder(previousOrder, savedOrder, sb, sbHeaders, env);
        return Response.json({ order: savedOrder, cash_entries: savedCashEntries }, { headers: cors });
      } catch (e) {
        await rollbackOrderSaveWithCash({
          sb,
          sbHeaders,
          orderId: savedOrder?.id || orderBody.id,
          isNew,
          rollbackOrder,
          savedCashEntries,
        });
        return Response.json({ ok: false, error: e.message || String(e) }, { status: 500, headers: cors });
      }
    }

    if (url.pathname.startsWith('/api/orders/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop());

      if (request.method === 'PATCH') {
        try {
          if (authedRole === 'junior') {
            return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
          }

          const body = await request.json();
          let patchBody = body;
          const previousOrder = await getOrderById(id, sb, sbHeaders);
          if (!previousOrder) {
            return Response.json({ ok: false, error: 'Order not found' }, { status: 404, headers: cors });
          }

          if (authedRole === 'senior' || authedRole === 'extra') {
            const currentWorker = await getWorkerByName(session.workerName, sb, sbHeaders);
            if (!(await isOwnOrderForSession(previousOrder, session, sb, sbHeaders)) && !canPatchSpecialServiceOnly(body, previousOrder, session, currentWorker)) {
              return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
            }

            try {
              patchBody = buildSpecialistOrderPatch(body, previousOrder, session, currentWorker);
            } catch (e) {
              return Response.json({ error: e.message || 'Invalid order patch' }, { status: 400, headers: cors });
            }
            if (!Object.keys(patchBody).length) {
              return Response.json({ ok: false, error: 'No allowed fields' }, { status: 400, headers: cors });
            }
          }

          const res  = await fetch(`${sb}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: sbHeaders,
            body: JSON.stringify(patchBody),
          });
          const data = await res.json().catch(() => []);
          if (!res.ok) {
            return Response.json(
              { ok: false, error: Array.isArray(data) ? 'Order patch failed' : (data?.message || data?.error || 'Order patch failed') },
              { status: res.status || 400, headers: cors }
            );
          }
          if (Array.isArray(data) && data[0]) {
            await syncOrderFopCashEntries(data[0], sb, sbHeaders);
            await syncOrderSashaManagerCashEntries(data[0], sb, sbHeaders);
            await maybeNotifyPlannerOrder(previousOrder, data[0], sb, sbHeaders, env);
          }
          return Response.json(data, { headers: cors });
        } catch (e) {
          return Response.json({ ok: false, error: e?.message || String(e) || 'Order patch failed' }, { status: 500, headers: cors });
        }
      }

      if (request.method === 'DELETE') {
        if (authedRole !== 'owner' && authedRole !== 'manager') {
          return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
        }

        await fetch(`${sb}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: sbHeaders,
        });
        return Response.json({ ok: true }, { headers: cors });
      }
    }

    // ── /api/orders/done ─────────────────────────────────────
    if (url.pathname === '/api/orders/done' && request.method === 'DELETE') {
      if (authedRole !== 'owner') {
        return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
      }

      await fetch(`${sb}/rest/v1/orders?status_done=eq.true`, { method: 'DELETE', headers: sbHeaders });
      return Response.json({ ok: true }, { headers: cors });
    }

    // ── /api/clients ─────────────────────────────────────────
    if (url.pathname === '/api/clients') {
      if (request.method === 'GET') {
        if (authedRole !== 'owner' && authedRole !== 'manager') {
          return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
        }

        const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
        const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 1000));

        const res = await fetch(
          `${sb}/rest/v1/clients?order=created_at.desc&offset=${offset}&limit=${limit}`,
          { headers: sbHeaders }
        );
        const data = await res.json();
        return Response.json(data, { headers: cors });
      }

      if (request.method === 'POST') {
        if (authedRole !== 'owner' && authedRole !== 'manager') {
          return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
        }

        const body = await request.json().catch(() => ({}));
        if (!body.name) {
          return Response.json({ error: 'name required' }, { status: 400, headers: cors });
        }

        const res = await fetch(`${sb}/rest/v1/clients`, {
          method: 'POST',
          headers: sbHeaders,
          body: JSON.stringify({ name: body.name, phone: body.phone || null, address: body.address || null }),
        });
        const data = await res.json();
        return Response.json(data, { headers: cors });
      }

      if (request.method === 'PATCH') {
        if (authedRole !== 'owner' && authedRole !== 'manager') {
          return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
        }

        const body = await request.json().catch(() => ({}));
        if (!body.name && !body.phone) {
          return Response.json({ error: 'name or phone required' }, { status: 400, headers: cors });
        }

        const keyFilter = body.phone
          ? `phone=eq.${encodeURIComponent(body.phone)}`
          : `name=eq.${encodeURIComponent(body.name)}`;
        const existingRes = await fetch(`${sb}/rest/v1/clients?${keyFilter}&limit=1`, { headers: sbHeaders });
        const existingRows = await existingRes.json().catch(() => []);
        const payload = { name: body.name || '', phone: body.phone || null, address: body.address || null };

        if (Array.isArray(existingRows) && existingRows.length) {
          const id = existingRows[0].id;
          const res = await fetch(
            `${sb}/rest/v1/clients?id=eq.${encodeURIComponent(id)}`,
            { method: 'PATCH', headers: sbHeaders, body: JSON.stringify(payload) }
          );
          const data = await res.json();
          return Response.json(data, { headers: cors });
        }

        const res = await fetch(`${sb}/rest/v1/clients`, {
          method: 'POST',
          headers: sbHeaders,
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        return Response.json(data, { headers: cors });
      }
    }

    // ── /api/workers ─────────────────────────────────────────
    if (url.pathname === '/api/workers') {
      if (request.method === 'GET') {
        const select = 'id,name,alias,role,note,telegram_nick,system_role,salary_formula,assistant';
        const res = await fetch(
          `${sb}/rest/v1/workers?order=created_at.asc&limit=10000&select=${select}`,
          { headers: sbHeaders }
        );
        const data = await res.json();
        return Response.json(data, { headers: cors });
      }

      if (request.method === 'POST') {
        if (authedRole !== 'owner') {
          return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
        }

        const body = await request.json();
        const res  = await fetch(`${sb}/rest/v1/workers`, {
          method: 'POST',
          headers: sbHeaders,
          body: JSON.stringify(body),
        });
        const data = await res.json();
        return Response.json(data, { headers: cors });
      }
    }

    if (url.pathname.startsWith('/api/workers/') && !url.pathname.includes('set-pin')) {
      const id = url.pathname.split('/').pop();

      if (request.method === 'PATCH') {
        if (authedRole !== 'owner') {
          return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
        }

        const body = await request.json();
        const res  = await fetch(`${sb}/rest/v1/workers?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: sbHeaders,
          body: JSON.stringify(body),
        });
        const data = await res.json();
        return Response.json(data, { headers: cors });
      }

      if (request.method === 'DELETE') {
        if (authedRole !== 'owner') {
          return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
        }

        await fetch(`${sb}/rest/v1/workers?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: sbHeaders });
        return Response.json({ ok: true }, { headers: cors });
      }
    }

    // ── /api/salaries ────────────────────────────────────────
    if (url.pathname.startsWith('/api/salaries')) {
      if (url.pathname === '/api/salaries/all' && request.method === 'GET') {
        if (authedRole !== 'owner') {
          return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
        }

        const res  = await fetch(`${sb}/rest/v1/worker_salaries?order=date.desc&limit=10000`, { headers: sbHeaders });
        const data = await res.json();
        return Response.json(data, { headers: cors });
      }

      if (url.pathname.startsWith('/api/salaries/by-order/') && request.method === 'GET') {
        const orderId = decodeURIComponent(url.pathname.replace('/api/salaries/by-order/', ''));
        const res = await fetch(
          `${sb}/rest/v1/worker_salaries?order_id=eq.${encodeURIComponent(orderId)}&limit=100`,
          { headers: sbHeaders }
        );
        const data = await res.json();
        return Response.json(data, { headers: cors });
      }

      if (url.pathname === '/api/salaries' && request.method === 'GET') {
        const workerName = url.searchParams.get('worker');
        if (!workerName) {
          return Response.json({ error: 'worker required' }, { status: 400, headers: cors });
        }

        const allowed = await canAccessWorker(workerName, session, sb, sbHeaders);
        if (!allowed) {
          return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
        }

        const res = await fetch(
          `${sb}/rest/v1/worker_salaries?worker_name=eq.${encodeURIComponent(workerName)}&order=date.desc&limit=1000`,
          { headers: sbHeaders }
        );
        const data = await res.json();
        return Response.json(data, { headers: cors });
      }

      if (url.pathname === '/api/salaries' && request.method === 'POST') {
        if (authedRole === 'manager') {
          const body = await request.json();
          const isOwnAttendance = body.worker_name === session.workerName && body.order_id === 'Выход в работу';
          const isOwnWithdrawal = body.worker_name === session.workerName && String(body.order_id || '').startsWith('Выплата');
          if (!isOwnAttendance && !isOwnWithdrawal) {
            return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
          }
          const res = await fetch(`${sb}/rest/v1/worker_salaries`, {
            method: 'POST',
            headers: sbHeaders,
            body: JSON.stringify(body),
          });
          const data = await res.json();
          return Response.json(data, { headers: cors });
        }

        const body = await request.json();

        if (body.entry_type === 'manual') {
          if (authedRole !== 'owner') {
            return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
          }
          if (!body.worker_name || !body.order_id || !body.comment || Number(body.amount) === 0) {
            return Response.json({ error: 'Invalid manual salary entry' }, { status: 400, headers: cors });
          }
          body.created_by = session.workerName || 'owner';
        } else if (body.entry_type && body.entry_type !== 'auto') {
          if (authedRole !== 'owner') delete body.entry_type;
        }

        if (authedRole === 'junior' && body.worker_name !== session.workerName) {
          return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
        }

        if (authedRole === 'senior' || authedRole === 'extra') {
          const allowed = await canAccessWorker(body.worker_name, session, sb, sbHeaders)
            || await canManageSalaryEntryForOrder(body.order_id, session, sb, sbHeaders);
          if (!allowed) {
            return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
          }
        }

        if (!isManualSalaryRow(body) && isLockedOrderSalaryId(body.order_id)) {
          const existingSalary = await getSalaryByWorkerOrder(body.worker_name, body.order_id, sb, sbHeaders);
          if (existingSalary) {
            return Response.json([existingSalary], { headers: cors });
          }
        }

        const res = await fetch(`${sb}/rest/v1/worker_salaries`, {
          method: 'POST',
          headers: sbHeaders,
          body: JSON.stringify(body),
        });
        const data = await res.json();
        return Response.json(data, { headers: cors });
      }

      if (
        url.pathname.startsWith('/api/salaries/') &&
        url.pathname !== '/api/salaries/all' &&
        !url.pathname.startsWith('/api/salaries/by-order/') &&
        request.method === 'PATCH'
      ) {
        if (authedRole === 'manager') {
          const id = url.pathname.split('/').pop();
          const salaryRow = await getSalaryById(id, sb, sbHeaders);
          const isOwnAttendance = salaryRow && salaryRow.worker_name === session.workerName && salaryRow.order_id === 'Выход в работу';
          if (!isOwnAttendance) {
            return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
          }
        }

        const id = url.pathname.split('/').pop();
        const body = await request.json();
        const salaryRowForLock = await getSalaryById(id, sb, sbHeaders);
        if (!salaryRowForLock) {
          return Response.json({ error: 'Salary not found' }, { status: 404, headers: cors });
        }
        const isLockedAutoSalary = !isManualSalaryRow(salaryRowForLock) && isLockedOrderSalaryId(salaryRowForLock.order_id);
        if (isLockedAutoSalary && authedRole !== 'owner') {
          return Response.json([salaryRowForLock], { headers: cors });
        }

        if (isManualSalaryRow(salaryRowForLock) && authedRole !== 'owner') {
          return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
        }

        if (isManualSalaryRow(salaryRowForLock) || isLockedAutoSalary) {
          if (authedRole !== 'owner') {
            return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
          }
          if (await isSalaryEntryWithdrawn(salaryRowForLock, sb, sbHeaders)) {
            return Response.json({ error: 'Salary already withdrawn' }, { status: 400, headers: cors });
          }
          if (body.comment !== undefined && !String(body.comment || '').trim()) {
            return Response.json({ error: 'Comment required' }, { status: 400, headers: cors });
          }
          if (body.amount !== undefined && Number(body.amount) === 0) {
            return Response.json({ error: 'Invalid manual salary entry' }, { status: 400, headers: cors });
          }
          const oldHistory = Array.isArray(salaryRowForLock.edit_history) ? salaryRowForLock.edit_history : [];
          body.edit_history = [
            ...oldHistory,
            {
              at: new Date().toISOString(),
              by: session.workerName || 'owner',
              amount_before: Number(salaryRowForLock.amount) || 0,
              amount_after: body.amount !== undefined ? Number(body.amount) || 0 : Number(salaryRowForLock.amount) || 0,
              comment_before: salaryRowForLock.comment || '',
              comment_after: body.comment !== undefined ? String(body.comment || '').trim() : salaryRowForLock.comment || '',
            },
          ];
          if (isManualSalaryRow(salaryRowForLock)) {
            body.entry_type = 'manual';
            body.created_by = salaryRowForLock.created_by || session.workerName || 'owner';
          }
        }

        if (authedRole !== 'owner') {
          const allowed = await canAccessWorker(salaryRowForLock.worker_name, session, sb, sbHeaders)
            || await canManageSalaryEntryForOrder(salaryRowForLock.order_id, session, sb, sbHeaders);
          if (!allowed) {
            return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
          }
        }

        const res = await fetch(
          `${sb}/rest/v1/worker_salaries?id=eq.${encodeURIComponent(id)}`,
          { method: 'PATCH', headers: sbHeaders, body: JSON.stringify(body) }
        );
        const data = await res.json();
        return Response.json(data, { headers: cors });
      }

      if (
        url.pathname.startsWith('/api/salaries/') &&
        url.pathname !== '/api/salaries/all' &&
        !url.pathname.startsWith('/api/salaries/by-order/') &&
        request.method === 'DELETE'
      ) {
        if (authedRole === 'manager') {
          const id = url.pathname.split('/').pop();
          const salaryRow = await getSalaryById(id, sb, sbHeaders);
          const isOwnAttendance = salaryRow && salaryRow.worker_name === session.workerName && salaryRow.order_id === 'Выход в работу';
          if (!isOwnAttendance) {
            return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
          }
          await fetch(`${sb}/rest/v1/worker_salaries?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: sbHeaders });
          return Response.json({ ok: true }, { headers: cors });
        }

        if (authedRole === 'junior') {
          const id = url.pathname.split('/').pop();
          const salaryRow = await getSalaryById(id, sb, sbHeaders);
          const isOwnAttendance = salaryRow && salaryRow.worker_name === session.workerName && salaryRow.order_id === 'Выход в работу';
          if (!isOwnAttendance) {
            return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
          }
          await fetch(`${sb}/rest/v1/worker_salaries?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: sbHeaders });
          return Response.json({ ok: true }, { headers: cors });
        }

        if (authedRole !== 'owner' && authedRole !== 'senior' && authedRole !== 'extra') {
          return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
        }

        const id = url.pathname.split('/').pop();
        const salaryRow = await getSalaryById(id, sb, sbHeaders);
        if (!salaryRow) {
          return Response.json({ error: 'Salary not found' }, { status: 404, headers: cors });
        }
        if (isSalaryWithdrawalRow(salaryRow) || await isSalaryEntryWithdrawn(salaryRow, sb, sbHeaders)) {
          return Response.json({ error: 'Salary already withdrawn' }, { status: 400, headers: cors });
        }

        if (authedRole === 'senior' || authedRole === 'extra') {
          const allowed = await canAccessWorker(salaryRow.worker_name, session, sb, sbHeaders)
            || await canManageSalaryEntryForOrder(salaryRow.order_id, session, sb, sbHeaders);
          if (!allowed) {
            return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
          }
        }

        await fetch(`${sb}/rest/v1/worker_salaries?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: sbHeaders });
        return Response.json({ ok: true }, { headers: cors });
      }
    }

    // ── /api/problems ────────────────────────────────────────
    if (url.pathname.startsWith('/api/problems')) {
      if (url.pathname === '/api/problems/all' && request.method === 'GET') {
        if (authedRole !== 'owner') {
          return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
        }

        const res  = await fetch(`${sb}/rest/v1/worker_problems?order=date.desc&limit=10000`, { headers: sbHeaders });
        const data = await res.json();
        return Response.json(data, { headers: cors });
      }

      if (url.pathname === '/api/problems' && request.method === 'GET') {
        const workerName = url.searchParams.get('worker');
        if (!workerName) {
          return Response.json({ error: 'worker required' }, { status: 400, headers: cors });
        }

        const allowed = await canAccessWorker(workerName, session, sb, sbHeaders);
        if (!allowed) {
          return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
        }

        const res = await fetch(
          `${sb}/rest/v1/worker_problems?or=(worker_name.eq.${encodeURIComponent(workerName)},partner.eq.${encodeURIComponent(workerName)})&order=date.desc&limit=1000`,
          { headers: sbHeaders }
        );
        const data = await res.json();
        return Response.json(data, { headers: cors });
      }

      if (url.pathname === '/api/problems' && request.method === 'POST') {
        if (authedRole !== 'owner') {
          return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
        }

        const body = await request.json();
        const res = await fetch(`${sb}/rest/v1/worker_problems`, {
          method: 'POST',
          headers: sbHeaders,
          body: JSON.stringify(body),
        });
        const data = await res.json();
        return Response.json(data, { headers: cors });
      }

      if (url.pathname.startsWith('/api/problems/') && url.pathname !== '/api/problems/all' && request.method === 'DELETE') {
        if (authedRole !== 'owner') {
          return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
        }

        const id = url.pathname.split('/').pop();
        await fetch(`${sb}/rest/v1/worker_problems?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: sbHeaders });
        return Response.json({ ok: true }, { headers: cors });
      }
    }

    // ── /api/cash ────────────────────────────────────────────
    if (url.pathname === '/api/cash' && request.method === 'GET') {
      const workerName = url.searchParams.get('worker');
      const deletedMode = url.searchParams.get('deleted') || 'active';
      if (!workerName) {
        return Response.json({ error: 'worker required' }, { status: 400, headers: cors });
      }

      const allowed = await canAccessWorker(workerName, session, sb, sbHeaders);
      if (!allowed) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }
      const targetWorker = await findWorkerByIdentity(workerName, sb, sbHeaders);
      const workerLabels = [workerName, targetWorker?.name, targetWorker?.alias]
        .map(value => String(value || '').trim())
        .filter(Boolean);
      const uniqueLabels = [...new Set(workerLabels)];
      const orParts = [];
      uniqueLabels.forEach(label => {
        const encoded = encodeURIComponent(label);
        orParts.push(`worker_name.eq.${encoded}`);
        orParts.push(`cash_owner.eq.${encoded}`);
      });

      const deletedQuery = deletedMode === 'only'
        ? '&deleted_at=not.is.null'
        : deletedMode === 'all'
          ? ''
          : '&deleted_at=is.null';
      const res = await fetch(
        `${sb}/rest/v1/cash_log?or=(${orParts.join(',')})${deletedQuery}&order=created_at.desc&limit=1000`,
        { headers: sbHeaders }
      );
      const data = await res.json();
      return Response.json(data, { headers: cors });
    }

    if (url.pathname === '/api/cash/all' && request.method === 'GET') {
      const deletedMode = url.searchParams.get('deleted') || 'active';
      if (authedRole !== 'owner') {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }

      const deletedQuery = deletedMode === 'only'
        ? 'deleted_at=not.is.null&'
        : deletedMode === 'all'
          ? ''
          : 'deleted_at=is.null&';
      const res = await fetch(`${sb}/rest/v1/cash_log?${deletedQuery}order=created_at.desc&limit=10000`, { headers: sbHeaders });
      const data = await res.json();
      return Response.json(data, { headers: cors });
    }

    if (url.pathname === '/api/cash' && request.method === 'POST') {
      if (!canUseCashApi(session)) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }

      const body = await request.json();
      if (!String(body.comment || '').trim()) {
        return Response.json({ error: 'Comment required' }, { status: 400, headers: cors });
      }
      const cashAccount = String(body.cash_account || 'cash').trim().toLowerCase();
      if (!['cash', 'fop'].includes(cashAccount)) {
        return Response.json({ error: 'Invalid cash account' }, { status: 400, headers: cors });
      }
      body.cash_account = cashAccount;
      if (cashAccount === 'fop' && body.worker_name !== 'Oleg Starshiy') {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }
      if (body.manual_payment === true && authedRole !== 'owner') {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }
      if (cashAccount === 'fop' || isConfirmableCardCashMethod(getPaymentMethodFromCashSourceKey(body.fop_source_key))) {
        body.fop_confirmed = !!body.fop_confirmed;
        body.fop_date = body.fop_date ? String(body.fop_date).slice(0, 10) : null;
      } else {
        body.fop_confirmed = false;
        body.fop_source_key = null;
        body.fop_date = null;
      }
      if (cashAccount === 'fop') {
        body.fop_confirmed = true;
      }
      if (body.manual_payment === true) {
        body.worker_name = 'OWNER_PAYMENTS';
        body.manual_payment_method = String(body.manual_payment_method || '').trim();
        if (!body.manual_payment_method) {
          return Response.json({ error: 'Payment method required' }, { status: 400, headers: cors });
        }
      } else {
        body.manual_payment = false;
        body.manual_payment_method = null;
      }

      const canCreateCash = await canCreateCashEntryForWorker(body, session, sb, sbHeaders);
      if (!canCreateCash) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }

      Object.assign(body, buildStructuredCashFields(body));
      const cashPayload = {
        worker_name: String(body.worker_name || '').trim(),
        amount: Number(body.amount) || 0,
        comment: String(body.comment || '').trim(),
        cash_account: String(body.cash_account || 'cash').trim().toLowerCase(),
        fop_confirmed: !!body.fop_confirmed,
        fop_source_key: body.fop_source_key ? String(body.fop_source_key) : null,
        fop_date: body.fop_date ? String(body.fop_date).slice(0, 10) : null,
        manual_payment: body.manual_payment === true,
        manual_payment_method: body.manual_payment_method ? String(body.manual_payment_method).trim() : null,
        cash_owner: body.cash_owner ? String(body.cash_owner).trim() : null,
        account_type: body.account_type ? String(body.account_type).trim().toLowerCase() : null,
        payment_type: body.payment_type ? String(body.payment_type).trim() : null,
        payment_method: body.payment_method ? String(body.payment_method).trim() : null,
        approval_status: body.approval_status ? String(body.approval_status).trim() : null,
        approval_by: body.approval_by ? String(body.approval_by).trim() : null,
        source_type: body.source_type ? String(body.source_type).trim() : null,
        source_id: body.source_id ? String(body.source_id).trim() : null,
        order_id: body.order_id ? String(body.order_id).trim() : null,
        expense_category: body.expense_category ? String(body.expense_category).trim() : null,
        warehouse_name: body.warehouse_name ? String(body.warehouse_name).trim() : null,
      };

      const res = await fetch(`${sb}/rest/v1/cash_log`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify(cashPayload),
      });
      const data = await res.json();
      return Response.json(data, { status: res.status, headers: cors });
    }

    if (url.pathname.startsWith('/api/cash/') && url.pathname !== '/api/cash/all' && request.method === 'PATCH') {
      const id = url.pathname.split('/').pop();
      const cashRow = await getCashById(id, sb, sbHeaders);
      if (!cashRow) {
        return Response.json({ error: 'Cash entry not found' }, { status: 404, headers: cors });
      }

      const cashOwnerLabel = String(cashRow.cash_owner || cashRow.worker_name || '').trim();
      const [sessionWorker, targetWorker] = await Promise.all([
        findWorkerByIdentity(session.workerName, sb, sbHeaders),
        findWorkerByIdentity(cashOwnerLabel, sb, sbHeaders),
      ]);
      const isOwnCashEntry = cashOwnerLabel === session.workerName
        || (sessionWorker && targetWorker && normalizeWorkerIdentityText(sessionWorker.name) === normalizeWorkerIdentityText(targetWorker.name));
      const canPatchOwnConfirmableCash = (authedRole === 'senior' || authedRole === 'extra' || authedRole === 'manager')
        && isOwnCashEntry
        && (
          String(cashRow.cash_account || '').toLowerCase() === 'fop'
          || isConfirmableCardCashRow(cashRow)
        );
      if (authedRole !== 'owner' && !canPatchOwnConfirmableCash) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }

      const body = await request.json().catch(() => ({}));
      const patch = {};
      if (authedRole === 'owner') {
        if (Object.prototype.hasOwnProperty.call(body, 'worker_name')) {
          patch.worker_name = String(body.worker_name || '').trim();
        }
        if (Object.prototype.hasOwnProperty.call(body, 'amount')) {
          patch.amount = Number(body.amount) || 0;
        }
        if (Object.prototype.hasOwnProperty.call(body, 'comment')) {
          patch.comment = String(body.comment || '').trim();
        }
        if (Object.prototype.hasOwnProperty.call(body, 'cash_account')) {
          const cashAccount = String(body.cash_account || 'cash').trim().toLowerCase();
          if (!['cash', 'fop'].includes(cashAccount)) {
            return Response.json({ error: 'Invalid cash account' }, { status: 400, headers: cors });
          }
          patch.cash_account = cashAccount;
        }
        if (Object.prototype.hasOwnProperty.call(body, 'deleted_at')) {
          patch.deleted_at = body.deleted_at ? String(body.deleted_at) : null;
        }
        if (Object.prototype.hasOwnProperty.call(body, 'deleted_by')) {
          patch.deleted_by = body.deleted_by ? String(body.deleted_by) : null;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'worker_name') && !patch.worker_name) {
          return Response.json({ error: 'worker required' }, { status: 400, headers: cors });
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'comment') && !patch.comment) {
          return Response.json({ error: 'Comment required' }, { status: 400, headers: cors });
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'amount') && !patch.amount) {
          return Response.json({ error: 'Amount required' }, { status: 400, headers: cors });
        }
      }
      if (Object.prototype.hasOwnProperty.call(body, 'fop_confirmed')) {
        patch.fop_confirmed = !!body.fop_confirmed;
      }
      if (authedRole === 'owner') {
        const nextCashRow = { ...cashRow, ...patch };
        Object.assign(patch, buildStructuredCashFields(nextCashRow));
      }
      if (!Object.keys(patch).length) {
        return Response.json({ error: 'No allowed fields' }, { status: 400, headers: cors });
      }

      const res = await fetch(`${sb}/rest/v1/cash_log?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      return Response.json(data, { headers: cors });
    }

    if (url.pathname.startsWith('/api/cash/') && url.pathname !== '/api/cash/all' && request.method === 'DELETE') {
      if (authedRole !== 'owner') {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }

      const id = url.pathname.split('/').pop();
      await fetch(`${sb}/rest/v1/cash_log?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: sbHeaders });
      return Response.json({ ok: true }, { headers: cors });
    }

    if (url.pathname === '/api/cash/delete-by-source-keys' && request.method === 'POST') {
      if (!['owner', 'manager', 'senior', 'extra'].includes(authedRole)) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }

      const body = await request.json().catch(() => ({}));
      const sourceKeys = Array.isArray(body?.source_keys)
        ? body.source_keys.map(key => String(key || '').trim()).filter(Boolean)
        : [];
      if (!sourceKeys.length) {
        return Response.json({ ok: true, deleted: 0 }, { headers: cors });
      }

      const deletedIds = [];
      const sessionWorker = await findWorkerByIdentity(session.workerName, sb, sbHeaders);

      for (const sourceKey of sourceKeys) {
        const res = await fetch(`${sb}/rest/v1/cash_log?fop_source_key=eq.${encodeURIComponent(sourceKey)}&limit=100`, { headers: sbHeaders });
        const rows = await res.json().catch(() => []);
        for (const row of (Array.isArray(rows) ? rows : [])) {
          if (authedRole !== 'owner') {
            const cashOwnerLabel = String(row?.cash_owner || row?.worker_name || '').trim();
            const targetWorker = await findWorkerByIdentity(cashOwnerLabel, sb, sbHeaders);
            const isOwnCashEntry = cashOwnerLabel === session.workerName
              || (sessionWorker && targetWorker && normalizeWorkerIdentityText(sessionWorker.name) === normalizeWorkerIdentityText(targetWorker.name));
            if (!isOwnCashEntry) continue;
          }
          if (!row?.id) continue;
          await fetch(`${sb}/rest/v1/cash_log?id=eq.${encodeURIComponent(row.id)}`, { method: 'DELETE', headers: sbHeaders });
          deletedIds.push(String(row.id));
        }
      }

      return Response.json({ ok: true, deleted: deletedIds.length, ids: deletedIds }, { headers: cors });
    }

    // ── /api/ref/:table ──────────────────────────────────────
    if (url.pathname.startsWith('/api/ref/')) {
      const refPath = url.pathname.replace('/api/ref/', '');
      const refParts = refPath.split('/').filter(Boolean);
      const table = refParts[0];
      const refId = refParts[1] || '';
      const allowed = [
        'ref_cars',
        'ref_warehouses',
        'ref_equipment',
        'ref_payment_statuses',
        'ref_partners',
        'ref_supplier_statuses',
        'ref_dropshippers',
        'ref_app_settings',
      ];

      if (!allowed.includes(table)) {
        return new Response('Not found', { status: 404, headers: cors });
      }

      if (request.method === 'PATCH') {
        if (authedRole !== 'owner') {
          return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
        }
        if (!refId) {
          return Response.json({ error: 'Reference id required' }, { status: 400, headers: cors });
        }
        if (table !== 'ref_warehouses' && table !== 'ref_dropshippers' && table !== 'ref_app_settings') {
          return Response.json({ error: 'Read only reference' }, { status: 400, headers: cors });
        }

        const body = await request.json().catch(() => ({}));
        const patch = {};
        if (table === 'ref_app_settings') {
          if (Object.prototype.hasOwnProperty.call(body, 'key')) {
            const key = String(body?.key || '').trim();
            if (!key) {
              return Response.json({ error: 'Key required' }, { status: 400, headers: cors });
            }
            patch.key = key;
          }
          if (Object.prototype.hasOwnProperty.call(body, 'value_json')) {
            patch.value_json = body?.value_json && typeof body.value_json === 'object' ? body.value_json : {};
          }
        }
        if (Object.prototype.hasOwnProperty.call(body, 'name')) {
          const name = String(body?.name || '').trim();
          if (!name) {
            return Response.json({ error: 'Name required' }, { status: 400, headers: cors });
          }
          patch.name = name;
        }
        if (table === 'ref_dropshippers' && Object.prototype.hasOwnProperty.call(body, 'worker_name')) {
          patch.worker_name = String(body?.worker_name || '').trim() || null;
        }
        if (!Object.keys(patch).length) {
          return Response.json({ error: 'No fields to update' }, { status: 400, headers: cors });
        }

        const updateRes = await fetch(`${sb}/rest/v1/${table}?id=eq.${encodeURIComponent(refId)}`, {
          method: 'PATCH',
          headers: sbHeaders,
          body: JSON.stringify(patch),
        });
        const updateData = await updateRes.json().catch(() => []);
        if (!updateRes.ok) {
          const message = Array.isArray(updateData)
            ? 'Не удалось обновить запись'
            : (updateData?.message || updateData?.error || 'Не удалось обновить запись');
          return Response.json({ error: message }, { status: updateRes.status || 400, headers: cors });
        }
        return Response.json(updateData, { headers: cors });
      }

      if (request.method === 'POST') {
        if (authedRole !== 'owner') {
          return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
        }

        if (table !== 'ref_warehouses' && table !== 'ref_dropshippers' && table !== 'ref_app_settings') {
          return Response.json({ error: 'Read only reference' }, { status: 400, headers: cors });
        }

        const body = await request.json().catch(() => ({}));
        if (table === 'ref_app_settings') {
          const key = String(body?.key || '').trim();
          if (!key) {
            return Response.json({ error: 'Key required' }, { status: 400, headers: cors });
          }
          const valueJson = body?.value_json && typeof body.value_json === 'object' ? body.value_json : {};
          const existingRes = await fetch(
            `${sb}/rest/v1/${table}?key=eq.${encodeURIComponent(key)}&limit=1`,
            { headers: sbHeaders }
          );
          const existingRows = await existingRes.json().catch(() => []);
          if (Array.isArray(existingRows) && existingRows[0]) {
            const updateRes = await fetch(`${sb}/rest/v1/${table}?id=eq.${encodeURIComponent(existingRows[0].id)}`, {
              method: 'PATCH',
              headers: sbHeaders,
              body: JSON.stringify({ key, value_json: valueJson, updated_at: new Date().toISOString() }),
            });
            const updateData = await updateRes.json().catch(() => []);
            if (!updateRes.ok) {
              const message = Array.isArray(updateData)
                ? 'Не удалось обновить настройку'
                : (updateData?.message || updateData?.error || 'Не удалось обновить настройку');
              return Response.json({ error: message }, { status: updateRes.status || 400, headers: cors });
            }
            return Response.json(updateData, { headers: cors });
          }

          const createRes = await fetch(`${sb}/rest/v1/${table}`, {
            method: 'POST',
            headers: sbHeaders,
            body: JSON.stringify({ key, value_json: valueJson }),
          });
          const createData = await createRes.json().catch(() => []);
          if (!createRes.ok) {
            const message = Array.isArray(createData)
              ? 'Не удалось создать настройку'
              : (createData?.message || createData?.error || 'Не удалось создать настройку');
            return Response.json({ error: message }, { status: createRes.status || 400, headers: cors });
          }
          return Response.json(createData, { headers: cors });
        }

        const name = String(body?.name || '').trim();
        if (!name) {
          return Response.json({ error: 'Name required' }, { status: 400, headers: cors });
        }

        if (table === 'ref_warehouses') {
          const existingRes = await fetch(
            `${sb}/rest/v1/${table}?name=eq.${encodeURIComponent(name)}&limit=1`,
            { headers: sbHeaders }
          );
          const existingRows = await existingRes.json().catch(() => []);
          if (Array.isArray(existingRows) && existingRows[0]) {
            return Response.json(existingRows, { headers: cors });
          }

          const createRes = await fetch(`${sb}/rest/v1/${table}`, {
            method: 'POST',
            headers: sbHeaders,
            body: JSON.stringify({ name }),
          });
          const createData = await createRes.json().catch(() => []);
          if (!createRes.ok) {
            const message = Array.isArray(createData)
              ? 'Не удалось создать склад'
              : (createData?.message || createData?.error || 'Не удалось создать склад');
            return Response.json({ error: message }, { status: createRes.status || 400, headers: cors });
          }
          return Response.json(createData, { headers: cors });
        }

        const workerName = String(body?.worker_name || '').trim() || null;
        const existingRes = await fetch(
          `${sb}/rest/v1/${table}?name=eq.${encodeURIComponent(name)}&limit=1`,
          { headers: sbHeaders }
        );
        const existingRows = await existingRes.json().catch(() => []);
        if (Array.isArray(existingRows) && existingRows[0]) {
          return Response.json(existingRows, { headers: cors });
        }

        const createRes = await fetch(`${sb}/rest/v1/${table}`, {
          method: 'POST',
          headers: sbHeaders,
          body: JSON.stringify({ name, worker_name: workerName }),
        });
        const createData = await createRes.json().catch(() => []);
        if (!createRes.ok) {
          const message = Array.isArray(createData)
            ? 'Не удалось создать дропшиппера'
            : (createData?.message || createData?.error || 'Не удалось создать дропшиппера');
          return Response.json({ error: message }, { status: createRes.status || 400, headers: cors });
        }
        return Response.json(createData, { headers: cors });
      }

      if (table === 'ref_warehouses') {
        const directRes = await fetch(`${sb}/rest/v1/${table}?order=created_at.asc&limit=10000`, { headers: sbHeaders });
        const directData = await directRes.json().catch(() => []);
        if (directRes.ok && Array.isArray(directData)) {
          return Response.json(directData, { headers: cors });
        }

        const ordersRes = await fetch(
          `${sb}/rest/v1/orders?select=warehouse&deleted_at=is.null&warehouse=not.is.null&limit=10000`,
          { headers: sbHeaders }
        );
        const ordersData = await ordersRes.json().catch(() => []);
        const seen = new Set();
        const warehouses = [];
        (Array.isArray(ordersData) ? ordersData : []).forEach(row => {
          const name = String(row?.warehouse || '').trim();
          if (!name || name === '—' || name === '-') return;
          const key = name.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          warehouses.push({ name });
        });
        warehouses.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
        return Response.json(warehouses, { headers: cors });
      }

      const res  = await fetch(`${sb}/rest/v1/${table}?order=created_at.asc&limit=10000`, { headers: sbHeaders });
      const data = await res.json();
      return Response.json(data, { headers: cors });
    }

    // ── /api/car-directory ───────────────────────────────────
    if (url.pathname === '/api/car-directory' && request.method === 'GET') {
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 1000));

      const res = await fetch(
        `${sb}/rest/v1/car_directory?order=model.asc&offset=${offset}&limit=${limit}`,
        { headers: sbHeaders }
      );
      const data = await res.json();
      return Response.json(data, { headers: cors });
    }

    if (url.pathname === '/api/car-directory' && request.method === 'POST') {
      const { model, eurocode } = await request.json().catch(() => ({}));
      if (!model) {
        return Response.json({ error: 'model required' }, { status: 400, headers: cors });
      }

      const upsertHeaders = {
        ...sbHeaders,
        'Prefer': 'return=representation,resolution=merge-duplicates',
      };
      const res = await fetch(`${sb}/rest/v1/car_directory?on_conflict=model`, {
        method: 'POST',
        headers: upsertHeaders,
        body: JSON.stringify({ model, eurocode: eurocode || '' }),
      });
      const data = await res.json();
      return Response.json(Array.isArray(data) ? data : [data], { headers: cors });
    }

    if (url.pathname === '/api/admin/backfill-order-cash' && request.method === 'POST') {
      if (authedRole !== 'owner') {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }

      const orderSelect = [
        'id',
        'responsible',
        'date',
        'client',
        'car',
        'in_work',
        'is_cancelled',
        'client_payments',
        'supplier_payments',
        'drop_shipper_payments',
      ].join(',');

      const res = await fetch(
        `${sb}/rest/v1/orders?select=${orderSelect}&deleted_at=is.null&limit=10000`,
        { headers: sbHeaders }
      );
      const ordersData = await res.json().catch(() => []);
      const sourceMap = new Map();

      (Array.isArray(ordersData) ? ordersData : []).forEach(order => {
        if (!order || order.is_cancelled || !order.in_work) return;
        buildOrderDerivedCashEntries(order).forEach(entry => {
          const key = String(entry?.fop_source_key || '').trim();
          if (!key) return;
          sourceMap.set(key, entry);
        });
      });

      const entries = Array.from(sourceMap.values());
      if (!entries.length) {
        return Response.json({ ok: true, candidates: 0 }, { headers: cors });
      }

      const saveRes = await fetch(`${sb}/rest/v1/cash_log?on_conflict=fop_source_key`, {
        method: 'POST',
        headers: {
          ...sbHeaders,
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(entries),
      });
      const saved = await saveRes.json().catch(() => []);
      if (!saveRes.ok) {
        return Response.json({ error: saved?.message || 'Backfill failed', details: saved }, { status: saveRes.status, headers: cors });
      }

      return Response.json({
        ok: true,
        candidates: entries.length,
        saved: Array.isArray(saved) ? saved.length : 0,
      }, { headers: cors });
    }

    if (url.pathname.startsWith('/api/car-directory/') && request.method === 'PATCH') {
      if (authedRole !== 'owner') {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }

      const id   = url.pathname.split('/').pop();
      const body = await request.json().catch(() => ({}));
      const res  = await fetch(
        `${sb}/rest/v1/car_directory?id=eq.${encodeURIComponent(id)}`,
        { method: 'PATCH', headers: sbHeaders, body: JSON.stringify(body) }
      );
      const data = await res.json();
      return Response.json(Array.isArray(data) ? data : [data], { headers: cors });
    }

    if (url.pathname.startsWith('/api/car-directory/') && request.method === 'DELETE') {
      if (authedRole !== 'owner') {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }

      const id = url.pathname.split('/').pop();
      await fetch(`${sb}/rest/v1/car_directory?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: sbHeaders });
      return Response.json({ ok: true }, { headers: cors });
    }

    return new Response('Not found', { status: 404, headers: cors });
  }
};

// ── helpers ──────────────────────────────────────────────────

const SPECIALIST_ORDER_SELECT = [
  'id',
  'date',
  'responsible',
  'client',
  'phone',
  'address',
  'vin',
  'car',
  'code',
  'glass_manufacturer',
  'notes',
  'mount',
  'service_type',
  'molding',
  'extra_work',
  'tatu',
  'tatu_status',
  'tatu_done',
  'tatu_done_by',
  'toning',
  'toning_status',
  'toning_done',
  'toning_done_by',
  'delivery',
  'author',
  'payment_status',
  'check_sum',
  'debt',
  'debt_date',
  'total',
  'supplier_status',
  'purchase',
  'income',
  'warehouse',
  'warehouse_code',
  'new_post',
  'configuration',
  'drop_shipper',
  'drop_shipper_payout',
  'drop_shipper_payments',
  'toning_external',
  'time',
  'status_done',
  'in_work',
  'call_status',
  'own_warehouse',
  'worker_done',
  'assistant',
  'is_cancelled',
  'deleted_at',
  'deleted_by',
  'manager',
  'only_sale',
  'rework_data',
  'client_payments',
  'supplier_payments',
].join(',');

async function fetchOrdersForSession(session, sb, sbHeaders) {
  if (session.role === 'owner' || session.role === 'manager') {
    const res = await fetch(`${sb}/rest/v1/orders?order=date.desc&limit=10000`, { headers: sbHeaders });
    return res.json();
  }

  const currentWorker = await getWorkerByName(session.workerName, sb, sbHeaders);
  if (workerHasPermission(currentWorker, 'orders_view_all') || workerHasPermission(currentWorker, 'warehouses_view')) {
    const res = await fetch(
      `${sb}/rest/v1/orders?select=${SPECIALIST_ORDER_SELECT}&is_cancelled=eq.false&deleted_at=is.null&order=date.desc&limit=10000`,
      { headers: sbHeaders }
    );
    return res.json();
  }

  const workerName = session.workerName || '';
  if (workerName === 'Nastya') {
    const res = await fetch(
      `${sb}/rest/v1/orders?select=${SPECIALIST_ORDER_SELECT}&is_cancelled=eq.false&deleted_at=is.null&or=${encodeURIComponent('(in_work.eq.true,own_warehouse.eq.true)')}&order=date.desc&limit=10000`,
      { headers: sbHeaders }
    );
    return res.json();
  }

  const workerDropshippers = await getDropshipperNamesForWorker(workerName, sb, sbHeaders);
  const specialistFilters = [
    `and(in_work.eq.true,responsible.eq.${workerName})`,
    `and(in_work.eq.true,assistant.eq.${workerName})`,
    ...workerDropshippers.map(name => `drop_shipper.eq.${name}`),
  ];
  if (workerHasSpecialServiceCapability(currentWorker, 'tatu')) specialistFilters.push('and(in_work.eq.true,tatu.gt.0)');
  if (workerHasSpecialServiceCapability(currentWorker, 'toning')) specialistFilters.push('and(in_work.eq.true,toning.gt.0)');
  const ownFilter = encodeURIComponent(`(${specialistFilters.join(',')})`);
  const res = await fetch(
    `${sb}/rest/v1/orders?select=${SPECIALIST_ORDER_SELECT}&is_cancelled=eq.false&deleted_at=is.null&or=${ownFilter}&order=date.desc&limit=10000`,
    { headers: sbHeaders }
  );
  return res.json();
}

async function getDropshipperNamesForWorker(workerName, sb, sbHeaders) {
  if (!workerName) return [];
  const [workerRes, dropshipperRes] = await Promise.all([
    fetch(`${sb}/rest/v1/workers?name=eq.${encodeURIComponent(workerName)}&limit=1`, { headers: sbHeaders }),
    fetch(`${sb}/rest/v1/ref_dropshippers?select=name,worker_name&limit=1000`, { headers: sbHeaders }),
  ]);
  const workers = await workerRes.json().catch(() => []);
  const dropshippers = ensureBuiltInDropshippers(await dropshipperRes.json().catch(() => []));
  const worker = Array.isArray(workers) ? workers[0] : null;
  if (!worker || !Array.isArray(dropshippers)) return [];

  return dropshippers
    .filter(row => {
      const linkedWorkerName = String(row?.worker_name || '').trim();
      if (linkedWorkerName) return linkedWorkerName === workerName;
      return isDropshipperLinkedToWorkerName(String(row?.name || ''), worker);
    })
    .map(row => String(row?.name || ''))
    .filter(Boolean);
}

function ensureBuiltInDropshippers(rows = []) {
  const list = Array.isArray(rows) ? [...rows] : [];
  const builtIns = [
    { name: 'Саша Менеджер', worker_name: 'Sasha Manager' },
    { name: 'Паша Литовченко', worker_name: '' },
  ];

  builtIns.forEach(entry => {
    const exists = list.some(row =>
      (entry.worker_name && String(row?.worker_name || '').trim() === String(entry.worker_name).trim())
      || String(row?.name || '').trim() === String(entry.name).trim()
    );
    if (!exists) list.push(entry);
  });

  return list;
}

function normalizeDropshipperWorkerText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-z0-9а-яіїєґ\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function leadingSymbol(value) {
  const first = Array.from(String(value || '').trim())[0] || '';
  return /[a-z0-9а-яіїєґ]/i.test(first) ? '' : first;
}

function isDropshipperLinkedToWorkerName(dropshipperName, worker) {
  const target = normalizeDropshipperWorkerText(dropshipperName);
  const targetSymbol = leadingSymbol(dropshipperName);
  const targetTokens = target.split(' ').filter(token => token.length > 1);
  if (!target) return false;

  const labels = [worker?.name, worker?.alias].filter(Boolean);
  if (labels.some(label => normalizeDropshipperWorkerText(label) === target)) return true;

  if (!targetSymbol || !labels.some(label => leadingSymbol(label) === targetSymbol)) return false;
  return labels.some(label => {
    const tokens = normalizeDropshipperWorkerText(label).split(' ').filter(token => token.length > 1);
    return tokens.some(token => targetTokens.includes(token));
  });
}

function canSashaManagerCreateDropshipperCash(body, session) {
  if (session?.workerName !== 'Sasha Manager') return false;
  const targetWorker = String(body?.worker_name || '');
  if (!['Oleg Starshiy', 'Lyosha'].includes(targetWorker)) return false;
  const comment = String(body?.comment || '');
  return comment.startsWith('Выплата дропшипперу ') || comment.startsWith('Корректировка дропшиппера ');
}

function getOrderIdNumber(id) {
  const match = String(id || '').match(/SG-(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

function formatOrderId(num) {
  return 'SG-' + String(Math.max(1, Number(num) || 1)).padStart(4, '0');
}

async function getNextMonotonicOrderId(sb, sbHeaders, afterId = '') {
  const res = await fetch(`${sb}/rest/v1/orders?select=id&limit=10000`, { headers: sbHeaders });
  const rows = await res.json().catch(() => []);
  const maxExisting = Array.isArray(rows)
    ? rows.reduce((max, row) => Math.max(max, getOrderIdNumber(row?.id)), 0)
    : 0;
  const afterNum = getOrderIdNumber(afterId);
  return formatOrderId(Math.max(maxExisting, afterNum) + 1);
}

function isDuplicateOrderInsertError(errorText = '') {
  const text = String(errorText || '').toLowerCase();
  return text.includes('duplicate key')
    || text.includes('already exists')
    || text.includes('duplicate');
}

async function insertNewOrderWithMonotonicId(body, sb, sbHeaders) {
  const baseBody = body && typeof body === 'object' ? { ...body } : {};
  let afterId = String(baseBody.id || '').trim();
  let lastErrorText = '';
  let lastStatus = 500;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const nextId = await getNextMonotonicOrderId(sb, sbHeaders, afterId);
    const payload = { ...baseBody, id: nextId };
    const res = await fetch(`${sb}/rest/v1/orders`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      return await res.json();
    }

    lastStatus = res.status || 500;
    lastErrorText = await res.text().catch(() => '');
    if (!isDuplicateOrderInsertError(lastErrorText)) {
      throw new Error(lastErrorText || 'Order insert failed');
    }
    afterId = nextId;
  }

  const err = new Error(lastErrorText || 'Failed to allocate next order id');
  err.status = lastStatus;
  throw err;
}

function canUseCashApi(session) {
  return ['owner', 'manager', 'senior', 'extra', 'junior'].includes(session?.role);
}

async function canCreateCashEntryForWorker(body, session, sb, sbHeaders) {
  if (!canUseCashApi(session)) return false;
  if (session.role === 'owner') return true;
  const currentWorker = await getWorkerByName(session.workerName, sb, sbHeaders);
  const canAddCash = workerHasPermission(currentWorker, 'cash_add_entries') || workerHasPermission(currentWorker, 'order_payments_manage');
  if (isOrderDerivedCashEntry(body)) {
    return session.role === 'manager' || session.role === 'senior' || session.role === 'extra' || canAddCash;
  }
  if (session.role === 'manager') {
    return body.worker_name === session.workerName || canSashaManagerCreateDropshipperCash(body, session);
  }
  if (session.role === 'senior' || session.role === 'extra' || session.role === 'junior') {
    if (!canAddCash) return false;
    return canAccessWorker(body.worker_name, session, sb, sbHeaders);
  }
  return false;
}

async function canCreateOrderCashEntry(cashEntry, rawEntry, session, sb, sbHeaders) {
  if (!canUseCashApi(session)) return false;
  if (session.role === 'owner') return true;
  const currentWorker = await getWorkerByName(session.workerName, sb, sbHeaders);
  const canAddCash = workerHasPermission(currentWorker, 'cash_add_entries') || workerHasPermission(currentWorker, 'order_payments_manage');
  if (session.role === 'manager') {
    const cashType = String(rawEntry?.cashType || '');
    const isSashaManagerCardEntry = cashEntry.worker_name === 'Sasha Manager'
      && ['sasha-card-client', 'sasha-card-supplier'].includes(cashType);
    return cashEntry.worker_name === session.workerName || isSashaManagerCardEntry;
  }
  if (session.role === 'senior' || session.role === 'extra' || session.role === 'junior') {
    if (!canAddCash) return false;
    return canAccessWorker(cashEntry.worker_name, session, sb, sbHeaders);
  }
  return false;
}

async function getOrderById(id, sb, sbHeaders) {
  if (!id) return null;
  const res = await fetch(`${sb}/rest/v1/orders?id=eq.${encodeURIComponent(id)}&limit=1`, { headers: sbHeaders });
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function isOwnOrder(order, workerName) {
  return !!order && !!workerName && (order.responsible === workerName || order.assistant === workerName);
}

function canPatchSpecialServiceOnly(body, order, session = {}, currentWorker = null) {
  if (!body || !order || order.is_cancelled || !order.in_work) return false;
  const keys = Object.keys(body);
  if (!keys.length) return false;
  const romaKeys = ['tatu_done', 'tatu_status', 'tatu_done_by'];
  const lyoshaKeys = ['toning_done', 'toning_status', 'toning_done_by'];
  const onlyRomaKeys = keys.every(key => romaKeys.includes(key));
  const onlyLyoshaKeys = keys.every(key => lyoshaKeys.includes(key));
  const tatuAssigned = getOrderAssignedSpecialist(order, 'tatu');
  const toningAssigned = getOrderAssignedSpecialist(order, 'toning');
  if (workerHasSpecialServiceCapability(currentWorker || { name: session.workerName, note: '' }, 'tatu') && onlyRomaKeys) {
    if (tatuAssigned && tatuAssigned !== session.workerName) return false;
    return (Number(order.tatu) || 0) > 0;
  }
  if (workerHasSpecialServiceCapability(currentWorker || { name: session.workerName, note: '' }, 'toning') && onlyLyoshaKeys) {
    if (toningAssigned && toningAssigned !== session.workerName) return false;
    return (Number(order.toning) || 0) > 0 && !order.toning_external;
  }
  return false;
}

function buildSpecialistOrderPatch(body, existingOrder, session = {}, currentWorker = null) {
  const patch = {};
  const clientPayments = Array.isArray(body?.client_payments)
    ? body.client_payments
    : (Array.isArray(body?.clientPayments) ? body.clientPayments : null);
  const supplierPayments = Array.isArray(body?.supplier_payments)
    ? body.supplier_payments
    : (Array.isArray(body?.supplierPayments) ? body.supplierPayments : null);
  const checkSumValue = Object.prototype.hasOwnProperty.call(body, 'check_sum')
    ? body.check_sum
    : (Object.prototype.hasOwnProperty.call(body, 'check') ? body.check : undefined);

  if (Object.prototype.hasOwnProperty.call(body, 'worker_done')) {
    if (body.worker_done === true && (!existingOrder?.in_work || existingOrder?.is_cancelled)) {
      throw new Error('Order is not active');
    }
    if (body.worker_done === true && !existingOrder?.only_sale && !String(existingOrder?.service_type || '').trim()) {
      throw new Error('Service type required');
    }
    patch.worker_done = !!body.worker_done;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'service_type')) {
    patch.service_type = String(body.service_type || '').trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'tatu_done')) {
    if (!workerHasSpecialServiceCapability(currentWorker || { name: session.workerName, note: '' }, 'tatu')) throw new Error('Forbidden');
    if (getOrderAssignedSpecialist(existingOrder, 'tatu') && getOrderAssignedSpecialist(existingOrder, 'tatu') !== session.workerName) throw new Error('Forbidden');
    if ((Number(existingOrder?.tatu) || 0) <= 0) throw new Error('Invalid special service');
    patch.tatu_done = !!body.tatu_done;
    patch.tatu_done_by = patch.tatu_done ? session.workerName : null;
    patch.tatu_status = patch.tatu_done;
  } else if (Object.prototype.hasOwnProperty.call(body, 'tatu_status')) {
    if (!workerHasSpecialServiceCapability(currentWorker || { name: session.workerName, note: '' }, 'tatu')) throw new Error('Forbidden');
    if (getOrderAssignedSpecialist(existingOrder, 'tatu') && getOrderAssignedSpecialist(existingOrder, 'tatu') !== session.workerName) throw new Error('Forbidden');
    if ((Number(existingOrder?.tatu) || 0) <= 0) throw new Error('Invalid special service');
    patch.tatu_status = !!body.tatu_status;
    patch.tatu_done = patch.tatu_status;
    patch.tatu_done_by = patch.tatu_status ? session.workerName : null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'toning_done')) {
    if (!workerHasSpecialServiceCapability(currentWorker || { name: session.workerName, note: '' }, 'toning')) throw new Error('Forbidden');
    if (getOrderAssignedSpecialist(existingOrder, 'toning') && getOrderAssignedSpecialist(existingOrder, 'toning') !== session.workerName) throw new Error('Forbidden');
    if ((Number(existingOrder?.toning) || 0) <= 0 || existingOrder?.toning_external) throw new Error('Invalid special service');
    patch.toning_done = !!body.toning_done;
    patch.toning_done_by = patch.toning_done ? session.workerName : null;
    patch.toning_status = patch.toning_done;
  } else if (Object.prototype.hasOwnProperty.call(body, 'toning_status')) {
    if (!workerHasSpecialServiceCapability(currentWorker || { name: session.workerName, note: '' }, 'toning')) throw new Error('Forbidden');
    if (getOrderAssignedSpecialist(existingOrder, 'toning') && getOrderAssignedSpecialist(existingOrder, 'toning') !== session.workerName) throw new Error('Forbidden');
    if ((Number(existingOrder?.toning) || 0) <= 0 || existingOrder?.toning_external) throw new Error('Invalid special service');
    patch.toning_status = !!body.toning_status;
    patch.toning_done = patch.toning_status;
    patch.toning_done_by = patch.toning_status ? session.workerName : null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'price_locked') && body.price_locked !== undefined) {
    patch.price_locked = !!body.price_locked;
  }
  if (Array.isArray(clientPayments)) {
    patch.client_payments = clientPayments;
    patch.debt = sumPaymentAmounts(clientPayments);
  } else if (Object.prototype.hasOwnProperty.call(body, 'debt')) {
    patch.debt = Number(body.debt) || 0;
  }
  if (Array.isArray(supplierPayments)) {
    patch.supplier_payments = supplierPayments;
    patch.check_sum = sumPaymentAmounts(supplierPayments);
  } else if (checkSumValue !== undefined) {
    patch.check_sum = Number(checkSumValue) || 0;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'debt')) {
    patch.payment_status = calcClientPaymentStatus(patch.debt, getOrderClientTotal(existingOrder));
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'check_sum')) {
    patch.supplier_status = calcSupplierPaymentStatus(patch.check_sum, Number(existingOrder.purchase) || 0);
  }

  return patch;
}

function sumPaymentAmounts(payments) {
  return (payments || []).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
}

function getOrderClientTotal(order) {
  return (Number(order?.total) || 0) + (Number(order?.income) || 0) + (Number(order?.delivery) || 0);
}

function calcClientPaymentStatus(totalPaid, totalAmount) {
  const paid = Number(totalPaid) || 0;
  const total = Number(totalAmount) || 0;
  if (paid <= 0) return 'Не оплачено';
  if (total > 0 && paid >= total) return 'Оплачено';
  return 'Частично';
}

function calcSupplierPaymentStatus(totalPaid, glassPurchase) {
  const paid = Number(totalPaid) || 0;
  const purchase = Number(glassPurchase) || 0;
  if (paid <= 0) return 'Не оплачено';
  if (purchase > 0 && paid >= purchase) return 'Оплачено';
  return 'Частично';
}

async function getWorkerByName(workerName, sb, sbHeaders) {
  if (!workerName) return null;
  const res = await fetch(
    `${sb}/rest/v1/workers?name=eq.${encodeURIComponent(workerName)}&limit=1`,
    { headers: sbHeaders }
  );
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

const WORKER_PERMISSIONS_META_PREFIX = '[[CRM_PERMS:';
const WORKER_PERMISSIONS_META_SUFFIX = ']]';
const LEGACY_WORKER_PERMISSIONS_META_PREFIX = '\n<!--crm-permissions:';
const LEGACY_WORKER_PERMISSIONS_META_SUFFIX = ':crm-permissions-->';
const WORKER_PERMISSION_PRESETS = {
  manager: {
    orders_view_all: true,
    orders_create: true,
    orders_edit: true,
    orders_delete: false,
    clients_view: true,
    workers_view: false,
    warehouses_view: true,
    dropshippers_manage: false,
    calendar_view: false,
    groups_view: false,
    personal_cash_view: false,
    cash_add_entries: false,
    finance_view: false,
    owner_cash_view: false,
    owner_expenses_view: false,
    owner_payments_view: false,
    order_payments_manage: true,
    order_services_edit: true,
    order_complete: false,
    special_service_status: false,
    special_service_tatu: false,
    special_service_toning: false,
  },
  senior: {
    orders_view_all: false,
    orders_create: false,
    orders_edit: true,
    orders_delete: false,
    clients_view: false,
    workers_view: false,
    warehouses_view: false,
    dropshippers_manage: false,
    calendar_view: false,
    groups_view: false,
    personal_cash_view: true,
    cash_add_entries: true,
    finance_view: false,
    owner_cash_view: false,
    owner_expenses_view: false,
    owner_payments_view: false,
    order_payments_manage: true,
    order_services_edit: true,
    order_complete: true,
    special_service_status: false,
    special_service_tatu: false,
    special_service_toning: false,
  },
  junior: {
    orders_view_all: false,
    orders_create: false,
    orders_edit: false,
    orders_delete: false,
    clients_view: false,
    workers_view: false,
    warehouses_view: false,
    dropshippers_manage: false,
    calendar_view: false,
    groups_view: false,
    personal_cash_view: false,
    cash_add_entries: false,
    finance_view: false,
    owner_cash_view: false,
    owner_expenses_view: false,
    owner_payments_view: false,
    order_payments_manage: false,
    order_services_edit: false,
    order_complete: false,
    special_service_status: false,
    special_service_tatu: false,
    special_service_toning: false,
  },
  extra: {
    orders_view_all: false,
    orders_create: false,
    orders_edit: true,
    orders_delete: false,
    clients_view: false,
    workers_view: false,
    warehouses_view: false,
    dropshippers_manage: false,
    calendar_view: false,
    groups_view: false,
    personal_cash_view: true,
    cash_add_entries: true,
    finance_view: false,
    owner_cash_view: false,
    owner_expenses_view: false,
    owner_payments_view: false,
    order_payments_manage: true,
    order_services_edit: true,
    order_complete: true,
    special_service_status: false,
    special_service_tatu: false,
    special_service_toning: false,
  },
};

function parseWorkerNoteMeta(rawNote) {
  const source = String(rawNote || '');
  let start = source.indexOf(WORKER_PERMISSIONS_META_PREFIX);
  let end = start === -1 ? -1 : source.indexOf(WORKER_PERMISSIONS_META_SUFFIX, start + WORKER_PERMISSIONS_META_PREFIX.length);
  let prefix = WORKER_PERMISSIONS_META_PREFIX;
  let suffix = WORKER_PERMISSIONS_META_SUFFIX;
  if (start === -1 || end === -1) {
    start = source.indexOf(LEGACY_WORKER_PERMISSIONS_META_PREFIX);
    end = start === -1 ? -1 : source.indexOf(LEGACY_WORKER_PERMISSIONS_META_SUFFIX, start + LEGACY_WORKER_PERMISSIONS_META_PREFIX.length);
    prefix = LEGACY_WORKER_PERMISSIONS_META_PREFIX;
    suffix = LEGACY_WORKER_PERMISSIONS_META_SUFFIX;
  }
  if (start === -1 || end === -1) {
    return { note: source.trim(), permissions: {}, telegramNick: '' };
  }

  const encoded = source.slice(start + prefix.length, end).trim();
  const note = `${source.slice(0, start)}${source.slice(end + suffix.length)}`.trim();
  if (!encoded) {
    return { note, permissions: {}, telegramNick: '' };
  }

  try {
    const decoded = JSON.parse(atob(encoded));
    const meta = decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? decoded : {};
    const isLegacyPermissionsOnly = !Object.prototype.hasOwnProperty.call(meta, 'permissions') && !Object.prototype.hasOwnProperty.call(meta, 'telegramNick');
    return {
      note,
      permissions: isLegacyPermissionsOnly
        ? meta
        : ((meta.permissions && typeof meta.permissions === 'object' && !Array.isArray(meta.permissions)) ? meta.permissions : {}),
      telegramNick: String(isLegacyPermissionsOnly ? '' : (meta.telegramNick || '')).trim().replace(/^@+/, ''),
    };
  } catch (e) {
    return { note, permissions: {}, telegramNick: '' };
  }
}

function getWorkerTelegramNick(workerRow) {
  return String(workerRow?.telegram_nick || parseWorkerNoteMeta(workerRow?.note).telegramNick || '').trim().replace(/^@+/, '');
}

async function sendTelegramText(env, text) {
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chatId || !text) {
    return { ok: false, error: 'Telegram env missing or empty text' };
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text),
      disable_web_page_preview: true,
    }),
  });
  const bodyText = await res.text().catch(() => '');
  return {
    ok: res.ok,
    status: res.status,
    bodyText,
  };
}

async function buildPlannerTelegramMessage(orderRow, sb, sbHeaders) {
  if (!orderRow?.id) return '';
  const names = [
    orderRow.responsible,
    orderRow.assistant,
    orderRow.manager,
    getOrderAssignedSpecialist(orderRow, 'tatu'),
    getOrderAssignedSpecialist(orderRow, 'toning'),
  ].map(v => String(v || '').trim()).filter(Boolean);
  const uniqueNames = [...new Set(names)];
  const mentions = [];
  for (const workerName of uniqueNames) {
    const worker = await getWorkerByName(workerName, sb, sbHeaders);
    const nick = getWorkerTelegramNick(worker);
    if (nick) mentions.push(`@${nick}`);
  }
  const lines = [
    `Новый заказ ${orderRow.id}`,
    [orderRow.date || '', orderRow.time || ''].filter(Boolean).join(' '),
    orderRow.client ? `Клиент: ${orderRow.client}` : '',
    orderRow.car ? `Авто: ${orderRow.car}` : '',
    orderRow.phone ? `Телефон: ${orderRow.phone}` : '',
    mentions.length ? mentions.join(' ') : '',
  ].filter(Boolean);
  return lines.join('\n');
}

async function maybeNotifyPlannerOrder(previousOrder, savedOrder, sb, sbHeaders, env) {
  if (!savedOrder?.in_work) return;
  if (previousOrder?.in_work) return;
  try {
    const text = await buildPlannerTelegramMessage(savedOrder, sb, sbHeaders);
    if (text) await sendTelegramText(env, text);
  } catch (e) {}
}

function getWorkerPermissionPreset(systemRole) {
  return { ...(WORKER_PERMISSION_PRESETS[systemRole] || WORKER_PERMISSION_PRESETS.junior) };
}

function workerHasPermission(workerRow, key) {
  if (!workerRow || !key) return false;
  const parsed = parseWorkerNoteMeta(workerRow.note);
  if (Object.prototype.hasOwnProperty.call(parsed.permissions || {}, key)) {
    return !!parsed.permissions?.[key];
  }
  const preset = getWorkerPermissionPreset(workerRow.system_role || workerRow.systemRole || workerRow.role);
  return !!preset[key];
}

function workerHasSpecialServiceCapability(workerRow, type) {
  if (type === 'tatu') {
    return workerHasPermission(workerRow, 'special_service_tatu');
  }
  if (type === 'toning') {
    return workerHasPermission(workerRow, 'special_service_toning');
  }
  return false;
}

const ORDER_META_TATU_RESP_PREFIX = '__tatu_resp__:';
const ORDER_META_TONING_RESP_PREFIX = '__toning_resp__:';

function getOrderAssignedSpecialist(order, type) {
  const configuration = String(order?.configuration || '');
  const prefix = type === 'tatu' ? ORDER_META_TATU_RESP_PREFIX : ORDER_META_TONING_RESP_PREFIX;
  const token = configuration
    .split(',')
    .map(part => part.trim())
    .find(part => part.startsWith(prefix));
  return token ? token.slice(prefix.length).trim() : '';
}

async function getWorkersIdentityRows(sb, sbHeaders) {
  const res = await fetch(
    `${sb}/rest/v1/workers?select=name,alias,assistant,system_role&limit=1000`,
    { headers: sbHeaders }
  );
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

function normalizeWorkerIdentityText(value) {
  return String(value || '').trim().toLowerCase();
}

function workerIdentityMatchesLabel(worker, label) {
  const target = normalizeWorkerIdentityText(label);
  if (!target || !worker) return false;
  return [worker.name, worker.alias]
    .filter(Boolean)
    .map(normalizeWorkerIdentityText)
    .includes(target);
}

async function findWorkerByIdentity(label, sb, sbHeaders) {
  if (!label) return null;
  const exact = await getWorkerByName(label, sb, sbHeaders);
  if (exact) return exact;
  const rows = await getWorkersIdentityRows(sb, sbHeaders);
  return rows.find(worker => workerIdentityMatchesLabel(worker, label)) || null;
}

async function isOwnOrderForSession(order, session, sb, sbHeaders) {
  if (!order || !session?.workerName) return false;
  if (isOwnOrder(order, session.workerName)) return true;
  if (getOrderAssignedSpecialist(order, 'tatu') === session.workerName) return true;
  if (getOrderAssignedSpecialist(order, 'toning') === session.workerName) return true;
  const sessionWorker = await findWorkerByIdentity(session.workerName, sb, sbHeaders);
  if (!sessionWorker) return false;
  return workerIdentityMatchesLabel(sessionWorker, order.responsible)
    || workerIdentityMatchesLabel(sessionWorker, order.assistant)
    || workerIdentityMatchesLabel(sessionWorker, getOrderAssignedSpecialist(order, 'tatu'))
    || workerIdentityMatchesLabel(sessionWorker, getOrderAssignedSpecialist(order, 'toning'));
}

async function getSalaryById(id, sb, sbHeaders) {
  if (!id) return null;
  const res = await fetch(`${sb}/rest/v1/worker_salaries?id=eq.${encodeURIComponent(id)}&limit=1`, { headers: sbHeaders });
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function getSalaryByWorkerOrder(workerName, orderId, sb, sbHeaders) {
  if (!workerName || !orderId) return null;
  const res = await fetch(
    `${sb}/rest/v1/worker_salaries?worker_name=eq.${encodeURIComponent(workerName)}&order_id=eq.${encodeURIComponent(orderId)}&limit=1`,
    { headers: sbHeaders }
  );
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function isLockedOrderSalaryId(orderId) {
  if (!orderId) return false;
  const value = String(orderId);
  if (value === 'Выход в работу' || value === 'Ставка за день') return false;
  if (value.startsWith('Выплата')) return false;
  return true;
}

function isManualSalaryRow(row) {
  return !!row && row.entry_type === 'manual';
}

function isSalaryWithdrawalRow(row) {
  return String(row?.order_id || '').startsWith('Выплата');
}

async function isSalaryEntryWithdrawn(row, sb, sbHeaders) {
  if (!row?.worker_name) return false;
  const res = await fetch(
    `${sb}/rest/v1/worker_salaries?worker_name=eq.${encodeURIComponent(row.worker_name)}&order_id=like.${encodeURIComponent('Выплата%')}&order=created_at.desc&limit=100`,
    { headers: sbHeaders }
  );
  const rows = await res.json().catch(() => []);
  if (!Array.isArray(rows) || !rows.length) return false;
  const rowTime = row?.created_at ? new Date(row.created_at).getTime() : (row?.date ? new Date(`${row.date}T00:00:00`).getTime() : 0);
  return rows.some(withdrawal => {
    const withdrawalTime = withdrawal?.created_at ? new Date(withdrawal.created_at).getTime() : (withdrawal?.date ? new Date(`${withdrawal.date}T00:00:00`).getTime() : 0);
    if (rowTime && withdrawalTime) return withdrawalTime > rowTime;
    if (row?.date && withdrawal?.date) return String(withdrawal.date || '') >= String(row.date || '');
    return true;
  });
}

async function getCashById(id, sb, sbHeaders) {
  if (!id) return null;
  const res = await fetch(`${sb}/rest/v1/cash_log?id=eq.${encodeURIComponent(id)}&limit=1`, { headers: sbHeaders });
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function getPaymentMethodFromCashSourceKey(sourceKey) {
  const raw = String(sourceKey || '');
  const match = raw.match(/(?:^|\|)method:([^|]+)/);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch (e) {
    return match[1];
  }
}

function isConfirmableCardCashMethod(method) {
  const normalized = String(method || '').trim();
  return !!normalized && normalized !== '🪙 Наличка';
}

function getCashPaymentMethod(rowOrBody = {}) {
  return String(
    rowOrBody?.payment_method
    || rowOrBody?.manual_payment_method
    || getPaymentMethodFromCashSourceKey(rowOrBody?.fop_source_key)
    || ''
  ).trim();
}

function getCashApprovalOwner(method = '', cashAccount = 'cash') {
  const normalizedMethod = normalizeCashPaymentMethod(method);
  const normalizedAccount = String(cashAccount || 'cash').trim().toLowerCase();
  if (normalizedAccount === 'fop') return 'Oleg Starshiy';
  if (isSashaCardPaymentMethodForSync(normalizedMethod)) return 'Sasha Manager';
  if (isOlegCardPaymentMethodForSync(normalizedMethod)) return 'Oleg Starshiy';
  if (isOwnerCardPaymentMethodForSync(normalizedMethod)) return 'Maksim';
  if (normalizedMethod && !isCashPaymentMethodForSync(normalizedMethod)) return 'Maksim';
  return null;
}

function deriveCashSourceType(body = {}) {
  if (body?.source_type) return String(body.source_type).trim();
  if (body?.manual_payment === true) return 'manual';
  if (parseExpenseCommentMeta(body?.comment)) return 'expense';
  if (isCurrencyComment(body?.comment)) return 'exchange';
  if (String(body?.fop_source_key || '').startsWith('order:')) return 'order';
  if (String(body?.comment || '').startsWith('Выплата дропшипперу ') || String(body?.comment || '').startsWith('Корректировка дропшиппера ')) return 'dropshipper';
  if (String(body?.comment || '').startsWith('Снятие ЗП') || String(body?.comment || '').startsWith('снял ')) return 'salary';
  return 'manual';
}

function extractOrderIdFromSourceKey(sourceKey = '') {
  const match = String(sourceKey || '').match(/^order:([^|:]+)(?:[:|]|$)/);
  return match ? String(match[1] || '').trim() : '';
}

function parseExpenseCommentMeta(comment = '') {
  const raw = String(comment || '').trim();
  const match = raw.match(/^Расход\(([^)]+)\)\s*·\s*([^·-]+?)(?:\s*·\s*склад\s+([^-\n]+?))?(?:\s*-\s*([\s\S]+))?$/);
  if (!match) return null;
  return {
    amountLabel: String(match[1] || '').trim(),
    category: String(match[2] || '').trim(),
    warehouse: String(match[3] || '').trim(),
    note: String(match[4] || '').trim(),
  };
}

function isCurrencyComment(comment = '') {
  return String(comment || '').startsWith('FXUSD|');
}

function buildStructuredCashFields(body = {}) {
  const cashAccount = String(body?.account_type || body?.cash_account || 'cash').trim().toLowerCase();
  const paymentMethod = getCashPaymentMethod(body);
  const expenseMeta = parseExpenseCommentMeta(body?.comment);
  const sourceType = deriveCashSourceType(body);
  const orderId = String(body?.order_id || extractOrderIdFromSourceKey(body?.fop_source_key) || '').trim() || null;
  const confirmable = cashAccount === 'fop' || isConfirmableCardCashMethod(paymentMethod);
  const approvalStatus = body?.approval_status
    ? String(body.approval_status).trim()
    : (confirmable
      ? ((body?.fop_confirmed === true) ? 'confirmed' : 'pending')
      : 'not_required');

  let paymentType = String(body?.payment_type || '').trim();
  if (!paymentType) {
    if (expenseMeta) paymentType = 'expense';
    else if (isCurrencyComment(body?.comment)) paymentType = 'transfer';
    else if (isCashPaymentMethodForSync(paymentMethod)) paymentType = 'cash';
    else if (paymentMethod) paymentType = 'card';
    else paymentType = 'cash';
  }

  return {
    cash_owner: String(body?.cash_owner || body?.worker_name || '').trim() || null,
    account_type: cashAccount,
    payment_type: paymentType,
    payment_method: paymentMethod || null,
    approval_status: approvalStatus,
    approval_by: body?.approval_by !== undefined ? (String(body.approval_by || '').trim() || null) : getCashApprovalOwner(paymentMethod, cashAccount),
    source_type: sourceType,
    source_id: String(body?.source_id || body?.fop_source_key || orderId || '').trim() || null,
    order_id: orderId,
    expense_category: String(body?.expense_category || expenseMeta?.category || '').trim() || null,
    warehouse_name: String(body?.warehouse_name || expenseMeta?.warehouse || '').trim() || null,
  };
}

function isConfirmableCardCashRow(row) {
  const cashAccount = String(row?.cash_account || '').trim().toLowerCase();
  if (cashAccount !== 'cash') return false;
  return isConfirmableCardCashMethod(getPaymentMethodFromCashSourceKey(row?.fop_source_key));
}

function isOrderDerivedCashEntry(body) {
  return String(body?.fop_source_key || '').startsWith('order:');
}

function normalizeOrderSaveCashEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const workerName = String(entry.worker_name || '').trim();
  const amount = Number(entry.amount) || 0;
  const comment = String(entry.comment || '').trim();
  if (!workerName || !amount || !comment) return null;
  const normalized = {
    worker_name: workerName,
    amount,
    comment,
    cash_account: 'cash',
    fop_confirmed: false,
    fop_source_key: null,
    fop_date: null,
    manual_payment: false,
    manual_payment_method: null,
  };
  return { ...normalized, ...buildStructuredCashFields(normalized) };
}

function buildOrderPaymentSourceKey(orderId, method, paymentType = 'client', payment = null) {
  const normalizedMethod = normalizeCashPaymentMethod(method) || '';
  const amount = Number(payment?.amount) || 0;
  const date = String(payment?.date || '').trim();
  const timestamp = String(payment?.timestamp || '').trim();
  return [
    `order:${String(orderId || '').trim()}`,
    `type:${encodeURIComponent(String(paymentType || 'client'))}`,
    `method:${encodeURIComponent(normalizedMethod)}`,
    `amount:${encodeURIComponent(String(amount))}`,
    `date:${encodeURIComponent(date)}`,
    `ts:${encodeURIComponent(timestamp)}`,
  ].join('|');
}

function isCashPaymentMethodForSync(method) {
  return normalizeCashPaymentMethod(method) === '🪙 Наличка';
}

function isFopPaymentMethodForSync(method) {
  return normalizeCashPaymentMethod(method) === '📂 БЕЗНАЛ БАБЕНКО';
}

function isSashaCardPaymentMethodForSync(method) {
  return normalizeCashPaymentMethod(method) === '👤 Шепель Александр 💳 4149 4975 1422 9980 (PRIVAT)';
}

function isOlegCardPaymentMethodForSync(method) {
  return normalizeCashPaymentMethod(method) === '👤 Бабенко Олег 💳 5457 0825 0103 4743 (PRIVAT)';
}

function isOwnerCardPaymentMethodForSync(method) {
  return [
    '👤 Киртока Максим 💳 4441 1144 6035 9811 (MONO)',
    '👤 Киртока Анастасия 💳 4149 6090 2872 4237 (PRIVAT)',
  ].includes(normalizeCashPaymentMethod(method));
}

function getOrderPaymentCashRouteForSync(method, fallbackWorkerName = '') {
  const normalized = normalizeCashPaymentMethod(method);
  const targetWorkerName = String(fallbackWorkerName || '').trim();
  if (isCashPaymentMethodForSync(normalized)) {
    return {
      worker_name: targetWorkerName,
      cash_account: 'cash',
      fop_confirmed: false,
    };
  }
  if (isOwnerCardPaymentMethodForSync(normalized)) {
    return {
      worker_name: 'Карты владельца',
      cash_account: 'cash',
      fop_confirmed: false,
    };
  }
  if (isSashaCardPaymentMethodForSync(normalized)) {
    return {
      worker_name: 'Sasha Manager',
      cash_account: 'cash',
      fop_confirmed: false,
    };
  }
  if (isOlegCardPaymentMethodForSync(normalized)) {
    return {
      worker_name: 'Oleg Starshiy',
      cash_account: 'cash',
      fop_confirmed: false,
    };
  }
  if (isFopPaymentMethodForSync(normalized)) {
    return {
      worker_name: 'Oleg Starshiy',
      cash_account: 'fop',
      fop_confirmed: false,
    };
  }
  return {
    worker_name: targetWorkerName,
    cash_account: 'cash',
    fop_confirmed: false,
  };
}

function buildOrderDerivedCashEntries(order) {
  if (!order?.id) return [];
  const entries = [];
  const fallbackWorkerName = String(order?.responsible || '').trim();
  const orderId = order.id;
  const orderDate = String(order?.date || '').trim();
  const clientLabel = order?.client || '—';
  const carLabel = order?.car || order?.client || '—';

  const appendEntry = (payment, paymentType) => {
    const amount = Number(payment?.amount) || 0;
    const method = normalizeCashPaymentMethod(payment?.method);
    if (!amount || !method || isCashPaymentMethodForSync(method)) return;
    const route = getOrderPaymentCashRouteForSync(method, fallbackWorkerName);
    if (!route.worker_name) return;
    const paymentDate = String(payment?.date || orderDate || '').trim();
    const dateLabel = paymentDate
      ? new Date(`${paymentDate}T00:00:00`).toLocaleDateString('ru-RU')
      : '—';
    const signedAmount = paymentType === 'supplier' || paymentType === 'dropshipper' ? -amount : amount;
    const actionLabel = paymentType === 'supplier'
      ? 'Оплата поставщику'
      : (paymentType === 'dropshipper' ? 'Выплата дропшипперу' : 'Оплата клиента');
    entries.push({
      worker_name: route.worker_name,
      amount: signedAmount,
      comment: `${actionLabel} ${method} ${orderId}, ${dateLabel}, клиент: ${clientLabel}, авто: ${carLabel}`,
      cash_account: route.cash_account,
      fop_confirmed: route.fop_confirmed,
      fop_source_key: buildOrderPaymentSourceKey(orderId, method, paymentType, payment),
      fop_date: paymentDate || null,
      manual_payment: false,
      manual_payment_method: null,
      order_id: orderId,
    });
    entries[entries.length - 1] = {
      ...entries[entries.length - 1],
      ...buildStructuredCashFields(entries[entries.length - 1]),
    };
  };

  (Array.isArray(order.client_payments) ? order.client_payments : []).forEach(payment => appendEntry(payment, 'client'));
  (Array.isArray(order.supplier_payments) ? order.supplier_payments : []).forEach(payment => appendEntry(payment, 'supplier'));
  (Array.isArray(order.drop_shipper_payments) ? order.drop_shipper_payments : []).forEach(payment => appendEntry(payment, 'dropshipper'));
  return entries;
}

async function rollbackOrderSaveWithCash({ sb, sbHeaders, orderId, isNew, rollbackOrder, savedCashEntries }) {
  for (const entry of savedCashEntries || []) {
    if (!entry?.id) continue;
    await fetch(`${sb}/rest/v1/cash_log?id=eq.${encodeURIComponent(entry.id)}`, {
      method: 'DELETE',
      headers: sbHeaders,
    }).catch(() => {});
  }

  if (isNew) {
    await fetch(`${sb}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`, {
      method: 'DELETE',
      headers: sbHeaders,
    }).catch(() => {});
    await deleteUnconfirmedOrderFopCashEntries(orderId, sb, sbHeaders).catch(() => {});
    await deleteOrderSashaManagerCashEntries(orderId, sb, sbHeaders).catch(() => {});
    return;
  }

  if (rollbackOrder?.id) {
    await fetch(`${sb}/rest/v1/orders?id=eq.${encodeURIComponent(rollbackOrder.id)}`, {
      method: 'PATCH',
      headers: sbHeaders,
      body: JSON.stringify(rollbackOrder),
    }).catch(() => {});
    await syncOrderFopCashEntries(rollbackOrder, sb, sbHeaders).catch(() => {});
    await syncOrderSashaManagerCashEntries(rollbackOrder, sb, sbHeaders).catch(() => {});
  }
}

async function syncOrderFopCashEntries(order, sb, sbHeaders) {
  await deleteUnconfirmedOrderFopCashEntries(order?.id, sb, sbHeaders);
  if (!order?.id || order?.is_cancelled || !order?.in_work) return [];
  const entries = buildOrderDerivedCashEntries(order);
  if (!entries.length) return [];
  await fetch(`${sb}/rest/v1/cash_log?on_conflict=fop_source_key`, {
    method: 'POST',
    headers: {
      ...sbHeaders,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(entries),
  });
  return [];
}

function getOrderSourcePrefixes(orderId, suffix = '*') {
  if (!orderId) return [];
  const safeSuffix = suffix || '*';
  return [
    `order:${orderId}:${safeSuffix}`,
    `order: ${orderId}:${safeSuffix}`,
  ];
}

async function deleteUnconfirmedOrderFopCashEntries(orderId, sb, sbHeaders) {
  if (!orderId) return;
  const prefixes = [
    ...getOrderSourcePrefixes(orderId),
    `order:${orderId}|*`,
  ];
  for (const sourcePrefix of prefixes) {
    await fetch(
      `${sb}/rest/v1/cash_log?cash_account=eq.fop&fop_confirmed=eq.false&fop_source_key=like.${encodeURIComponent(sourcePrefix)}`,
      { method: 'DELETE', headers: sbHeaders }
    );
    await fetch(
      `${sb}/rest/v1/cash_log?cash_account=eq.cash&fop_confirmed=eq.false&fop_source_key=like.${encodeURIComponent(sourcePrefix)}`,
      { method: 'DELETE', headers: sbHeaders }
    );
  }
}

async function deleteOrderSashaManagerCashEntries(orderId, sb, sbHeaders) {
  return [];
}

async function syncOrderSashaManagerCashEntries(order, sb, sbHeaders) {
  return [];
}

function buildOrderSashaManagerCashEntries(order) {
  return [];
}

function buildOrderFopCashEntries(order) {
  return [];
}

function normalizeCashPaymentMethod(method) {
  const value = String(method || '').trim();
  if (value === 'Наличка') return '🪙 Наличка';
  return value;
}

async function canAccessWorker(targetWorkerName, session, sb, sbHeaders) {
  if (!targetWorkerName) return false;
  if (session.role === 'owner') return true;
  if (session.workerName === targetWorkerName) return true;
  const [sessionWorker, targetWorker] = await Promise.all([
    findWorkerByIdentity(session.workerName, sb, sbHeaders),
    findWorkerByIdentity(targetWorkerName, sb, sbHeaders),
  ]);
  if (sessionWorker && targetWorker && normalizeWorkerIdentityText(sessionWorker.name) === normalizeWorkerIdentityText(targetWorker.name)) {
    return true;
  }
  if (session.role === 'manager') {
    const targetWorkerRow = targetWorker || await getWorkerByName(targetWorkerName, sb, sbHeaders);
    return targetWorkerRow?.system_role === 'manager';
  }
  if (session.role !== 'senior' && session.role !== 'extra') return false;

  const workerRow = sessionWorker || await getWorkerByName(session.workerName, sb, sbHeaders);
  if (workerRow?.assistant === targetWorkerName) return true;
  if (targetWorker && workerRow?.assistant && workerIdentityMatchesLabel(targetWorker, workerRow.assistant)) return true;

  const relatedAssistants = await getAccessibleAssistantsForLead(session.workerName, sb, sbHeaders);
  if (relatedAssistants.has(targetWorkerName)) return true;
  if (targetWorker) {
    return [...relatedAssistants].some(name => workerIdentityMatchesLabel(targetWorker, name));
  }
  return false;
}

async function canManageSalaryEntryForOrder(orderId, session, sb, sbHeaders) {
  if (!orderId || session.role !== 'senior' && session.role !== 'extra') return false;
  const syntheticOrderIds = new Set(['Выход в работу', 'Ставка за день']);
  if (syntheticOrderIds.has(orderId) || String(orderId).startsWith('Выплата')) return false;

  const order = await getOrderById(orderId, sb, sbHeaders);
  if (!order) return false;

  return (await isOwnOrderForSession(order, session, sb, sbHeaders)) || (order.in_work && !order.is_cancelled);
}

async function getAccessibleAssistantsForLead(workerName, sb, sbHeaders) {
  if (!workerName) return new Set();

  const url = `${sb}/rest/v1/orders?select=responsible,assistant,rework_data,is_cancelled&limit=10000`;
  const res = await fetch(url, { headers: sbHeaders });
  const rows = await res.json().catch(() => []);
  const assistants = new Set();

  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.is_cancelled) continue;
    if (row?.responsible === workerName && row?.assistant) {
      assistants.add(row.assistant);
    }
    const reworkAssistant = row?.rework_data?.assistant;
    if (row?.rework_data?.responsible === workerName && reworkAssistant) {
      assistants.add(reworkAssistant);
    }
  }

  return assistants;
}

async function sha256(message) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function makeToken(role, workerName, secret) {
  const nameB64 = btoa(unescape(encodeURIComponent(workerName || '')));
  const hash = await sha256(role + '.' + nameB64 + '.' + secret);
  return role + '.' + nameB64 + '.' + hash;
}

async function verifyToken(token, secret) {
  if (!token) return null;
  const parts = token.split('.');

  if (parts.length === 2) {
    const [role, hash] = parts;
    const validRoles = ['owner', 'manager', 'senior', 'junior', 'extra'];
    if (!validRoles.includes(role)) return null;
    const expected = await sha256(role + '.' + secret);
    if (hash !== expected) return null;
    return { role, workerName: '' };
  }

  if (parts.length === 3) {
    const [role, nameB64, hash] = parts;
    const validRoles = ['owner', 'manager', 'senior', 'junior', 'extra'];
    if (!validRoles.includes(role)) return null;
    const expected = await sha256(role + '.' + nameB64 + '.' + secret);
    if (hash !== expected) return null;
    const workerName = decodeURIComponent(escape(atob(nameB64)));
    return { role, workerName };
  }

  return null;
}
