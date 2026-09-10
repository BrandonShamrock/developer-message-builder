import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

const today = () => new Date().toLocaleDateString('en-CA')
const blankTask = date => ({ title: '', description: '', notes: '', task_date: date })
const displayName = (profile, user) => profile?.full_name || profile?.email || user?.email || 'User'

export default function PostXDaily({ user }) {
  const [date, setDate] = useState(today())
  const [profile, setProfile] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [ownerId, setOwnerId] = useState(user.id)
  const [tasks, setTasks] = useState([])
  const [comments, setComments] = useState({})
  const [dialog, setDialog] = useState(null)
  const [active, setActive] = useState(null)
  const [form, setForm] = useState(blankTask(date))
  const [progress, setProgress] = useState({ comment: '', action_taken: '' })
  const [completion, setCompletion] = useState({ task_id: '', time_taken: '', action_taken: '', completion_comment: '' })
  const [exportDates, setExportDates] = useState({ start: date, end: date })
  const [notice, setNotice] = useState('')
  const isManager = profile?.role === 'manager'

  useEffect(() => { loadProfile() }, [user.id])
  useEffect(() => { if (profile) loadTasks() }, [date, ownerId, profile])

  async function loadProfile() {
    let { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    if (!data) {
      const fallback = { id: user.id, email: user.email, full_name: user.user_metadata?.full_name || user.email?.split('@')[0], role: 'agent' }
      const result = await supabase.from('profiles').upsert(fallback).select().single()
      data = result.data || fallback
      if (result.error) setNotice(`Profile setup: ${result.error.message}`)
    }
    setProfile(data)
    setOwnerId(user.id)
    if (data.role === 'manager') {
      const result = await supabase.from('profiles').select('id,email,full_name,role').order('full_name')
      if (result.error) setNotice(result.error.message); else setProfiles(result.data || [])
    }
  }

  async function loadTasks() {
    const { data, error } = await supabase.from('daily_tasks').select('*').eq('owner_id', ownerId).or(`and(status.eq.todo,task_date.eq.${date}),and(status.eq.wip,task_date.lte.${date}),and(status.eq.completed,task_date.eq.${date}),and(status.eq.completed,completed_at.gte.${date}T00:00:00,completed_at.lt.${date}T23:59:59.999)`).order('task_date')
    if (error) { setNotice(error.message); return }
    setTasks(data || [])
    const ids = (data || []).map(task => task.id)
    if (!ids.length) { setComments({}); return }
    const result = await supabase.from('daily_task_comments').select('*').in('task_id', ids).order('created_at')
    if (!result.error) setComments((result.data || []).reduce((all, item) => ({ ...all, [item.task_id]: [...(all[item.task_id] || []), item] }), {}))
  }

  const grouped = useMemo(() => ({
    todo: tasks.filter(t => t.status === 'todo' && t.task_date === date),
    wip: tasks.filter(t => t.status === 'wip' && t.task_date <= date),
    completed: tasks.filter(t => t.status === 'completed' && (t.task_date === date || t.completed_at?.slice(0, 10) === date)),
  }), [tasks, date])

  function openCreate() { setActive(null); setForm(blankTask(date)); setDialog('edit') }
  function openEdit(task) { setActive(task); setForm({ title: task.title, description: task.description || '', notes: task.notes || '', task_date: task.task_date }); setDialog('edit') }
  async function saveTask(event) {
    event.preventDefault()
    const payload = { ...form, owner_id: ownerId, updated_by: user.id, ...(active ? {} : { status: 'todo', created_by: user.id }) }
    const result = active ? await supabase.from('daily_tasks').update(payload).eq('id', active.id) : await supabase.from('daily_tasks').insert(payload)
    if (result.error) setNotice(result.error.message); else { setNotice(active ? 'Task updated.' : 'Task created.'); close(); loadTasks() }
  }
  async function move(task, status) {
    const payload = { status, updated_by: user.id, completed_at: null }
    if (status === 'wip') payload.moved_to_wip_at = new Date().toISOString()
    const { error } = await supabase.from('daily_tasks').update(payload).eq('id', task.id)
    if (!error && task.status === 'completed') await supabase.from('daily_task_comments').insert({ task_id: task.id, user_id: user.id, comment_type: 'reopen', comment: `Moved back to ${status === 'wip' ? 'WIP' : 'To Do'}.`, action_taken: task.action_taken, time_taken: task.time_taken })
    setNotice(error?.message || `Task moved to ${status === 'wip' ? 'WIP' : 'To Do'}.`); close(); loadTasks()
  }
  async function addProgress(event) {
    event.preventDefault()
    const { error } = await supabase.from('daily_task_comments').insert({ task_id: active.id, user_id: user.id, comment_type: 'progress', ...progress })
    setNotice(error?.message || 'Progress saved.'); if (!error) { setProgress({ comment: '', action_taken: '' }); loadTasks() }
  }
  async function complete(event) {
    event.preventDefault()
    const task = grouped.wip.find(item => item.id === completion.task_id)
    if (!task) return
    const completedAt = new Date().toISOString()
    const { error } = await supabase.from('daily_tasks').update({ status: 'completed', completed_at: completedAt, time_taken: completion.time_taken, action_taken: completion.action_taken, completion_comment: completion.completion_comment, updated_by: user.id }).eq('id', task.id)
    if (!error) await supabase.from('daily_task_comments').insert({ task_id: task.id, user_id: user.id, comment_type: 'completion', comment: completion.completion_comment || 'Task completed.', action_taken: completion.action_taken, time_taken: completion.time_taken })
    setNotice(error?.message || 'Task completed.'); if (!error) { close(); loadTasks() }
  }
  function close() { setDialog(null); setActive(null); setCompletion({ task_id: '', time_taken: '', action_taken: '', completion_comment: '' }) }

  async function exportPdf() {
    if (exportDates.start > exportDates.end) { setNotice('Export start date must be before the end date.'); return }
    const { data, error } = await supabase.from('daily_tasks').select('*, daily_task_comments(*)').eq('owner_id', ownerId).gte('task_date', exportDates.start).lte('task_date', exportDates.end).order('task_date')
    if (error) { setNotice(error.message); return }
    const owner = profiles.find(p => p.id === ownerId) || (ownerId === user.id ? profile : null)
    const escape = value => String(value || '—').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
    const sections = ['todo', 'wip', 'completed'].map(status => {
      const rows = (data || []).filter(t => t.status === status)
      const items = rows.map(t => `<article><h3>${escape(t.title)}</h3><p><b>Status:</b> ${escape(t.status)} · <b>Task date:</b> ${escape(t.task_date)}</p><p><b>Description:</b> ${escape(t.description)}</p><p><b>Notes:</b> ${escape(t.notes)}</p>${(t.daily_task_comments || []).filter(c => c.comment_type === 'progress').map(c => `<p><b>Progress:</b> ${escape(c.comment)}${c.action_taken ? ` — ${escape(c.action_taken)}` : ''}</p>`).join('')}${status === 'completed' ? `<p><b>Time taken:</b> ${escape(t.time_taken)}</p><p><b>Action taken:</b> ${escape(t.action_taken)}</p><p><b>Completion notes:</b> ${escape(t.completion_comment)}</p><p><b>Completed:</b> ${escape(t.completed_at ? new Date(t.completed_at).toLocaleString() : '')}</p>` : ''}</article>`).join('')
      return `<section><h2>${status === 'todo' ? 'To Do Tasks' : status === 'wip' ? 'WIP Tasks' : 'Completed Tasks'}</h2>${items || '<p>No tasks.</p>'}</section>`
    }).join('')
    const report = window.open('', '_blank')
    if (!report) { setNotice('Allow popups to open the printable report.'); return }
    report.document.write(`<!doctype html><html><head><title>PostX Daily Task Report</title><style>body{font:14px Arial;max-width:850px;margin:30px auto;color:#172033}header{border-bottom:2px solid #3157d5}section{margin-top:28px}article{break-inside:avoid;border:1px solid #dfe5ef;padding:12px;margin:10px 0;border-radius:8px}p{white-space:pre-wrap}@media print{button{display:none}}</style></head><body><header><h1>PostX Daily Task Report</h1><p><b>User:</b> ${escape(displayName(owner, user))}</p><p><b>Date range:</b> ${escape(exportDates.start)} to ${escape(exportDates.end)}</p><button onclick="window.print()">Print / Save as PDF</button></header>${sections}<script>window.onload=()=>window.print()</script></body></html>`)
    report.document.close(); setNotice('Printable PDF report opened.')
  }

  const TaskList = ({ rows, completed = false }) => <div className="task-list">{rows.map(task => <article className="task-row" key={task.id}><div><h4>{task.title}</h4><small>{task.task_date}{task.task_date < date && task.status === 'wip' ? ' · Carried over' : ''}</small><p>{task.description}</p></div><div className="record-actions"><button onClick={() => { setActive(task); setDialog(completed ? 'completed-detail' : 'detail') }}>View</button><button className="secondary" onClick={() => openEdit(task)}>Edit</button>{task.status === 'todo' && <button onClick={() => move(task, 'wip')}>Move to WIP</button>}</div></article>)}{!rows.length && <p className="muted">No tasks in this section.</p>}</div>

  return <section className="postx-daily">
    <div className="daily-controls form-card"><label>Selected date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>{isManager && <label>Team member<select value={ownerId} onChange={e => setOwnerId(e.target.value)}><option value={user.id}>My Tasks</option>{profiles.filter(p => p.id !== user.id).map(p => <option key={p.id} value={p.id}>{displayName(p)}</option>)}</select></label>}</div>
    {notice && <p className="notice">{notice}</p>}
    <DailyCard title="Create Task" count={grouped.todo.length}><button onClick={openCreate}>Create Task</button><button className="secondary" onClick={() => setDialog('todo')}>View Tasks</button></DailyCard>
    <DailyCard title="WIP" count={grouped.wip.length}><button className="secondary" onClick={() => setDialog('wip')}>View Tasks</button><button onClick={() => setDialog('complete')}>Completed</button></DailyCard>
    <DailyCard title="Completed Tasks" count={grouped.completed.length}><button onClick={() => setDialog('completed')}>View Completed Tasks</button></DailyCard>
    <div className="form-card export-card"><h2>Export to PDF</h2><div className="export-fields"><label>Start date<input type="date" value={exportDates.start} onChange={e => setExportDates({ ...exportDates, start: e.target.value })} /></label><label>End date<input type="date" value={exportDates.end} onChange={e => setExportDates({ ...exportDates, end: e.target.value })} /></label></div><button onClick={exportPdf}>Print / Save as PDF</button></div>
    {dialog && <div className="modal" role="dialog" aria-modal="true"><div className="form-card daily-modal"><button className="close" aria-label="Close" onClick={close}>×</button>
      {dialog === 'edit' && <form onSubmit={saveTask}><h2>{active ? 'Edit Task' : 'Create Task'}</h2><label>Task title<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required /></label><label>Description<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label><label>Optional notes<textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label><label>Task date<input type="date" value={form.task_date} onChange={e => setForm({ ...form, task_date: e.target.value })} required /></label><button>Save Task</button><button type="button" className="secondary" onClick={close}>Cancel</button></form>}
      {dialog === 'todo' && <><h2>To Do — {date}</h2><TaskList rows={grouped.todo} /></>}
      {dialog === 'wip' && <><h2>WIP through {date}</h2><TaskList rows={grouped.wip} /></>}
      {dialog === 'completed' && <><h2>Completed — {date}</h2><TaskList rows={grouped.completed} completed /></>}
      {dialog === 'detail' && active && <><TaskDetails task={active} comments={comments[active.id]} /><form onSubmit={addProgress}><h3>Add progress</h3><label>Comment<textarea value={progress.comment} onChange={e => setProgress({ ...progress, comment: e.target.value })} required /></label><label>Optional action/update note<input value={progress.action_taken} onChange={e => setProgress({ ...progress, action_taken: e.target.value })} /></label><button>Save Comment</button></form></>}
      {dialog === 'complete' && <form onSubmit={complete}><h2>Complete a WIP Task</h2><label>WIP task<select value={completion.task_id} onChange={e => setCompletion({ ...completion, task_id: e.target.value })} required><option value="">Select a task</option>{grouped.wip.map(t => <option value={t.id} key={t.id}>{t.title} ({t.task_date})</option>)}</select></label><label>Time taken<input value={completion.time_taken} onChange={e => setCompletion({ ...completion, time_taken: e.target.value })} placeholder="e.g. 1 hour 30 minutes" required /></label><label>Action taken<textarea value={completion.action_taken} onChange={e => setCompletion({ ...completion, action_taken: e.target.value })} required /></label><label>Completion comment / notes<textarea value={completion.completion_comment} onChange={e => setCompletion({ ...completion, completion_comment: e.target.value })} /></label><button>Mark Completed</button></form>}
      {dialog === 'completed-detail' && active && <><TaskDetails task={active} comments={comments[active.id]} completion /><div className="actions"><button onClick={() => move(active, 'wip')}>Move back to WIP</button><button className="secondary" onClick={() => move(active, 'todo')}>Move back to To Do</button></div></>}
    </div></div>}
  </section>
}

function DailyCard({ title, count, children }) { return <article className="daily-card"><div><h2>{title}</h2><span className="task-count">{count} task{count === 1 ? '' : 's'}</span></div><div className="actions">{children}</div></article> }
function TaskDetails({ task, comments = [], completion }) { return <div className="task-details"><h2>{task.title}</h2><p><strong>Task date:</strong> {task.task_date}</p><p><strong>Description:</strong> {task.description || '—'}</p><p><strong>Notes:</strong> {task.notes || '—'}</p>{completion && <><p><strong>Completion comment:</strong> {task.completion_comment || '—'}</p><p><strong>Time taken:</strong> {task.time_taken || '—'}</p><p><strong>Action taken:</strong> {task.action_taken || '—'}</p><p><strong>Completed:</strong> {task.completed_at ? new Date(task.completed_at).toLocaleString() : '—'}</p></>}<h3>Activity</h3>{comments.map(c => <div className="comment" key={c.id}><strong>{c.comment_type}</strong><small>{new Date(c.created_at).toLocaleString()}</small><p>{c.comment}</p>{c.action_taken && <p>Update: {c.action_taken}</p>}</div>)}{!comments.length && <p className="muted">No activity yet.</p>}</div> }
