import type {
  WorkflowStep,
  ReRecordStartRequest,
  ReRecordStateResponse,
  ReRecordStopRecordingResponse,
  ReRecordCommitResponse
} from '../../types/workflow.types'

export const ipc = {
  startCodegen: (url: string) => window.electronAPI.startCodegen(url),
  stopCodegen: () => window.electronAPI.stopCodegen(),
  startRunner: (steps: WorkflowStep[]) => window.electronAPI.startRunner(steps),
  removeAllListeners: (channel: string) => window.electronAPI.removeAllListeners(channel),

  // Re-record
  rrStart: (req: ReRecordStartRequest): Promise<ReRecordStateResponse> =>
    window.electronAPI.reRecordStart(req),
  rrNext: (): Promise<ReRecordStateResponse> =>
    window.electronAPI.reRecordNext(),
  rrStartRecording: (): Promise<ReRecordStateResponse> =>
    window.electronAPI.reRecordStartRecording(),
  rrStopRecording: (): Promise<ReRecordStopRecordingResponse> =>
    window.electronAPI.reRecordStopRecording(),
  rrInclude: (): Promise<ReRecordStateResponse> =>
    window.electronAPI.reRecordInclude(),
  rrIncludeAll: (): Promise<ReRecordStateResponse> =>
    window.electronAPI.reRecordIncludeAll(),
  rrSkip: (): Promise<ReRecordStateResponse> =>
    window.electronAPI.reRecordSkip(),
  rrRetry: (): Promise<ReRecordStateResponse> =>
    window.electronAPI.reRecordRetry(),
  rrGetCommitCandidates: (): Promise<ReRecordCommitResponse> =>
    window.electronAPI.reRecordGetCommitCandidates(),
  rrFinalize: (): Promise<void> =>
    window.electronAPI.reRecordFinalize(),
  rrCancel: (): Promise<void> =>
    window.electronAPI.reRecordCancel(),
}
