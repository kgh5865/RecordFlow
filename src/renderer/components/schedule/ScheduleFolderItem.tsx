import { memo, useState } from 'react'
import { useUiStore } from '../../stores/uiStore'
import { useScheduleStore } from '../../stores/scheduleStore'
import { ScheduleItem } from './ScheduleItem'
import { ConfirmDialog } from '../dialogs/ConfirmDialog'
import { FolderVariablesDialog } from '../dialogs/FolderVariablesDialog'
import { FolderPasswordDialog } from '../dialogs/FolderPasswordDialog'
import { ScheduleDialog } from './ScheduleDialog'
import type { ScheduleFolder, Schedule } from '../../../types/workflow.types'

// 세션 내 인증된 폴더 ID 캐시 (앱 종료 시 초기화)
const authenticatedFolders = new Set<string>()

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
  const { selectedScheduleId, selectSchedule, deleteScheduleFolder, loadScheduleFolders } = useScheduleStore()

  const isExpanded = expandedScheduleFolderIds.includes(folder.id)
  const isSelected = selectedScheduleFolderId === folder.id

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [varsDialogOpen, setVarsDialogOpen] = useState(false)
  const [passwordDialogOpen, setPasswordDialogOpen] = useState<'verify' | 'set' | null>(null)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)

  const childFolders = allFolders.filter((f) => f.parentId === folder.id)

  const hasPassword = !!(folder.passwordHash && folder.passwordSalt)

  const requirePassword = (action: () => void) => {
    if (!hasPassword || authenticatedFolders.has(folder.id)) {
      action()
      return
    }
    setPendingAction(() => action)
    setPasswordDialogOpen('verify')
  }

  const handleVerifyPassword = async (password: string): Promise<boolean> => {
    const ok = await window.electronAPI.verifyFolderPassword(folder.id, password)
    if (ok) {
      authenticatedFolders.add(folder.id)
      pendingAction?.()
      setPendingAction(null)
      setPasswordDialogOpen(null)
    }
    return ok
  }

  const handleSetPassword = async (password: string | null) => {
    if (password === null) {
      await window.electronAPI.removeFolderPassword(folder.id)
      authenticatedFolders.delete(folder.id)
    } else {
      await window.electronAPI.setFolderPassword(folder.id, password)
      authenticatedFolders.add(folder.id)
    }
    await loadScheduleFolders()
    setPasswordDialogOpen(null)
  }

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
        {hasPassword && <span className="text-[10px] text-[#e8a050]" title="암호 보호됨">🔒</span>}
        <span className="text-[13px] text-[#cccccc] truncate flex-1">{folder.name}</span>
        {(folder.variables?.length ?? 0) > 0 && (
          <span className="text-[9px] text-[#888] bg-[#333] px-1 rounded" title="폴더 변수 설정됨">
            {folder.variables!.length}변수
          </span>
        )}
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
              비어 있음
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

      {varsDialogOpen && (
        <FolderVariablesDialog
          folder={folder}
          onClose={() => setVarsDialogOpen(false)}
        />
      )}

      {passwordDialogOpen && (
        <FolderPasswordDialog
          mode={passwordDialogOpen}
          folderName={folder.name}
          hasExistingPassword={hasPassword}
          onVerify={handleVerifyPassword}
          onSet={handleSetPassword}
          onClose={() => { setPasswordDialogOpen(null); setPendingAction(null) }}
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
                requirePassword(() => {
                  selectScheduleFolder(folder.id)
                  setAddDialogOpen(true)
                })
              }
            },
            {
              label: `Variables${folder.variables?.length ? ` (${folder.variables.length})` : ''}`,
              onClick: () => {
                setMenu(null)
                requirePassword(() => setVarsDialogOpen(true))
              }
            },
            {
              label: 'Rename',
              onClick: () => {
                setMenu(null)
                requirePassword(() => openDialog({ type: 'rename-schedule-folder', targetFolderId: folder.id, currentName: folder.name }))
              }
            },
            {
              label: hasPassword ? '🔑 암호 변경' : '🔒 암호 설정',
              onClick: () => {
                setMenu(null)
                if (hasPassword) {
                  requirePassword(() => setPasswordDialogOpen('set'))
                } else {
                  setPasswordDialogOpen('set')
                }
              }
            },
            {
              label: 'Delete Folder',
              danger: true,
              onClick: () => {
                setMenu(null)
                requirePassword(() => setPendingDelete(true))
              }
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
