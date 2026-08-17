import { describe, expect, it } from 'vitest'
import {
  buildAiDraftPayload,
  buildComposePayload,
  plainTextToHtml,
  splitRecipients,
} from './composePayload'

describe('ComposeModal backend contract', () => {
  it('normalizes recipient arrays and safely converts plain text to HTML', () => {
    expect(splitRecipients('one@example.com, two@example.com; three@example.com')).toEqual([
      'one@example.com',
      'two@example.com',
      'three@example.com',
    ])
    expect(plainTextToHtml('<script>&\nnext')).toBe('<p>&lt;script&gt;&amp;<br>next</p>')
    expect(
      buildComposePayload({
        accountId: 'account-1',
        to: 'one@example.com, two@example.com',
        cc: 'copy@example.com',
        subject: 'Subject',
        body: 'Hello',
      }),
    ).toEqual({
      account_id: 'account-1',
      to: ['one@example.com', 'two@example.com'],
      cc: ['copy@example.com'],
      bcc: [],
      subject: 'Subject',
      body_html: '<p>Hello</p>',
    })
  })

  it('builds the AI draft endpoint fields for replies and forwards', () => {
    expect(buildAiDraftPayload('email-1', false)).toEqual({
      email_id: 'email-1',
      instruction: 'Draft a concise professional reply.',
    })
    expect(buildAiDraftPayload('email-2', true)).toEqual({
      email_id: 'email-2',
      instruction: 'Draft a concise professional forwarding note.',
    })
  })
})
