import { useEffect } from 'react'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  variant?: 'danger' | 'primary'
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({ title, message, confirmLabel = '삭제', variant = 'danger', onConfirm, onClose }: Props) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, onConfirm])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-[340px] bg-[#252526] border border-[#3c3c3c] rounded-xl shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 상단 강조선 */}
        <div className={`h-[3px] bg-gradient-to-r ${
          variant === 'danger'
            ? 'from-red-700 via-red-500 to-red-700'
            : 'from-blue-700 via-blue-500 to-blue-700'
        }`} />

        {/* 아이콘 + 텍스트 */}
        <div className="px-6 pt-6 pb-5 text-center">
          <div className={`w-11 h-11 mx-auto mb-4 rounded-full flex items-center justify-center ${
            variant === 'danger'
              ? 'bg-red-500/10 border border-red-500/30'
              : 'bg-blue-500/10 border border-blue-500/30'
          }`}>
            {variant === 'danger' ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8.5 3.5H11.5M3 6H17M15.5 6L14.83 14.17C14.77 14.94 14.13 15.5 13.36 15.5H6.64C5.87 15.5 5.23 14.94 5.17 14.17L4.5 6" stroke="#ef4444" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 3C6.13 3 3 6.13 3 10s3.13 7 7 7 7-3.13 7-7-3.13-7-7-7zm.75 10.5h-1.5v-5h1.5v5zm0-6.5h-1.5V5.5h1.5V7z" fill="#60a5fa"/>
              </svg>
            )}
          </div>
          <div className="text-[13px] font-semibold text-[#e0e0e0] mb-2">{title}</div>
          <div className="text-[12px] text-[#888] leading-relaxed">{message}</div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-2.5 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-[12px] rounded-lg bg-[#3c3c3c] hover:bg-[#4a4a4a] text-[#cccccc] transition-colors"
          >
            취소
          </button>
          <button
            autoFocus
            onClick={onConfirm}
            className={`flex-1 py-2 text-[12px] rounded-lg text-white font-medium transition-colors ${
              variant === 'danger'
                ? 'bg-red-600 hover:bg-red-500 active:bg-red-700'
                : 'bg-[#0e639c] hover:bg-[#1177bb] active:bg-[#0a4f7a]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
