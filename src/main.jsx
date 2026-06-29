import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase, isSupabaseConfigured } from './supabase'
import { buildMessage, detectVariables, getUserId } from './utils'
import './styles.css'

const pages = [
  ['dashboard', 'Dashboard'],
  ['templates', 'Templates'],
  ['clients', 'Clients'],
  ['builder', 'Builder'],
  ['history', 'Generated History'],
]

const emptyTemplate = { name: '', category: '', description: '', template_body: '', variables: [] }
const emptyClient = {
  client_name: '', organisation_name: '', location: '', contact_number: '', brand_name: '',
  website: '', contact_email: '', description: '', notes: '',
}

function App() {
  const [user, setUser] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [page, setPage] = useState('dashboard')

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoadingAuth(false); return }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null)
      setLoadingAuth(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null))
    return () => listener.subscription.unsubscribe()
  }, [])

  if (loadingAuth) return <div className="center-card">Loading...</div>
  if (!isSupabaseConfigured) return <ConfigMissing />
  if (!user) return <Login />

  return <Shell user={user} page={page} setPage={setPage} />
}

function ConfigMissing() {
  return <div className="center-card"><h1>Configuration required</h1><p>Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your local .env file, then restart Vite.</p></div>
}

function Login() {
  const [mode, setMode] = useState('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('error')
  const [busy, setBusy] = useState(false)

  const isCreateAccount = mode === 'create-account'
  const title = isCreateAccount ? 'Create Account' : 'Sign In'

  function switchMode(nextMode) {
    setMode(nextMode)
    setMessage('')
    setMessageType('error')
    setConfirmPassword('')
  }

  async function submit(e) {
    e.preventDefault()
    setMessage('')
    setMessageType('error')

    if (isCreateAccount && password !== confirmPassword) {
      setMessage('Password and Confirm Password must match.')
      return
    }

    setBusy(true)
    const { data, error } = isCreateAccount
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setMessage(error.message)
    } else if (isCreateAccount && !data.session) {
      setMessageType('success')
      setMessage('Account created. Please check your email to confirm your account, then sign in.')
      setMode('sign-in')
      setPassword('')
      setConfirmPassword('')
    }

    setBusy(false)
  }

  return <div className="login-page"><form className="auth-card" onSubmit={submit}>
    <h1>Developer Message Builder</h1>
    <div className="auth-switch" role="tablist" aria-label="Authentication mode">
      <button type="button" role="tab" aria-selected={!isCreateAccount} className={!isCreateAccount ? 'active' : ''} onClick={() => switchMode('sign-in')}>Sign In</button>
      <button type="button" role="tab" aria-selected={isCreateAccount} className={isCreateAccount ? 'active' : ''} onClick={() => switchMode('create-account')}>Create Account</button>
    </div>
    <h2>{title}</h2>
    <p>{isCreateAccount ? 'Create a new account with Supabase Auth.' : 'Sign in with your Supabase account.'}</p>
    <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
    <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
    {isCreateAccount && <label>Confirm Password<input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required /></label>}
    {message && <p className={messageType === 'success' ? 'notice' : 'error'}>{message}</p>}
    <button disabled={busy}>{busy ? `${title}...` : title}</button>
  </form></div>
}

function Shell({ user, page, setPage }) {
  return <div className="app-shell"><aside className="sidebar"><h2>Message Builder</h2><nav>{pages.map(([key, label]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}>{label}</button>)}</nav><button className="logout" onClick={() => supabase.auth.signOut()}>Logout</button></aside><main><header><div><h1>{pages.find(p => p[0] === page)?.[1]}</h1><p>{user.email}</p></div></header>{page === 'dashboard' && <Dashboard setPage={setPage} />}{page === 'templates' && <Templates user={user} />}{page === 'clients' && <Clients user={user} />}{page === 'builder' && <Builder user={user} />}{page === 'history' && <History />}</main></div>
}

function Dashboard({ setPage }) {
  return <div className="grid cards">{pages.slice(1).map(([key, label]) => <button className="card" key={key} onClick={() => setPage(key)}><h3>{label}</h3><p>Manage {label.toLowerCase()}.</p></button>)}</div>
}

