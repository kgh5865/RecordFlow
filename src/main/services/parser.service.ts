import type { ActionType, WorkflowStep } from '../../types/workflow.types'

// Playwright codegen이 생성하는 locator 유형 (우선순위 순)
// getByRole > getByLabel > getByPlaceholder > getByText > getByTestId > locator(css) > locator(xpath)
const LOCATOR = `(?:locator|getByRole|getByText|getByLabel|getByPlaceholder|getByTestId|getByAltText|getByTitle)`

interface Pattern {
  action: ActionType
  regex: RegExp
  extract: (m: RegExpMatchArray) => Partial<WorkflowStep>
}

const PATTERNS: Pattern[] = [
  {
    // page.goto('url')
    action: 'navigate',
    regex: /page\.goto\(['"`](.+?)['"`]\)/,
    extract: (m) => ({ url: m[1] })
  },
  {
    // page.getByRole(...).click() | page.locator(...).click()
    // 메서드명 포함 전체 locator 표현식을 캡처: getByRole('button', { name: '...' })
    action: 'click',
    regex: new RegExp(`page\\.(${LOCATOR}\\(.+?\\))\\.click\\(\\)`),
    extract: (m) => ({ selector: m[1] })
  },
  {
    // page.getByLabel(...).fill('value') | page.locator(...).fill('value')
    action: 'fill',
    regex: new RegExp(`page\\.(${LOCATOR}\\(.+?\\))\\.fill\\(['"\`](.+?)['"\`]\\)`),
    extract: (m) => ({ selector: m[1], value: m[2] })
  },
  {
    // page.getByLabel(...).selectOption('value')
    action: 'select',
    regex: new RegExp(`page\\.(${LOCATOR}\\(.+?\\))\\.selectOption\\(['"\`](.+?)['"\`]\\)`),
    extract: (m) => ({ selector: m[1], value: m[2] })
  },
  {
    // expect(page).toHaveURL('url')
    action: 'expect',
    regex: /expect\(page\)\.toHaveURL\(['"`](.+?)['"`]\)/,
    extract: (m) => ({ url: m[1] })
  },
  {
    // expect(page.getByRole(...)).toBeVisible() 등 엘리먼트 assertion
    action: 'expect',
    regex: new RegExp(`expect\\(page\\.(${LOCATOR}\\(.+?\\))\\)\\.to\\w+\\(.*?\\)`),
    extract: (m) => ({ selector: m[1] })
  },
  {
    // page.waitForSelector('selector')
    action: 'wait',
    regex: /page\.waitForSelector\(['"`](.+?)['"`]\)/,
    extract: (m) => ({ selector: m[1] })
  },
  {
    // page.getByRole(...).press('Enter') | page.locator(...).press('Enter')
    action: 'press',
    regex: new RegExp(`page\\.(${LOCATOR}\\(.+?\\))\\.press\\(['"\`](.+?)['"\`]\\)`),
    extract: (m) => ({ selector: m[1], value: m[2] })
  },
  {
    // page.keyboard.press('Enter')
    action: 'press',
    regex: /page\.keyboard\.press\(['"`](.+?)['"`]\)/,
    extract: (m) => ({ value: m[1] })
  }
]

export function parse(tsCode: string): WorkflowStep[] {
  const steps: WorkflowStep[] = []
  const lines = tsCode.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    // page. 또는 expect( 로 시작하는 라인만 처리
    if (!trimmed.includes('page.') && !trimmed.startsWith('expect(')) continue

    for (const pattern of PATTERNS) {
      const match = trimmed.match(pattern.regex)
      if (match) {
        const extracted = pattern.extract(match)
        steps.push({
          id: crypto.randomUUID(),
          order: steps.length,
          action: pattern.action,
          rawLine: trimmed.replace(/^await\s+/, '').replace(/;$/, ''),
          ...extracted
        })
        break // 한 라인에 하나의 패턴만 적용
      }
    }
  }

  return steps
}
