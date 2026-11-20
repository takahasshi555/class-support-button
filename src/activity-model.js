export const understandingOptions = ['わかった', 'わからない', 'もう一回説明してほしい'];
export function summarizeActivity(activity, answers = {}) {
  const values = Object.values(answers).filter(value => typeof value === 'string');
  if (activity.kind === 'text') return { total: values.length, texts: values };
  const counts = (activity.options || []).map((_, index) => values.filter(value => value === String(index)).length);
  return { total: counts.reduce((sum, n) => sum + n, 0), counts };
}
export function makeActivity(kind, question, options, id) {
  const title = question.trim();
  if (!title || title.length > 120) throw new Error('質問を120文字以内で入力してください。');
  const choices = kind === 'understanding' ? understandingOptions : options.map(s => s.trim()).filter(Boolean);
  if (kind === 'choice' && (choices.length < 2 || choices.length > 6 || new Set(choices).size !== choices.length)) throw new Error('重複しない選択肢を2〜6個入力してください。');
  return { id, kind, question: title, phase: 'active', ...(kind !== 'text' ? { options: choices } : {}) };
}
