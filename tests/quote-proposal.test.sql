\set ON_ERROR_STOP on
-- Runs only in the disposable database after the complete original regression suite.
do $$ begin
  assert (select service_overview is null and valid_until is null from public.crm_quotes where notes='Legacy issued');
end $$;
create or replace function public.test_fail_proposal_metadata() returns trigger language plpgsql as $$
begin
  if new.service_overview='FAIL_METADATA_WRITE' then raise exception 'Injected proposal metadata failure'; end if;
  return new;
end $$;
create trigger test_fail_proposal_metadata before update on public.crm_quotes for each row execute function public.test_fail_proposal_metadata();
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
do $$ declare q public.crm_quotes; saved jsonb; issued jsonb; items jsonb; before_header jsonb; before_items jsonb; before_count integer; begin
  select * into q from public.crm_quotes where notes='Updated historical draft';
  select jsonb_agg(to_jsonb(i)) into items from public.crm_quote_items i where quote_id=q.id;
  saved:=public.save_crm_quote_proposal(q.id,q.crm_client_id,items,'Proposal notes',false,'draft',10,'Custom overview with <script>literal text</script>','2026-12-15');
  assert saved->>'service_overview'='Custom overview with <script>literal text</script>';
  assert saved->>'valid_until'='2026-12-15';
  assert (saved->>'setup_total_including_vat')::numeric=1552.50 and (saved->>'setup_vat')::numeric=202.50;
  assert saved->'client_snapshot'=q.client_snapshot and saved->>'quote_number'=q.quote_number;
  -- A metadata failure must roll back the original financial/header/item save as well.
  before_header:=saved-'crm_quote_items'; before_items:=saved->'crm_quote_items';
  perform public.test_expect_error(format('select public.save_crm_quote_proposal(%L,%L,%L::jsonb,''changed notes'',false,''draft'',10,''FAIL_METADATA_WRITE'',''2026-12-20'')',q.id,q.crm_client_id,before_items),'Injected proposal metadata failure');
  assert (select to_jsonb(h) from public.crm_quotes h where id=q.id)=before_header;
  assert (select jsonb_agg(to_jsonb(i) order by position) from public.crm_quote_items i where quote_id=q.id)=before_items;
  -- Blank values clear the optional fields on an editable draft.
  saved:=public.save_crm_quote_proposal(q.id,q.crm_client_id,before_items,'Clear optional fields',false,'draft',10,'   ',null);
  assert saved->>'service_overview' is null and saved->>'valid_until' is null;
  -- Original clients still save through the unchanged seven-argument RPC.
  saved:=public.save_crm_quote_proposal(q.id,q.crm_client_id,saved->'crm_quote_items','Restore fields',false,'draft',10,'Keep this overview','2026-12-15');
  saved:=public.save_crm_quote(q.id,q.crm_client_id,saved->'crm_quote_items','Old frontend save',false,'draft',10);
  assert saved->>'service_overview'='Keep this overview' and saved->>'valid_until'='2026-12-15';
  issued:=public.save_crm_quote_proposal(q.id,q.crm_client_id,saved->'crm_quote_items','Issue proposal',false,'issued',10,'Final overview','2026-12-31');
  assert issued->>'service_overview'='Final overview' and issued->>'status'='issued';
  perform public.test_expect_error(format('select public.save_crm_quote_proposal(%L,%L,%L::jsonb,'''',false,''draft'',10,''Tampered'',''2027-01-01'')',q.id,q.crm_client_id,issued->'crm_quote_items'),'Only draft');
  assert (select to_jsonb(h) from public.crm_quotes h where id=q.id)=issued-'crm_quote_items';
  perform public.test_expect_error(format('update public.crm_quotes set service_overview=''Tampered'' where id=%L',q.id),'permission denied');
  perform public.test_expect_error(format('select public.save_crm_quote_proposal(null,%L,%L::jsonb,'''',true,''draft'',10,null,''infinity'')',q.crm_client_id,items),'finite expiry date');
end $$;
-- New-record rollback: the metadata failure cannot leave an orphan quote header/items.
do $$ declare c uuid; p uuid; payload jsonb; saved jsonb; before_count integer; begin
  insert into public.crm_groups(name,discount_percentage,created_by,updated_by) values('Proposal group',0,auth.uid(),auth.uid());
  insert into public.crm_clients(business_name,contact_name,contact_email,created_by,updated_by) values('Proposal client','Test','proposal@example.test',auth.uid(),auth.uid()) returning id into c;
  insert into public.crm_products(name,setup_cost,monthly_cost,created_by,updated_by) values('Proposal product',100,0,auth.uid(),auth.uid()) returning id into p;
  payload:=jsonb_build_array(jsonb_build_object('product_id',p,'quantity','1','setup_unit_cost','100','monthly_unit_cost','0'));
  select count(*) into before_count from public.crm_quotes;
  perform public.test_expect_error(format('select public.save_crm_quote_proposal(null,%L,%L::jsonb,'''',true,''draft'',0,''FAIL_METADATA_WRITE'',null)',c,payload),'Injected proposal metadata failure');
  assert (select count(*) from public.crm_quotes)=before_count;
  saved:=public.save_crm_quote_proposal(null,c,payload,'New proposal',true,'draft',0,'New client overview','2026-12-15');
  assert saved->>'service_overview'='New client overview' and saved->>'valid_until'='2026-12-15';
  assert (saved->>'setup_total_including_vat')::numeric=115 and (saved->>'monthly_total_including_vat')::numeric=0;
end $$;
select set_config('request.jwt.claim.sub','',false);
do $$ begin
  perform public.test_expect_error($q$select public.save_crm_quote_proposal(null,null,'[]','')$q$,'Authentication required');
end $$;
reset role;
select 'Proposal assertions passed: persisted fields, blanks, auth, issued immutability, rollback, original RPC compatibility and VAT' as result;
