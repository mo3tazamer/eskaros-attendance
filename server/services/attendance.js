import { conflict, notFound } from '../lib/errors.js';
import { isLocked, lastClosedDate } from '../domain/locks.js';
import {
  STATUS,
  STATUS_VALUES,
  attendanceId,
  normalizeStatus,
  summarize,
} from '../domain/attendance.js';
import { lateness, monthOf, workedMinutes } from '../lib/time.js';

export function createAttendanceService({ store, clock, settings, audit }) {
  function recordFor(date, employeeId) {
    return store.get('attendance', attendanceId(date, employeeId));
  }

  function ensureEditable(employee, date) {
    const closes = store.list('closes');
    if (isLocked(date, employee.type, closes)) {
      throw conflict(
        `التاريخ ${date} يقع داخل فترة مقفولة (حتى ${lastClosedDate(closes, employee.type)}). راجع برنامج الرواتب.`,
      );
    }
  }

  function checkIn(employee, account) {
    const date = clock.today();
    const time = clock.time();
    ensureEditable(employee, date);

    const existing = recordFor(date, employee.id);
    if (existing && existing.st !== STATUS.present) {
      throw conflict('سجّلت الإدارة حالة أخرى لهذا اليوم. تواصل مع الإدارة لتعديلها.');
    }
    if (existing && existing.checkIn) {
      throw conflict('تم تسجيل حضورك اليوم بالفعل');
    }

    const late = lateness(time, settings.get().workStart, settings.get().lateGraceMinutes);
    const data = {
      emp: employee.id,
      date,
      st: STATUS.present,
      checkIn: time,
      checkOut: existing?.checkOut || '',
      lateMinutes: late,
      source: 'mobile',
      accountId: account.id,
      updatedAt: Date.now(),
    };

    const record = existing
      ? store.update('attendance', existing.id, data)
      : store.set('attendance', attendanceId(date, employee.id), data);

    audit.record({
      actor: account,
      action: 'attendance.check-in',
      target: employee.id,
      details: late > 0 ? `حضور متأخر ${late} دقيقة` : 'حضور في الموعد',
    });

    return {
      record,
      lateMinutes: late,
      message: late > 0 ? `تم تسجيل الحضور (متأخر ${late} دقيقة)` : 'تم تسجيل الحضور بنجاح',
    };
  }

  function checkOut(employee, account) {
    const date = clock.today();
    const time = clock.time();
    ensureEditable(employee, date);

    const existing = recordFor(date, employee.id);
    if (!existing || !existing.checkIn) {
      throw conflict('سجّل الحضور أولًا قبل تسجيل الانصراف');
    }
    if (existing.checkOut) throw conflict('تم تسجيل انصرافك اليوم بالفعل');

    const minutes = workedMinutes(existing.checkIn, time);
    const record = store.update('attendance', existing.id, {
      checkOut: time,
      workedMinutes: minutes,
      updatedAt: Date.now(),
    });

    audit.record({
      actor: account,
      action: 'attendance.check-out',
      target: employee.id,
      details: `انصراف بعد ${minutes} دقيقة`,
    });

    return { record, workedMinutes: minutes, message: 'تم تسجيل الانصراف بنجاح' };
  }

  function monthFor(employee, month) {
    const records = store
      .list('attendance')
      .filter((item) => item.emp === employee.id && monthOf(item.date) === month)
      .sort((a, b) => a.date.localeCompare(b.date));
    return {
      month,
      records: records.map(publicRecord),
      summary: summarize(records),
    };
  }

  function listForAdmin(date, { branch = '', query = '' } = {}) {
    const search = query.trim().toLowerCase();
    const closes = store.list('closes');
    const accounts = new Map(
      store
        .list('accounts')
        .filter((account) => account.role === 'employee')
        .map((account) => [account.empId, account]),
    );

    const employees = store
      .list('employees')
      .filter((employee) => employee.active !== false)
      .filter((employee) => !branch || employee.branch === branch)
      .filter((employee) => {
        if (!search) return true;
        return `${employee.name || ''} ${employee.id} ${employee.job || ''}`
          .toLowerCase()
          .includes(search);
      })
      .map((employee) => {
        const record = recordFor(date, employee.id);
        const limit = lastClosedDate(closes, employee.type);
        return {
          ...employee,
          hasAccount: accounts.has(employee.id),
          locked: Boolean(limit) && date <= limit,
          lockUntil: limit,
          record: record ? publicRecord(record) : null,
        };
      })
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'));

    const allRecords = store
      .list('attendance')
      .filter((item) => item.date === date)
      .filter((item) => employees.some((employee) => employee.id === item.emp));

    const branches = [
      ...new Set(
        store
          .list('employees')
          .filter((employee) => employee.active !== false && employee.branch)
          .map((employee) => employee.branch),
      ),
    ].sort((a, b) => a.localeCompare(b, 'ar'));

    return {
      date,
      employees,
      branches,
      summary: summarizeDate(employees, allRecords),
    };
  }

  function summarizeDate(employees, records) {
    const active = employees.length;
    const recorded = records.length;
    return {
      active,
      recorded,
      present: records.filter((item) => item.st === STATUS.present).length,
      late: records.filter((item) => Number(item.lateMinutes) > 0).length,
      half: records.filter((item) => item.st === STATUS.half).length,
      leave: records.filter((item) => item.st === STATUS.leave).length,
      absent: records.filter((item) => item.st === STATUS.absent).length,
      notRecorded: Math.max(0, active - recorded),
    };
  }

  function setByAdmin({ employee, date, status, actor }) {
    const normalized = status === 'none' ? 'none' : normalizeStatus(status);
    if (normalized === null) throw conflict('حالة الحضور غير صالحة');
    ensureEditable(employee, date);

    const id = attendanceId(date, employee.id);
    const existing = store.get('attendance', id);

    if (normalized === 'none') {
      if (existing) store.remove('attendance', id);
      audit.record({
        actor,
        action: 'attendance.clear',
        target: employee.id,
        details: `مسح تسجيل ${date}`,
      });
      return { record: null };
    }

    const data = {
      emp: employee.id,
      date,
      st: normalized,
      source: 'admin',
      updatedBy: actor.name || actor.username,
      updatedAt: Date.now(),
    };

    if (normalized === STATUS.present) {
      data.checkIn = existing?.checkIn || '';
      data.checkOut = existing?.checkOut || '';
      data.lateMinutes = existing?.lateMinutes || 0;
      data.workedMinutes = existing?.workedMinutes || 0;
    }

    const record = existing
      ? store.update('attendance', id, data)
      : store.set('attendance', id, data);

    audit.record({
      actor,
      action: 'attendance.set',
      target: employee.id,
      details: `تسجيل ${date} كـ ${normalized}`,
    });

    return { record: publicRecord(record) };
  }

  function bulkPresent({ date, branch, actor }) {
    const employees = store.list('employees').filter((employee) => {
      if (employee.active === false) return false;
      if (branch && employee.branch !== branch) return false;
      return true;
    });

    let count = 0;
    let skipped = 0;
    for (const employee of employees) {
      if (recordFor(date, employee.id)) continue;
      if (isLocked(date, employee.type, store.list('closes'))) {
        skipped += 1;
        continue;
      }
      store.set('attendance', attendanceId(date, employee.id), {
        emp: employee.id,
        date,
        st: STATUS.present,
        source: 'admin-bulk',
        updatedBy: actor.name || actor.username,
        updatedAt: Date.now(),
      });
      count += 1;
    }

    audit.record({
      actor,
      action: 'attendance.bulk-present',
      details: `تسجيل ${count} موظفًا حاضرين يوم ${date}`,
    });
    return { count, skipped };
  }

  function employeeById(id) {
    const employee = store.get('employees', id);
    if (!employee) throw notFound('الموظف غير موجود');
    return employee;
  }

  function closureInfo(employee) {
    return {
      type: employee.type,
      until: lastClosedDate(store.list('closes'), employee.type),
    };
  }

  return {
    checkIn,
    checkOut,
    monthFor,
    listForAdmin,
    setByAdmin,
    bulkPresent,
    employeeById,
    closureInfo,
    recordFor,
    toPublic: publicRecord,
    statuses: STATUS_VALUES,
    labels: STATUS_VALUES,
  };
}

function publicRecord(record) {
  return {
    date: record.date,
    st: record.st,
    checkIn: record.checkIn || '',
    checkOut: record.checkOut || '',
    lateMinutes: Number(record.lateMinutes) || 0,
    workedMinutes: Number(record.workedMinutes) || 0,
    source: record.source || 'payroll',
  };
}
