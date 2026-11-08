import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// Password field with a show/hide toggle. The toggle is kept on purpose (audit
// finding #49): it helps people check what they typed, and it is a small Win7
// tool button. It is type="button", so it never submits the form, and it is
// reachable by Tab. `ref` is a plain prop (React 19), so callers can focus the input.
export default function PasswordInput({
  id,
  ref,
  value,
  onChange,
  className = '',
  wrapperClassName = '',
  placeholder,
  autoComplete,
  ...props
}) {
  const [visible, setVisible] = useState(false)
  const label = visible ? 'Hide password' : 'Show password'
  return (
    <div className={`relative ${wrapperClassName}`.trim()}>
      <input
        {...props}
        ref={ref}
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        className={`${className} pr-7`.trim()}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="w7-toolbtn absolute right-[2px] top-1/2 h-[19px] w-[21px] min-h-0 -translate-y-1/2 p-0 text-[#5c5c5c] focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-dotted focus-visible:outline-black"
        aria-label={label}
        title={label}
      >
        {visible ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
      </button>
    </div>
  )
}
