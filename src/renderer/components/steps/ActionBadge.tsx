import type { ActionType } from '../../../types/workflow.types'

const STYLES: Record<ActionType, string> = {
  navigate: 'bg-blue-900/60 text-blue-300 border-blue-700',
  click:    'bg-green-900/60 text-green-300 border-green-700',
  fill:     'bg-yellow-900/60 text-yellow-300 border-yellow-700',
  select:   'bg-purple-900/60 text-purple-300 border-purple-700',
  expect:   'bg-orange-900/60 text-orange-300 border-orange-700',
  wait:     'bg-gray-800/60 text-gray-400 border-gray-600',
  press:    'bg-rose-900/60 text-rose-300 border-rose-700'
}

interface Props {
  action: ActionType
}

export function ActionBadge({ action }: Props) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[10px] font-mono rounded border shrink-0 w-[60px] text-center ${STYLES[action]}`}
    >
      {action}
    </span>
  )
}
