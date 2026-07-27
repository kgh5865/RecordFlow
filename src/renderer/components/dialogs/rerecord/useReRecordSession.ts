import { useEffect, useState, useCallback } from 'react'
import { ipc } from '../../../services/ipc.service'
import type { ViewState } from './types'
import type { WorkflowStep } from '../../../../types/workflow.types'

export function useReRecordSession(originalSteps: WorkflowStep[]) {
  const [view, setView] = useState<ViewState>({
    view: 'phase0-select',
    url: originalSteps[0]?.action === 'navigate' && originalSteps[0].url ? originalSteps[0].url : 'https://',
    stopAtIndex: originalSteps.length - 1
  })

  useEffect(() => {
    window.electronAPI.onReRecordAutoProgress((evt) => {
      setView((v) => v.view === 'phase0-running' ? { view: 'phase0-running', current: evt.current, total: evt.total } : v)
    })
    window.electronAPI.onReRecordSessionEnded((evt) => {
      if (evt.reason !== 'cancelled') {
        setView({ view: 'error', state: { phase: 'error', cursor: 0, totalOriginal: originalSteps.length, lastError: { stepIndex: 0, message: evt.message ?? evt.reason } } })
      }
    })
    return () => {
      ipc.removeAllListeners('re-record:auto-progress')
      ipc.removeAllListeners('re-record:session-ended')
    }
  }, [originalSteps.length])

  const loadCommit = useCallback(async () => {
    const { finalSteps } = await ipc.rrGetCommitCandidates()
    setView({ view: 'commit', candidates: finalSteps, excluded: new Set() })
  }, [])

  const applyState = useCallback((state: import('../../../../types/workflow.types').ReRecordStateResponse) => {
    if (state.phase === 'phase1') setView({ view: 'phase1', state })
    else if (state.phase === 'phase2') setView({ view: 'phase2', state })
    else if (state.phase === 'commit') void loadCommit()
    else if (state.phase === 'error') setView({ view: 'error', state })
    else if (state.phase === 'recording') setView({ view: 'recording' })
  }, [loadCommit])

  const start = useCallback(async (url: string, stopAtIndex: number, workflowId: string) => {
    setView({ view: 'phase0-running', current: 0, total: stopAtIndex + 1 })
    const state = await ipc.rrStart({ workflowId, url, stopAtIndex })
    if (stopAtIndex === -1) {
      const recState = await ipc.rrStartRecording()
      applyState(recState)
    } else {
      applyState(state)
    }
  }, [applyState])

  const next = useCallback(async () => applyState(await ipc.rrNext()), [applyState])
  const startRec = useCallback(async () => applyState(await ipc.rrStartRecording()), [applyState])
  const stopRec = useCallback(async () => applyState(await ipc.rrStopRecording()), [applyState])
  const include = useCallback(async () => applyState(await ipc.rrInclude()), [applyState])
  const includeAll = useCallback(async () => applyState(await ipc.rrIncludeAll()), [applyState])
  const skip = useCallback(async () => applyState(await ipc.rrSkip()), [applyState])
  const retry = useCallback(async () => applyState(await ipc.rrRetry()), [applyState])
  const cancel = useCallback(async () => { await ipc.rrCancel() }, [])
  const finalize = useCallback(async () => { await ipc.rrFinalize() }, [])

  const toggleExcluded = useCallback((stepId: string) => {
    setView((v) => {
      if (v.view !== 'commit') return v
      const next = new Set(v.excluded)
      if (next.has(stepId)) next.delete(stepId); else next.add(stepId)
      return { ...v, excluded: next }
    })
  }, [])

  const updateSelectStopAt = useCallback((stopAtIndex: number) => {
    setView((v) => v.view === 'phase0-select' ? { ...v, stopAtIndex } : v)
  }, [])

  const updateSelectUrl = useCallback((url: string) => {
    setView((v) => v.view === 'phase0-select' ? { ...v, url } : v)
  }, [])

  return {
    view, setView,
    start, next, startRec, stopRec, include, includeAll, skip, retry, cancel, finalize,
    toggleExcluded, updateSelectStopAt, updateSelectUrl
  }
}
