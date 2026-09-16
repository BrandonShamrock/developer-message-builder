import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

const blankClient = { group_name: '', business_name: '', business_address: '', contact_name: '', contact_email: '', group_discount_percentage: '0' }

export default function CRM({ user }) {
  const [clients, setClients] = useState([])
  const [groups, setGroups] = useState([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [clientResult, groupResult] = await Promise.all([
      supabase.from('crm_clients').select('*').order('business_name', { ascending: true }),
      supabase.from('crm_groups').select('*').order('name', { ascending: true }),
    ])
    if (clientResult.error || groupResult.error) setNotice(`Unable to load CRM: ${(clientResult.error || groupResult.error).message}`)
    else { setClients(clientResult.data || []); setGroups(groupResult.data || []) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return clients.filter(client => [client.business_name, client.group_name, client.contact_name, client.contact_email, client.business_address]
      .some(value => String(value || '').toLowerCase().includes(query)))
  }, [clients, search])

  function openCreate() { setEditing(null); setModalOpen(true); setNotice('') }
  function openEdit(client) { setEditing(client); setModalOpen(true); setNotice('') }
  async function remove(client) {
    if (!confirm('Are you sure you want to delete this client?')) return
    const { error } = await supabase.from('crm_clients').delete().eq('id', client.id)
    if (error) setNotice(`Unable to delete client: ${error.message}`)
    else { setNotice(`${client.business_name} was deleted.`); await load() }
  }

  return <section className="crm-page">
    <div className="list-toolbar"><input type="search" aria-label="Search CRM clients" placeholder="Search business, group, contact, email, or address" value={search} onChange={event => setSearch(event.target.value)} /><button onClick={openCreate}>Create Client</button></div>
    {notice && <p className={notice.startsWith('Unable') ? 'error' : 'notice'}>{notice}</p>}
    {loading ? <p>Loading CRM clients…</p> : <div className="crm-grid">{filtered.map(client => <article className="crm-card" key={client.id}>
      <div><span className="crm-group">{client.group_name || 'No group'}</span><h2>{client.business_name}</h2></div>
      <dl><div><dt>Contact</dt><dd>{client.contact_name}</dd></div><div><dt>Email</dt><dd><a href={`mailto:${client.contact_email}`}>{client.contact_email}</a></dd></div><div><dt>Group discount</dt><dd>{Number(client.group_discount_percentage || 0)}%</dd></div>{client.business_address && <div><dt>Address</dt><dd>{client.business_address}</dd></div>}</dl>
      <div className="actions"><button onClick={() => openEdit(client)}>Edit</button><button className="danger" onClick={() => remove(client)}>Delete</button></div>
    </article>)}{!filtered.length && <div className="empty-state">{search ? 'No CRM clients match your search.' : 'No CRM clients yet. Create your first client.'}</div>}</div>}
    {modalOpen && <CrmClientModal client={editing} groups={groups} user={user} onClose={() => setModalOpen(false)} onSaved={async message => { setModalOpen(false); setNotice(message); await load() }} />}
  </section>
}

function CrmClientModal({ client, groups, user, onClose, onSaved }) {
  const [form, setForm] = useState(client ? { ...blankClient, ...client, group_discount_percentage: String(client.group_discount_percentage ?? 0) } : blankClient)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const matchingGroup = groups.find(group => group.name.toLowerCase() === form.group_name.trim().toLowerCase())

  function setField(name, value) { setForm(current => ({ ...current, [name]: value })) }
  function groupChanged(value) {
    const match = groups.find(group => group.name.toLowerCase() === value.trim().toLowerCase())
    setForm(current => ({ ...current, group_name: value, ...(match ? { group_discount_percentage: String(match.discount_percentage ?? 0) } : {}) }))
  }

  async function save(event) {
    event.preventDefault(); setError('')
    const values = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]))
    if (!values.business_name || !values.contact_name || !values.contact_email) { setError('Business Name, Contact Name, and Contact Email are required.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contact_email)) { setError('Enter a valid contact email address.'); return }
    const discount = Number(values.group_discount_percentage)
    if (values.group_discount_percentage === '' || !Number.isFinite(discount) || discount < 0 || discount > 100) { setError('Group Discount % must be a number from 0 to 100.'); return }
    setSaving(true)
    try {
      let group = groups.find(item => item.name.toLowerCase() === values.group_name.toLowerCase()) || null
      let finalDiscount = discount
      if (group && Number(group.discount_percentage) !== discount) {
        const update = confirm(`This group already has a saved discount of ${Number(group.discount_percentage)}%. Are you sure you want to update the group discount to ${discount}%?`)
        if (update) {
          const result = await supabase.from('crm_groups').update({ discount_percentage: discount, updated_by: user.id }).eq('id', group.id).select().single()
          if (result.error) throw result.error
          group = result.data
        } else finalDiscount = Number(group.discount_percentage)
      } else if (!group && values.group_name) {
        const result = await supabase.from('crm_groups').insert({ name: values.group_name, discount_percentage: discount, created_by: user.id, updated_by: user.id }).select().single()
        if (result.error) throw result.error
        group = result.data
      }
      const payload = { group_id: group?.id || null, group_name: group?.name || values.group_name || null, business_name: values.business_name, business_address: values.business_address || null, contact_name: values.contact_name, contact_email: values.contact_email, group_discount_percentage: finalDiscount, updated_by: user.id }
      const result = client
        ? await supabase.from('crm_clients').update(payload).eq('id', client.id)
        : await supabase.from('crm_clients').insert({ ...payload, created_by: user.id })
      if (result.error) throw result.error
      await onSaved(client ? 'Client changes saved.' : 'CRM client created.')
    } catch (saveError) { setError(`Unable to save client: ${saveError.message || 'An unexpected error occurred.'}`); setSaving(false) }
  }

  return <div className="modal crm-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="crm-modal-title"><div className="form-card crm-modal">
    <button type="button" className="close" aria-label="Close" onClick={onClose} disabled={saving}>×</button>
    <form onSubmit={save}><h2 id="crm-modal-title">{client ? 'Edit Client' : 'Create Client'}</h2>
      <label>Group<input list="crm-group-options" value={form.group_name} onChange={event => groupChanged(event.target.value)} placeholder="Select or type a new group" /><datalist id="crm-group-options">{groups.map(group => <option key={group.id} value={group.name} />)}</datalist></label>
      {matchingGroup && <p className="group-hint">Saved group selected — its default discount has been applied.</p>}
      <div className="crm-form-grid"><label>Business Name<input value={form.business_name} onChange={event => setField('business_name', event.target.value)} required /></label><label>Contact Name<input value={form.contact_name} onChange={event => setField('contact_name', event.target.value)} required /></label></div>
      <label>Business Address<textarea rows="3" value={form.business_address} onChange={event => setField('business_address', event.target.value)} /></label>
      <div className="crm-form-grid"><label>Contact Email<input type="email" value={form.contact_email} onChange={event => setField('contact_email', event.target.value)} required /></label><label>Group Discount %<input type="number" min="0" max="100" step="0.01" value={form.group_discount_percentage} onChange={event => setField('group_discount_percentage', event.target.value)} /></label></div>
      {error && <p className="error modal-error" role="alert">{error}</p>}
      <div className="actions"><button disabled={saving}>{saving ? 'Saving…' : client ? 'Save Changes' : 'Save Client'}</button><button type="button" className="secondary" onClick={onClose} disabled={saving}>Cancel</button></div>
    </form>
  </div></div>
}
