import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  ResponsiveContainer, ComposedChart, Area, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Legend,
} from 'recharts';
import {
  Brain, Printer, TrendingUp, TrendingDown, Minus, Flame, Sparkles, MessageCircle, Star,
  Search, Users, Stethoscope, FlaskConical, RefreshCw, Info, AlertTriangle, CheckCircle2,
} from 'lucide-react';

// The Python memory service (port 8000) owns the memory game and this report.
const AI_URL = import.meta.env.VITE_AI_URL || `http://${window.location.hostname}:8000`;

// Validated (CVD-safe) colours: score vs MMSE, and the ordered "how much help" ramp.
const C = {
  ink: '#1C2B33', soft: '#5B6B73', faint: '#94A3AB', line: '#E7E2D9', paper: '#FFFDF8',
  score: '#0D9488', mmse: '#C2410C',
  free: '#0B6E66', hint: '#2FA597', choice: '#E0A458', missed: '#C2410C',
  finds: '#64748B', repeats: '#C2410C',
};
const CUES = [
  { key: 'free', label: 'Remembered alone', color: C.free },
  { key: 'hint', label: 'After a hint', color: C.hint },
  { key: 'choice', label: 'Picked from choices', color: C.choice },
  { key: 'missed', label: 'Not remembered', color: C.missed },
];
const TYPE_LABEL = {
  weekday: 'Day of the week', person_photo: 'Who is in the photo', who_visited: 'Who visited',
  visit_count: 'How many visitors', object_place: 'Where was the object', reveal: 'Hidden-object game',
  replay: 'Video clip question', time_of_day: 'When it happened',
  who_came: 'Who came to visit', visit_time: 'When the visit was', which_object: 'What was used',
  which_first: 'What happened first', talk: 'What was talked about',
  where_now: 'Where is it now', did_when: 'When was it done', used_for: 'What is it for', which_for: 'What was used for it',
};
const MOOD = { happy: '😊 happy', ok: '🙂 well', tired: '😴 tired', sad: '😢 sad' };

const fmtDay = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function ChartTip({ active, payload, label, unit = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur" style={{ borderColor: C.line }}>
      <p className="mb-1 font-semibold" style={{ color: C.ink }}>{fmtDay(label)}</p>
      {payload.filter((p) => p.value != null).map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2" style={{ color: C.soft }}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          {p.name}: <b style={{ color: C.ink }}>{typeof p.value === 'number' ? Math.round(p.value * 10) / 10 : p.value}{unit}</b>
        </p>
      ))}
    </div>
  );
}

function OrderedLegend({ items }) {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2 text-xs" style={{ color: C.soft }}>
      {items.map((it) => (
        <span key={it.key} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: it.color }} /> {it.label}
        </span>
      ))}
    </div>
  );
}

