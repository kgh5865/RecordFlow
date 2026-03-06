# RecordFlow 코드 리뷰 & 리팩토링 분석 v2

> **Version**: 0.2.0
> **Date**: 2026-03-07
> **Scope**: src/main, src/renderer, src/preload, src/types, 설정 파일 전체
> **Previous**: [recordflow-refactoring.analysis.md](recordflow-refactoring.analysis.md) (v1, 92% match)

---

## 1. 종합 평가

| 영역 | 점수 | 상태 |
|------|:----:|:----:|
| 보안 | 6.5/10 | 개선 필요 |
| 타입 안전성 | 7.5/10 | 개선 필요 |
| 에러 핸들링 | 8/10 | 양호 |
| 성능 (렌더러) | 7/10 | 개선 필요 |
| 아키텍처 | 8/10 | 양호 |
| 코드 중복 | 7/10 | 개선 필요 |
| 접근성 (a11y) | 5/10 | 미흡 |
| **종합** | **7.1/10** | **리팩토링 권장** |

**코드베이스 규모**: ~6,250 LOC (main 1,520 + renderer 4,730)

---

## 2. Critical (P0) - 배포 전 필수

### 2.1 `new Function()` Code Injection 우회 가능

**파일**: `src/main/services/runner.service.ts:147-148`

```typescript
const fn = new Function('page', `return ${locatorExpr}`)
return fn(page) as Locator
```

- `LOCATOR_FORBIDDEN` 필터가 `constructor` 키워드를 차단하지 않음
- `page.constructor.constructor('malicious code')()` 패턴으로 우회 가능
- workflow import 시 rawLine을 통해 외부 입력이 직접 전달됨

**해결안**:
- (A) LOCATOR_FORBIDDEN에 `constructor`, `__proto__`, `prototype` 추가
- (B) rawLine에서 locator 추출 대신 정규화된 selector만 사용하는 구조로 전환
- (C) workflow import 시 rawLine 제거 (신뢰할 수 없는 소스)

### 2.2 `executeJavaScript` DOM 조작

**파일**: `src/main/index.ts:156`

```typescript
setupWin.webContents.executeJavaScript(
  `document.getElementById('msg').textContent = ${JSON.stringify(msg)}`
)
```

- `JSON.stringify`만으로는 XSS 방지 불충분 (특수 문자 시나리오)
- Electron 보안 가이드에서 `executeJavaScript` 직접 사용을 비권장

**해결안**: IPC 메시지를 통한 상태 업데이트 또는 preload API 사용

### 2.3 `schedule:validate-cron` Preload 미노출

**파일**: `src/preload/index.ts`

- `ipc-handlers.ts`에 핸들러 등록되어 있으나, preload에서 메서드 미노출
- 렌더러에서 cron 표현식 실시간 검증 불가

**해결안**: preload에 `validateScheduleCron` 메서드 추가

### 2.4 `storage.service.ts` Race Condition

**파일**: `src/main/services/storage.service.ts:16-28`

```typescript
let _cache: StorageData | null = null
```

- 동시 IPC 요청 시 load -> modify -> save 과정에서 데이터 덮어쓰기 발생 가능
- 스케줄 실행과 UI 저장이 동시에 일어나면 데이터 손실

**해결안**: 파일 쓰기에 async lock 패턴 적용 (또는 저장 큐)

---

## 3. High (P1) - 1주 내 해결

### 3.1 WorkflowStep Discriminated Union 부재

**파일**: `src/types/workflow.types.ts`

현재 모든 필드가 optional이라 action별 필수 필드를 컴파일 타임에 보장하지 못함.

```typescript
// 현재: 모든 필드 optional
interface WorkflowStep {
  action: ActionType
  selector?: string  // navigate에는 불필요
  value?: string     // click에는 불필요
  url?: string       // fill에는 불필요
  rawLine?: string
}
```

rawLine 누락 시 `runner.service.ts:133`에서 런타임 에러 발생.

**해결안**: action별 discriminated union 타입 정의

```typescript
type NavigateStep = { action: 'navigate'; url: string; rawLine?: string }
type FillStep = { action: 'fill'; selector: string; value: string; rawLine: string }
type ClickStep = { action: 'click'; selector: string; rawLine: string }
// ...
export type WorkflowStep = BaseStep & (NavigateStep | FillStep | ClickStep | ...)
```

