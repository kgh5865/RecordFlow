import { create } from 'zustand'
import type { WorkflowFolder, Workflow, WorkflowStep, StorageData, WorkflowExportFile } from '../../types/workflow.types'
import { isSensitiveStep } from '../../types/sensitive'

interface WorkflowState {
  folders: WorkflowFolder[]
  workflows: Workflow[]

  // 스냅샷: 스텝 편집 전 원본 워크플로우 상태
  _snapshots: Record<string, Workflow>
  // 미저장 변경이 있는 워크플로우 ID 목록
  dirtyWorkflowIds: string[]

  // Folder
  createFolder: (name: string, parentId?: string) => void
  deleteFolder: (id: string) => void
  renameFolder: (id: string, name: string) => void

  // Workflow
  createWorkflow: (name: string, folderId: string, steps?: WorkflowStep[]) => Workflow
  deleteWorkflow: (id: string) => void
  renameWorkflow: (id: string, name: string) => void
  moveWorkflow: (id: string, targetFolderId: string) => void
  updateSteps: (workflowId: string, steps: WorkflowStep[]) => void

  // Step
  addStep: (workflowId: string, step: Omit<WorkflowStep, 'id' | 'order'>) => void
  updateStep: (workflowId: string, stepId: string, patch: Partial<WorkflowStep>) => void
  deleteStep: (workflowId: string, stepId: string) => void
  moveStepUp: (workflowId: string, stepId: string) => void
  moveStepDown: (workflowId: string, stepId: string) => void

  // 저장 / 되돌리기
  saveWorkflow: (workflowId: string) => Promise<void>
  discardWorkflow: (workflowId: string) => void
  isDirty: (workflowId: string) => boolean

  // Workflow File Sharing
  importWorkflow: (file: WorkflowExportFile, folderId: string) => void

  // Storage
  loadFromStorage: () => Promise<void>
  persistToStorage: () => Promise<void>
}

function reorder(steps: WorkflowStep[]): WorkflowStep[] {
  return steps.map((s, i) => ({ ...s, order: i }))
}

