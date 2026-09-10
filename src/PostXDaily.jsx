import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

const STATUSES = [
  { value: 'todo', label: 'To Do' },
  { value: 'wip', label: 'WIP' },
  { value: 'completed', label: 'Completed' },
]
const WIP_TAGS = ['With Dev', 'Awaiting Feedback', 'On Hold']
const today = () => new Date().toLocaleDateString('en-CA')
const nextDate = date => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}
const blankTask = date => ({ title: '', description: '', notes: '', task_date: date, status: 'todo', wip_tag: '', progress_comment: '', action_taken: '', completion_comment: '' })
const displayName = (profile, user) => profile?.full_name || profile?.email || user?.email || 'User'
const statusLabel = status => STATUSES.find(item => item.value === status)?.label || status

function formatDuration(createdAt, completedAt) {
  if (!createdAt || !completedAt) return ''
  const totalMinutes = Math.max(0, Math.floor((new Date(completedAt) - new Date(createdAt)) / 60000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const parts = []
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`)
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  if (minutes || !parts.length) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`)
  return parts.join(' ')
}

export default function PostXDaily({ user }) {
  const [date, setDate] = useState(today())
  const [profile, setProfile] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [ownerId, setOwnerId] = useState(user.id)
  const [tasks, setTasks] = useState([])
  const [comments, setComments] = useState({})
  const [editing, setEditing] = useState(false)
  const [active, setActive] = useState(null)
  const [form, setForm] = useState(blankTask(date))
  const [exportDates, setExportDates] = useState({ start: date, end: date })
  const [notice, setNotice] = useState('')
  const [savingStatus, setSavingStatus] = useState('')
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
    const end = nextDate(date)
    const { data, error } = await supabase.from('daily_tasks').select('*').eq('owner_id', ownerId)
      .or(`and(status.in.(todo,wip),task_date.lte.${date}),and(status.eq.completed,completed_at.gte.${date}T00:00:00Z,completed_at.lt.${end}T00:00:00Z)`)
      .order('task_date')
    if (error) { setNotice(error.message); return }
    setTasks(data || [])
    const ids = (data || []).map(task => task.id)
    if (!ids.length) { setComments({}); return }
    const result = await supabase.from('daily_task_comments').select('*').in('task_id', ids).order('created_at')
    if (!result.error) setComments((result.data || []).reduce((all, item) => ({ ...all, [item.task_id]: [...(all[item.task_id] || []), item] }), {}))
  }

  const grouped = useMemo(() => Object.fromEntries(STATUSES.map(({ value }) => [value, tasks.filter(task => task.status === value)])), [tasks])

  function openCreate() { setActive(null); setForm(blankTask(date)); setEditing(true) }
  function openEdit(task) {
    setActive(task)
    setForm({
      title: task.title, description: task.description || '', notes: task.notes || '', task_date: task.task_date,
      status: task.status, wip_tag: task.wip_tag || '', progress_comment: '', action_taken: task.action_taken || '', completion_comment: task.completion_comment || '',
    })
    setEditing(true)
  }
  function close() { setEditing(false); setActive(null); setForm(blankTask(date)) }

  async function saveTask(event) {
    event.preventDefault()
    const wasCompleted = active?.status === 'completed'
    const isCompleted = form.status === 'completed'
    const completedAt = isCompleted ? (wasCompleted ? active.completed_at || new Date().toISOString() : new Date().toISOString()) : null
    const payload = {
      title: form.title, description: form.description, notes: form.notes, task_date: form.task_date,
      status: form.status, wip_tag: form.wip_tag || null, action_taken: form.action_taken || null,
      completion_comment: form.completion_comment || null, completed_at: completedAt, owner_id: ownerId, updated_by: user.id,
      ...(form.status === 'wip' && active?.status !== 'wip' ? { moved_to_wip_at: new Date().toISOString() } : {}),
      ...(active ? {} : { created_by: user.id }),
    }
    const result = active ? await supabase.from('daily_tasks').update(payload).eq('id', active.id) : await supabase.from('daily_tasks').insert(payload).select().single()
    if (result.error) { setNotice(result.error.message); return }
    const taskId = active?.id || result.data?.id
    if (form.progress_comment.trim() && taskId) {
      const commentResult = await supabase.from('daily_task_comments').insert({ task_id: taskId, user_id: user.id, comment_type: 'progress', comment: form.progress_comment.trim() })
      if (commentResult.error) setNotice(`Task saved, but progress update failed: ${commentResult.error.message}`)
    }
    if (isCompleted && !wasCompleted && taskId && (form.action_taken || form.completion_comment)) {
      await supabase.from('daily_task_comments').insert({ task_id: taskId, user_id: user.id, comment_type: 'completion', comment: form.completion_comment || 'Task completed.', action_taken: form.action_taken || null })
    }
    setNotice(active ? 'Task updated.' : 'Task created.')
    close(); loadTasks()
  }

  async function updateStatus(task, status) {
    if (status === task.status) return
    setSavingStatus(task.id)
    const previous = tasks
    const completedAt = status === 'completed' ? new Date().toISOString() : null
    setTasks(current => current.map(item => item.id === task.id ? { ...item, status, completed_at: completedAt } : item).filter(item => item.status !== 'completed' || item.completed_at?.slice(0, 10) === date))
    const payload = { status, completed_at: completedAt, updated_by: user.id, ...(status === 'wip' ? { moved_to_wip_at: new Date().toISOString() } : {}) }
    const { error } = await supabase.from('daily_tasks').update(payload).eq('id', task.id)
    if (error) { setTasks(previous); setNotice(error.message) } else {
      if (task.status === 'completed') await supabase.from('daily_task_comments').insert({ task_id: task.id, user_id: user.id, comment_type: 'reopen', comment: `Moved back to ${statusLabel(status)}.` })
      setNotice(`Task moved to ${statusLabel(status)}.`)
      loadTasks()
    }
    setSavingStatus('')
  }

  async function updateTag(task, wipTag) {
    const previous = tasks
    setTasks(current => current.map(item => item.id === task.id ? { ...item, wip_tag: wipTag } : item))
    const { error } = await supabase.from('daily_tasks').update({ wip_tag: wipTag || null, updated_by: user.id }).eq('id', task.id)
    if (error) { setTasks(previous); setNotice(error.message) } else setNotice('WIP tag updated.')
  }

  async function exportPdf() {
    if (exportDates.start > exportDates.end) { setNotice('Export start date must be before the end date.'); return }
    const { data, error } = await supabase.from('daily_tasks').select('*, daily_task_comments(*)').eq('owner_id', ownerId).lte('task_date', exportDates.end).order('task_date')
    if (error) { setNotice(error.message); return }
    const exportEnd = `${nextDate(exportDates.end)}T00:00:00Z`
    const exportStart = `${exportDates.start}T00:00:00Z`
    const reportTasks = (data || []).filter(task => task.status === 'completed'
      ? task.completed_at >= exportStart && task.completed_at < exportEnd
      : task.task_date <= exportDates.end)
    const owner = profiles.find(item => item.id === ownerId) || (ownerId === user.id ? profile : null)
    const escape = value => String(value || '—').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
    const sections = STATUSES.map(({ value: status, label }) => {
      const items = reportTasks.filter(task => task.status === status).map(task => {
        const progress = (task.daily_task_comments || []).filter(comment => comment.comment_type === 'progress').map(comment => `<p><b>Progress:</b> ${escape(comment.comment)}${comment.action_taken ? ` — ${escape(comment.action_taken)}` : ''}</p>`).join('')
        return `<article><h3>${escape(task.title)}</h3><p><b>Status:</b> ${label} · <b>Task date:</b> ${escape(task.task_date)}</p><p><b>Description:</b> ${escape(task.description)}</p><p><b>Notes:</b> ${escape(task.notes)}</p>${task.wip_tag ? `<p><b>WIP tag:</b> ${escape(task.wip_tag)}</p>` : ''}${progress}${status === 'completed' ? `<p><b>Action taken:</b> ${escape(task.action_taken)}</p><p><b>Completion notes:</b> ${escape(task.completion_comment)}</p><p><b>Completed:</b> ${escape(task.completed_at ? new Date(task.completed_at).toLocaleString() : '')}</p><p><b>Time taken:</b> ${escape(formatDuration(task.created_at, task.completed_at))}</p>` : ''}</article>`
      }).join('')
      return `<section><h2>${label} Tasks</h2>${items || '<p>No tasks.</p>'}</section>`
    }).join('')
    const report = window.open('', '_blank')
    if (!report) { setNotice('Allow popups to open the printable report.'); return }
    report.document.write(`<!doctype html><html><head><title>PostX Daily Task Report</title><style>body{font:14px Arial;max-width:850px;margin:30px auto;color:#172033}header{border-bottom:2px solid #3157d5}section{margin-top:28px}article{break-inside:avoid;border:1px solid #dfe5ef;padding:12px;margin:10px 0;border-radius:8px}p{white-space:pre-wrap}@media print{button{display:none}}</style></head><body><header><h1>PostX Daily Task Report</h1><p><b>User:</b> ${escape(displayName(owner, user))}</p><p><b>Date range:</b> ${escape(exportDates.start)} to ${escape(exportDates.end)}</p><button onclick="window.print()">Print / Save as PDF</button></header>${sections}<script>window.onload=()=>window.print()</script></body></html>`)
    report.document.close(); setNotice('Printable PDF report opened.')
  }

  return <section className="postx-daily">
    <div className="daily-controls form-card">
      <label>Selected date<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      {isManager && <label>Team member<select value={ownerId} onChange={event => setOwnerId(event.target.value)}><option value={user.id}>My Tasks</option>{profiles.filter(item => item.id !== user.id).map(item => <option key={item.id} value={item.id}>{displayName(item)}</option>)}</select></label>}
      <button className="create-task" onClick={openCreate}>Create Task</button>
    </div>
    {notice && <p className="notice" role="status">{notice}</p>}
    <div className="kanban-board">
      {STATUSES.map(({ value, label }) => <section className={`kanban-column kanban-${value}`} key={value}>
        <header><h2>{label}</h2><span className="task-count">{grouped[value].length}</span></header>
        <div className="kanban-tasks">{grouped[value].map(task => <TaskCard key={task.id} task={task} selectedDate={date} saving={savingStatus === task.id} onStatus={updateStatus} onTag={updateTag} onEdit={openEdit} />)}
          {!grouped[value].length && <p className="kanban-empty">No {label.toLowerCase()} tasks.</p>}
        </div>
      </section>)}
    </div>
    <div className="form-card export-card"><h2>Export to PDF</h2><div className="export-fields"><label>Start date<input type="date" value={exportDates.start} onChange={event => setExportDates({ ...exportDates, start: event.target.value })} /></label><label>End date<input type="date" value={exportDates.end} onChange={event => setExportDates({ ...exportDates, end: event.target.value })} /></label></div><button onClick={exportPdf}>Print / Save as PDF</button></div>
    {editing && <div className="modal" role="dialog" aria-modal="true" aria-labelledby="task-form-title"><div className="form-card daily-modal"><button className="close" aria-label="Close" onClick={close}>×</button>
      <form onSubmit={saveTask}><h2 id="task-form-title">{active ? 'Edit Task' : 'Create Task'}</h2>
        <div className="task-form-grid"><label>Task title<input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} required /></label><label>Task date<input type="date" value={form.task_date} onChange={event => setForm({ ...form, task_date: event.target.value })} required /></label></div>
        <label>Description<textarea rows="3" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
        <label>Notes<textarea rows="3" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label>
        <div className="task-form-grid"><label>Status<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}>{STATUSES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>WIP tag <span className="optional">(optional)</span><select value={form.wip_tag} onChange={event => setForm({ ...form, wip_tag: event.target.value })} disabled={form.status !== 'wip'}><option value="">No tag</option>{WIP_TAGS.map(tag => <option key={tag}>{tag}</option>)}</select></label></div>
        <label>Progress comment / update <span className="optional">(optional)</span><textarea rows="2" value={form.progress_comment} onChange={event => setForm({ ...form, progress_comment: event.target.value })} placeholder="Add a new progress update" /></label>
        <label>Action taken / completion note <span className="optional">(optional)</span><textarea rows="2" value={form.action_taken} onChange={event => setForm({ ...form, action_taken: event.target.value })} /></label>
        <label>Completion comment <span className="optional">(optional)</span><textarea rows="2" value={form.completion_comment} onChange={event => setForm({ ...form, completion_comment: event.target.value })} /></label>
        {active && <Activity comments={comments[active.id]} />}
        <div className="actions"><button>{active ? 'Save Changes' : 'Create Task'}</button><button type="button" className="secondary" onClick={close}>Cancel</button></div>
      </form>
    </div></div>}
  </section>
}

