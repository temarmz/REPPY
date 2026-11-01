type ActivityEntry = { at: string; event: string; outcome: 'success' | 'error' | 'retry' };
const events: ActivityEntry[] = [];
// Event codes only. Never pass user content, URLs, account IDs or error messages.
export function recordActivity(event: string, outcome: ActivityEntry['outcome'] = 'success') {
  if (!/^[a-z0-9_.-]{1,100}$/i.test(event)) return;
  events.push({ at: new Date().toISOString(), event, outcome });
  if (events.length > 500) events.shift();
}
export function recordNavigation(path: string) {
  const parts = path.replace(/^#?\/?/, '').split(/[/?]/);
  const areas = ['student', 'trainer', 'profile', 'calendar', 'clients', 'notes', 'history', 'progress', 'sessions', 'workouts', 'design-kit', 'login', 'invite'];
  recordActivity(`screen.${parts.slice(0, 2).map((part) => areas.includes(part) ? part : 'other').join('.') || 'home'}`);
}
export function getActivityLog() { return events.map((event) => ({ ...event })); }