function Templates({ user }) {
  const [rows, setRows] = useState([]); const [form, setForm] = useState(emptyTemplate); const [editing, setEditing] = useState(null); const [notice, setNotice] = useState('')
  async function load() { const { data, error } = await supabase.from('templates').select('*').order('created_at', { ascending: false }); if (!error) setRows(data || []) }
  useEffect(() => { load() }, [])
  async function save(e) { e.preventDefault(); const payload = { ...form, variables: detectVariables(form.template_body), created_by: getUserId(user) }; const q = editing ? supabase.from('templates').update(payload).eq('id', editing) : supabase.from('templates').insert(payload); const { error } = await q; setNotice(error?.message || 'Template saved.'); if (!error) { setForm(emptyTemplate); setEditing(null); load() } }
  function edit(row) { setEditing(row.id); setForm({ ...emptyTemplate, ...row, variables: row.variables || [] }) }
  async function remove(id) { if (confirm('Delete this template?')) { await supabase.from('templates').delete().eq('id', id); load() } }
  async function duplicate(row) { const { id, created_at, updated_at, ...copy } = row; await supabase.from('templates').insert({ ...copy, name: `${row.name} Copy`, created_by: getUserId(user) }); load() }
  return <section><Editor title={editing ? 'Edit template' : 'Create template'} onSubmit={save} notice={notice}><Input name="name" form={form} setForm={setForm} required /><Input name="category" form={form} setForm={setForm} /><Input name="description" form={form} setForm={setForm} textarea /><Input name="template_body" label="Template body" form={form} setForm={setForm} textarea required /><p className="hint">Detected variables: {detectVariables(form.template_body).join(', ') || 'none'}</p><button>Save Template</button>{editing && <button type="button" className="secondary" onClick={() => { setEditing(null); setForm(emptyTemplate) }}>Cancel</button>}</Editor><div className="list">{rows.map(row => <Record key={row.id} title={row.name} subtitle={row.category} body={row.description} actions={<><button onClick={() => edit(row)}>Edit</button><button onClick={() => duplicate(row)}>Duplicate</button><button className="danger" onClick={() => remove(row.id)}>Delete</button></>} />)}</div></section>
}

function Clients({ user }) {
  const [rows, setRows] = useState([]); const [form, setForm] = useState(emptyClient); const [editing, setEditing] = useState(null); const [notice, setNotice] = useState('')
  async function load() { const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false }); if (!error) setRows(data || []) }
  useEffect(() => { load() }, [])
  async function save(e) {
    e.preventDefault()
    const organisationName = (form.organisation_name || form.client_name || '').trim()
    const payload = { ...form, organisation_name: organisationName, client_name: organisationName, created_by: getUserId(user) }
    const q = editing ? supabase.from('clients').update(payload).eq('id', editing) : supabase.from('clients').insert(payload)
    const { error } = await q
    setNotice(error?.message || 'Client saved.')
    if (!error) { setForm(emptyClient); setEditing(null); load() }
  }
  function edit(row) {
    const organisationName = row.organisation_name || row.client_name || ''
    setEditing(row.id)
    setForm({ ...emptyClient, ...row, organisation_name: organisationName, client_name: organisationName })
  }
  async function remove(id) { if (confirm('Delete this client?')) { await supabase.from('clients').delete().eq('id', id); load() } }
  return <section><Editor title={editing ? 'Edit client' : 'Create client'} onSubmit={save} notice={notice}>
    <Input name="organisation_name" label="Organisation Name" form={form} setForm={setForm} required />
    <Input name="location" label="Location" form={form} setForm={setForm} />
    <Input name="contact_number" label="Contact Number" form={form} setForm={setForm} />
    <Input name="brand_name" label="Brand" form={form} setForm={setForm} />
    <Input name="website" label="Website" form={form} setForm={setForm} />
    <Input name="contact_email" label="Email Address" form={form} setForm={setForm} />
    <Input name="description" label="Description" form={form} setForm={setForm} textarea />
    <Input name="notes" label="Notes" form={form} setForm={setForm} textarea />
    <button>Save Client</button>{editing && <button type="button" className="secondary" onClick={() => { setEditing(null); setForm(emptyClient) }}>Cancel</button>}
  </Editor><div className="list">{rows.map(row => {
    const title = row.organisation_name || row.client_name || 'Untitled organisation'
    const details = [row.location, row.brand_name, row.contact_number, row.contact_email, row.website].filter(Boolean).join(' · ')
    return <Record key={row.id} title={title} subtitle={details} body={row.description || row.notes} actions={<><button onClick={() => edit(row)}>Edit</button><button className="danger" onClick={() => remove(row.id)}>Delete</button></>} />
  })}</div></section>
}

