// In-memory backend for browser UI tests only. Never imported by the app.
import { quoteTotals } from '/src/money.js'
const manager = { id:'11111111-1111-1111-1111-111111111111', email:'manager@example.test' }
const agent = { id:'22222222-2222-2222-2222-222222222222', email:'agent@example.test' }
const date = new Date().toLocaleDateString('en-CA')
const db = window.__db = JSON.parse(localStorage.getItem('amper-test-db') || 'null') || {
  profiles:[{...manager,full_name:'Manager',role:'manager'},{...agent,full_name:'Agent',role:'agent'}],
  daily_tasks:[{id:'legacy',owner_id:manager.id,title:'Legacy carried task',status:'wip',category:'Other',task_date:'2026-01-01',timer_started_at:'2026-01-01T00:00:00Z',created_at:'2026-01-01T00:00:00Z'}],
  daily_task_comments:[], daily_task_onboarding_qc:[],postx_daily_notifications:[],user_preferences:[],
  crm_groups:[{id:'group',name:'Team Group',discount_percentage:10}],
  crm_clients:[{id:'client',group_id:'group',group_name:'Old name',group_discount_percentage:5,business_name:'Alpha Dealer',business_address:'123 Main Road',contact_name:'Jane Doe',contact_email:'jane@example.test'}],
  crm_products:[{id:'product',name:'PostX AI',description:'AI service',setup_cost:'1500.00',monthly_cost:'750.00',is_active:true}],crm_quotes:[],templates:[],clients:[],generated_messages:[],
}
let user=manager, listener=null
const persist=()=>localStorage.setItem('amper-test-db',JSON.stringify(db))
function query(table) {
  const filters=[];let operation='select',payload,one=false
  const builder={
    select(){return this},order(){return this},or(){return this},lte(){return this},
    eq(key,value){filters.push(row=>row[key]===value);return this},is(key,value){filters.push(row=>row[key]==value);return this},in(key,values){filters.push(row=>values.includes(row[key]));return this},
    maybeSingle(){one=true;return this},single(){one=true;return this},
    insert(value){operation='insert';payload=value;return this},upsert(value){operation='upsert';payload=value;return this},update(value){operation='update';payload=value;return this},delete(){operation='delete';return this},
    then(resolve,reject){return Promise.resolve().then(()=>{
      if(window.__fail===table) return {data:null,error:{message:'Simulated database failure'}}
      let rows=db[table]||[];let matched=rows.filter(row=>filters.every(f=>f(row)))
      if(operation==='insert'||operation==='upsert') {
        const key=table==='user_preferences'?'user_id':'id'
        const found=operation==='upsert'?rows.find(row=>row[key]===payload[key]):null
        if(found){Object.assign(found,payload);matched=[found]}
        else {const row={id:crypto.randomUUID(),created_at:new Date().toISOString(),...(table==='crm_products'?{is_active:true}:{}),...payload};rows.push(row);db[table]=rows;matched=[row]}
      }
      if(operation==='update') matched.forEach(row=>Object.assign(row,payload))
      if(operation==='delete') db[table]=rows.filter(row=>!matched.includes(row))
      persist();return {data:one?matched[0]||null:matched,error:null}
    }).then(resolve,reject)}
  };return builder
}
export const isSupabaseConfigured=true
export const supabase={from:query,auth:{
  getSession:async()=>({data:{session:localStorage.getItem('amper-test-signed-out')?null:{user}}}),
  onAuthStateChange(callback){listener=callback;return {data:{subscription:{unsubscribe(){}}}}},
  async signOut(){localStorage.setItem('amper-test-signed-out','1');listener?.('SIGNED_OUT',null)},
  async signInWithPassword(){localStorage.removeItem('amper-test-signed-out');listener?.('SIGNED_IN',{user});return {data:{session:{user}},error:null}},
},channel(){return {on(){return this},subscribe(){return this}}},removeChannel(){},
  async rpc(name,p){
    if(window.__fail===name)return {data:null,error:{message:'Simulated RPC failure'}}
    if(name==='save_daily_task_with_qc'){
      const existing=db.daily_tasks.find(t=>t.id===p.p_task_id)
      const task={id:existing?.id||crypto.randomUUID(),owner_id:existing?.owner_id||p.p_owner_id,created_at:new Date().toISOString(),...existing,...p.p_fields}
      db.daily_tasks=db.daily_tasks.filter(t=>t.id!==task.id).concat(task)
      for(const [setup_type,outcome] of Object.entries(p.p_qc)){
        db.daily_task_onboarding_qc=db.daily_task_onboarding_qc.filter(q=>!(q.task_id===task.id&&q.setup_type===setup_type))
        db.daily_task_onboarding_qc.push({task_id:task.id,setup_type,outcome})
      }persist();return {data:task,error:null}
    }
    if(name==='save_crm_quote_proposal'){
      const previous=db.crm_quotes.find(q=>q.id===p.p_quote_id)
      const c=db.crm_clients.find(c=>c.id===p.p_client_id)
      const items=p.p_items.map((i,index)=>{
        const old=previous?.crm_quote_items.find(x=>x.id===i.id)
        const product=db.crm_products.find(x=>x.id===i.product_id)
        return {...old,id:crypto.randomUUID(),product_id:i.product_id,product_name:old?.product_name||product.name,product_description:old?.product_description||product.description,setup_unit_cost:old?.setup_unit_cost||product.setup_cost,monthly_unit_cost:old?.monthly_unit_cost||product.monthly_cost,quantity:i.quantity,position:index}
      })
      const totals=quoteTotals(items,p.p_expected_discount)
      const quote={id:previous?.id||crypto.randomUUID(),quote_number:previous?.quote_number||'AB-2026-000001',created_at:previous?.created_at||new Date().toISOString(),crm_client_id:p.p_client_id,client_snapshot:previous&&!p.p_refresh_client?previous.client_snapshot:{...c,group_name:'Team Group'},discount_percentage:p.p_expected_discount,...totals,crm_quote_items:totals.lines,notes:p.p_notes,status:p.p_status,service_overview:p.p_service_overview?.trim()||null,valid_until:p.p_valid_until||null}
      db.crm_quotes=db.crm_quotes.filter(q=>q.id!==quote.id).concat(quote);persist();return {data:quote,error:null}
    }
    return {data:null,error:null}
  }
}
