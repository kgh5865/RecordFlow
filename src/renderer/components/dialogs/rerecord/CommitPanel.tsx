import type { WorkflowStep } from '../../../../types/workflow.types'

type Candidate = WorkflowStep & { _origin: 'original' | 'recorded' }

interface Props {
  candidates: Candidate[]
  excluded: Set<string>
  onToggle: (stepId: string) => void
  onSave: () => void
  onCancel: () => void
}

export function CommitPanel(props: Props) {
  const includedCount = props.candidates.length - props.excluded.size
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-[#aaa]">저장 미리보기 (총 {includedCount} 스텝)</p>
      <div className="max-h-72 overflow-y-auto border border-[#333] rounded p-1 flex flex-col gap-0.5">
        {props.candidates.map((step, i) => {
          const isExcluded = props.excluded.has(step.id)
          return (
            <div key={step.id} className={`flex items-center gap-2 px-2 py-1 text-xs ${isExcluded ? 'opacity-40' : ''}`}>
              <span className="text-[#777] w-6 text-right">{i + 1}.</span>
              {step._origin === 'recorded' && <span className="text-[#e8ab6a] text-[10px]">(신규)</span>}
              <span className="text-[#89b4fa] w-14">{step.action}</span>
              <span className="text-[#ccc] truncate flex-1">{step.selector ?? step.url ?? ''}</span>
              {step.value != null && <span className="text-[#a6e3a1] truncate max-w-24">"{step.value}"</span>}
              <button
                onClick={() => props.onToggle(step.id)}
                className="text-[10px] px-1.5 py-0.5 rounded bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]"
                title={isExcluded ? '되돌리기' : '제외'}
              >
                {isExcluded ? '↩' : '✗'}
              </button>
            </div>
          )
        })}
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={props.onCancel} className="px-3 py-1 text-xs rounded bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]">취소</button>
        <button onClick={props.onSave} disabled={includedCount === 0} className="px-3 py-1 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white disabled:opacity-40">저장</button>
      </div>
    </div>
  )
}
