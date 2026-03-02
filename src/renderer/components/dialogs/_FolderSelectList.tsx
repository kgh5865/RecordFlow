import type { WorkflowFolder } from '../../../types/workflow.types'

interface Props {
  folders: WorkflowFolder[]
  selectedId: string
  onChange: (id: string) => void
  radioName?: string
}

function FolderSelectItem({
  folder,
  allFolders,
  selectedId,
  onChange,
  depth,
  radioName,
}: {
  folder: WorkflowFolder
  allFolders: WorkflowFolder[]
  selectedId: string
  onChange: (id: string) => void
  depth: number
  radioName: string
}) {
  const children = allFolders.filter((f) => f.parentId === folder.id)
  return (
    <>
      <label
        className={`flex items-center gap-2 py-1.5 rounded cursor-pointer ${
          selectedId === folder.id ? 'bg-[#094771]' : 'hover:bg-[#3c3c3c]'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px`, paddingRight: '8px' }}
      >
        <input
          type="radio"
          name={radioName}
          value={folder.id}
          checked={selectedId === folder.id}
          onChange={() => onChange(folder.id)}
          className="accent-blue-400 shrink-0"
        />
        <span className="text-[13px] text-[#cccccc] truncate">📁 {folder.name}</span>
      </label>
      {children.map((child) => (
        <FolderSelectItem
          key={child.id}
          folder={child}
          allFolders={allFolders}
          selectedId={selectedId}
          onChange={onChange}
          depth={depth + 1}
          radioName={radioName}
        />
      ))}
    </>
  )
}

export function FolderSelectList({ folders, selectedId, onChange, radioName = 'folder-select' }: Props) {
  if (folders.length === 0) {
    return (
      <p className="text-[11px] text-[#666] italic">폴더가 없습니다. 먼저 폴더를 만들어 주세요.</p>
    )
  }

  const rootFolders = folders.filter((f) => !f.parentId)

  return (
    <div className="flex flex-col max-h-40 overflow-y-auto pr-1">
      {rootFolders.map((f) => (
        <FolderSelectItem
          key={f.id}
          folder={f}
          allFolders={folders}
          selectedId={selectedId}
          onChange={onChange}
          depth={0}
          radioName={radioName}
        />
      ))}
    </div>
  )
}
