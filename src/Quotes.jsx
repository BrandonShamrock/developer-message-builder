import React, { useEffect, useState } from 'react'
import { supabase } from './supabase'
import Modal from './Modal'
import QuoteDocument from './QuoteDocument'
import { CostBreakdowns, FinalTotals, VatNote, finalTotal } from './QuoteCosts'
import { DEFAULT_SERVICE_OVERVIEW } from './quoteProposal'
import { clientSnapshot, money, quoteTotals } from './money'

export default function Quotes() {
  const [quotes, setQuotes] = useState([])
  const [clients, setClients] = useState([])
  const [groups, setGroups] = useState([])
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [picker, setPicker] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState([])
  const [draft, setDraft] = useState(null)
  const [view, setView] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  async function load() {
    const results = await Promise.all([
      supabase.from('crm_quotes').select('*,crm_quote_items(*)').order('created_at', { ascending: false }),
      supabase.from('crm_clients').select('*').order('business_name'),
      supabase.from('crm_groups').select('*').order('name'),
      supabase.from('crm_products').select('*').eq('is_active', true).order('name'),
    ])
    const failure = results.find(r => r.error)
    if (failure) setNotice(`Unable to load quote data: ${failure.error.message}`)
    else { setQuotes(results[0].data || []); setClients(results[1].data || []); setGroups(results[2].data || []); setProducts(results[3].data || []) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])
  function create() {
    setDraft({ crm_client_id: '', client_snapshot: {}, discount_percentage: '0', notes: '', service_overview: DEFAULT_SERVICE_OVERVIEW, valid_until: '', status: 'draft', items: [], refresh_client: true }); setError(''); setClientSearch('')
  }
  function edit(quote) {
    setDraft({ ...quote, service_overview: quote.service_overview || '', valid_until: quote.valid_until || '', discount_percentage: String(quote.discount_percentage), items: [...quote.crm_quote_items].sort((a,b) => a.position-b.position), refresh_client: false }); setError(''); setClientSearch('')
  }
  function selectClient(id) {
    const client = clients.find(c => c.id === id)
    try {
      const snapshot = client ? clientSnapshot(client, groups) : {}
      setDraft({ ...draft, crm_client_id: id, client_snapshot: snapshot, discount_percentage: snapshot.discount_percentage || '0', refresh_client: true })
      setError('')
    } catch (error) { setError(error.message) }
  }
  function addProducts() {
    setDraft({ ...draft, items: [...draft.items, ...products.filter(p => selectedProducts.includes(p.id)).map(p => ({ product_id: p.id, product_name: p.name, product_description: p.description, quantity: '1', setup_unit_cost: String(p.setup_cost), monthly_unit_cost: String(p.monthly_cost) }))] })
    setPicker(false)
  }
  let calculated = null, calculationError = ''
  if (draft) { try { calculated = quoteTotals(draft.items, draft.discount_percentage) } catch (error) { calculationError = error.message } }
  async function save(event) {
    event.preventDefault(); setError('')
    if (!draft.crm_client_id && !draft.id) { setError('Select a CRM client.'); return }
    if (!draft.items.length) { setError('Add at least one product.'); return }
    if (calculationError) { setError(calculationError); return }
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('save_crm_quote_proposal', {
        p_quote_id: draft.id || null, p_client_id: draft.crm_client_id || null,
        p_items: draft.items.map(item => ({ id: item.id || null, product_id: item.product_id, quantity: String(item.quantity), setup_unit_cost: String(item.setup_unit_cost), monthly_unit_cost: String(item.monthly_unit_cost) })),
        p_notes: draft.notes, p_refresh_client: draft.refresh_client, p_status: draft.status,
        p_expected_discount: draft.discount_percentage,
        p_service_overview: draft.service_overview, p_valid_until: draft.valid_until || null,
      })
      if (error) throw error
      setDraft(null); setView(data); setNotice(`Quotation ${data.quote_number} saved.`); await load()
    } catch (error) { setError(`Unable to save quotation: ${error.message}`) }
    finally { setBusy(false) }
  }
  function preview() {
    if (!calculated || !draft.items.length || !draft.client_snapshot.business_name) { setError('Select a client and valid products before previewing.'); return }
    setView({ ...draft, ...calculated, quote_number: draft.quote_number || 'UNSAVED DRAFT', created_at: draft.created_at || new Date().toISOString(), crm_quote_items: calculated.lines })
  }
  const filtered = quotes.filter(q => `${q.quote_number} ${q.client_snapshot.business_name} ${q.client_snapshot.group_name}`.toLowerCase().includes(search.toLowerCase()))
  return <section>
    {!draft ? <><div className="list-toolbar"><input type="search" aria-label="Search quotations" placeholder="Search quote number, business or group" value={search} onChange={e => setSearch(e.target.value)} /><button onClick={create} disabled={loading}>Create Quote</button></div>
      {notice && <p role="status">{notice}</p>}
      {loading ? <p>Loading quotations…</p> : <div className="crm-grid">{filtered.map(q => <article className="crm-card" key={q.id}><h2>{q.quote_number}</h2><strong>{q.client_snapshot.business_name}</strong><p>{q.client_snapshot.group_name || 'No group'} · {new Date(q.created_at).toLocaleDateString('en-ZA')} · {q.status}</p><dl><dt>Total Setup Cost</dt><dd>{money(finalTotal(q, 'setup'))}</dd><dt>Total Monthly Cost</dt><dd>{money(finalTotal(q, 'monthly'))}</dd></dl><div className="actions"><button onClick={() => setView(q)}>View</button><button className="secondary" disabled={q.status !== 'draft'} onClick={() => edit(q)}>Edit</button></div></article>)}{!filtered.length && <p className="empty-state">No quotations match your search.</p>}</div>}</> : <form className="form-card quote-builder" onSubmit={save}>
      <h2>{draft.id ? `Edit ${draft.quote_number}` : 'Create Quote'}</h2>
      <button type="button" className="secondary" disabled={busy} onClick={load}>Refresh client and product data</button>
      {notice.startsWith('Unable') && <p className="error" role="alert">{notice}</p>}
      <p className="hint">Saved lines keep their original prices. Reselecting a client applies its current details and group discount. Saving a draft recalculates VAT at the current rate; its saved history changes only when you save.</p>
      <label>Search CRM clients<input type="search" value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="Search business names" /></label>
      <label>Select Client<select aria-label="Select Client" value={draft.crm_client_id || ''} onChange={e => selectClient(e.target.value)}><option value="">Select a CRM client</option>{clients.filter(c => c.id === draft.crm_client_id || c.business_name.toLowerCase().includes(clientSearch.toLowerCase())).map(c => <option value={c.id} key={c.id}>{c.business_name}</option>)}</select></label>
      {draft.id && !draft.crm_client_id && <p className="hint">The original client was deleted. Its saved details are preserved; choose a client only if you intend to replace them.</p>}
      <ClientDetails snapshot={draft.client_snapshot} />
      <p><strong>Group Discount: {draft.discount_percentage}%</strong></p>
      <button type="button" onClick={() => { setSelectedProducts([]); setProductSearch(''); setPicker(true) }}>Add Product</button>
      <div className="table-scroll"><table><caption>Selected products</caption><thead><tr><th>Product</th><th>Quantity</th><th>Setup Cost</th><th>Monthly Cost</th><th>Actions</th></tr></thead><tbody>{draft.items.map((item,index) => <tr key={item.id || `${item.product_id}-${index}`}><th scope="row">{item.product_name}<small>{item.product_description}</small></th><td><input aria-label={`Quantity for ${item.product_name}, line ${index+1}`} type="number" min="0.001" max="999999.999" step="0.001" required value={item.quantity} onChange={e => setDraft({ ...draft, items: draft.items.map((line,i) => i === index ? { ...line, quantity: e.target.value } : line) })} /></td><td>{money(item.setup_unit_cost)}</td><td>{money(item.monthly_unit_cost)}</td><td><button type="button" className="secondary" aria-label={`Remove ${item.product_name}, line ${index+1}`} onClick={() => setDraft({ ...draft, items: draft.items.filter((_,i) => i !== index) })}>Remove</button></td></tr>)}</tbody></table></div>
      {calculationError && <p className="error" role="alert">{calculationError}</p>}
      {calculated && <CostBreakdowns quote={{ ...draft, ...calculated, crm_quote_items: calculated.lines }} />}
      <label>Service overview<textarea aria-label="Service overview" rows="5" value={draft.service_overview} onChange={e => setDraft({ ...draft, service_overview: e.target.value })} placeholder="Describe the services included in this proposal" /></label>
      <label>Expiry date<input type="date" value={draft.valid_until} onChange={e => setDraft({ ...draft, valid_until: e.target.value })} /></label>
      <p className="hint">Service overview and expiry date are optional and saved with this quotation. Leave them blank to omit their content from the PDF.</p>
      <label>Notes<textarea rows="3" value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label>
      <label>Quote status<select aria-label="Quote status" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}><option value="draft">Draft — editable</option><option value="issued">Issued — locked after saving</option></select></label>
      {calculated && <><VatNote quote={calculated} /><FinalTotals quote={calculated} /></>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions"><button disabled={busy}>{busy ? 'Saving…' : 'Save Quote'}</button><button type="button" disabled={busy} className="secondary" onClick={preview}>Preview Quote</button><button type="button" disabled={busy} className="secondary" onClick={() => setDraft(null)}>Cancel</button></div>
    </form>}
    {picker && <Modal title="Select Products" onClose={() => setPicker(false)}><label>Search products<input type="search" value={productSearch} onChange={e => setProductSearch(e.target.value)} /></label><div className="product-options">{products.filter(p => `${p.name} ${p.description}`.toLowerCase().includes(productSearch.toLowerCase())).map(p => <label className="inline-check" key={p.id}><input type="checkbox" checked={selectedProducts.includes(p.id)} onChange={e => setSelectedProducts(e.target.checked ? [...selectedProducts,p.id] : selectedProducts.filter(id => id !== p.id))} /><span>{p.name} — setup {money(p.setup_cost)}, monthly {money(p.monthly_cost)}</span></label>)}</div>{!products.length && <p>No active products. Create products in the Products catalogue first.</p>}<button disabled={!selectedProducts.length} onClick={addProducts}>Add Selected Products</button></Modal>}
    {view && <Modal title="Preview Quote" onClose={() => setView(null)} wide><QuoteDocument quote={view} /><div className="actions no-print"><button onClick={async () => {
      await Promise.all(Array.from(document.querySelectorAll('#quote-print img'), image => image.decode().catch(() => {})))
      await document.fonts.ready
      window.print()
    }}>Print / Save as PDF</button><button className="secondary" onClick={() => setView(null)}>Close Preview</button></div></Modal>}
  </section>
}
function ClientDetails({ snapshot }) {
  return <dl className="client-details">{[['business_name','Business Name / Dealer Name'],['group_name','Group'],['business_address','Address'],['contact_name','Contact Name'],['contact_email','Contact Email']].map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{snapshot[key] || '—'}</dd></div>)}</dl>
}