### 3.2 IPC 매개변수 딥 검증 부재

**파일**: `src/main/ipc-handlers.ts`

- `runner:start`에서 `Array.isArray(steps)` 체크만 수행
- 각 step 내부 필드(action, selector, rawLine 등) 검증 없음
- 잘못된 구조의 step이 runner까지 도달하여 런타임 에러

**해결안**: zod 또는 수동 validator 함수로 IPC 입력 검증

### 3.3 `workflow-file.service.ts` JSON DoS

**파일**: `src/main/services/workflow-file.service.ts`

- 사용자 선택 파일을 크기 제한 없이 `JSON.parse` 수행
- GB 크기 파일로 메모리 폭발 가능

**해결안**: 파일 크기 제한 (예: 10MB) 후 파싱

### 3.4 Linux 암호화 미보장

**파일**: `src/main/index.ts:189`

- `safeStorage.isEncryptionAvailable()` 실패 시 경고만 출력
- Linux에서 libsecret 미설치 시 OTP secret 등 민감 정보가 평문 저장

**해결안**: 암호화 불가 시 사용자 경고 다이얼로그 + 민감 기능 비활성화

### 3.5 `alert()` 잔존

**파일**: `src/renderer/components/schedule/ScheduleDetail.tsx:54`

```typescript
alert('실행할 step이 없습니다.')
```

- v1 분석에서도 지적된 항목, 여전히 미수정

**해결안**: 인라인 에러 메시지 UI로 교체

---

## 4. Medium (P2) - 2주 내 해결

### 4.1 렌더러 리렌더링 최적화

#### 4.1.1 App.tsx useEffect dependency 문제

**파일**: `src/renderer/App.tsx`

```typescript
useEffect(() => {
  loadFromStorage()
  // ...
}, [loadFromStorage, loadSchedules, ...])
```

- Zustand action을 dependency에 넣으면 불필요한 재실행 가능
- 초기화 로직은 빈 dependency 배열 `[]`로 한 번만 실행해야 함

**해결안**:
```typescript
useEffect(() => {
  useWorkflowStore.getState().loadFromStorage()
  useScheduleStore.getState().loadSchedules()
  useSettingsStore.getState().loadSettings()
}, [])
```

#### 4.1.2 Zustand selector 미분리

**파일**: `src/renderer/components/layout/StepPanel.tsx` 외 다수

```typescript
// 현재: 객체 구조분해 -> 스토어 변경 시 전체 리렌더
const { selectedWorkflowId, runningWorkflowId, setRunning, dialog, openDialog } = useUiStore()

// 개선: 개별 selector -> 해당 값 변경 시에만 리렌더
const selectedWorkflowId = useUiStore(s => s.selectedWorkflowId)
const runningWorkflowId = useUiStore(s => s.runningWorkflowId)
```

**영향 범위**: StepPanel, WorkflowPanel, Toolbar, SchedulePanel 등

#### 4.1.3 StepRow/StepList memo 누락

**파일**: `src/renderer/components/steps/StepRow.tsx`, `StepList.tsx`

- FolderItem, WorkflowItem, ScheduleItem은 `React.memo` 적용됨
- StepRow, StepList는 미적용 -> 워크플로우 편집 시 전체 리스트 리렌더

### 4.2 코드 중복

#### 4.2.1 폴더 트리 로직 중복

- `FolderTree.tsx` (워크플로우 폴더)와 `SchedulePanel.tsx` (스케줄 폴더)에서 재귀 폴더 렌더링 로직 유사
- `_FolderSelectList.tsx`에도 폴더 필터링 로직 존재

**해결안**: 공통 재귀 폴더 트리 컴포넌트 추출

#### 4.2.2 날짜 포맷팅 중복

- `ScheduleItem.tsx`, `ScheduleDetail.tsx`, `ScheduleDialog.tsx`에서 `toLocaleString('ko-KR', ...)` 반복
- 매 렌더마다 `new Date()` 객체 생성

**해결안**: `formatDate` 유틸 함수 추출

#### 4.2.3 IPC CRUD 패턴 중복

