/**
 * The payroll program treats every day up to the latest closing date as
 * locked. The same rule is applied here so the two applications never
 * disagree about which days can still change.
 */
export function lastClosedDate(closes, employeeType) {
  return (closes || [])
    .filter((close) => close.type === employeeType)
    .reduce((latest, close) => (String(close.to || '') > latest ? close.to : latest), '');
}

export function isLocked(date, employeeType, closes) {
  const limit = lastClosedDate(closes, employeeType);
  return Boolean(limit) && date <= limit;
}

export function lockInfo(closes, employeeType) {
  const until = lastClosedDate(closes, employeeType);
  return { locked: Boolean(until), until };
}
