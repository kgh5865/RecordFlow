import { create } from 'zustand'
import type { AppSettings } from '../../types/workflow.types'

interface SettingsState {
  settings: AppSettings
  loadSettings: () => Promise<void>
  saveSettings: (s: AppSettings) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: { backgroundMode: false, otpProfiles: [] },

  loadSettings: async () => {
    const settings = await window.electronAPI.getSettings()
    set({ settings })
  },

  saveSettings: async (s) => {
    await window.electronAPI.saveSettings(s)
    set({ settings: s })
  }
}))
