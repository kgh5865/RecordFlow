import { create } from 'zustand'
import type { WorkflowExportFile, WorkflowStep } from '../../types/workflow.types'

export type LeftTab = 'workflows' | 'schedules'

// Discriminated union — 각 다이얼로그 타입별로 필요한 필드가 명확히 정의됨
export type DialogState =
  | { type: null }
  | { type: 'new-folder' }
  | { type: 'new-workflow'; targetFolderId?: string; currentName?: string }
  | { type: 'rename-folder'; targetFolderId: string; currentName: string }
  | { type: 'rename-workflow'; targetWorkflowId: string; currentName: string }
  | { type: 'move-workflow'; targetWorkflowId: string }
  | { type: 'import-workflow'; file: WorkflowExportFile }
  | { type: 'edit-value'; workflowId: string; stepId: string; step: WorkflowStep }
  | { type: 're-record'; targetWorkflowId: string; workflowName: string }

export interface ToastState {
  message: string
  variant: 'success' | 'error'
}

interface UiState {
  selectedWorkflowId: string | null
  selectedFolderId: string | null
  expandedFolderIds: string[]

  dialog: DialogState

  // Runner 상태
  runningWorkflowId: string | null
  currentStepIndex: number | null
  lastRunResult: { success: boolean; error?: string; completedSteps: number; workflowId?: string } | null

  // Toast
  toast: ToastState | null
  showToast: (message: string, variant: 'success' | 'error') => void
  clearToast: () => void

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

  openDialog: (dialog: Exclude<DialogState, { type: null }>) => void
  closeDialog: () => void

  setRunning: (workflowId: string | null, stepIndex: number | null) => void
  setRunResult: (result: UiState['lastRunResult']) => void
}

export const useUiStore = create<UiState>((set) => ({
  selectedWorkflowId: null,
  selectedFolderId: null,
  expandedFolderIds: [],

  dialog: { type: null },

  toast: null,
  showToast: (message, variant) => {
    set({ toast: { message, variant } })
    setTimeout(() => set({ toast: null }), 3000)
  },
  clearToast: () => set({ toast: null }),

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

  openDialog: (dialog) => set({ dialog }),

  closeDialog: () => set({ dialog: { type: null } }),

  setRunning: (workflowId, stepIndex) =>
    set({ runningWorkflowId: workflowId, currentStepIndex: stepIndex }),

  setRunResult: (result) => set({ lastRunResult: result })
}))
