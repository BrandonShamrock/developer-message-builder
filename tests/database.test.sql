\set ON_ERROR_STOP on
-- Preconditions are the repo migrations and three local fake auth users.
create or replace function public.test_expect_error(p_sql text, p_message text) returns void language plpgsql as $$
declare v_message text;
begin
  begin execute p_sql; exception when others then v_message := sqlerrm; end;
  if v_message is null then raise exception 'Expected failure for: %',p_sql; end if;
  if position(p_message in v_message) = 0 then raise exception 'Unexpected error: % (expected %)',v_message,p_message; end if;
end $$;
-- A test-only trigger proves rollback after the quote header has been written.
create or replace function public.test_fail_quote_items() returns trigger language plpgsql as $$
begin
  if current_setting('test.fail_quote_items',true) = 'yes' then raise exception 'Injected item write failure'; end if;
  return new;
end $$;
create trigger test_fail_quote_items before insert on public.crm_quote_items for each row execute function public.test_fail_quote_items();
insert into public.profiles(id,full_name,email,role) values
('11111111-1111-1111-1111-111111111111','Manager','manager@example.test','manager'),
('22222222-2222-2222-2222-222222222222','Agent','agent@example.test','agent'),
('33333333-3333-3333-3333-333333333333','Other','other@example.test','agent');
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$ declare v_task public.daily_tasks; v_key text; v_qc jsonb := '{}'; begin
  perform public.test_expect_error($q$insert into public.daily_tasks(owner_id,title,created_by) values(auth.uid(),'No category',auth.uid())$q$,'category');
  select * into v_task from jsonb_populate_record(null::public.daily_tasks, public.save_daily_task_with_qc(null,'{"title":"Onboarding test","category":"Onboarding","status":"todo","task_date":"2026-11-03"}',auth.uid(),'{}'));
  assert v_task.status='todo';
  perform set_config('test.task_id',v_task.id::text,false);
  insert into public.daily_task_onboarding_qc(task_id,setup_type,outcome,updated_by) values(v_task.id,'PostX Organisation','completed',auth.uid());
  perform public.test_expect_error(format('update public.daily_tasks set status=''completed'' where id=%L',v_task.id),'17 setup types outstanding');
  select * into v_task from jsonb_populate_record(null::public.daily_tasks, public.save_daily_task_with_qc(v_task.id,'{"title":"Still partial","category":"Onboarding","status":"wip","task_date":"2026-11-03"}',auth.uid(),'{"Subgroups":"not_acquired"}'));
  assert v_task.status='wip';
  assert (select count(*) from public.daily_task_onboarding_qc where task_id=v_task.id and outcome is not null)=2;
  foreach v_key in array array['PostX Organisation','Subgroups','Members','SLA','Quick Replies','Open Hours','WABAs','Routing','LiveChat','Automated Replies','Integration','Conexa','AI','Social Media Synced','Post Types','Review Boosted','Tested','Training'] loop v_qc:=v_qc||jsonb_build_object(v_key,'completed'); end loop;
  select * into v_task from jsonb_populate_record(null::public.daily_tasks, public.save_daily_task_with_qc(v_task.id,'{"title":"Completed onboarding","category":"Onboarding","status":"completed","task_date":"2026-11-03"}',auth.uid(),v_qc));
  assert v_task.status='completed' and v_task.completed_at is not null;
  perform public.test_expect_error(format('update public.daily_task_onboarding_qc set outcome=null where task_id=%L',v_task.id),'Reopen');
  update public.daily_tasks set status='wip',completed_at=null where id=v_task.id;
  update public.daily_tasks set category='Support' where id=v_task.id;
  assert (select count(*) from public.daily_task_onboarding_qc where task_id=v_task.id)=18;
  update public.daily_tasks set category='Onboarding' where id=v_task.id;
  insert into public.user_preferences(user_id,theme_mode) values(auth.uid(),'dark');
  perform public.test_expect_error($q$insert into public.user_preferences(user_id) values('33333333-3333-3333-3333-333333333333')$q$,'row-level security');
