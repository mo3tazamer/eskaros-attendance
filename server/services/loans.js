import { conflict, forbidden, notFound } from '../lib/errors.js';
import { isLocked, lastClosedDate } from '../domain/locks.js';
import {
  LOAN_KIND,
  LOAN_KIND_LABEL,
  LOAN_STATUS,
  LOAN_STATUS_LABEL,
  buildAdvance,
  openBalance,
  round2,
} from '../domain/loans.js';
import { integer, number, oneOf, text } from '../domain/validation.js';

export function createLoansService({ store, clock, audit }) {
  function employeeOrThrow(employeeId) {
    const employee = store.get('employees', employeeId);
    if (!employee) throw notFound('الموظف غير موجود');
    return employee;
  }

  function enrich(request) {
    const employee = store.get('employees', request.empId) || {};
    const advance = request.advanceId ? store.get('advances', request.advanceId) : null;
    return {
      ...request,
      empName: employee.name || request.empName || '',
      job: employee.job || '',
      branch: employee.branch || '',
      employeeType: employee.type || '',
      advance: advance ? publicAdvance(advance) : null,
    };
  }

  function listForEmployee(employee) {
    const requests = store
      .list('loanRequests')
      .filter((request) => request.empId === employee.id)
      .sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0))
      .map(enrich);

    const advances = store
      .list('advances')
      .filter((advance) => advance.emp === employee.id)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map(publicAdvance);

    return {
      requests,
      advances,
      openBalance: openBalance(store.list('advances'), employee, store.list('closes')),
      pending: requests.find((request) => request.status === LOAN_STATUS.pending) || null,
    };
  }

  function createRequest(employee, account, input) {
    if (employee.active === false) throw forbidden('حساب الموظف غير ساري');

    const amount = round2(
      number(input.amount, { field: 'مبلغ السلفة', min: 1, max: 1_000_000 }),
    );
    const kind = oneOf(input.kind || LOAN_KIND.instant, Object.values(LOAN_KIND), {
      field: 'نوع السلفة',
    });
    const installments =
      kind === LOAN_KIND.scheduled
        ? integer(input.installments, { field: 'عدد الأقساط', min: 2, max: 52 })
        : null;
    const note = text(input.note, { field: 'سبب السلفة', min: 0, max: 200 });

    const pending = store
      .list('loanRequests')
      .find(
        (request) =>
          request.empId === employee.id && request.status === LOAN_STATUS.pending,
      );
    if (pending) throw conflict('لديك طلب سلفة قيد المراجعة بالفعل');

    const request = store.add('loanRequests', {
      empId: employee.id,
      empName: employee.name,
      amount,
      kind,
      installments,
      note,
      status: LOAN_STATUS.pending,
      date: clock.today(),
      requestedAt: Date.now(),
      requestedBy: account.id,
    });

    audit.record({
      actor: account,
      action: 'loan.request',
      target: employee.id,
      details: `${amount} — ${LOAN_KIND_LABEL[kind]}`,
    });

    return enrich(request);
  }

  function cancelRequest(employee, account, id) {
    const request = store.get('loanRequests', id);
    if (!request || request.empId !== employee.id) throw notFound('الطلب غير موجود');
    if (request.status !== LOAN_STATUS.pending) {
      throw conflict('لا يمكن إلغاء طلب تمت مراجعته');
    }
    store.update('loanRequests', id, {
      status: LOAN_STATUS.cancelled,
      cancelledAt: Date.now(),
    });
    audit.record({
      actor: account,
      action: 'loan.cancel',
      target: employee.id,
      details: `ألغى طلب سلفة بقيمة ${request.amount}`,
    });
    return enrich(store.get('loanRequests', id));
  }

  function listForAdmin(status = 'all') {
    const requests = store
      .list('loanRequests')
      .filter((request) => status === 'all' || request.status === status)
      .sort((a, b) => {
        if (a.status === LOAN_STATUS.pending && b.status !== LOAN_STATUS.pending) return -1;
        if (b.status === LOAN_STATUS.pending && a.status !== LOAN_STATUS.pending) return 1;
        return (b.requestedAt || 0) - (a.requestedAt || 0);
      })
      .map(enrich);

    return {
      requests,
      pendingCount: requests.filter((request) => request.status === LOAN_STATUS.pending).length,
    };
  }

  function approve(id, actor, note = '') {
    const request = store.get('loanRequests', id);
    if (!request) throw notFound('الطلب غير موجود');
    if (request.status !== LOAN_STATUS.pending) {
      throw conflict('تمت مراجعة هذا الطلب بالفعل');
    }

    const employee = employeeOrThrow(request.empId);
    if (employee.active === false) throw conflict('لا يمكن اعتماد سلفة لموظف غير ساري');

    const date = clock.today();
    if (isLocked(date, employee.type, store.list('closes'))) {
      throw conflict(
        `فترة الموظف مقفولة حتى ${lastClosedDate(store.list('closes'), employee.type)}. افتح الفترة من برنامج الرواتب أولًا.`,
      );
    }

    const adminNote = text(note, { field: 'ملاحظة الإدارة', min: 0, max: 200 });
    const advanceNote = [
      'طلب سلفة من بوابة الموظفين',
      request.note ? `— ${request.note}` : '',
      adminNote ? `| ${adminNote}` : '',
    ]
      .filter(Boolean)
      .join(' ');

    const advance = store.add(
      'advances',
      buildAdvance({
        employeeId: employee.id,
        amount: request.amount,
        kind: request.kind,
        installments: request.installments,
        date,
        note: advanceNote.slice(0, 200),
        requestId: request.id,
      }),
    );

    store.update('loanRequests', id, {
      status: LOAN_STATUS.approved,
      decidedAt: Date.now(),
      decidedBy: actor.name || actor.username,
      adminNote,
      advanceId: advance.id,
    });

    audit.record({
      actor,
      action: 'loan.approve',
      target: employee.id,
      details: `اعتمد سلفة ${request.amount} — ${LOAN_KIND_LABEL[request.kind]}`,
    });

    return { request: enrich(store.get('loanRequests', id)), advance: publicAdvance(advance) };
  }

  function reject(id, actor, reason = '') {
    const request = store.get('loanRequests', id);
    if (!request) throw notFound('الطلب غير موجود');
    if (request.status !== LOAN_STATUS.pending) {
      throw conflict('تمت مراجعة هذا الطلب بالفعل');
    }

    const adminNote = text(reason, { field: 'سبب الرفض', min: 0, max: 200 });
    store.update('loanRequests', id, {
      status: LOAN_STATUS.rejected,
      decidedAt: Date.now(),
      decidedBy: actor.name || actor.username,
      adminNote,
    });

    audit.record({
      actor,
      action: 'loan.reject',
      target: request.empId,
      details: `رفض سلفة ${request.amount}${adminNote ? ` — ${adminNote}` : ''}`,
    });

    return enrich(store.get('loanRequests', id));
  }

  return {
    listForEmployee,
    createRequest,
    cancelRequest,
    listForAdmin,
    approve,
    reject,
    labels: LOAN_STATUS_LABEL,
    kindLabels: LOAN_KIND_LABEL,
  };
}

function publicAdvance(advance) {
  return {
    id: advance.id,
    date: advance.date,
    amount: Number(advance.amount) || 0,
    kind: advance.kind,
    installments: advance.n || null,
    paid: advance.paid || 0,
    paidAmount: round2(advance.paidAmt || 0),
    note: advance.note || '',
  };
}
