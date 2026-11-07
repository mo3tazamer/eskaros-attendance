import { dateIn, timeIn } from './time.js';

/** A clock bound to the time zone configured in the app settings. */
export function createClock(getTimeZone) {
  return {
    now: () => new Date(),
    today: () => dateIn(new Date(), getTimeZone()),
    time: () => timeIn(new Date(), getTimeZone()),
    todayAt: (date) => dateIn(date, getTimeZone()),
    timeAt: (date) => timeIn(date, getTimeZone()),
  };
}