end $$;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
do $$ begin
  assert (select count(*) from public.daily_tasks where id=current_setting('test.task_id')::uuid)=0;
  assert (select count(*) from public.daily_task_onboarding_qc where task_id=current_setting('test.task_id')::uuid)=0;
  assert (select count(*) from public.user_preferences)=0;
  perform public.test_expect_error($q$insert into public.daily_task_onboarding_qc(task_id,setup_type,outcome,updated_by) values(current_setting('test.task_id')::uuid,'Training','completed',auth.uid())$q$,'Task not found');
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$ begin
  assert (select count(*) from public.user_preferences)=0; -- managers cannot read agents' appearance
  assert (select count(*) from public.daily_task_onboarding_qc where task_id=current_setting('test.task_id')::uuid)=18;
  perform public.transfer_daily_task(current_setting('test.task_id')::uuid,'33333333-3333-3333-3333-333333333333','2026-11-03','Other','Transfer preserves QC');
  assert (select status from public.daily_tasks where id=current_setting('test.task_id')::uuid)='todo';
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$ begin assert (select count(*) from public.daily_task_onboarding_qc where task_id=current_setting('test.task_id')::uuid)=0; end $$;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
do $$ begin
  assert (select count(*) from public.daily_task_onboarding_qc where task_id=current_setting('test.task_id')::uuid)=18;
  assert (select count(*) from public.postx_daily_notifications)=1;
  assert (select outcome from public.daily_task_onboarding_qc where task_id=current_setting('test.task_id')::uuid and setup_type='LiveChat')='completed';
  update public.daily_tasks set status='completed',completed_at=now() where id=current_setting('test.task_id')::uuid;
  assert (select completed_at from public.daily_tasks where id=current_setting('test.task_id')::uuid) is not null;
end $$;
-- Upgrading preserves all 17 legacy selections and Completed status on unrelated edits.
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$ declare t public.daily_tasks; qc jsonb; begin
  select * into t from public.daily_tasks where title='Legacy completed onboarding';
  assert t.status='completed';
  assert (select count(*) from public.daily_task_onboarding_qc where task_id=t.id)=17;
  assert not exists(select 1 from public.daily_task_onboarding_qc where task_id=t.id and setup_type='LiveChat');
  select jsonb_object_agg(setup_type,outcome) into qc from public.daily_task_onboarding_qc where task_id=t.id;
  perform public.save_daily_task_with_qc(t.id,to_jsonb(t)||'{"notes":"Unrelated legacy edit"}',t.owner_id,qc);
  assert (select status from public.daily_tasks where id=t.id)='completed';
  update public.daily_tasks set status='wip' where id=t.id;
  perform public.test_expect_error(format('update public.daily_tasks set status=''completed'' where id=%L',t.id),'1 setup types outstanding');
  insert into public.daily_task_onboarding_qc(task_id,setup_type,outcome,updated_by) values(t.id,'LiveChat','completed',auth.uid());
  update public.daily_task_onboarding_qc set outcome='not_acquired' where task_id=t.id and setup_type='LiveChat';
  update public.daily_tasks set status='completed' where id=t.id;
  assert (select status from public.daily_tasks where id=t.id)='completed';
