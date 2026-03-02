import { useEffect } from 'react'
import { AppLayout } from './components/layout/AppLayout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useWorkflowStore } from './stores/workflowStore'
import { useScheduleStore } from './stores/scheduleStore'
import { useSettingsStore } from './stores/settingsStore'
import { useIpc } from './hooks/useIpc'

export default function App() {
  const loadFromStorage = useWorkflowStore((s) => s.loadFromStorage)
  const loadSchedules = useScheduleStore((s) => s.loadSchedules)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const applyRunEvent = useScheduleStore((s) => s.applyRunEvent)

  useIpc()

  useEffect(() => {
    loadFromStorage()
    loadSchedules()
    loadSettings()

    // 스케줄 실행 이벤트 구독 (Main → Renderer 푸시)
    window.electronAPI.onScheduleRunEvent((log) => {
      applyRunEvent(log)
    })
  }, [loadFromStorage, loadSchedules, loadSettings, applyRunEvent])

  return (
    <ErrorBoundary>
      <AppLayout />
    </ErrorBoundary>
  )
}
