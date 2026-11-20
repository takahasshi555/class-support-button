import React, { useState } from 'react';
import ClassPulse from './ClassPulse';
export default function PulsePreview() {
  const [count, setCount] = useState(2);
  const [wow, setWow] = useState(8);
  const history = { a: { label: '導入', wow: 3, createdAt: 1 }, b: { label: '活用例', wow: 12, createdAt: 2 }, c: { label: '演習', wow: 6, createdAt: 3 } };
  return <main className="pulse-preview"><h1>グラフ・休憩通知の体験</h1><p className="preview-banner">サンプルデータです。実際の授業には送信しません。</p><div className="activity-actions"><button onClick={() => setWow(n => n + 1)}>へぇーを増やす</button><button onClick={() => setCount(6)}>休憩希望を75％にする</button><button onClick={() => setCount(2)}>休憩希望を25％に戻す</button></div><ClassPulse wow={wow} breakCount={count} participants={8} history={history} roomId="PREVIEW-PULSE" topicLabel="今の話題" /></main>;
}
