import { useEffect } from 'react'
import { useUiStore } from '../../stores/uiStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { ActionBadge } from '../steps/ActionBadge'

// ─── 오류 패턴별 해결 방안 ───────────────────────────────────────────────────

interface ErrorHint {
  title: string
  steps: string[]
}

function getErrorHint(error: string): ErrorHint | null {
  // strict mode violation: resolved to N elements
  const strictMatch = error.match(/strict mode violation.*resolved to (\d+) elements/s)
  if (strictMatch) {
    return {
      title: '여러 요소에 매칭되는 Selector 문제',
      steps: [
        'F12 개발자 도구에서 정확한 id/name 속성을 확인하세요.',
        '실패한 Step의 파란 Selector를 클릭하여 편집 모드로 진입하세요.',
        'locator(\'#정확한ID\') 또는 getByPlaceholder(\'placeholder 텍스트\') 형식으로 수정하세요.',
        '예: locator(\'#userOTP\')  /  getByPlaceholder(\'OTP번호를 입력해주세요.\')',
      ]
    }
  }

  // Timeout
  if (/TimeoutError|Timeout \d+ms exceeded/i.test(error)) {
    return {
      title: '요소를 찾지 못해 타임아웃 발생',
      steps: [
        '해당 요소가 페이지에 실제로 존재하는지 확인하세요.',
        '이전 Step이 정상 완료된 후 요소가 나타나는지 확인하세요.',
        'wait step을 추가하거나, 더 구체적인 selector로 수정해 보세요.',
        'selector가 변경된 경우 워크플로우를 다시 녹화해주세요.',
      ]
    }
  }

  // not visible / hidden
  if (/not visible|hidden|not attached/i.test(error)) {
    return {
      title: '요소가 숨겨져 있거나 화면에 없음',
      steps: [
        '해당 요소가 현재 화면에 표시되어 있는지 확인하세요.',
        '모달, 드롭다운, 탭 등 UI 상태에 따라 요소가 숨겨질 수 있습니다.',
        '이전 Step을 추가하여 요소가 보이는 상태로 만들어주세요.',
      ]
    }
  }

  // rawLine 없음
  if (/rawLine이 없습니다/.test(error)) {
    return {
      title: '워크플로우 데이터 불완전',
      steps: [
        '이 Step은 이전 버전 방식으로 녹화된 데이터입니다.',
        '해당 워크플로우를 삭제하고 다시 녹화해주세요.',
      ]
    }
  }

  // locator 허용되지 않는 표현식
  if (/허용되지 않는 locator/.test(error)) {
    return {
      title: '지원하지 않는 Selector 형식',
      steps: [
        '실패한 Step의 Selector를 클릭하여 편집 모드로 진입하세요.',
        'page. 으로 시작하는 표준 Playwright locator 형식을 사용하세요.',
        '예: locator(\'#id\')  /  getByRole(\'button\', { name: \'...\' })',
        '워크플로우를 다시 녹화하면 자동으로 올바른 형식이 생성됩니다.',
      ]
    }
  }

  // OTP 프로필 없음
  if (/OTP 프로필.*찾을 수 없습니다/.test(error)) {
    return {
      title: 'OTP 프로필 미등록',
      steps: [
        '상단 ⚙ Setup → OTP 프로필 섹션을 열어주세요.',
        '해당 이름의 OTP 프로필을 추가하세요.',
        'Step의 값에서 🔑 배지에 표시된 이름과 정확히 일치해야 합니다.',
      ]
    }
  }

  return null
}

// ────────────────────────────────────────────────────────────────────────────

