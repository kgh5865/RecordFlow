import { useState } from 'react'
import { useScheduleStore } from '../../stores/scheduleStore'
import { ScheduleItem } from './ScheduleItem'
import { ScheduleDialog } from './ScheduleDialog'

export function SchedulePanel() {
  const { schedules, selectedScheduleId, selectSchedule } = useScheduleStore()
  const [dialogOpen, setDialogOpen] = useState(false)

  const activeCount = schedules.filter((s) => s.enabled).length

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#3c3c3c] shrink-0">
        <span className="text-[11px] text-[#888]">
          {activeCount > 0 ? `${activeCount}개 활성` : '스케줄 없음'}
        </span>
        <button
          onClick={() => setDialogOpen(true)}
          className="text-[11px] px-2 py-0.5 rounded bg-[#0e639c] hover:bg-[#1177bb] text-white transition-colors"
        >
          + 추가
        </button>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto">
        {schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#555] text-xs text-center px-4">
            <div className="mb-1">등록된 스케줄이 없습니다</div>
            <div className="text-[10px]">+ 추가 버튼으로 자동 실행 일정을 등록하세요</div>
          </div>
        ) : (
          schedules.map((schedule) => (
            <ScheduleItem
              key={schedule.id}
              schedule={schedule}
              isSelected={schedule.id === selectedScheduleId}
              onSelect={() => selectSchedule(schedule.id)}
            />
          ))
        )}
      </div>

      {dialogOpen && <ScheduleDialog onClose={() => setDialogOpen(false)} />}
    </div>
  )
}
