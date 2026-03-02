import { Toolbar } from './Toolbar'
import { WorkflowPanel } from './WorkflowPanel'
import { StepPanel } from './StepPanel'
import { ScheduleDetail } from '../schedule/ScheduleDetail'
import { SettingsPanel } from '../settings/SettingsPanel'
import { RunResultToast } from './RunResultToast'
import { useUiStore } from '../../stores/uiStore'

export function AppLayout() {
  const { activeLeftTab, settingsPanelOpen } = useUiStore()

  return (
    <div className="flex flex-col h-screen bg-[#1e1e1e] text-[#d4d4d4]">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <WorkflowPanel />
        {settingsPanelOpen
          ? <SettingsPanel />
          : activeLeftTab === 'schedules'
            ? <ScheduleDetail />
            : <StepPanel />
        }
      </div>
      <RunResultToast />
    </div>
  )
}
