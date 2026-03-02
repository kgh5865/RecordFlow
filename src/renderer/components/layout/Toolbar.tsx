import { useWorkflowStore } from '../../stores/workflowStore'
import { useUiStore } from '../../stores/uiStore'
import { useScheduleStore } from '../../stores/scheduleStore'

export function Toolbar() {
  const workflows = useWorkflowStore((s) => s.workflows)
  const { selectedWorkflowId, settingsPanelOpen, setSettingsPanelOpen } = useUiStore()
  const schedules = useScheduleStore((s) => s.schedules)

  const selectedWorkflow = workflows.find((w) => w.id === selectedWorkflowId)
  const activeScheduleCount = schedules.filter((s) => s.enabled).length

  const handleRecord = () => {
    if (!selectedWorkflow) return
    useUiStore.getState().openDialog({
      type: 'new-workflow',
      targetFolderId: selectedWorkflow.folderId,
      currentName: selectedWorkflow.name
    })
  }

  return (
    <div className="flex items-center justify-between px-4 h-11 bg-[#2d2d2d] border-b border-[#3c3c3c] shrink-0">
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
          onClick={handleRecord}
          disabled={!selectedWorkflowId}
          className="px-3 py-1 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ● Record
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
  )
}
