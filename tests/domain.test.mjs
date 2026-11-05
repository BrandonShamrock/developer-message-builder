import { test } from 'node:test'
import assert from 'node:assert/strict'
import { VAT_RATE, quoteTotals, money, clientSnapshot, validatePrice, normaliseDiscount } from '../src/money.js'
import { CATEGORIES, SETUP_TYPES, qcProgress, needsQc } from '../src/qc.js'
const line = (setup,monthly,quantity='1') => ({setup_unit_cost:setup,monthly_unit_cost:monthly,quantity})
test('all eight categories and all 18 setup types are preserved', () => {
  assert.equal(CATEGORIES.length,8); assert.equal(new Set(SETUP_TYPES).size,18)
  assert.equal(SETUP_TYPES.filter(x=>x==='Routing').length,1)
  assert.equal(SETUP_TYPES[8],'LiveChat')
  assert.equal(SETUP_TYPES[0],'PostX Organisation'); assert.equal(SETUP_TYPES.at(-1),'Training')
})
test('QC accepts either outcome, partial saves, legacy completed edits and reopens', () => {
  assert.equal(qcProgress().outstanding,18)
  const qc=Object.fromEntries(SETUP_TYPES.map((key,i)=>[key,i%2?'not_acquired':'completed']))
  assert.deepEqual(qcProgress(qc),{completed:9,notAcquired:9,reviewed:18,outstanding:0})
  assert.equal(needsQc('Onboarding','completed',qc),false)
  delete qc.Training
  assert.equal(needsQc('Onboarding','completed',qc),true)
  assert.equal(needsQc('Onboarding','wip',qc),false)
  assert.equal(needsQc('Support','completed',qc),false)
  assert.equal(needsQc('Onboarding','completed',{}, {category:'Onboarding',status:'completed'}),false)
  assert.equal(needsQc('Onboarding','completed',{}, {category:'Onboarding',status:'wip'}),true)
})
test('ZAR formatting and zero prices',()=>{
  assert.equal(money('1500'),'R1,500.00');assert.equal(money('0'),'R0.00');assert.equal(validatePrice('0.00'),'0.00')
})
test('separate setup and monthly calculations apply the group discount',()=>{
  const result=quoteTotals([line('1500','750','2'),line('0','100','3')],'10')
  assert.equal(result.setup_subtotal,'3000.00');assert.equal(result.setup_discount,'300.00');assert.equal(result.setup_total,'2700.00')
  assert.equal(result.monthly_subtotal,'1800.00');assert.equal(result.monthly_discount,'180.00');assert.equal(result.monthly_total,'1620.00')
})
test('decimal safeguards handle half cents and fractional quantities without floating point errors',()=>{
  const result=quoteTotals([line('0.10','0.05','1.5'),line('0.20','0')],'10')
  assert.equal(result.setup_subtotal,'0.35');assert.equal(result.setup_discount,'0.04');assert.equal(result.setup_total,'0.31')
  assert.equal(result.monthly_subtotal,'0.08');assert.equal(result.monthly_discount,'0.01')
})
test('zero and 100 percent discounts',()=>{
  assert.equal(quoteTotals([line('12.34','56.78')],'0').setup_total,'12.34')
  const result=quoteTotals([line('12.34','56.78')],'100')
  assert.equal(result.setup_total,'0.00');assert.equal(result.monthly_total,'0.00')
})
test('reject negative, invalid, overly precise and excessive monetary inputs',()=>{
  for(const quantity of ['0','-1','NaN','1.0001','1000000']) assert.throws(()=>quoteTotals([line('1','1',quantity)],'0'))
  for(const price of ['-1','Infinity','','1.001','1000000000']) assert.throws(()=>validatePrice(price))
  for(const discount of ['101','-1','0.00001']) assert.throws(()=>quoteTotals([line('1','1')],discount))
  assert.throws(()=>quoteTotals([line('999999999.99','0','999999')],'0'))
})
test('group relationship is authoritative, with legacy client fallback and immutable snapshots',()=>{
  const client={group_id:'g',business_name:'Dealer',group_name:'Old',group_discount_percentage:'5'}
  const groups=[{id:'g',name:'New',discount_percentage:'12.34567'}]
  const snapshot=clientSnapshot(client,groups)
  assert.equal(snapshot.group_name,'New');assert.equal(snapshot.discount_percentage,'12.3457')
  groups[0].discount_percentage='20';assert.equal(snapshot.discount_percentage,'12.3457')
  assert.equal(clientSnapshot({...client,group_id:null},groups).discount_percentage,'5.0000')
  assert.equal(normaliseDiscount('0'),'0.0000')
})

test('VAT is rounded after discount and keeps exclusive totals unchanged',()=>{
  const result=quoteTotals([line('1500','750')],'10')
  assert.equal(result.vat_rate,VAT_RATE)
  assert.equal(result.setup_total,'1350.00'); assert.equal(result.setup_vat,'202.50'); assert.equal(result.setup_total_including_vat,'1552.50')
  assert.equal(result.monthly_total,'675.00'); assert.equal(result.monthly_vat,'101.25'); assert.equal(result.monthly_total_including_vat,'776.25')
  const fractional=quoteTotals([line('0.10','0.05','1.5')],'10')
  assert.equal(fractional.setup_total,'0.13'); assert.equal(fractional.setup_vat,'0.02'); assert.equal(fractional.setup_total_including_vat,'0.15')
  assert.equal(fractional.monthly_total,'0.07'); assert.equal(fractional.monthly_vat,'0.01'); assert.equal(fractional.monthly_total_including_vat,'0.08')
  // Discount-first rounding differs from applying VAT to the original subtotal.
  const cents=quoteTotals([line('0.04','0.04')],'50')
  assert.equal(cents.setup_vat,'0.00'); assert.equal(cents.setup_total_including_vat,'0.02')
})
test('VAT handles full/zero discounts, empty sections, and future rates',()=>{
  const zero=quoteTotals([line('1500','750')],'0')
  assert.equal(zero.setup_total_including_vat,'1725.00'); assert.equal(zero.monthly_total_including_vat,'862.50')
  for(const result of [quoteTotals([line('1500','750')],'100'),quoteTotals([line('0','0')],'0'),quoteTotals([],'0')]) {
    for(const kind of ['setup','monthly']) {
      assert.equal(result[`${kind}_vat`],'0.00'); assert.equal(result[`${kind}_total_including_vat`],'0.00')
    }
  }
  const old=quoteTotals([line('100','0')],'0','14')
  assert.equal(old.vat_rate,'14.0000'); assert.equal(old.setup_total_including_vat,'114.00')
  assert.equal(quoteTotals([line('100','0')],'0').setup_total_including_vat,'115.00')
  assert.equal(old.setup_total_including_vat,'114.00')
  for(const rate of ['-1','101','NaN','15.00001']) assert.throws(()=>quoteTotals([line('1','1')],'0',rate))
})
test('legacy seventeen outcomes require LiveChat only after reopening',()=>{
  const qc=Object.fromEntries(SETUP_TYPES.filter(x=>x!=='LiveChat').map(x=>[x,'completed']))
  assert.deepEqual(qcProgress(qc),{completed:17,notAcquired:0,reviewed:17,outstanding:1})
  assert.equal(needsQc('Onboarding','completed',qc,{category:'Onboarding',status:'completed'}),false)
  assert.equal(needsQc('Onboarding','completed',qc,{category:'Onboarding',status:'wip'}),true)
  for(const outcome of ['completed','not_acquired']) assert.equal(needsQc('Onboarding','completed',{...qc,LiveChat:outcome}),false)
})
