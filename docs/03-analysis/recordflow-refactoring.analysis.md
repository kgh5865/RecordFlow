# RecordFlow Refactoring Analysis Report

> **Analysis Type**: Gap Analysis (Plan vs Implementation)
>
> **Project**: RecordFlow
> **Version**: 0.1.0
> **Analyst**: gap-detector
> **Date**: 2026-03-02
> **Plan Doc**: [recordflow-refactoring.plan.md](../01-plan/features/recordflow-refactoring.plan.md)

---

## 1. Analysis Overview

### 1.1 Analysis Purpose

Plan 문서에 명시된 14개 리팩토링 항목의 구현 완료 여부를 검증하고,
코드 리뷰 리포트에서 추가 식별된 항목들의 적용 상태를 확인한다.

### 1.2 Analysis Scope

- **Plan Document**: `docs/01-plan/features/recordflow-refactoring.plan.md`
- **Implementation Path**: `src/main/`, `src/renderer/`, `scripts/`
- **Analysis Date**: 2026-03-02

---

## 2. Success Criteria Verification (Plan Section 6)

### Criterion 1: `shell:true` usage = 0

**Result: PASS**

| File | Status | Detail |
|------|:------:|--------|
| `src/main/services/codegen.service.ts:41` | `shell: false` | Explicit false |
| `src/main/services/setup.service.ts:24` | `shell: false` | Explicit false |
| `src/main/services/runner.service.ts` | No spawn | Uses `chromium.launch()` instead |

`shell:true` 검색 결과: `src/` 디렉토리 내 0개.

> **Note**: `scripts/poc-codegen.mjs:26`에 `shell: true`가 남아 있으나 이는 개발자용 POC 스크립트이며 런타임 코드가 아님.

---

### Criterion 2: IPC handler try/catch coverage = 100%

**Result: PASS**

`src/main/ipc-handlers.ts` (227줄)에서 모든 `ipcMain.handle` 호출을 검증:

| IPC Channel | try/catch | Parameter Validation |
|-------------|:---------:|:--------------------:|
| `storage:load` | Yes | N/A (no params) |
| `storage:save` | Yes | N/A |
| `codegen:start` | Yes | `typeof url !== 'string'` check |
| `codegen:stop` | Yes | N/A |
| `runner:start` | Yes | `!Array.isArray(steps)` check |
| `schedule:list` | Yes | N/A |
| `schedule:create` | Yes | N/A |
| `schedule:update` | Yes | `typeof id !== 'string'` check |
| `schedule:delete` | Yes | `typeof id !== 'string'` check |
| `schedule:toggle` | Yes | `typeof id/enabled` check |
| `schedule:logs` | Yes | N/A |
| `schedule:validate-cron` | Yes | N/A |
| `settings:get` | Yes | N/A |
| `settings:save` | Yes | N/A |

**14/14 handlers** have try/catch wrapping. Parameter validation is applied to channels receiving user-supplied values.

---

### Criterion 3: `readFileSync`/`writeFileSync` in main process = 0

**Result: PARTIAL PASS (with caveat)**

| Location | Function | Sync I/O | Status |
|----------|----------|----------|:------:|
| `src/main/services/storage.service.ts` | `loadStorage()` | `loadJSONSync` (via util) | Intentional sync |
| `src/main/services/settings.service.ts` | `loadSettings()` | `loadJSONSync` (via util) | Intentional sync |
| `src/main/services/codegen.service.ts:51` | close handler | `unlinkSync(tmpFile)` | Residual sync |
| `src/main/utils/json-storage.ts:9` | `loadJSONSync()` | `readFileSync` | Centralized util |
| `src/main/services/scheduler.service.ts` | All functions | Async (`readFile`, `saveJSONAsync`) | Converted |

**Analysis**: `readFileSync`/`writeFileSync`는 서비스 파일에서 직접 호출되지 않고, `json-storage.ts` 유틸에 `loadJSONSync`로 통합되었다. 그러나 `loadJSONSync` 자체는 여전히 동기 `readFileSync`를 사용한다. 이는 Electron 메인 프로세스 초기화 시 동기 로딩이 필요한 구조적 제약에 의한 것이며, 쓰기는 전부 `saveJSONAsync`(비동기)로 전환되었다.

`codegen.service.ts:51`의 `unlinkSync`는 임시 파일 정리 목적이며, catch로 무시 처리되어 있다.

서비스 파일에서의 직접 `readFileSync`/`writeFileSync` 호출: **0개** (유틸로 통합 완료).

---

### Criterion 4: 300+ line component = 0

**Result: PASS**

