import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, Check, Trash2, Pencil, ChevronLeft, ChevronRight,
  Home, Calendar, CalendarDays, Grid3x3, LayoutGrid, Clock
} from 'lucide-react';

import { supabase } from './supabaseClient.js';

/* ---------------------------------------------------------------- */
/* Supabase <-> task field mapping (DB uses snake_case columns)      */
/* ---------------------------------------------------------------- */

function rowToTask(row) {
  return {
    id: row.id,
    date: row.date,
    startTime: row.start_time || '',
    endTime: row.end_time || '',
    name: row.name,
    category: row.category,
    status: row.status,
    priority: row.priority,
    project: row.project || '',
    notes: row.notes || '',
    calendarEventId: row.calendar_event_id,
  };
}

function taskToRow(task, userId) {
  return {
    id: task.id,
    user_id: userId,
    date: task.date,
    start_time: task.startTime || null,
    end_time: task.endTime || null,
    name: task.name,
    category: task.category,
    status: task.status,
    priority: task.priority,
    project: task.project || null,
    notes: task.notes || null,
    calendar_event_id: task.calendarEventId || null,
  };
}

/* ---------------------------------------------------------------- */
/* Constants                                                         */
/* ---------------------------------------------------------------- */

const STATUS_LIST = ['Planned', 'In Progress', 'Done', 'Skipped', 'Rescheduled'];
const CATEGORY_LIST = ['College', 'Work', 'Personal', 'Health', 'Errand', 'Social', 'Other'];
const PRIORITY_LIST = ['High', 'Medium', 'Low'];
const PROJECT_SUGGESTIONS = ['College', 'Personal', 'Finance', 'Trading', 'Work', 'Health', 'Errand', 'Social', 'Other'];
const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: Home },
  { key: 'day', label: 'Day', icon: Calendar },
  { key: 'week', label: 'Week', icon: CalendarDays },
  { key: 'month', label: 'Month', icon: Grid3x3 },
  { key: 'kanban', label: 'Kanban', icon: LayoutGrid },
];

const CATEGORY_COLORS = {
  College: '#4A6FA5',
  Work: '#6B5B95',
  Personal: '#2D5F4C',
  Health: '#AF4B41',
  Errand: '#B8862E',
  Social: '#3E8E8A',
  Other: '#78808C',
};

const PRIORITY_COLORS = { High: '#AF4B41', Medium: '#B8862E', Low: '#8B93A0' };

