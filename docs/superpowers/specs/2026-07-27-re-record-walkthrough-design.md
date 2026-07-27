# Re-record 워크스루 방식 설계

- **작성일**: 2026-07-27
- **작성자**: kgh5865 + Claude
- **관련 파일**: [ReRecordDialog.tsx](../../../src/renderer/components/dialogs/ReRecordDialog.tsx), [useIpc.ts](../../../src/renderer/hooks/useIpc.ts), [codegen.service.ts](../../../src/main/services/codegen.service.ts), [runner.service.ts](../../../src/main/services/runner.service.ts)
- **상태**: 설계 승인 대기

## 배경

현재 Re-record 기능은 기존 워크플로우의 모든 스텝을 버리고 처음부터 새로 녹화합니다 ([useIpc.ts:22-38](../../../src/renderer/hooks/useIpc.ts#L22-L38)). 사용자가 사이트 UI 변경 등으로 워크플로우 중간의 일부 스텝만 수정하고 싶어도 전체를 다시 녹화해야 하는 불편이 있습니다.

## 목표

기존 워크플로우를 처음부터 순서대로 자동 재생하다가, 사용자가 지정한 지점부터 새로 녹화하고, 이후 남은 기존 스텝들을 하나씩 리뷰(포함/건너뛰기)하는 워크스루 방식으로 재설계합니다.

## 범위

- [ReRecordDialog.tsx](../../../src/renderer/components/dialogs/ReRecordDialog.tsx) 전면 재작성
- 신규 main 서비스 `re-record.service.ts` 추가
- Playwright 내부 `_enableRecorder` API 사용
- runner.service.ts의 executeStep 로직 공유 가능하도록 리팩터

**비범위**
- 스케줄 스텝 편집 기능은 이번 범위 아님 (스케줄은 워크플로우 스냅샷을 별도로 갖고 있어 기존 방식 유지)
- 워크플로우 파일(.rfworkflow) import/export 형식 변경 없음

## UX 흐름

### Phase 0 — 시작 다이얼로그

기존 다이얼로그를 확장해 스텝 리스트와 자동 실행 지점 선택 UI를 추가합니다.

```
┌─────────────────────────────────────────────┐
│ Re-record: 로그인 후 주문 조회             │
├─────────────────────────────────────────────┤
│ 시작 URL: [ https://shop.example.com    ]  │
│                                             │
│ 어디까지 자동 실행할까요?                  │
│ ┌─────────────────────────────────────────┐│
│ │ ○ 1. navigate  https://shop...          ││
│ │ ○ 2. click     #login-btn               ││
│ │ ○ 3. fill      #email       "***"       ││
│ │ ○ 4. fill      #password    "***"       ││
│ │ ● 5. click     #submit          ← 여기까지│
│ │ ○ 6. wait      #dashboard               ││
│ │ ...                                      ││
│ │ ○ 12. click    .logout                  ││
│ └─────────────────────────────────────────┘│
│                                             │
│              [ 취소 ]  [ ▶ 시작 ]          │
└─────────────────────────────────────────────┘
```

- 시작 URL 기본값: 첫 스텝이 navigate라면 그 URL, 아니면 `https://`
- 스텝 리스트: 스크롤 가능, StepRow와 유사한 시각 스타일 재사용
- 라디오 리스트 최상단에 **"🔴 자동 실행 없이 바로 녹화"** 옵션 (stopAtIndex = -1). 선택 시 Phase 0 자동 실행을 스킵하고 URL 이동만 한 뒤 바로 Recording Phase 진입 (기존 Re-record와 동등)
- 라디오 기본값: 마지막 스텝
- [▶ 시작] 클릭 → `re-record:start` IPC

### Phase 0-실행 — 사전 선택 지점까지 자동 실행

- main이 브라우저 launch 후 originalSteps[0..stopAtIndex]를 순차 실행
- `stopAtIndex === -1` ("즉시 녹화" 선택) 시: 자동 실행 없이 page.goto(url)만 수행하고 곧바로 Recording Phase 진입 (Phase 1 스킵)
- 렌더러 UI: 스피너 + "3/5 실행 중..." 진행 표시
- 완료 시 자동으로 Phase 1 컨트롤 패널로 전환 (cursor = stopAtIndex + 1)
- 실행 실패 시 ErrorPanel

### Phase 1 — 자동 재생 조정 컨트롤 패널

```
┌────────────────────────────────────────────┐
│ Re-record: 로그인 후 주문 조회            │
│ Phase 1: 자동 재생 (5 / 12 실행 완료)     │
├────────────────────────────────────────────┤
│ 다음 실행 예정:                            │
│   6. wait  #dashboard                     │
│                                            │
│ [ 다음 ▶ ]  [ ● 여기서부터 녹화 ]  [취소] │
└────────────────────────────────────────────┘
```

- **[다음 ▶]**: originalSteps[cursor] 실행 → 성공 시 cursor++, 실패 시 ErrorPanel
- **[● 여기서부터 녹화]**: recorder attach → Recording Phase
- **[취소]**: 세션 종료, 원본 유지
- cursor가 originalSteps.length에 도달하고 녹화를 시작하지 않은 경우: 변경 없음 → 취소로 처리

### Recording Phase

```
┌────────────────────────────────────────────┐
│ Re-record: 로그인 후 주문 조회            │
│ Recording                                  │
├────────────────────────────────────────────┤
│ 🔴 브라우저에서 동작을 기록하는 중...     │
│                                            │
│ 완료했으면 아래 버튼을 눌러주세요.        │
│                                            │
│ [ ■ 녹화 완료 ]  [ 취소 ]                 │
└────────────────────────────────────────────┘
```

- main이 `context._enableRecorder({ language: 'javascript', mode: 'recording', outputFile })` 호출 (Playwright private API)
- [■ 녹화 완료] 클릭 시:
  1. `context._disableRecorder()` 호출 → dispose 경로에서 `_throttledOutputFile.flush()` 트리거
  2. outputFile 존재/크기 폴링 (100ms 간격, 최대 2초 타임아웃) — flush 완료 대기
  3. 파일 읽어서 parser.service.ts로 파싱 → 새 스텝 배열
  4. finalSteps에 append → Phase 2 진입
- 새 스텝이 0개여도 Phase 2로 진입 (남은 기존 스텝만 큐레이션 가능)
- 파싱 실패 시: ErrorPanel로 전환 ("녹화 코드 파싱 실패" 메시지, 재시도 없음 → 여기서부터 녹화 재진입 또는 취소만 제공)

### Phase 2 — 남은 기존 스텝 리뷰

```
┌────────────────────────────────────────────┐
│ Re-record: 로그인 후 주문 조회            │
│ Phase 2: 남은 스텝 리뷰 (6 / 12)          │
├────────────────────────────────────────────┤
│ 리뷰 중인 스텝:                            │
│   6. click  #submit                       │
│                                            │
│ [ ✓ 포함 ]  [ ✓✓ 모두 포함 ]              │
│ [ ✗ 건너뛰기 ]  [ ● 여기서부터 녹화 ]     │
│ [ 취소 ]                                   │
└────────────────────────────────────────────┘
```

- **[✓ 포함]**: originalSteps[cursor] 실행 + finalSteps.push + cursor++
- **[✓✓ 모두 포함]**: originalSteps[cursor..end] 순차 실행 + 모두 push, 실패 시 그 지점에서 ErrorPanel
- **[✗ 건너뛰기]**: 실행 X, 추가 X, cursor++
- **[● 여기서부터 녹화]** (Phase 2 재진입): 현재 cursor 스텝은 건너뛴 것으로 취급 (실행 X, push X), Recording Phase 진입. 녹화 완료 후 finalSteps에 append, Phase 2 재개 (cursor 그대로)
- cursor가 마지막 도달 시 자동으로 Commit UI로 전환

### Commit UI (미리보기 + 스텝 제외)

```
┌────────────────────────────────────────────┐
│ 저장 미리보기 (총 9 스텝)                  │
├────────────────────────────────────────────┤
│ 1. navigate   https://...          [ ✗ ]  │
│ 2. click      #login-btn           [ ✗ ]  │
│ 3. fill       #email     "***"     [ ✗ ]  │
│ 4. fill       #password  "***"     [ ✗ ]  │
│ 5. click      #submit              [ ✗ ]  │
│ 6. (신규) click  .new-btn          [ ✗ ]  │
│ 7. (신규) fill   .search  "..."    [ ✗ ]  │
│ 8. wait       .result              [ ✗ ]  │
│ 9. click      .logout              [ ✗ ]  │
├────────────────────────────────────────────┤
│           [ 저장 ]  [ 취소 ]              │
└────────────────────────────────────────────┘
```

- 각 스텝 옆 [✗] 버튼으로 최종 배열에서 제외 가능 (제외된 스텝은 회색으로 표시하고 [↩ 되돌리기] 버튼으로 복구 가능)
- 신규 녹화 스텝은 "(신규)" 라벨로 구분 (finalSteps에 push될 때 `_origin: 'recorded' | 'original'` 임시 마킹 사용, 저장 시 제거)
- 순서 조정은 이번 범위 아님 (저장 후 StepPanel에서 편집)
- [저장]: 제외되지 않은 스텝만 workflow.steps로 교체 + updatedAt 갱신 + persistToStorage + 브라우저 종료
- [취소]: 원본 유지 + 브라우저 종료

### Error Panel

모든 실행 실패(Phase 0 auto, Phase 1 next, Phase 2 include/include-all) 공통 UI.

```
┌────────────────────────────────────────────┐
│ ⚠ 스텝 6 실행 실패                        │
│ click #submit                              │
│                                            │
│ 오류: Timeout 30000ms exceeded            │
│                                            │
│ [ 재시도 ]  [ ● 여기서부터 녹화 ]  [취소] │
└────────────────────────────────────────────┘
```

- **[재시도]**: 같은 스텝 재실행
- **[● 여기서부터 녹화]**: 현재 브라우저 상태 유지 → Recording Phase
- **[취소]**: 세션 종료, 원본 유지

## 아키텍처

### Main 프로세스

**신규 파일**: `src/main/services/re-record.service.ts`

세션 상태 (main 메모리에 단일 인스턴스):
```typescript
interface ReRecordSession {
  sessionId: string
  workflowId: string
  browser: Browser
  context: BrowserContext
  activePage: Page              // context.on('page') 및 page.on('framenavigated')로 최근 활성 페이지 추적
  originalSteps: WorkflowStep[]
  finalSteps: Array<WorkflowStep & { _origin: 'original' | 'recorded' }>  // Commit UI 라벨링용
  cursor: number
  phase: 'phase0-auto' | 'phase1' | 'recording' | 'phase2' | 'commit' | 'error'
  lastError?: { stepIndex: number; message: string }
  recorderOutputFile?: string
}
```

**활성 페이지 추적**:
- 세션 시작 시 초기 페이지를 `activePage`로 세팅
- `context.on('page', newPage)`: 새 페이지 열릴 때마다 `activePage = newPage`로 갱신
- `newPage.on('framenavigated')` + `newPage.on('load')`: 페이지 내 네비게이션에서도 활성 상태 반영
- `page.on('close')`: activePage가 닫히면 `context.pages()`에서 가장 최근 페이지로 폴백
- Phase 1/2의 executeStep은 항상 `session.activePage`를 대상으로 실행
- 완벽 재현이 어려운 케이스(사용자가 여러 탭 전환 후 이전 탭으로 돌아감)는 재녹화 실패로 이어질 수 있음 → ErrorPanel의 "여기서부터 녹화"로 폴백 가능

세션은 앱 프로세스 메모리에만 존재, persist 안 함. 앱 재시작 시 세션은 소실되고 원본은 안전.

**runner.service.ts 리팩터**:
- `executeStep(page, step, folderVars)` 함수를 export하여 재사용
- runner.service.ts의 `runWorkflow`는 그대로 유지 (실행 완료 후 브라우저 자동 종료)
- re-record.service.ts는 executeStep만 import하여 자신의 브라우저 세션에서 사용

**세션 종료 및 자원 정리 (공통)**:
- 취소/에러/브라우저 강제 종료/commit 완료 모든 경로에서 다음을 수행:
  1. `browser.close().catch(() => {})`
  2. `recorderOutputFile`이 설정돼 있으면 `unlink(recorderOutputFile).catch(() => {})` (codegen.service.ts:58과 동일 패턴)
  3. 세션 객체 참조 해제 (null)
- `browser.on('disconnected')` 리스너로 사용자가 브라우저를 X로 닫은 경우 감지 → 위 정리 루틴 실행 + 렌더러에 `re-record:session-ended` 이벤트 push

### IPC 채널

`preload/index.ts`와 `ipc-handlers.ts`에 추가:

| 채널 | 방향 | 인자 | 응답 |
|------|------|------|------|
| `re-record:start` | R→M | `{ workflowId, url, stopAtIndex }` | `{ sessionId, phase }` 또는 error |
| `re-record:next` | R→M | 없음 | `{ cursor, phase, nextStep? }` 또는 error |
| `re-record:start-recording` | R→M | 없음 | `{ phase: 'recording' }` |
| `re-record:stop-recording` | R→M | 없음 | `{ newSteps, phase, cursor, nextStep? }` |
| `re-record:include` | R→M | 없음 | `{ cursor, phase, nextStep? }` 또는 error |
| `re-record:include-all` | R→M | 없음 | `{ cursor, phase }` 또는 error (실패 시 phase='error') |
| `re-record:skip` | R→M | 없음 | `{ cursor, phase, nextStep? }` |
| `re-record:retry` | R→M | 없음 | `{ cursor, phase, nextStep? }` 또는 error |
| `re-record:commit` | R→M | 없음 | `{ finalSteps }` |
| `re-record:cancel` | R→M | 없음 | `{ ok: true }` |
| `re-record:auto-progress` | M→R (push) | `{ current, total }` | Phase 0 실행 진행률 이벤트 |
| `re-record:session-ended` | M→R (push) | `{ reason: 'browser-closed' \| 'error' \| 'cancelled' }` | 사용자가 브라우저 X 로 닫은 경우 등 강제 종료 이벤트 |

모든 R→M 채널은 try/catch 필수 ([ipc-handlers.ts](../../../src/main/ipc-handlers.ts) 규약 준수).

### 렌더러 UI

**컴포넌트 재작성**: [ReRecordDialog.tsx](../../../src/renderer/components/dialogs/ReRecordDialog.tsx)

내부 상태 머신 (React useState 또는 useReducer):
```typescript
type ViewState =
  | { view: 'phase0-select'; url: string; stopAtIndex: number }
  | { view: 'phase0-running'; current: number; total: number }
  | { view: 'phase1'; cursor: number; nextStep: WorkflowStep }
  | { view: 'recording' }
  | { view: 'phase2'; cursor: number; nextStep: WorkflowStep }
  | { view: 'commit'; finalStepCount: number }
  | { view: 'error'; stepIndex: number; message: string }
```

각 view별 서브 컴포넌트로 분리하여 300줄 제한([recordflow-refactoring.analysis.md](../../03-analysis/recordflow-refactoring.analysis.md) 규약) 유지:
- `Phase0SelectPanel`
- `Phase0RunningPanel`
- `Phase1Panel`
- `RecordingPanel`
- `Phase2Panel`
- `CommitPanel`
- `ErrorPanel`

**useIpc.ts 정리**: 기존 `dialog.type === 're-record'` 완료 핸들러 ([useIpc.ts:22-38](../../../src/renderer/hooks/useIpc.ts#L22-L38)) 제거 (새 IPC로 대체).

### 데이터 흐름

```
Phase 0 select
  → re-record:start(url, stopAtIndex)
  → main: browser.launch(), page.goto, executeStep×N
  → renderer: phase0-running (progress push)
  → 완료 → phase1 (또는 error)

Phase 1
  → re-record:next → main: executeStep(cursor) → cursor++
  → re-record:start-recording → main: _enableRecorder → recording

Recording
  → re-record:stop-recording → main: 파일 파싱 → finalSteps.push(...newSteps) → phase2

Phase 2
  → re-record:include → main: executeStep(cursor) → finalSteps.push → cursor++
  → re-record:include-all → main: loop executeStep → phase2 or error
  → re-record:skip → cursor++
  → re-record:start-recording (재진입) → recording

cursor == length
  → commit UI
  → re-record:commit → main: 세션 종료 → renderer: workflow store 업데이트
```

### 최종 스텝 조립

`finalSteps` 배열이 세션 내내 누적됨:
- Phase 0 실행 성공 스텝 (executeStep 성공 후 push)
- Phase 1 다음 실행 성공 스텝
- Recording에서 파싱된 신규 스텝들
- Phase 2 포함/모두 포함으로 실행된 원본 스텝

Commit 시:
- `order` 인덱스 0부터 재부여
- `id`는 모든 스텝을 신규 생성 (원본 스텝이 포함되어도 새 id 부여, 단순화 위해)
- workflow의 name/id/folderId/createdAt 유지
- `updatedAt` = new Date().toISOString()

## 위험 요소

**R1. Playwright `_enableRecorder` private API 의존**
- 위험: Playwright 버전 업그레이드 시 시그니처/동작 변경 가능
- 완화:
  - package.json에서 playwright 버전을 현재 설치본 기준 `1.58.2`로 정확히 고정 (caret 제거)
  - package-lock.json 커밋
  - 이 서비스에 대한 회귀 테스트 절차를 README나 CONTRIBUTING에 문서화
  - _enableRecorder 및 _disableRecorder 호출부에 try/catch 후 명시적 에러 메시지 ("Playwright 버전 호환성 문제가 있을 수 있습니다") 표시
  - 향후 Playwright 업그레이드 PR 시 필수 회귀 테스트 항목으로 지정

**R2. 자동 실행 중 사이트 변경으로 실패**
- 완화: ErrorPanel의 [여기서부터 녹화]로 자연스러운 폴백 제공

**R3. 사용자가 브라우저 창을 직접 X로 닫음**
- 완화: `browser.on('disconnected')` 리스닝 → `re-record:session-ended` 이벤트로 렌더러에 알림 → 다이얼로그가 취소 상태로 전환

**R4. 세션 중 앱 종료**
- 완화: main 프로세스 종료 시 browser.close() 정리, 세션 메모리만 소실되므로 원본 workflow 안전

**R5. 세션이 이미 존재하는데 다시 Re-record 시도**
- 정책: 앱 전체에서 단일 세션만 허용
- 완화: `re-record:start` 진입 시 기존 세션 존재하면 그 세션을 자동으로 정리 (browser.close + 상태 리셋)한 뒤 새 세션 시작

**R6. Recording에서 생성된 코드에 rawLine이 없는 케이스**
- 현재 parser.service.ts와 동일한 파싱 경로 사용하므로 [rawLine 폴백 로직](../../../src/main/services/runner.service.ts#L132-L145)이 그대로 적용됨

## 미결정 사항

없음 (모두 브레인스토밍에서 결정됨).

## 후속 작업

- 이 spec 승인 후 writing-plans 스킬로 구현 계획 작성
- 구현 완료 후 CHANGELOG/릴리즈 노트에 UX 변경 안내 필수