**파일**: `src/main/ipc-handlers.ts`

- schedule, schedule-folder CRUD 핸들러가 load -> find/modify -> save 패턴 반복
- 에러 처리 boilerplate 동일

**해결안**: 공통 CRUD 핸들러 팩토리 함수 추출

### 4.3 ScheduleDialog 상태 관리 복잡성

**파일**: `src/renderer/components/schedule/ScheduleDialog.tsx`

- 8개의 `useState` 사용 (folderId, workflowId, type, preset, customCron, scheduledAt, saving, error)
- 상태 간 의존성 복잡

**해결안**: `useReducer` 또는 form 상태 객체로 통합

### 4.4 `<Input>` 공통 컴포넌트 확대 적용

**파일**: `src/renderer/components/ui/Input.tsx`

- 3/4 다이얼로그에서만 사용
- `ScheduleDialog`(5개 input), `OtpSection`(2개 input)에서 미사용

### 4.5 tsconfig include 경로 오류

**파일**: `tsconfig.node.json`

```json
"include": ["electron/**/*"]  // 존재하지 않는 경로
```

실제 파일: `src/main/`, `src/preload/`

### 4.6 package.json poc 스크립트 경로

**파일**: `package.json:11`

```json
"poc": "node poc-codegen.mjs"  // 실제: scripts/poc-codegen.mjs
```

---

## 5. Low (P3) - 개선 권고

### 5.1 접근성 (a11y) 개선

- 대부분의 버튼에 `aria-label` 누락
- 이모지만 있는 버튼 (💾, ▶, ⏹) - 스크린리더 미지원
- 키보드 네비게이션: Tab 순서 미관리, focus trap 없음 (다이얼로그)

### 5.2 `codegen.service.ts:51` unlinkSync

```typescript
try { unlinkSync(tmpFile) } catch { }
```

- 비동기 `unlink` (fs/promises)로 전환 가능
- 메인 스레드 블로킹 최소화

### 5.3 스케줄러 로그 JSON 파일

**파일**: `src/main/services/scheduler.service.ts`

- 로그가 JSON 배열로 저장 -> 로그 증가 시 전체 파일 읽기/쓰기
- 장기적으로 SQLite 또는 append-only 로그 파일 권장

### 5.4 FolderVariable 순환 참조

```
var:a = "{{var:b}}"
var:b = "{{var:a}}"
```

- 현재 무한 재귀 발생 가능
- 변수 해석 시 depth 제한 또는 순환 감지 필요

### 5.5 secure-storage.ts 파일 권한

- Unix 계열에서 `chmod 600` 미설정
- 다른 사용자가 암호화된 파일에 접근 가능

### 5.6 electron-vite.config.ts path alias

- 현재 상대 경로 import (`../../stores`) 사용
- `@/` alias 추가로 가독성 향상 가능

### 5.7 Tailwind 클래스 반복

- 버튼 스타일 (`px-3 py-1 rounded text-sm bg-blue-600 ...`) 여러 컴포넌트에서 반복
- Tailwind `@apply` 또는 공통 버튼 컴포넌트 추출 권장

---

## 6. 강점 (유지할 부분)

| 항목 | 위치 | 설명 |
|------|------|------|
| IPC try/catch 100% | ipc-handlers.ts | 14/14 핸들러 완전 래핑 |
| shell:false 일관 적용 | codegen, setup service | 프로세스 실행 보안 우수 |
| ErrorBoundary | App.tsx | 최상위 에러 바운더리 적용 |
| React.memo 리스트 아이템 | FolderItem, WorkflowItem, ScheduleItem | 리스트 성능 최적화 |
| DialogState discriminated union | uiStore.ts | 타입 안전한 다이얼로그 상태 관리 |
| storage 인메모리 캐시 | storage.service.ts | 반복 파일 읽기 방지 |
| json-storage 유틸 통합 | json-storage.ts | 중복 I/O 패턴 제거 |
| 민감 정보 마스킹 (export) | workflow-file.service.ts | 워크플로우 내보내기 시 마스킹 |
| safeStorage 암호화 | secure-storage.ts | OS 네이티브 암호화 활용 |
| LOCATOR_FORBIDDEN 검증 | runner.service.ts | 기본적인 코드 인젝션 방지 |
| RunResultToast 에러 해석 | RunResultToast.tsx | 사용자 친화적 에러 메시지 |
| cron 동시 실행 방지 | scheduler.service.ts | runningSet 패턴 |

