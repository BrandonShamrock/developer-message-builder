import React from 'react'
import { CostBreakdowns, FinalTotals, VatNote } from './QuoteCosts'
import { quoteDate } from './quoteProposal'
import './quote-proposal.css'
import postxLogo from './assets/quote/postx.png'
import redLogo from './assets/quote/red.png'
import metaLogo from './assets/quote/meta.png'
import googleLogo from './assets/quote/google.png'

export default function QuoteDocument({ quote }) {
  const client = quote.client_snapshot || {}
  return <article id="quote-print" className="quote-document postx-proposal">
    <div className="accent" />
    <header className="cover">
      <div className="logos"><img className="postx" src={postxLogo} alt="PostX" /><img className="red" src={redLogo} alt="R-E-D" /></div>
      <p className="kicker">Digital Services Proposal | PostX</p>
      <h1>PostX Proposal &amp; Quotation</h1>
      <p className="for">This is a proposal for</p>
      <p className="client">{client.business_name || ''}</p>
      <p className="ref">(hereinafter referred to as "the Client")</p>
      <p className="by">Presented by</p><p className="byname">Reach Engage Develop</p>
      <p className="ref">(hereinafter referred to as "R-E-D")</p>
      <div className="meta"><div>Quote no.<b>{quote.quote_number || ''}</b></div><div>Date<b>{quoteDate(quote.created_at)}</b></div>{quote.valid_until && <div>Valid until<b>{quoteDate(quote.valid_until)}</b></div>}</div>
      <div className="partners"><img src={metaLogo} alt="Meta Business Partner" /><img src={googleLogo} alt="Google Partner" /></div>
    </header>
    <div className="sec pb">
    <h2><span className="bar"></span>Company overview</h2>
    <p className="muted">Reach Engage Develop is a unique digital solutions provider. We are not a traditional digital marketing agency where all the attention is focused on the big spenders and everyone else gets the bare minimum. At R-E-D we give every client the undivided attention they deserve. We provide tailor-made digital solutions where our clients have access to our extensive expertise in digital advertising, website development and maintenance, social media management, online reputation management, location listing and much more. At R-E-D we specialise in the automotive industry, where we have an impressive track record with our clients.</p>
    <div className="stats">
      <div className="stat"><div className="v">Dec 2014</div><div className="l">Registered</div></div>
      <div className="stat"><div className="v">53</div><div className="l">Employees</div></div>
      <div className="stat"><div className="v">&gt;50 yrs</div><div className="l">Digital experience</div></div>
      <div className="stat"><div className="v">&gt;75 yrs</div><div className="l">Automotive experience</div></div>
      <div className="stat"><div className="v">&gt;400</div><div className="l">Active clients</div></div>
      <div className="stat"><div className="v">&gt;150</div><div className="l">Active websites</div></div>
      <div className="stat"><div className="v">&gt;350</div><div className="l">Active Facebook ad accounts</div></div>
      <div className="stat"><div className="v">&gt;150</div><div className="l">Active Google ad accounts</div></div>
    </div>
    <div className="directors">Directors: <b>Jason Chalmers · Brigid Chalmers · Manny De Canha</b></div>
  </div>

    <div className="sec">
    <h2><span className="bar"></span>Core values</h2>
    <div className="values">
      <div className="val"><b>BRAVE</b><div>We take bold decisions. The riskiest thing is to take no risks at all.</div></div>
      <div className="val"><b>TRANSPARENT</b><div>Informed people make the best decisions. We give honest, accurate feedback.</div></div>
      <div className="val"><b>AGILE</b><div>Being agile lets us build more, learn more and grow more.</div></div>
      <div className="val"><b>BUILD</b><div>We build continuous value for our clients, our staff and our communities.</div></div>
      <div className="val"><b>IMPACT</b><div>We tackle the most important problems our clients face.</div></div>
      <div className="val"><b>FAST</b><div>We move fast, always for the benefit of our clients.</div></div>
    </div>
  </div>

    <div className="sec">
    <h2><span className="bar"></span>Introduction</h2>
    <p className="muted">The Client has engaged R-E-D with the possibility to provide services as described under "Overview of Service".</p>
    <p className="muted">R-E-D hereby agrees to provide the Client with such services in exchange for consideration as described under "Costing Structure".</p>
    <p className="muted">A full overview and description of services is included for reference.</p>
  </div>

    <div className="sec">
    <h2><span className="bar"></span>Term and duration</h2>
    <ol className="terms muted">
      <li>Either party will have the right to terminate the contract by giving at least 30 days' notice in writing to the other party.</li>
      <li>Either party may terminate this contract by written notice to the other at any time if that other party:
        <ol className="alpha">
          <li>commits a breach of this agreement and, in the case of a breach capable of remedy, fails to remedy the breach within 14 days of being required to do so in writing; or</li>
          <li>becomes insolvent, or has a liquidator, receiver, manager or administrative receiver appointed.</li>
        </ol>
      </li>
    </ol>
  </div>

    <div className="sec">
    <h2><span className="bar"></span>Invoicing and payment</h2>
    <p className="muted">All packages are invoiced monthly in advance, with payment due by the 25th of the month to which the services relate. Invoices are typically issued between the 1st and 7th of the month, with payment due on or before the 25th of the same month.</p>
    <p className="muted">If the Client requires an order number, it is the Client's responsibility to issue an order number upon receipt of a quotation. The payment due date remains the 25th of the month, irrespective of the invoice date or any delay in issuing an order number.</p>
    <p className="muted">R-E-D reserves the right to suspend services in the event of outstanding balances.</p>
  </div>


    <section className="sec" aria-label="Overview of service">
      <SectionTitle>Overview of service</SectionTitle><h3>PostX</h3>
      {quote.service_overview && <p className="muted proposal-text">{quote.service_overview}</p>}
      <p className="muted">PostX is modular: each dealership selects the tools it needs. The modules included in this proposal are listed under Costing structure.</p>
    </section>
    <section className="sec pb" aria-label="Costing structure">
      <SectionTitle>Costing structure</SectionTitle>
      <CostBreakdowns quote={quote} proposal />
      {quote.notes && <section className="proposal-notes"><h3>Notes</h3><p className="muted quote-notes proposal-text">{quote.notes}</p></section>}
      <VatNote quote={quote} />
      <FinalTotals quote={quote} />
    </section>
    <div className="proposal-acceptance">
    <section className="sec oc-wrap" aria-label="Order confirmation">
      <SectionTitle>Order confirmation</SectionTitle>
      <table className="oc"><tbody>
        <tr><th scope="row">Group</th><td>{client.group_name || ''}</td></tr>
        <tr><th scope="row">Dealer / Brand</th><td>{client.business_name || ''}{client.brand ? ` · ${client.brand}` : ''}</td></tr>
        <tr><th scope="row">Contact</th><td>{[client.contact_name, client.contact_email].filter(Boolean).join(' · ')}</td></tr>
        <tr><th scope="row">Address</th><td className="proposal-text">{client.business_address || ''}</td></tr>
        <tr><th scope="row">Cancellation of service</th><td>Refer to Term and duration</td></tr>
        <tr><th scope="row">Authorised by (full name)</th><td className="sig" /></tr>
        <tr><th scope="row">Authorised signature</th><td className="sig" /></tr>
        <tr><th scope="row">Date</th><td className="sig" /></tr>
      </tbody></table>
    </section>
    <footer className="ftr"><div><b>PostX</b> · a product by R-E-D (Reach Engage Develop)</div><div><a href="mailto:postx@r-e-d.online">postx@r-e-d.online</a> · <a href="https://reachengagedevelop.com">reachengagedevelop.com</a></div></footer>
    </div>
  </article>
}
function SectionTitle({ children }) {
  return <h2><span className="bar" aria-hidden="true" />{children}</h2>
}
