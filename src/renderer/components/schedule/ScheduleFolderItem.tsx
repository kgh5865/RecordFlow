import { memo, useState } from 'react'
import { useUiStore } from '../../stores/uiStore'
import { useScheduleStore } from '../../stores/scheduleStore'
import { ScheduleItem } from './ScheduleItem'
import { ConfirmDialog } from '../dialogs/ConfirmDialog'
import { ScheduleDialog } from './ScheduleDialog'
import type { ScheduleFolder, Schedule } from '../../../types/workflow.types'

interface Props {
  folder: ScheduleFolder
  schedules: Schedule[]
  allFolders: ScheduleFolder[]
  allSchedules: Schedule[]
  depth: number
}

export const ScheduleFolderItem = memo(function ScheduleFolderItem({ folder, schedules, allFolders, allSchedules, depth }: Props) {
  const {
    expandedScheduleFolderIds,
    selectedScheduleFolderId,
    toggleScheduleFolder,
    selectScheduleFolder,
    openDialog
  } = useUiStore()
  const { selectedScheduleId, selectSchedule, deleteScheduleFolder } = useScheduleStore()

  const isExpanded = expandedScheduleFolderIds.includes(folder.id)
  const isSelected = selectedScheduleFolderId === folder.id

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const childFolders = allFolders.filter((f) => f.parentId === folder.id)

  const handleClick = () => {
    toggleScheduleFolder(folder.id)
    selectScheduleFolder(folder.id)
    selectSchedule(null)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 cursor-pointer select-none group ${
          isSelected ? 'ring-1 ring-inset ring-[#007acc] hover:bg-[#2a2d2e]' : 'hover:bg-[#2a2d2e]'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <span className="text-[10px] text-[#888] w-3">
          {isExpanded ? '▼' : '▶'}
        </span>
        <span className="text-[#dcb67a] mr-1">📁</span>
        <span className="text-[13px] text-[#cccccc] truncate flex-1">{folder.name}</span>
        <span className="text-[10px] text-[#666] ml-auto opacity-0 group-hover:opacity-100">
          {schedules.length}
        </span>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="폴더 삭제"
          message={`"${folder.name}" 폴더와 안에 포함된 모든 스케줄이 삭제됩니다.\n이 작업은 되돌릴 수 없습니다.`}
          confirmLabel="삭제"
          onConfirm={() => { deleteScheduleFolder(folder.id); setPendingDelete(false) }}
          onClose={() => setPendingDelete(false)}
        />
      )}

      {isExpanded && (
        <div>
          {childFolders.map((child) => (
            <ScheduleFolderItem
              key={child.id}
              folder={child}
              schedules={allSchedules.filter((s) => s.folderId === child.id)}
              allFolders={allFolders}
              allSchedules={allSchedules}
              depth={depth + 1}
            />
          ))}
          {schedules.map((schedule) => (
            <div key={schedule.id} style={{ paddingLeft: `${(depth + 1) * 12}px` }}>
              <ScheduleItem
                schedule={schedule}
                isSelected={schedule.id === selectedScheduleId}
                onSelect={() => selectSchedule(schedule.id)}
              />
            </div>
          ))}
          {childFolders.length === 0 && schedules.length === 0 && (
            <div
              className="py-1 text-[11px] text-[#555] italic"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            >
              Empty
            </div>
          )}
        </div>
      )}

      {addDialogOpen && (
        <ScheduleDialog
          defaultFolderId={folder.id}
          onClose={() => setAddDialogOpen(false)}
        />
      )}

      {menu && (
        <ContextMenuInline
          x={menu.x}
          y={menu.y}
          items={[
            {
              label: '+ New Schedule',
              onClick: () => {
                setMenu(null)
                selectScheduleFolder(folder.id)
                setAddDialogOpen(true)
              }
            },
            {
              label: 'Rename',
              onClick: () => {
                setMenu(null)
                openDialog({ type: 'rename-schedule-folder', targetFolderId: folder.id, currentName: folder.name })
              }
            },
            {
              label: 'Delete Folder',
              danger: true,
              onClick: () => { setMenu(null); setPendingDelete(true) }
            }
          ]}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
})

/** 간단한 인라인 컨텍스트 메뉴 (워크플로우 ContextMenu와 동일 패턴) */
function ContextMenuInline({ x, y, items, onClose }: {
  x: number; y: number
  items: { label: string; danger?: boolean; onClick: () => void }[]
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }}>
      <div
        className="absolute bg-[#252526] border border-[#3c3c3c] rounded shadow-lg py-1 min-w-[140px]"
        style={{ left: x, top: y }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            onClick={(e) => { e.stopPropagation(); item.onClick(); onClose() }}
            className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#094771] transition-colors ${
              item.danger ? 'text-red-400' : 'text-[#cccccc]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
