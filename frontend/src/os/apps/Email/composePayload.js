export function splitRecipients(value) {
  return value
    .split(/[;,]/)
    .map((address) => address.trim())
    .filter(Boolean)
}

export function plainTextToHtml(value) {
  const escaped = value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
  return `<p>${escaped.replaceAll('\n', '<br>')}</p>`
}

export function buildComposePayload({ accountId, to, cc, subject, body }) {
  return {
    account_id: accountId,
    to: splitRecipients(to),
    cc: splitRecipients(cc),
    bcc: [],
    subject,
    body_html: plainTextToHtml(body),
  }
}

export function buildAiDraftPayload(emailId, isForward) {
  return {
    email_id: emailId,
    instruction: isForward
      ? 'Draft a concise professional forwarding note.'
      : 'Draft a concise professional reply.',
  }
}
