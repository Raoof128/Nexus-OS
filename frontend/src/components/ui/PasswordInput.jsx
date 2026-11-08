import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function PasswordInput({
  id,
  value,
  onChange,
  className = '',
  wrapperClassName = '',
  placeholder,
  autoComplete,
  ...props
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className={`relative ${wrapperClassName}`.trim()}>
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        className={`${className} pr-7`.trim()}
        placeholder={placeholder}
        autoComplete={autoComplete}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="w7-toolbtn absolute right-[2px] top-1/2 h-[19px] w-[21px] min-h-0 -translate-y-1/2 p-0 text-[#5c5c5c]"
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
      </button>
    </div>
  )
}
