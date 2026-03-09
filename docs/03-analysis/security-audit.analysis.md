# RecordFlow 보안 취약점 분석 보고서

**분석일**: 2026-03-09
**분석 대상**: RecordFlow v0.2.4
**분석 범위**: Electron 메인 프로세스, Preload, Renderer, 암호화, IPC 통신, 외부 프로세스 실행

---

## 요약

| 심각도 | 건수 |
|--------|------|
| Critical | 1 |
| High | 4 |
| Medium | 5 |
| Low | 4 |
| **합계** | **14** |

---

## Critical (즉시 수정 필요)

### SEC-01: `new Function`을 통한 코드 인젝션 (RCE)

- **심각도**: Critical
- **OWASP**: A03 Injection
- **위치**: `src/main/services/runner.service.ts:147`
- **코드**:
  ```typescript
  const fn = new Function('page', `return ${locatorExpr}`)
  return fn(page) as Locator
  ```
- **설명**: `rawLine` 필드에서 추출한 `locatorExpr` 문자열을 `new Function`으로 동적 실행합니다. 현재 `LOCATOR_FORBIDDEN` 블랙리스트(`eval`, `Function`, `require`, `import`, `process`, `global` 등)로 방어하고 있으나, **블랙리스트 기반 방어는 근본적으로 우회 가능합니다**.
  - 우회 예시 1: `page['constru' + 'ctor']` 같은 문자열 연결은 정규식을 피합니다.
  - 우회 예시 2: `page.locator(String.fromCharCode(...))`로 인코딩 우회
  - 우회 예시 3: 유니코드 이스케이프 `\u0065val`
  - 공격자가 `.rfworkflow` 파일을 조작하여 악성 `rawLine`을 삽입하면, 워크플로우 import 후 실행 시 **메인 프로세스에서 임의 코드가 실행**됩니다.
- **영향**: 메인 프로세스는 Node.js 전체 API에 접근 가능하므로, 파일 시스템 접근, 프로세스 실행, 네트워크 요청 등 **완전한 시스템 장악**이 가능합니다.
- **수정 방안**:
  1. **화이트리스트 기반 파서로 전환**: `rawLine`을 직접 실행하지 말고, 허용된 Playwright 메서드(`getByRole`, `getByText`, `locator`, `filter`, `first`, `last`, `nth`)만 파싱하여 순차적으로 호출하는 안전한 해석기를 구현합니다.
  2. 단기 대책: import된 워크플로우의 `rawLine`을 파싱하여 허용된 패턴(`page.getByRole(...)`, `page.locator(...)` 등)에 정확히 매칭되는지 AST 레벨에서 검증합니다.

---

## High (릴리스 전 수정 필요)

### SEC-02: `shell.openExternal` URL 검증 부재

- **심각도**: High
- **OWASP**: A03 Injection
- **위치**: `src/main/index.ts:113-114`
- **코드**:
  ```typescript
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  ```
- **설명**: 렌더러에서 `window.open()`으로 열리는 모든 URL을 검증 없이 `shell.openExternal`로 전달합니다. `file://`, `smb://`, `javascript:` 같은 프로토콜이나 악성 URL을 열 수 있습니다.
- **수정 방안**: `http:` / `https:` 프로토콜만 허용하는 화이트리스트 검증을 추가합니다.
  ```typescript
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url)
      }
    } catch { /* 무시 */ }
    return { action: 'deny' }
  })
  ```

### SEC-03: `sandbox: false` 설정

- **심각도**: High
- **OWASP**: A05 Security Misconfiguration
- **위치**: `src/main/index.ts:99`
- **코드**:
  ```typescript
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: false,
    contextIsolation: true,
    nodeIntegration: false
  }
  ```
- **설명**: `sandbox: false`로 설정되어 있어 렌더러 프로세스의 샌드박스가 비활성화됩니다. 렌더러에서 취약점(XSS 등)이 발생할 경우, 샌드박스 없이는 공격 범위가 확대됩니다. `contextIsolation: true`와 `nodeIntegration: false`가 일부 보호를 제공하지만, 샌드박스가 추가 방어 계층입니다.
- **수정 방안**: `sandbox: true`로 변경합니다. Preload 스크립트가 `contextBridge`만 사용하므로 샌드박스 활성화 후에도 정상 동작해야 합니다. 다만, Playwright의 `createRequire` 사용 등 메인 프로세스 코드와의 호환성 테스트가 필요합니다.

