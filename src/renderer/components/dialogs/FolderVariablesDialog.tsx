import { useState } from 'react'
import { useScheduleStore } from '../../stores/scheduleStore'
import { Input } from '../ui/Input'
import type { FolderVariable, ScheduleFolder } from '../../../types/workflow.types'

interface Props {
  folder: ScheduleFolder
  onClose: () => void
}

export function FolderVariablesDialog({ folder, onClose }: Props) {
  // 민감 변수는 값을 빈 문자열로 마스킹하여 초기화 (원본 노출 방지)
  const [variables, setVariables] = useState<FolderVariable[]>(
    () => (folder.variables ?? []).map((v) => ({
      ...v,
      value: v.isSensitive ? '' : v.value
    }))
  )
  // 민감 변수의 원본 값 존재 여부만 추적 (값 자체는 보관하지 않음)
  const [hasSensitiveOriginal] = useState<Set<string>>(
    () => new Set(
      (folder.variables ?? [])
        .filter((v) => v.isSensitive && v.value)
        .map((v) => v.key)
    )
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
    const origMap = new Map((folder.variables ?? []).map((v) => [v.key, v.value]))
    const valid = variables
      .filter((v) => v.key.trim())
      .map((v) => {
        // 민감 변수에서 값을 새로 입력하지 않은 경우 기존 값 유지
        if (v.isSensitive && !v.value && origMap.has(v.key)) {
          return { ...v, value: origMap.get(v.key)! }
        }
        return v
      })
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
                placeholder={v.isSensitive && hasSensitiveOriginal.has(v.key) ? '••••••••  (변경 시 새 값 입력)' : '값'}
                className="flex-1 !text-xs"
              />
              <button
                onClick={() => {
                  // 기존 민감 변수(값이 마스킹된 상태)는 해제 불가
                  if (v.isSensitive && hasSensitiveOriginal.has(v.key) && !v.value) return
                  updateVar(i, { isSensitive: !v.isSensitive })
                }}
                className={`text-[11px] px-1.5 py-1 rounded shrink-0 transition-colors ${
                  v.isSensitive
                    ? 'bg-[#4a3020] text-[#e8a050]'
                    : 'bg-[#3c3c3c] text-[#888] hover:text-[#ccc]'
                } ${v.isSensitive && hasSensitiveOriginal.has(v.key) && !v.value ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={
                  v.isSensitive && hasSensitiveOriginal.has(v.key) && !v.value
                    ? '민감 정보 보호됨 (새 값 입력 후 해제 가능)'
                    : v.isSensitive ? '민감 정보 (마스킹 활성)' : '일반 값'
                }
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