export function RunResultToast() {
  const lastRunResult = useUiStore((s) => s.lastRunResult)
  const setRunResult = useUiStore((s) => s.setRunResult)
  const selectedWorkflowId = useUiStore((s) => s.selectedWorkflowId)
  const workflows = useWorkflowStore((s) => s.workflows)

  useEffect(() => {
    if (!lastRunResult) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRunResult(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lastRunResult, setRunResult])

  if (!lastRunResult) return null

  const { success, completedSteps, error } = lastRunResult
  const workflow = workflows.find((w) => w.id === selectedWorkflowId)
  const totalSteps = workflow?.steps.length ?? completedSteps
  const failedStep = !success && workflow ? workflow.steps[completedSteps] : null

  const errorLines = error?.split('\n') ?? []
  const errorSummary = errorLines[0] ?? ''
  const errorDetail = errorLines.slice(1).join('\n').trim()

  const hint = !success && error ? getErrorHint(error) : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) setRunResult(null) }}
    >
      <div
        className="w-[500px] max-h-[90vh] bg-[#252526] border border-[#3c3c3c] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 상단 강조선 */}
        <div className={`h-[3px] shrink-0 ${success ? 'bg-[#4caf50]' : 'bg-red-500'}`} />

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#3c3c3c] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
              success ? 'bg-[#4caf50]/15 text-[#4caf50]' : 'bg-red-500/15 text-red-400'
            }`}>
              {success
                ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 6L4.5 9L10.5 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              }
            </div>
            <span className={`text-[13px] font-semibold ${success ? 'text-[#4caf50]' : 'text-red-400'}`}>
              {success ? '실행 완료' : '실행 실패'}
            </span>
            {workflow && (
              <span className="text-[11px] text-[#666]">— {workflow.name}</span>
            )}
          </div>
          <button
            onClick={() => setRunResult(null)}
            className="text-[#555] hover:text-[#ccc] transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* 본문 (스크롤 가능) */}
        <div className="overflow-y-auto flex-1">
          <div className="px-5 py-4 space-y-4">
            {/* 진행 현황 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-[#666]">진행 현황</span>
                <span className="text-[11px] text-[#888]">{completedSteps} / {totalSteps} steps</span>
              </div>
              <div className="w-full h-1.5 bg-[#3c3c3c] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${success ? 'bg-[#4caf50]' : 'bg-red-500'}`}
                  style={{ width: totalSteps > 0 ? `${(completedSteps / totalSteps) * 100}%` : '0%' }}
                />
              </div>
            </div>

            {/* 실패한 Step */}
            {failedStep && (
              <div>
                <div className="text-[11px] text-[#666] mb-2">실패한 Step</div>
                <div className="flex items-center gap-2 px-3 py-2 bg-red-900/20 border border-red-500/20 rounded-lg">
                  <span className="text-[10px] text-[#555] w-5 text-right shrink-0">
                    {failedStep.order + 1}
                  </span>
                  <ActionBadge action={failedStep.action} />
                  <span className="text-[11px] font-mono text-[#9cdcfe] truncate flex-1" title={failedStep.url ?? failedStep.selector}>
                    {failedStep.url ?? failedStep.selector ?? ''}
                  </span>
                </div>
              </div>
            )}

            {/* 해결 방안 */}
            {hint && (
              <div>
                <div className="text-[11px] text-[#666] mb-2">해결 방안</div>
                <div className="bg-[#1e2a1e] border border-[#4caf50]/20 rounded-lg px-3 py-3">
                  <div className="text-[11px] font-semibold text-[#4caf50] mb-2">{hint.title}</div>
                  <ol className="space-y-1.5">
                    {hint.steps.map((step, i) => (
                      <li key={i} className="flex gap-2 text-[11px] text-[#aaa] leading-relaxed">
                        <span className="shrink-0 w-4 h-4 rounded-full bg-[#4caf50]/15 text-[#4caf50] text-[10px] flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}

            {/* 오류 메시지 */}
            {!success && error && (
              <div>
                <div className="text-[11px] text-[#666] mb-2">오류 메시지</div>
                <div className="bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg overflow-hidden select-text cursor-text">
                  <div className="px-3 py-2 text-[11px] text-red-400 border-b border-[#3c3c3c]">
                    {errorSummary}
                  </div>
                  {errorDetail && (
                    <div className="px-3 py-2 max-h-[100px] overflow-y-auto">
                      <pre className="text-[10px] text-[#555] whitespace-pre-wrap break-all font-mono leading-relaxed">
                        {errorDetail}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex justify-end px-5 py-3 border-t border-[#3c3c3c] shrink-0">
          <button
            autoFocus
            onClick={() => setRunResult(null)}
            className="px-4 py-1.5 text-[12px] rounded-lg bg-[#3c3c3c] hover:bg-[#4a4a4a] text-[#cccccc] transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
