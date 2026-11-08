// Shared class strings for the Windows 7 logon screen (sign in, register, reset password).
// Fields keep 7.css's sunken input look: layout utilities only, no background/border/text colour.
// Height is left to 7.css (23px, the Win7 text box metric), so no h-* class here.

export const fieldClass = 'w-full text-[12px]'

export const labelClass = 'mb-1 block text-[12px] text-white [text-shadow:0_1px_3px_#000a]'

export const linkClass =
  'cursor-pointer text-[12px] text-white underline-offset-2 [text-shadow:0_1px_3px_#000a] hover:underline'

export const headingClass = 'mb-3 text-[16px] font-normal text-white [text-shadow:0_1px_3px_#000a]'

export const bodyTextClass = 'text-[12px] text-white [text-shadow:0_1px_3px_#000a]'

export const brandClass = 'text-[20px] font-normal text-white [text-shadow:0_1px_3px_#000a]'

export const panelClass = 'nx-glass w-[300px] max-w-full rounded-[6px] p-5'
