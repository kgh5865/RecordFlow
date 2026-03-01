import type { WorkflowStep } from '../../types/workflow.types'

export const ipc = {
  startCodegen: (url: string) => window.electronAPI.startCodegen(url),
  stopCodegen: () => window.electronAPI.stopCodegen(),
  startRunner: (steps: WorkflowStep[]) => window.electronAPI.startRunner(steps),
  removeAllListeners: (channel: string) => window.electronAPI.removeAllListeners(channel)
}
