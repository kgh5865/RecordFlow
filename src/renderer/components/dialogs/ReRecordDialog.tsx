import { useMemo } from 'react'
import { useUiStore } from '../../stores/uiStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { Dialog } from './_Dialog'
import { useReRecordSession } from './rerecord/useReRecordSession'
import { Phase0SelectPanel } from './rerecord/Phase0SelectPanel'
import { Phase0RunningPanel } from './rerecord/Phase0RunningPanel'
import { Phase1Panel } from './rerecord/Phase1Panel'
import { RecordingPanel } from './rerecord/RecordingPanel'
import { Phase2Panel } from './rerecord/Phase2Panel'
import { ErrorPanel } from './rerecord/ErrorPanel'
import { CommitPanel } from './rerecord/CommitPanel'

export function ReRecordDialog() {
  const { dialog, closeDialog } = useUiStore()
  const workflows = useWorkflowStore((s) => s.workflows)
  const replaceWorkflowSteps = useWorkflowStore((s) => s.replaceWorkflowSteps)

  const workflow = useMemo(() => {
    if (dialog.type !== 're-record') return null
    return workflows.find((w) => w.id === dialog.targetWorkflowId) ?? null
  }, [dialog, workflows])

  const originalSteps = workflow?.steps ?? []
  const session = useReRecordSession(originalSteps)

  if (dialog.type !== 're-record') { closeDialog(); return null }
  if (!workflow) { closeDialog(); return null }

  const handleCancel = async () => {
    if (session.view.view !== 'phase0-select') {
      try { await session.cancel() } catch { /* noop */ }
    }
    closeDialog()
  }

  const handleSave = async () => {
    if (session.view.view !== 'commit') return
    const excluded = session.view.excluded
    const finalSteps = session.view.candidates
      .filter((s) => !excluded.has(s.id))
      .map((s, i) => {
        const { _origin, id: _oldId, ...rest } = s
        return { ...rest, id: crypto.randomUUID(), order: i }
      })
    replaceWorkflowSteps(workflow.id, finalSteps)
    try { await session.finalize() } catch { /* noop */ }
    closeDialog()
  }

  const v = session.view

  return (
    <Dialog title={`Re-record: ${dialog.workflowName}`} onClose={handleCancel}>
      {v.view === 'phase0-select' && (
        <Phase0SelectPanel
          workflowName={dialog.workflowName}
          originalSteps={originalSteps}
          url={v.url}
          stopAtIndex={v.stopAtIndex}
          onUrlChange={session.updateSelectUrl}
          onStopAtChange={session.updateSelectStopAt}
          onStart={() => session.start(v.url, v.stopAtIndex, workflow.id)}
          onCancel={handleCancel}
        />
      )}
      {v.view === 'phase0-running' && (
        <Phase0RunningPanel current={v.current} total={v.total} onCancel={handleCancel} />
      )}
      {v.view === 'phase1' && (
        <Phase1Panel state={v.state} onNext={session.next} onRecord={session.startRec} onCancel={handleCancel} />
      )}
      {v.view === 'recording' && (
        <RecordingPanel onStop={session.stopRec} onCancel={handleCancel} />
      )}
      {v.view === 'phase2' && (
        <Phase2Panel state={v.state} onInclude={session.include} onIncludeAll={session.includeAll} onSkip={session.skip} onRecord={session.startRec} onCancel={handleCancel} />
      )}
      {v.view === 'error' && (
        <ErrorPanel state={v.state} onRetry={session.retry} onRecord={session.startRec} onCancel={handleCancel} />
      )}
      {v.view === 'commit' && (
        <CommitPanel candidates={v.candidates} excluded={v.excluded} onToggle={session.toggleExcluded} onSave={handleSave} onCancel={handleCancel} />
      )}
    </Dialog>
  )
}