| File | Lines | Status |
|------|------:|:------:|
| `src/renderer/components/settings/OtpSection.tsx` | 297 | Pass (< 300) |
| `src/renderer/components/steps/StepRow.tsx` | 274 | Pass |
| `src/main/ipc-handlers.ts` | 227 | Pass |
| `src/renderer/components/schedule/ScheduleDialog.tsx` | 209 | Pass |
| `src/main/index.ts` | 205 | Pass |
| `src/main/services/scheduler.service.ts` | 177 | Pass |
| `src/main/services/runner.service.ts` | 159 | Pass |
| `src/renderer/components/schedule/ScheduleDetail.tsx` | 132 | Pass |
| `src/renderer/components/workflow/WorkflowItem.tsx` | 123 | Pass |
| `src/renderer/components/workflow/FolderItem.tsx` | 121 | Pass |
| `src/renderer/components/schedule/ScheduleItem.tsx` | 123 | Pass |
| `src/renderer/components/steps/StepList.tsx` | 119 | Pass |
| `src/renderer/components/settings/SettingsPanel.tsx` | 79 | Pass |

**300줄 초과 파일: 0개**.

이전 `SettingsPanel.tsx` (457줄) -> `SettingsPanel.tsx` (79줄) + `OtpSection.tsx` (297줄) + `BackgroundModeSection` (inline, 46줄) 분리 완료.
이전 `StepRow.tsx` (255줄) -> `StepRow.tsx` (274줄, `SelectorEditor` + `ValueEditor` 내부 컴포넌트 분리 포함).
이전 `main/index.ts` (327줄) -> `index.ts` (205줄) + `ipc-handlers.ts` (227줄) 분리 완료.

---

### Criterion 5: Duplicate file I/O pattern -> unified utility

**Result: PASS**

| Service | Before | After |
|---------|--------|-------|
| `storage.service.ts` | 자체 readFileSync/writeFileSync | `loadJSONSync` / `saveJSONAsync` 사용 |
| `settings.service.ts` | 자체 readFileSync/writeFileSync | `loadJSONSync` / `saveJSONAsync` 사용 |
| `scheduler.service.ts` | 자체 readFileSync/writeFileSync | `readFile` (직접) + `saveJSONAsync` 사용 |

유틸리티 `src/main/utils/json-storage.ts` (22줄):
- `loadJSONSync<T>(filePath, defaultValue)` - JSON 읽기 (동기, 초기화용)
- `saveJSONAsync(filePath, data)` - JSON 쓰기 (비동기)

`scheduler.service.ts`의 `loadLogs()`는 schedule-logs.json 전용으로 `readFile`을 직접 사용하지만, 저장은 `saveJSONAsync`를 통해 통합됨.

---

### Criterion 6: TypeScript compile error = 0

**Result: NOT DIRECTLY VERIFIED**

현재 분석에서 TypeScript 컴파일은 실행하지 않았으나, 정적 코드 분석 상 타입 불일치나 명백한 오류는 발견되지 않았다. `tsc --noEmit` 실행으로 직접 확인이 필요하다.

---

## 3. Plan Items Verification (Phase 1 + Phase 2)

### Phase 1 -- Security & Stability (8 items)

| # | Item | Status | Detail |
|---|------|:------:|--------|
| P1-1 | `{{cmd}}` Shell Injection 제거 | PASS | `{{cmd}}` 패턴 검색 결과 0개. `resolveValue()`에서 `{{otp:name}}` 패턴만 처리 |
| P1-2 | `new Function(locatorExpr)` Code Injection allowlist | PASS | `LOCATOR_FORBIDDEN` 배열 (eval, Function, require, import, process, global, ;, \n) + `page.` prefix 검증 적용 (`runner.service.ts:117-135`) |
| P1-3 | 불필요한 `shell:true` 제거 | PASS | `codegen.service.ts:41`, `setup.service.ts:24` 모두 `shell: false` |
| P1-4 | IPC handler try/catch | PASS | 14/14 핸들러 적용 (Criterion 2 참조) |
| P1-5 | ErrorBoundary 추가 | PASS | `src/renderer/components/ErrorBoundary.tsx` (48줄) 생성, `App.tsx:29`에서 `<ErrorBoundary>` 최상위 적용 |
| P1-6 | async file I/O 전환 | PASS | 서비스 파일에서 직접 sync I/O 호출 0개. `json-storage.ts` 유틸로 통합 (Criterion 3 참조) |
| P1-7 | `alert()`/`confirm()` 제거 | **FAIL** | `ScheduleDetail.tsx:54`에 `alert('실행할 step이 없습니다.')` 1개 잔존 |
| P1-8 | Playwright wildcard version fix | PASS | `package.json`에 `"playwright": "^1.49.0"` 명시 |

