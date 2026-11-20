export function advanceBreakAlert(state, { count, participants, threshold, now }) {
  const above = participants > 0 && count > 0 && count * 100 >= participants * threshold;
  if (!above) return state.reached ? { ...state, reached: false } : state;
  if (state.reached) return state;
  return { reached: true, pending: state.pending || { count, participants, threshold, at: now } };
}
export function acknowledgeBreakAlert(state) { return { ...state, pending: null }; }
export function buildWowSeries(history, current, label) {
  const recorded = Object.values(history || {}).sort((a, b) => a.createdAt - b.createdAt).slice(-5);
  return [...recorded.map(item => ({ label: item.label || '記録', value: Math.max(0, Number(item.wow) || 0) })), { label: label || '今の話題', value: Math.max(0, Number(current) || 0), current: true }];
}