### SEC-04: `removeAllListeners` 채널명 미검증

- **심각도**: High
- **OWASP**: A01 Broken Access Control
- **위치**: `src/preload/index.ts:39-41`
- **코드**:
  ```typescript
  removeAllListeners: (channel: string): void => {
    ipcRenderer.removeAllListeners(channel)
  }
  ```
- **설명**: 임의의 채널명을 전달할 수 있어, 렌더러 측 코드가 Electron 내부 채널의 리스너도 제거할 수 있습니다. 악성 코드가 주입되면 업데이트 알림 등 중요 이벤트 리스너를 무력화할 수 있습니다.
- **수정 방안**: 허용된 채널명만 수락하도록 화이트리스트를 적용합니다.
  ```typescript
  const ALLOWED_CHANNELS = new Set([
    'codegen:complete', 'codegen:error',
    'runner:step-update', 'runner:complete',
    'schedule:run-event',
    'updater:update-available', 'updater:update-not-available',
    'updater:download-progress', 'updater:update-downloaded', 'updater:error'
  ])
  removeAllListeners: (channel: string): void => {
    if (ALLOWED_CHANNELS.has(channel)) {
      ipcRenderer.removeAllListeners(channel)
    }
  }
  ```

### SEC-05: `storage:save` IPC를 통한 전체 데이터 덮어쓰기

- **심각도**: High
- **OWASP**: A01 Broken Access Control
- **위치**: `src/main/ipc-handlers.ts:38-52`, `src/preload/index.ts:9-10`
- **설명**: 렌더러에서 `storage:save`를 호출하면 **전체 StorageData**(워크플로우, 스케줄, 폴더 등)를 덮어쓸 수 있습니다. 렌더러에 XSS가 발생하면 모든 데이터를 삭제하거나, 악성 `rawLine`이 포함된 워크플로우를 주입하여 SEC-01과 결합한 공격이 가능합니다.
- **수정 방안**:
  1. `storage:save`를 세분화된 CRUD IPC로 분리합니다 (예: `workflow:create`, `workflow:update`, `workflow:delete`).
  2. 각 IPC 핸들러에서 입력 데이터를 스키마 검증합니다.

---

## Medium (다음 스프린트에서 수정)

### SEC-06: Content Security Policy(CSP) 미설정

- **심각도**: Medium
- **OWASP**: A05 Security Misconfiguration
- **위치**: 프로젝트 전체 (미설정)
- **설명**: CSP 헤더가 전혀 설정되어 있지 않습니다. 렌더러에서 인라인 스크립트 실행, 외부 리소스 로딩 등이 제한 없이 가능합니다.
- **수정 방안**: `session.defaultSession.webRequest.onHeadersReceived`를 사용하여 CSP를 설정합니다.
  ```typescript
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"]
      }
    })
  })
  ```

### SEC-07: Recovery 키 파생 시 예측 가능한 입력 사용

- **심각도**: Medium
- **OWASP**: A02 Cryptographic Failures
- **위치**: `src/main/utils/secure-storage.ts:106-108`
- **코드**:
  ```typescript
  function deriveRecoveryKey(salt: Buffer): Buffer {
    const material = `${homedir()}:${hostname()}`
    return pbkdf2Sync(material, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512')
  }
  ```
- **설명**: Recovery 백업의 암호화 키를 사용자의 홈 디렉터리 경로와 호스트명으로만 파생합니다. 이 정보는 동일 컴퓨터의 다른 사용자나 악성 소프트웨어가 쉽게 획득할 수 있어, OTP secret 복구 파일이 복호화될 위험이 있습니다.
- **수정 방안**:
  1. `safeStorage.encryptString`을 우선 사용합니다 (OS 수준 보호).
  2. 사용자 비밀번호 입력을 키 파생에 포함합니다.
  3. 최소한 머신 고유 식별자(MAC 주소, CPU ID 등)를 추가 entropy로 사용합니다.

### SEC-08: 폴더 암호 검증이 렌더러 측에서만 수행

