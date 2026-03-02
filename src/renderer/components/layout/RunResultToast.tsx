import { useEffect, useRef } from 'react'
import { useUiStore } from '../../stores/uiStore'

export function RunResultToast() {
  const lastRunResult = useUiStore((s) => s.lastRunResult)
  const setRunResult = useUiStore((s) => s.setRunResult)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!lastRunResult) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setRunResult(null), 5000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [lastRunResult, setRunResult])

  if (!lastRunResult) return null

  const { success, completedSteps, error } = lastRunResult

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-start gap-3 w-[300px] px-4 py-3 rounded-xl shadow-2xl border animate-slide-in"
      style={{
        background: success ? '#1a2e1a' : '#2e1a1a',
        borderColor: success ? '#2ea04340' : '#f8514940',
      }}
    >
      {/* 아이콘 */}
      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 ${
        success ? 'bg-[#2ea043]/20 text-[#4caf50]' : 'bg-red-500/20 text-red-400'
      }`}>
        {success
          ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7L5.5 10.5L12 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          : <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 4L10 10M10 4L4 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        }
      </div>

      {/* 텍스트 */}
      <div className="flex-1 min-w-0">
        <div className={`text-[12px] font-semibold ${success ? 'text-[#4caf50]' : 'text-red-400'}`}>
          {success ? '실행 완료' : '실행 실패'}
        </div>
        <div className="text-[11px] text-[#888] mt-0.5">
          {success
            ? `${completedSteps}개 step 모두 성공`
            : `Step ${completedSteps + 1}에서 중단`
          }
        </div>
        {!success && error && (
          <div className="text-[10px] text-red-400/80 mt-1 break-all line-clamp-2" title={error}>
            {error}
          </div>
        )}
      </div>

      {/* 닫기 버튼 */}
      <button
        onClick={() => setRunResult(null)}
        className="shrink-0 text-[#555] hover:text-[#aaa] transition-colors mt-0.5 text-[16px] leading-none"
      >
        ×
      </button>
    </div>
  )
}
