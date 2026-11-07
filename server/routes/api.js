import { createRouter } from '../lib/router.js';
import {
  clientIp,
  isSecureRequest,
  readJson,
  sendJson,
  setCookie,
} from '../lib/http.js';
import { conflict, notFound } from '../lib/errors.js';
import { buildSessionPayload } from '../http/sessionPayload.js';
import { oneOf, text } from '../domain/validation.js';
import { isValidDate, isValidMonth, monthOf } from '../lib/time.js';
import { LOAN_STATUS } from '../domain/loans.js';

export function createApiRouter({ auth, store, sessions, settings, clock, attendance, loans, accounts, dashboard, sse, config }) {
  const router = createRouter();
  const payloadFor = (current) =>
    buildSessionPayload({ auth, store, settings, clock }, current);

  function startSession(req, res, sessionId) {
    setCookie(res, 'sid', sessionId, {
      maxAge: sessions.ttlMs / 1000,
      secure: isSecureRequest(req),
    });
  }

  function publicAttendanceRecord(record) {
    return record ? attendance.toPublic(record) : null;
  }

  // ---------------------------------------------------------------- session

  router.get('/api/app/session', (req, res) => {
    sendJson(res, 200, payloadFor(auth.accountFromRequest(req)));
  });

  router.post('/api/app/setup', async (req, res) => {
    const body = await readJson(req, config.maxJsonBytes);
    const account = await auth.setup(body);
    const sessionId = sessions.create(account.id);
    startSession(req, res, sessionId);
    sendJson(res, 201, payloadFor({ account, employee: null, sessionId }));
  });

  router.post('/api/app/login', async (req, res) => {
    const body = await readJson(req, config.maxJsonBytes);
    const { account, employee, sessionId } = await auth.login({
      username: body.username,
      password: body.password,
      ip: clientIp(req),
    });
    startSession(req, res, sessionId);
    sendJson(res, 200, payloadFor({ account, employee, sessionId }));
  });

  router.post('/api/app/logout', (req, res) => {
    const current = auth.accountFromRequest(req);
    if (current) sessions.destroy(current.sessionId);
    setCookie(res, 'sid', '', { maxAge: 0, secure: isSecureRequest(req) });
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/app/password', async (req, res) => {
    const current = auth.requireAccount(req);
    const body = await readJson(req, config.maxJsonBytes);
    await auth.changePassword({
      account: current.account,
      currentPassword: body.currentPassword,
      nextPassword: body.nextPassword,
      confirm: body.confirm,
      sessionId: current.sessionId,
    });
    sendJson(res, 200, { ok: true, message: 'تم تغيير كلمة المرور بنجاح' });
  });

  router.get('/api/app/events', (req, res) => {
    auth.requireAccount(req);
    sse.handle(req, res);
  });

  // --------------------------------------------------------------- employee

  router.get('/api/app/employee/home', (req, res) => {
    const current = auth.requireEmployee(req);
    const { employee } = current;
    const today = clock.today();
    const month = attendance.monthFor(employee, monthOf(today));
    const loanData = loans.listForEmployee(employee);
    const record = attendance.recordFor(today, employee.id);

    sendJson(res, 200, {
      today,
      now: clock.time(),
      employee: {
        id: employee.id,
        name: employee.name || '',
        job: employee.job || '',
        branch: employee.branch || '',
        type: employee.type || '',
        avatar: employee.avatar || '',
      },
      record: publicAttendanceRecord(record),
      month: { key: month.month, summary: month.summary },
      loans: {
        openBalance: loanData.openBalance,
        pending: loanData.pending,
        requestsCount: loanData.requests.length,
      },
      closure: attendance.closureInfo(employee),
      meta: payloadFor(current).meta,
    });
  });

  router.get('/api/app/employee/attendance', (req, res) => {
    const { employee } = auth.requireEmployee(req);
    const month = new URL(req.url, 'http://local').searchParams.get('month') || monthOf(clock.today());
    if (!isValidMonth(month)) throw notFound('الشهر غير صالح');
    sendJson(res, 200, {
      ...attendance.monthFor(employee, month),
      labels: attendance.labels,
      today: clock.today(),
    });
  });

  router.post('/api/app/employee/attendance/check-in', (req, res) => {
    const { employee, account } = auth.requireEmployee(req);
    sendJson(res, 200, attendance.checkIn(employee, account));
  });

  router.post('/api/app/employee/attendance/check-out', (req, res) => {
    const { employee, account } = auth.requireEmployee(req);
    sendJson(res, 200, attendance.checkOut(employee, account));
  });

  router.get('/api/app/employee/loans', (req, res) => {
    const { employee } = auth.requireEmployee(req);
    sendJson(res, 200, {
      ...loans.listForEmployee(employee),
      labels: { status: loans.labels, kind: loans.kindLabels },
      today: clock.today(),
      employee: {
        id: employee.id,
        name: employee.name || '',
        type: employee.type || '',
      },
    });
  });

  router.post('/api/app/employee/loans', async (req, res) => {
    const { employee, account } = auth.requireEmployee(req);
    const body = await readJson(req, config.maxJsonBytes);
    const request = loans.createRequest(employee, account, body);
    sendJson(res, 201, { request, message: 'تم إرسال طلب السلفة للمراجعة' });
  });

  router.post('/api/app/employee/loans/:id/cancel', (req, res) => {
    const { employee, account } = auth.requireEmployee(req);
    const request = loans.cancelRequest(employee, account, req.params.id);
    sendJson(res, 200, { request, message: 'تم إلغاء الطلب' });
  });

  // ------------------------------------------------------------------ admin

  router.get('/api/app/admin/overview', (req, res) => {
    auth.requireAdmin(req);
    sendJson(res, 200, dashboard.overview());
  });

  router.get('/api/app/admin/attendance', (req, res) => {
    auth.requireAdmin(req);
    const url = new URL(req.url, 'http://local');
    const date = url.searchParams.get('date') || clock.today();
    if (!isValidDate(date)) throw notFound('التاريخ غير صالح');
    sendJson(
      res,
      200,
      attendance.listForAdmin(date, {
        branch: url.searchParams.get('branch') || '',
        query: url.searchParams.get('q') || '',
      }),
    );
  });

  router.post('/api/app/admin/attendance', async (req, res) => {
    const { account } = auth.requireAdmin(req);
    const body = await readJson(req, config.maxJsonBytes);
    if (!isValidDate(body.date)) throw conflict('التاريخ غير صالح');
    const employee = attendance.employeeById(body.empId);
    const result = attendance.setByAdmin({
      employee,
      date: body.date,
      status: body.status,
      actor: account,
    });
    sendJson(res, 200, result);
  });

  router.post('/api/app/admin/attendance/bulk', async (req, res) => {
    const { account } = auth.requireAdmin(req);
    const body = await readJson(req, config.maxJsonBytes);
    if (!isValidDate(body.date)) throw conflict('التاريخ غير صالح');
    const branch = text(body.branch, { field: 'الفرع', min: 0, max: 80 });
    const result = attendance.bulkPresent({ date: body.date, branch, actor: account });
    sendJson(res, 200, {
      ...result,
      message: result.count
        ? `تم تسجيل ${result.count} موظفًا حاضرين`
        : 'لا يوجد موظفون بحاجة إلى تسجيل',
    });
  });

  router.get('/api/app/admin/loans', (req, res) => {
    auth.requireAdmin(req);
    const status =
      new URL(req.url, 'http://local').searchParams.get('status') || LOAN_STATUS.pending;
    const allowed = ['all', ...Object.values(LOAN_STATUS)];
    oneOf(status, allowed, { field: 'حالة الطلب' });
    sendJson(res, 200, {
      ...loans.listForAdmin(status),
      labels: { status: loans.labels, kind: loans.kindLabels },
    });
  });

  router.post('/api/app/admin/loans/:id/approve', async (req, res) => {
    const { account } = auth.requireAdmin(req);
    const body = await readJson(req, config.maxJsonBytes);
    const note = text(body.note, { field: 'ملاحظة الإدارة', min: 0, max: 200 });
    const result = loans.approve(req.params.id, account, note);
    sendJson(res, 200, {
      ...result,
      message: 'تمت الموافقة وتسجيل السلفة في برنامج الرواتب',
    });
  });

  router.post('/api/app/admin/loans/:id/reject', async (req, res) => {
    const { account } = auth.requireAdmin(req);
    const body = await readJson(req, config.maxJsonBytes);
    const reason = text(body.reason, { field: 'سبب الرفض', min: 0, max: 200 });
    const request = loans.reject(req.params.id, account, reason);
    sendJson(res, 200, { request, message: 'تم رفض الطلب' });
  });

  router.get('/api/app/admin/accounts', (req, res) => {
    auth.requireAdmin(req);
    const query = new URL(req.url, 'http://local').searchParams.get('q') || '';
    sendJson(res, 200, accounts.list(query));
  });

  router.post('/api/app/admin/accounts', async (req, res) => {
    const { account: actor } = auth.requireAdmin(req);
    const body = await readJson(req, config.maxJsonBytes);
    const account = await accounts.create({
      empId: body.empId,
      username: body.username,
      password: body.password,
      actor,
    });
    sendJson(res, 201, { account, message: 'تم إنشاء الحساب بنجاح' });
  });

  router.post('/api/app/admin/accounts/:id/password', async (req, res) => {
    const { account: actor } = auth.requireAdmin(req);
    const body = await readJson(req, config.maxJsonBytes);
    const account = await accounts.resetPassword({
      accountId: req.params.id,
      password: body.password,
      actor,
    });
    sendJson(res, 200, { account, message: 'تم تغيير كلمة المرور' });
  });

  router.post('/api/app/admin/accounts/:id/status', async (req, res) => {
    const { account: actor } = auth.requireAdmin(req);
    const body = await readJson(req, config.maxJsonBytes);
    if (typeof body.active !== 'boolean') throw conflict('حالة الحساب غير صالحة');
    const account = accounts.setActive({
      accountId: req.params.id,
      active: body.active,
      actor,
    });
    sendJson(res, 200, {
      account,
      message: body.active ? 'تم تفعيل الحساب' : 'تم تعطيل الحساب',
    });
  });

  router.get('/api/app/admin/settings', (req, res) => {
    auth.requireAdmin(req);
    sendJson(res, 200, {
      settings: settings.get(),
      timezones: settings.timezones,
      company: settings.company(),
      server: {
        today: clock.today(),
        now: clock.time(),
        timezone: settings.get().timezone,
      },
    });
  });

  router.put('/api/app/admin/settings', async (req, res) => {
    auth.requireAdmin(req);
    const body = await readJson(req, config.maxJsonBytes);
    const updated = settings.update(body);
    sendJson(res, 200, { settings: updated, message: 'تم حفظ الإعدادات' });
  });

  router.get('/api/app/admin/backup', (req, res) => {
    auth.requireAdmin(req);
    const exportedAt = new Date().toISOString();
    const body = JSON.stringify(
      { version: 1, exportedAt, collections: store.snapshot() },
      null,
      2,
    );
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="attendance-backup-${clock.today()}.json"`,
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  });

  return router;
}
