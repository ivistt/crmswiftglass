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
    const liveWorker = await getWorkerByName(session.workerName, sb, sbHeaders).catch(() => null);
    if (liveWorker?.system_role) {
      session.role = liveWorker.system_role;
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

    // ── /api/payment-methods ─────────────────────────────────
    if (url.pathname === '/api/payment-methods') {
      if (request.method === 'GET') {
        const res = await fetch(
          `${sb}/rest/v1/ref_payment_methods?active=eq.true&order=sort_order.asc,label.asc`,
          { headers: sbHeaders }
        );
        const rows = await res.json().catch(() => []);
        return Response.json(Array.isArray(rows) ? rows : [], { headers: cors });
      }

      if (request.method === 'POST') {
        if (authedRole !== 'owner') {
          return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
        }
        const body = await request.json().catch(() => ({}));
        const workerId = body?.worker_id === null || body?.worker_id === undefined
          ? null
          : String(body.worker_id || '').trim();
        const payload = {
          label: String(body?.label || '').trim(),
          method_type: String(body?.method_type || '').trim().toLowerCase(),
          worker_id: workerId || null,
          worker_name: body?.worker_name === null || body?.worker_name === undefined ? null : String(body.worker_name || '').trim(),
          requires_confirmation: body?.requires_confirmation === true,
          active: body?.active !== false,
          sort_order: Number(body?.sort_order) || 0,
          updated_at: new Date().toISOString(),
        };
        if (!payload.label) return Response.json({ ok: false, error: 'label required' }, { status: 400, headers: cors });
        if (!['cash', 'card', 'fop'].includes(payload.method_type)) {
          return Response.json({ ok: false, error: 'Invalid method_type' }, { status: 400, headers: cors });
        }
        if (payload.method_type === 'cash') {
          payload.worker_id = null;
          payload.worker_name = null;
          payload.requires_confirmation = false;
        } else {
          if (payload.worker_id && !payload.worker_name) {
            const worker = await getWorkerById(payload.worker_id, sb, sbHeaders);
            payload.worker_name = String(worker?.name || '').trim();
          }
          if (!payload.worker_name) return Response.json({ ok: false, error: 'worker_name required' }, { status: 400, headers: cors });
          payload.requires_confirmation = true;
        }
        const res = await fetch(`${sb}/rest/v1/ref_payment_methods`, {
          method: 'POST',
          headers: sbHeaders,
          body: JSON.stringify(payload),
        });
        const rows = await res.json().catch(() => []);
        if (!res.ok) return Response.json({ ok: false, error: Array.isArray(rows) ? 'Insert failed' : (rows?.message || rows?.error || 'Insert failed') }, { status: 400, headers: cors });
        return Response.json(Array.isArray(rows) ? rows[0] : null, { headers: cors });
      }
    }

    if (url.pathname.startsWith('/api/payment-methods/') && request.method === 'PATCH') {
      if (authedRole !== 'owner') {
        return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
      }
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const body = await request.json().catch(() => ({}));
      const patch = {};
      if (Object.prototype.hasOwnProperty.call(body, 'label')) patch.label = String(body.label || '').trim();
      if (Object.prototype.hasOwnProperty.call(body, 'method_type')) patch.method_type = String(body.method_type || '').trim().toLowerCase();
      if (Object.prototype.hasOwnProperty.call(body, 'worker_id')) {
        const workerId = body.worker_id === null ? null : String(body.worker_id || '').trim();
        patch.worker_id = workerId || null;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'worker_name')) patch.worker_name = body.worker_name === null ? null : String(body.worker_name || '').trim();
      if (Object.prototype.hasOwnProperty.call(body, 'active')) patch.active = body.active !== false;
      if (Object.prototype.hasOwnProperty.call(body, 'sort_order')) patch.sort_order = Number(body.sort_order) || 0;

      if (patch.method_type && !['cash', 'card', 'fop'].includes(patch.method_type)) {
        return Response.json({ ok: false, error: 'Invalid method_type' }, { status: 400, headers: cors });
      }
      patch.updated_at = new Date().toISOString();

      const currentRes = await fetch(`${sb}/rest/v1/ref_payment_methods?id=eq.${encodeURIComponent(id)}&limit=1`, { headers: sbHeaders });
      const currentRows = await currentRes.json().catch(() => []);
      const current = Array.isArray(currentRows) ? currentRows[0] : null;
      if (!current) return Response.json({ ok: false, error: 'Not found' }, { status: 404, headers: cors });

      const nextType = patch.method_type || String(current.method_type || '').trim().toLowerCase();
      if (nextType === 'cash') {
        patch.worker_id = null;
        patch.worker_name = null;
        patch.requires_confirmation = false;
      } else {
        if (patch.worker_id && !patch.worker_name) {
          const worker = await getWorkerById(patch.worker_id, sb, sbHeaders);
          patch.worker_name = String(worker?.name || '').trim();
        }
        const nextWorker = (Object.prototype.hasOwnProperty.call(patch, 'worker_name') ? patch.worker_name : current.worker_name) || '';
        if (!String(nextWorker || '').trim()) {
          return Response.json({ ok: false, error: 'worker_name required' }, { status: 400, headers: cors });
        }
        patch.requires_confirmation = true;
      }

      const res = await fetch(`${sb}/rest/v1/ref_payment_methods?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify(patch),
      });
      const rows = await res.json().catch(() => []);
      if (!res.ok) return Response.json({ ok: false, error: Array.isArray(rows) ? 'Update failed' : (rows?.message || rows?.error || 'Update failed') }, { status: 400, headers: cors });
      return Response.json(Array.isArray(rows) ? rows[0] : null, { headers: cors });
    }

    if (url.pathname.startsWith('/api/payment-methods/') && request.method === 'DELETE') {
      if (authedRole !== 'owner') {
        return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
      }
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const res = await fetch(`${sb}/rest/v1/ref_payment_methods?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({ active: false, updated_at: new Date().toISOString() }),
      });
      const rows = await res.json().catch(() => []);
      if (!res.ok) return Response.json({ ok: false, error: Array.isArray(rows) ? 'Delete failed' : (rows?.message || rows?.error || 'Delete failed') }, { status: 400, headers: cors });
      return Response.json({ ok: true }, { headers: cors });
    }

    // ── /api/orders ──────────────────────────────────────────
    if (url.pathname === '/api/orders') {
      if (request.method === 'GET') {
        const data = await fetchOrdersForSession(session, sb, sbHeaders);
        return Response.json(data, { headers: cors });
      }

      if (request.method === 'POST') {
        if (authedRole !== 'owner' && authedRole !== 'manager' && !workerHasPermission(liveWorker, 'orders_create')) {
          return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
        }

        const body = await request.json().catch(() => ({}));
        const data = await insertNewOrderWithMonotonicId(body, sb, sbHeaders);
        if (Array.isArray(data) && data[0]) {
          await syncOrderFopCashEntries(data[0], sb, sbHeaders);
          await syncOrderSashaManagerCashEntries(data[0], sb, sbHeaders);
          await maybeNotifyOrderTransitions(null, data[0], sb, sbHeaders, env);
        }
        return Response.json(data, { headers: cors });
      }
    }

    if (url.pathname === '/api/orders/save-with-cash' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const isNew = body.is_new === true;
      const orderBody = body.order || {};
      const rollbackOrder = body.rollback_order || null;
      const cashEntries = Array.isArray(body.cash_entries) ? body.cash_entries : [];
      const syncPaymentTypes = normalizeOrderCashSyncPaymentTypes(body.sync_payment_types);
      const financeDebug = [];
      const canCreateOrders = authedRole === 'owner' || authedRole === 'manager' || workerHasPermission(liveWorker, 'orders_create');

      if (isNew && !canCreateOrders) {
        return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
      }
      if (!isNew && authedRole === 'junior') {
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
        if (savedOrder && previousOrder) {
          savedOrder = { ...previousOrder, ...savedOrder };
        }
        if (!savedOrder) {
          throw new Error('Order was not saved');
        }

        for (const rawEntry of cashEntries) {
          const cashEntry = normalizeOrderSaveCashEntry(rawEntry);
          if (!cashEntry) continue;
          if (!(await canCreateOrderCashEntry(cashEntry, rawEntry, session, sb, sbHeaders))) {
            throw new Error('Forbidden cash entry');
          }

          const hasSourceKey = !!getCashLedgerSourceKey(cashEntry);
          const cashRes = await fetch(`${sb}/rest/v1/cash_log${hasSourceKey ? '?on_conflict=source_key' : ''}`, {
            method: 'POST',
            headers: hasSourceKey ? {
              ...sbHeaders,
              Prefer: 'resolution=merge-duplicates,return=representation',
            } : sbHeaders,
            body: JSON.stringify(cashEntry),
          });
          if (!cashRes.ok) {
            throw new Error(await cashRes.text());
          }
          const cashRows = await cashRes.json();
          if (Array.isArray(cashRows) && cashRows[0]) savedCashEntries.push(cashRows[0]);
        }

        await syncOrderFopCashEntries(savedOrder, sb, sbHeaders, { paymentTypes: syncPaymentTypes, debug: financeDebug });
        const sashaCashEntries = await syncOrderSashaManagerCashEntries(savedOrder, sb, sbHeaders);
        savedCashEntries.push(...sashaCashEntries);
        await maybeNotifyOrderTransitions(previousOrder, savedOrder, sb, sbHeaders, env);
        return Response.json({ order: savedOrder, cash_entries: savedCashEntries, finance_debug: financeDebug }, { headers: cors });
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
            const currentWorker = await findWorkerByIdentity(session.workerName, sb, sbHeaders);
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
            await maybeNotifyOrderTransitions(previousOrder, data[0], sb, sbHeaders, env);
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
        if (authedRole !== 'owner' && authedRole !== 'manager' && !workerHasPermission(liveWorker, 'clients_view')) {
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
      const parts = url.pathname.split('/').filter(Boolean);
      const id = decodeURIComponent(parts[2] || '');

      if (parts[3] === 'client-copy-fields' && request.method === 'PATCH') {
        const targetWorker = await getWorkerById(id, sb, sbHeaders);
        if (!targetWorker) return Response.json({ ok: false, error: 'Not found' }, { status: 404, headers: cors });
        const isSelf = String(targetWorker.name || '').trim() === String(session.workerName || '').trim();
        if (authedRole !== 'owner' && !(isSelf && workerHasPermission(liveWorker, 'action_panel_client_data'))) {
          return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors });
        }

        const body = await request.json().catch(() => ({}));
        const clientCopyFields = normalizeWorkerClientCopyFields(body.clientCopyFields || body.client_copy_fields || null);
        const noteMeta = parseWorkerNoteMeta(targetWorker.note || '');
        const note = buildWorkerNoteWithMeta({
          note: noteMeta.note,
          permissions: noteMeta.permissions || {},
          telegramNick: noteMeta.telegramNick || '',
          orderCardLayout: noteMeta.orderCardLayout || null,
          clientCopyFields,
        });
        const res = await fetch(`${sb}/rest/v1/workers?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: sbHeaders,
          body: JSON.stringify({ note }),
        });
        const data = await res.json();
        return Response.json(data, { headers: cors });
      }

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
          if (!body.worker_id && body.worker_name) {
            const worker = await getWorkerByName(body.worker_name, sb, sbHeaders);
            if (worker?.id) body.worker_id = worker.id;
          }
          if (isAttendanceSalaryBody(body)) {
            body.date = String(body.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
            const existingAttendance = await getActiveAttendanceSalary(body.worker_name, body.date, sb, sbHeaders);
            if (existingAttendance) {
              return Response.json([existingAttendance], { headers: cors });
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

        const body = await request.json();
        if (!body.worker_id && body.worker_name) {
          const worker = await getWorkerByName(body.worker_name, sb, sbHeaders);
          if (worker?.id) body.worker_id = worker.id;
        }
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

        if (isAttendanceSalaryBody(body)) {
          body.date = String(body.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
          const existingAttendance = await getActiveAttendanceSalary(body.worker_name, body.date, sb, sbHeaders);
          if (existingAttendance) {
            return Response.json([existingAttendance], { headers: cors });
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
          if (body.amount !== undefined && Number(body.amount) === 0 && authedRole !== 'owner') {
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

        if (authedRole === 'owner' && body.amount !== undefined) {
          const correction = await createSalaryCorrectionRow(salaryRowForLock, Number(body.amount) || 0, body.comment, session, sb, sbHeaders);
          return Response.json(correction, { headers: cors });
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
          const data = await createSalaryReversalRow(salaryRow, session, sb, sbHeaders, 'Отмена выхода в работу');
          return Response.json({ ok: true, reversal: data }, { headers: cors });
        }

        if (authedRole === 'junior') {
          const id = url.pathname.split('/').pop();
          const salaryRow = await getSalaryById(id, sb, sbHeaders);
          const isOwnAttendance = salaryRow && salaryRow.worker_name === session.workerName && salaryRow.order_id === 'Выход в работу';
          if (!isOwnAttendance) {
            return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
          }
          const data = await createSalaryReversalRow(salaryRow, session, sb, sbHeaders, 'Отмена выхода в работу');
          return Response.json({ ok: true, reversal: data }, { headers: cors });
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

        const data = await createSalaryReversalRow(salaryRow, session, sb, sbHeaders, 'Отмена записи ЗП');
        return Response.json({ ok: true, reversal: data }, { headers: cors });
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
    if (url.pathname === '/api/cash/summary' && request.method === 'GET') {
      const workerName = String(url.searchParams.get('worker') || '').trim();
      if (!workerName && authedRole !== 'owner') {
        return Response.json({ error: 'worker required' }, { status: 400, headers: cors });
      }
      if (workerName && !(await canAccessWorker(workerName, session, sb, sbHeaders))) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }

      const res = await fetch(`${sb}/rest/v1/rpc/crm_cash_summary`, {
        method: 'POST',
        headers: sbHeaders,
        body: '{}',
      });
      let data = await res.json().catch(() => null);
      if (!res.ok) {
        return Response.json(data || { error: 'Cash summary unavailable' }, {
          status: res.status,
          headers: { ...cors, 'Cache-Control': 'no-store' },
        });
      }
      if (workerName && data && typeof data === 'object') {
        const targetWorker = await findWorkerByIdentity(workerName, sb, sbHeaders);
        const targetId = String(targetWorker?.id || '').trim();
        const labels = new Set([workerName, targetWorker?.name, targetWorker?.alias]
          .map(value => String(value || '').trim().toLowerCase())
          .filter(Boolean));
        const rows = (Array.isArray(data.workers) ? data.workers : []).filter(row => {
          const rowId = String(row?.worker_id || '').trim();
          const rowName = String(row?.worker_name || '').trim().toLowerCase();
          return (targetId && rowId === targetId) || (!!rowName && labels.has(rowName));
        });
        const sum = field => rows.reduce((total, row) => total + (Number(row?.[field]) || 0), 0);
        data = {
          generated_at: data.generated_at || new Date().toISOString(),
          workers: rows,
          total_confirmed_uah: sum('confirmed_uah'),
          total_confirmed_cash_uah: sum('confirmed_cash_uah'),
          total_confirmed_fop_uah: sum('confirmed_fop_uah'),
          total_pending_uah: sum('pending_uah'),
          total_usd: sum('usd'),
          total_expenses: sum('expense_total'),
          entries_count: sum('entries_count'),
        };
      }
      return Response.json(data || {}, {
        headers: { ...cors, 'Cache-Control': 'no-store' },
      });
    }

    if (url.pathname === '/api/cash' && request.method === 'GET') {
      const workerName = url.searchParams.get('worker');
      const deletedMode = url.searchParams.get('deleted') || 'active';
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 1000));
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
      const targetWorkerId = String(targetWorker?.id || '').trim();
      if (targetWorkerId) {
        const encodedId = encodeURIComponent(targetWorkerId);
        orParts.push(`worker_id.eq.${encodedId}`);
        orParts.push(`cash_owner_id.eq.${encodedId}`);
      }
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
        `${sb}/rest/v1/cash_log?or=(${orParts.join(',')})${deletedQuery}&order=created_at.desc&offset=${offset}&limit=${limit}`,
        { headers: sbHeaders }
      );
      const data = await res.json();
      return Response.json(data, { headers: cors });
    }

    if (url.pathname === '/api/cash/all' && request.method === 'GET') {
      const deletedMode = url.searchParams.get('deleted') || 'active';
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 1000));
      if (authedRole !== 'owner') {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }

      const deletedQuery = deletedMode === 'only'
        ? 'deleted_at=not.is.null&'
        : deletedMode === 'all'
          ? ''
          : 'deleted_at=is.null&';
      const res = await fetch(`${sb}/rest/v1/cash_log?${deletedQuery}order=created_at.desc&offset=${offset}&limit=${limit}`, { headers: sbHeaders });
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
      if (body.manual_payment === true && authedRole !== 'owner') {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }
      if (cashAccount === 'fop' || isConfirmableCardCashMethod(getPaymentMethodFromCashSourceKey(getCashLedgerSourceKey(body)))) {
        body.fop_confirmed = !!body.fop_confirmed;
        body.fop_date = body.fop_date ? String(body.fop_date).slice(0, 10) : null;
      } else {
        body.fop_confirmed = false;
        body.fop_source_key = null;
        body.fop_date = null;
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

      if (!body.worker_id && body.worker_name) {
        const worker = await getWorkerByName(body.worker_name, sb, sbHeaders);
        if (worker?.id) body.worker_id = worker.id;
      }
      if (!body.cash_owner_id && body.cash_owner) {
        const worker = await getWorkerByName(body.cash_owner, sb, sbHeaders);
        if (worker?.id) body.cash_owner_id = worker.id;
      }
      if (!body.approval_by_id && body.approval_by) {
        const worker = await getWorkerByName(body.approval_by, sb, sbHeaders);
        if (worker?.id) body.approval_by_id = worker.id;
      }

      Object.assign(body, buildStructuredCashFields(body));
      const sourceKey = getCashLedgerSourceKey(body);
      const cashPayload = {
        worker_name: String(body.worker_name || '').trim(),
        worker_id: body.worker_id || null,
        amount: Number(body.amount) || 0,
        comment: String(body.comment || '').trim(),
        cash_account: String(body.cash_account || 'cash').trim().toLowerCase(),
        fop_confirmed: !!body.fop_confirmed,
        fop_source_key: body.fop_source_key ? String(body.fop_source_key) : (sourceKey || null),
        fop_date: body.fop_date ? String(body.fop_date).slice(0, 10) : null,
        manual_payment: body.manual_payment === true,
        manual_payment_method: body.manual_payment_method ? String(body.manual_payment_method).trim() : null,
        cash_owner: body.cash_owner ? String(body.cash_owner).trim() : null,
        cash_owner_id: body.cash_owner_id || null,
        account_type: body.account_type ? String(body.account_type).trim().toLowerCase() : null,
        payment_type: body.payment_type ? String(body.payment_type).trim() : null,
        payment_method: body.payment_method ? String(body.payment_method).trim() : null,
        approval_status: body.approval_status ? String(body.approval_status).trim() : null,
        approval_by: body.approval_by ? String(body.approval_by).trim() : null,
        approval_by_id: body.approval_by_id || null,
        source_type: body.source_type ? String(body.source_type).trim() : null,
        source_id: body.source_id ? String(body.source_id).trim() : null,
        order_id: body.order_id ? String(body.order_id).trim() : null,
        expense_category: body.expense_category ? String(body.expense_category).trim() : null,
        warehouse_name: body.warehouse_name ? String(body.warehouse_name).trim() : null,
        source_key: sourceKey || null,
        ledger_status: 'posted',
        reversal_of: body.reversal_of ? String(body.reversal_of).trim() : null,
        reversal_reason: body.reversal_reason ? String(body.reversal_reason).trim() : null,
        correction_of: body.correction_of ? String(body.correction_of).trim() : null,
        correction_reason: body.correction_reason ? String(body.correction_reason).trim() : null,
      };

      const res = await fetch(`${sb}/rest/v1/cash_log${sourceKey ? '?on_conflict=source_key' : ''}`, {
        method: 'POST',
        headers: sourceKey ? {
          ...sbHeaders,
          Prefer: 'resolution=merge-duplicates,return=representation',
        } : sbHeaders,
        body: JSON.stringify(cashPayload),
      });
      const data = await res.json();
      return Response.json(data, { status: res.status, headers: cors });
    }

    if (url.pathname.startsWith('/api/cash/') && url.pathname.endsWith('/reverse') && request.method === 'POST') {
      if (authedRole !== 'owner') {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }

      const parts = url.pathname.split('/').filter(Boolean);
      const id = decodeURIComponent(parts[2] || '');
      const body = await request.json().catch(() => ({}));
      const reason = String(body?.reason || '').trim();
      if (!id) {
        return Response.json({ error: 'Cash entry id required' }, { status: 400, headers: cors });
      }
      if (!reason) {
        return Response.json({ error: 'Reason required' }, { status: 400, headers: cors });
      }

      const cashRow = await getCashById(id, sb, sbHeaders);
      if (!cashRow) {
        return Response.json({ error: 'Cash entry not found' }, { status: 404, headers: cors });
      }
      const ledgerStatus = String(cashRow?.ledger_status || 'posted');
      if (ledgerStatus === 'voided' || ledgerStatus === 'reversed' || ledgerStatus === 'corrected') {
        return Response.json({ error: 'Cash entry already reversed' }, { status: 400, headers: cors });
      }
      if (String(cashRow?.source_type || '') === 'reversal' || String(cashRow?.reversal_of || '').trim()) {
        return Response.json({ error: 'Reversal entry cannot be reversed' }, { status: 400, headers: cors });
      }

      const now = new Date().toISOString();
      const currencyCorrectionComment = buildReversedCurrencyCashComment(cashRow.comment, reason);
      const reversalPayload = {
        worker_name: cashRow.worker_name,
        worker_id: cashRow.worker_id || null,
        amount: -(Number(cashRow.amount) || 0),
        comment: currencyCorrectionComment || `Отмена: ${String(cashRow.comment || '').trim()} — ${reason}`,
        cash_account: String(cashRow.cash_account || cashRow.account_type || 'cash').trim().toLowerCase(),
        fop_confirmed: cashRow.fop_confirmed === true,
        fop_source_key: null,
        fop_date: cashRow.fop_date || null,
        manual_payment: false,
        manual_payment_method: null,
        cash_owner: cashRow.cash_owner || cashRow.worker_name || null,
        cash_owner_id: cashRow.cash_owner_id || cashRow.worker_id || null,
        account_type: cashRow.account_type || cashRow.cash_account || 'cash',
        payment_type: cashRow.payment_type || 'correction',
        payment_method: cashRow.payment_method || null,
        approval_status: 'not_required',
        approval_by: null,
        approval_by_id: null,
        source_type: 'reversal',
        source_id: id,
        order_id: cashRow.order_id || null,
        expense_category: cashRow.expense_category || null,
        warehouse_name: cashRow.warehouse_name || null,
        source_key: `reversal:${id}`,
        ledger_status: 'posted',
        reversal_of: id,
        reversal_reason: reason,
      };

      const reverseRes = await fetch(`${sb}/rest/v1/cash_log?on_conflict=source_key`, {
        method: 'POST',
        headers: {
          ...sbHeaders,
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(reversalPayload),
      });
      const reverseData = await reverseRes.json().catch(() => []);
      if (!reverseRes.ok) {
        return Response.json({ error: reverseData?.message || 'Failed to create reversal', details: reverseData }, { status: reverseRes.status || 400, headers: cors });
      }

      const voidRes = await fetch(`${sb}/rest/v1/cash_log?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({
          ledger_status: 'reversed',
          reversal_reason: reason,
          reversed_by: session.workerName || null,
          reversed_at: now,
        }),
      });
      const voidData = await voidRes.json().catch(() => []);
      if (!voidRes.ok) {
        return Response.json({ error: voidData?.message || 'Failed to mark original entry as reversed', details: voidData }, { status: voidRes.status || 400, headers: cors });
      }

      return Response.json({ reversal: Array.isArray(reverseData) ? reverseData[0] : reverseData, original: Array.isArray(voidData) ? voidData[0] : voidData }, { headers: cors });
    }

    if (url.pathname.startsWith('/api/cash/') && url.pathname.endsWith('/correct') && request.method === 'POST') {
      if (authedRole !== 'owner') {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }

      const parts = url.pathname.split('/').filter(Boolean);
      const id = decodeURIComponent(parts[2] || '');
      const body = await request.json().catch(() => ({}));
      const reason = String(body?.reason || body?.comment || '').trim();
      if (!id) {
        return Response.json({ error: 'Cash entry id required' }, { status: 400, headers: cors });
      }
      if (!reason) {
        return Response.json({ error: 'Reason required' }, { status: 400, headers: cors });
      }

      const cashRow = await getCashById(id, sb, sbHeaders);
      if (!cashRow) {
        return Response.json({ error: 'Cash entry not found' }, { status: 404, headers: cors });
      }
      const ledgerStatus = String(cashRow?.ledger_status || 'posted');
      if (ledgerStatus === 'voided' || ledgerStatus === 'reversed' || ledgerStatus === 'corrected') {
        return Response.json({ error: 'Cash entry already corrected' }, { status: 400, headers: cors });
      }
      if (String(cashRow?.source_type || '') === 'reversal' || String(cashRow?.reversal_of || '').trim()) {
        return Response.json({ error: 'Reversal entry cannot be corrected' }, { status: 400, headers: cors });
      }
      if (String(cashRow?.source_type || '') === 'correction' || String(cashRow?.correction_of || '').trim()) {
        return Response.json({ error: 'Correction entry cannot be corrected' }, { status: 400, headers: cors });
      }

      const oldAmount = Number(cashRow.amount) || 0;
      const nextAmount = Number(body.amount) || 0;
      const oldOwner = String(cashRow.cash_owner || cashRow.worker_name || '').trim();
      const nextOwner = String(body.worker_name || body.cash_owner || oldOwner).trim();
      const oldAccount = String(cashRow.account_type || cashRow.cash_account || 'cash').trim().toLowerCase();
      const nextAccount = String(body.account_type || body.cash_account || oldAccount || 'cash').trim().toLowerCase();
      const nextComment = String(body.comment || '').trim() || reason;
      const expenseCategory = String(body.expense_category || '').trim() || null;
      const warehouseName = String(body.warehouse_name || '').trim() || null;

      if (!nextOwner) {
        return Response.json({ error: 'worker required' }, { status: 400, headers: cors });
      }
      if (!nextAmount) {
        return Response.json({ error: 'Amount required' }, { status: 400, headers: cors });
      }
      if (!['cash', 'fop'].includes(nextAccount)) {
        return Response.json({ error: 'Invalid cash account' }, { status: 400, headers: cors });
      }

      const nextWorker = await findWorkerByIdentity(nextOwner, sb, sbHeaders);
      const correctionStamp = Date.now();
      const ownerChanged = normalizeWorkerIdentityText(oldOwner) !== normalizeWorkerIdentityText(nextOwner) || oldAccount !== nextAccount;
      const correctionRows = [];
      const makeCorrectionRow = (amount, owner, account, keySuffix, comment) => {
        const row = {
          worker_name: owner,
          worker_id: keySuffix === 'new' || keySuffix === 'delta' ? (nextWorker?.id || null) : (cashRow.worker_id || null),
          amount,
          comment,
          cash_account: account,
          fop_confirmed: true,
          fop_source_key: null,
          fop_date: cashRow.fop_date || null,
          manual_payment: false,
          manual_payment_method: null,
          cash_owner: owner,
          cash_owner_id: keySuffix === 'new' || keySuffix === 'delta' ? (nextWorker?.id || null) : (cashRow.cash_owner_id || cashRow.worker_id || null),
          account_type: account,
          payment_type: 'correction',
          payment_method: cashRow.payment_method || null,
          approval_status: 'not_required',
          approval_by: null,
          approval_by_id: null,
          source_type: 'correction',
          source_id: id,
          order_id: cashRow.order_id || null,
          expense_category: expenseCategory,
          warehouse_name: warehouseName,
          source_key: `correction:${id}:${correctionStamp}:${keySuffix}`,
          ledger_status: 'posted',
          correction_of: id,
          correction_reason: reason,
        };
        Object.assign(row, buildStructuredCashFields(row));
        return row;
      };

      if (ownerChanged) {
        correctionRows.push(makeCorrectionRow(
          -oldAmount,
          oldOwner,
          oldAccount,
          'old',
          `Коррекция: убрать старую запись ${oldAmount.toLocaleString('ru')} ₴. ${reason}`
        ));
        correctionRows.push(makeCorrectionRow(
          nextAmount,
          nextOwner,
          nextAccount,
          'new',
          `Коррекция: новая запись ${nextAmount.toLocaleString('ru')} ₴. ${nextComment}`
        ));
      } else {
        const delta = nextAmount - oldAmount;
        if (!delta) {
          const metadataPatch = {
            comment: nextComment,
            source_type: String(body.source_type || cashRow.source_type || '').trim() || undefined,
            expense_category: expenseCategory,
            warehouse_name: warehouseName,
            correction_reason: reason,
          };
          Object.assign(metadataPatch, buildStructuredCashFields({ ...cashRow, ...metadataPatch }));
          const metadataRes = await fetch(`${sb}/rest/v1/cash_log?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: sbHeaders,
            body: JSON.stringify(metadataPatch),
          });
          const metadataData = await metadataRes.json().catch(() => []);
          if (!metadataRes.ok) {
            return Response.json({ error: metadataData?.message || 'Failed to update cash entry metadata', details: metadataData }, { status: metadataRes.status || 400, headers: cors });
          }
          return Response.json({ corrections: [], original: Array.isArray(metadataData) ? metadataData[0] : metadataData }, { headers: cors });
        }
        correctionRows.push(makeCorrectionRow(
          delta,
          nextOwner,
          nextAccount,
          'delta',
          `Коррекция: ${oldAmount.toLocaleString('ru')} → ${nextAmount.toLocaleString('ru')} ₴. ${nextComment}`
        ));
      }

      const correctionRes = await fetch(`${sb}/rest/v1/cash_log?on_conflict=source_key`, {
        method: 'POST',
        headers: {
          ...sbHeaders,
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(correctionRows),
      });
      const correctionData = await correctionRes.json().catch(() => []);
      if (!correctionRes.ok) {
        return Response.json({ error: correctionData?.message || 'Failed to create correction', details: correctionData }, { status: correctionRes.status || 400, headers: cors });
      }

      const markRes = await fetch(`${sb}/rest/v1/cash_log?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({
          ledger_status: 'corrected',
          correction_reason: reason,
        }),
      });
      const markData = await markRes.json().catch(() => []);
      if (!markRes.ok) {
        return Response.json({ error: markData?.message || 'Failed to mark original entry as corrected', details: markData }, { status: markRes.status || 400, headers: cors });
      }

      return Response.json({ corrections: correctionData, original: Array.isArray(markData) ? markData[0] : markData }, { headers: cors });
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
        if (Object.prototype.hasOwnProperty.call(body, 'deleted_at')) {
          patch.deleted_at = body.deleted_at ? String(body.deleted_at) : null;
        }
        if (Object.prototype.hasOwnProperty.call(body, 'deleted_by')) {
          patch.deleted_by = body.deleted_by ? String(body.deleted_by) : null;
        }
      }
      if (Object.prototype.hasOwnProperty.call(body, 'fop_confirmed')) {
        patch.fop_confirmed = !!body.fop_confirmed;
        const nextApprovalStatus = patch.fop_confirmed
          ? 'confirmed'
          : ((String(cashRow.cash_account || '').toLowerCase() === 'fop' || isConfirmableCardCashRow(cashRow)) ? 'pending' : 'not_required');
        patch.approval_status = nextApprovalStatus;
        if (nextApprovalStatus === 'confirmed') {
          patch.approval_by = String(session.workerName || '').trim() || null;
          patch.approval_by_id = sessionWorker?.id || null;
        } else if (nextApprovalStatus === 'pending') {
          patch.approval_by = String(cashRow.cash_owner || cashRow.worker_name || '').trim() || null;
          patch.approval_by_id = cashRow.cash_owner_id || cashRow.worker_id || null;
        } else {
          patch.approval_by = null;
          patch.approval_by_id = null;
        }
      }
      if (authedRole === 'owner') {
        const nextCashRow = { ...cashRow, ...patch };
        Object.assign(patch, buildStructuredCashFields(nextCashRow));
      }
      if (!Object.keys(patch).length) {
        return Response.json({ error: 'No allowed fields' }, { status: 400, headers: cors });
      }

      if (patch.fop_confirmed === true) {
        const sourceKey = getCashLedgerSourceKey(cashRow);
        if (sourceKey) {
          const dupRes = await fetch(`${sb}/rest/v1/cash_log?${cashSourceEqFilter(sourceKey)}&select=id&limit=100`, { headers: sbHeaders });
          const dupRows = await dupRes.json().catch(() => []);
          if (Array.isArray(dupRows) && dupRows.length > 1) {
            for (const row of dupRows) {
              if (String(row?.id || '') === String(id)) continue;
              await voidCashLedgerRow(row.id, `duplicate confirmed cash source: ${sourceKey}`, sb, sbHeaders);
            }
          }
        }
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
        const res = await fetch(`${sb}/rest/v1/cash_log?${cashSourceEqFilter(sourceKey)}&limit=100`, { headers: sbHeaders });
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
          await voidCashLedgerRow(row.id, `cash source removed: ${sourceKey}`, sb, sbHeaders);
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
        'ref_service_rates',
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
        if (table !== 'ref_warehouses' && table !== 'ref_dropshippers' && table !== 'ref_app_settings' && table !== 'ref_service_rates') {
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
        if (table === 'ref_service_rates') {
          if (Object.prototype.hasOwnProperty.call(body, 'service_group')) patch.service_group = String(body?.service_group || 'custom').trim() || 'custom';
          if (Object.prototype.hasOwnProperty.call(body, 'rate')) patch.rate = Number(body?.rate) || 0;
          if (Object.prototype.hasOwnProperty.call(body, 'salary_category')) patch.salary_category = String(body?.salary_category || 'custom').trim() || 'custom';
          if (Object.prototype.hasOwnProperty.call(body, 'active')) patch.active = body?.active !== false;
          if (Object.prototype.hasOwnProperty.call(body, 'sort_order')) patch.sort_order = Number(body?.sort_order) || 0;
          patch.updated_at = new Date().toISOString();
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
        if (table !== 'ref_warehouses' && table !== 'ref_dropshippers' && table !== 'ref_app_settings' && table !== 'ref_service_rates') {
          return Response.json({ error: 'Read only reference' }, { status: 400, headers: cors });
        }

        const body = await request.json().catch(() => ({}));
        const requestedSettingKey = table === 'ref_app_settings' ? String(body?.key || '').trim() : '';
        const canManageSharedGlassManufacturers = requestedSettingKey === 'glass_manufacturers'
          && workerHasPermission(liveWorker, 'action_panel_client_data');
        if (authedRole !== 'owner' && !canManageSharedGlassManufacturers) {
          return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
        }

        if (table === 'ref_app_settings') {
          const key = String(body?.key || '').trim();
          if (!key) {
            return Response.json({ error: 'Key required' }, { status: 400, headers: cors });
          }
          const rawValueJson = body?.value_json && typeof body.value_json === 'object' ? body.value_json : {};
          const valueJson = key === 'glass_manufacturers'
            ? normalizeGlassManufacturersSetting(rawValueJson)
            : rawValueJson;
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

        if (table === 'ref_service_rates') {
          const existingRes = await fetch(
            `${sb}/rest/v1/${table}?name=eq.${encodeURIComponent(name)}&limit=1`,
            { headers: sbHeaders }
          );
          const existingRows = await existingRes.json().catch(() => []);
          const payload = {
            name,
            service_group: String(body?.service_group || 'custom').trim() || 'custom',
            rate: Number(body?.rate) || 0,
            salary_category: String(body?.salary_category || body?.service_group || 'custom').trim() || 'custom',
            active: body?.active !== false,
            sort_order: Number(body?.sort_order) || 0,
          };
          if (Array.isArray(existingRows) && existingRows[0]) {
            const updateRes = await fetch(`${sb}/rest/v1/${table}?id=eq.${encodeURIComponent(existingRows[0].id)}`, {
              method: 'PATCH',
              headers: sbHeaders,
              body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() }),
            });
            const updateData = await updateRes.json().catch(() => []);
            if (!updateRes.ok) {
              const message = Array.isArray(updateData)
                ? 'Не удалось обновить ставку'
                : (updateData?.message || updateData?.error || 'Не удалось обновить ставку');
              return Response.json({ error: message }, { status: updateRes.status || 400, headers: cors });
            }
            return Response.json(updateData, { headers: cors });
          }

          const createRes = await fetch(`${sb}/rest/v1/${table}`, {
            method: 'POST',
            headers: sbHeaders,
            body: JSON.stringify(payload),
          });
          const createData = await createRes.json().catch(() => []);
          if (!createRes.ok) {
            const message = Array.isArray(createData)
              ? 'Не удалось создать ставку'
              : (createData?.message || createData?.error || 'Не удалось создать ставку');
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
      if (authedRole !== 'owner' && !workerHasPermission(liveWorker, 'car_directory_view') && !workerHasPermission(liveWorker, 'orders_create')) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }

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

      for (const order of (Array.isArray(ordersData) ? ordersData : [])) {
        if (!order || order.is_cancelled || !order.in_work) continue;
        // eslint-disable-next-line no-await-in-loop
        const derived = await buildOrderDerivedCashEntries(order, sb, sbHeaders);
        derived.forEach(entry => {
          const key = getCashLedgerSourceKey(entry);
          if (!key) return;
          sourceMap.set(key, entry);
        });
      }

      const entries = Array.from(sourceMap.values());
      if (!entries.length) {
        return Response.json({ ok: true, candidates: 0 }, { headers: cors });
      }

      const saveRes = await fetch(`${sb}/rest/v1/cash_log?on_conflict=source_key`, {
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

      const id = decodeURIComponent(url.pathname.split('/').pop() || '');
      if (!id) {
        return Response.json({ error: 'Car id required' }, { status: 400, headers: cors });
      }
      const res = await fetch(`${sb}/rest/v1/car_directory?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: sbHeaders,
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        return Response.json(
          { error: Array.isArray(data) ? 'Car delete failed' : (data?.message || data?.error || 'Car delete failed') },
          { status: res.status || 400, headers: cors }
        );
      }
      if (!Array.isArray(data) || !data.length) {
        return Response.json({ error: 'Car not found' }, { status: 404, headers: cors });
      }
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
  'responsible_worker_id',
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
  'tatu_responsible_worker_id',
  'tatu_done',
  'tatu_done_by',
  'toning',
  'toning_status',
  'toning_responsible_worker_id',
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
  'assistant_worker_id',
  'extra_assistant',
  'extra_assistant_worker_id',
  'is_cancelled',
  'deleted_at',
  'deleted_by',
  'manager',
  'manager_worker_id',
  'only_sale',
  'rework_data',
  'client_payments',
  'supplier_payments',
].join(',');

async function fetchOrdersForSession(session, sb, sbHeaders) {
  await rolloverOverdueInWorkOrdersToToday(sb, sbHeaders);
  if (session.role === 'owner' || session.role === 'manager') {
    return fetchSupabasePagedRows(`${sb}/rest/v1/orders?order=date.desc`, sbHeaders);
  }

  const currentWorker = await getWorkerByName(session.workerName, sb, sbHeaders);
  if (workerHasPermission(currentWorker, 'orders_view_all') || workerHasPermission(currentWorker, 'warehouses_view')) {
    return fetchSupabasePagedRows(
      `${sb}/rest/v1/orders?select=${SPECIALIST_ORDER_SELECT}&is_cancelled=eq.false&deleted_at=is.null&order=date.desc`,
      sbHeaders
    );
  }

  const workerName = session.workerName || '';
  const workerDropshippers = await getDropshipperNamesForWorker(workerName, sb, sbHeaders);
  const specialistFilters = [
    `and(in_work.eq.true,responsible.eq.${workerName})`,
    `and(in_work.eq.true,assistant.eq.${workerName})`,
    `and(in_work.eq.true,extra_assistant.eq.${workerName})`,
    ...workerDropshippers.map(name => `drop_shipper.eq.${name}`),
  ];
  if (workerHasSpecialServiceCapability(currentWorker, 'tatu')) specialistFilters.push('and(in_work.eq.true,tatu.gt.0)');
  if (workerHasSpecialServiceCapability(currentWorker, 'toning')) specialistFilters.push('and(in_work.eq.true,toning.gt.0)');
  const ownFilter = encodeURIComponent(`(${specialistFilters.join(',')})`);
  return fetchSupabasePagedRows(
    `${sb}/rest/v1/orders?select=${SPECIALIST_ORDER_SELECT}&is_cancelled=eq.false&deleted_at=is.null&or=${ownFilter}&order=date.desc`,
    sbHeaders
  );
}

async function fetchSupabasePagedRows(baseUrl, sbHeaders, pageSize = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const sep = baseUrl.includes('?') ? '&' : '?';
    const res = await fetch(`${baseUrl}${sep}offset=${offset}&limit=${pageSize}`, { headers: sbHeaders });
    const page = await res.json().catch(() => []);
    if (!res.ok) throw new Error(Array.isArray(page) ? 'Fetch failed' : (page?.message || page?.error || 'Fetch failed'));
    const items = Array.isArray(page) ? page : [];
    rows.push(...items);
    if (items.length < pageSize) break;
  }
  return rows;
}

function getKyivLocalDateString(offsetDays = 0) {
  const now = new Date();
  const kyivText = now.toLocaleString('sv-SE', { timeZone: 'Europe/Kiev' }).replace(' ', 'T');
  const kyivDate = new Date(kyivText);
  kyivDate.setDate(kyivDate.getDate() + Number(offsetDays || 0));
  return kyivDate.toISOString().slice(0, 10);
}

let _lastOverdueOrderRolloverDate = '';

async function rolloverOverdueInWorkOrdersToToday(sb, sbHeaders) {
  const today = getKyivLocalDateString(0);
  if (_lastOverdueOrderRolloverDate === today) return;
  const yesterday = getKyivLocalDateString(-1);
  await fetch(
    `${sb}/rest/v1/orders?date=eq.${encodeURIComponent(yesterday)}&in_work=eq.true&worker_done=eq.false&status_done=eq.false&is_cancelled=eq.false&deleted_at=is.null`,
    {
      method: 'PATCH',
      headers: sbHeaders,
      body: JSON.stringify({ date: today }),
    }
  ).catch(() => {});
  _lastOverdueOrderRolloverDate = today;
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

async function getDropshipperCashWorker(dropshipperName, sb, sbHeaders) {
  const name = String(dropshipperName || '').trim();
  if (!name) return null;
  const [dropshipperRes, workersRes] = await Promise.all([
    fetch(`${sb}/rest/v1/ref_dropshippers?select=name,worker_name,worker_id&limit=1000`, { headers: sbHeaders }),
    fetch(`${sb}/rest/v1/workers?select=id,name,alias&limit=1000`, { headers: sbHeaders }),
  ]);
  const dropshippers = ensureBuiltInDropshippers(await dropshipperRes.json().catch(() => []));
  const workers = await workersRes.json().catch(() => []);
  const row = (Array.isArray(dropshippers) ? dropshippers : []).find(item => String(item?.name || '').trim() === name);
  const linkedWorkerId = String(row?.worker_id || '').trim();
  if (linkedWorkerId) {
    return (Array.isArray(workers) ? workers : []).find(worker => String(worker?.id || '').trim() === linkedWorkerId) || null;
  }
  const linkedWorkerName = String(row?.worker_name || '').trim();
  if (linkedWorkerName) {
    return (Array.isArray(workers) ? workers : []).find(worker => String(worker?.name || '').trim() === linkedWorkerName) || null;
  }
  return (Array.isArray(workers) ? workers : []).find(worker => isDropshipperLinkedToWorkerName(name, worker)) || null;
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

function getOrderIdNumber(id) {
  const match = String(id || '').match(/SG-(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

function formatOrderId(num) {
  return 'SG-' + String(Math.max(1, Number(num) || 1)).padStart(4, '0');
}

async function getNextMonotonicOrderId(sb, sbHeaders, afterId = '') {
  const rows = await fetchSupabasePagedRows(`${sb}/rest/v1/orders?select=id`, sbHeaders);
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
    return body.worker_name === session.workerName || await canAccessWorker(body.worker_name, session, sb, sbHeaders);
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
  if (isOrderDerivedCashEntry(cashEntry) || String(cashEntry?.source_type || '') === 'order') {
    return canAddCash && (session.role === 'manager' || session.role === 'senior' || session.role === 'extra');
  }
  if (session.role === 'manager') {
    return cashEntry.worker_name === session.workerName;
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
  return !!order && !!workerName && (order.responsible === workerName || order.assistant === workerName || order.extra_assistant === workerName);
}

function canPatchSpecialServiceOnly(body, order, session = {}, currentWorker = null) {
  if (!body || !order || order.is_cancelled || !order.in_work) return false;
  const keys = Object.keys(body);
  if (!keys.length) return false;
  const tatuKeys = ['tatu_done', 'tatu_status', 'tatu_done_by'];
  const toningKeys = ['toning_done', 'toning_status', 'toning_done_by'];
  const onlyTatuKeys = keys.every(key => tatuKeys.includes(key));
  const onlyToningKeys = keys.every(key => toningKeys.includes(key));
  const tatuAssigned = getOrderAssignedSpecialist(order, 'tatu');
  const toningAssigned = getOrderAssignedSpecialist(order, 'toning');
  if (workerHasSpecialServiceCapability(currentWorker || { name: session.workerName, note: '' }, 'tatu') && onlyTatuKeys) {
    if ((tatuAssigned || getOrderAssignedSpecialistId(order, 'tatu')) && !isSessionAssignedSpecialist(order, 'tatu', session, currentWorker)) return false;
    return orderHasSpecialService(order, 'tatu');
  }
  if (workerHasSpecialServiceCapability(currentWorker || { name: session.workerName, note: '' }, 'toning') && onlyToningKeys) {
    if ((toningAssigned || getOrderAssignedSpecialistId(order, 'toning')) && !isSessionAssignedSpecialist(order, 'toning', session, currentWorker)) return false;
    return orderHasSpecialService(order, 'toning');
  }
  return false;
}

function normalizeOrderPaymentForAppendCheck(payment) {
  return {
    amount: Number(payment?.amount) || 0,
    date: String(payment?.date || '').trim(),
    method: normalizeCashPaymentMethod(payment?.method || ''),
    timestamp: String(payment?.timestamp || '').trim(),
  };
}

function assertOnlyAppendedPayments(nextPayments, prevPayments, label) {
  const next = Array.isArray(nextPayments) ? nextPayments : [];
  const prev = Array.isArray(prevPayments) ? prevPayments : [];
  if (next.length < prev.length) throw new Error(`${label}: delete forbidden`);
  for (let i = 0; i < prev.length; i += 1) {
    const a = normalizeOrderPaymentForAppendCheck(next[i]);
    const b = normalizeOrderPaymentForAppendCheck(prev[i]);
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      throw new Error(`${label}: edit forbidden`);
    }
  }
}

function sumAppendedCashPayments(nextPayments, prevPayments) {
  const next = Array.isArray(nextPayments) ? nextPayments : [];
  const prevCount = Array.isArray(prevPayments) ? prevPayments.length : 0;
  return next.slice(prevCount).reduce((sum, payment) => {
    const method = normalizeCashPaymentMethod(payment?.method || '');
    return sum + (isCashPaymentMethodForSync(method) ? (Number(payment?.amount) || 0) : 0);
  }, 0);
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
    if (patch.worker_done) {
      patch.rework_data = {
        ...(existingOrder?.rework_data && typeof existingOrder.rework_data === 'object' ? existingOrder.rework_data : {}),
        completedAt: new Date().toISOString(),
        completedBy: session.workerName || '',
      };
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'service_type')) {
    patch.service_type = String(body.service_type || '').trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'tatu_done')) {
    if (!workerHasSpecialServiceCapability(currentWorker || { name: session.workerName, note: '' }, 'tatu')) throw new Error('Forbidden');
    if ((getOrderAssignedSpecialist(existingOrder, 'tatu') || getOrderAssignedSpecialistId(existingOrder, 'tatu')) && !isSessionAssignedSpecialist(existingOrder, 'tatu', session, currentWorker)) throw new Error('Forbidden');
    if (!orderHasSpecialService(existingOrder, 'tatu')) throw new Error('Invalid special service');
    patch.tatu_done = !!body.tatu_done;
    patch.tatu_done_by = patch.tatu_done ? session.workerName : null;
    patch.tatu_status = patch.tatu_done;
  } else if (Object.prototype.hasOwnProperty.call(body, 'tatu_status')) {
    if (!workerHasSpecialServiceCapability(currentWorker || { name: session.workerName, note: '' }, 'tatu')) throw new Error('Forbidden');
    if ((getOrderAssignedSpecialist(existingOrder, 'tatu') || getOrderAssignedSpecialistId(existingOrder, 'tatu')) && !isSessionAssignedSpecialist(existingOrder, 'tatu', session, currentWorker)) throw new Error('Forbidden');
    if (!orderHasSpecialService(existingOrder, 'tatu')) throw new Error('Invalid special service');
    patch.tatu_status = !!body.tatu_status;
    patch.tatu_done = patch.tatu_status;
    patch.tatu_done_by = patch.tatu_status ? session.workerName : null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'toning_done')) {
    if (!workerHasSpecialServiceCapability(currentWorker || { name: session.workerName, note: '' }, 'toning')) throw new Error('Forbidden');
    if ((getOrderAssignedSpecialist(existingOrder, 'toning') || getOrderAssignedSpecialistId(existingOrder, 'toning')) && !isSessionAssignedSpecialist(existingOrder, 'toning', session, currentWorker)) throw new Error('Forbidden');
    if (!orderHasSpecialService(existingOrder, 'toning')) throw new Error('Invalid special service');
    patch.toning_done = !!body.toning_done;
    patch.toning_done_by = patch.toning_done ? session.workerName : null;
    patch.toning_status = patch.toning_done;
  } else if (Object.prototype.hasOwnProperty.call(body, 'toning_status')) {
    if (!workerHasSpecialServiceCapability(currentWorker || { name: session.workerName, note: '' }, 'toning')) throw new Error('Forbidden');
    if ((getOrderAssignedSpecialist(existingOrder, 'toning') || getOrderAssignedSpecialistId(existingOrder, 'toning')) && !isSessionAssignedSpecialist(existingOrder, 'toning', session, currentWorker)) throw new Error('Forbidden');
    if (!orderHasSpecialService(existingOrder, 'toning')) throw new Error('Invalid special service');
    patch.toning_status = !!body.toning_status;
    patch.toning_done = patch.toning_status;
    patch.toning_done_by = patch.toning_status ? session.workerName : null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'price_locked') && body.price_locked !== undefined) {
    patch.price_locked = !!body.price_locked;
  }
  if (Array.isArray(clientPayments)) {
    const prev = existingOrder?.client_payments || [];
    assertOnlyAppendedPayments(clientPayments, prev, 'client_payments');
    patch.client_payments = clientPayments;
    patch.debt = sumPaymentAmounts(clientPayments);
  } else if (Object.prototype.hasOwnProperty.call(body, 'debt')) {
    patch.debt = Number(body.debt) || 0;
  }
  if (Array.isArray(supplierPayments)) {
    const prev = existingOrder?.supplier_payments || [];
    assertOnlyAppendedPayments(supplierPayments, prev, 'supplier_payments');
    patch.supplier_payments = supplierPayments;
    patch.check_sum = (Number(existingOrder?.check_sum) || 0) + sumAppendedCashPayments(supplierPayments, prev);
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
  // Статус расчёта заказа зависит от зарегистрированных оплат,
  // а подтверждение безнала отдельно влияет только на кассовую проводку.
  return (payments || []).reduce((sum, payment) => {
    const amount = Number(payment?.amount) || 0;
    return amount > 0 ? sum + amount : sum;
  }, 0);
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

async function getWorkerById(workerId, sb, sbHeaders) {
  const id = String(workerId || '').trim();
  if (!id) return null;
  const res = await fetch(
    `${sb}/rest/v1/workers?id=eq.${encodeURIComponent(id)}&limit=1`,
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
  owner: {
    orders_view_all: true,
    orders_create: true,
    orders_edit: true,
    orders_delete: true,
    clients_view: true,
    workers_view: true,
    car_directory_view: true,
    warehouses_view: true,
    dropshippers_manage: true,
    calendar_view: true,
    groups_view: true,
    selectable_as_manager: false,
    personal_cash_view: true,
    cash_add_entries: true,
    finance_view: true,
    owner_cash_view: true,
    owner_expenses_view: true,
    owner_payments_view: true,
    order_payments_manage: true,
    order_services_edit: true,
    order_complete: true,
    special_service_status: true,
    special_service_tatu: true,
    special_service_toning: true,
    own_warehouse_view: true,
  },
  manager: {
    orders_view_all: true,
    orders_create: true,
    orders_edit: true,
    orders_delete: false,
    clients_view: true,
    workers_view: false,
    car_directory_view: false,
    warehouses_view: true,
    dropshippers_manage: false,
    calendar_view: false,
    groups_view: false,
    selectable_as_manager: true,
    personal_cash_view: true,
    cash_add_entries: true,
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
    own_warehouse_view: false,
  },
  senior: {
    orders_view_all: false,
    orders_create: false,
    orders_edit: true,
    orders_delete: false,
    clients_view: false,
    workers_view: false,
    car_directory_view: false,
    warehouses_view: false,
    dropshippers_manage: false,
    calendar_view: false,
    groups_view: false,
    selectable_as_manager: false,
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
    own_warehouse_view: false,
  },
  junior: {
    orders_view_all: false,
    orders_create: false,
    orders_edit: false,
    orders_delete: false,
    clients_view: false,
    workers_view: false,
    car_directory_view: false,
    warehouses_view: false,
    dropshippers_manage: false,
    calendar_view: false,
    groups_view: false,
    selectable_as_manager: false,
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
    own_warehouse_view: false,
  },
  extra: {
    orders_view_all: false,
    orders_create: false,
    orders_edit: true,
    orders_delete: false,
    clients_view: false,
    workers_view: false,
    car_directory_view: false,
    warehouses_view: false,
    dropshippers_manage: false,
    calendar_view: false,
    groups_view: false,
    selectable_as_manager: false,
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
    own_warehouse_view: false,
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
    return { note: source.trim(), permissions: {}, telegramNick: '', orderCardLayout: null, clientCopyFields: null };
  }

  const encoded = source.slice(start + prefix.length, end).trim();
  const note = `${source.slice(0, start)}${source.slice(end + suffix.length)}`.trim();
  if (!encoded) {
    return { note, permissions: {}, telegramNick: '', orderCardLayout: null, clientCopyFields: null };
  }

  try {
    const decoded = JSON.parse(decodeWorkerMetaPayload(encoded));
    const meta = decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? decoded : {};
    const isLegacyPermissionsOnly = !Object.prototype.hasOwnProperty.call(meta, 'permissions')
      && !Object.prototype.hasOwnProperty.call(meta, 'telegramNick')
      && !Object.prototype.hasOwnProperty.call(meta, 'orderCardLayout')
      && !Object.prototype.hasOwnProperty.call(meta, 'clientCopyFields');
    return {
      note,
      permissions: isLegacyPermissionsOnly
        ? meta
        : ((meta.permissions && typeof meta.permissions === 'object' && !Array.isArray(meta.permissions)) ? meta.permissions : {}),
      telegramNick: String(isLegacyPermissionsOnly ? '' : (meta.telegramNick || '')).trim().replace(/^@+/, ''),
      orderCardLayout: isLegacyPermissionsOnly ? null : (meta.orderCardLayout && typeof meta.orderCardLayout === 'object' ? meta.orderCardLayout : null),
      clientCopyFields: isLegacyPermissionsOnly ? null : (meta.clientCopyFields && typeof meta.clientCopyFields === 'object' ? meta.clientCopyFields : null),
    };
  } catch (e) {
    return { note, permissions: {}, telegramNick: '', orderCardLayout: null, clientCopyFields: null };
  }
}

function decodeWorkerMetaPayload(encoded) {
  const binary = atob(String(encoded || ''));
  try {
    if (typeof TextDecoder !== 'undefined') {
      const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
  } catch (e) {}
  try {
    return decodeURIComponent(escape(binary));
  } catch (e) {
    return binary;
  }
}

function encodeWorkerMeta(meta) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(meta))));
}

function buildWorkerNoteWithMeta({ note = '', permissions = {}, telegramNick = '', orderCardLayout = null, clientCopyFields = null } = {}) {
  const cleanNote = String(note || '').trim();
  const meta = {};
  if (permissions && typeof permissions === 'object' && !Array.isArray(permissions) && Object.keys(permissions).length) meta.permissions = permissions;
  const cleanTelegramNick = String(telegramNick || '').trim().replace(/^@+/, '');
  if (cleanTelegramNick) meta.telegramNick = cleanTelegramNick;
  if (orderCardLayout && typeof orderCardLayout === 'object' && !Array.isArray(orderCardLayout)) meta.orderCardLayout = orderCardLayout;
  if (clientCopyFields && typeof clientCopyFields === 'object' && !Array.isArray(clientCopyFields)) meta.clientCopyFields = clientCopyFields;
  if (!Object.keys(meta).length) return cleanNote;
  return `${cleanNote}${cleanNote ? '\n' : ''}${WORKER_PERMISSIONS_META_PREFIX}${encodeWorkerMeta(meta)}${WORKER_PERMISSIONS_META_SUFFIX}`;
}

function normalizeWorkerClientCopyFields(value) {
  const fields = Array.isArray(value?.fields) ? value.fields : [];
  const cleanFields = fields
    .map((field, index) => ({
      key: String(field?.key || `worker-copy-${index + 1}`).trim() || `worker-copy-${index + 1}`,
      title: String(field?.title || '').trim(),
      text: String(field?.text || '').trim(),
    }))
    .filter(field => field.title && field.text)
    .slice(0, 50);
  return cleanFields.length ? { fields: cleanFields, updatedAt: new Date().toISOString() } : null;
}

function normalizeGlassManufacturersSetting(value) {
  const items = Array.isArray(value?.items) ? value.items : [];
  const seenNames = new Set();
  const cleanItems = [];
  for (let index = 0; index < items.length && cleanItems.length < 200; index += 1) {
    const item = items[index];
    const name = String(item?.name || '').trim().slice(0, 200);
    const description = String(item?.description || '').trim().slice(0, 4000);
    const normalizedName = name.toLocaleLowerCase();
    if (!name || !description || seenNames.has(normalizedName)) continue;
    seenNames.add(normalizedName);
    cleanItems.push({
      id: String(item?.id || `manufacturer-${index + 1}`).trim().slice(0, 120) || `manufacturer-${index + 1}`,
      name,
      description,
    });
  }
  return { items: cleanItems, updatedAt: new Date().toISOString() };
}

function getWorkerTelegramNick(workerRow) {
  return String(workerRow?.telegram_nick || parseWorkerNoteMeta(workerRow?.note).telegramNick || '').trim().replace(/^@+/, '');
}

async function sendTelegramText(env, text, chatIdOverride = '', options = {}) {
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(chatIdOverride || env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chatId || !text) {
    return { ok: false, error: 'Telegram env missing or empty text' };
  }
  const payload = {
    chat_id: chatId,
    text: String(text),
    disable_web_page_preview: true,
  };
  if (options.parseMode) payload.parse_mode = options.parseMode;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const bodyText = await res.text().catch(() => '');
  return {
    ok: res.ok,
    status: res.status,
    bodyText,
  };
}

function escapeTelegramHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function buildPlannerTelegramMessage(orderRow, sb, sbHeaders) {
  if (!orderRow?.id) return '';
  const names = [
    orderRow.responsible,
    orderRow.assistant,
    orderRow.extra_assistant,
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

async function buildCompletedTelegramMessage(orderRow, sb, sbHeaders) {
  if (!orderRow?.id) return '';
  const services = getCompletedOrderServicesText(orderRow);
  const total = getCompletedOrderClientTotal(orderRow);
  const lines = [
    [orderRow.id, orderRow.date].filter(Boolean).join(', '),
    orderRow.car ? `Автомобиль: ${orderRow.car}` : 'Автомобиль: —',
    `Услуги: ${services || '—'}`,
    `Общая сумма: ${total.toLocaleString('ru-RU')} ₴`,
  ].filter(Boolean);
  return lines.join('\n');
}

function getCompletedOrderServicesText(orderRow) {
  const services = parseOrderServiceTypeNames(orderRow?.service_type);
  if (Number(orderRow?.tatu) > 0) services.push('Тату');
  if (Number(orderRow?.toning) > 0) services.push('Тонировка');
  if (Number(orderRow?.extra_work) > 0) services.push('Доп. работы');
  if (!services.length && orderRow?.only_sale) services.push('Продажа');
  return [...new Set(services)].join(', ');
}

function getCompletedOrderClientTotal(orderRow) {
  return (Number(orderRow?.total) || 0)
    + (Number(orderRow?.income) || 0)
    + (Number(orderRow?.delivery) || 0);
}

function parseOrderServiceTypeNames(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  if (raw.startsWith('[') || raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return rows
        .map(item => {
          if (typeof item === 'string') return item.trim();
          const name = String(item?.name || item?.label || item?.title || '').trim();
          const qty = Number(item?.qty || item?.quantity || 0);
          return name && qty > 1 ? `${name} x${qty}` : name;
        })
        .filter(Boolean);
    } catch (e) {}
  }
  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function orderHasSpecialService(order, type) {
  if (!order) return false;
  if (type === 'tatu' && Number(order.tatu) > 0) return true;
  if (type === 'toning' && Number(order.toning) > 0 && !order.toning_external) return true;
  const services = parseOrderServiceTypeNames(order.service_type)
    .map(item => String(item || '').trim().toLowerCase());
  if (type === 'tatu') return services.some(item => item === 'тату' || item.startsWith('тату '));
  if (type === 'toning') {
    if (order.toning_external) return false;
    return services.some(item => item === 'тонировка' || item.startsWith('тонировка '));
  }
  return false;
}

async function maybeNotifyPlannerOrder(previousOrder, savedOrder, sb, sbHeaders, env) {
  if (!savedOrder?.in_work) return;
  if (previousOrder?.in_work) return;
  try {
    const text = await buildPlannerTelegramMessage(savedOrder, sb, sbHeaders);
    if (text) await sendTelegramText(env, text);
  } catch (e) {}
}

async function maybeNotifyCompletedOrder(previousOrder, savedOrder, sb, sbHeaders, env) {
  const becameWorkerDone = savedOrder?.worker_done === true && previousOrder?.worker_done !== true;
  const becameStatusDone = savedOrder?.status_done === true && previousOrder?.status_done !== true;
  if (!becameWorkerDone && !becameStatusDone) return;
  const doneChatId = String(env.TELEGRAM_DONE_CHAT_ID || '').trim();
  if (!doneChatId) return;
  try {
    const text = await buildCompletedTelegramMessage(savedOrder, sb, sbHeaders);
    const phone = String(savedOrder?.phone || '').trim();
    const message = phone
      ? `<pre>${escapeTelegramHtml(text)}</pre>\nТелефон: ${escapeTelegramHtml(phone)}`
      : `<pre>${escapeTelegramHtml(text)}</pre>`;
    if (text) await sendTelegramText(env, message, doneChatId, { parseMode: 'HTML' });
  } catch (e) {}
}

async function maybeNotifyOrderTransitions(previousOrder, savedOrder, sb, sbHeaders, env) {
  await maybeNotifyPlannerOrder(previousOrder, savedOrder, sb, sbHeaders, env);
  await maybeNotifyCompletedOrder(previousOrder, savedOrder, sb, sbHeaders, env);
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

function getOrderAssignedSpecialistId(order, type) {
  return type === 'tatu'
    ? String(order?.tatu_responsible_worker_id || '').trim()
    : String(order?.toning_responsible_worker_id || '').trim();
}

function isSessionAssignedSpecialist(order, type, session = {}, currentWorker = null) {
  const assignedId = getOrderAssignedSpecialistId(order, type);
  if (assignedId && currentWorker?.id && String(currentWorker.id) === assignedId) return true;
  const assignedName = getOrderAssignedSpecialist(order, type);
  if (!assignedName) return false;
  return normalizeWorkerIdentityText(assignedName) === normalizeWorkerIdentityText(session.workerName)
    || normalizeWorkerIdentityText(assignedName) === normalizeWorkerIdentityText(currentWorker?.name)
    || normalizeWorkerIdentityText(assignedName) === normalizeWorkerIdentityText(currentWorker?.alias);
}

async function getWorkersIdentityRows(sb, sbHeaders) {
  const res = await fetch(
    `${sb}/rest/v1/workers?select=id,name,alias,assistant,note,role,system_role&limit=1000`,
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
  const sessionWorker = await findWorkerByIdentity(session.workerName, sb, sbHeaders);
  if (!sessionWorker) return false;
  if (isSessionAssignedSpecialist(order, 'tatu', session, sessionWorker)) return true;
  if (isSessionAssignedSpecialist(order, 'toning', session, sessionWorker)) return true;
  return workerIdentityMatchesLabel(sessionWorker, order.responsible)
    || workerIdentityMatchesLabel(sessionWorker, order.assistant)
    || workerIdentityMatchesLabel(sessionWorker, order.extra_assistant)
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

function isAttendanceSalaryBody(body) {
  return !!body
    && String(body.order_id || '') === 'Выход в работу'
    && Number(body.amount) > 0
    && !!String(body.worker_name || '').trim();
}

async function getActiveAttendanceSalary(workerName, date, sb, sbHeaders) {
  if (!workerName || !date) return null;
  const res = await fetch(
    `${sb}/rest/v1/worker_salaries?worker_name=eq.${encodeURIComponent(workerName)}&date=eq.${encodeURIComponent(date)}&order=created_at.desc&limit=100`,
    { headers: sbHeaders }
  );
  const rows = await res.json().catch(() => []);
  const list = Array.isArray(rows) ? rows : [];
  const attendanceRows = list.filter(row =>
    String(row?.order_id || '') === 'Выход в работу' &&
    Number(row?.amount) > 0
  );
  if (!attendanceRows.length) return null;
  const activeTotal = list.reduce((sum, row) => {
    const amount = Number(row?.amount) || 0;
    const orderId = String(row?.order_id || '');
    const comment = String(row?.comment || '');
    if (orderId === 'Выход в работу' && amount > 0) return sum + amount;
    if (amount < 0 && orderId.startsWith('Отмена ЗП') && comment.includes('Отмена выхода в работу')) return sum + amount;
    return sum;
  }, 0);
  return activeTotal > 0 ? attendanceRows[0] : null;
}

async function createSalaryReversalRow(row, session, sb, sbHeaders, reason = 'Отмена записи ЗП') {
  if (!row?.id) throw new Error('Salary not found');
  const amount = Number(row.amount) || 0;
  if (!amount) return [];
  const payload = {
    worker_name: row.worker_name,
    worker_id: row.worker_id || null,
    date: new Date().toISOString().slice(0, 10),
    amount: -amount,
    order_id: `Отмена ЗП · ${row.order_id || row.id}`,
    entry_type: 'manual',
    comment: `${reason}: ${row.comment || row.order_id || row.id || ''}`.trim(),
    created_by: session?.workerName || 'system',
  };
  if (!payload.worker_id && payload.worker_name) {
    const worker = await getWorkerByName(payload.worker_name, sb, sbHeaders);
    if (worker?.id) payload.worker_id = worker.id;
  }
  const res = await fetch(`${sb}/rest/v1/worker_salaries`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => []);
  if (!res.ok) throw new Error(data?.message || 'Failed to create salary reversal');
  return data;
}

async function createSalaryCorrectionRow(row, nextAmount, reason, session, sb, sbHeaders) {
  if (!row?.id) throw new Error('Salary not found');
  const currentAmount = Number(row.amount) || 0;
  const amount = Number(nextAmount) || 0;
  const delta = amount - currentAmount;
  if (!delta) return [row];
  const payload = {
    worker_name: row.worker_name,
    worker_id: row.worker_id || null,
    date: new Date().toISOString().slice(0, 10),
    amount: delta,
    order_id: `Коррекция ЗП · ${row.order_id || row.id}`,
    entry_type: 'manual',
    comment: String(reason || `Коррекция ЗП: было ${currentAmount}, стало ${amount}`).trim(),
    created_by: session?.workerName || 'owner',
  };
  if (!payload.worker_id && payload.worker_name) {
    const worker = await getWorkerByName(payload.worker_name, sb, sbHeaders);
    if (worker?.id) payload.worker_id = worker.id;
  }
  const res = await fetch(`${sb}/rest/v1/worker_salaries`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => []);
  if (!res.ok) throw new Error(data?.message || 'Failed to create salary correction');
  return data;
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

function getCashLedgerSourceKey(rowOrBody = {}) {
  return String(rowOrBody?.source_key || rowOrBody?.fop_source_key || rowOrBody?.source_id || '').trim();
}

function cashSourceEqFilter(sourceKey) {
  const key = encodeURIComponent(String(sourceKey || '').trim());
  return `or=(source_key.eq.${key},fop_source_key.eq.${key})`;
}

function cashSourceLikeFilter(sourcePattern) {
  const pattern = encodeURIComponent(String(sourcePattern || '').trim());
  return `or=(source_key.like.${pattern},fop_source_key.like.${pattern})`;
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

let _paymentMethodsCache = { ts: 0, rows: [] };
async function fetchPaymentMethodsCached(sb, sbHeaders) {
  const now = Date.now();
  if (_paymentMethodsCache.ts && (now - _paymentMethodsCache.ts) < 60_000 && Array.isArray(_paymentMethodsCache.rows)) {
    return _paymentMethodsCache.rows;
  }
  const res = await fetch(`${sb}/rest/v1/ref_payment_methods?active=eq.true&order=sort_order.asc,label.asc`, { headers: sbHeaders });
  const rows = await res.json().catch(() => []);
  _paymentMethodsCache = { ts: now, rows: Array.isArray(rows) ? rows : [] };
  return _paymentMethodsCache.rows;
}

async function findPaymentMethodRowByLabel(label, sb, sbHeaders) {
  const normalized = normalizeCashPaymentMethod(label);
  if (!normalized) return null;
  const rows = await fetchPaymentMethodsCached(sb, sbHeaders);
  return rows.find(row => normalizeCashPaymentMethod(row?.label) === normalized) || null;
}

function isConfirmableCardCashMethod(method) {
  // Legacy helper kept for non-order cash inserts where we don't want an extra DB call.
  // Proper classification for order-derived entries should be driven by ref_payment_methods.
  const normalized = String(method || '').trim();
  return !!normalized && normalized !== '🪙 Наличка';
}

function getCashPaymentMethod(rowOrBody = {}) {
  return String(
    rowOrBody?.payment_method
    || rowOrBody?.manual_payment_method
    || getPaymentMethodFromCashSourceKey(getCashLedgerSourceKey(rowOrBody))
    || ''
  ).trim();
}

function deriveCashSourceType(body = {}) {
  if (body?.source_type) return String(body.source_type).trim();
  if (body?.manual_payment === true) return 'manual';
  if (parseExpenseCommentMeta(body?.comment)) return 'expense';
  if (isCurrencyComment(body?.comment)) return 'exchange';
  if (getCashLedgerSourceKey(body).startsWith('order:')) return 'order';
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

function parseCurrencyComment(comment = '') {
  const raw = String(comment || '');
  if (!raw.startsWith('FXUSD|')) return null;
  const parts = raw.split('|');
  const data = {};
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    data[part.slice(0, idx)] = part.slice(idx + 1);
  }
  const usdAmount = Number(data.usd) || 0;
  if (!usdAmount) return null;
  return {
    usdAmount,
    rate: Number(data.rate) || 0,
    uahAmount: Number(data.uah) || 0,
    note: decodeURIComponent(String(data.note || '')),
  };
}

function buildCurrencyComment({ usdAmount, rate = 0, uahAmount = 0, note = '' } = {}) {
  return [
    'FXUSD|usd=' + String(Number(usdAmount) || 0),
    'rate=' + String(Number(rate) || 0),
    'uah=' + String(Number(uahAmount) || 0),
    'note=' + encodeURIComponent(String(note || '').trim()),
  ].join('|');
}

function buildReversedCurrencyCashComment(comment = '', reason = '') {
  const parsed = parseCurrencyComment(comment);
  if (!parsed) return '';
  const note = ['Отмена', parsed.note, reason].filter(Boolean).join(': ');
  return buildCurrencyComment({
    usdAmount: -parsed.usdAmount,
    rate: parsed.rate,
    uahAmount: parsed.uahAmount,
    note,
  });
}

function normalizePaymentMethodType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['cash', 'card', 'fop'].includes(normalized) ? normalized : '';
}

async function buildPaymentMethodRoute(methodLabel, fallbackWorkerName, sb, sbHeaders) {
  const label = normalizeCashPaymentMethod(methodLabel);
  const targetWorkerName = String(fallbackWorkerName || '').trim();
  const targetWorker = targetWorkerName ? await getWorkerByName(targetWorkerName, sb, sbHeaders).catch(() => null) : null;
  if (!label) {
    return { worker_name: targetWorkerName, worker_id: targetWorker?.id || null, cash_account: 'cash', requires_confirmation: false };
  }
  if (label === '🪙 Наличка') {
    return { worker_name: targetWorkerName, worker_id: targetWorker?.id || null, cash_account: 'cash', requires_confirmation: false };
  }
  const row = await findPaymentMethodRowByLabel(label, sb, sbHeaders);
  if (!row) {
    // Unknown method: treat as confirmable card by default (safe).
    return { worker_name: targetWorkerName, worker_id: targetWorker?.id || null, cash_account: 'cash', requires_confirmation: true };
  }
  const type = normalizePaymentMethodType(row.method_type);
  if (type === 'cash') {
    return { worker_name: targetWorkerName, worker_id: targetWorker?.id || null, cash_account: 'cash', requires_confirmation: false };
  }
  const resolvedOwner = row.worker_id
    ? await getWorkerById(String(row.worker_id).trim(), sb, sbHeaders).catch(() => null)
    : (row.worker_name ? await getWorkerByName(String(row.worker_name).trim(), sb, sbHeaders).catch(() => null) : null);
  const owner = String(resolvedOwner?.name || row.worker_name || '').trim() || targetWorkerName;
  return {
    worker_name: owner,
    worker_id: resolvedOwner?.id || row.worker_id || null,
    cash_account: type === 'fop' ? 'fop' : 'cash',
    requires_confirmation: row.requires_confirmation !== false,
    payment_type: type === 'fop' ? 'transfer' : 'card',
  };
}

async function resolveOrderPaymentCashRoute({ order = null, payment = null, paymentType = 'client', method = '', fallbackWorkerName = '', sb, sbHeaders } = {}) {
  const normalized = normalizeCashPaymentMethod(method || payment?.method);
  let routeFallbackWorkerName = String(fallbackWorkerName || order?.responsible || '').trim();
  let reason = 'payment method route';

  if (isCashPaymentMethodForSync(normalized) && payment?.cashWorker) {
    routeFallbackWorkerName = String(payment.cashWorker || '').trim() || routeFallbackWorkerName;
    reason = 'owner selected cash worker';
  }

  if (paymentType === 'dropshipper' && isCashPaymentMethodForSync(normalized)) {
    const dropshipperWorker = await getDropshipperCashWorker(order?.drop_shipper || order?.dropshipper, sb, sbHeaders).catch(() => null);
    if (dropshipperWorker?.name) {
      routeFallbackWorkerName = String(dropshipperWorker.name || '').trim() || routeFallbackWorkerName;
      reason = 'dropshipper cash worker';
    }
  }

  const route = await buildPaymentMethodRoute(normalized, routeFallbackWorkerName, sb, sbHeaders);
  return {
    ...route,
    method: normalized,
    payment_type_key: paymentType,
    route_fallback_worker_name: routeFallbackWorkerName,
    route_reason: reason,
  };
}

function buildStructuredCashFields(body = {}) {
  const cashAccount = String(body?.account_type || body?.cash_account || 'cash').trim().toLowerCase();
  const paymentMethod = getCashPaymentMethod(body);
  const expenseMeta = parseExpenseCommentMeta(body?.comment);
  const sourceType = deriveCashSourceType(body);
  const sourceKey = getCashLedgerSourceKey(body);
  const orderId = String(body?.order_id || extractOrderIdFromSourceKey(sourceKey) || '').trim() || null;
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
    else if (cashAccount === 'fop') paymentType = 'transfer';
    else if (isCashPaymentMethodForSync(paymentMethod)) paymentType = 'cash';
    else if (paymentMethod) paymentType = 'card';
    else paymentType = 'cash';
  }

  return {
    cash_owner: String(body?.cash_owner || body?.worker_name || '').trim() || null,
    worker_id: body?.worker_id || null,
    cash_owner_id: body?.cash_owner_id || body?.worker_id || null,
    account_type: cashAccount,
    payment_type: paymentType,
    payment_method: paymentMethod || null,
    approval_status: approvalStatus,
    approval_by: body?.approval_by !== undefined
      ? (String(body.approval_by || '').trim() || null)
      : (approvalStatus === 'pending' ? (String(body?.cash_owner || body?.worker_name || '').trim() || null) : null),
    approval_by_id: body?.approval_by_id || (approvalStatus === 'pending' ? (body?.cash_owner_id || body?.worker_id || null) : null),
    source_type: sourceType,
    source_id: String(body?.source_id || sourceKey || orderId || '').trim() || null,
    order_id: orderId,
    expense_category: String(body?.expense_category || expenseMeta?.category || '').trim() || null,
    warehouse_name: String(body?.warehouse_name || expenseMeta?.warehouse || '').trim() || null,
  };
}

function isConfirmableCardCashRow(row) {
  const cashAccount = String(row?.cash_account || '').trim().toLowerCase();
  if (cashAccount !== 'cash') return false;
  return isConfirmableCardCashMethod(getPaymentMethodFromCashSourceKey(getCashLedgerSourceKey(row)));
}

function isOrderDerivedCashEntry(body) {
  return getCashLedgerSourceKey(body).startsWith('order:');
}

function isActiveCashLedgerRow(row) {
  if (!row || String(row.deleted_at || '').trim()) return false;
  const status = String(row.ledger_status || 'posted').trim().toLowerCase();
  return status !== 'voided' && status !== 'reversed';
}

function chooseCanonicalOrderCashEntry(rows = []) {
  return [...rows].sort((a, b) => {
    const aConfirmed = a?.fop_confirmed === true || String(a?.approval_status || '') === 'confirmed';
    const bConfirmed = b?.fop_confirmed === true || String(b?.approval_status || '') === 'confirmed';
    if (aConfirmed !== bConfirmed) return aConfirmed ? -1 : 1;
    const at = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const bt = b?.created_at ? new Date(b.created_at).getTime() : 0;
    if (at !== bt) return at - bt;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  })[0] || null;
}

async function voidCashLedgerRow(id, reason, sb, sbHeaders) {
  if (!id) return;
  await fetch(`${sb}/rest/v1/cash_log?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: sbHeaders,
    body: JSON.stringify({
      ledger_status: 'voided',
      reversal_reason: reason,
      reversed_by: 'system',
      reversed_at: new Date().toISOString(),
    }),
  }).catch(() => {});
}

async function voidDuplicateOrderCashEntries(rows = [], sb, sbHeaders, debug = null) {
  const activeRows = (rows || []).filter(isActiveCashLedgerRow);
  const groups = new Map();
  activeRows.forEach(row => {
    const key = getCashLedgerSourceKey(row);
    if (!key) return;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  });

  const keepIds = new Set();
  for (const [key, list] of groups.entries()) {
    const canonical = chooseCanonicalOrderCashEntry(list);
    if (!canonical?.id) continue;
    keepIds.add(String(canonical.id));
    for (const row of list) {
      if (!row?.id || String(row.id) === String(canonical.id)) continue;
      await voidCashLedgerRow(row.id, `duplicate order cash source: ${key}`, sb, sbHeaders);
      debug?.push?.({
        type: 'duplicate-voided',
        sourceKey: key,
        keptId: canonical.id,
        voidedId: row.id,
        amount: Number(row.amount) || 0,
        cashOwner: row.cash_owner || row.worker_name || null,
      });
    }
  }

  return activeRows.filter(row => !row?.id || keepIds.has(String(row.id)) || !getCashLedgerSourceKey(row));
}

function normalizeOrderSaveCashEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const workerName = String(entry.worker_name || '').trim();
  const amount = Number(entry.amount) || 0;
  const comment = String(entry.comment || '').trim();
  if (!workerName || !amount || !comment) return null;
  const normalized = {
    worker_name: workerName,
    worker_id: entry.worker_id || null,
    amount,
    comment,
    cash_account: String(entry.cash_account || entry.account_type || 'cash').trim().toLowerCase(),
    fop_confirmed: entry.fop_confirmed === true,
    fop_source_key: entry.fop_source_key || entry.source_key || entry.source_id || null,
    fop_date: entry.fop_date || null,
    manual_payment: entry.manual_payment === true,
    manual_payment_method: entry.manual_payment_method || entry.payment_method || null,
    cash_owner: entry.cash_owner || workerName,
    cash_owner_id: entry.cash_owner_id || entry.worker_id || null,
    account_type: entry.account_type || entry.cash_account || 'cash',
    payment_method: entry.payment_method || entry.manual_payment_method || null,
    payment_type: entry.payment_type || null,
    approval_status: entry.approval_status || null,
    approval_by: entry.approval_by || null,
    approval_by_id: entry.approval_by_id || null,
    source_type: entry.source_type || null,
    source_id: entry.source_id || entry.source_key || entry.fop_source_key || null,
    order_id: entry.order_id || null,
    source_key: getCashLedgerSourceKey(entry) || null,
    ledger_status: 'posted',
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

function ensureUniqueOrderCashEntrySourceKeys(entries = []) {
  const seen = new Map();
  return (entries || []).map(entry => {
    const baseKey = getCashLedgerSourceKey(entry);
    if (!baseKey) return entry;
    const nextCount = (seen.get(baseKey) || 0) + 1;
    seen.set(baseKey, nextCount);
    if (nextCount === 1) return entry;
    const uniqueKey = `${baseKey}|seq:${nextCount}`;
    const nextEntry = {
      ...entry,
      fop_source_key: uniqueKey,
      source_key: uniqueKey,
      source_id: uniqueKey,
    };
    return { ...nextEntry, ...buildStructuredCashFields(nextEntry) };
  });
}

function pushDuplicateSourceKeyDebug(beforeEntries = [], afterEntries = [], debug = null) {
  if (!debug?.push) return;
  beforeEntries.forEach((entry, index) => {
    const beforeKey = getCashLedgerSourceKey(entry);
    const afterKey = getCashLedgerSourceKey(afterEntries?.[index]);
    if (beforeKey && afterKey && beforeKey !== afterKey) {
      debug.push({
        type: 'source-key-sequenced',
        originalSourceKey: beforeKey,
        sourceKey: afterKey,
        reason: 'duplicate payment source key inside same order',
      });
    }
  });
}

function isCashPaymentMethodForSync(method) {
  return normalizeCashPaymentMethod(method) === '🪙 Наличка';
}

function normalizeOrderCashSyncPaymentTypes(value) {
  if (!Array.isArray(value) || !value.length) return null;
  const allowed = new Set(['client', 'supplier', 'dropshipper']);
  const types = value
    .map(item => String(item || '').trim().toLowerCase())
    .filter(item => allowed.has(item));
  return types.length ? new Set(types) : null;
}

function orderCashSyncIncludes(paymentTypes, type) {
  return !paymentTypes || paymentTypes.has(type);
}

function getOrderPaymentTypeFromSourceKey(sourceKey = '') {
  const match = String(sourceKey || '').match(/(?:^|\|)type:([^|]+)/);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch (e) {
    return match[1];
  }
}

async function buildOrderDerivedCashEntries(order, sb, sbHeaders, options = {}) {
  if (!order?.id) return [];
  const paymentTypes = options?.paymentTypes || null;
  const debug = options?.debug || null;
  const entries = [];
  const fallbackWorkerName = String(order?.responsible || '').trim();
  const orderId = order.id;
  const orderDate = String(order?.date || '').trim();
  const clientLabel = order?.client || '—';
  const carLabel = order?.car || order?.client || '—';

  const appendEntry = async (payment, paymentType) => {
    const amount = Number(payment?.amount) || 0;
    const method = normalizeCashPaymentMethod(payment?.method);
    if (payment?.adjustment === true) {
      debug?.push?.({ type: 'payment-skipped', reason: 'adjustment', orderId, paymentType, payment });
      return;
    }
    if (!amount || !method) {
      debug?.push?.({ type: 'payment-skipped', reason: !amount ? 'empty amount' : 'empty method', orderId, paymentType, payment });
      return;
    }
    const route = await resolveOrderPaymentCashRoute({
      order,
      payment,
      paymentType,
      method,
      fallbackWorkerName,
      sb,
      sbHeaders,
    });
    if (!route.worker_name) {
      debug?.push?.({ type: 'payment-skipped', reason: 'no route worker', orderId, paymentType, method, routeFallbackWorkerName: route.route_fallback_worker_name, payment });
      return;
    }
    const paymentDate = String(payment?.date || orderDate || '').trim();
    const dateLabel = paymentDate
      ? new Date(`${paymentDate}T00:00:00`).toLocaleDateString('ru-RU')
      : '—';
    const signedAmount = paymentType === 'supplier' || paymentType === 'dropshipper' ? -amount : amount;
    const actionLabel = paymentType === 'supplier'
      ? 'Оплата поставщику'
      : (paymentType === 'dropshipper' ? 'Выплата дропшипперу' : 'Оплата клиента');
    const sourceKey = buildOrderPaymentSourceKey(orderId, method, paymentType, payment);
    entries.push({
      worker_name: route.worker_name,
      cash_owner: route.worker_name,
      worker_id: route.worker_id || null,
      cash_owner_id: route.worker_id || null,
      amount: signedAmount,
      comment: `${actionLabel} ${method} ${orderId}, ${dateLabel}, клиент: ${clientLabel}, авто: ${carLabel}`,
      cash_account: route.cash_account,
      account_type: route.cash_account,
      payment_method: method,
      payment_type: isCashPaymentMethodForSync(method) ? 'cash' : (route.payment_type || 'card'),
      approval_status: route.requires_confirmation ? 'pending' : 'not_required',
      approval_by: route.requires_confirmation ? route.worker_name : null,
      approval_by_id: route.requires_confirmation ? (route.worker_id || null) : null,
      fop_confirmed: false,
      fop_source_key: sourceKey,
      fop_date: paymentDate || null,
      manual_payment: false,
      manual_payment_method: null,
      source_type: 'order',
      order_id: orderId,
      ledger_status: 'posted',
    });
    entries[entries.length - 1].source_key = entries[entries.length - 1].fop_source_key;
    entries[entries.length - 1] = {
      ...entries[entries.length - 1],
      ...buildStructuredCashFields(entries[entries.length - 1]),
    };
    debug?.push?.({
      type: 'payment-routed',
      orderId,
      paymentType,
      method,
      amount: signedAmount,
      sourceKey,
      selectedCashWorker: String(payment?.cashWorker || '').trim() || null,
      routeFallbackWorker: route.route_fallback_worker_name || null,
      cashOwner: route.worker_name,
      cashOwnerId: route.worker_id || null,
      account: route.cash_account,
      approvalStatus: entries[entries.length - 1].approval_status,
      reason: route.route_reason || 'payment method route',
    });
  };

  // NOTE: This function is called in sync flows where sb/sbHeaders are in scope.
  // We keep it async to allow lookup of payment method routing.
  const clientPayments = Array.isArray(order.client_payments) ? order.client_payments : [];
  const supplierPayments = Array.isArray(order.supplier_payments) ? order.supplier_payments : [];
  const dropshipperPayments = Array.isArray(order.drop_shipper_payments) ? order.drop_shipper_payments : [];
  if (orderCashSyncIncludes(paymentTypes, 'client')) {
    for (const payment of clientPayments) {
      // eslint-disable-next-line no-await-in-loop
      await appendEntry(payment, 'client');
    }
  }
  if (orderCashSyncIncludes(paymentTypes, 'supplier')) {
    for (const payment of supplierPayments) {
      // eslint-disable-next-line no-await-in-loop
      await appendEntry(payment, 'supplier');
    }
  }
  if (orderCashSyncIncludes(paymentTypes, 'dropshipper')) {
    for (const payment of dropshipperPayments) {
      // eslint-disable-next-line no-await-in-loop
      await appendEntry(payment, 'dropshipper');
    }
  }
  const uniqueEntries = ensureUniqueOrderCashEntrySourceKeys(entries);
  pushDuplicateSourceKeyDebug(entries, uniqueEntries, debug);
  return uniqueEntries;
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

async function syncOrderFopCashEntries(order, sb, sbHeaders, options = {}) {
  const orderId = order?.id;
  if (!orderId) return [];
  const paymentTypes = options?.paymentTypes || null;
  const debug = options?.debug || null;
  const existingRaw = await fetchOrderDerivedCashEntries(orderId, sb, sbHeaders);
  const existing = await voidDuplicateOrderCashEntries(existingRaw, sb, sbHeaders, debug);
  const legacy = await fetchLegacyOrderDerivedCashEntries(orderId, sb, sbHeaders);
  debug?.push?.({
    type: 'sync-start',
    orderId,
    paymentTypes: paymentTypes ? [...paymentTypes] : ['client', 'supplier', 'dropshipper'],
    existingRows: existingRaw.length,
    activeRowsAfterDedupe: existing.length,
    legacyRows: legacy.length,
  });
  if (!order?.id) {
    return [];
  }
  const entries = await buildOrderDerivedCashEntries(order, sb, sbHeaders, { paymentTypes, debug });
  const nextKeys = new Set(entries.map(entry => getCashLedgerSourceKey(entry)).filter(Boolean));
  const existingByKey = new Map((existing || []).map(entry => [getCashLedgerSourceKey(entry), entry]).filter(([key]) => key));
  const legacyBuckets = new Map();
  (legacy || []).forEach(entry => {
    const key = buildLegacyOrderDerivedCashMatchKey(entry);
    if (!key) return;
    const list = legacyBuckets.get(key) || [];
    list.push(entry);
    legacyBuckets.set(key, list);
  });
  for (const oldEntry of existing || []) {
    const key = getCashLedgerSourceKey(oldEntry);
    if (!key || nextKeys.has(key)) continue;
    if (paymentTypes && !paymentTypes.has(getOrderPaymentTypeFromSourceKey(key))) continue;
    await voidCashLedgerRow(oldEntry.id, `order payment removed: ${key}`, sb, sbHeaders);
    debug?.push?.({ type: 'entry-voided', reason: 'payment removed from order', orderId, id: oldEntry.id, sourceKey: key, amount: Number(oldEntry.amount) || 0 });
  }
  if (!entries.length) {
    debug?.push?.({ type: 'sync-finish', orderId, upsertedRows: 0, reason: 'no derived entries' });
    return [];
  }
  for (const entry of entries) {
    const key = getCashLedgerSourceKey(entry);
    if (!key || existingByKey.has(key)) continue;
    const legacyKey = buildLegacyOrderDerivedCashMatchKey(entry);
    const legacyMatches = legacyBuckets.get(legacyKey) || [];
    const legacyEntry = legacyMatches.shift();
    if (!legacyEntry?.id) continue;
    legacyBuckets.set(legacyKey, legacyMatches);
    await fetch(`${sb}/rest/v1/cash_log?id=eq.${encodeURIComponent(legacyEntry.id)}`, {
      method: 'PATCH',
      headers: sbHeaders,
      body: JSON.stringify({
        fop_source_key: entry.fop_source_key,
        source_key: entry.source_key || entry.fop_source_key,
        fop_date: entry.fop_date || legacyEntry.fop_date || null,
        payment_method: entry.payment_method || legacyEntry.payment_method || null,
        payment_type: entry.payment_type || legacyEntry.payment_type || null,
        account_type: entry.account_type || legacyEntry.account_type || legacyEntry.cash_account || 'cash',
        cash_owner: entry.cash_owner || legacyEntry.cash_owner || null,
        cash_owner_id: entry.cash_owner_id || legacyEntry.cash_owner_id || null,
        worker_id: entry.worker_id || legacyEntry.worker_id || null,
        source_type: 'order',
        source_id: entry.source_id || entry.fop_source_key || null,
        order_id: orderId,
      }),
    }).catch(() => {});
    existingByKey.set(key, { ...legacyEntry, source_key: key, fop_source_key: key });
  }
  entries.forEach(entry => {
    const oldEntry = existingByKey.get(getCashLedgerSourceKey(entry));
    if (!oldEntry) return;
    if (oldEntry.fop_confirmed === true || oldEntry.approval_status === 'confirmed') {
      entry.fop_confirmed = true;
      entry.approval_status = 'confirmed';
      entry.approval_by = oldEntry.approval_by || entry.approval_by || null;
      entry.approval_by_id = oldEntry.approval_by_id || entry.approval_by_id || null;
    }
  });
  await fetch(`${sb}/rest/v1/cash_log?on_conflict=source_key`, {
    method: 'POST',
    headers: {
      ...sbHeaders,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(entries),
  });
  debug?.push?.({ type: 'sync-finish', orderId, upsertedRows: entries.length, sourceKeys: entries.map(entry => getCashLedgerSourceKey(entry)).filter(Boolean) });
  return [];
}

async function fetchOrderDerivedCashEntries(orderId, sb, sbHeaders) {
  if (!orderId) return [];
  const prefixes = [...getOrderSourcePrefixes(orderId), `order:${orderId}|*`];
  const rows = [];
  const seen = new Set();
  for (const sourcePrefix of prefixes) {
    const res = await fetch(
      `${sb}/rest/v1/cash_log?${cashSourceLikeFilter(sourcePrefix)}&limit=1000`,
      { headers: sbHeaders }
    );
    const data = await res.json().catch(() => []);
    (Array.isArray(data) ? data : []).forEach(row => {
      const id = String(row?.id || '');
      if (!id || seen.has(id)) return;
      seen.add(id);
      rows.push(row);
    });
  }
  return rows;
}

async function fetchLegacyOrderDerivedCashEntries(orderId, sb, sbHeaders) {
  if (!orderId) return [];
  const res = await fetch(
    `${sb}/rest/v1/cash_log?order_id=eq.${encodeURIComponent(orderId)}&source_type=eq.order&fop_source_key=is.null&limit=1000`,
    { headers: sbHeaders }
  );
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

function buildLegacyOrderDerivedCashMatchKey(entry) {
  if (!entry) return '';
  const method = normalizeCashPaymentMethod(entry.payment_method || entry.manual_payment_method || getPaymentMethodFromCashSourceKey(getCashLedgerSourceKey(entry)) || '');
  const amount = Number(entry.amount) || 0;
  const paymentType = String(entry.payment_type || '').trim().toLowerCase();
  const date = String(entry.fop_date || '').trim().slice(0, 10);
  const account = String(entry.account_type || entry.cash_account || 'cash').trim().toLowerCase();
  return [method, amount, paymentType, date, account].join('|');
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
      `${sb}/rest/v1/cash_log?cash_account=eq.fop&fop_confirmed=eq.false&${cashSourceLikeFilter(sourcePrefix)}`,
      { method: 'DELETE', headers: sbHeaders }
    );
    await fetch(
      `${sb}/rest/v1/cash_log?cash_account=eq.cash&fop_confirmed=eq.false&${cashSourceLikeFilter(sourcePrefix)}`,
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

  const url = `${sb}/rest/v1/orders?select=responsible,assistant,extra_assistant,rework_data,is_cancelled&limit=10000`;
  const res = await fetch(url, { headers: sbHeaders });
  const rows = await res.json().catch(() => []);
  const assistants = new Set();

  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.is_cancelled) continue;
    if (row?.responsible === workerName && row?.assistant) {
      assistants.add(row.assistant);
    }
    if (row?.responsible === workerName && row?.extra_assistant) {
      assistants.add(row.extra_assistant);
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
