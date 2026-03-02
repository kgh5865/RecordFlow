import type { InputHTMLAttributes } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  className?: string
}

export function Input({ className = '', ...props }: Props) {
  return (
    <input
      {...props}
      className={`w-full px-2 py-1.5 text-sm bg-[#3c3c3c] text-[#cccccc] border border-[#555] rounded outline-none focus:border-[#0e639c] caret-white ${className}`}
    />
  )
}
