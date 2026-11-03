import React, { useEffect, useState } from 'react'
import { supabase } from './supabase'
import Modal from './Modal'
import { money, validatePrice } from './money'
const blank = { name: '', description: '', setup_cost: '0', monthly_cost: '0' }
export default function Products({ user }) {
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [archived, setArchived] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  async function load() {
    const { data, error } = await supabase.from('crm_products').select('*').order('name')
    if (error) setNotice(`Unable to load products: ${error.message}`)
    else setProducts(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])
  function open(product = null) { setEditing(product); setForm(product ? { ...product, setup_cost: String(product.setup_cost), monthly_cost: String(product.monthly_cost) } : blank); setError('') }
  async function save(event) {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      if (!form.name.trim()) throw new Error('Product Name is required.')
      const payload = { name: form.name.trim(), description: form.description.trim(), setup_cost: validatePrice(form.setup_cost), monthly_cost: validatePrice(form.monthly_cost), updated_by: user.id }
      const result = editing ? await supabase.from('crm_products').update(payload).eq('id', editing.id).select().single() : await supabase.from('crm_products').insert({ ...payload, created_by: user.id }).select().single()
      if (result.error) throw result.error
      setForm(null); setNotice('Product saved.'); await load()
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }
  async function archive(product) {
    setBusy(true)
    const { error } = await supabase.from('crm_products').update({ is_active: !product.is_active, updated_by: user.id }).eq('id', product.id).select().single()
    if (error) setNotice(`Unable to update product: ${error.message}`)
    else { setNotice(product.is_active ? 'Product archived. Historical quotations are preserved.' : 'Product restored.'); await load() }
    setBusy(false)
  }
  const filtered = products.filter(p => (archived || p.is_active) && `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name))
  return <section><div className="list-toolbar"><input type="search" aria-label="Search products" placeholder="Search products" value={search} onChange={e => setSearch(e.target.value)} /><button onClick={() => open()}>Create Product</button></div>
    <label className="inline-check"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} />Show archived products</label>
    {notice && <p role="status">{notice}</p>}
    {loading ? <p>Loading products…</p> : <div className="crm-grid">{filtered.map(p => <article className="crm-card" key={p.id}><h2>{p.name}</h2>{!p.is_active && <span>Archived</span>}<p>{p.description || 'No description'}</p><dl><dt>Setup Cost</dt><dd>{money(p.setup_cost)}</dd><dt>Monthly Cost</dt><dd>{money(p.monthly_cost)}</dd></dl><div className="actions"><button disabled={busy} onClick={() => open(p)}>Edit</button><button disabled={busy} className="secondary" onClick={() => archive(p)}>{p.is_active ? 'Archive' : 'Restore'}</button></div></article>)}{!filtered.length && <p className="empty-state">No products match. Create a product or change your search.</p>}</div>}
    {form && <Modal title={editing ? 'Edit Product' : 'Create Product'} onClose={() => setForm(null)} busy={busy}><form onSubmit={save}>
      <label>Product Name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label>Description<textarea rows="3" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
      <div className="crm-form-grid">{[['setup_cost', 'Setup Cost'], ['monthly_cost', 'Monthly Cost']].map(([key, label]) => <label key={key}>{label} (ZAR)<input required type="number" min="0" max="999999999.99" step="0.01" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}</div>
      {error && <p role="alert" className="error">{error}</p>}<div className="actions"><button disabled={busy}>{busy ? 'Saving…' : editing ? 'Save Changes' : 'Save Product'}</button><button type="button" className="secondary" disabled={busy} onClick={() => setForm(null)}>Cancel</button></div>
    </form></Modal>}
  </section>
}
