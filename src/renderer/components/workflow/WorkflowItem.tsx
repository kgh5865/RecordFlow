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
        <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
          <span className="text-[10px] text-[#cccccc]">삭제하시겠습니까?</span>
          <button
            onClick={() => {
              if (isSelected) selectWorkflow(null)
              deleteWorkflow(workflow.id)
              setPendingDelete(false)
            }}
            className="px-2 py-0.5 text-[10px] rounded bg-red-600 hover:bg-red-500 text-white transition-colors"
          >확인</button>
          <button
            onClick={() => setPendingDelete(false)}
            className="px-2 py-0.5 text-[10px] rounded bg-[#3c3c3c] hover:bg-[#505050] text-[#cccccc] transition-colors"
          >취소</button>
        </div>
      )}

      {pendingNavigate && (
        <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
          <span className="text-[10px] text-[#cccccc]">변경사항 버리고 이동?</span>
          <button
            onClick={() => {
              discardWorkflow(selectedWorkflowId!)
              selectWorkflow(workflow.id)
              selectFolder(null)
              setPendingNavigate(false)
            }}
            className="px-2 py-0.5 text-[10px] rounded bg-[#007acc] hover:bg-[#1a8ad4] text-white transition-colors"
          >이동</button>
          <button
            onClick={() => setPendingNavigate(false)}
            className="px-2 py-0.5 text-[10px] rounded bg-[#3c3c3c] hover:bg-[#505050] text-[#cccccc] transition-colors"
          >취소</button>
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
