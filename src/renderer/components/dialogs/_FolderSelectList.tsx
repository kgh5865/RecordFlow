import { useState } from 'react'
import type { WorkflowFolder } from '../../../types/workflow.types'

interface Props {
  folders: WorkflowFolder[]
  selectedId: string
  onChange: (id: string) => void
}

function FolderAccordionItem({
  folder,
  allFolders,
  selectedId,
  onChange,
  depth,
}: {
  folder: WorkflowFolder
  allFolders: WorkflowFolder[]
  selectedId: string
  onChange: (id: string) => void
  depth: number
}) {
  const children = allFolders.filter((f) => f.parentId === folder.id)
  const [expanded, setExpanded] = useState(false)
  const hasChildren = children.length > 0

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1 cursor-pointer select-none rounded ${
          selectedId === folder.id ? 'bg-[#094771]' : 'hover:bg-[#2a2d2e]'
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px`, paddingRight: '8px' }}
        onClick={() => {
          onChange(folder.id)
          if (hasChildren) setExpanded((v) => !v)
        }}
      >
        <span className="text-[10px] text-[#888] w-3 shrink-0">
          {hasChildren ? (expanded ? '▼' : '▶') : ''}
        </span>
        <span className="text-[#dcb67a] mr-1">📁</span>
        <span className="text-[12px] text-[#cccccc] truncate">{folder.name}</span>
      </div>
      {expanded && children.map((child) => (
        <FolderAccordionItem
          key={child.id}
          folder={child}
          allFolders={allFolders}
          selectedId={selectedId}
          onChange={onChange}
          depth={depth + 1}
        />
      ))}
    </div>
  )
}

export function FolderSelectList({ folders, selectedId, onChange }: Props) {
  if (folders.length === 0) {
    return (
      <p className="text-[11px] text-[#666] italic">폴더가 없습니다. 먼저 폴더를 만들어 주세요.</p>
    )
  }

  const rootFolders = folders.filter((f) => !f.parentId)

  return (
    <div className="flex flex-col max-h-44 overflow-y-auto border border-[#3c3c3c] rounded bg-[#1e1e1e] py-0.5">
      {rootFolders.map((f) => (
        <FolderAccordionItem
          key={f.id}
          folder={f}
          allFolders={folders}
          selectedId={selectedId}
          onChange={onChange}
          depth={0}
        />
      ))}
    </div>
  )
}
