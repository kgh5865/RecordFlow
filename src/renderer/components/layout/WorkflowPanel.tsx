import { FolderTree } from '../workflow/FolderTree'
import { SchedulePanel } from '../schedule/SchedulePanel'
import { useUiStore } from '../../stores/uiStore'
import type { LeftTab } from '../../stores/uiStore'

export function WorkflowPanel() {
  const openDialog = useUiStore((s) => s.openDialog)
  const selectedFolderId = useUiStore((s) => s.selectedFolderId)
  const selectFolder = useUiStore((s) => s.selectFolder)
  const selectWorkflow = useUiStore((s) => s.selectWorkflow)
  const activeLeftTab = useUiStore((s) => s.activeLeftTab)
  const setActiveLeftTab = useUiStore((s) => s.setActiveLeftTab)

  return (
    <div className="w-[280px] shrink-0 flex flex-col bg-[#252526] border-r border-[#3c3c3c] overflow-hidden">
      {/* 탭 헤더 */}
      <div className="flex border-b border-[#3c3c3c] shrink-0">
        <TabButton label="📂 Workflows" tab="workflows" active={activeLeftTab} onClick={setActiveLeftTab} />
        <TabButton label="⏰ Schedules" tab="schedules" active={activeLeftTab} onClick={setActiveLeftTab} />
      </div>

      {/* 탭 콘텐츠 */}
      {activeLeftTab === 'workflows' ? (
        <>
          <div
            className="flex-1 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                selectFolder(null)
                selectWorkflow(null)
              }
            }}
          >
            <FolderTree />
          </div>
          <div className="flex gap-1 p-2 border-t border-[#3c3c3c] shrink-0">
            <button
              onClick={() => openDialog('new-folder')}
              className="flex-1 py-1 text-xs rounded text-[#cccccc] bg-[#3c3c3c] hover:bg-[#505050] transition-colors"
            >
              + Folder
            </button>
            <button
              onClick={() =>
                openDialog('new-workflow', { targetFolderId: selectedFolderId ?? undefined })
              }
              disabled={!selectedFolderId}
              className="flex-1 py-1 text-xs rounded text-[#cccccc] bg-[#3c3c3c] hover:bg-[#505050] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              + Workflow
            </button>
          </div>
        </>
      ) : (
        <SchedulePanel />
      )}

      {/* 다이얼로그 렌더링 */}
      <Dialogs />
    </div>
  )
}

function TabButton({
  label, tab, active, onClick
}: {
  label: string
  tab: LeftTab
  active: LeftTab
  onClick: (t: LeftTab) => void
}) {
  const isActive = tab === active
  return (
    <button
      onClick={() => onClick(tab)}
      className={`flex-1 py-1.5 text-[11px] font-medium transition-colors ${
        isActive
          ? 'text-[#cccccc] border-b-2 border-[#007acc]'
          : 'text-[#888] hover:text-[#aaa]'
      }`}
    >
      {label}
    </button>
  )
}

// 다이얼로그는 WorkflowPanel에 포함 (portal 없이 간단하게)
import { NewFolderDialog } from '../dialogs/NewFolderDialog'
import { NewWorkflowDialog } from '../dialogs/NewWorkflowDialog'
import { MoveWorkflowDialog } from '../dialogs/MoveWorkflowDialog'
import { RenameDialog } from '../dialogs/RenameDialog'

function Dialogs() {
  const { dialog } = useUiStore()
  if (!dialog.type) return null

  if (dialog.type === 'new-folder') return <NewFolderDialog />
  if (dialog.type === 'new-workflow') return <NewWorkflowDialog />
  if (dialog.type === 'move-workflow') return <MoveWorkflowDialog />
  if (dialog.type === 'rename-folder' || dialog.type === 'rename-workflow') return <RenameDialog />
  return null
}
