import { useEffect } from 'react'
import { useUiStore } from '../../stores/uiStore'
import { useScheduleStore } from '../../stores/scheduleStore'

export function Toolbar() {
  const { settingsPanelOpen, setSettingsPanelOpen, openDialog, showToast, toast, clearToast } = useUiStore()
  const schedules = useScheduleStore((s) => s.schedules)

  const activeScheduleCount = schedules.filter((s) => s.enabled).length

  const handleImport = async () => {
    try {
      const result = await window.electronAPI.importWorkflow()
      if (result.cancelled) return
      if (result.error) {
        showToast(result.error, 'error')
        return
      }
      if (result.file) {
        openDialog({ type: 'import-workflow', file: result.file })
      }
    } catch {
      showToast('가져오기에 실패했습니다.', 'error')
    }
  }

  // Toast 자동 닫기는 uiStore에서 처리하지만 unmount 시 정리
  useEffect(() => () => clearToast(), [])

  return (
    <div className="relative flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 h-11 bg-[#2d2d2d] border-b border-[#3c3c3c]">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-[#cccccc] text-sm tracking-wide">RecordFlow</span>
          {activeScheduleCount > 0 && (
            <span className="text-[10px] text-[#888] bg-[#1e1e1e] px-1.5 py-0.5 rounded">
              ⏰ {activeScheduleCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleImport}
            className="px-3 py-1 text-xs rounded bg-[#3c3c3c] hover:bg-[#4a4a4a] text-[#cccccc] transition-colors"
            title="워크플로우 파일 가져오기 (.rfworkflow)"
          >
            ↑ Import
          </button>

          <button
            onClick={() => setSettingsPanelOpen(!settingsPanelOpen)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              settingsPanelOpen
                ? 'bg-[#3c3c3c] text-[#cccccc]'
                : 'text-[#888] hover:text-[#ccc] hover:bg-[#3c3c3c]'
            }`}
            title="설정"
          >
            ⚙ Setup
          </button>
        </div>
      </div>

      {/* Toast 알림 */}
      {toast && (
        <div
          className={`absolute top-full left-0 right-0 z-50 px-4 py-2 text-xs flex items-center justify-between ${
            toast.variant === 'success'
              ? 'bg-[#1a3a1a] text-[#89d185] border-b border-[#2d5a2d]'
              : 'bg-[#3a1a1a] text-[#f48771] border-b border-[#5a2d2d]'
          }`}
        >
          <span>{toast.message}</span>
          <button onClick={clearToast} className="ml-4 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
    </div>
  )
}
