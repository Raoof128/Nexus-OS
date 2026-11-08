import DOMPurify from 'dompurify'

export function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Renders the note's Markdown for the View → Markdown preview mode.
 * The input is escaped first, the regex chain only adds a small set of tags,
 * and DOMPurify then strips anything else before the HTML is shown.
 */
export function renderMarkdown(text) {
  if (!text) return ''
  const escaped = escapeHtml(text)
  // Build the HTML string via regex substitutions on the escaped input,
  // then pass the result through DOMPurify before rendering.  DOMPurify acts
  // as a second-pass safety net: any future regex change that accidentally
  // reintroduces an executable element will be stripped before it reaches
  // dangerouslySetInnerHTML.
  const raw = escaped
    // Code blocks (must come before inline code)
    .replace(
      /```([\s\S]*?)```/g,
      '<pre class="my-2 border border-border bg-muted p-2 font-mono text-[12px] text-foreground overflow-x-auto"><code>$1</code></pre>',
    )
    // Inline code
    .replace(
      /`([^`]+)`/g,
      '<code class="bg-muted px-1 font-mono text-[12px] text-foreground">$1</code>',
    )
    // Headers
    .replace(
      /^### (.+)$/gm,
      '<h3 class="mt-3 mb-1 text-[13px] font-semibold text-w7-title">$1</h3>',
    )
    .replace(/^## (.+)$/gm, '<h2 class="mt-4 mb-1 text-[15px] font-semibold text-w7-title">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="mt-4 mb-2 text-[17px] font-semibold text-w7-title">$1</h1>')
    // Bold + Italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-foreground">$1</li>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="my-3 border-border" />')
    // Line breaks
    .replace(/\n/g, '<br />')
  // Sanitize with DOMPurify — strips any executable elements that may have
  // slipped through the regex chain (e.g. event handlers, script tags).
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'strong', 'em', 'code', 'pre', 'li', 'hr', 'br'],
    ALLOWED_ATTR: ['class'],
  })
}
