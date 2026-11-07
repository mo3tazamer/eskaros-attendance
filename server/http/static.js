import { promises as fs } from 'node:fs';
import path from 'node:path';
import { redirect, sendText } from '../lib/http.js';
import { log } from '../lib/logger.js';

const APP_CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "script-src 'self'",
  "worker-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

let payrollHtmlCache = null;

/**
 * Serves the mobile app assets and the payroll program. The payroll page is
 * admin-only and receives a tiny injected script that logs the admin into the
 * payroll UI with the same account, so one login opens both applications.
 */
export function createStaticHandler({ publicDir, auth }) {
  return async function handle(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;

    const url = new URL(req.url, 'http://local');
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return false;
    }

    if (pathname === '/payroll') {
      redirect(res, '/payroll/');
      return true;
    }

    if (pathname === '/payroll/' || pathname === '/payroll/index.html') {
      return servePayroll(req, res);
    }

    if (pathname === '/') pathname = '/index.html';

    const filePath = path.resolve(publicDir, `.${pathname}`);
    const insidePublic =
      filePath === publicDir || filePath.startsWith(`${publicDir}${path.sep}`);
    if (!insidePublic) return false;

    if (filePath.startsWith(`${path.join(publicDir, 'payroll')}${path.sep}`)) return false;

    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      return false;
    }
    if (!stat.isFile()) return false;

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext];
    if (!type) return false;

    const headers = {
      ...BASE_HEADERS,
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': pathname === '/index.html' ? 'no-store' : 'no-cache',
    };
    if (pathname === '/index.html') headers['Content-Security-Policy'] = APP_CSP;
    if (pathname === '/sw.js') {
      headers['Cache-Control'] = 'no-store';
      headers['Service-Worker-Allowed'] = '/';
    }

    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }

    try {
      res.end(await fs.readFile(filePath));
    } catch (error) {
      log.warn('تعذّر قراءة الملف:', error.message);
    }
    return true;
  };

  async function servePayroll(req, res) {
    const current = auth.accountFromRequest(req);
    if (!current || current.account.role !== 'admin') {
      redirect(res, '/?next=%2Fpayroll%2F');
      return true;
    }

    try {
      if (!payrollHtmlCache) {
        payrollHtmlCache = await fs.readFile(
          path.join(publicDir, 'payroll', 'index.html'),
          'utf8',
        );
      }
      const userId = auth.payrollUserId(current.account.username);
      const injected = `<script>try{sessionStorage.setItem('pm_me',${JSON.stringify(
        userId,
      )})}catch(e){}</script>`;
      const html = payrollHtmlCache.replace('</head>', `${injected}</head>`);

      res.writeHead(200, {
        ...BASE_HEADERS,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Length': Buffer.byteLength(html),
      });
      res.end(req.method === 'HEAD' ? undefined : html);
      return true;
    } catch (error) {
      log.error('تعذّر تحميل برنامج الرواتب:', error.message);
      sendText(res, 500, 'تعذّر تحميل برنامج الرواتب. تأكد من وجود public/payroll/index.html');
      return true;
    }
  }
}
