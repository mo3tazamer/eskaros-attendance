import { summarize } from '../domain/attendance.js';
import { openBalance } from '../domain/loans.js';

/** Aggregated numbers for the admin dashboard. */
export function createDashboardService({ store, clock, settings }) {
  function overview() {
    const today = clock.today();
    const employees = store.list('employees').filter((employee) => employee.active !== false);
    const activeIds = new Set(employees.map((employee) => employee.id));
    const records = store
      .list('attendance')
      .filter((record) => record.date === today && activeIds.has(record.emp));

    const attendance = summarize(records);
    const accounts = store
      .list('accounts')
      .filter((account) => account.role === 'employee' && account.active !== false);
    const accountedIds = new Set(accounts.map((account) => account.empId));

    const pending = store
      .list('loanRequests')
      .filter((request) => request.status === 'pending')
      .sort((a, b) => (a.requestedAt || 0) - (b.requestedAt || 0))
      .map((request) => {
        const employee = store.get('employees', request.empId) || {};
        return {
          id: request.id,
          empId: request.empId,
          empName: employee.name || request.empName || '',
          amount: request.amount,
          kind: request.kind,
          installments: request.installments || null,
          note: request.note || '',
          date: request.date,
          requestedAt: request.requestedAt,
        };
      });

    const advances = store.list('advances');
    const closes = store.list('closes');
    const openLoans = employees.reduce(
      (total, employee) => total + openBalance(advances, employee, closes),
      0,
    );

    return {
      today,
      now: clock.time(),
      company: settings.company(),
      settings: {
        workStart: settings.get().workStart,
        workEnd: settings.get().workEnd,
        currency: settings.get().currency,
        timezone: settings.get().timezone,
      },
      payrollReady: store.count('employees') > 0,
      payrollUserCount: store.count('users'),
      stats: {
        activeEmployees: employees.length,
        withAccounts: accounts.length,
        withoutAccounts: employees.filter((employee) => !accountedIds.has(employee.id)).length,
        recorded: attendance.recorded,
        present: attendance.present,
        half: attendance.half,
        leave: attendance.leave,
        absent: attendance.absent,
        late: attendance.late,
        notRecorded: Math.max(0, employees.length - attendance.recorded),
        pendingLoans: pending.length,
        openLoans: Math.round(openLoans * 100) / 100,
      },
      pending: pending.slice(0, 4),
    };
  }

  return { overview };
}
