import { useEffect, useRef } from 'react'

export interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
}

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = () => onClose()
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{ top: y, left: x }}
      className="fixed z-50 min-w-[160px] bg-[#2d2d2d] border border-[#3c3c3c] rounded shadow-xl py-1"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.onClick(); onClose() }}
          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#3c3c3c] transition-colors ${
            item.danger ? 'text-red-400' : 'text-[#cccccc]'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
