import React, { useState } from 'react';
import { TeacherActivity, StudentActivity } from './Activities';
import { summarizeActivity } from './activity-model';
export default function ActivityPreview() {
  const [activity, setActivity] = useState(null);
  const [answers, setAnswers] = useState({});
  return <main className="activity-demo"><p className="preview-banner">モード体験 · この画面内のみで動作し、実際の授業には送信しません。</p><div className="activity-demo-grid"><div><h1>先生の操作</h1><TeacherActivity activity={activity} answers={answers} participants={1}
    onStart={value => { setActivity(value); setAnswers({}); }}
    onClose={() => setActivity({ ...activity, phase: 'closed', results: summarizeActivity(activity, answers) })}
    onShare={() => setActivity({ ...activity, phase: 'results', sharedResults: summarizeActivity(activity, answers) })}
    onReturn={() => setActivity(null)} /></div><div><h1>学生の画面</h1>{activity ? <StudentActivity key={activity.id} activity={activity} answer={answers.student ?? null} onAnswer={value => setAnswers({student: value})} /> : <section className="activity-panel"><h2>通常の授業</h2><p>先生が回答を開始すると、ここに質問が表示されます。</p></section>}</div></div></main>;
}
