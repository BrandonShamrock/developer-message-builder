\set ON_ERROR_STOP on
do $$ begin
  assert not exists(select 1 from public.crm_quotes where is_archived);
  assert not has_table_privilege('authenticated','public.crm_quotes','UPDATE');
  assert not has_table_privilege('authenticated','public.crm_quotes','DELETE');
  assert (select relrowsecurity from pg_class where oid='public.crm_quotes'::regclass);
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
do $$ declare q public.crm_quotes; before_header jsonb; before_items jsonb; result jsonb; begin
  for q in select * from public.crm_quotes where notes in ('New proposal','Issue proposal','Legacy issued') loop
    before_header:=to_jsonb(q)-'is_archived';
    select jsonb_agg(to_jsonb(i) order by position) into before_items from public.crm_quote_items i where quote_id=q.id;
    result:=public.set_crm_quote_archived(q.id,true);
    assert result=jsonb_build_object('id',q.id,'is_archived',true);
    assert (select is_archived from public.crm_quotes where id=q.id);
    -- Retry is idempotent; only the administrative visibility flag ever changes.
    perform public.set_crm_quote_archived(q.id,true);
    assert (select to_jsonb(h)-'is_archived' from public.crm_quotes h where id=q.id)=before_header;
    assert (select jsonb_agg(to_jsonb(i) order by position) from public.crm_quote_items i where quote_id=q.id)=before_items;
    if q.status='draft' then
      perform public.test_expect_error(format('select public.save_crm_quote(%L,%L,%L::jsonb,%L,false,''draft'',%s)',q.id,q.crm_client_id,before_items,q.notes,q.discount_percentage),'Restore this quotation');
      perform public.test_expect_error(format('select public.save_crm_quote_proposal(%L,%L,%L::jsonb,%L,false,''draft'',%s,''Changed'',null)',q.id,q.crm_client_id,before_items,q.notes,q.discount_percentage),'Restore this quotation');
    else
      perform public.test_expect_error(format('select public.save_crm_quote(%L,%L,%L::jsonb,'''',false,''draft'',%s)',q.id,q.crm_client_id,before_items,q.discount_percentage),'Only draft');
    end if;
    perform public.test_expect_error(format('update public.crm_quotes set is_archived=false,notes=''Tampered'' where id=%L',q.id),'permission denied');
    perform public.test_expect_error(format('delete from public.crm_quotes where id=%L',q.id),'permission denied');
    -- Restored issued quotations stay issued; every financial/content field is identical.
    perform public.set_crm_quote_archived(q.id,false);
    perform public.set_crm_quote_archived(q.id,false);
    assert (select not is_archived from public.crm_quotes where id=q.id);
    assert (select to_jsonb(h)-'is_archived' from public.crm_quotes h where id=q.id)=before_header;
    assert (select jsonb_agg(to_jsonb(i) order by position) from public.crm_quote_items i where quote_id=q.id)=before_items;
    if q.status='issued' then
      perform public.test_expect_error(format('select public.save_crm_quote_proposal(%L,%L,%L::jsonb,'''',false,''draft'',%s,null,null)',q.id,q.crm_client_id,before_items,q.discount_percentage),'Only draft');
    end if;
  end loop;
  perform public.test_expect_error($q$select public.set_crm_quote_archived('00000000-0000-0000-0000-000000000000',true)$q$,'Quotation not found');
  perform public.test_expect_error($q$select public.set_crm_quote_archived(null,null)$q$,'Archive state is required');
end $$;
-- All records, not just the selected archive targets, retain their original data.
reset role;
do $$ begin
  assert not exists(select 1 from public.test_pre_archive_quotes b full join public.crm_quotes q on q.id=b.id
    where q.id is null or b.id is null or to_jsonb(q)-'is_archived' is distinct from b.header
    or (select jsonb_agg(to_jsonb(i) order by position) from public.crm_quote_items i where quote_id=q.id) is distinct from b.items);
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
-- Original saves still work after restoring a draft, including new proposal fields.
do $$ declare q public.crm_quotes; saved jsonb; begin
  select * into q from public.crm_quotes where notes='New proposal';
  saved:=public.save_crm_quote_proposal(q.id,q.crm_client_id,(select jsonb_agg(to_jsonb(i)) from public.crm_quote_items i where quote_id=q.id),'Saved after restore',false,'draft',q.discount_percentage,q.service_overview,q.valid_until);
  assert (saved->>'is_archived')::boolean=false;
  assert saved->>'service_overview'=q.service_overview and (saved->>'valid_until')::date=q.valid_until;
  assert (saved->>'setup_total_including_vat')::numeric=q.setup_total_including_vat;
  perform public.set_crm_quote_archived((select id from public.crm_quotes where notes='Legacy issued'),true);
end $$;
select set_config('request.jwt.claim.sub','',false);
do $$ begin
  perform public.test_expect_error($q$select public.set_crm_quote_archived(null,true)$q$,'Authentication required');
end $$;
set role anon;
do $$ begin
  perform public.test_expect_error($q$select public.set_crm_quote_archived(null,true)$q$,'permission denied');
end $$;
reset role;
select 'Archiving assertions passed: default active, draft/issued archive+restore, snapshots, auth, immutability, save compatibility and unchanged RLS/grants' as result;
