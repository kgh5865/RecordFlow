import { useMemo, useState } from 'react'
import { useScheduleStore } from '../../stores/scheduleStore'
import { useUiStore } from '../../stores/uiStore'
import { ScheduleFolderItem } from './ScheduleFolderItem'
import { ScheduleDialog } from './ScheduleDialog'

export function SchedulePanel() {
  const { scheduleFolders, schedules, selectedScheduleId, selectSchedule } = useScheduleStore()
  const { selectedScheduleFolderId, openDialog } = useUiStore()
  const [dialogOpen, setDialogOpen] = useState(false)

  const activeCount = schedules.filter((s) => s.enabled).length
  const rootFolders = useMemo(() => scheduleFolders.filter((f) => !f.parentId), [scheduleFolders])

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#3c3c3c] shrink-0">
        <span className="text-[11px] text-[#888]">
          {activeCount > 0 ? `${activeCount}개 활성` : '스케줄 없음'}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => openDialog({ type: 'new-schedule-folder' })}
            className="text-[11px] px-2 py-0.5 rounded bg-[#3c3c3c] hover:bg-[#505050] text-[#cccccc] transition-colors"
          >
            + 폴더
          </button>
          <button
            onClick={() => setDialogOpen(true)}
            className="text-[11px] px-2 py-0.5 rounded bg-[#0e639c] hover:bg-[#1177bb] text-white transition-colors"
          >
            + 추가
          </button>
        </div>
      </div>

      {/* 폴더 트리 + 목록 */}
      <div className="flex-1 overflow-y-auto">
        {scheduleFolders.length === 0 && schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#555] text-xs text-center px-4">
            <div className="mb-1">등록된 스케줄이 없습니다</div>
            <div className="text-[10px]">"+ 폴더"로 담당자별 폴더를 만들고</div>
            <div className="text-[10px]">"+ 추가"로 스케줄을 등록하세요</div>
          </div>
        ) : (
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
