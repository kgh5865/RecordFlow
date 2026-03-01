import { useWorkflowStore } from '../../stores/workflowStore'
import { useUiStore } from '../../stores/uiStore'
import { FolderItem } from './FolderItem'

export function FolderTree() {
  const folders = useWorkflowStore((s) => s.folders)
  const workflows = useWorkflowStore((s) => s.workflows)
  const selectedFolderId = useUiStore((s) => s.selectedFolderId)
  const selectedWorkflowId = useUiStore((s) => s.selectedWorkflowId)
  const selectFolder = useUiStore((s) => s.selectFolder)
  const selectWorkflow = useUiStore((s) => s.selectWorkflow)

  const nothingSelected = selectedFolderId === null && selectedWorkflowId === null

  const handleEmptyClick = () => {
    selectFolder(null)
    selectWorkflow(null)
  }

  if (folders.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-32 text-[11px] text-[#555]"
        onClick={handleEmptyClick}
      >
        <div>폴더가 없습니다</div>
        <div className="mt-1">하단 "+ Folder"로 생성하세요</div>
      </div>
    )
  }

  const rootFolders = folders.filter((f) => !f.parentId)

  return (
    <div className="flex flex-col min-h-full">
      <div className="py-1">
        {rootFolders.map((folder) => (
          <FolderItem
            key={folder.id}
            folder={folder}
            workflows={workflows.filter((w) => w.folderId === folder.id)}
            allFolders={folders}
            allWorkflows={workflows}
            depth={0}
          />
        ))}
      </div>
      {/* 목록 아래 빈 공간 — 클릭 시 선택 해제 + 루트 선택 표시 */}
      <div
        className={`flex-1 min-h-[40px] cursor-default transition-colors ${
          nothingSelected ? 'ring-1 ring-inset ring-[#007acc]' : 'hover:bg-[#2a2d2e]/60'
        }`}
        onClick={handleEmptyClick}
      />
    </div>
  )
}
