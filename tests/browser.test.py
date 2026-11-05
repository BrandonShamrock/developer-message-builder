"""Run against Vite: python tests/browser.test.py. Requires Playwright + Chromium.
All Supabase access is replaced at the module boundary; no live backend is used.
Database enforcement is tested separately in database.test.sql.
"""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parent
SETUPS=['PostX Organisation','Subgroups','Members','SLA','Quick Replies','Open Hours','WABAs','Routing','LiveChat','Automated Replies','Integration','Conexa','AI','Social Media Synced','Post Types','Review Boosted','Tested','Training']
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1440,'height':1000})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.route(re.compile(r'.*/src/supabase\.js(?:\?.*)?$'),lambda route:route.fulfill(status=200,content_type='application/javascript',body=(ROOT/'browser-fixture.js').read_text()))
    page.goto('http://127.0.0.1:5173/')
    nav=page.locator('.sidebar nav')
    expect(nav.get_by_role('button')).to_have_count(9)
    # Appearance: preview, cancel, default, save, reload, logout/login.
    page.get_by_role('button',name='Appearance Settings',exact=True).click()
    dialog=page.get_by_role('dialog')
    dialog.get_by_label('Mode',exact=True).select_option('dark')
    dialog.get_by_label('Purple',exact=True).check()
    dialog.get_by_label('Font size',exact=True).select_option('extra-large')
    expect(page.locator('html')).to_have_attribute('data-mode','dark')
    dialog.get_by_role('button',name='Cancel',exact=True).click()
    expect(page.locator('html')).to_have_attribute('data-mode','light')
    page.get_by_role('button',name='Appearance Settings',exact=True).click()
    dialog.get_by_label('Mode',exact=True).select_option('dark')
    dialog.get_by_label('Teal',exact=True).check()
    dialog.get_by_label('Font size',exact=True).select_option('large')
    dialog.get_by_role('button',name='Save Preferences',exact=True).click()
    page.reload()
    expect(page.locator('html')).to_have_attribute('data-mode','dark')
    page.get_by_role('button',name='Logout',exact=True).click()
    expect(page.locator('html')).to_have_attribute('data-mode','light')
    page.get_by_label('Email',exact=True).fill('manager@example.test')
    page.get_by_label('Password',exact=True).fill('local-test')
    page.get_by_role('button',name='Sign In',exact=True).click()
    expect(page.locator('html')).to_have_attribute('data-mode','dark')
    page.get_by_role('button',name='Appearance Settings',exact=True).click()
    dialog.get_by_role('button',name='Reset to Default',exact=True).click()
    expect(page.locator('html')).to_have_attribute('data-mode','light')
    dialog.get_by_role('button',name='Save Preferences',exact=True).click()
    print('PASS appearance preview/cancel/reset/save/reload/logout/login')
    # Tasks: category, partial QC, failure preservation, status guards, reopen.
    nav.get_by_role('button',name='PostX Daily',exact=True).click()
    expect(page.get_by_text('Legacy carried task',exact=True)).to_be_visible()
    expect(page.get_by_text(re.compile('Carried over'))).to_be_visible()
    page.get_by_role('button',name='Create Task',exact=True).click()
    task=page.get_by_role('dialog')
    task.get_by_label('Task title',exact=True).fill('Onboarding browser test')
    task.get_by_role('button',name='Create Task',exact=True).click()
    expect(task.get_by_role('alert')).to_contain_text('Please select a task category')
    task.get_by_label('Category',exact=True).select_option('Onboarding')
    expect(task.get_by_role('checkbox')).to_have_count(36)
    assert len(SETUPS)==len(set(SETUPS))==18
    expect(task.get_by_role('rowheader',name='Routing',exact=True)).to_have_count(1)
    task.get_by_label('LiveChat: Completed',exact=True).check()
    task.get_by_label('LiveChat: Not Acquired',exact=True).check()
    expect(task.get_by_label('LiveChat: Completed',exact=True)).not_to_be_checked()
    task.get_by_label('PostX Organisation: Completed',exact=True).check()
    task.get_by_label('PostX Organisation: Not Acquired',exact=True).check()
    expect(task.get_by_label('PostX Organisation: Completed',exact=True)).not_to_be_checked()
    task.get_by_label('Status',exact=True).select_option('completed')
    task.get_by_role('button',name='Create Task',exact=True).click()
    expect(task.get_by_role('alert')).to_contain_text('16 setup types outstanding')
    task.get_by_label('Status',exact=True).select_option('wip')
    task.get_by_role('button',name='Create Task',exact=True).click()
    card=page.locator('.kanban-task').filter(has=page.get_by_role('heading',name='Onboarding browser test',exact=True))
    expect(card.get_by_text('Category: Onboarding',exact=True)).to_be_visible()
    card.get_by_label('Status for Onboarding browser test',exact=True).select_option('completed')
    expect(page.get_by_role('alert')).to_contain_text('16 setup types outstanding')
    page.get_by_role('button',name='Open Onboarding QC checklist',exact=True).click()
    expect(task.get_by_label('PostX Organisation: Not Acquired',exact=True)).to_be_checked()
    expect(task.get_by_label('LiveChat: Not Acquired',exact=True)).to_be_checked()
    expect(task.get_by_text('Onboarding QC: 2 / 18 Reviewed',exact=True)).to_be_visible()
    for setup in SETUPS: task.get_by_label(f'{setup}: Completed',exact=True).check()
    task.get_by_label('Status',exact=True).select_option('completed')
    page.evaluate("window.__fail='save_daily_task_with_qc'")
    task.get_by_role('button',name='Save Changes',exact=True).click()
    expect(task.get_by_role('alert')).to_contain_text('Simulated RPC failure')
    expect(task.get_by_label('Task title',exact=True)).to_have_value('Onboarding browser test')
    page.evaluate('window.__fail=null')
    task.get_by_role('button',name='Save Changes',exact=True).click()
    expect(page.locator('.kanban-completed').get_by_role('heading',name='Onboarding browser test',exact=True)).to_be_visible()
    card.get_by_label('Status for Onboarding browser test',exact=True).select_option('wip')
    card.get_by_role('button',name='Onboarding QC checklist',exact=True).click()
    expect(task.get_by_text('Onboarding QC: 18 / 18 Reviewed',exact=True)).to_be_visible()
    task.get_by_role('button',name='Cancel',exact=True).click()
    with page.expect_popup() as popup:
        page.get_by_role('button',name='Print / Save as PDF',exact=True).click()
    expect(popup.value.locator('body')).to_contain_text('Category: Onboarding')
    popup.value.close()
    print('PASS task category/QC mutual exclusion/partial save/block completion/failure/reopen/PDF')
    # Products: create zero-cost, edit, search, archive and restore.
    nav.get_by_role('button',name='Products',exact=True).click()
    page.get_by_role('button',name='Create Product',exact=True).click()
    dialog.get_by_label('Product Name',exact=True).fill('Zero Cost Product')
    dialog.get_by_label('Description',exact=True).fill('Free service')
    dialog.get_by_role('button',name='Save Product',exact=True).click()
    product=page.locator('.crm-card').filter(has=page.get_by_role('heading',name='Zero Cost Product',exact=True))
    expect(product.get_by_text('R0.00',exact=True)).to_have_count(2)
    product.get_by_role('button',name='Edit',exact=True).click()
    dialog.get_by_label('Product Name',exact=True).fill('Updated Free Service')
    dialog.get_by_role('button',name='Save Changes',exact=True).click()
    product=page.locator('.crm-card').filter(has=page.get_by_role('heading',name='Updated Free Service',exact=True))
    product.get_by_role('button',name='Archive',exact=True).click()
    expect(product).to_have_count(0)
    page.get_by_label('Show archived products',exact=True).check()
    product.get_by_role('button',name='Restore',exact=True).click()
    page.get_by_label('Search products',exact=True).fill('Updated')
    expect(page.locator('.crm-card')).to_have_count(1)
    print('PASS products create/zero/edit/archive/restore/search')
    # Quote: CRM group wins, quantities, errors, save/view/edit snapshots, print.
    nav.get_by_role('button',name='Quotes',exact=True).click()
    page.get_by_role('button',name='Create Quote',exact=True).click()
    page.get_by_label('Search CRM clients',exact=True).fill('Alpha')
    page.get_by_label('Select Client',exact=True).select_option('client')
    expect(page.get_by_text('Group Discount: 10.0000%',exact=True)).to_be_visible()
    page.get_by_role('button',name='Add Product',exact=True).click()
    dialog.get_by_role('checkbox').first.check()
    dialog.get_by_role('button',name='Add Selected Products',exact=True).click()
    page.get_by_label('Quantity for PostX AI, line 1',exact=True).fill('2')
    expect(page.get_by_text('R2,700.00',exact=True)).to_be_visible()
    expect(page.get_by_text('R1,350.00',exact=True)).to_be_visible()
    page.get_by_label('Notes',exact=True).fill('Quotation notes')
    page.evaluate("window.__fail='save_crm_quote'")
    page.get_by_role('button',name='Save Quote',exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('Simulated RPC failure')
    page.evaluate('window.__fail=null')
    page.get_by_role('button',name='Save Quote',exact=True).click()
    expect(dialog.get_by_text('AB-2026-000001',exact=True)).to_be_visible()
    expect(dialog.get_by_text('VAT is included in the final totals, after group discount.',exact=True)).to_be_visible()
    expect(dialog.locator('.quote-final-totals strong')).to_have_text(['R3,105.00','R1,552.50'])
    assert page.evaluate('window.__db.crm_quotes[0].vat_rate')=='15.0000'
    assert page.evaluate('window.__db.crm_quotes[0].setup_vat')=='405.00'
    page.emulate_media(media='print')
    assert page.locator('.sidebar').evaluate('(e)=>getComputedStyle(e).display')=='none'
    page.pdf(path='/tmp/amper-besig-quote-test.pdf',format='A4')
    page.emulate_media(media='screen')
    dialog.get_by_role('button',name='Close Preview',exact=True).click()
    page.evaluate("window.__db.crm_products[0].setup_cost='9999.00'; window.__db.crm_groups[0].discount_percentage=20")
    page.get_by_role('button',name='Edit',exact=True).click()
    expect(page.get_by_text('R2,700.00',exact=True)).to_be_visible()
    expect(page.get_by_text('Group Discount: 10.0000%',exact=True)).to_be_visible()
    page.get_by_role('button',name='Cancel',exact=True).click()
    print('PASS quotes CRM/discount/quantity/atomic-error UX/save/view/snapshot/edit/print')
    # Historical issued/draft records are never recalculated just by viewing them.
    page.evaluate("""() => {
      const source=window.__db.crm_quotes[0];
      for (const status of ['issued','draft']) {
        const q=structuredClone(source); q.id='legacy-'+status; q.quote_number='LEGACY-'+status; q.status=status;
        for(const key of ['vat_rate','setup_vat','monthly_vat','setup_total_including_vat','monthly_total_including_vat']) q[key]=null;
        window.__db.crm_quotes.push(q);
      }
      const q=structuredClone(source); q.id='prior-rate'; q.quote_number='PRIOR-RATE'; q.status='issued'; q.vat_rate='14.0000';
      q.setup_vat='378.00';q.monthly_vat='189.00';q.setup_total_including_vat='3078.00';q.monthly_total_including_vat='1539.00';
      window.__db.crm_quotes.push(q);
      localStorage.setItem('amper-test-db',JSON.stringify(window.__db));
    }""")
    nav.get_by_role('button',name='Dashboard',exact=True).click()
    nav.get_by_role('button',name='Quotes',exact=True).click()
    legacy=page.locator('.crm-card').filter(has=page.get_by_role('heading',name='LEGACY-issued',exact=True))
    expect(legacy.get_by_role('button',name='Edit',exact=True)).to_be_disabled()
    legacy.get_by_role('button',name='View',exact=True).click()
    expect(dialog.locator('.vat-note')).to_contain_text('VAT was not calculated')
    expect(dialog.locator('.quote-final-totals strong')).to_have_text(['R2,700.00','R1,350.00'])
    expect(dialog.get_by_text('VAT (15%)',exact=True)).to_have_count(0)
    dialog.get_by_role('button',name='Close Preview',exact=True).click()
    prior=page.locator('.crm-card').filter(has=page.get_by_role('heading',name='PRIOR-RATE',exact=True))
    prior.get_by_role('button',name='View',exact=True).click()
    expect(dialog.get_by_text('VAT (14%)',exact=True)).to_have_count(2)
    expect(dialog.locator('.quote-final-totals strong')).to_have_text(['R3,078.00','R1,539.00'])
    dialog.get_by_role('button',name='Close Preview',exact=True).click()
    legacy=page.locator('.crm-card').filter(has=page.get_by_role('heading',name='LEGACY-draft',exact=True))
    legacy.get_by_role('button',name='Edit',exact=True).click()
    expect(page.locator('.quote-builder .quote-final-totals strong')).to_have_text(['R3,105.00','R1,552.50'])
    expect(page.get_by_text('Group Discount: 10.0000%',exact=True)).to_be_visible()
    page.get_by_role('button',name='Save Quote',exact=True).click()
    expect(dialog.locator('.quote-final-totals strong')).to_have_text(['R3,105.00','R1,552.50'])
    assert page.evaluate("window.__db.crm_quotes.find(q=>q.id==='legacy-issued').vat_rate") is None
    dialog.get_by_role('button',name='Close Preview',exact=True).click()
    print('PASS historical issued totals/read-only, prior VAT rate, explicit legacy draft save')
    # Mixed prices: the editing table retains all products; every cost breakdown filters by section.
    page.evaluate("""() => {
      window.__db.crm_products.push(
        {id:'setup-only',name:'Organisation Setup',description:'Setup only',setup_cost:'682.50',monthly_cost:'0.00',is_active:true},
        {id:'monthly-only',name:'Phone Number',description:'Monthly only',setup_cost:'0.00',monthly_cost:'147.00',is_active:true}
      );
      localStorage.setItem('amper-test-db',JSON.stringify(window.__db));
    }""")
    nav.get_by_role('button',name='Dashboard',exact=True).click()
    nav.get_by_role('button',name='Quotes',exact=True).click()
    page.get_by_role('button',name='Create Quote',exact=True).click()
    page.get_by_label('Select Client',exact=True).select_option('client')
    page.get_by_role('button',name='Add Product',exact=True).click()
    for choice in dialog.get_by_role('checkbox').all(): choice.check()
    dialog.get_by_role('button',name='Add Selected Products',exact=True).click()
    def check_filtered(scope):
        setup=scope.get_by_role('region',name='Setup Costs',exact=True)
        monthly=scope.get_by_role('region',name='Monthly Costs',exact=True)
        expect(setup.locator('tbody tr')).to_have_count(2)
        expect(monthly.locator('tbody tr')).to_have_count(2)
        expect(setup.get_by_role('cell',name=re.compile(r'^Organisation Setup(?: |$)'))).to_be_visible()
        expect(setup.get_by_role('cell',name=re.compile(r'^Phone Number(?: |$)'))).to_have_count(0)
        expect(monthly.get_by_role('cell',name=re.compile(r'^Phone Number(?: |$)'))).to_be_visible()
        expect(monthly.get_by_role('cell',name=re.compile(r'^Organisation Setup(?: |$)'))).to_have_count(0)
        for section in [setup,monthly]:
            expect(section.get_by_role('cell',name=re.compile(r'^PostX AI(?: |$)'))).to_be_visible()
            expect(section.get_by_role('cell',name=re.compile(r'^Updated Free Service(?: |$)'))).to_have_count(0)
    check_filtered(page.locator('.quote-builder'))
    expect(page.get_by_role('table',name='Selected products',exact=True).locator('tbody tr')).to_have_count(4)
    builder_totals=page.locator('.quote-builder .quote-final-totals strong').all_text_contents()
    page.get_by_role('button',name='Preview Quote',exact=True).click()
    check_filtered(dialog)
    expect(dialog.locator('.quote-final-totals strong')).to_have_text(builder_totals)
    dialog.get_by_role('button',name='Close Preview',exact=True).click()
    page.get_by_role('button',name='Save Quote',exact=True).click()
    check_filtered(dialog)
    expect(dialog.locator('.quote-final-totals strong')).to_have_text(builder_totals)
    # A4 PDF alignment is checked in the generated artifact as well as print CSS.
    page.emulate_media(media='print')
    boxes=dialog.locator('.quote-final-totals strong').evaluate_all('(els)=>els.map(e=>({y:e.getBoundingClientRect().y,x:e.getBoundingClientRect().x}))')
    assert abs(boxes[0]['y']-boxes[1]['y'])<1 and boxes[1]['x']>boxes[0]['x']
    assert dialog.locator('.quote-final-totals').evaluate('(e)=>getComputedStyle(e).breakInside')=='avoid'
    assert dialog.locator('.no-print').evaluate('(e)=>getComputedStyle(e).display')=='none'
    page.pdf(path='/tmp/amper-besig-mixed-quote.pdf',format='A4')
    page.emulate_media(media='screen')
    dialog.get_by_role('button',name='Close Preview',exact=True).click()
    print('PASS zero-price filtering in builder/unsaved/saved preview and aligned print totals')
    # All-free quote keeps zero totals and an empty-state explanation in both sections.
    page.get_by_role('button',name='Create Quote',exact=True).click()
    page.get_by_label('Select Client',exact=True).select_option('client')
    page.get_by_role('button',name='Add Product',exact=True).click()
    dialog.get_by_label(re.compile('Updated Free Service')).check()
    dialog.get_by_role('button',name='Add Selected Products',exact=True).click()
    for kind in ['setup','monthly']: expect(page.get_by_text(f'No chargeable {kind} items.',exact=True)).to_be_visible()
    expect(page.locator('.quote-builder .quote-final-totals strong')).to_have_text(['R0.00','R0.00'])
    page.get_by_role('button',name='Preview Quote',exact=True).click()
    for kind in ['setup','monthly']: expect(dialog.get_by_text(f'No chargeable {kind} items.',exact=True)).to_be_visible()
    expect(dialog.locator('tbody tr')).to_have_count(0)
    dialog.get_by_role('button',name='Close Preview',exact=True).click()
    page.get_by_role('button',name='Cancel',exact=True).click()
    # A long quotation must paginate naturally, with the final summary together on its final page.
    page.evaluate("""() => {
      const q=structuredClone(window.__db.crm_quotes.find(q=>q.vat_rate)); q.id='long';q.quote_number='LONG-QUOTE';q.status='issued';
      q.crm_quote_items=Array.from({length:70},(_,i)=>({...q.crm_quote_items[0],id:'long-'+i,position:i,product_name:'Long product '+String(i+1).padStart(2,'0'),product_description:'A detailed description for this historical pricing snapshot'}));
      // Match persisted header to the expanded snapshot fixture.
      for(const kind of ['setup','monthly']) for(const field of ['subtotal','discount','total','vat','total_including_vat']) q[kind+'_'+field]=(Number(q[kind+'_'+field])*70).toFixed(2);
      q.notes='End of long quotation';window.__db.crm_quotes.push(q);localStorage.setItem('amper-test-db',JSON.stringify(window.__db));
    }""")
    nav.get_by_role('button',name='Dashboard',exact=True).click()
    nav.get_by_role('button',name='Quotes',exact=True).click()
    page.locator('.crm-card').filter(has=page.get_by_role('heading',name='LONG-QUOTE',exact=True)).get_by_role('button',name='View',exact=True).click()
    page.set_viewport_size({'width':390,'height':844})
    page.emulate_media(media='print')
    boxes=dialog.locator('.quote-final-totals strong').evaluate_all('(els)=>els.map(e=>e.getBoundingClientRect().y)')
    assert abs(boxes[0]-boxes[1])<1
    page.pdf(path='/tmp/amper-besig-long-quote.pdf',format='A4')
    import fitz
    pdf=fitz.open('/tmp/amper-besig-long-quote.pdf')
    assert len(pdf)>2
    combined=''.join(p.get_text() for p in pdf)
    assert combined.count('Total Setup Cost')==1 and combined.count('Total Monthly Cost')==1
    last=pdf[-1]
    left=last.search_for('Total Setup Cost');right=last.search_for('Total Monthly Cost')
    assert len(left)==len(right)==1 and abs(left[0].y0-right[0].y0)<1
    assert 'Long product 70' in combined and 'End of long quotation' in last.get_text()
    assert 'Save Quote' not in combined and 'Print / Save as PDF' not in combined
    for rect in last.search_for('Total Setup Cost')+last.search_for('Total Monthly Cost'):
        assert rect.x0>=40 and rect.x1<=last.rect.width-40 and rect.y1<=last.rect.height-40
    pdf.close()
    page.emulate_media(media='screen')
    page.set_viewport_size({'width':1440,'height':1000})
    dialog.get_by_role('button',name='Close Preview',exact=True).click()
    print('PASS zero sections and multi-page A4 PDF with both totals together on final page')
    # Existing modules still mount and keep their controls.
    for name,control in [('Templates','Create Template'),('Clients','Create Client'),('CRM','Create Client')]:
        nav.get_by_role('button',name=name,exact=True).click()
        expect(page.get_by_role('button',name=control,exact=True)).to_be_visible()
    nav.get_by_role('button',name='Builder',exact=True).click()
    expect(page.locator('.builder')).to_be_visible()
    nav.get_by_role('button',name='Generated History',exact=True).click()
    expect(page.get_by_role('heading',name='Generated History',exact=True)).to_be_visible()
    # Mobile dark/extra-large, modal focus and horizontal overflow.
    page.set_viewport_size({'width':390,'height':844})
    page.get_by_role('button',name='Appearance Settings',exact=True).click()
    dialog.get_by_label('Mode',exact=True).select_option('dark')
    dialog.get_by_label('Font size',exact=True).select_option('extra-large')
    assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
    page.screenshot(path='/tmp/amper-besig-appearance-mobile.png',full_page=True)
    page.keyboard.press('Escape')
    expect(dialog).to_have_count(0)
    assert not errors,errors
    print('PASS existing module navigation, mobile appearance, Escape and no browser errors')
    browser.close()