- **심각도**: Medium
- **OWASP**: A01 Broken Access Control
- **위치**: `src/renderer/components/schedule/ScheduleFolderItem.tsx` (렌더러 측 검증), `src/main/ipc-handlers.ts:204-340` (스케줄 CRUD에 폴더 암호 확인 없음)
- **설명**: 폴더 비밀번호 보호 기능은 UI 레벨에서만 적용됩니다. 메인 프로세스의 스케줄 CRUD IPC 핸들러(`schedule:list`, `schedule:create`, `schedule:update` 등)는 요청된 `folderId`의 암호 보호 여부를 확인하지 않습니다. DevTools나 IPC 직접 호출로 암호 없이 데이터에 접근할 수 있습니다.
- **수정 방안**: 메인 프로세스에서 암호 보호된 폴더의 데이터 접근 시 세션 토큰 또는 암호 검증을 요구합니다.

### SEC-09: 스케줄 로그 파일이 평문 JSON으로 저장

- **심각도**: Medium
- **OWASP**: A02 Cryptographic Failures
- **위치**: `src/main/services/scheduler.service.ts:178`, `src/main/utils/json-storage.ts:17-21`
- **설명**: 스케줄 실행 로그(`schedule-logs.json`)는 `saveJSONAsync`를 통해 **평문 JSON**으로 저장됩니다. `workflows.json`과 `settings.json`은 `safeStorage`로 암호화되지만, 로그 파일은 암호화 경로를 사용하지 않습니다. 로그에는 워크플로우 이름, 실행 시간, 에러 메시지 등이 포함됩니다.
- **수정 방안**: `saveSecureAsync` / `loadSecureSync`를 사용하여 로그 파일도 암호화합니다.

### SEC-10: import된 워크플로우의 `rawLine` 검증 부재

- **심각도**: Medium
- **OWASP**: A08 Software and Data Integrity Failures
- **위치**: `src/main/services/workflow-file.service.ts:65-75`
- **설명**: `validateExportFile` 함수는 파일 구조만 검증하고, 각 스텝의 `rawLine` 내용은 검증하지 않습니다. 악성 `rawLine`이 포함된 `.rfworkflow` 파일을 import하면 SEC-01 취약점으로 연결됩니다.
- **수정 방안**: import 시 각 스텝의 `rawLine`에 대해 `LOCATOR_FORBIDDEN` 검증을 적용하고(단기), 궁극적으로는 SEC-01의 화이트리스트 파서를 적용합니다(장기).

---

## Low (백로그에서 추적)

### SEC-11: 폴더 비밀번호 최소 길이가 4자로 너무 짧음

- **심각도**: Low
- **OWASP**: A07 Identification and Authentication Failures
- **위치**: `src/renderer/components/dialogs/FolderPasswordDialog.tsx:41`
- **코드**: `if (password.length < 4) { setError('암호는 4자 이상이어야 합니다.'); return }`
- **설명**: 4자 비밀번호는 브루트포스에 매우 취약합니다. 또한 비밀번호 시도 횟수 제한이 없습니다.
- **수정 방안**:
  1. 최소 길이를 8자 이상으로 상향합니다.
  2. 메인 프로세스에서도 길이 검증을 수행합니다.
  3. 시도 횟수 제한(예: 5회 실패 시 30초 대기)을 추가합니다.

### SEC-12: `verifyFolderPassword`에서 타이밍 공격 가능

- **심각도**: Low
- **OWASP**: A02 Cryptographic Failures
- **위치**: `src/main/utils/secure-storage.ts:187-190`
- **코드**:
  ```typescript
  export function verifyFolderPassword(password: string, hashHex: string, saltHex: string): boolean {
    const salt = Buffer.from(saltHex, 'hex')
    const hash = pbkdf2Sync(password, salt, FOLDER_PW_ITERATIONS, FOLDER_PW_KEY_LENGTH, 'sha512')
    return hash.toString('hex') === hashHex
  }
  ```
- **설명**: 문자열 비교(`===`)는 일치하지 않는 첫 번째 문자에서 즉시 반환하므로 타이밍 사이드채널 공격이 이론적으로 가능합니다. 로컬 앱이므로 실제 공격 난이도는 높지만, 보안 모범 사례에 어긋납니다.
- **수정 방안**: `crypto.timingSafeEqual`을 사용합니다.
  ```typescript
  import { timingSafeEqual } from 'crypto'
  const computed = hash.toString('hex')
  return timingSafeEqual(Buffer.from(computed), Buffer.from(hashHex))
  ```

