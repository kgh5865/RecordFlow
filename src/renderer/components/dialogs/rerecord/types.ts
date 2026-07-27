import type { WorkflowStep, ReRecordStateResponse } from '../../../../types/workflow.types'

export type ViewState =
  | { view: 'phase0-select'; url: string; stopAtIndex: number }
  | { view: 'phase0-running'; current: number; total: number }
  | { view: 'phase1'; state: ReRecordStateResponse }
  | { view: 'recording' }
  | { view: 'phase2'; state: ReRecordStateResponse }
  | { view: 'commit'; candidates: Array<WorkflowStep & { _origin: 'original' | 'recorded' }>; excluded: Set<string> }
  | { view: 'error'; state: ReRecordStateResponse }
