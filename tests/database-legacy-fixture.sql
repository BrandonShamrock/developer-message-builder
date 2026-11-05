-- Disposable local fixtures created with the OLD schema/RPC, before incremental migrations.
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
create table public.test_legacy_snapshot(kind text primary key, header jsonb, items jsonb);
do $$ declare g uuid; c uuid; p uuid; q jsonb; t jsonb; qc jsonb; begin
  insert into public.crm_groups(name,discount_percentage) values('Legacy group',10) returning id into g;
  insert into public.crm_clients(group_id,business_name,contact_name,contact_email) values(g,'Legacy dealer','Legacy person','legacy@example.test') returning id into c;
  insert into public.crm_products(name,setup_cost,monthly_cost) values('Legacy product',1500,750) returning id into p;
  q:=public.save_crm_quote(null,c,jsonb_build_array(jsonb_build_object('product_id',p,'quantity','1','setup_unit_cost','1500','monthly_unit_cost','750')),'Legacy issued',true,'issued',10);
  insert into public.test_legacy_snapshot values('quote',q-'crm_quote_items',q->'crm_quote_items');
  perform public.save_crm_quote(null,c,jsonb_build_array(jsonb_build_object('product_id',p,'quantity','1','setup_unit_cost','1500','monthly_unit_cost','750')),'Legacy draft',true,'draft',10);
  -- Catalogue/client changes must not change old quote snapshots on an explicit draft save.
  update public.crm_products set setup_cost=9999,is_active=false where id=p;
  update public.crm_clients set business_name='Renamed legacy dealer' where id=c;
  update public.crm_groups set discount_percentage=20 where id=g;
  select jsonb_object_agg(x,'completed') into qc from unnest(array['PostX Organisation','Subgroups','Members','SLA','Quick Replies','Open Hours','WABAs','Routing','Automated Replies','Integration','Conexa','AI','Social Media Synced','Post Types','Review Boosted','Tested','Training']) x;
  t:=public.save_daily_task_with_qc(null,'{"title":"Legacy completed onboarding","category":"Onboarding","status":"completed","task_date":"2026-11-03"}',auth.uid(),qc);
  insert into public.test_legacy_snapshot values('task',t,(select jsonb_agg(to_jsonb(i) order by setup_type) from public.daily_task_onboarding_qc i where task_id=(t->>'id')::uuid));
end $$;
