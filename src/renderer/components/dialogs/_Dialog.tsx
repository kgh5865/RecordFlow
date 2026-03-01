import type { ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
  onClose: () => void
  onConfirm?: () => void
  confirmLabel?: string
}

export function Dialog({ title, children, onClose, onConfirm, confirmLabel = 'OK' }: Props) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-[340px] bg-[#2d2d2d] border border-[#3c3c3c] rounded-lg shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3c3c3c]">
          <span className="text-sm font-semibold text-[#cccccc]">{title}</span>
          <button onClick={onClose} className="text-[#888] hover:text-[#ccc] text-lg leading-none">
            ×
          </button>
        </div>

        {/* 본문 */}
        <div className="px-4 py-3">{children}</div>

        {/* 푸터 */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#3c3c3c]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded text-[#cccccc] bg-[#3c3c3c] hover:bg-[#505050] transition-colors"
          >
            Cancel
          </button>
          {onConfirm && (
            <button
              onClick={onConfirm}
              className="px-3 py-1.5 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white transition-colors"
            >
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