/** 워크플로우를 dirty로 마킹하고, 최초 편집 시 스냅샷을 저장 */
function markDirty(get: () => WorkflowState, set: (fn: (s: WorkflowState) => Partial<WorkflowState>) => void, workflowId: string) {
  const { _snapshots, dirtyWorkflowIds, workflows } = get()
  if (!_snapshots[workflowId]) {
    const original = workflows.find((w) => w.id === workflowId)
    if (original) {
      set(() => ({
        _snapshots: { ..._snapshots, [workflowId]: structuredClone(original) },
        dirtyWorkflowIds: dirtyWorkflowIds.includes(workflowId) ? dirtyWorkflowIds : [...dirtyWorkflowIds, workflowId]
      }))
      return
    }
  }
  if (!dirtyWorkflowIds.includes(workflowId)) {
    set(() => ({ dirtyWorkflowIds: [...dirtyWorkflowIds, workflowId] }))
  }
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  folders: [],
  workflows: [],
  _snapshots: {},
  dirtyWorkflowIds: [],

  createFolder: (name, parentId) => {
    const folder: WorkflowFolder = {
      id: crypto.randomUUID(),
      name,
      ...(parentId ? { parentId } : {}),
      createdAt: new Date().toISOString()
    }
    set((s) => ({ folders: [...s.folders, folder] }))
    get().persistToStorage()
  },

  deleteFolder: (id) => {
    // id와 모든 하위 폴더 id를 재귀적으로 수집
    const getAllDescendantIds = (rootId: string, folders: WorkflowFolder[]): string[] => {
      const children = folders.filter((f) => f.parentId === rootId)
      return [rootId, ...children.flatMap((c) => getAllDescendantIds(c.id, folders))]
    }
    set((s) => {
      const toDelete = new Set(getAllDescendantIds(id, s.folders))
      return {
        folders: s.folders.filter((f) => !toDelete.has(f.id)),
        workflows: s.workflows.filter((w) => !toDelete.has(w.folderId))
      }
    })
    get().persistToStorage()
  },

  renameFolder: (id, name) => {
    set((s) => ({
      folders: s.folders.map((f) => (f.id === id ? { ...f, name } : f))
    }))
    get().persistToStorage()
  },

  createWorkflow: (name, folderId, steps = []) => {
    const now = new Date().toISOString()
    const workflow: Workflow = {
      id: crypto.randomUUID(),
      name,
      folderId,
      createdAt: now,
      updatedAt: now,
      steps: reorder(steps)
    }
    set((s) => ({ workflows: [...s.workflows, workflow] }))
    get().persistToStorage()
    return workflow
  },

  deleteWorkflow: (id) => {
    set((s) => ({ workflows: s.workflows.filter((w) => w.id !== id) }))
    get().persistToStorage()
  },

  renameWorkflow: (id, name) => {
    set((s) => ({
      workflows: s.workflows.map((w) =>
        w.id === id ? { ...w, name, updatedAt: new Date().toISOString() } : w
      )
    }))
    get().persistToStorage()
  },

  moveWorkflow: (id, targetFolderId) => {
    set((s) => ({
      workflows: s.workflows.map((w) =>
        w.id === id ? { ...w, folderId: targetFolderId, updatedAt: new Date().toISOString() } : w
      )
    }))
    get().persistToStorage()
  },

  updateSteps: (workflowId, steps) => {
    markDirty(get, set, workflowId)
    set((s) => ({
      workflows: s.workflows.map((w) =>
        w.id === workflowId
          ? { ...w, steps: reorder(steps), updatedAt: new Date().toISOString() }
          : w
      )
    }))
  },

  updateStep: (workflowId, stepId, patch) => {
    markDirty(get, set, workflowId)
    set((s) => ({
      workflows: s.workflows.map((w) => {
        if (w.id !== workflowId) return w
        return {
          ...w,
          steps: w.steps.map((s) => s.id === stepId ? { ...s, ...patch } : s),
          updatedAt: new Date().toISOString()
        }
      })
    }))
  },

  addStep: (workflowId, step) => {
    markDirty(get, set, workflowId)
    set((s) => ({
      workflows: s.workflows.map((w) => {
        if (w.id !== workflowId) return w
        const newStep: WorkflowStep = { ...step, id: crypto.randomUUID(), order: w.steps.length }
        return { ...w, steps: [...w.steps, newStep], updatedAt: new Date().toISOString() }
      })
    }))
  },

  deleteStep: (workflowId, stepId) => {
    markDirty(get, set, workflowId)
    set((s) => ({
      workflows: s.workflows.map((w) => {
        if (w.id !== workflowId) return w
        return {
          ...w,
          steps: reorder(w.steps.filter((s) => s.id !== stepId)),
          updatedAt: new Date().toISOString()
        }
      })
    }))
  },

  moveStepUp: (workflowId, stepId) => {
    markDirty(get, set, workflowId)
    set((s) => ({
      workflows: s.workflows.map((w) => {
        if (w.id !== workflowId) return w
        const idx = w.steps.findIndex((s) => s.id === stepId)
        if (idx <= 0) return w
        const steps = [...w.steps]
        ;[steps[idx - 1], steps[idx]] = [steps[idx], steps[idx - 1]]
        return { ...w, steps: reorder(steps), updatedAt: new Date().toISOString() }
      })
    }))
  },

  moveStepDown: (workflowId, stepId) => {
    markDirty(get, set, workflowId)
    set((s) => ({
      workflows: s.workflows.map((w) => {
        if (w.id !== workflowId) return w
        const idx = w.steps.findIndex((s) => s.id === stepId)
        if (idx < 0 || idx >= w.steps.length - 1) return w
        const steps = [...w.steps]
        ;[steps[idx], steps[idx + 1]] = [steps[idx + 1], steps[idx]]
        return { ...w, steps: reorder(steps), updatedAt: new Date().toISOString() }
      })
    }))
  },

  saveWorkflow: async (workflowId) => {
    const { _snapshots, dirtyWorkflowIds } = get()
    const newSnapshots = { ..._snapshots }
    delete newSnapshots[workflowId]
    set(() => ({
      _snapshots: newSnapshots,
      dirtyWorkflowIds: dirtyWorkflowIds.filter((id) => id !== workflowId)
    }))
    await get().persistToStorage()
  },

  discardWorkflow: (workflowId) => {
    const { _snapshots, dirtyWorkflowIds } = get()
    const snapshot = _snapshots[workflowId]
    if (!snapshot) return

    const newSnapshots = { ..._snapshots }
    delete newSnapshots[workflowId]

    set((s) => ({
      workflows: s.workflows.map((w) => (w.id === workflowId ? snapshot : w)),
      _snapshots: newSnapshots,
      dirtyWorkflowIds: dirtyWorkflowIds.filter((id) => id !== workflowId)
    }))
  },

  isDirty: (workflowId) => {
    return get().dirtyWorkflowIds.includes(workflowId)
  },

  importWorkflow: (file, folderId) => {
    const { workflows } = get()
    const sameFolderNames = workflows
      .filter((w) => w.folderId === folderId)
      .map((w) => w.name)

    // 이름 중복 처리: "(2)", "(3)" 자동 추가
    let resolvedName = file.workflow.name
    let counter = 2
    while (sameFolderNames.includes(resolvedName)) {
      resolvedName = `${file.workflow.name} (${counter})`
      counter++
    }

    const now = new Date().toISOString()
    const steps: WorkflowStep[] = file.workflow.steps.map((s, i) => {
      const sensitive = s.action === 'fill' && isSensitiveStep(s.selector, s.value)
      return {
        id: crypto.randomUUID(),
        order: i,
        action: s.action,
        ...(s.selector !== undefined ? { selector: s.selector } : {}),
        ...(s.value !== undefined ? { value: s.value } : {}),
        ...(s.url !== undefined ? { url: s.url } : {}),
        ...(s.rawLine !== undefined ? { rawLine: s.rawLine } : {}),
        ...(sensitive ? { isSensitive: true } : {}),
      }
    })

    const workflow: Workflow = {
      id: crypto.randomUUID(),
      name: resolvedName,
      folderId,
      createdAt: now,
      updatedAt: now,
      steps,
    }
    set((s) => ({ workflows: [...s.workflows, workflow] }))
    get().persistToStorage()
  },

  loadFromStorage: async () => {
    const data: StorageData = await window.electronAPI.loadStorage()
    // 기존 워크플로우의 isSensitive 플래그 자동 감지 (마이그레이션)
    const workflows = data.workflows.map((w) => ({
      ...w,
      steps: w.steps.map((s) => {
        if (s.isSensitive !== undefined) return s
        if (s.action === 'fill' && isSensitiveStep(s.selector, s.value)) {
          return { ...s, isSensitive: true }
        }
        return s
      })
    }))
    set({ folders: data.folders, workflows, _snapshots: {}, dirtyWorkflowIds: [] })
  },

  persistToStorage: async () => {
    const { folders, workflows } = get()
    // schedules는 Main 프로세스에서 merge하므로 빈 배열로 전달
    // (main/index.ts의 storage:save 핸들러가 기존 schedules를 보존)
    await window.electronAPI.saveStorage({ version: '1.0', folders, workflows, schedules: [], scheduleFolders: [] })
  }
}))
