export function detectVariables(templateBody = '') {
  const matches = templateBody.match(/{{\s*([a-zA-Z0-9_]+)\s*}}/g) || []
  return [...new Set(matches.map((match) => match.replace(/[{}]/g, '').trim()).filter(Boolean))]
}

export function buildMessage(templateBody = '', values = {}) {
  return templateBody.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => values[key] || '')
}

export function getUserId(user) {
  return user?.id || null
}
