import { useState, useRef, useEffect } from 'react'
import type { WorkflowFolder } from '../../../types/workflow.types'

interface Props {
  folders: WorkflowFolder[]
  selectedId: string
  onChange: (id: string) => void
}

function FolderDropdownItem({
  folder,
  allFolders,
  selectedId,
  onChange,
  onClose,
  depth,
}: {
  folder: WorkflowFolder
  allFolders: WorkflowFolder[]
  selectedId: string
  onChange: (id: string) => void
  onClose: () => void
  depth: number
}) {
  const children = allFolders.filter((f) => f.parentId === folder.id)
  return (
    <>
      <div
        className={`flex items-center gap-1.5 py-1 rounded cursor-pointer select-none ${
          selectedId === folder.id ? 'bg-[#094771]' : 'hover:bg-[#3c3c3c]'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px`, paddingRight: '8px' }}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { onChange(folder.id); onClose() }}
      >
        <span className="text-[12px] text-[#cccccc] truncate">📁 {folder.name}</span>
      </div>
      {children.map((child) => (
        <FolderDropdownItem
          key={child.id}
          folder={child}
          allFolders={allFolders}
          selectedId={selectedId}
          onChange={onChange}
          onClose={onClose}
          depth={depth + 1}
        />
      ))}
    </>
  )
}

export function FolderSelectList({ folders, selectedId, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selectedFolder = folders.find((f) => f.id === selectedId)
  const rootFolders = folders.filter((f) => !f.parentId)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  if (folders.length === 0) {
    return (
      <p className="text-[11px] text-[#666] italic">폴더가 없습니다. 먼저 폴더를 만들어 주세요.</p>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 bg-[#3c3c3c] rounded border border-[#555] hover:border-[#777] text-left transition-colors"
      >
        <span className={`text-[12px] truncate ${selectedFolder ? 'text-[#cccccc]' : 'text-[#666]'}`}>
          {selectedFolder ? `📁 ${selectedFolder.name}` : '폴더 선택...'}
        </span>
        <span className="text-[#888] text-[10px] ml-2 shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-0.5 bg-[#252526] border border-[#3c3c3c] rounded shadow-lg z-50 max-h-44 overflow-y-auto py-0.5">
          {rootFolders.map((f) => (
            <FolderDropdownItem
              key={f.id}
              folder={f}
              allFolders={folders}
              selectedId={selectedId}
              onChange={onChange}
              onClose={() => setOpen(false)}
              depth={0}
            />
          ))}
        </div>
      )}
    </div>
  )
}
