import { useState } from 'react'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useUiStore } from '../../stores/uiStore'
import { Dialog } from './_Dialog'
import { FolderSelectList } from './_FolderSelectList'

export function ImportWorkflowDialog() {
  const { dialog, closeDialog, showToast } = useUiStore()
  const folders = useWorkflowStore((s) => s.folders)
  const importWorkflow = useWorkflowStore((s) => s.importWorkflow)

  const [targetFolderId, setTargetFolderId] = useState<string>('')
  const [folderError, setFolderError] = useState(false)

  if (dialog.type !== 'import-workflow') return null

  const { file } = dialog
  const maskedSteps = file.workflow.steps.filter((s) => s._masked)

  const handleConfirm = () => {
    if (!targetFolderId) {
      setFolderError(true)
      return
    }
    importWorkflow(file, targetFolderId)
    showToast(`"${file.workflow.name}" 가져오기 완료`, 'success')
    closeDialog()
  }

  return (
    <Dialog
      title="Import Workflow"
      onClose={closeDialog}
      onConfirm={handleConfirm}
      confirmLabel="가져오기"
    >
      <div className="flex flex-col gap-3">
        {/* 워크플로우 정보 */}
        <div className="px-3 py-2 bg-[#1e1e1e] rounded border border-[#3c3c3c]">
          <p className="text-[12px] text-[#cccccc] font-medium">{file.workflow.name}</p>
          <p className="text-[11px] text-[#888] mt-0.5">스텝 {file.workflow.steps.length}개</p>
        </div>

        {/* 폴더 선택 */}
        <div>
          <p className="text-[11px] text-[#aaa] mb-1.5">
            저장할 폴더 선택 {folderError && <span className="text-red-400 ml-1">폴더를 선택해 주세요</span>}
          </p>
          <FolderSelectList
            folders={folders}
            selectedId={targetFolderId}
            onChange={(id) => { setTargetFolderId(id); setFolderError(false) }}
          />
        </div>

        {/* 마스킹 안내 */}
        {maskedSteps.length > 0 && (
          <div className="px-3 py-2 bg-[#2a2000] border border-[#554400] rounded">
            <p className="text-[11px] text-[#e8c070] font-medium mb-1">
              ⚠ {maskedSteps.length}개 스텝의 민감 정보가 마스킹되었습니다
            </p>
            <p className="text-[10px] text-[#aaa] mb-1.5">가져온 후 직접 값을 입력해 주세요:</p>
            <ul className="flex flex-col gap-0.5">
              {maskedSteps.map((s, i) => (
                <li key={i} className="text-[10px] text-[#888] flex items-center gap-1.5">
                  <span className="text-[#555]">step {s.order + 1}:</span>
                  <span className="font-mono text-[#9cdcfe] truncate max-w-[140px]" title={s.selector}>
                    {s.selector}
                  </span>
                  <span className="text-[#555]">→</span>
                  <span className="font-mono text-[#e8c070]">{s.value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  )
}
