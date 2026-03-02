# Design: workflow-file-sharing

> Plan 참조: [workflow-file-sharing.plan.md](../../01-plan/features/workflow-file-sharing.plan.md)

---

## 1. 전체 아키텍처

```
[Renderer: WorkflowItem]           [Renderer: Toolbar]
         │ Export 클릭                    │ Import 클릭
         ▼                               ▼
[ipc: workflow:export]          [ipc: workflow:import]
         │                               │
         ▼                               ▼
[Main: workflow-file.service.ts]──────────┘
   - maskSensitiveSteps()
   - dialog.showSaveDialog()
   - dialog.showOpenDialog()
   - fs.writeFile / fs.readFile
         │                               │
    .rfworkflow 파일 저장          파일 파싱 + 반환
                                         │
                              [Renderer: ImportWorkflowDialog]
                                  폴더 선택 + 마스킹 안내
                                         │
                              [workflowStore.importWorkflow()]
                                  스토리지에 저장
```

---

## 2. 타입 정의

### 파일: `src/types/workflow.types.ts` (추가)

```typescript
// 내보내기 파일 포맷
export interface WorkflowExportFile {
  rfworkflowVersion: '1.0'
  exportedAt: string
  workflow: {
    name: string
    steps: WorkflowStepExport[]
  }
}

// 내보내기용 스텝 (내부 id 제거, 마스킹 메타 추가)
export interface WorkflowStepExport {
  order: number
  action: ActionType
  selector?: string
  value?: string
  url?: string
  rawLine?: string         // 마스킹 시 null (보안상 제거)
  _masked?: true           // 마스킹된 스텝 표시
  _sensitiveType?: string  // 'password' | 'username' | 'email' | 'otp' | 'id'
}

// ElectronAPI 추가 메서드
// exportWorkflow: (workflow: Workflow) => Promise<{ cancelled: boolean }>
// importWorkflow: () => Promise<{ cancelled: boolean; file?: WorkflowExportFile; error?: string }>
```

**ElectronAPI 인터페이스 추가:**
```typescript
exportWorkflow: (workflow: Workflow) => Promise<{ cancelled: boolean }>
importWorkflow: () => Promise<{ cancelled: boolean; file?: WorkflowExportFile; error?: string }>
```

---

## 3. Main 서비스

### 파일: `src/main/services/workflow-file.service.ts` (신규)

#### 3-1. 민감 정보 감지 규칙

```typescript
const SENSITIVE_RULES = [
  { pattern: /password|passwd|pwd/i,           type: 'password', placeholder: '{{password}}' },
  { pattern: /username|userid|user_id|loginid/i, type: 'username', placeholder: '{{username}}' },
  { pattern: /\bemail\b/i,                     type: 'email',    placeholder: '{{email}}' },
  { pattern: /\botp\b|\btotp\b|\bmfa\b|\b2fa\b/i, type: 'otp',  placeholder: '{{otp}}' },
  { pattern: /(?:^|[\s\[#"'=])(id)(?:[\s\]"'=]|$)/i, type: 'id', placeholder: '{{id}}' },
] as const
```

감지 대상 필드: `selector` 값 (대소문자 무관 포함 검사)

OTP 토큰 특별 처리: `value`가 `{{otp:...}}` 패턴이면 selector 무관하게 마스킹 → `{{otp}}`

#### 3-2. `maskSensitiveSteps(steps: WorkflowStep[]): WorkflowStepExport[]`

```
각 step에 대해:
  1. action === 'fill' 인 경우만 검사
  2. value가 {{otp:...}} 패턴이면 → 마스킹 (type: 'otp')
  3. selector에 SENSITIVE_RULES 순서대로 매칭 → 첫 번째 매칭으로 마스킹
  4. 마스킹 시:
     - value → placeholder ('{{password}}' 등)
     - rawLine → undefined (원본 실행 코드에서 값 노출 방지)
     - _masked → true
     - _sensitiveType → 감지된 타입
  5. 비민감 스텝: id 제거 후 그대로 복사
```

#### 3-3. `buildExportFile(workflow: Workflow): WorkflowExportFile`

```typescript
{
  rfworkflowVersion: '1.0',
  exportedAt: new Date().toISOString(),
  workflow: {
    name: workflow.name,
    steps: maskSensitiveSteps(workflow.steps)
  }
}
```

#### 3-4. `saveWorkflowToFile(workflow: Workflow): Promise<{ cancelled: boolean }>`

```
1. buildExportFile(workflow) 호출
2. dialog.showSaveDialog({
     defaultPath: `${workflow.name}.rfworkflow`,
     filters: [{ name: 'RecordFlow Workflow', extensions: ['rfworkflow'] }]
   })
3. cancelled → return { cancelled: true }
4. JSON.stringify(exportFile, null, 2) → fs.writeFile(filePath, content, 'utf-8')
5. return { cancelled: false }
```

