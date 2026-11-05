import React from 'react'
import { money, scaled } from './money'

// Saved previews use persisted financial fields; null VAT identifies historical quotes.
export function hasVat(quote) { return quote.vat_rate != null }
export function finalTotal(quote, kind) { return quote[`${kind}_${hasVat(quote) ? 'total_including_vat' : 'total'}`] }
export function VatNote({ quote }) {
  return <p className="vat-note">{hasVat(quote) ? 'VAT is included in the final totals, after group discount.' : 'Historical quotation: VAT was not calculated in this version. Original totals are preserved.'}</p>
}
export function FinalTotals({ quote }) {
  return <section className="quote-final-totals" aria-label="Final quotation totals">{[['setup','Total Setup Cost'],['monthly','Total Monthly Cost']].map(([kind,label]) => <div key={kind}><h2>{label}</h2><p>{hasVat(quote) ? 'Including VAT' : 'Historical total — VAT not calculated'}</p><strong>{money(finalTotal(quote, kind))}</strong></div>)}</section>
}
export function CostBreakdowns({ quote, proposal = false }) {
  const Heading = proposal ? 'h3' : 'h2'
  return <div className="quote-costs">{[['setup','Setup Costs'],['monthly','Monthly Costs']].map(([kind,label]) => {
    const items = quote.crm_quote_items.filter(item => scaled(item[`${kind}_unit_cost`]) > 0n)
    return <section key={kind} aria-label={label}><Heading>{proposal && kind === 'setup' ? 'Once-off setup costs' : label}</Heading>{items.length ? <div className="table-scroll"><table><thead><tr><th>Product</th><th>{proposal ? 'Qty' : 'Quantity'}</th><th>Unit {kind === 'setup' ? 'Setup' : 'Monthly'} Cost</th><th>Line Total</th></tr></thead><tbody>{items.map((item,index) => <tr key={item.id || index}><td>{item.product_name}<small>{item.product_description}</small></td><td>{item.quantity}</td><td>{money(item[`${kind}_unit_cost`])}</td><td>{money(item[`${kind}_line_total`])}</td></tr>)}</tbody></table></div> : <p className="empty-state">No chargeable {kind} items.</p>}<dl className="quote-totals"><div><dt>{kind === 'setup' ? 'Setup' : 'Monthly'} Subtotal</dt><dd>{money(quote[`${kind}_subtotal`])}</dd></div><div><dt>Group Discount</dt><dd>{quote.discount_percentage}%</dd></div><div><dt>Discount Amount</dt><dd>{money(quote[`${kind}_discount`])}</dd></div><div><dt>Subtotal After Discount</dt><dd>{money(quote[`${kind}_total`])}</dd></div>{hasVat(quote) && <><div><dt>VAT ({Number(quote.vat_rate)}%)</dt><dd>{money(quote[`${kind}_vat`])}</dd></div><div><dt>Total Including VAT</dt><dd>{money(finalTotal(quote, kind))}</dd></div></>}</dl></section>
  })}</div>
}