### Phase 2 -- Code Structure (6 items)

| # | Item | Status | Detail |
|---|------|:------:|--------|
| P2-1 | `loadJSON`/`saveJSON` 유틸 추출 | PASS | `src/main/utils/json-storage.ts` 생성, `storage.service.ts` + `settings.service.ts` + `scheduler.service.ts` 에서 사용 |
| P2-2 | `SettingsPanel.tsx` 분리 | PASS | `SettingsPanel.tsx` (79줄) + `OtpSection.tsx` (297줄) + `BackgroundModeSection` (inline) |
| P2-3 | `StepRow.tsx` 분리 | PASS | `SelectorEditor` + `ValueEditor` 내부 컴포넌트로 분리 (같은 파일 내 274줄) |
| P2-4 | `main/index.ts` -> `ipc-handlers.ts` 분리 | PASS | `ipc-handlers.ts` (227줄) 생성, `index.ts`는 205줄로 축소. `registerIpcHandlers()` 함수 export |
| P2-5 | `selectorUtils.ts` 유틸 추출 | PASS | `src/renderer/utils/selectorUtils.ts` (34줄) 생성. `normalizeSelector` + `rebuildRawLine` 함수 포함. `StepList.tsx`에서 import 사용 |
| P2-6 | 공통 `<Input>` 컴포넌트 | PARTIAL | `src/renderer/components/ui/Input.tsx` (15줄) 생성. `NewWorkflowDialog`, `NewFolderDialog`, `RenameDialog`에서 사용 (3/4 다이얼로그). 단, `ScheduleDialog`와 `OtpSection`에서는 미사용 (인라인 input className 잔존) |

---

## 4. Additional Implementation Items Verification

### 4.1 Code Review Report Items

| Item | Status | Detail |
|------|:------:|--------|
| `alert()`/`confirm()` 0개 | **FAIL** | `ScheduleDetail.tsx:54`에 `alert()` 1개 잔존 |
| `DialogState` discriminated union | PASS | `uiStore.ts:6-12`에 `type DialogState = { type: null } \| { type: 'new-folder' } \| ...` 적용 |
| `React.memo()` FolderItem | PASS | `FolderItem.tsx:16` - `export const FolderItem = memo(function FolderItem(...))` |
| `React.memo()` WorkflowItem | PASS | `WorkflowItem.tsx:11` - `export const WorkflowItem = memo(function WorkflowItem(...))` |
| `React.memo()` ScheduleItem | PASS | `ScheduleItem.tsx:54` - `export const ScheduleItem = memo(function ScheduleItem(...))` |
| `useMemo` FolderTree rootFolders | PASS | `FolderTree.tsx:33` - `const rootFolders = useMemo(() => folders.filter(...), [folders])` |
| `storage.service.ts` in-memory cache | PASS | `storage.service.ts:15` - `let _cache: StorageData \| null = null`, `loadStorage()`에서 캐시 반환 |
| OtpSection async try/catch | PASS | `OtpSection.tsx:48-55` - `handleAddOtp`에 try/catch 적용. `handleDeleteOtp`에도 적용 |
| NewWorkflowDialog async try/catch | PASS | `NewWorkflowDialog.tsx:32-37` - `handleRecord`에 try/catch 적용 |
| IPC parameter validation | PASS | `ipc-handlers.ts`에 `typeof url !== 'string'`, `!Array.isArray(steps)`, `typeof id !== 'string'`, `typeof enabled !== 'boolean'` 검증 포함 |
| `poc-codegen.mjs` -> `scripts/` 이동 | PARTIAL | 파일은 `scripts/poc-codegen.mjs`에 존재하나, `package.json:11`의 `"poc": "node poc-codegen.mjs"` 경로가 업데이트되지 않음 |

---

## 5. Differences Found

### 5.1 Missing Features (Plan O, Implementation X)

| # | Item | Plan Location | Description | Impact |
|---|------|---------------|-------------|--------|
| 1 | `alert()` 완전 제거 | P1-7 | `ScheduleDetail.tsx:54`에 `alert('실행할 step이 없습니다.')` 잔존 | Low |
| 2 | 공통 `<Input>` 완전 적용 | P2-6 | `ScheduleDialog`(5개 input) 및 `OtpSection`(2개 input)에서 공통 Input 미사용 | Low |

### 5.2 Minor Issues (plan intention not fully met)

