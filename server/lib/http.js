import { AppError } from './errors.js';
import { log } from './logger.js';

const JSON_TYPE = 'application/json; charset=utf-8';

export function sendJson(res, status, body) {
  if (res.headersSent) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': JSON_TYPE,
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  if (res.headersSent) return;
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

export function redirect(res, location) {
  if (res.headersSent) return;
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

export function sendError(res, error) {
  if (error instanceof AppError) {
    sendJson(res, error.status, { error: error.message, code: error.code });
    return;
  }
  log.error(error);
  sendJson(res, 500, { error: 'حدث خطأ غير متوقع، حاول مرة أخرى' });
}

/** Parse cookies without pulling in a dependency. */
export function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function setCookie(res, name, value, { maxAge, secure }) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

/**
 * Browsers send `Origin` on cross-site requests. We only accept same-origin
 * mutations, which together with the SameSite cookie blocks CSRF.
 */
export function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError('طلب غير صالح', 400, 'bad_origin');
  }
  if (originHost !== req.headers.host) {
    throw new AppError('طلب غير مسموح', 403, 'bad_origin');
  }
}

export async function readJson(req, limit) {
  const type = String(req.headers['content-type'] || '');
  if (!type.includes('application/json')) {
    throw new AppError('يجب إرسال البيانات بصيغة JSON', 415, 'unsupported_media_type');
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      throw new AppError('حجم البيانات أكبر من المسموح', 413, 'payload_too_large');
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed;
  } catch {
    throw new AppError('صيغة البيانات غير صحيحة', 400, 'invalid_json');
  }
}

export function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}

export function isSecureRequest(req) {
  return String(req.headers['x-forwarded-proto'] || '') === 'https';
}
