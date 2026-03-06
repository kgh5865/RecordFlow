import { useMemo, useState } from 'react'
import { useScheduleStore } from '../../stores/scheduleStore'
import { useUiStore } from '../../stores/uiStore'
import { ScheduleFolderItem } from './ScheduleFolderItem'
import { ScheduleDialog } from './ScheduleDialog'

export function SchedulePanel() {
  const { scheduleFolders, schedules, selectedScheduleId, selectSchedule } = useScheduleStore()
  const { selectedScheduleFolderId, selectScheduleFolder, openDialog } = useUiStore()
  const [dialogOpen, setDialogOpen] = useState(false)

  const activeCount = schedules.filter((s) => s.enabled).length
  const rootFolders = useMemo(() => scheduleFolders.filter((f) => !f.parentId), [scheduleFolders])
  const nothingSelected = selectedScheduleFolderId === null && selectedScheduleId === null

  const handleEmptyClick = () => {
    selectScheduleFolder(null)
    selectSchedule(null)
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#3c3c3c] shrink-0">
        <span className="text-[11px] text-[#888]">
          {activeCount > 0 ? `${activeCount} Active` : 'No Schedules'}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => openDialog({ type: 'new-schedule-folder' })}
            className="text-[11px] px-2 py-0.5 rounded bg-[#3c3c3c] hover:bg-[#505050] text-[#cccccc] transition-colors"
          >
            + Folder
          </button>
          <button
            onClick={() => setDialogOpen(true)}
            className="text-[11px] px-2 py-0.5 rounded bg-[#0e639c] hover:bg-[#1177bb] text-white transition-colors"
          >
            + Add
          </button>
        </div>
      </div>

      {/* 폴더 트리 + 목록 */}
      <div className="flex-1 overflow-y-auto">
        {scheduleFolders.length === 0 && schedules.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-full text-[#555] text-xs text-center px-4"
            onClick={handleEmptyClick}
          >
            <div className="mb-1">No schedules registered</div>
            <div className="text-[10px]">Create folders with "+ Folder"</div>
            <div className="text-[10px]">and add schedules with "+ Add"</div>
          </div>
        ) : (
          <div className="flex flex-col min-h-full">
            <div className="py-1">
              {rootFolders.map((folder) => (
                <ScheduleFolderItem
                  key={folder.id}
                  folder={folder}
                  schedules={schedules.filter((s) => s.folderId === folder.id)}
                  allFolders={scheduleFolders}
                  allSchedules={schedules}
                  depth={0}
                />
              ))}
            </div>
            {/* 목록 아래 빈 공간 — 클릭 시 선택 해제 + 루트 선택 표시 */}
            <div
              className={`flex-1 min-h-[40px] cursor-default transition-colors ${
                nothingSelected ? 'ring-1 ring-inset ring-[#007acc]' : 'hover:bg-[#2a2d2e]/60'
              }`}
              onClick={handleEmptyClick}
            />
          </div>
        )}
      </div>

      {dialogOpen && (
        <ScheduleDialog
          defaultFolderId={selectedScheduleFolderId ?? undefined}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  )
}
