// Current rate for new saves. Keep the server's crm_quote_vat_rate() in sync.
export const VAT_RATE = '15.0000'

// Decimal strings -> scaled integers. All financial arithmetic uses BigInt.
export function scaled(value, digits = 2) {
  const text = String(value ?? '').trim()
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error('Enter a valid non-negative decimal amount.')
  const [whole, fraction = ''] = text.split('.')
  if (fraction.length > digits) throw new Error(`Use at most ${digits} decimal places.`)
  return BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0'))
}
const round = (value, divisor) => (value + divisor / 2n) / divisor
export function decimal(value, digits = 2) {
  const factor = 10n ** BigInt(digits)
  return `${value / factor}.${String(value % factor).padStart(digits, '0')}`
}
export function money(value) {
  const [whole, fraction] = decimal(scaled(value)).split('.')
  return `R${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`
}
export function validatePrice(value) {
  const cents = scaled(value)
  if (cents > 99999999999n) throw new Error('Price must be at most R999,999,999.99.')
  return decimal(cents)
}
export function quoteTotals(items, discount, vatRate = VAT_RATE) {
  const vatPercentage = scaled(vatRate, 4)
  if (vatPercentage > 1000000n) throw new Error('VAT rate must be between 0 and 100%.')
  const percentage = scaled(discount, 4)
  if (percentage > 1000000n) throw new Error('Discount must be between 0 and 100%.')
  const lines = items.map(item => {
    const quantity = scaled(item.quantity, 3)
    if (quantity <= 0n || quantity > 999999999n) throw new Error('Quantity must be positive and at most 999,999.999.')
    const setup = scaled(validatePrice(item.setup_unit_cost))
    const monthly = scaled(validatePrice(item.monthly_unit_cost))
    return { ...item, setup_line_total: decimal(round(setup * quantity, 1000n)), monthly_line_total: decimal(round(monthly * quantity, 1000n)) }
  })
  const totals = {}
  for (const kind of ['setup', 'monthly']) {
    const subtotal = lines.reduce((sum, item) => sum + scaled(item[`${kind}_line_total`]), 0n)
    const reduction = round(subtotal * percentage, 1000000n)
    if (subtotal > 9999999999999n) throw new Error('Quotation exceeds the supported total.')
    totals[`${kind}_subtotal`] = decimal(subtotal)
    totals[`${kind}_discount`] = decimal(reduction)
    const afterDiscount = subtotal - reduction
    const vat = round(afterDiscount * vatPercentage, 1000000n)
    totals[`${kind}_total`] = decimal(afterDiscount)
    totals[`${kind}_vat`] = decimal(vat)
    totals[`${kind}_total_including_vat`] = decimal(afterDiscount + vat)
  }
  return { lines, vat_rate: decimal(vatPercentage, 4), ...totals }
}
export function normaliseDiscount(value) {
  const text = String(value)
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error('Invalid group discount.')
  const [whole, fraction = ''] = text.split('.')
  const units = scaled(`${whole}.${fraction.slice(0,4).padEnd(4,'0')}`,4) + (Number(fraction[4] || 0) >= 5 ? 1n : 0n)
  if (units > 1000000n) throw new Error('Discount must be between 0 and 100%.')
  return decimal(units,4)
}
export function clientSnapshot(client, groups) {
  const group = groups.find(item => item.id === client.group_id)
  return { business_name: client.business_name, business_address: client.business_address || '', contact_name: client.contact_name || '', contact_email: client.contact_email || '', group_name: group?.name || client.group_name || '', discount_percentage: normaliseDiscount(group?.discount_percentage ?? client.group_discount_percentage ?? 0) }
}