#### 3-5. `loadWorkflowFromFile(): Promise<{ cancelled: boolean; file?: WorkflowExportFile; error?: string }>`

```
1. dialog.showOpenDialog({
     filters: [{ name: 'RecordFlow Workflow', extensions: ['rfworkflow'] }],
     properties: ['openFile']
   })
2. cancelled → return { cancelled: true }
3. fs.readFile(filePath, 'utf-8') → JSON.parse
4. 유효성 검사:
   - rfworkflowVersion 존재 여부
   - workflow.name 문자열 여부
   - workflow.steps 배열 여부
5. 실패 → return { cancelled: false, error: '유효하지 않은 워크플로우 파일입니다.' }
6. 성공 → return { cancelled: false, file: parsed }
```

---

## 4. IPC 핸들러

### 파일: `src/main/ipc-handlers.ts` (추가)

```typescript
// Export
ipcMain.handle('workflow:export', async (_event, workflow: Workflow) => {
  return await saveWorkflowToFile(workflow)
})

// Import
ipcMain.handle('workflow:import', async () => {
  return await loadWorkflowFromFile()
})
```

---

## 5. Preload

### 파일: `src/preload/index.ts` (추가)

```typescript
exportWorkflow: (workflow: Workflow): Promise<{ cancelled: boolean }> =>
  ipcRenderer.invoke('workflow:export', workflow),

importWorkflow: (): Promise<{ cancelled: boolean; file?: WorkflowExportFile; error?: string }> =>
  ipcRenderer.invoke('workflow:import'),
```

---

## 6. Renderer 컴포넌트

### 6-1. WorkflowItem 컨텍스트 메뉴 (수정)

**파일:** `src/renderer/components/workflow/WorkflowItem.tsx`

```typescript
const handleExport = async () => {
  const result = await window.electronAPI.exportWorkflow(workflow)
  if (!result.cancelled) {
    // 성공 토스트 (RunResultToast 대신 간단한 상태로 처리)
    // uiStore에 toast 상태 추가 또는 기존 패턴 활용
  }
}

const menuItems = [
  { label: 'Export',        onClick: handleExport },   // ← 새로 추가
  { label: 'Rename',        onClick: () => openDialog({ type: 'rename-workflow', ... }) },
  { label: 'Move to Folder', onClick: () => openDialog({ type: 'move-workflow', ... }) },
  { label: 'Delete',        danger: true, onClick: ... }
]
```

### 6-2. Toolbar Import 버튼 (수정)

**파일:** `src/renderer/components/layout/Toolbar.tsx`

```tsx
const handleImport = async () => {
  const result = await window.electronAPI.importWorkflow()
  if (result.cancelled) return
  if (result.error) {
    // 오류 표시 (간단한 alert 또는 toast)
    return
  }
  if (result.file) {
    openDialog({ type: 'import-workflow', file: result.file })
  }
}

// 버튼 추가 (Record 버튼 왼쪽)
<button onClick={handleImport} className="px-3 py-1 text-xs rounded ...">
  ↑ Import
</button>
```

### 6-3. ImportWorkflowDialog (신규)

**파일:** `src/renderer/components/dialogs/ImportWorkflowDialog.tsx`

**DialogState 추가 (uiStore.ts):**
```typescript
| { type: 'import-workflow'; file: WorkflowExportFile }
```

**UI 구성:**

```
┌─────────────────────────────────────────┐
│  Import Workflow                    [×] │
├─────────────────────────────────────────┤
│  워크플로우: "네이버 로그인"             │
│  스텝 수: 8개                           │
│                                         │
│  저장할 폴더 선택:                       │
│  ┌───────────────────────────────────┐  │
│  │ 📁 My Workflows                   │  │
│  │   📁 Login Scripts  ← 선택됨      │  │
│  │   📁 Tests                        │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ⚠️  2개 스텝에 민감 정보가 마스킹됨    │
│  가져온 후 직접 값을 입력해 주세요.     │
│  • step 3: fill → {{id}}               │
│  • step 4: fill → {{password}}          │
│                                         │
│         [취소]        [가져오기]         │
└─────────────────────────────────────────┘
```

**로직:**
```
1. file.workflow.steps에서 _masked === true인 스텝 목록 추출
2. 폴더 트리 표시 (FolderTree 재사용 or 단순 라디오 목록)
3. 폴더 선택 상태 관리 (useState)
4. "가져오기" 클릭:
   workflowStore.importWorkflow(file, selectedFolderId)
   closeDialog()
```