end $$;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
-- Shared catalogue and quotes, authoritative group discounts and historical snapshots.
do $$ declare v_group uuid; v_client uuid; v_product uuid; v_quote jsonb; v_saved jsonb; v_items jsonb; v_before integer; begin
  insert into public.crm_groups(name,discount_percentage,created_by,updated_by) values('Group',10,auth.uid(),auth.uid()) returning id into v_group;
  insert into public.crm_clients(group_id,group_name,business_name,contact_name,contact_email,group_discount_percentage,created_by,updated_by) values(v_group,'Old','Dealer','Person','person@example.test',5,auth.uid(),auth.uid()) returning id into v_client;
  insert into public.crm_products(name,setup_cost,monthly_cost,created_by,updated_by) values('AI',1500,750,auth.uid(),auth.uid()) returning id into v_product;
  v_items:=jsonb_build_array(jsonb_build_object('product_id',v_product,'quantity','2','setup_unit_cost','1500','monthly_unit_cost','750'));
  select count(*) into v_before from public.crm_quotes;
  perform set_config('test.fail_quote_items','yes',false);
  perform public.test_expect_error(format('select public.save_crm_quote(null,%L,%L::jsonb,'''',true,''draft'',10)',v_client,v_items),'Injected item write failure');
  assert (select count(*) from public.crm_quotes)=v_before;
  perform set_config('test.fail_quote_items','no',false);
  v_quote:=public.save_crm_quote(null,v_client,v_items,'Notes',true,'draft',10);
  assert (v_quote->>'setup_total')::numeric=2700 and (v_quote->>'monthly_total')::numeric=1350;
  assert (v_quote->>'vat_rate')::numeric=15;
  assert (v_quote->>'setup_vat')::numeric=405 and (v_quote->>'monthly_vat')::numeric=202.50;
  assert (v_quote->>'setup_total_including_vat')::numeric=3105 and (v_quote->>'monthly_total_including_vat')::numeric=1552.50;
  assert (v_quote->'client_snapshot'->>'group_name')='Group';
  assert (v_quote->>'discount_percentage')::numeric=10;
  assert (select count(*) from public.crm_quote_items where quote_id=(v_quote->>'id')::uuid)=1;
  perform public.test_expect_error(format('update public.crm_quotes set setup_total=0 where id=%L',v_quote->>'id'),'permission denied');
  update public.crm_products set setup_cost=9999,monthly_cost=999,is_active=false,updated_by=auth.uid() where id=v_product;
  update public.crm_groups set discount_percentage=20,updated_by=auth.uid() where id=v_group;
  v_items:=(v_quote->'crm_quote_items');
  v_saved:=public.save_crm_quote((v_quote->>'id')::uuid,v_client,v_items,'Edited notes',false,'draft',10);
  assert (v_saved->>'setup_total')::numeric=2700 and (v_saved->>'monthly_total')::numeric=1350;
  assert (v_saved->'crm_quote_items'->0->>'setup_unit_cost')::numeric=1500;
  v_saved:=public.save_crm_quote((v_saved->>'id')::uuid,v_client,v_saved->'crm_quote_items','Refresh',true,'draft',20);
  assert (v_saved->>'setup_total')::numeric=2400;
  select count(*) into v_before from public.crm_quotes;
  perform public.test_expect_error(format('select public.save_crm_quote(null,%L,%L::jsonb,'''',true,''draft'',20)',v_client,jsonb_build_array(jsonb_build_object('product_id',v_product,'quantity','1','setup_unit_cost','9999','monthly_unit_cost','999'))),'archived');
  assert (select count(*) from public.crm_quotes)=v_before;
  -- Invalid edit rolls back deletion/replacement and leaves the original lines.
  perform public.test_expect_error(format('select public.save_crm_quote(%L,%L,%L::jsonb,'''',false,''draft'',20)',v_saved->>'id',v_client,jsonb_build_array(jsonb_build_object('id',v_saved->'crm_quote_items'->0->>'id','quantity','-1'))),'Quantity');
  assert (select count(*) from public.crm_quote_items where quote_id=(v_saved->>'id')::uuid)=1;
  perform set_config('test.fail_quote_items','yes',false);
  perform public.test_expect_error(format('select public.save_crm_quote(%L,%L,%L::jsonb,'''',false,''draft'',20)',v_saved->>'id',v_client,v_saved->'crm_quote_items'),'Injected item write failure');
  assert (select count(*) from public.crm_quote_items where quote_id=(v_saved->>'id')::uuid)=1;
  assert (select notes from public.crm_quotes where id=(v_saved->>'id')::uuid)='Refresh';
  perform set_config('test.fail_quote_items','no',false);
  v_saved:=public.save_crm_quote((v_saved->>'id')::uuid,v_client,v_saved->'crm_quote_items','Issued',false,'issued',20);
  perform public.test_expect_error(format('select public.save_crm_quote(%L,%L,%L::jsonb,'''',false,''draft'',20)',v_saved->>'id',v_client,v_saved->'crm_quote_items'),'Only draft');
end $$;
do $$ declare v_client uuid; v_product uuid; v_group uuid; v_quote jsonb; v_full jsonb; v_items jsonb; begin
  select id,group_id into v_client,v_group from public.crm_clients where business_name='Dealer';
  update public.crm_groups set discount_percentage=10,updated_by=auth.uid() where id=v_group;
  insert into public.crm_products(name,setup_cost,monthly_cost,created_by,updated_by) values('Fractional',0.10,0.05,auth.uid(),auth.uid()) returning id into v_product;
  v_items:=jsonb_build_array(jsonb_build_object('product_id',v_product,'quantity','1.5','setup_unit_cost','0.10','monthly_unit_cost','0.05'));
  v_quote:=public.save_crm_quote(null,v_client,v_items,'Rounding',true,'draft',10);
  assert (v_quote->>'setup_subtotal')::numeric=0.15 and (v_quote->>'setup_discount')::numeric=0.02 and (v_quote->>'setup_total')::numeric=0.13;
  assert (v_quote->>'monthly_subtotal')::numeric=0.08 and (v_quote->>'monthly_discount')::numeric=0.01 and (v_quote->>'monthly_total')::numeric=0.07;
  assert (v_quote->>'setup_vat')::numeric=0.02 and (v_quote->>'monthly_vat')::numeric=0.01;
  assert (v_quote->>'setup_total_including_vat')::numeric=0.15 and (v_quote->>'monthly_total_including_vat')::numeric=0.08;
  update public.crm_groups set discount_percentage=100,updated_by=auth.uid() where id=v_group;
  v_full:=public.save_crm_quote(null,v_client,v_items,'Full discount',true,'draft',100);
  assert (v_full->>'setup_total')::numeric=0 and (v_full->>'monthly_total')::numeric=0;
  assert (v_full->>'setup_vat')::numeric=0 and (v_full->>'monthly_vat')::numeric=0;
  assert (v_full->>'setup_total_including_vat')::numeric=0 and (v_full->>'monthly_total_including_vat')::numeric=0;
  assert v_full->>'quote_number' <> v_quote->>'quote_number';
  update public.crm_groups set discount_percentage=0,updated_by=auth.uid() where id=v_group;
  v_quote:=public.save_crm_quote(null,v_client,v_items,'Zero discount',true,'draft',0);
  assert (v_quote->>'setup_total')::numeric=0.15 and (v_quote->>'monthly_total')::numeric=0.08;
  assert (v_quote->>'setup_vat')::numeric=0.02 and (v_quote->>'monthly_vat')::numeric=0.01;
  update public.crm_products set setup_cost=0,monthly_cost=0 where id=v_product;
  v_items:=jsonb_build_array(jsonb_build_object('product_id',v_product,'quantity','1','setup_unit_cost','0','monthly_unit_cost','0'));
  v_full:=public.save_crm_quote(null,v_client,v_items,'Free',true,'draft',0);
  assert (v_full->>'setup_total_including_vat')::numeric=0 and (v_full->>'monthly_total_including_vat')::numeric=0;
end $$;
-- Historical quotes are unchanged by migrations; only explicit draft save applies VAT.
do $$ declare q public.crm_quotes; saved jsonb; begin
  select * into q from public.crm_quotes where notes='Legacy issued';
  assert q.vat_rate is null and q.setup_total=1350 and q.monthly_total=675;
  perform public.test_expect_error(format('select public.save_crm_quote(%L,%L,%L::jsonb,'''',false,''draft'',10)',q.id,q.crm_client_id,(select jsonb_agg(to_jsonb(i)) from public.crm_quote_items i where quote_id=q.id)),'Only draft');
  select * into q from public.crm_quotes where notes='Legacy draft';
  assert q.vat_rate is null;
  saved:=public.save_crm_quote(q.id,q.crm_client_id,(select jsonb_agg(to_jsonb(i)) from public.crm_quote_items i where quote_id=q.id),'Updated historical draft',false,'draft',10);
  assert (saved->>'setup_total')::numeric=1350 and (saved->>'monthly_total')::numeric=675;
  assert (saved->>'setup_total_including_vat')::numeric=1552.50 and (saved->>'monthly_total_including_vat')::numeric=776.25;
  assert saved->'client_snapshot'=q.client_snapshot and saved->>'quote_number'=q.quote_number;
  assert (saved->'crm_quote_items'->0->>'setup_unit_cost')::numeric=1500;