---

## 7. 리팩토링 실행 계획

### Phase 1: 보안 강화 (P0)

| # | 작업 | 파일 | 예상 변경량 |
|---|------|------|:-----------:|
| 1 | LOCATOR_FORBIDDEN 보강 (constructor, __proto__) | runner.service.ts | ~5줄 |
| 2 | workflow import 시 rawLine 검증 | workflow-file.service.ts | ~15줄 |
| 3 | executeJavaScript -> IPC 메시지 전환 | index.ts | ~20줄 |
| 4 | preload에 validateScheduleCron 추가 | preload/index.ts | ~3줄 |
| 5 | storage 쓰기 lock 패턴 적용 | storage.service.ts | ~30줄 |

### Phase 2: 타입 안전성 (P1)

| # | 작업 | 파일 | 예상 변경량 |
|---|------|------|:-----------:|
| 6 | WorkflowStep discriminated union | workflow.types.ts | ~50줄 |
| 7 | IPC 입력 validator 함수 | ipc-handlers.ts | ~40줄 |
| 8 | workflow-file 파일 크기 제한 | workflow-file.service.ts | ~10줄 |
| 9 | alert() 제거 -> 인라인 에러 UI | ScheduleDetail.tsx | ~15줄 |
| 10 | package.json poc 경로 수정 | package.json | 1줄 |

### Phase 3: 렌더러 최적화 (P2)

| # | 작업 | 파일 | 예상 변경량 |
|---|------|------|:-----------:|
| 11 | App.tsx useEffect 빈 배열 | App.tsx | ~10줄 |
| 12 | Zustand selector 분리 | StepPanel 외 4파일 | ~40줄 |
| 13 | StepRow/StepList memo 적용 | StepRow.tsx, StepList.tsx | ~5줄 |
| 14 | 날짜 포맷팅 유틸 추출 | 신규 utils/dateUtils.ts | ~15줄 |
| 15 | ScheduleDialog useReducer 전환 | ScheduleDialog.tsx | ~30줄 |

### Phase 4: 코드 정리 (P2-P3)

| # | 작업 | 파일 | 예상 변경량 |
|---|------|------|:-----------:|
| 16 | `<Input>` 공통 컴포넌트 확대 | ScheduleDialog, OtpSection | ~20줄 |
| 17 | tsconfig include 경로 수정 | tsconfig.node.json | ~3줄 |
| 18 | unlinkSync -> unlink 전환 | codegen.service.ts | ~3줄 |
| 19 | FolderVariable 순환 참조 감지 | runner.service.ts | ~20줄 |
| 20 | aria-label 추가 (주요 버튼) | StepPanel, Toolbar 외 | ~30줄 |

**총 예상 변경량**: ~365줄 (전체 코드의 ~6%)

---

## 8. 이전 분석(v1) 대비 변화

| v1 항목 | v1 상태 | v2 상태 | 비고 |
|---------|:-------:|:-------:|------|
| shell:true 제거 | PASS | PASS | 유지 |
| IPC try/catch 100% | PASS | PASS | 유지 |
| readFileSync 직접호출 0 | PASS | PASS | 유지 |
| 300줄 초과 컴포넌트 0 | PASS | PASS | 유지 |
| 중복 I/O 유틸 통합 | PASS | PASS | 유지 |
| alert() 제거 | FAIL | **FAIL** | 미수정 |
| Input 공통 컴포넌트 확대 | PARTIAL | **PARTIAL** | 미수정 |
| poc 스크립트 경로 | PARTIAL | **PARTIAL** | 미수정 |
| (신규) new Function 우회 | - | **NEW** | 추가 발견 |
| (신규) 렌더러 리렌더링 | - | **NEW** | 추가 발견 |
| (신규) IPC 딥 검증 | - | **NEW** | 추가 발견 |
| (신규) 접근성 | - | **NEW** | 추가 발견 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-02 | Initial refactoring analysis | gap-detector |
| 2.0 | 2026-03-07 | Full code review (main + renderer + types) | 15yr dev review |
