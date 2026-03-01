import { useState } from 'react'
import { useUiStore } from '../../stores/uiStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { ContextMenu } from './ContextMenu'
import type { Workflow } from '../../../types/workflow.types'

interface Props {
  workflow: Workflow
}

export function WorkflowItem({ workflow }: Props) {
  const { selectedWorkflowId, selectWorkflow, selectFolder, openDialog } = useUiStore()
  const deleteWorkflow = useWorkflowStore((s) => s.deleteWorkflow)
  const dirtyWorkflowIds = useWorkflowStore((s) => s.dirtyWorkflowIds)
  const discardWorkflow = useWorkflowStore((s) => s.discardWorkflow)
  const isSelected = selectedWorkflowId === workflow.id
  const isDirty = dirtyWorkflowIds.includes(workflow.id)

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY })
  }

  const menuItems = [
    {
      label: 'Rename',
      onClick: () =>
        openDialog('rename-workflow', {
          targetWorkflowId: workflow.id,
          currentName: workflow.name
        })
    },
    {
      label: 'Move to Folder',
      onClick: () =>
        openDialog('move-workflow', { targetWorkflowId: workflow.id })
    },
    {
      label: 'Delete',
      danger: true,
      onClick: () => {
        if (confirm(`"${workflow.name}"을 삭제하시겠습니까?`)) {
          if (isSelected) selectWorkflow(null)
          deleteWorkflow(workflow.id)
        }
      }
    }
  ]

  return (
    <div
      className={`flex items-center gap-1 pl-7 pr-2 py-1 cursor-pointer select-none ${
        isSelected ? 'ring-1 ring-inset ring-[#007acc] text-[#cccccc] hover:bg-[#2a2d2e]' : 'hover:bg-[#2a2d2e] text-[#cccccc]'
      }`}
      onClick={() => {
        // 현재 선택된 워크플로우에 미저장 변경이 있으면 경고
        if (selectedWorkflowId && selectedWorkflowId !== workflow.id && dirtyWorkflowIds.includes(selectedWorkflowId)) {
          if (!confirm('현재 워크플로우에 저장하지 않은 변경사항이 있습니다.\n변경사항을 버리고 이동하시겠습니까?')) return
          discardWorkflow(selectedWorkflowId)
        }
        selectWorkflow(workflow.id); selectFolder(null)
      }}
      onContextMenu={handleContextMenu}
    >
      <span className="mr-1 text-[#569cd6]">📄</span>
      <span className="text-[13px] truncate flex-1">
        {workflow.name}
        {isDirty && <span className="text-[#e8ab6a] ml-1" title="미저장 변경사항">●</span>}
      </span>
      <span className="text-[10px] text-[#555] ml-auto">{workflow.steps.length}</span>

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