const STATUS_STYLE = {
  Planned: { color: '#78808C', bg: '#F0F1EF' },
  'In Progress': { color: '#B8862E', bg: '#FBF2E1' },
  Done: { color: '#2D5F4C', bg: '#E7F0EB' },
  Skipped: { color: '#AF4B41', bg: '#F8E9E7' },
  Rescheduled: { color: '#4A6FA5', bg: '#E9EEF5' },
};

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* ---------------------------------------------------------------- */
/* Date helpers                                                      */
/* ---------------------------------------------------------------- */

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
};
const startOfWeek = (d) => {
  const nd = new Date(d);
  const day = (nd.getDay() + 6) % 7; // Monday = 0
  nd.setDate(nd.getDate() - day);
  nd.setHours(0, 0, 0, 0);
  return nd;
};
const longDate = (iso) =>
  parseISO(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const shortDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const monthLabel = (d) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

function generateId(tasks) {
  let max = 0;
  tasks.forEach((t) => {
    const m = /^A(\d+)$/.exec(t.id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'A' + pad(max + 1).padStart(3, '0');
}

function monthMatrix(anchor) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const weeks = [];
  let cursor = gridStart;
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
    if (cursor > new Date(anchor.getFullYear(), anchor.getMonth() + 1, 6) && w >= 3) break;
  }
  return weeks;
}

/* ---------------------------------------------------------------- */
/* Small presentational bits                                         */
/* ---------------------------------------------------------------- */

function Dot({ color }) {
  return <span className="dot" style={{ background: color }} />;
}

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Planned;
  return (
    <span className="badge" style={{ color: s.color, background: s.bg }}>
      {status}
    </span>
  );
}

function StatusToggle({ task, onCycle }) {
  const order = ['Planned', 'In Progress', 'Done'];
  const idx = order.indexOf(task.status);
  const icon = task.status === 'Done' ? <Check size={13} /> : idx === 1 ? <ChevronRight size={13} /> : null;
  return (
    <button
      className={`status-toggle st-${idx === -1 ? 0 : idx}`}
      onClick={(e) => { e.stopPropagation(); onCycle(task); }}
      title="Cycle status"
      aria-label="Change status"
    >
      {icon}
    </button>
  );
}

/* ---------------------------------------------------------------- */
/* Task modal (add / edit)                                           */
/* ---------------------------------------------------------------- */

function TaskModal({ mode, data, onCancel, onSave, onDelete }) {
  const [form, setForm] = useState(data);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.name || !form.name.trim() || !form.date) return;
    onSave(form);
  };

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <h3>{mode === 'add' ? 'Add Activity' : 'Edit Activity'}</h3>
          <button type="button" className="icon-btn" onClick={onCancel}><X size={18} /></button>
        </div>

        <label className="field">
          <span>Activity name</span>
          <input autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Kuliah Algoritma" required />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Date</span>
            <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required />
          </label>
          <label className="field">
            <span>Start</span>
            <input type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
          </label>
          <label className="field">
            <span>End</span>
            <input type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>Category</span>
            <select value={form.category} onChange={(e) => set('category', e.target.value)}>
              {CATEGORY_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Priority</span>
            <select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
              {PRIORITY_LIST.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={form.status} onChange={(e) => set('status', e.target.value)}>
              {STATUS_LIST.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>

        <label className="field">
          <span>Project / Area</span>
          <input list="project-suggestions" value={form.project} onChange={(e) => set('project', e.target.value)} placeholder="e.g. College" />
          <datalist id="project-suggestions">
            {PROJECT_SUGGESTIONS.map((p) => <option key={p} value={p} />)}
          </datalist>
        </label>

        <label className="field">
          <span>Notes</span>
          <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optional" />
        </label>

        <div className="modal-actions">
          {mode === 'edit' && (
            <button type="button" className="btn-danger" onClick={() => onDelete(form.id)}>
              <Trash2 size={14} /> Delete
            </button>
          )}
          <div className="spacer" />
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary">Save</button>
        </div>
      </form>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Main app                                                          */
/* ---------------------------------------------------------------- */

/* ---------------------------------------------------------------- */
/* Login screen (email magic link — same login works on any device) */
/* ---------------------------------------------------------------- */

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setError(error.message); else setSent(true);
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="brand" style={{ marginBottom: 4 }}>Planner</div>
        <p className="subhead" style={{ margin: '0 0 18px' }}>Sign in to sync your activities across every device.</p>
        {sent ? (
          <div className="login-sent">
            Check <strong>{email}</strong> for a sign-in link, then open it on this device.
          </div>
        ) : (
          <>
            <label className="field">
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus />
            </label>
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="btn-primary" disabled={busy} style={{ marginTop: 6 }}>
              {busy ? 'Sending…' : 'Send sign-in link'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

export default function ActivityTracker() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState('dashboard');
  const [selectedDate, setSelectedDate] = useState(() => isoDate(new Date()));
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [modal, setModal] = useState(null); // { mode, data }

  // --- auth: complete the magic-link callback (if we just came back from
  //     the email link), then pick up the session and listen for changes ---
  useEffect(() => {
    let mounted = true;

    const completeMagicLinkCallback = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const tokenHash = url.searchParams.get('token_hash');
      const type = url.searchParams.get('type');

      try {
        if (code) {
          // PKCE flow: the email link comes back as ?code=...
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) console.error('exchangeCodeForSession failed', error);
        } else if (tokenHash && type) {
          // token_hash flow: some Supabase email templates use this instead
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
          if (error) console.error('verifyOtp failed', error);
        }
      } finally {
        if (code || tokenHash) {
          // drop the auth params so we don't try to re-consume them on reload
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    };

    (async () => {
      await completeMagicLinkCallback();
      const { data } = await supabase.auth.getSession();
      if (mounted) setSession(data.session ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (mounted) setSession(s);
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const fetchTasks = useCallback(async (userId) => {
    const { data, error } = await supabase.from('tasks').select('*').eq('user_id', userId).order('date');
    if (error) { console.error('Fetch tasks failed', error); return; }
    setTasks((data || []).map(rowToTask));
  }, []);

  // --- load this user's tasks once signed in, then stay in sync in realtime ---
  useEffect(() => {
    if (!session) { setLoaded(session === null); return; }
    let channel;
    (async () => {
      await fetchTasks(session.user.id);
      setLoaded(true);
      channel = supabase
        .channel('tasks-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${session.user.id}` },
          () => fetchTasks(session.user.id))
        .subscribe();
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [session, fetchTasks]);

  const addTask = async (data) => {
    const id = generateId(tasks);
    const task = { calendarEventId: null, ...data, id };
    setTasks((prev) => [...prev, task]); // optimistic
    const { error } = await supabase.from('tasks').insert(taskToRow(task, session.user.id));
    if (error) { console.error('Add task failed', error); fetchTasks(session.user.id); }
  };

  const updateTask = async (id, data) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t))); // optimistic
    const full = { ...tasks.find((t) => t.id === id), ...data };
    const { error } = await supabase.from('tasks').update(taskToRow(full, session.user.id)).eq('id', id);
    if (error) { console.error('Update task failed', error); fetchTasks(session.user.id); }
  };

  const deleteTask = async (id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id)); // optimistic
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) { console.error('Delete task failed', error); fetchTasks(session.user.id); }
  };

  const cycleStatus = (task) => {
    const order = ['Planned', 'In Progress', 'Done'];
    const idx = order.indexOf(task.status);
    updateTask(task.id, { status: idx === -1 ? 'Planned' : order[(idx + 1) % order.length] });
  };
  const setStatus = (task, status) => updateTask(task.id, { status });

  const openAdd = (date) => setModal({
    mode: 'add',
    data: { name: '', date: date || selectedDate, startTime: '09:00', endTime: '10:00', category: 'Personal', priority: 'Medium', project: '', status: 'Planned', notes: '' },
  });
  const openEdit = (task) => setModal({ mode: 'edit', data: { ...task } });
  const closeModal = () => setModal(null);
  const saveModal = (data) => {
    if (modal.mode === 'add') addTask(data); else updateTask(data.id, data);
    closeModal();
  };
  const deleteFromModal = (id) => { deleteTask(id); closeModal(); };

  const goToDay = (iso) => { setSelectedDate(iso); setView('day'); };

  const todayISO = isoDate(new Date());
  const byDate = (iso) => tasks.filter((t) => t.date === iso).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  const todayTasks = byDate(todayISO);
  const doneCount = todayTasks.filter((t) => t.status === 'Done').length;
  const progress = todayTasks.length ? Math.round((doneCount / todayTasks.length) * 100) : 0;
  const upcoming = tasks
    .filter((t) => t.date > todayISO)
    .sort((a, b) => (a.date === b.date ? (a.startTime || '').localeCompare(b.startTime || '') : a.date.localeCompare(b.date)))
    .slice(0, 5);
  const summary = STATUS_LIST.reduce((acc, s) => { acc[s] = tasks.filter((t) => t.status === s).length; return acc; }, {});

  if (session === undefined) {
    return (
      <div className="planner-root">
        <style>{CSS}</style>
        <div className="loading-screen">Checking your session…</div>
      </div>
    );
  }

  if (session === null) {
    return (
      <div className="planner-root">
        <style>{CSS}</style>
        <LoginScreen />
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="planner-root">
        <style>{CSS}</style>
        <div className="loading-screen">Loading your planner…</div>
      </div>
    );
  }

  return (
    <div className="planner-root">
      <style>{CSS}</style>

      <nav className="sidebar">
        <div className="brand">Planner</div>
        <div className="nav-list">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
            <button key={key} className={`nav-item ${view === key ? 'active' : ''}`} onClick={() => setView(key)}>
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-user">{session.user.email}</div>
        <button className="nav-add" onClick={() => openAdd(todayISO)}>
          <Plus size={16} /> Add Activity
        </button>
        <button className="nav-signout" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </nav>

      <main className="content">
        {view === 'dashboard' && (
          <Dashboard
            todayTasks={todayTasks}
            progress={progress}
            doneCount={doneCount}
            upcoming={upcoming}
            summary={summary}
            onAdd={() => openAdd(todayISO)}
            onEdit={openEdit}
            onCycle={cycleStatus}
            onGoToDay={goToDay}
          />
        )}

        {view === 'day' && (
          <DayView
            iso={selectedDate}
            tasks={byDate(selectedDate)}
            onPrev={() => setSelectedDate(isoDate(addDays(parseISO(selectedDate), -1)))}
            onNext={() => setSelectedDate(isoDate(addDays(parseISO(selectedDate), 1)))}
            onToday={() => setSelectedDate(todayISO)}
            onAdd={() => openAdd(selectedDate)}
            onEdit={openEdit}
            onCycle={cycleStatus}
          />
        )}

        {view === 'week' && (
          <WeekView
            anchor={weekAnchor}
            tasksByDate={byDate}
            onPrev={() => setWeekAnchor(addDays(weekAnchor, -7))}
            onNext={() => setWeekAnchor(addDays(weekAnchor, 7))}
            onToday={() => setWeekAnchor(new Date())}
            onAdd={openAdd}
            onEdit={openEdit}
            onGoToDay={goToDay}
          />
        )}

        {view === 'month' && (
          <MonthView
            anchor={monthAnchor}
            tasks={tasks}
            onPrev={() => setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1))}
            onNext={() => setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1))}
            onToday={() => setMonthAnchor(new Date())}
            onSelectDate={goToDay}
          />
        )}

        {view === 'kanban' && (
          <KanbanView tasks={tasks} onEdit={openEdit} onSetStatus={setStatus} onAdd={() => openAdd(todayISO)} />
        )}
      </main>

      <nav className="tabbar">
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
          <button key={key} className={`tab-item ${view === key ? 'active' : ''}`} onClick={() => setView(key)}>
            <Icon size={19} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <button className="fab" onClick={() => openAdd(view === 'day' ? selectedDate : todayISO)} aria-label="Add activity">
        <Plus size={22} />
      </button>

      <button className="mobile-signout" onClick={() => supabase.auth.signOut()} aria-label="Sign out">
        <X size={16} />
      </button>

      {modal && (
        <TaskModal mode={modal.mode} data={modal.data} onCancel={closeModal} onSave={saveModal} onDelete={deleteFromModal} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Dashboard                                                         */
/* ---------------------------------------------------------------- */

function Dashboard({ todayTasks, progress, doneCount, upcoming, summary, onAdd, onEdit, onCycle, onGoToDay }) {
  return (
    <div className="view">
      <header className="view-head">
        <h1>Activity Planner</h1>
        <p className="subhead">{longDate(isoDate(new Date()))}</p>
      </header>

      <section className="panel">
        <div className="panel-title-row">
          <h2>Today's Progress</h2>
          <span className="muted">{doneCount} of {todayTasks.length || 0} completed</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-title-row">
          <h2>Today</h2>
          <button className="link-btn" onClick={onAdd}><Plus size={14} /> Add Activity</button>
        </div>
        {todayTasks.length === 0 ? (
          <EmptyState text="No activities planned for today yet." />
        ) : (
          <ul className="task-list">
            {todayTasks.map((t) => (
              <li key={t.id} className="task-row" onClick={() => onEdit(t)}>
                <StatusToggle task={t} onCycle={onCycle} />
                <span className="task-time">{t.startTime || '--:--'}</span>
                <Dot color={CATEGORY_COLORS[t.category] || '#999'} />
                <span className={`task-name ${t.status === 'Done' ? 'done' : ''}`}>{t.name}</span>
                <span className="task-priority" style={{ color: PRIORITY_COLORS[t.priority] }}>{t.priority}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Upcoming</h2>
        {upcoming.length === 0 ? (
          <EmptyState text="Nothing scheduled ahead yet." />
        ) : (
          <ul className="upcoming-list">
            {upcoming.map((t) => (
              <li key={t.id} className="upcoming-row" onClick={() => onGoToDay(t.date)}>
                <span className="upcoming-date">{shortDate(parseISO(t.date))}</span>
                <span>{t.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Status Summary</h2>
        <div className="summary-grid">
          {STATUS_LIST.map((s) => (
            <div key={s} className="summary-cell">
              <span className="summary-count" style={{ color: STATUS_STYLE[s].color }}>{summary[s]}</span>
              <span className="summary-label">{s}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}

/* ---------------------------------------------------------------- */
/* Day view                                                           */
/* ---------------------------------------------------------------- */

function DayView({ iso, tasks, onPrev, onNext, onToday, onAdd, onEdit, onCycle }) {
  return (
    <div className="view">
      <header className="view-head row">
        <div>
          <h1>{longDate(iso)}</h1>
        </div>
        <div className="day-nav">
          <button className="icon-btn" onClick={onPrev}><ChevronLeft size={18} /></button>
          <button className="btn-ghost small" onClick={onToday}>Today</button>
          <button className="icon-btn" onClick={onNext}><ChevronRight size={18} /></button>
        </div>
      </header>

      <section className="panel">
        <div className="panel-title-row">
          <h2>{tasks.length} {tasks.length === 1 ? 'activity' : 'activities'}</h2>
          <button className="link-btn" onClick={onAdd}><Plus size={14} /> Add Activity</button>
        </div>

        {tasks.length === 0 ? (
          <EmptyState text="Nothing planned for this day." />
        ) : (
          <div className="day-table">
            <div className="day-table-head">
              <span>Time</span><span>Activity</span><span>Category</span><span>Priority</span><span>Status</span>
            </div>
            {tasks.map((t) => (
              <div key={t.id} className="day-table-row" onClick={() => onEdit(t)}>
                <span className="mono">{t.startTime}–{t.endTime}</span>
                <span className="task-name">{t.name}</span>
                <span><Dot color={CATEGORY_COLORS[t.category]} /> {t.category}</span>
                <span style={{ color: PRIORITY_COLORS[t.priority] }}>{t.priority}</span>
                <span onClick={(e) => e.stopPropagation()}><StatusBadge status={t.status} /> <StatusToggle task={t} onCycle={onCycle} /></span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Week view                                                          */
/* ---------------------------------------------------------------- */

function WeekView({ anchor, tasksByDate, onPrev, onNext, onToday, onAdd, onEdit, onGoToDay }) {
  const start = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const end = days[6];

  return (
    <div className="view">
      <header className="view-head row">
        <div>
          <h1>Week</h1>
          <p className="subhead">{shortDate(start)} – {shortDate(end)}</p>
        </div>
        <div className="day-nav">
          <button className="icon-btn" onClick={onPrev}><ChevronLeft size={18} /></button>
          <button className="btn-ghost small" onClick={onToday}>Current Week</button>
          <button className="icon-btn" onClick={onNext}><ChevronRight size={18} /></button>
        </div>
      </header>

      <div className="week-grid">
        {days.map((d, i) => {
          const iso = isoDate(d);
          const dayTasks = tasksByDate(iso);
          const isToday = iso === isoDate(new Date());
          return (
            <div key={iso} className={`week-col ${isToday ? 'is-today' : ''}`}>
              <div className="week-col-head" onClick={() => onGoToDay(iso)}>
                <span className="week-day-label">{WEEKDAY_LABELS[i]}</span>
                <span className="week-date-label">{d.getDate()}</span>
              </div>
              <div className="week-col-body">
                {dayTasks.length === 0 ? (
                  <span className="week-empty">—</span>
                ) : (
                  dayTasks.map((t) => (
                    <div key={t.id} className="week-task" onClick={() => onEdit(t)}>
                      <Dot color={CATEGORY_COLORS[t.category]} />
                      <span className="mono small">{t.startTime}</span>
                      <span className={`week-task-name ${t.status === 'Done' ? 'done' : ''}`}>{t.name}</span>
                    </div>
                  ))
                )}
                <button className="week-add" onClick={() => onAdd(iso)}><Plus size={12} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Month view                                                         */
/* ---------------------------------------------------------------- */

function MonthView({ anchor, tasks, onPrev, onNext, onToday, onSelectDate }) {
  const weeks = monthMatrix(anchor);
  const currentMonth = anchor.getMonth();
  const todayIso = isoDate(new Date());

  const countFor = (d) => tasks.filter((t) => t.date === isoDate(d)).length;

  return (
    <div className="view">
      <header className="view-head row">
        <h1>{monthLabel(anchor)}</h1>
        <div className="day-nav">
          <button className="icon-btn" onClick={onPrev}><ChevronLeft size={18} /></button>
          <button className="btn-ghost small" onClick={onToday}>Today</button>
          <button className="icon-btn" onClick={onNext}><ChevronRight size={18} /></button>
        </div>
      </header>

      <div className="month-grid">
        {WEEKDAY_LABELS.map((w) => <div key={w} className="month-weekday">{w}</div>)}
        {weeks.flat().map((d) => {
          const iso = isoDate(d);
          const count = countFor(d);
          const outside = d.getMonth() !== currentMonth;
          const isToday = iso === todayIso;
          return (
            <button
              key={iso}
              className={`month-cell ${outside ? 'outside' : ''} ${isToday ? 'is-today' : ''}`}
              onClick={() => onSelectDate(iso)}
            >
              <span className="month-date-num">{d.getDate()}</span>
              {count > 0 && <span className="month-count">{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Kanban view                                                        */
/* ---------------------------------------------------------------- */

const KANBAN_COLUMNS = [
  { status: 'Planned', title: 'To Do' },
  { status: 'In Progress', title: 'In Progress' },
  { status: 'Done', title: 'Done' },
];

function KanbanView({ tasks, onEdit, onSetStatus, onAdd }) {
  const [dragId, setDragId] = useState(null);

  const handleDrop = (status) => {
    if (dragId) onSetStatus(tasks.find((t) => t.id === dragId), status);
    setDragId(null);
  };

  return (
    <div className="view">
      <header className="view-head row">
        <h1>Kanban</h1>
        <button className="link-btn" onClick={onAdd}><Plus size={14} /> Add Activity</button>
      </header>

      <div className="kanban-board">
        {KANBAN_COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.status).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
          return (
            <div
              key={col.status}
              className="kanban-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(col.status)}
            >
              <div className="kanban-col-head">
                <span>{col.title}</span>
                <span className="muted">{items.length}</span>
              </div>
              <div className="kanban-col-body">
                {items.length === 0 && <span className="week-empty">No activities</span>}
                {items.map((t) => {
                  const idx = KANBAN_COLUMNS.findIndex((c) => c.status === col.status);
                  const next = KANBAN_COLUMNS[idx + 1];
                  return (
                    <div
                      key={t.id}
                      className="kanban-card"
                      draggable
                      onDragStart={() => setDragId(t.id)}
                      onClick={() => onEdit(t)}
                    >
                      <div className="kanban-card-top">
                        <Dot color={CATEGORY_COLORS[t.category]} />
                        <span className="mono small">{t.date.slice(5)}</span>
                      </div>
                      <div className="kanban-card-name">{t.name}</div>
                      <div className="kanban-card-bottom">
                        <span style={{ color: PRIORITY_COLORS[t.priority] }}>{t.priority}</span>
                        {next && (
                          <button
                            className="icon-btn tiny"
                            onClick={(e) => { e.stopPropagation(); onSetStatus(t, next.status); }}
                            title={`Move to ${next.title}`}
                          >
                            <ChevronRight size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Styles                                                             */
/* ---------------------------------------------------------------- */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

.planner-root {
  --bg: #FAFAF8;
  --surface: #FFFFFF;
  --ink: #1E2124;
  --muted: #78808C;
  --border: #E4E4E1;
  --accent: #2D5F4C;
  --accent-soft: #E7F0EB;
  font-family: 'IBM Plex Sans', sans-serif;
  color: var(--ink);
  background: var(--bg);
  min-height: 100vh;
  display: flex;
  position: relative;
}
.planner-root * { box-sizing: border-box; }
.mono { font-family: 'IBM Plex Mono', monospace; }
.mono.small { font-size: 11px; }

.loading-screen {
  width: 100%; min-height: 100vh; display: flex; align-items: center; justify-content: center;
  color: var(--muted); font-size: 14px;
}

/* Sidebar (desktop) */
.sidebar {
  width: 208px; flex-shrink: 0; background: var(--surface); border-right: 1px solid var(--border);
  padding: 24px 16px; display: flex; flex-direction: column; gap: 24px; min-height: 100vh; position: sticky; top: 0;
}
.brand { font-weight: 700; font-size: 17px; letter-spacing: -0.01em; padding-left: 8px; }
.nav-list { display: flex; flex-direction: column; gap: 2px; }
.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 7px; border: none;
  background: transparent; color: var(--muted); font-size: 13.5px; font-weight: 500; cursor: pointer; text-align: left;
}
.nav-item:hover { background: var(--bg); color: var(--ink); }
.nav-item.active { background: var(--accent-soft); color: var(--accent); }
.nav-add {
  margin-top: auto; display: flex; align-items: center; justify-content: center; gap: 6px;
  background: var(--accent); color: #fff; border: none; border-radius: 8px; padding: 10px; font-size: 13px;
  font-weight: 600; cursor: pointer;
}
.nav-add:hover { opacity: 0.92; }
.sidebar-user { margin-top: auto; font-size: 11px; color: var(--muted); padding-left: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-signout { background: none; border: none; color: var(--muted); font-size: 11.5px; cursor: pointer; padding: 4px 8px; text-align: left; }
.nav-signout:hover { color: var(--ink); text-decoration: underline; }

/* Login screen */
.login-screen { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; width: 100%; }
.login-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 28px; width: 100%; max-width: 360px; display: flex; flex-direction: column; }
.login-sent { font-size: 13.5px; line-height: 1.6; background: var(--accent-soft); color: var(--accent); border-radius: 8px; padding: 12px 14px; }
.login-error { font-size: 12.5px; color: #AF4B41; background: #F8E9E7; border-radius: 8px; padding: 8px 12px; margin-top: 8px; }
.mobile-signout { display: none; }
@media (max-width: 860px) {
  .mobile-signout {
    display: flex; position: fixed; top: 14px; right: 14px; width: 30px; height: 30px; border-radius: 50%;
    background: var(--surface); border: 1px solid var(--border); color: var(--muted); align-items: center; justify-content: center;
    z-index: 51;
  }
}

/* Content */
.content { flex: 1; padding: 32px 40px 96px; max-width: 900px; }
.view { display: flex; flex-direction: column; gap: 22px; }
.view-head h1 { font-size: 22px; font-weight: 700; margin: 0 0 2px; letter-spacing: -0.01em; }
.view-head.row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
.subhead { color: var(--muted); font-size: 13.5px; margin: 0; }

.panel { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; }
.panel-title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.panel h2 { font-size: 14px; font-weight: 600; margin: 0 0 12px; }
.panel-title-row h2 { margin: 0; }
.muted { color: var(--muted); font-size: 12.5px; }

.progress-track { height: 8px; background: var(--bg); border-radius: 6px; overflow: hidden; border: 1px solid var(--border); }
.progress-fill { height: 100%; background: var(--accent); border-radius: 6px; transition: width 0.3s ease; }

.link-btn {
  display: flex; align-items: center; gap: 4px; background: none; border: none; color: var(--accent);
  font-size: 12.5px; font-weight: 600; cursor: pointer; padding: 4px 6px; border-radius: 6px;
}
.link-btn:hover { background: var(--accent-soft); }

.empty-state { color: var(--muted); font-size: 13px; padding: 14px 4px; }

.task-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.task-row {
  display: flex; align-items: center; gap: 10px; padding: 9px 4px; border-top: 1px solid var(--border); cursor: pointer;
}
.task-row:first-child { border-top: none; }
.task-time { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--muted); width: 44px; flex-shrink: 0; }
.task-name { flex: 1; font-size: 13.5px; }
.task-name.done { color: var(--muted); text-decoration: line-through; }
.task-priority { font-size: 11.5px; font-weight: 600; }

.dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; display: inline-block; }

.status-toggle {
  width: 19px; height: 19px; border-radius: 50%; border: 1.5px solid var(--border); background: #fff;
  display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; color: var(--muted);
}
.status-toggle.st-2 { background: var(--accent); border-color: var(--accent); color: #fff; }
.status-toggle.st-1 { border-color: #B8862E; color: #B8862E; }

.badge { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 20px; }

.upcoming-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.upcoming-row { display: flex; gap: 12px; padding: 8px 4px; border-top: 1px solid var(--border); cursor: pointer; font-size: 13px; }
.upcoming-row:first-child { border-top: none; }
.upcoming-date { color: var(--muted); font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; width: 54px; flex-shrink: 0; }

.summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.summary-cell { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 4px; background: var(--bg); border-radius: 8px; }
.summary-count { font-size: 18px; font-weight: 700; }
.summary-label { font-size: 10.5px; color: var(--muted); text-align: center; }

.day-nav { display: flex; align-items: center; gap: 6px; }
.icon-btn { background: none; border: 1px solid var(--border); border-radius: 7px; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--ink); }
.icon-btn:hover { background: var(--bg); }
.icon-btn.tiny { width: 22px; height: 22px; border: none; color: var(--muted); }
.btn-ghost { background: none; border: 1px solid var(--border); border-radius: 7px; padding: 6px 12px; font-size: 12.5px; font-weight: 500; cursor: pointer; color: var(--ink); }
.btn-ghost.small { padding: 5px 10px; }
.btn-ghost:hover { background: var(--bg); }

.day-table { display: flex; flex-direction: column; }
.day-table-head, .day-table-row {
  display: grid; grid-template-columns: 100px 1fr 110px 70px 150px; gap: 10px; align-items: center; padding: 9px 4px;
}
.day-table-head { font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; border-bottom: 1px solid var(--border); }
.day-table-row { border-bottom: 1px solid var(--border); font-size: 13px; cursor: pointer; }
.day-table-row:hover { background: var(--bg); }
.day-table-row span:nth-child(3) { display: flex; align-items: center; gap: 6px; }
.day-table-row span:nth-child(5) { display: flex; align-items: center; gap: 6px; }

.week-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; }
.week-col { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 10px; min-height: 160px; display: flex; flex-direction: column; }
.week-col.is-today { border-color: var(--accent); }
.week-col-head { display: flex; justify-content: space-between; align-items: baseline; cursor: pointer; margin-bottom: 8px; }
.week-day-label { font-size: 10.5px; color: var(--muted); font-weight: 600; text-transform: uppercase; }
.week-date-label { font-size: 13px; font-weight: 700; }
.week-col-body { display: flex; flex-direction: column; gap: 6px; flex: 1; }
.week-task { display: flex; align-items: center; gap: 5px; font-size: 11.5px; cursor: pointer; padding: 3px 4px; border-radius: 5px; }
.week-task:hover { background: var(--bg); }
.week-task-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.week-task-name.done { color: var(--muted); text-decoration: line-through; }
.week-empty { color: var(--border); font-size: 11px; }
.week-add { margin-top: auto; align-self: flex-start; background: none; border: 1px dashed var(--border); border-radius: 6px; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--muted); }
.week-add:hover { border-color: var(--accent); color: var(--accent); }

.month-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.month-weekday { text-align: center; font-size: 10.5px; color: var(--muted); font-weight: 600; text-transform: uppercase; padding-bottom: 4px; }
.month-cell {
  aspect-ratio: 1; background: var(--surface); border: 1px solid var(--border); border-radius: 9px; cursor: pointer;
  display: flex; flex-direction: column; align-items: flex-start; justify-content: space-between; padding: 8px; gap: 4px;
}
.month-cell:hover { border-color: var(--accent); }
.month-cell.outside { opacity: 0.35; }
.month-cell.is-today { background: var(--accent-soft); border-color: var(--accent); }
.month-date-num { font-size: 12.5px; font-weight: 600; }
.month-count { font-size: 10.5px; font-weight: 700; color: var(--accent); background: var(--accent-soft); border-radius: 20px; padding: 1px 6px; }

.kanban-board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; align-items: start; }
.kanban-col { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px; min-height: 200px; }
.kanban-col-head { display: flex; justify-content: space-between; font-size: 12.5px; font-weight: 700; margin-bottom: 10px; padding: 0 2px; }
.kanban-col-body { display: flex; flex-direction: column; gap: 8px; }
.kanban-card { background: var(--bg); border: 1px solid var(--border); border-radius: 9px; padding: 10px; cursor: grab; }
.kanban-card:active { cursor: grabbing; }
.kanban-card-top { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.kanban-card-name { font-size: 13px; margin-bottom: 6px; }
.kanban-card-bottom { display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-weight: 600; }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(20, 22, 20, 0.4); display: flex; align-items: center; justify-content: center;
  padding: 16px; z-index: 100;
}
.modal {
  background: var(--surface); border-radius: 14px; padding: 22px; width: 100%; max-width: 440px;
  display: flex; flex-direction: column; gap: 12px; max-height: 90vh; overflow-y: auto;
}
.modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
.modal-head h3 { margin: 0; font-size: 16px; }
.field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--muted); font-weight: 500; flex: 1; }
.field input, .field select, .field textarea {
  font-family: inherit; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-size: 13.5px; color: var(--ink); background: var(--bg);
}
.field input:focus, .field select:focus, .field textarea:focus { outline: none; border-color: var(--accent); }
.field-row { display: flex; gap: 10px; }
.modal-actions { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.spacer { flex: 1; }
.btn-primary { background: var(--accent); color: #fff; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-primary:hover { opacity: 0.92; }
.btn-danger { display: flex; align-items: center; gap: 5px; background: none; color: #AF4B41; border: 1px solid #F0D6D3; border-radius: 8px; padding: 8px 12px; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.btn-danger:hover { background: #F8E9E7; }

/* Mobile */
.tabbar { display: none; }
.fab { display: none; }

@media (max-width: 860px) {
  .sidebar { display: none; }
  .content { padding: 20px 16px 90px; max-width: 100%; }
  .tabbar {
    display: flex; position: fixed; bottom: 0; left: 0; right: 0; background: var(--surface); border-top: 1px solid var(--border);
    padding: 6px 4px calc(6px + env(safe-area-inset-bottom)); z-index: 50;
  }
  .tab-item {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; background: none; border: none;
    color: var(--muted); font-size: 10px; font-weight: 500; padding: 6px 2px; cursor: pointer;
  }
  .tab-item.active { color: var(--accent); }
  .fab {
    display: flex; position: fixed; right: 18px; bottom: 76px; width: 50px; height: 50px; border-radius: 50%;
    background: var(--accent); color: #fff; border: none; align-items: center; justify-content: center; cursor: pointer;
    box-shadow: 0 6px 16px rgba(45, 95, 76, 0.35); z-index: 51;
  }
  .day-table-head { display: none; }
  .day-table-row { grid-template-columns: 1fr; gap: 4px; padding: 12px 8px; }
  .day-table-row > span:nth-child(1) { order: 1; font-size: 11px; color: var(--muted); }
  .day-table-row > span:nth-child(2) { order: 0; font-weight: 600; }
  .day-table-row > span:nth-child(3) { order: 2; font-size: 12px; color: var(--muted); }
  .day-table-row > span:nth-child(4) { order: 3; font-size: 11.5px; }
  .day-table-row > span:nth-child(5) { order: 4; }
  .week-grid { grid-template-columns: 1fr; }
  .kanban-board { grid-template-columns: 1fr; }
  .summary-grid { grid-template-columns: repeat(3, 1fr); }
  .field-row { flex-direction: column; }
}
`;
