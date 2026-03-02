/**
 * M0 POC: Playwright codegen 단독 검증
 * 실행: node poc-codegen.mjs
 *
 * 검증 항목:
 * 1. PWDEBUG=0 으로 Inspector 숨김 여부
 * 2. 브라우저 닫기 후 output 파일 생성 여부
 * 3. 생성된 .ts 파일 내용 (파서 패턴 검증)
 */

import { spawn } from 'child_process'
import { tmpdir } from 'os'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const tmpFile = join(tmpdir(), `recordflow-poc-${Date.now()}.ts`)
const url = 'https://example.com'

console.log('[POC] tmpFile:', tmpFile)
console.log('[POC] spawning playwright codegen...')
console.log('[POC] 브라우저가 열리면 동작을 기록하고 닫아주세요.\n')

const proc = spawn('npx', ['playwright', 'codegen', '--output', tmpFile, url], {
  env: { ...process.env, PWDEBUG: '0' },
  stdio: 'inherit',
  shell: true
})

proc.on('error', (err) => {
  console.error('[POC] spawn error:', err.message)
  console.error('[POC] playwright가 설치되어 있는지 확인: npx playwright --version')
})

proc.on('close', (code) => {
  console.log('\n[POC] process exited with code:', code)

  if (existsSync(tmpFile)) {
    const content = readFileSync(tmpFile, 'utf-8')
    console.log('[POC] ✅ output file generated!')
    console.log('[POC] file content:\n')
    console.log('─'.repeat(60))
    console.log(content)
    console.log('─'.repeat(60))
  } else {
    console.log('[POC] ⚠️  output file not found (no actions recorded or file path issue)')
  }
})
