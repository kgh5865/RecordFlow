import { useState } from 'react'
import { useScheduleStore } from '../../stores/scheduleStore'
import { Input } from '../ui/Input'
import type { FolderVariable, ScheduleFolder } from '../../../types/workflow.types'

interface Props {
  folder: ScheduleFolder
  onClose: () => void
}

export function FolderVariablesDialog({ folder, onClose }: Props) {
  const [variables, setVariables] = useState<FolderVariable[]>(
    () => (folder.variables ?? []).map((v) => ({ ...v }))
  )
  const [saving, setSaving] = useState(false)
  const { updateScheduleFolderVariables } = useScheduleStore()

  const addVariable = () => {
    setVariables((prev) => [...prev, { key: '', value: '', isSensitive: false }])
  }

  const updateVar = (index: number, patch: Partial<FolderVariable>) => {
    setVariables((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)))
  }

  const removeVar = (index: number) => {
    setVariables((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    const valid = variables.filter((v) => v.key.trim())
    setSaving(true)
    try {
      await updateScheduleFolderVariables(folder.id, valid)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-[440px] bg-[#2d2d2d] border border-[#3c3c3c] rounded-lg shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3c3c3c]">
          <span className="text-sm font-semibold text-[#cccccc]">
            폴더 변수 — {folder.name}
          </span>
          <button onClick={onClose} className="text-[#888] hover:text-[#ccc] text-lg leading-none">
            ×
          </button>
        </div>

        {/* 설명 */}
        <div className="px-4 pt-3 pb-1 text-[11px] text-[#888]">
          스텝 value에 <code className="bg-[#3c3c3c] px-1 rounded text-[#dcdcaa]">{'{{var:키}}'}</code>로 참조합니다.
        </div>

        {/* 변수 목록 */}
        <div className="px-4 py-2 max-h-[300px] overflow-y-auto space-y-2">
          {variables.length === 0 && (
            <div className="text-[12px] text-[#555] text-center py-4">
              등록된 변수가 없습니다
            </div>
          )}
          {variables.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={v.key}
                onChange={(e) => updateVar(i, { key: e.target.value })}
                placeholder="키 (예: userId)"
                className="!w-[120px] !text-xs shrink-0"
              />
              <Input
                type={v.isSensitive ? 'password' : 'text'}
                value={v.value}
                onChange={(e) => updateVar(i, { value: e.target.value })}
                placeholder="값"
                className="flex-1 !text-xs"
              />
              <button
                onClick={() => updateVar(i, { isSensitive: !v.isSensitive })}
                className={`text-[11px] px-1.5 py-1 rounded shrink-0 transition-colors ${
                  v.isSensitive
                    ? 'bg-[#4a3020] text-[#e8a050]'
                    : 'bg-[#3c3c3c] text-[#888] hover:text-[#ccc]'
                }`}
                title={v.isSensitive ? '민감 정보 (마스킹 활성)' : '일반 값'}
              >
                {v.isSensitive ? '🔒' : '🔓'}
              </button>
              <button
                onClick={() => removeVar(i)}
                className="text-[#666] hover:text-red-400 text-sm shrink-0 transition-colors"
                title="삭제"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* 추가 버튼 */}
        <div className="px-4 pb-2">
          <button
            onClick={addVariable}
            className="text-[11px] text-[#0e639c] hover:text-[#1177bb] transition-colors"
          >
            + 변수 추가
          </button>
        </div>

        {/* 푸터 */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#3c3c3c]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded text-[#cccccc] bg-[#3c3c3c] hover:bg-[#505050] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white transition-colors disabled:opacity-50"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  )
}