function Builder({ user }) {
  const [templates, setTemplates] = useState([]), [clients, setClients] = useState([]), [templateId, setTemplateId] = useState(''), [clientId, setClientId] = useState(''), [manual, setManual] = useState({}), [notice, setNotice] = useState('')
  useEffect(() => { supabase.from('templates').select('*').then(({ data }) => setTemplates(data || [])); supabase.from('clients').select('*').then(({ data }) => setClients(data || [])) }, [])
  const template = templates.find(t => String(t.id) === String(templateId)); const selectedClient = clients.find(c => String(c.id) === String(clientId)); const client = selectedClient ? { ...selectedClient, organisation_name: selectedClient.organisation_name || selectedClient.client_name || '', client_name: selectedClient.client_name || selectedClient.organisation_name || '' } : null; const vars = template?.variables?.length ? template.variables : detectVariables(template?.template_body)
  const values = useMemo(() => Object.fromEntries((vars || []).map(v => [v, client?.[v] || manual[v] || ''])), [vars, client, manual])
  const finalMessage = buildMessage(template?.template_body, values); const missing = (vars || []).filter(v => !values[v])
  async function save() { const { error } = await supabase.from('generated_messages').insert({ template_id: templateId || null, client_id: clientId || null, final_message: finalMessage, variables_used: values, created_by: getUserId(user) }); setNotice(error?.message || 'Generated message saved.') }
  return <section className="builder"><div className="form-card"><label>Template<select value={templateId} onChange={e => setTemplateId(e.target.value)}><option value="">Select a template</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Client<select value={clientId} onChange={e => setClientId(e.target.value)}><option value="">Select a client</option>{clients.map(c => <option key={c.id} value={c.id}>{c.organisation_name || c.client_name || 'Untitled organisation'}</option>)}</select></label>{vars?.map(v => <label key={v}>{v}<input value={values[v]} onChange={e => setManual({ ...manual, [v]: e.target.value })} placeholder={client?.[v] ? 'From client' : 'Manual value'} /></label>)}{missing.length > 0 && <p className="warning">Missing variables: {missing.join(', ')}</p>}<div className="actions"><button onClick={() => navigator.clipboard.writeText(finalMessage)}>Copy to Clipboard</button><button onClick={save} disabled={!finalMessage}>Save Generated Message</button></div>{notice && <p className="notice">{notice}</p>}</div><Preview text={finalMessage} /></section>
}

function History() {
  const [rows, setRows] = useState([]), [active, setActive] = useState(null)
  async function load() { const { data } = await supabase.from('generated_messages').select('*, templates(name), clients(client_name, organisation_name)').order('created_at', { ascending: false }); setRows(data || []) }
  useEffect(() => { load() }, [])
  async function remove(id) { if (confirm('Delete this generated message?')) { await supabase.from('generated_messages').delete().eq('id', id); load() } }
  return <section className="list">{rows.map(row => <Record key={row.id} title={row.templates?.name || 'Generated message'} subtitle={row.clients?.organisation_name || row.clients?.client_name || new Date(row.created_at).toLocaleString()} body={(row.final_message || '').slice(0, 180)} actions={<><button onClick={() => setActive(row)}>View</button><button onClick={() => navigator.clipboard.writeText(row.final_message || '')}>Copy</button><button className="danger" onClick={() => remove(row.id)}>Delete</button></>} />)}{active && <div className="modal"><div><button className="close" onClick={() => setActive(null)}>×</button><Preview text={active.final_message} /></div></div>}</section>
}

function Editor({ title, onSubmit, notice, children }) { return <form className="form-card" onSubmit={onSubmit}><h2>{title}</h2>{children}{notice && <p className="notice">{notice}</p>}</form> }
function Input({ name, label, form, setForm, textarea, required }) { const text = label || name.replaceAll('_', ' '); const props = { value: form[name] || '', onChange: e => setForm({ ...form, [name]: e.target.value }), required }; return <label>{text}{textarea ? <textarea rows="4" {...props} /> : <input {...props} />}</label> }
function Record({ title, subtitle, body, actions }) { return <article className="record"><div><h3>{title}</h3><p className="muted">{subtitle}</p><p>{body}</p></div><div className="record-actions">{actions}</div></article> }
function Preview({ text }) { return <div className="preview"><h2>Live Preview</h2><pre>{text || 'Select a template to preview the developer message.'}</pre></div> }

createRoot(document.getElementById('root')).render(<App />)
