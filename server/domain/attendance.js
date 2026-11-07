/**
 * Attendance vocabulary shared with the payroll program. The payroll UI stores
 * the short status `نص` for a half day; the mobile UI shows the friendlier
 * label `نصف يوم`.
 */
export const STATUS = Object.freeze({
  present: 'حضور',
  absent: 'غياب',
  leave: 'إجازة',
  half: 'نص',
});

export const STATUS_VALUES = Object.freeze(Object.values(STATUS));
export const STATUS_LABELS = Object.freeze({
  [STATUS.present]: 'حضور',
  [STATUS.absent]: 'غياب',
  [STATUS.leave]: 'إجازة',
  [STATUS.half]: 'نصف يوم',
});

export function normalizeStatus(value) {
  if (value === 'نصف يوم' || value === 'نصف') return STATUS.half;
  return STATUS_VALUES.includes(value) ? value : null;
}

/** The payroll program uses `date_empId` as the attendance document id. */
export function attendanceId(date, employeeId) {
  return `${date}_${employeeId}`;
}

export function summarize(records) {
  const summary = {
    present: 0,
    late: 0,
    absent: 0,
    leave: 0,
    half: 0,
    recorded: records.length,
    workDays: 0,
  };
  for (const record of records) {
    if (record.st === STATUS.present) summary.present += 1;
    else if (record.st === STATUS.absent) summary.absent += 1;
    else if (record.st === STATUS.leave) summary.leave += 1;
    else if (record.st === STATUS.half) summary.half += 1;
    if (Number(record.lateMinutes) > 0) summary.late += 1;
  }
  summary.workDays = summary.present + summary.half * 0.5;
  return summary;
}