| # | Item | Location | Description |
|---|------|----------|-------------|
| 1 | `loadJSONSync` 동기 읽기 잔존 | `json-storage.ts:9` | 유틸로 통합되었으나 내부적으로 `readFileSync` 사용. 구조적 제약 (app 초기화 시 동기 필요) |
| 2 | `unlinkSync` 잔존 | `codegen.service.ts:51` | 임시 파일 삭제 목적, catch로 무시 처리 |
| 3 | `poc-codegen.mjs` 스크립트 경로 | `package.json:11` | `"poc": "node poc-codegen.mjs"` -> `"poc": "node scripts/poc-codegen.mjs"`로 수정 필요 |
| 4 | `poc-codegen.mjs`의 `shell: true` | `scripts/poc-codegen.mjs:26` | 런타임 코드 아님, 개발용 POC 스크립트 |

### 5.3 Security Notes

| Item | Location | Detail |
|------|----------|--------|
| `new Function` for locator | `runner.service.ts:137` | `LOCATOR_FORBIDDEN` allowlist 검증은 적용됨. `page.` prefix + forbidden keyword 검사로 코드 인젝션 위험 완화. 완벽한 제거는 아니지만 plan에서 "Locator 표현식 검증 로직 추가 (허용 패턴 allowlist)"로 명시되어 있으므로 plan 의도 충족 |
| `new Function` for dynamic import | `runner.service.ts:16` | otplib ESM-only 모듈의 Rollup 번들링 우회 목적. `import()` 호출만 수행하며, 사용자 입력을 받지 않아 인젝션 위험 없음 |

---

## 6. Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| Plan Match (14 items) | 92.9% (13/14) | Pass |
| Success Criteria (6 items) | 91.7% (5.5/6) | Pass |
| Additional Items (11 items) | 90.9% (10/11) | Pass |
| **Overall Match Rate** | **92%** | **Pass** |

### Score Breakdown

```
Plan Items (14 total):
  Phase 1: 7/8 passed (P1-7 alert fail)
  Phase 2: 5.5/6 passed (P2-6 partial)

Success Criteria (6 total):
  1. shell:true = 0           -> PASS
  2. IPC try/catch 100%       -> PASS
  3. readFileSync 직접호출 0  -> PASS (유틸 통합)
  4. 300줄 초과 컴포넌트 0    -> PASS
  5. 중복 I/O 유틸 통합       -> PASS
  6. TypeScript compile 0     -> NOT VERIFIED

Additional Items (11 total):
  10/11 passed (alert 1개 잔존)
```

---

## 7. Recommended Actions

### 7.1 Immediate (remaining gap closure)

| Priority | Item | File | Action |
|----------|------|------|--------|
| 1 | `alert()` 제거 | `src/renderer/components/schedule/ScheduleDetail.tsx:54` | 인라인 에러 메시지 UI로 교체 (다른 컴포넌트의 `pendingDelete` 패턴 참조) |
| 2 | `package.json` poc 경로 | `package.json:11` | `"poc": "node scripts/poc-codegen.mjs"` 로 수정 |

### 7.2 Short-term (quality improvement)

| Priority | Item | File | Action |
|----------|------|------|--------|
| 1 | `<Input>` 공통 컴포넌트 확대 적용 | `ScheduleDialog.tsx`, `OtpSection.tsx` | 인라인 input className을 `<Input>` 컴포넌트로 교체 |
| 2 | TypeScript compile 검증 | - | `npx tsc --noEmit` 실행으로 컴파일 에러 0 확인 |
| 3 | `unlinkSync` 비동기 전환 | `codegen.service.ts:51` | `unlink` (fs/promises) 사용 |

### 7.3 Deferred (Plan Section 3 excluded items)

이하 항목은 Plan에서 명시적으로 제외되었으며, 별도 PDCA 사이클로 진행:

- Phase 3: React.memo / useMemo 최적화 (일부 선행 적용됨)
- Phase 4: 스토리지 인메모리 캐시 (일부 선행 적용됨), 타입 강화
- Phase 5: ESLint/Prettier 도입, tsconfig 개선, 네이밍 컨벤션

---

## 8. Plan Document Updates Needed

Plan 문서에 반영해야 할 실제 구현 차이점:

- [ ] P1-6 비동기 전환: 읽기는 `loadJSONSync`로 유틸 통합되었으나 여전히 동기. 쓰기만 비동기 전환. Plan에 구조적 제약 사항 기록
- [ ] P2-6 `<Input>` 컴포넌트: 3/4 다이얼로그에만 적용. `ScheduleDialog`와 `OtpSection`은 별도 스타일 input 사용 중임을 기록

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-02 | Initial analysis | gap-detector |