function TaskCard({ task, selectedDate, saving, onStatus, onTag, onEdit }) {
  const carried = task.task_date < selectedDate && task.status !== 'completed'
  return <article className={`kanban-task task-${task.status}`}>
    <div className="task-card-heading"><h3>{task.title}</h3>{task.wip_tag && <span className="tag-pill">{task.wip_tag}</span>}</div>
    <p>{task.description || <span className="muted">No description</span>}</p>
    <small>{task.task_date}{carried ? ' · Carried over' : ''}</small>
    {task.status === 'completed' && task.completed_at && <p className="time-taken"><strong>Time taken:</strong> {formatDuration(task.created_at, task.completed_at)}</p>}
    <label className="compact-field">Status<select aria-label={`Status for ${task.title}`} value={task.status} disabled={saving} onChange={event => onStatus(task, event.target.value)}>{STATUSES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    {task.status === 'wip' && <label className="compact-field">WIP tag<select aria-label={`WIP tag for ${task.title}`} value={task.wip_tag || ''} onChange={event => onTag(task, event.target.value)}><option value="">No tag</option>{WIP_TAGS.map(tag => <option key={tag}>{tag}</option>)}</select></label>}
    <button className="secondary edit-task" onClick={() => onEdit(task)}>Edit</button>
  </article>
}

function Activity({ comments = [] }) {
  if (!comments.length) return null
  return <details className="activity"><summary>Activity ({comments.length})</summary>{comments.map(comment => <div className="comment" key={comment.id}><strong>{statusLabel(comment.comment_type)}</strong><small>{new Date(comment.created_at).toLocaleString()}</small><p>{comment.comment}</p>{comment.action_taken && <p>Update: {comment.action_taken}</p>}</div>)}</details>
}
