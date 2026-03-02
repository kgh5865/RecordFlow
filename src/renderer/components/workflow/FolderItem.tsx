import { memo, useState } from 'react'
import { useUiStore } from '../../stores/uiStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { ContextMenu } from './ContextMenu'
import type { WorkflowFolder, Workflow } from '../../../types/workflow.types'
import { WorkflowItem } from './WorkflowItem'

interface FolderItemProps {
  folder: WorkflowFolder
  workflows: Workflow[]
  allFolders: WorkflowFolder[]
  allWorkflows: Workflow[]
  depth: number
}

export const FolderItem = memo(function FolderItem({ folder, workflows, allFolders, allWorkflows, depth }: FolderItemProps) {
  const { expandedFolderIds, selectedFolderId, toggleFolder, selectFolder, selectWorkflow, openDialog } = useUiStore()
  const deleteFolder = useWorkflowStore((s) => s.deleteFolder)
  const isExpanded = expandedFolderIds.includes(folder.id)
  const isSelected = selectedFolderId === folder.id

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [pendingDelete, setPendingDelete] = useState(false)

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY })
  }

  const menuItems = [
    {
      label: '+ New Workflow',
      onClick: () => {
        selectFolder(folder.id)
        openDialog({ type: 'new-workflow', targetFolderId: folder.id })
      }
    },
    {
      label: 'Rename',
      onClick: () =>
        openDialog({ type: 'rename-folder', targetFolderId: folder.id, currentName: folder.name })
    },
    {
      label: 'Delete Folder',
      danger: true,
      onClick: () => {
        setMenu(null)
        setPendingDelete(true)
      }
    }
  ]

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 cursor-pointer select-none group ${
          isSelected ? 'ring-1 ring-inset ring-[#007acc] hover:bg-[#2a2d2e]' : 'hover:bg-[#2a2d2e]'
        }`}
        onClick={() => { toggleFolder(folder.id); selectFolder(folder.id); selectWorkflow(null) }}
        onContextMenu={handleContextMenu}
      >
        <span className="text-[10px] text-[#888] w-3">
          {isExpanded ? '▼' : '▶'}
        </span>
        <span className="text-[#dcb67a] mr-1">📁</span>
        <span className="text-[13px] text-[#cccccc] truncate flex-1">{folder.name}</span>
        <span className="text-[10px] text-[#666] ml-auto opacity-0 group-hover:opacity-100">
          {workflows.length}
        </span>
      </div>

      {pendingDelete && (
        <div className="flex items-center gap-1 px-2 py-1" onClick={(e) => e.stopPropagation()}>
          <span className="text-[10px] text-[#cccccc]">"{folder.name}" 삭제하시겠습니까?</span>
          <button
            onClick={() => { deleteFolder(folder.id); setPendingDelete(false) }}
            className="px-2 py-0.5 text-[10px] rounded bg-red-600 hover:bg-red-500 text-white transition-colors"
          >확인</button>
          <button
            onClick={() => setPendingDelete(false)}
            className="px-2 py-0.5 text-[10px] rounded bg-[#3c3c3c] hover:bg-[#505050] text-[#cccccc] transition-colors"
          >취소</button>
        </div>
      )}

      {isExpanded && (
        <div style={{ paddingLeft: `${(depth + 1) * 12}px` }}>
          {allFolders
            .filter((f) => f.parentId === folder.id)
            .map((child) => (
              <FolderItem
                key={child.id}
                folder={child}
                workflows={allWorkflows.filter((w) => w.folderId === child.id)}
                allFolders={allFolders}
                allWorkflows={allWorkflows}
                depth={depth + 1}
              />
            ))}
          {workflows.map((w) => (
            <WorkflowItem key={w.id} workflow={w} />
          ))}
          {allFolders.filter((f) => f.parentId === folder.id).length === 0 && workflows.length === 0 && (
            <div className="py-1 text-[11px] text-[#555] italic">비어 있음</div>
          )}
        </div>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
})
