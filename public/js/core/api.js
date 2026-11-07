export class ApiError extends Error {
  constructor(message, status = 0, code = 'network') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`/api/app${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch {
    throw new ApiError('تعذّر الاتصال بالخادم. تأكد من أن الجهاز متصل بالشبكة.', 0);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 401 && path !== '/login' && path !== '/setup') {
      window.dispatchEvent(new CustomEvent('app:unauthorized'));
    }
    throw new ApiError(
      payload?.error || 'حدث خطأ غير متوقع، حاول مرة أخرى',
      response.status,
      payload?.code || 'error',
    );
  }

  return payload;
}

export const api = {
  get: (path, options) => request(path, options),
  post: (path, body, options = {}) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options = {}) => request(path, { ...options, method: 'PUT', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};

/** Live updates via server-sent events, with exponential reconnect. */
export function connectEvents(onCollection) {
  let source = null;
  let retries = 0;
  let closed = false;
  let reconnectTimer = null;

  function open() {
    if (closed) return;
    source = new EventSource('/api/app/events');
    source.onopen = () => {
      retries = 0;
    };
    source.onmessage = (event) => {
      if (event.data) onCollection(event.data);
    };
    source.onerror = () => {
      source?.close();
      if (closed) return;
      const delay = Math.min(30_000, 1000 * 2 ** retries);
      retries += 1;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(open, delay);
    };
  }

  open();

  return () => {
    closed = true;
    clearTimeout(reconnectTimer);
    source?.close();
  };
}
