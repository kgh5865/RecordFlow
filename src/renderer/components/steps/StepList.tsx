import { useState } from 'react'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useUiStore } from '../../stores/uiStore'
import { StepRow } from './StepRow'
import type { Workflow, WorkflowStep } from '../../../types/workflow.types'

/** plain CSS selector를 locator()로 래핑 */
function normalizeSelector(input: string): string {
  const trimmed = input.trim()
  if (trimmed.startsWith('getBy') || trimmed.startsWith('locator(')) return trimmed
  return `locator('${trimmed.replace(/'/g, "\\'")}')`
}

/** 편집된 selector/url로 rawLine 재구성 */
function rebuildRawLine(step: WorkflowStep, newSelector?: string, newUrl?: string): string {
  const selector = newSelector ?? step.selector
  const url = newUrl ?? step.url
  const value = step.value ?? ''

  switch (step.action) {
    case 'navigate':
      return `page.goto('${url}')`
    case 'click':
      return `page.${selector}.click()`
    case 'fill':
      return `page.${selector}.fill('${value}')`
    case 'select':
      return `page.${selector}.selectOption('${value}')`
    case 'expect':
      if (url) return `expect(page).toHaveURL('${url}')`
      return `expect(page.${selector}).toBeVisible()`
    case 'wait':
      return `page.waitForSelector('${selector}')`
    default:
      return step.rawLine ?? ''
  }
}

interface Props {
  workflow: Workflow
}

export function StepList({ workflow }: Props) {
  const { moveStepUp, moveStepDown, deleteStep, updateStep } = useWorkflowStore()
  const { runningWorkflowId, currentStepIndex } = useUiStore()
  const [helpOpen, setHelpOpen] = useState(false)

  const isThisRunning = runningWorkflowId === workflow.id

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Step 목록 */}
      <div className="flex-1 overflow-y-auto">
        {workflow.steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#555] text-sm">
            <div>기록된 step이 없습니다</div>
            <div className="mt-1 text-xs">상단 ● Record 버튼으로 기록을 시작하세요</div>
          </div>
        ) : (
          workflow.steps.map((step, i) => (
            <StepRow
              key={step.id}
              step={step}
              isActive={isThisRunning && currentStepIndex === i}
              isFirst={i === 0}
              isLast={i === workflow.steps.length - 1}
              onMoveUp={() => moveStepUp(workflow.id, step.id)}
              onMoveDown={() => moveStepDown(workflow.id, step.id)}
              onDelete={() => deleteStep(workflow.id, step.id)}
              onEditValue={(val) => updateStep(workflow.id, step.id, { value: val })}
              onEditSelector={(val) => {
                const normalized = normalizeSelector(val)
                if (step.action === 'navigate' || (step.action === 'expect' && step.url)) {
                  // url 편집
                  updateStep(workflow.id, step.id, {
                    url: val.trim(),
                    rawLine: rebuildRawLine(step, undefined, val.trim())
                  })
                } else {
                  // selector 편집
                  updateStep(workflow.id, step.id, {
                    selector: normalized,
                    rawLine: rebuildRawLine(step, normalized)
                  })
                }
              }}
            />
          ))
        )}
      </div>

      {/* 하단 상태 바 */}
      <div className="relative flex items-center px-3 py-1.5 border-t border-[#3c3c3c] shrink-0">
        <span className="text-[11px] text-[#555]">{workflow.steps.length} steps</span>
        <div className="ml-auto relative">
          <button
            onClick={() => setHelpOpen((o) => !o)}
            className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold border transition-colors ${
              helpOpen
                ? 'bg-[#007acc] text-white border-[#007acc]'
                : 'text-[#aaa] border-[#666] hover:text-white hover:border-[#007acc] hover:bg-[#007acc]/30'
            }`}
            title="편집 가이드"
          >
            ?
          </button>
          {helpOpen && (
            <div className="absolute bottom-full right-0 mb-2 w-[280px] bg-[#252526] border border-[#3c3c3c] rounded-lg shadow-xl z-50 p-3">
              <div className="text-[11px] font-semibold text-[#cccccc] mb-2">Step 편집 가이드</div>
              <div className="space-y-2 text-[10px] text-[#999]">
                <div>
                  <div className="text-[#4fc3f7] font-medium mb-0.5">Selector / URL 편집</div>
                  <div>파란색 텍스트를 클릭하면 편집 모드에 진입합니다.</div>
                </div>
                <div>
                  <div className="text-[#4fc3f7] font-medium mb-0.5">입력 형식</div>
                  <div className="space-y-1 ml-1">
                    <div><code className="text-[#ce9178]">#id</code>, <code className="text-[#ce9178]">.class</code> &rarr; <code className="text-[#9cdcfe]">locator()</code> 자동 래핑</div>
                    <div><code className="text-[#9cdcfe]">getByRole('button', {'{'} name: '...' {'}'})</code></div>
                    <div><code className="text-[#9cdcfe]">locator('#userOTP')</code></div>
                  </div>
                </div>
                <div>
                  <div className="text-[#4fc3f7] font-medium mb-0.5">Value 편집</div>
                  <div>주황색 값 텍스트를 클릭하면 편집할 수 있습니다.</div>
                </div>
                <div>
                  <div className="text-[#4fc3f7] font-medium mb-0.5">OTP 자동 입력</div>
                  <div className="space-y-0.5 ml-1">
                    <div>fill/select 값 편집 중 <span className="text-[#4fc3f7]">🔑▾</span> 버튼으로 OTP 프로필 선택</div>
                    <div>실행 시 TOTP 코드를 자동 생성하여 입력합니다.</div>
                    <div>설정에서 OTP 프로필(이름 + Secret Key)을 먼저 등록하세요.</div>
                  </div>
                </div>
                <div className="border-t border-[#3c3c3c] pt-1.5">
                  <div className="text-[#4fc3f7] font-medium mb-0.5">단축키</div>
                  <div className="flex gap-3">
                    <span><kbd className="px-1 py-0.5 bg-[#3c3c3c] rounded text-[#ccc]">Enter</kbd> 저장</span>
                    <span><kbd className="px-1 py-0.5 bg-[#3c3c3c] rounded text-[#ccc]">Esc</kbd> 취소</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
