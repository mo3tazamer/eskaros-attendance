/**
 * Server-sent events. The payroll program expects the raw collection name in
 * `data`, while the mobile client uses the same value. Events are coalesced so
 * importing a large backup does not flood clients.
 */
export function createSseHub(store) {
  const clients = new Set();
  const pending = new Set();
  let timer = null;

  store.subscribe((name) => {
    pending.add(name);
    if (!timer) timer = setTimeout(flush, 150);
  });

  function flush() {
    timer = null;
    const names = [...pending];
    pending.clear();
    if (!names.length) return;
    const payload = names.map((name) => `data: ${name}\n\n`).join('');
    for (const client of clients) {
      try {
        client.write(payload);
      } catch {
        clients.delete(client);
      }
    }
  }

  function handle(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');
    clients.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        cleanup();
      }
    }, 25_000);

    function cleanup() {
      clearInterval(heartbeat);
      clients.delete(res);
    }

    req.on('close', cleanup);
    req.on('error', cleanup);
  }

  return {
    handle,
    closeAll() {
      for (const client of clients) {
        try {
          client.end();
        } catch {
          // ignored
        }
      }
      clients.clear();
    },
  };
}
