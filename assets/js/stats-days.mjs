export const PUBLIC_LAUNCH_DAY = '2026-10-28';
export const STATS_TIME_ZONE = 'America/Los_Angeles';

const pacificDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: STATS_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
});
export const calendarDay = value => pacificDate.format(value);

// Calendar dates are stepped in UTC so Pacific daylight-saving changes cannot skip or repeat a column.
// The service keeps thirty days; dates before that window stay unknown rather than becoming false zeroes.
export function dailySeries(rows, updated = new Date(), now = new Date()) {
  const today = calendarDay(now);
  const end = calendarDay(updated) < today ? calendarDay(updated) : today;
  const values = new Map(rows.map(row => [row.date, row.games]));
  const firstAvailable = [...values.keys()].sort()[0];
  const days = [];
  for (let date = Date.parse(PUBLIC_LAUNCH_DAY + 'T00:00:00Z'); date <= Date.parse(end + 'T00:00:00Z'); date += 86400000) {
    const key = new Date(date).toISOString().slice(0, 10);
    days.push({ date: key, games: firstAvailable && key >= firstAvailable ? values.get(key) ?? 0 : null, today: key === today });
  }
  return days;
}
