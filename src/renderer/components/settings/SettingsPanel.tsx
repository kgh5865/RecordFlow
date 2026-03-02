import { useSettingsStore } from '../../stores/settingsStore'
import { useUiStore } from '../../stores/uiStore'
import { OtpSection } from './OtpSection'

function BackgroundModeSection({ backgroundMode, onToggle }: { backgroundMode: boolean; onToggle: () => void }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold text-[#888] uppercase tracking-wider mb-3">실행</h3>

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="text-[13px] text-[#cccccc] mb-1">백그라운드 실행</div>
          <div className="text-[11px] text-[#666] leading-relaxed">
            창 닫기(✕) 시 앱을 종료하는 대신 시스템 트레이로 최소화합니다.
            예약 스케줄이 계속 동작합니다.
          </div>
          {backgroundMode && (
            <div className="text-[10px] text-[#4caf50] mt-1">
              ● 트레이 아이콘으로 앱을 열거나 종료할 수 있습니다.
            </div>
          )}
        </div>
        <button
          onClick={onToggle}
          className={`shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            backgroundMode ? 'bg-[#4caf50]' : 'bg-[#3c3c3c]'
          }`}
          role="switch"
          aria-checked={backgroundMode}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              backgroundMode ? 'translate-x-[18px]' : 'translate-x-[3px]'
            }`}
          />
        </button>
      </div>

      {!backgroundMode && (
        <div className="mt-3 text-[11px] text-[#666] bg-[#2a2a2a] rounded p-2">
          ※ OFF 상태에서 활성 스케줄이 있는 경우 창 닫기 시 경고가 표시됩니다.
        </div>
      )}
    </section>
  )
}

export function SettingsPanel() {
  const { settings, saveSettings } = useSettingsStore()
  const setSettingsPanelOpen = useUiStore((s) => s.setSettingsPanelOpen)

  const handleToggleBackground = async () => {
    await saveSettings({ ...settings, backgroundMode: !settings.backgroundMode })
  }

  return (
    <div className="flex-1 flex flex-col bg-[#1e1e1e] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#3c3c3c] shrink-0">
        <span className="text-sm font-medium text-[#cccccc]">설정</span>
        <button
          onClick={() => setSettingsPanelOpen(false)}
          className="text-[#666] hover:text-[#ccc] transition-colors"
          title="닫기"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <BackgroundModeSection
          backgroundMode={settings.backgroundMode}
          onToggle={handleToggleBackground}
        />
        <OtpSection />
      </div>
    </div>
  )
}
