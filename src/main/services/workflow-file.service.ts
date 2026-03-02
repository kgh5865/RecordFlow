import { dialog } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import type { Workflow, WorkflowStep, WorkflowStepExport, WorkflowExportFile } from '../../types/workflow.types'

// --- 민감 정보 감지 규칙 ---

interface SensitiveRule {
  pattern: RegExp
  type: string
  placeholder: string
}

const SENSITIVE_RULES: SensitiveRule[] = [
  // 비밀번호 / password
  { pattern: /password|passwd|pwd|비밀번호|패스워드/i,                        type: 'password', placeholder: '{{password}}' },
  // 아이디 / username
  { pattern: /username|userid|user_id|loginid|login.id|아이디|사용자명|사용자.?이름/i, type: 'username', placeholder: '{{username}}' },
  // 이메일 / email
  { pattern: /\bemail\b|이메일/i,                                             type: 'email',    placeholder: '{{email}}' },
  // OTP / 인증번호
  { pattern: /\botp\b|\btotp\b|\bmfa\b|\b2fa\b|일회용|인증번호/i,            type: 'otp',      placeholder: '{{otp}}' },
  // id (영문 단독)
  { pattern: /(?:^|[\s[#"'=])(id)(?:[\s\]"'=]|$)/i,                         type: 'id',       placeholder: '{{id}}' },
]

const OTP_TOKEN_PATTERN = /^\{\{otp:\s*.+?\s*\}\}$/

function detectSensitive(selector: string | undefined, value: string | undefined): SensitiveRule | null {
  // OTP 토큰 값은 selector 무관하게 항상 마스킹
  if (value && OTP_TOKEN_PATTERN.test(value)) {
    return { pattern: OTP_TOKEN_PATTERN, type: 'otp', placeholder: '{{otp}}' }
  }
  if (!selector) return null
  for (const rule of SENSITIVE_RULES) {
    if (rule.pattern.test(selector)) return rule
  }
  return null
}

// --- 스텝 마스킹 ---

export function maskSensitiveSteps(steps: WorkflowStep[]): WorkflowStepExport[] {
  return steps.map((step) => {
    const base: WorkflowStepExport = {
      order: step.order,
      action: step.action,
      ...(step.selector !== undefined ? { selector: step.selector } : {}),
      ...(step.value !== undefined ? { value: step.value } : {}),
      ...(step.url !== undefined ? { url: step.url } : {}),
      ...(step.rawLine !== undefined ? { rawLine: step.rawLine } : {}),
    }

    if (step.action === 'fill') {
      const rule = detectSensitive(step.selector, step.value)
      if (rule) {
        return {
          ...base,
          value: rule.placeholder,
          rawLine: undefined,  // 원본 실행 코드에서 값 노출 방지
          _masked: true as const,
          _sensitiveType: rule.type,
        }
      }
    }

    return base
  })
}

// --- Export ---

function buildExportFile(workflow: Workflow): WorkflowExportFile {
  return {
    rfworkflowVersion: '1.0',
    exportedAt: new Date().toISOString(),
    workflow: {
      name: workflow.name,
      steps: maskSensitiveSteps(workflow.steps),
    },
  }
}

export async function saveWorkflowToFile(workflow: Workflow): Promise<{ cancelled: boolean }> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '워크플로우 내보내기',
    defaultPath: `${workflow.name}.rfworkflow`,
    filters: [{ name: 'RecordFlow Workflow', extensions: ['rfworkflow'] }],
  })

  if (canceled || !filePath) return { cancelled: true }

  const exportFile = buildExportFile(workflow)
  await writeFile(filePath, JSON.stringify(exportFile, null, 2), 'utf-8')
  return { cancelled: false }
}

// --- Import ---

function validateExportFile(data: unknown): data is WorkflowExportFile {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  if (d.rfworkflowVersion !== '1.0') return false
  if (typeof d.exportedAt !== 'string') return false
  if (typeof d.workflow !== 'object' || d.workflow === null) return false
  const wf = d.workflow as Record<string, unknown>
  if (typeof wf.name !== 'string' || !wf.name) return false
  if (!Array.isArray(wf.steps)) return false
  return true
}

export async function loadWorkflowFromFile(): Promise<{
  cancelled: boolean
  file?: WorkflowExportFile
  error?: string
}> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '워크플로우 가져오기',
    filters: [{ name: 'RecordFlow Workflow', extensions: ['rfworkflow'] }],
    properties: ['openFile'],
  })

  if (canceled || filePaths.length === 0) return { cancelled: true }

  try {
    const content = await readFile(filePaths[0], 'utf-8')
    const parsed = JSON.parse(content) as unknown

    if (!validateExportFile(parsed)) {
      return { cancelled: false, error: '유효하지 않은 워크플로우 파일입니다.' }
    }

    return { cancelled: false, file: parsed }
  } catch {
    return { cancelled: false, error: '파일을 읽을 수 없습니다.' }
  }
}
