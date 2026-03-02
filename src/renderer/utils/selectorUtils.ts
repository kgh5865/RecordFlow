import type { WorkflowStep } from '../../types/workflow.types'

/** plain CSS selector를 locator()로 래핑 */
export function normalizeSelector(input: string): string {
  const trimmed = input.trim()
  if (trimmed.startsWith('getBy') || trimmed.startsWith('locator(')) return trimmed
  return `locator('${trimmed.replace(/'/g, "\\'")}')`
}

/** 편집된 selector/url로 rawLine 재구성 */
export function rebuildRawLine(step: WorkflowStep, newSelector?: string, newUrl?: string): string {
  const selector = newSelector ?? step.selector
  const url = newUrl ?? step.url
  const value = step.value ?? ''

  switch (step.action) {
    case 'navigate':
      return `page.goto('${url}')`
    case 'click':
      return `page.${selector}.click()`
    case 'fill':
      return `page.${selector}.fill('${value}')`
    case 'select':
      return `page.${selector}.selectOption('${value}')`
    case 'expect':
      if (url) return `expect(page).toHaveURL('${url}')`
      return `expect(page.${selector}).toBeVisible()`
    case 'wait':
      return `page.waitForSelector('${selector}')`
    default:
      return step.rawLine ?? ''
  }
}
