import { useState } from 'react'
import { useUiStore } from '../../stores/uiStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { ContextMenu } from './ContextMenu'
import type { WorkflowFolder, Workflow } from '../../../types/workflow.types'
import { WorkflowItem } from './WorkflowItem'

interface Props {
  folder: WorkflowFolder
  workflows: Workflow[]
  allFolders: WorkflowFolder[]
  allWorkflows: Workflow[]
  depth: number
}

export function FolderItem({ folder, workflows, allFolders, allWorkflows, depth }: Props) {
  const { expandedFolderIds, selectedFolderId, toggleFolder, selectFolder, selectWorkflow, openDialog } = useUiStore()
  const deleteFolder = useWorkflowStore((s) => s.deleteFolder)
  const isExpanded = expandedFolderIds.includes(folder.id)
  const isSelected = selectedFolderId === folder.id

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

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
        openDialog('new-workflow', { targetFolderId: folder.id })
      }
    },
    {
      label: 'Rename',
      onClick: () =>
        openDialog('rename-folder', { targetFolderId: folder.id, currentName: folder.name })
    },
    {
      label: 'Delete Folder',
      danger: true,
      onClick: () => {
        if (confirm(`"${folder.name}" 폴더를 삭제하시겠습니까? 내부 workflow도 삭제됩니다.`)) {
          deleteFolder(folder.id)
        }
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
}
