import { memo, useState } from 'react'
import { useUiStore } from '../../stores/uiStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { ContextMenu } from './ContextMenu'
import { ConfirmDialog } from '../dialogs/ConfirmDialog'
import type { Workflow } from '../../../types/workflow.types'

interface WorkflowItemProps {
  workflow: Workflow
}

export const WorkflowItem = memo(function WorkflowItem({ workflow }: WorkflowItemProps) {
  const { selectedWorkflowId, selectWorkflow, selectFolder, openDialog } = useUiStore()
  const deleteWorkflow = useWorkflowStore((s) => s.deleteWorkflow)
  const dirtyWorkflowIds = useWorkflowStore((s) => s.dirtyWorkflowIds)
  const discardWorkflow = useWorkflowStore((s) => s.discardWorkflow)
  const isSelected = selectedWorkflowId === workflow.id
  const isDirty = dirtyWorkflowIds.includes(workflow.id)

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [pendingNavigate, setPendingNavigate] = useState(false)

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY })
  }

  const menuItems = [
    {
      label: 'Rename',
      onClick: () =>
        openDialog({ type: 'rename-workflow', targetWorkflowId: workflow.id, currentName: workflow.name })
    },
    {
      label: 'Move to Folder',
      onClick: () =>
        openDialog({ type: 'move-workflow', targetWorkflowId: workflow.id })
    },
    {
      label: 'Delete',
      danger: true,
      onClick: () => {
        setMenu(null)
        setPendingDelete(true)
      }
    }
  ]

  const handleClick = () => {
    if (selectedWorkflowId && selectedWorkflowId !== workflow.id && dirtyWorkflowIds.includes(selectedWorkflowId)) {
      setPendingNavigate(true)
      return
    }
    selectWorkflow(workflow.id)
    selectFolder(null)
  }

  return (
    <div
      className={`flex flex-col pl-7 pr-2 py-1 cursor-pointer select-none ${
        isSelected ? 'ring-1 ring-inset ring-[#007acc] text-[#cccccc] hover:bg-[#2a2d2e]' : 'hover:bg-[#2a2d2e] text-[#cccccc]'
      }`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <div className="flex items-center gap-1">
        <span className="mr-1 text-[#569cd6]">📄</span>
        <span className="text-[13px] truncate flex-1">
          {workflow.name}
          {isDirty && <span className="text-[#e8ab6a] ml-1" title="미저장 변경사항">●</span>}
        </span>
        <span className="text-[10px] text-[#555] ml-auto">{workflow.steps.length}</span>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="워크플로우 삭제"
          message={`"${workflow.name}"을(를) 삭제합니다.\n이 작업은 되돌릴 수 없습니다.`}
          confirmLabel="삭제"
          variant="danger"
          onConfirm={() => {
            if (isSelected) selectWorkflow(null)
            deleteWorkflow(workflow.id)
            setPendingDelete(false)
          }}
          onClose={() => setPendingDelete(false)}
        />
      )}

      {pendingNavigate && (
        <ConfirmDialog
          title="미저장 변경사항"
          message={`현재 워크플로우에 저장되지 않은 변경사항이 있습니다.\n변경사항을 버리고 이동하시겠습니까?`}
          confirmLabel="버리고 이동"
          variant="primary"
          onConfirm={() => {
            discardWorkflow(selectedWorkflowId!)
            selectWorkflow(workflow.id)
            selectFolder(null)
            setPendingNavigate(false)
          }}
          onClose={() => setPendingNavigate(false)}
        />
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
