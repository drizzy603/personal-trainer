// Seed realistic demo data for App Store screenshots.
// Paste into the running app's Web Inspector console (Safari → Develop →
// Simulator → app webview), then refresh the page.
// Clears existing data first. Do NOT run on real-user data.

(function () {
  const KEYS = ['kt_sessions','kt_runs','kt_sports','kt_weights','kt_prs',
    'kt_week','kt_bw','kt_routine','kt_routine_backup','kt_measurements',
    'kt_custom_ex','kt_skips','kt_bench_goal','kt_squat_goal','kt_5k_goal',
    'kt_bw_goal','kt_run_goal','kt_coach_msgs'];
  KEYS.forEach(k => localStorage.removeItem(k));

  const today = new Date();
  const iso = d => d.toISOString().slice(0, 10);
  const daysAgo = n => { const d = new Date(today); d.setDate(d.getDate() - n); return iso(d); };

  // ── Programme: 12-week hypertrophy block, currently in week 6 ──────────
  const blocks = [
    { range: [1, 4],  name: 'BASE',  color: '#c8ff00' },
    { range: [5, 8],  name: 'BUILD', color: '#60a5fa' },
    { range: [9, 11], name: 'PEAK',  color: '#f97316' },
    { range: [12, 12], name: 'DELOAD', color: '#a78bfa' },
  ];
  const blockFor = wk => blocks.find(b => wk >= b.range[0] && wk <= b.range[1]);

  const pushDay = wk => [
    { name: 'Bench Press',             sets: 4, reps: 8,  weight: 145 + wk * 2.5, isMain: true, pr: wk === 6 },
    { name: 'Overhead Press',          sets: 4, reps: 8,  weight: 95  + wk },
    { name: 'Incline Dumbbell Press',  sets: 3, reps: 10, weight: 55  + wk },
    { name: 'Cable Triceps Pushdown',  sets: 3, reps: 12, weight: 50  + wk },
    { name: 'Lateral Raise',           sets: 3, reps: 15, weight: 17.5 },
  ];
  const pullDay = wk => [
    { name: 'Barbell Row',             sets: 4, reps: 8,  weight: 135 + wk * 2.5, isMain: true },
    { name: 'Lat Pulldown',            sets: 4, reps: 10, weight: 130 + wk },
    { name: 'Seated Cable Row',        sets: 3, reps: 12, weight: 110 + wk },
    { name: 'Face Pull',               sets: 3, reps: 15, weight: 35 },
    { name: 'Barbell Curl',            sets: 3, reps: 10, weight: 65  + wk },
  ];
  const legsDay = wk => [
    { name: 'Back Squat',              sets: 4, reps: 6,  weight: 205 + wk * 5, isMain: true },
    { name: 'Romanian Deadlift',       sets: 4, reps: 8,  weight: 185 + wk * 2.5 },
    { name: 'Leg Press',               sets: 3, reps: 10, weight: 360 + wk * 5 },
    { name: 'Walking Lunges',          sets: 3, reps: 12, weight: 35 },
    { name: 'Standing Calf Raise',     sets: 4, reps: 15, weight: 90 },
  ];

  const weeks = [];
  const wkNotes = {
    1: 'Get the rust off — leave 2 reps in reserve every set.',
    2: 'Add 5 lb to mains. Same RIR.',
    3: 'Push to RIR 1 on the last set of each main.',
    4: 'Final base week — push volume to its peak before deload.',
    5: 'Build phase begins. Dial intensity up, drop a back-off set.',
    6: 'PR attempt on bench this week — go for it on the main lift.',
    7: 'Heavy day: top set of 3 on squat and bench.',
    8: 'Back-off volume before peak.',
    9: 'Peak — heaviest singles of the cycle.',
    10: 'Test set: 2RM on bench and squat.',
    11: 'Final peak. Last all-out session before deload.',
    12: 'Deload. 50% volume. Movement and recovery only.',
  };

  // Mixed cadence: Tue=Run, Sat=Cycling. Exercises both the runs:{} and
  // sports:{} read paths so a single seed verifies both flows after the
  // Option C refactor.
  for (let w = 1; w <= 12; w++) {
    const b = blockFor(w);
    weeks.push({
      wk: w, block: blocks.indexOf(b) + 1, bName: b.name, bColor: b.color,
      wkNote: wkNotes[w] || '',
      push: pushDay(w), pull: pullDay(w), legs: legsDay(w),
      runs: {
        Tue: { distance: 5, paceMin: 9, paceSec: 30, note: 'Easy zone-2.' },
      },
      sports: {
        Sat: { type: 'Cycling', note: 'Long ride — 25-30 km, zone-2.' },
      },
    });
  }

  localStorage.setItem('kt_routine', JSON.stringify({
    name: 'Roberto’s Hypertrophy Block',
    weekPlan: ['Push','Run','Rest','Pull','Legs','Cycling','Rest'],
    weeks,
  }));
  localStorage.setItem('kt_week', '6');

  // ── Logged sessions: previous 5 weeks of consistent training ───────────
  const sessions = [];
  let id = Date.now();
  const setLog = (reps, weight, rpe) => ({ reps, weight, rpe });
  for (let wk = 1; wk <= 5; wk++) {
    const baseDay = (5 - wk) * 7; // weeks back
    [
      { type: 'Push', dayOffset: 0, exs: pushDay(wk) },
      { type: 'Pull', dayOffset: 3, exs: pullDay(wk) },
      { type: 'Legs', dayOffset: 4, exs: legsDay(wk) },
    ].forEach(({ type, dayOffset, exs }) => {
      sessions.unshift({
        id: id++, date: daysAgo(baseDay + (6 - dayOffset)),
        type, week: wk,
        exercises: exs.map(e => ({
          name: e.name,
          sets: Array.from({ length: e.sets }, () => setLog(e.reps, e.weight, e.isMain ? 8 : 7)),
          note: '',
        })),
        note: '',
      });
    });
  }
  // Plus this week's Push (logged today)
  sessions.unshift({
    id: id++, date: daysAgo(0), type: 'Push', week: 6,
    exercises: pushDay(6).map(e => ({
      name: e.name,
      sets: Array.from({ length: e.sets }, () => setLog(e.reps, e.weight, e.isMain ? 9 : 8)),
      note: '',
    })),
    note: 'Bench PR! 155×8 felt strong.',
    prs: [{ ex: 'Bench Press', weight: 155, reps: 8 }],
  });
  localStorage.setItem('kt_sessions', JSON.stringify(sessions));

  // ── PRs ────────────────────────────────────────────────────────────────
  localStorage.setItem('kt_prs', JSON.stringify([
    { ex: 'Bench Press', weight: 155, reps: 8, date: daysAgo(0) },
    { ex: 'Back Squat',  weight: 235, reps: 6, date: daysAgo(2) },
    { ex: 'Barbell Row', weight: 152, reps: 8, date: daysAgo(4) },
  ]));

  // ── Bodyweight history: slight lean over 6 weeks ───────────────────────
  const bws = [];
  for (let i = 42; i >= 0; i -= 3) {
    bws.push({ date: daysAgo(i), weight: +(180 - (42 - i) * 0.12).toFixed(1) });
  }
  localStorage.setItem('kt_bw', JSON.stringify(bws));

  // ── Runs: a handful of zone-2 + long runs over the last few weeks ──────
  const runs = [];
  let runId = Date.now() - 1000;
  for (let i = 0; i < 8; i++) {
    const isLong = i % 3 === 0;
    runs.unshift({
      id: runId++,
      date: daysAgo(i * 4 + 1),
      distance: isLong ? 8 + (Math.random() * 2 - 1) : 5,
      paceMin: isLong ? 9 : 9,
      paceSec: isLong ? 0 : 30,
      hr: 145 + (isLong ? -5 : 0),
      note: isLong ? 'Long run.' : 'Easy zone-2.',
    });
  }
  localStorage.setItem('kt_runs', JSON.stringify(runs));

  // ── Goals ──────────────────────────────────────────────────────────────
  localStorage.setItem('kt_bench_goal', '225');
  localStorage.setItem('kt_squat_goal', '315');
  localStorage.setItem('kt_5k_goal',    '1500'); // 25:00 in seconds
  localStorage.setItem('kt_bw_goal',    '175');

  console.log('Demo data seeded. Refresh the page.');
})();
