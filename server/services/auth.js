import { createHash } from 'node:crypto';
import { conflict, forbidden, unauthorized } from '../lib/errors.js';
import { parseCookies } from '../lib/http.js';
import * as validate from '../domain/validation.js';
import { hashPassword, verifyPassword } from './password.js';

const MAX_FAILURES = 5;
const LOCK_MS = 30_000;

/**
 * Payroll user ids use the same (unpadded) hex encoding as the payroll
 * program's `uid()` helper, so the two applications agree on the document id.
 */
export function payrollUserId(username) {
  return `u_${Buffer.from(username.toLowerCase(), 'utf8').toString('hex')}`;
}

/**
 * The payroll program hashes `payroll|u|<username>|<password>` with SHA-256.
 * Replicating it lets the admin use the same credentials in both apps.
 */
export function payrollPasswordHash(username, password) {
  return createHash('sha256')
    .update(`payroll|u|${username.toLowerCase()}|${password}`)
    .digest('hex');
}

export function createAuthService({ store, sessions }) {
  /** @type {Map<string, {failures: number, lockedUntil: number}>} */
  const attempts = new Map();

  function hasAdmin() {
    return store.list('accounts').some((account) => account.role === 'admin');
  }

  async function setup(input) {
    const name = validate.username(input.username);
    const pass = validate.password(input.password);
    if (input.confirm !== undefined && input.confirm !== pass) {
      throw conflict('تأكيد كلمة المرور غير مطابق');
    }
    if (hasAdmin()) throw conflict('تم إنشاء حساب المدير مسبقًا');

    const passwordHash = await hashPassword(pass);
    // Re-check after the async hash to prevent two simultaneous setup calls.
    if (hasAdmin()) throw conflict('تم إنشاء حساب المدير مسبقًا');

    const account = store.add('accounts', {
      role: 'admin',
      username: name,
      usernameLower: name.toLowerCase(),
      name: name,
      password: passwordHash,
      active: true,
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
    });

    await syncPayrollUser(name, pass);
    return account;
  }

  async function login({ username: rawUsername, password, ip }) {
    const name = String(rawUsername || '').trim();
    if (!name || !password) throw unauthorized('أدخل اسم المستخدم وكلمة المرور');

    const key = `${name.toLowerCase()}|${ip || ''}`;
    checkLock(key);

    const account = store
      .list('accounts')
      .find((item) => item.usernameLower === name.toLowerCase() && item.active !== false);

    const valid = account ? await verifyPassword(password, account.password) : false;
    if (!account || !valid) {
      registerFailure(key);
      throw unauthorized('اسم المستخدم أو كلمة المرور غير صحيحة');
    }

    let employee = null;
    if (account.role === 'employee') {
      employee = store.get('employees', account.empId);
      if (!employee || employee.active === false) {
        throw forbidden('هذا الحساب غير مرتبط بموظف ساري. راجع الإدارة.');
      }
    }

    attempts.delete(key);
    store.update('accounts', account.id, { lastLoginAt: Date.now() });

    if (account.role === 'admin') {
      await syncPayrollUser(account.username, password);
    }

    const sessionId = sessions.create(account.id);
    return { account, employee, sessionId };
  }

  function checkLock(key) {
    const entry = attempts.get(key);
    if (entry && entry.lockedUntil > Date.now()) {
      throw unauthorized('محاولات كثيرة، انتظر 30 ثانية ثم حاول مرة أخرى');
    }
  }

  function registerFailure(key) {
    const entry = attempts.get(key) || { failures: 0, lockedUntil: 0 };
    entry.failures += 1;
    if (entry.failures >= MAX_FAILURES) {
      entry.failures = 0;
      entry.lockedUntil = Date.now() + LOCK_MS;
    }
    attempts.set(key, entry);
    if (attempts.size > 500) {
      const now = Date.now();
      for (const [candidate, value] of attempts) {
        if (value.lockedUntil && value.lockedUntil < now) attempts.delete(candidate);
      }
    }
  }

  async function syncPayrollUser(name, password) {
    const id = payrollUserId(name);
    store.set('users', id, {
      name,
      role: 'مدير',
      h: payrollPasswordHash(name, password),
    });
    return id;
  }

  function accountFromRequest(req) {
    const sessionId = parseCookies(req).sid;
    const session = sessions.get(sessionId);
    if (!session) return null;
    const account = store.get('accounts', session.accountId);
    if (!account || account.active === false) {
      sessions.destroy(sessionId);
      return null;
    }
    const employee =
      account.role === 'employee' ? store.get('employees', account.empId) : null;
    return { sessionId, account, employee };
  }

  function requireAccount(req) {
    const current = accountFromRequest(req);
    if (!current) throw unauthorized();
    return current;
  }

  function requireAdmin(req) {
    const current = requireAccount(req);
    if (current.account.role !== 'admin') throw forbidden();
    return current;
  }

  function requireEmployee(req) {
    const current = requireAccount(req);
    if (current.account.role !== 'employee') throw forbidden();
    const employee = current.employee;
    if (!employee) throw forbidden('الحساب غير مرتبط بموظف');
    if (employee.active === false) throw forbidden('حساب الموظف موقوف حاليًا');
    return { ...current, employee };
  }

  async function changePassword({ account, currentPassword, nextPassword, confirm, sessionId }) {
    if (!(await verifyPassword(currentPassword, account.password))) {
      throw unauthorized('كلمة المرور الحالية غير صحيحة');
    }
    const next = validate.password(nextPassword, { field: 'كلمة المرور الجديدة' });
    if (confirm !== undefined && confirm !== next) {
      throw conflict('تأكيد كلمة المرور غير مطابق');
    }
    store.update('accounts', account.id, { password: await hashPassword(next) });
    if (account.role === 'admin') {
      await syncPayrollUser(account.username, next);
    }
    // The current session is kept on purpose; other sessions expire naturally.
    return true;
  }

  return {
    hasAdmin,
    setup,
    login,
    accountFromRequest,
    requireAccount,
    requireAdmin,
    requireEmployee,
    changePassword,
    syncPayrollUser,
    payrollUserId,
  };
}

/** Strips secrets before an account leaves the server. */
export function publicAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    role: account.role,
    username: account.username,
    name: account.name,
    empId: account.empId || null,
    active: account.active !== false,
    createdAt: account.createdAt || null,
    lastLoginAt: account.lastLoginAt || null,
  };
}

/** Employee shape safe to send to the mobile client. */
export function publicEmployee(employee) {
  if (!employee) return null;
  return {
    id: employee.id,
    name: employee.name || '',
    job: employee.job || '',
    branch: employee.branch || '',
    type: employee.type || 'أسبوعي',
    active: employee.active !== false,
    avatar: employee.avatar || '',
  };
}
