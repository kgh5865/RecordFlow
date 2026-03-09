import { useEffect } from 'react'
import { AppLayout } from './components/layout/AppLayout'
import { UpdateNotification } from './components/layout/UpdateNotification'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useWorkflowStore } from './stores/workflowStore'
import { useScheduleStore } from './stores/scheduleStore'
import { useSettingsStore } from './stores/settingsStore'
import { useIpc } from './hooks/useIpc'

export default function App() {
  useIpc()

  useEffect(() => {
    useWorkflowStore.getState().loadFromStorage()
    useScheduleStore.getState().loadSchedules()
    useScheduleStore.getState().loadScheduleFolders()
    useSettingsStore.getState().loadSettings()

    // 스케줄 실행 이벤트 구독 (Main → Renderer 푸시)
    window.electronAPI.onScheduleRunEvent((log) => {
      useScheduleStore.getState().applyRunEvent(log)
    })
  }, [])

  return (
    <ErrorBoundary>
      <AppLayout />
      <UpdateNotification />
    </ErrorBoundary>
  )
}