end $$;
reset role;
-- Every original field and line of the issued quotation is byte-for-byte unchanged.
do $$ begin
  assert (select to_jsonb(q) - array['vat_rate','setup_vat','monthly_vat','setup_total_including_vat','monthly_total_including_vat'] from public.crm_quotes q where notes='Legacy issued')=(select header from public.test_legacy_snapshot where kind='quote');
  assert (select jsonb_agg(to_jsonb(i) order by i.position) from public.crm_quote_items i join public.crm_quotes q on q.id=i.quote_id where q.notes='Legacy issued')=(select items from public.test_legacy_snapshot where kind='quote');
end $$;

-- A future configured rate applies to explicit saves, never to stored snapshots.
begin;
create or replace function public.crm_quote_vat_rate()
returns numeric language sql immutable set search_path = '' as $$ select 16.0000::numeric $$;
do $$ declare q public.crm_quotes; saved jsonb; begin
  select * into q from public.crm_quotes where notes='Updated historical draft';
  assert q.vat_rate=15 and q.setup_total_including_vat=1552.50;
  saved:=public.save_crm_quote(q.id,q.crm_client_id,(select jsonb_agg(to_jsonb(i)) from public.crm_quote_items i where quote_id=q.id),'Future rate',false,'draft',10);
  assert (saved->>'vat_rate')::numeric=16 and (saved->>'setup_total_including_vat')::numeric=1566;
  assert (saved->>'monthly_total_including_vat')::numeric=783;
  -- Complete/null and numeric consistency constraints reject malformed snapshots.
  perform public.test_expect_error(format('update public.crm_quotes set setup_vat=null where id=%L',q.id),'crm_quotes_vat_snapshot_check');
  perform public.test_expect_error(format('update public.crm_quotes set setup_total_including_vat=0 where id=%L',q.id),'crm_quotes_vat_snapshot_check');
  assert (select setup_total_including_vat from public.crm_quotes where id=q.id)=1566;
end $$;
rollback;
select 'Database assertions passed: categories, QC, RLS, transfers, preferences, quote atomicity and snapshots' as result;
