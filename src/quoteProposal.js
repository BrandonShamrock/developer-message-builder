export const DEFAULT_SERVICE_OVERVIEW = 'PostX is a customer communication and social media platform built for dealerships. It brings your customer conversations, social content and team together in one place, so enquiries are handled quickly and consistently, and your brand stays on message across every channel.'

// Date-only expiry values must not shift to the previous day through UTC parsing.
export function quoteDate(value) {
  if (!value) return ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+02:00`) : new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg' })
}
