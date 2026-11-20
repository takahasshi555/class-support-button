import React from 'react';
import { Lightbulb, Coffee } from 'lucide-react';
import BreakNotifier from './BreakNotifier';
import { buildWowSeries } from './class-pulse-model';

export default function ClassPulse({ wow, breakCount, participants, history, roomId, topicLabel, ready = true, compact = false, showNotifier = true }) {
  const series = buildWowSeries(history, wow, topicLabel);
  const max = Math.max(1, ...series.map(item => item.value));
  const rate = participants > 0 ? Math.round(breakCount / participants * 100) : 0;
  const chartRate = Math.min(100, Math.max(0, rate));
  return <section className={`class-pulse ${compact ? "pulse-compact" : ""}`} aria-labelledby="class-pulse-title">
    <div className="flow-section-heading"><Lightbulb size={20} /><div><strong id="class-pulse-title">授業中のリアクション</strong><small>興味の反応と、休憩の希望をひと目で</small></div></div>
    <div className="pulse-charts"><section className="pulse-chart" aria-label="へぇーのグラフ"><h3><Lightbulb size={18} />へぇー <strong>{wow}回</strong></h3><p>話題ごとに押された回数</p>
      <div className="wow-bars" role="list" aria-label="直近の話題別へぇー回数">{series.map((item, index) => <div className={`wow-column ${item.current ? 'current' : ''}`} key={index} role="listitem" aria-label={`${item.label}：${item.value}回${item.current ? '（集計中）' : ''}`}><span className="wow-value">{item.value}</span><div className="wow-track"><div className="wow-bar" style={{height: `${item.value / max * 100}%`}} /></div><span className="wow-topic" title={item.label}>{item.current ? '今の話題' : item.label}</span></div>)}</div>
      <small>同じ学生が複数回押せます。人数・割合ではありません。記録すると話題ごとの棒が増えます。</small>
    </section><section className="pulse-chart" aria-label="休憩希望のグラフ"><h3><Coffee size={18} />休憩したい <strong>{breakCount}人</strong></h3><p>参加者のうち、現在休憩を希望している割合</p><div className="break-chart-layout"><div className="break-donut" role="img" aria-label={participants ? `${participants}人中${breakCount}人が休憩を希望、${rate}パーセント` : '参加者がいません'} style={{background: `conic-gradient(#d46b36 ${chartRate}%, #eeeaf4 0)`}}><span><strong>{participants ? `${rate}％` : '—'}</strong><small>{breakCount} / {participants}人</small></span></div><div className="break-legend"><span><i />休憩希望 {breakCount}人</span><span><i />希望なし {Math.max(0, participants - breakCount)}人</span></div></div><small>集計対象はこのルームに参加した人数です。退室した学生も含みます。</small></section></div>
    {showNotifier && <BreakNotifier ready={ready} key={roomId} count={breakCount} participants={participants} roomId={roomId} />}
  </section>;
}
