// Shared class strings for the Windows 7 logon screen (sign in, register, reset password).
// Fields keep 7.css's sunken input look: layout utilities only, no background/border/text colour
// (placeholder text is the one colour exception).
// Height is left to 7.css (23px, the Win7 text box metric), so no h-* class here.

// The placeholder colour is set here (7.css leaves it too light for 4.5:1 on white).
export const fieldClass = 'w-full text-[12px] placeholder:text-[#6d6d6d]'

export const labelClass = 'mb-1 block text-[12px] text-white [text-shadow:0_1px_3px_#000a]'

export const linkClass =
  'cursor-pointer text-[12px] text-white underline-offset-2 [text-shadow:0_1px_3px_#000a] hover:underline'

export const headingClass = 'mb-3 text-[16px] font-normal text-white [text-shadow:0_1px_3px_#000a]'

export const bodyTextClass = 'text-[12px] text-white [text-shadow:0_1px_3px_#000a]'

export const brandClass = 'text-[20px] font-normal text-white [text-shadow:0_1px_3px_#000a]'

export const panelClass = 'nx-glass w-[300px] max-w-full rounded-[6px] p-5'

// Dark translucent scrim behind logon and lock text that sits on the bare wallpaper.
// Windows 7 keeps its logon text legible on bright wallpapers; the scrim is that
// fallback. At 56% black, white 12px text clears 4.5:1 even on a pure-white
// wallpaper (the text-shadow is decorative and not counted).
export const scrimClass =
  'rounded-[6px] bg-black/[0.56] px-3 py-2 shadow-[0_0_18px_6px_rgb(0_0_0/0.3)]'
