import { assertSameOrigin } from './http.js';
import { notFound } from './errors.js';

/**
 * Minimal path router. Patterns look like `/api/app/admin/loans/:id/approve`.
 * `handle` returns true when a route matched, so the caller can fall through to
 * static files or another router.
 */
export function createRouter() {
  const routes = [];

  function add(method, pattern, handler) {
    routes.push({ method, segments: splitPath(pattern), handler, pattern });
  }

  return {
    get: (pattern, handler) => add('GET', pattern, handler),
    post: (pattern, handler) => add('POST', pattern, handler),
    put: (pattern, handler) => add('PUT', pattern, handler),
    delete: (pattern, handler) => add('DELETE', pattern, handler),

    async handle(req, res, context = {}) {
      const pathname = new URL(req.url, 'http://local').pathname;
      const segments = splitPath(pathname);

      for (const route of routes) {
        if (route.method !== req.method) continue;
        const params = match(route.segments, segments);
        if (!params) continue;

        if (req.method !== 'GET') assertSameOrigin(req);
        req.params = params;
        await route.handler(req, res, { ...context, params });
        return true;
      }

      if (pathname.startsWith('/api/')) throw notFound('المسار غير موجود');
      return false;
    },
  };
}

function splitPath(value) {
  return value.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
}

function match(pattern, segments) {
  if (pattern.length !== segments.length) return null;
  const params = {};
  for (let i = 0; i < pattern.length; i += 1) {
    const expected = pattern[i];
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = segments[i];
    } else if (expected !== segments[i]) {
      return null;
    }
  }
  return params;
}