### 6-4. WorkflowStore 액션 추가

**파일:** `src/renderer/stores/workflowStore.ts`

```typescript
importWorkflow: (file: WorkflowExportFile, folderId: string) => void
```

**구현:**
```
1. 이름 중복 처리:
   - 같은 folderId 내에 동일 name이 있으면 "(2)", "(3)" 추가
2. WorkflowStep[] 생성:
   - 각 step에 crypto.randomUUID() 부여
   - order는 배열 인덱스로 재할당
3. createWorkflow(resolvedName, folderId, steps) 호출
```

---

## 7. 토스트 알림 설계

기존 `RunResultToast`는 실행 결과용이므로, Import/Export 결과는 별도 방식으로 처리:

**옵션 A (권장):** `uiStore`에 `toast: { message: string; type: 'success' | 'error' } | null` 추가
- 3초 후 자동 사라짐
- `Toolbar` 하단에 렌더링

**옵션 B:** `window.alert` / Electron `dialog.showMessageBox` 활용 (간단하지만 UX 낮음)

→ **옵션 A 채택**: uiStore에 `showToast(message, type)` 추가

---

## 8. 오류 처리

| 상황 | 처리 방식 |
|------|----------|
| Export 저장 대화상자 취소 | 아무 동작 없음 (정상) |
| Export 파일 쓰기 실패 | 오류 toast 표시 |
| Import 파일 선택 취소 | 아무 동작 없음 (정상) |
| Import 파일 파싱 실패 | 오류 toast: "유효하지 않은 워크플로우 파일입니다." |
| Import 파일 버전 불일치 | 오류 toast: "지원하지 않는 파일 버전입니다." |
| Import 폴더 미선택 후 확인 | "폴더를 선택해 주세요" 인라인 메시지 |

---

## 9. 구현 순서 (Do Phase 체크리스트)

### Step 1 - 타입 추가
- [ ] `workflow.types.ts`: `WorkflowExportFile`, `WorkflowStepExport` 타입
- [ ] `workflow.types.ts`: `ElectronAPI` 인터페이스에 `exportWorkflow`, `importWorkflow` 추가
- [ ] `uiStore.ts`: `DialogState`에 `import-workflow` 추가
- [ ] `uiStore.ts`: `toast` 상태 및 `showToast` / `clearToast` 액션 추가

### Step 2 - Main 서비스
- [ ] `src/main/services/workflow-file.service.ts` 신규 생성
  - [ ] `maskSensitiveSteps()`
  - [ ] `buildExportFile()`
  - [ ] `saveWorkflowToFile()`
  - [ ] `loadWorkflowFromFile()`

### Step 3 - IPC 연결
- [ ] `ipc-handlers.ts`: `workflow:export`, `workflow:import` 핸들러 등록
- [ ] `preload/index.ts`: `exportWorkflow`, `importWorkflow` 노출

### Step 4 - Store
- [ ] `workflowStore.ts`: `importWorkflow(file, folderId)` 액션 추가

### Step 5 - UI 컴포넌트
- [ ] `WorkflowItem.tsx`: Export 메뉴 항목 + `handleExport` 함수
- [ ] `Toolbar.tsx`: Import 버튼 + `handleImport` 함수 + Toast 렌더링
- [ ] `ImportWorkflowDialog.tsx` 신규 생성
- [ ] `App.tsx` 또는 다이얼로그 렌더러에 `ImportWorkflowDialog` 등록

---

## 10. 파일 포맷 예시

```json
{
  "rfworkflowVersion": "1.0",
  "exportedAt": "2026-03-02T12:00:00.000Z",
  "workflow": {
    "name": "네이버 로그인",
    "steps": [
      {
        "order": 0,
        "action": "navigate",
        "url": "https://naver.com",
        "rawLine": "await page.goto('https://naver.com')"
      },
      {
        "order": 1,
        "action": "click",
        "selector": "getByRole('link', { name: '로그인' })",
        "rawLine": "await page.getByRole('link', { name: '로그인' }).click()"
      },
      {
        "order": 2,
        "action": "fill",
        "selector": "locator('#id')",
        "value": "{{id}}",
        "_masked": true,
        "_sensitiveType": "id"
      },
      {
        "order": 3,
        "action": "fill",
        "selector": "locator('#pw')",
        "value": "{{password}}",
        "_masked": true,
        "_sensitiveType": "password"
      },
      {
        "order": 4,
        "action": "click",
        "selector": "getByRole('button', { name: '로그인' })",
        "rawLine": "await page.getByRole('button', { name: '로그인' }).click()"
      }
    ]
  }
}
```

---

*작성일: 2026-03-02*