function Card({ title, subtitle, icon: Icon, children, className = '', right }) {
  return (
    <section className={`rounded-3xl border bg-white p-6 shadow-[0_1px_0_rgba(28,43,51,0.04)] break-inside-avoid ${className}`}
      style={{ borderColor: C.line }}>
      {(title || right) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: C.ink }}>
              {Icon && <Icon size={17} style={{ color: C.score }} />} {title}
            </h3>
            {subtitle && <p className="mt-0.5 text-xs" style={{ color: C.faint }}>{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

function ScoreRing({ value }) {
  const v = value ?? 0;
  const r = 52, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 128 128" className="h-32 w-32">
      <circle cx="64" cy="64" r={r} fill="none" stroke="#EEF2EF" strokeWidth="12" />
      <circle cx="64" cy="64" r={r} fill="none" stroke={C.score} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${(c * v) / 100} ${c}`} transform="rotate(-90 64 64)" />
      <text x="64" y="62" textAnchor="middle" fontSize="30" fontWeight="700" fill={C.ink}>{value == null ? '–' : Math.round(v)}</text>
      <text x="64" y="82" textAnchor="middle" fontSize="11" fill={C.faint}>of 100</text>
    </svg>
  );
}

function Stat({ label, value, note, icon: Icon, tone }) {
  const toneColor = tone === 'good' ? C.score : tone === 'warn' ? C.mmse : C.soft;
  return (
    <div className="rounded-2xl border px-4 py-3" style={{ borderColor: C.line, background: C.paper }}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.faint }}>
        {Icon && <Icon size={13} />} {label}
      </p>
      <p className="mt-1 text-2xl font-bold" style={{ color: C.ink }}>{value}</p>
      {note && <p className="text-xs font-medium" style={{ color: toneColor }}>{note}</p>}
    </div>
  );
}

const TREND = {
  improving: { icon: TrendingUp, text: 'Improving', tone: 'good' },
  stable: { icon: Minus, text: 'Stable', tone: 'neutral' },
  declining: { icon: TrendingDown, text: 'Going down', tone: 'warn' },
};

export default function MemoryReport() {
  const [patients, setPatients] = useState([]);
  // ?patient=<id> opens a specific patient's report directly (shareable link).
  const [pid, setPid] = useState(() => new URLSearchParams(window.location.search).get('patient') || '');
  const [days, setDays] = useState(30);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadPatients = async (select) => {
    try {
      const { data } = await axios.get(`${AI_URL}/memory-report-patients`);
      setPatients(data.patients || []);
      if (select) setPid(select);
      else if (!pid && data.patients?.length) setPid(data.patients[0].patient_id);
    } catch {
      setError(`Cannot reach the memory service at ${AI_URL}. Is the AI server running?`);
    }
  };

  useEffect(() => { loadPatients(); }, []);

  useEffect(() => {
    if (!pid) return;
    setLoading(true);
    setError('');
    axios.get(`${AI_URL}/memory-report/${pid}?days=${days}`)
      .then(({ data }) => setReport(data))
      .catch(() => setError('Could not load the report.'))
      .finally(() => setLoading(false));
  }, [pid, days]);

  const seedDemo = async () => {
    await axios.post(`${AI_URL}/memory-report/demo-seed`);
    await loadPatients('DEMO-PATIENT');
  };

  const chartData = useMemo(() => {
    if (!report) return [];
    const mmseByDay = Object.fromEntries((report.mmse || []).map((m) => [m.date, Math.round((m.total / 30) * 1000) / 10]));
    let run = [];
    return report.daily.map((d) => {
      if (d.score != null) run.push(d.score);
      run = run.slice(-7);
      return {
        ...d,
        mmse_pct: mmseByDay[d.date] ?? null,
        rolling: d.score != null && run.length >= 3 ? run.reduce((a, b) => a + b, 0) / run.length : null,
        other_finds: d.finds - d.repeats,
      };
    });
  }, [report]);

  const s = report?.summary;
  const trend = s?.trend ? TREND[s.trend] : null;
  const latestMmse = report?.mmse?.length ? report.mmse[report.mmse.length - 1] : null;
  const hasGames = s && s.sessions > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 print:max-w-none print:space-y-4" style={{ color: C.ink }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[28px] border p-7 print:p-4"
        style={{ borderColor: C.line, background: 'linear-gradient(135deg,#FFFDF8 0%,#F3F7F1 60%,#E6F2EE 100%)' }}>
        <svg className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 opacity-[0.10]" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke={C.score} strokeWidth="1.2" />
          <circle cx="50" cy="50" r="28" fill="none" stroke={C.score} strokeWidth="1.2" />
          <circle cx="50" cy="50" r="16" fill="none" stroke={C.score} strokeWidth="1.2" />
        </svg>
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: C.score }}>
              <Brain size={15} /> Memory Vault · Memory report
            </p>
            <h1 className="mt-2 font-serif text-[34px] leading-tight" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
              {report?.name || 'Memory report'}
            </h1>
            <p className="mt-1 text-sm" style={{ color: C.soft }}>
              Built from the daily voice memory game, the patient's own day, and the cognitive assessment (MMSE).
              {report && <> Generated {new Date(report.generated).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <select value={pid} onChange={(e) => setPid(e.target.value)}
              className="rounded-full border bg-white px-4 py-2 text-sm font-medium shadow-sm outline-none"
              style={{ borderColor: C.line }}>
              {patients.length === 0 && <option value="">No patients yet</option>}
              {patients.map((p) => (
                <option key={p.patient_id} value={p.patient_id}>
                  {p.name}{p.sessions ? ` · ${p.sessions} games` : ''}
                </option>
              ))}
            </select>
            <div className="flex rounded-full border bg-white p-1 shadow-sm" style={{ borderColor: C.line }}>
              {[7, 30, 90].map((d) => (
                <button key={d} onClick={() => setDays(d)}
                  className="rounded-full px-3 py-1 text-sm font-medium transition"
                  style={days === d ? { background: C.ink, color: '#fff' } : { color: C.soft }}>
                  {d}d
                </button>
              ))}
            </div>
            <button onClick={() => window.print()}
              className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm"
              style={{ background: C.score }}>
              <Printer size={15} /> Print / PDF
            </button>
          </div>
        </div>
      </div>

      {report?.simulated && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
          <FlaskConical size={18} /> Simulated demo data. It shows how the report looks after a few weeks of use; it is not a real patient.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">
          <AlertTriangle size={18} /> {error}
        </div>
      )}
      {loading && !report && <p className="text-sm" style={{ color: C.faint }}>Loading report…</p>}

      {report && !hasGames && (
        <Card>
          <div className="flex flex-col items-center py-10 text-center">
            <Sparkles size={34} style={{ color: C.score }} />
            <h3 className="mt-3 text-lg font-semibold">No memory games yet</h3>
            <p className="mt-1 max-w-md text-sm" style={{ color: C.soft }}>
              The patient plays a short voice game in the app ("Memory game" in Find My Things) after the evening story.
              Scores, trends and insights appear here after the first game.
            </p>
            <button onClick={seedDemo} className="mt-5 flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium"
              style={{ borderColor: C.line }}>
              <FlaskConical size={15} /> Show a demo report (simulated data)
            </button>
          </div>
        </Card>
      )}

      {report && hasGames && (
        <>
          {/* ── Headline ───────────────────────────────────────────────── */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Card className="flex flex-col items-center justify-center text-center">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.faint }}>Latest daily memory score</p>
              <ScoreRing value={s.latest_score} />
              <p className="text-sm" style={{ color: C.soft }}>
                {s.latest_date && fmtDay(s.latest_date)} · game level <b style={{ color: C.ink }}>{s.level}</b>
              </p>
              {trend && (
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold"
                  style={{ background: trend.tone === 'warn' ? '#FDECE4' : '#E3F4F1', color: trend.tone === 'warn' ? C.mmse : C.free }}>
                  <trend.icon size={15} /> {trend.text} ({s.slope_per_week > 0 ? '+' : ''}{s.slope_per_week}/week)
                </span>
              )}
            </Card>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <Stat label="7-day average" icon={Star} value={s.avg_7 ?? '–'}
                note={s.avg_prev_7 != null && s.avg_7 != null ? `${s.avg_7 - s.avg_prev_7 >= 0 ? '+' : ''}${Math.round((s.avg_7 - s.avg_prev_7) * 10) / 10} vs week before` : 'first week'}
                tone={s.avg_prev_7 != null && s.avg_7 < s.avg_prev_7 ? 'warn' : 'good'} />
              <Stat label="Remembered alone" icon={CheckCircle2} value={s.unaided_pct != null ? `${s.unaided_pct}%` : '–'} note="answers with no hint" />
              <Stat label="Play streak" icon={Flame} value={`${s.streak} day${s.streak === 1 ? '' : 's'}`} note={`${s.days_played_7} of last 7 days`} />
              <Stat label="Where-is questions" icon={Search} value={s.finds_7}
                note={`week before: ${s.finds_prev_7}`} tone={s.finds_7 > s.finds_prev_7 + 3 ? 'warn' : 'neutral'} />
              <Stat label="Games in period" icon={MessageCircle} value={s.sessions} note={`last ${report.days} days`} />
              <Stat label="Latest MMSE" icon={Stethoscope} value={latestMmse ? `${latestMmse.total}/30` : '–'}
                note={latestMmse ? `${latestMmse.severity || ''} · ${fmtDay(latestMmse.date)}` : 'no assessment linked'} />
            </div>
          </div>

          {/* ── Trend ─────────────────────────────────────────────────── */}
          <Card title="Daily memory score" icon={TrendingUp}
            subtitle="Score of each day's game (0–100). Dashed line: 7-day average. Orange dots: MMSE as a percentage of 30, on the same scale.">
            <div className="h-72">
              <ResponsiveContainer>
                <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.score} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={C.score} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#F0ECE4" />
                  <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: C.soft }} />
                  <Area isAnimationActive={false} type="monotone" dataKey="score" name="Daily score" stroke={C.score} strokeWidth={2}
                    fill="url(#scoreFill)" connectNulls dot={{ r: 3, fill: C.score, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} />
                  <Line isAnimationActive={false} type="monotone" dataKey="rolling" name="7-day average" stroke={C.ink} strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls />
                  <Scatter isAnimationActive={false} dataKey="mmse_pct" name="MMSE (% of 30)" fill={C.mmse} shape={(p) => (p.cy == null ? null :
                    <rect x={p.cx - 6} y={p.cy - 6} width={12} height={12} rx={3} fill={C.mmse} stroke="#fff" strokeWidth={2} />)} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* ── Help needed ──────────────────────────────────────────── */}
            <Card title="How much help was needed" icon={Sparkles}
              subtitle="Each answer by the cue it needed. More dark green = better free recall.">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={chartData.filter((d) => d.sessions)} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#F0ECE4" />
                    <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} minTickGap={16} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: '#F6F3EC' }} />
                    <Legend content={() => <OrderedLegend items={CUES} />} />
                    {CUES.map((c, i) => (
                      <Bar isAnimationActive={false} key={c.key} dataKey={c.key} name={c.label} stackId="cue" fill={c.color} stroke="#fff" strokeWidth={1}
                        radius={i === CUES.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={22} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* ── Domains ──────────────────────────────────────────────── */}
            <Card title="Memory areas" icon={Brain} subtitle="Score per area: this week compared with earlier in the period.">
              <div className="space-y-3.5">
                {report.domains.map((d) => (
                  <div key={d.key}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{d.label}</span>
                      <span style={{ color: C.soft }}>
                        <b style={{ color: C.ink }}>{d.now ?? '–'}{d.now != null && '%'}</b>
                        {d.before != null && <span className="ml-2 text-xs">before {d.before}%</span>}
                      </span>
                    </div>
                    <div className="relative h-3 rounded-full" style={{ background: '#F1EEE7' }}>
                      {d.before != null && (
                        <div className="absolute top-1/2 h-5 w-[3px] -translate-y-1/2 rounded" style={{ left: `calc(${d.before}% - 1px)`, background: C.faint }} />
                      )}
                      <div className="h-3 rounded-full" style={{ width: `${d.now ?? 0}%`, background: (d.now ?? 0) < 50 ? C.choice : C.score }} />
                    </div>
                  </div>
                ))}
                <p className="pt-1 text-xs" style={{ color: C.faint }}>Grey tick = earlier average. Areas under 50% are shown in amber and asked about more often.</p>
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            {/* ── Everyday signals ─────────────────────────────────────── */}
            <Card title="Everyday forgetting signals" icon={Search}
              subtitle={`"Where is my…?" questions asked in the app per day. Orange part: the same item asked again within 30 minutes.`}>
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#F0ECE4" />
                    <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: '#F6F3EC' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: C.soft }} />
                    <Bar isAnimationActive={false} dataKey="other_finds" name="Where-is questions" stackId="f" fill={C.finds} stroke="#fff" strokeWidth={1} maxBarSize={16} />
                    <Bar isAnimationActive={false} dataKey="repeats" name="Repeated" stackId="f" fill={C.repeats} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Most searched items" icon={Search} subtitle="What the patient most often asked to find.">
              {report.top_items.length === 0 && <p className="text-sm" style={{ color: C.faint }}>No searches in this period.</p>}
              <div className="space-y-3">
                {report.top_items.map((it) => {
                  const max = report.top_items[0].count;
                  return (
                    <div key={it.label} className="flex items-center gap-3">
                      <span className="w-32 truncate text-sm font-medium capitalize">{it.label}<span className="ml-1 text-xs" style={{ color: C.faint }}>{it.label_si}</span></span>
                      <div className="h-2.5 flex-1 rounded-full" style={{ background: '#F1EEE7' }}>
                        <div className="h-2.5 rounded-full" style={{ width: `${(100 * it.count) / max}%`, background: C.finds }} />
                      </div>
                      <span className="w-8 text-right text-sm font-semibold">{it.count}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Answer speed" icon={RefreshCw} subtitle="Average seconds before the first answer. Slower answers can be an early sign of difficulty.">
              <div className="h-52">
                <ResponsiveContainer>
                  <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#F0ECE4" />
                    <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip unit=" s" />} />
                    <Line isAnimationActive={false} type="monotone" dataKey="avg_response_s" name="Seconds to answer" stroke={C.ink} strokeWidth={2} connectNulls
                      dot={{ r: 3, fill: C.ink, stroke: '#fff', strokeWidth: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Cognitive assessment (MMSE)" icon={Stethoscope}
              subtitle="Read from the cognitive assessment component. Compared with the daily score from the 14 days before each test.">
              {report.mmse.length === 0 ? (
                <p className="text-sm" style={{ color: C.faint }}>
                  No completed MMSE is linked to this patient yet. It appears here automatically after the patient finishes an assessment.
                </p>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider" style={{ color: C.faint }}>
                        <th className="pb-2 font-semibold">Date</th><th className="pb-2 font-semibold">Score</th><th className="pb-2 font-semibold">Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.mmse.slice(-6).reverse().map((m, i) => (
                        <tr key={i} className="border-t" style={{ borderColor: C.line }}>
                          <td className="py-2">{fmtDay(m.date)}</td>
                          <td className="py-2 font-semibold">{m.total}/30</td>
                          <td className="py-2 capitalize">{m.severity || '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: C.paper, color: C.soft }}>
                    {report.mmse_correlation.r != null
                      ? <>Agreement with the daily score: <b style={{ color: C.ink }}>r = {report.mmse_correlation.r}</b> over {report.mmse_correlation.n} assessments.</>
                      : 'At least 3 assessments with nearby games are needed to compare the two scores.'}
                  </p>
                </>
              )}
            </Card>
          </div>

          {report.people.length > 0 && (
            <Card title="Time with people" icon={Users} subtitle="Visits recognised by the camera in this period.">
              <div className="flex flex-wrap gap-4">
                {report.people.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: C.line, background: C.paper }}>
                    {p.photo_url
                      ? <img src={p.photo_url} alt="" className="h-11 w-11 rounded-full object-cover" />
                      : <div className="h-11 w-11 rounded-full" style={{ background: '#E3F4F1' }} />}
                    <div>
                      <p className="text-sm font-semibold capitalize">{p.name || p.relation}</p>
                      <p className="text-xs capitalize" style={{ color: C.soft }}>{p.relation} · {p.minutes} min · {p.visits} visits</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {report.conversations?.length > 0 && (
            <Card title="What was talked about during visits" icon={MessageCircle}
              subtitle="Short summaries only, for family members who agreed. Audio and full transcripts are not kept.">
              <div className="grid gap-3 md:grid-cols-2">
                {report.conversations.map((c, i) => (
                  <div key={i} className="flex gap-3 rounded-2xl border p-4" style={{ borderColor: C.line, background: C.paper }}>
                    {c.photo_url
                      ? <img src={c.photo_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                      : <div className="h-12 w-12 shrink-0 rounded-full" style={{ background: '#E3F4F1' }} />}
                    <div className="min-w-0">
                      <p className="text-xs" style={{ color: C.faint }}>
                        {fmtDay(c.date)} · {c.time}{c.minutes ? ` · ${c.minutes} min` : ''} ·{' '}
                        <span className="capitalize">{c.person || c.relation}{c.person && c.relation ? ` (${c.relation})` : ''}</span>
                        {c.mood && <> · {c.mood}</>}
                      </p>
                      <p className="mt-1 text-sm" style={{ color: C.ink }}>{c.summary_en}</p>
                      {c.visitor_asked?.map((x, j) => <p key={`a${j}`} className="text-xs" style={{ color: C.soft }}>❓ Visitor asked: {x.en || x.si}</p>)}
                      {c.patient_said?.map((x, j) => <p key={`s${j}`} className="text-xs" style={{ color: C.soft }}>🗣 Patient said: {x.en || x.si}</p>)}
                      <p className="text-xs" style={{ color: C.soft }}>{c.summary_si}</p>
                      {(c.topics?.length > 0 || c.promises?.length > 0) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {c.topics?.map((t, j) => (
                            <span key={j} className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: '#E3F4F1', color: C.free }}>{t.en}</span>
                          ))}
                          {c.promises?.map((p, j) => (
                            <span key={`p${j}`} className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: '#FBEFD9', color: '#8A5A12' }}>
                              Plan: {p.en}{p.when_en ? ` (${p.when_en})` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {(report.routines?.some((r) => r.learned) || report.visit_reminders?.length > 0) && (
            <Card title="Learned routines and reminders" icon={RefreshCw}
              subtitle="Usual times learned from the camera (median of the first use each day). A reminder is spoken only if it has not been done by then.">
              <div className="grid gap-3 md:grid-cols-2">
                {report.routines.filter((r) => r.learned).map((r) => (
                  <div key={r.id} className="rounded-2xl border px-4 py-3" style={{ borderColor: r.flag ? '#F5C2A7' : C.line, background: C.paper }}>
                    <p className="text-sm font-semibold capitalize">{r.activity_en || r.label}</p>
                    <p className="text-xs" style={{ color: C.soft }}>
                      usually {r.usual_si} · seen {r.days_seen}/{r.days} days · reminder after {r.grace} min
                    </p>
                    <p className="mt-1 text-xs" style={{ color: r.done_today ? C.free : C.mmse }}>
                      {r.done_today ? 'Done today' : 'Not seen today yet'}
                      {r.reminded > 0 && <> · reminders that helped: {r.helped}/{r.reminded}</>}
                      {r.flag && <> · ⚠ often missed after a reminder</>}
                    </p>
                  </div>
                ))}
                {report.visit_reminders?.map((v) => (
                  <div key={v.id} className="rounded-2xl border px-4 py-3" style={{ borderColor: '#F6DFB0', background: '#FFF8EB' }}>
                    <p className="text-sm font-semibold">📅 {fmtDay(v.date)} - visit promised</p>
                    <p className="text-xs" style={{ color: C.soft }}>{v.who_si}: {v.promise_si}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ── Insights ─────────────────────────────────────────────── */}
          <Card title="What this means" icon={Info}>
            <ul className="grid gap-2.5 md:grid-cols-2">
              {report.insights.map((it, i) => (
                <li key={i} className={`flex gap-3 rounded-2xl px-4 py-3 text-sm ${it.tone === 'muted' ? 'md:col-span-2' : ''}`}
                  style={{
                    background: it.tone === 'warn' ? '#FDF1EA' : it.tone === 'good' ? '#E8F5F1' : it.tone === 'muted' ? 'transparent' : C.paper,
                    color: it.tone === 'muted' ? C.faint : C.ink,
                  }}>
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: it.tone === 'warn' ? C.mmse : it.tone === 'good' ? C.score : C.faint }} />
                  {it.text}
                </li>
              ))}
            </ul>
          </Card>

          {/* ── Conversations ────────────────────────────────────────── */}
          <Card title="Recent memory games" icon={MessageCircle} subtitle="Each game is a short spoken conversation about the patient's own day.">
            <div className="space-y-6">
              {report.recent_sessions.slice(0, 4).map((g) => (
                <div key={g.id} className="rounded-2xl border p-4" style={{ borderColor: C.line }}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{fmtDay(g.date)} · {g.time}{g.mood && <span className="ml-2 font-normal" style={{ color: C.soft }}>felt {MOOD[g.mood] || g.mood}</span>}</p>
                    <p className="flex items-center gap-2 text-sm" style={{ color: C.soft }}>
                      <span className="flex">{Array.from({ length: g.max_stars || 0 }).map((_, i) => (
                        <Star key={i} size={13} fill={i < g.stars ? '#E0A458' : 'none'} stroke={i < g.stars ? '#E0A458' : '#D6D0C4'} />
                      )).slice(0, 18)}</span>
                      <b style={{ color: C.ink }}>{g.score}</b>/100
                    </p>
                  </div>
                  <div className="space-y-3">
                    {g.questions.map((q, i) => {
                      const cue = q.points === 3 ? CUES[0] : q.points === 2 ? CUES[1] : q.points === 1 ? CUES[2] : CUES[3];
                      return (
                        <div key={i} className="grid gap-2 md:grid-cols-[1fr_auto]">
                          <div className="flex gap-3">
                            {(q.media?.urls?.[0] || q.answer_image)
                              ? <img src={q.media?.urls?.[0] || q.answer_image} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                              : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-2xl" style={{ background: '#F3F7F1' }}>
                                  {q.media?.emoji || q.media?.icon || (q.type === 'weekday' ? '📅' : '💬')}
                                </div>}
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.faint }}>
                                {TYPE_LABEL[q.type] || q.type}
                                {q.retry && <span className="ml-2 rounded-full px-2 py-0.5 normal-case tracking-normal" style={{ background: '#E3F4F1', color: C.free }}>asked again (practice)</span>}
                              </p>
                              {q.prompt_si && <p className="text-sm">{q.prompt_si}</p>}
                              <p className="text-xs" style={{ color: C.soft }}>{q.prompt_en}</p>
                              {(q.said || q.answer_en) && (
                                <p className="mt-1 text-xs" style={{ color: C.soft }}>
                                  {q.said && <>Patient: <b style={{ color: C.ink }}>“{q.said}”</b> · </>}
                                  {q.answer_en && <>Answer: {q.answer_si} ({q.answer_en})</>}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-start gap-2 md:justify-end">
                            <span className="whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: cue.color }}>
                              {cue.label}
                            </span>
                            {q.response_s != null && <span className="pt-1 text-xs" style={{ color: C.faint }}>{q.response_s}s</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* ── Data table (accessible view of the charts) ───────────── */}
          <Card title="Daily data" subtitle="The numbers behind the charts.">
            <div className="max-h-80 overflow-auto print:max-h-none">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-xs uppercase tracking-wider" style={{ color: C.faint }}>
                    {['Date', 'Score', 'Alone', 'Hint', 'Choices', 'Missed', 'Answer s', 'Where-is', 'Repeated', 'Visits', 'Moments'].map((h) => (
                      <th key={h} className="pb-2 pr-3 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...chartData].reverse().filter((d) => d.sessions || d.finds || d.visits || d.moments).map((d) => (
                    <tr key={d.date} className="border-t" style={{ borderColor: C.line }}>
                      <td className="py-1.5 pr-3">{fmtDay(d.date)}</td>
                      <td className="py-1.5 pr-3 font-semibold">{d.score ?? '–'}</td>
                      <td className="py-1.5 pr-3">{d.free}</td><td className="py-1.5 pr-3">{d.hint}</td>
                      <td className="py-1.5 pr-3">{d.choice}</td><td className="py-1.5 pr-3">{d.missed}</td>
                      <td className="py-1.5 pr-3">{d.avg_response_s ?? '–'}</td><td className="py-1.5 pr-3">{d.finds}</td>
                      <td className="py-1.5 pr-3">{d.repeats}</td><td className="py-1.5 pr-3">{d.visits}</td><td className="py-1.5 pr-3">{d.moments}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {!report.simulated && (
            <div className="flex justify-end print:hidden">
              <button onClick={seedDemo} className="flex items-center gap-2 text-xs" style={{ color: C.faint }}>
                <FlaskConical size={13} /> Load simulated demo patient
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