### SEC-13: `new Function`을 통한 동적 import (otplib)

- **심각도**: Low
- **OWASP**: A05 Security Misconfiguration
- **위치**: `src/main/services/runner.service.ts:16`
- **코드**:
  ```typescript
  const _import = new Function('specifier', 'return import(specifier)') as (s: string) => Promise<any>
  ```
- **설명**: Rollup 번들링 우회를 위해 `new Function`으로 동적 import를 수행합니다. 이 함수 자체는 하드코딩된 모듈명(`otplib`, `@otplib/core`)으로만 호출되므로 직접적인 위협은 낮지만, CSP `unsafe-eval` 허용이 필요해지며 코드 리뷰 시 혼란을 줄 수 있습니다.
- **수정 방안**: 가능하다면 빌드 설정을 조정하여 `otplib`를 external로 처리하고, 일반 `import()`를 사용합니다.

### SEC-14: 에러 메시지에 내부 정보 노출 가능성

- **심각도**: Low
- **OWASP**: A05 Security Misconfiguration
- **위치**: `src/main/ipc-handlers.ts` (전체), `src/main/index.ts:169`
- **설명**: IPC 핸들러에서 `throw err`로 원본 에러를 그대로 렌더러에 전달하는 패턴이 반복됩니다. 또한 Chromium 설치 실패 시 `String(err)`을 다이얼로그에 표시합니다. 내부 파일 경로, 스택 트레이스 등이 노출될 수 있습니다.
- **수정 방안**: 렌더러에 전달하는 에러 메시지를 사용자 친화적 문자열로 래핑하고, 상세 정보는 메인 프로세스 로그에만 기록합니다.

---

## 긍정적 보안 사항 (잘 구현된 부분)

1. **contextIsolation: true, nodeIntegration: false**: 렌더러-메인 프로세스 격리가 올바르게 설정됨
2. **contextBridge를 통한 API 노출**: Preload에서 `contextBridge.exposeInMainWorld`를 사용하여 안전하게 API를 노출
3. **safeStorage를 통한 데이터 암호화**: `workflows.json`, `settings.json`이 OS 수준 암호화로 보호됨
4. **Codegen URL 검증**: `isValidUrl`로 `http://`/`https://`만 허용
5. **child_process에서 `shell: false`**: 셸 인젝션 방지됨
6. **PBKDF2 해싱**: 폴더 비밀번호에 100,000 iterations SHA-512 사용
7. **워크플로우 export 시 민감 정보 마스킹**: `detectSensitive`로 비밀번호 등을 자동 마스킹
8. **파일 import 시 크기 제한**: 10MB 제한으로 DoS 방지
9. **Recovery 백업에 AES-256-GCM + PBKDF2**: 인증된 암호화 사용
10. **평문 -> 암호화 자동 마이그레이션**: 앱 시작 시 기존 평문 데이터를 암호화로 변환

---

## 수정 우선순위 권고

| 순위 | ID | 설명 | 예상 작업량 |
|------|----|------|------------|
| 1 | SEC-01 | `new Function` 코드 인젝션 | 높음 (화이트리스트 파서 구현) |
| 2 | SEC-02 | `shell.openExternal` URL 검증 | 낮음 (5줄 수정) |
| 3 | SEC-04 | `removeAllListeners` 채널 화이트리스트 | 낮음 (10줄 수정) |
| 4 | SEC-05 | `storage:save` 세분화 | 중간 (IPC 리팩토링) |
| 5 | SEC-03 | sandbox 활성화 | 낮음 (테스트 필요) |
| 6 | SEC-06 | CSP 설정 | 낮음 |
| 7 | SEC-10 | import 시 rawLine 검증 | 낮음 (SEC-01과 연동) |
| 8 | SEC-08 | 폴더 암호 서버 측 검증 | 중간 |
| 9 | SEC-07 | Recovery 키 파생 개선 | 중간 |
| 10 | SEC-09 | 로그 파일 암호화 | 낮음 |

---

*이 보고서는 정적 코드 분석 기반입니다. 동적 테스트(펜테스트)를 추가로 수행할 것을 권장합니다.*
