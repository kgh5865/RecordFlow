import { create } from 'zustand'

export type LeftTab = 'workflows' | 'schedules'
type DialogType = 'new-workflow' | 'new-folder' | 'move-workflow' | 'rename-folder' | 'rename-workflow' | null

interface DialogState {
  type: DialogType
  targetFolderId?: string
  targetWorkflowId?: string
  currentName?: string
}

interface UiState {
  selectedWorkflowId: string | null
  selectedFolderId: string | null
  expandedFolderIds: string[]

  dialog: DialogState

  // Runner 상태
  runningWorkflowId: string | null
  currentStepIndex: number | null
  lastRunResult: { success: boolean; error?: string; completedSteps: number } | null

  // 탭 + 설정 패널
  activeLeftTab: LeftTab
  settingsPanelOpen: boolean
  setActiveLeftTab: (tab: LeftTab) => void
  setSettingsPanelOpen: (open: boolean) => void

  // 액션
  selectWorkflow: (id: string | null) => void
  selectFolder: (id: string | null) => void
  toggleFolder: (id: string) => void
  expandFolder: (id: string) => void

  openDialog: (type: Exclude<DialogType, null>, opts?: Omit<DialogState, 'type'>) => void
  closeDialog: () => void

  setRunning: (workflowId: string | null, stepIndex: number | null) => void
  setRunResult: (result: UiState['lastRunResult']) => void
}

export const useUiStore = create<UiState>((set) => ({
  selectedWorkflowId: null,
  selectedFolderId: null,
  expandedFolderIds: [],

  dialog: { type: null },

  runningWorkflowId: null,
  currentStepIndex: null,
  lastRunResult: null,

  activeLeftTab: 'workflows',
  settingsPanelOpen: false,
  setActiveLeftTab: (tab) => set({ activeLeftTab: tab }),
  setSettingsPanelOpen: (open) => set({ settingsPanelOpen: open }),

  selectWorkflow: (id) => set({ selectedWorkflowId: id }),

  selectFolder: (id) => set({ selectedFolderId: id }),

  toggleFolder: (id) =>
    set((s) => ({
      expandedFolderIds: s.expandedFolderIds.includes(id)
        ? s.expandedFolderIds.filter((x) => x !== id)
        : [...s.expandedFolderIds, id]
    })),

  expandFolder: (id) =>
    set((s) => ({
      expandedFolderIds: s.expandedFolderIds.includes(id)
        ? s.expandedFolderIds
        : [...s.expandedFolderIds, id]
    })),

  openDialog: (type, opts = {}) => set({ dialog: { type, ...opts } }),

  closeDialog: () => set({ dialog: { type: null } }),

  setRunning: (workflowId, stepIndex) =>
    set({ runningWorkflowId: workflowId, currentStepIndex: stepIndex }),

  setRunResult: (result) => set({ lastRunResult: result })
}))
