# Design: Playwright Codegen GUI

**Feature ID**: playwright-codegen-gui
**Created**: 2026-02-26
**Status**: Design
**Plan Reference**: [playwright-codegen-gui.plan.md](../../01-plan/features/playwright-codegen-gui.plan.md)

---

## 1. 아키텍처 개요

Electron의 Main / Renderer 2-프로세스 구조를 기반으로 한다.
Playwright codegen 실행은 Main 프로세스에서 담당하고, UI는 Renderer 프로세스(React)에서 담당한다.

```
┌─────────────────────────────────────────────────────────────────┐
│  Renderer Process (React + Zustand)                             │
│  WorkflowPanel ←→ StepPanel ←→ Dialogs                         │
│       ↕ IPC (contextBridge)                                     │
├─────────────────────────────────────────────────────────────────┤
│  Main Process (Node.js)                                         │
│  CodegenService  StorageService  RunnerService                  │
│       ↕                ↕                ↕                       │
│  child_process   workflows.json   child_process                 │
│  (playwright)    (AppData)        (playwright)                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 디렉터리 구조 (File Tree)

```
RecordFlow/
├── electron/
│   ├── main.ts                      # Electron 진입점, BrowserWindow 생성, IPC 핸들러 등록
│   ├── preload.ts                   # contextBridge로 IPC API 노출
│   └── services/
│       ├── codegen.service.ts       # playwright codegen child_process 실행/종료
│       ├── storage.service.ts       # workflows.json 읽기/쓰기 (AppData 경로)
│       ├── runner.service.ts        # 저장된 workflow step 실행
│       └── parser.service.ts        # codegen 출력 .ts → WorkflowStep[] 파싱
├── src/
│   ├── main.tsx                     # React 진입점
│   ├── App.tsx                      # AppLayout 렌더링
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx        # Toolbar + 좌우 패널 전체 레이아웃
│   │   │   ├── Toolbar.tsx          # 상단 툴바 ([Record] [Run] [Settings])
│   │   │   ├── WorkflowPanel.tsx    # 좌측 패널 래퍼 (30%)
│   │   │   └── StepPanel.tsx        # 우측 패널 래퍼 (70%)
│   │   ├── workflow/
│   │   │   ├── FolderTree.tsx       # 폴더 목록 전체 (folders + 하위 workflows 렌더)
│   │   │   ├── FolderItem.tsx       # 폴더 행 (펼치기/접기, 우클릭 메뉴)
│   │   │   ├── WorkflowItem.tsx     # workflow 행 (선택, 우클릭 메뉴)
│   │   │   └── ContextMenu.tsx      # 우클릭 컨텍스트 메뉴 (공통)
│   │   ├── steps/
│   │   │   ├── StepList.tsx         # step 목록 + [+ Add Step] [▶ Run] 버튼
│   │   │   ├── StepRow.tsx          # step 행 (ActionBadge + 셀렉터/값 + [↑][↓][🗑])
│   │   │   └── ActionBadge.tsx      # 액션 타입 컬러 배지 (navigate/click/fill 등)
│   │   └── dialogs/
│   │       ├── NewWorkflowDialog.tsx    # workflow 이름 + 시작 URL 입력
│   │       ├── NewFolderDialog.tsx      # 폴더 이름 입력
│   │       └── MoveWorkflowDialog.tsx   # 이동할 폴더 선택
│   ├── stores/
│   │   ├── workflowStore.ts         # 폴더/workflow/step 데이터 상태 + 액션
│   │   └── uiStore.ts               # 선택 상태, 다이얼로그, 실행 상태
│   ├── hooks/
│   │   └── useIpc.ts                # IPC 이벤트 구독 훅 (codegen:complete 등)
│   ├── services/
│   │   └── ipc.service.ts           # window.electronAPI 호출 래퍼 함수들
│   └── types/
│       └── workflow.types.ts        # 공유 타입 (WorkflowFolder, Workflow, WorkflowStep)
├── electron-vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 3. 타입 정의 (Types)

```typescript
// src/types/workflow.types.ts

export interface WorkflowFolder {
  id: string;           // nanoid()
  name: string;
  createdAt: string;    // ISO 8601
}

export interface Workflow {
  id: string;           // nanoid()
  name: string;
  folderId: string;     // 반드시 폴더에 속함
  createdAt: string;
  updatedAt: string;
  steps: WorkflowStep[];
}

export type ActionType =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'select'
  | 'expect'
  | 'wait';

export interface WorkflowStep {
  id: string;           // nanoid()
  order: number;        // 0-based index
  action: ActionType;
  selector?: string;    // CSS selector or text locator
  value?: string;       // fill 값, select 옵션 등
  url?: string;         // navigate, expect(url) 전용
}

// 스토리지 파일 루트
export interface StorageData {
  version: '1.0';
  folders: WorkflowFolder[];
  workflows: Workflow[];
}
```

---

## 4. IPC 채널 설계

### 4-1. 채널 목록

| 채널 | 방향 | 설명 |
|------|------|------|
| `storage:load` | Renderer → Main | workflows.json 전체 로드 |
| `storage:save` | Renderer → Main | workflows.json 전체 저장 |
| `codegen:start` | Renderer → Main | playwright codegen 프로세스 시작 |
| `codegen:stop` | Renderer → Main | 실행 중인 codegen 프로세스 강제 종료 |
| `codegen:complete` | Main → Renderer | codegen 종료 + 파싱된 steps 전달 |
| `codegen:error` | Main → Renderer | codegen 실행 오류 전달 |
| `runner:start` | Renderer → Main | workflow 실행 시작 |
| `runner:step-update` | Main → Renderer | 현재 실행 중인 step index 전달 |
| `runner:complete` | Main → Renderer | 실행 완료 (성공/실패 결과) |

### 4-2. preload.ts contextBridge API

```typescript
// electron/preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  // Storage
  loadStorage: () => ipcRenderer.invoke('storage:load'),
  saveStorage: (data: StorageData) => ipcRenderer.invoke('storage:save', data),

  // Codegen
  startCodegen: (url: string, outputPath: string) =>
    ipcRenderer.invoke('codegen:start', { url, outputPath }),
  stopCodegen: () => ipcRenderer.invoke('codegen:stop'),
  onCodegenComplete: (cb: (steps: WorkflowStep[]) => void) =>
    ipcRenderer.on('codegen:complete', (_, steps) => cb(steps)),
  onCodegenError: (cb: (err: string) => void) =>
    ipcRenderer.on('codegen:error', (_, err) => cb(err)),

  // Runner
  startRunner: (steps: WorkflowStep[]) =>
    ipcRenderer.invoke('runner:start', steps),
  onRunnerStepUpdate: (cb: (index: number) => void) =>
    ipcRenderer.on('runner:step-update', (_, index) => cb(index)),
  onRunnerComplete: (cb: (result: RunnerResult) => void) =>
    ipcRenderer.on('runner:complete', (_, result) => cb(result)),

  // Cleanup listeners
  removeAllListeners: (channel: string) =>
    ipcRenderer.removeAllListeners(channel),
});
```

---

## 5. Zustand 스토어 설계

### 5-1. workflowStore

```typescript
// src/stores/workflowStore.ts
interface WorkflowState {
  folders: WorkflowFolder[];
  workflows: Workflow[];

  // Folder 액션
  createFolder: (name: string) => void;
  deleteFolder: (id: string) => void;        // 폴더 내 workflow도 함께 삭제
  renameFolder: (id: string, name: string) => void;

  // Workflow 액션
  createWorkflow: (name: string, folderId: string, steps?: WorkflowStep[]) => Workflow;
  deleteWorkflow: (id: string) => void;
  renameWorkflow: (id: string, name: string) => void;
  moveWorkflow: (id: string, targetFolderId: string) => void;
  updateSteps: (workflowId: string, steps: WorkflowStep[]) => void;

  // Step 액션
  addStep: (workflowId: string, step: Omit<WorkflowStep, 'id' | 'order'>) => void;
  deleteStep: (workflowId: string, stepId: string) => void;
  moveStepUp: (workflowId: string, stepId: string) => void;
  moveStepDown: (workflowId: string, stepId: string) => void;

  // 영속화
  loadFromStorage: () => Promise<void>;
  persistToStorage: () => Promise<void>;
}
```

### 5-2. uiStore

```typescript
// src/stores/uiStore.ts
type DialogType = 'new-workflow' | 'new-folder' | 'move-workflow' | null;

interface UiState {
  selectedWorkflowId: string | null;
  selectedFolderId: string | null;
  expandedFolderIds: string[];

  dialog: {
    type: DialogType;
    targetFolderId?: string;    // new-workflow, move-workflow용
    targetWorkflowId?: string;  // move-workflow용
  };

  // 실행 상태
  runningWorkflowId: string | null;
  currentStepIndex: number | null;

  // 액션
  selectWorkflow: (id: string | null) => void;
  selectFolder: (id: string | null) => void;
  toggleFolder: (id: string) => void;
  openDialog: (type: DialogType, opts?: object) => void;
  closeDialog: () => void;
  setRunning: (workflowId: string | null, stepIndex: number | null) => void;
}
```

---

## 6. Codegen 연동 흐름

```
사용자: [+ New Workflow] 클릭
    │
    ▼
NewWorkflowDialog 표시
  - workflow 이름 입력
  - 시작 URL 입력
    │
    ▼
ipc.service: startCodegen(url, tempFilePath)
    │
    ▼
[Main] codegen.service.ts
  - tmpFile = os.tmpdir() + '/' + nanoid() + '.ts'
  - proc = spawn('npx', ['playwright', 'codegen', '--output', tmpFile, url], {
      env: { ...process.env, PWDEBUG: '0' }   // Inspector 창 숨김
    })
  - proc.on('close', () => { steps = parser.parse(tmpFile); send('codegen:complete', steps) })
    │
    ▼ (사용자가 브라우저에서 동작 기록 후 닫음)
    │
[Main] 파일 읽기 → parser.service.parse(tsCode) → WorkflowStep[]
    │
    ▼
Renderer: onCodegenComplete(steps) 수신
  → workflowStore.createWorkflow(name, folderId, steps)
  → workflowStore.persistToStorage()
  → uiStore.selectWorkflow(newWorkflow.id)
```

---

## 7. 스크립트 파서 설계

### 7-1. 파싱 대상 패턴 (정규식 기반)

```typescript
// electron/services/parser.service.ts

// Playwright codegen이 생성하는 locator 유형 (우선순위 순)
// getByRole > getByLabel > getByPlaceholder > getByText > getByTestId > locator(css) > locator(xpath)

const LOCATOR = `(?:locator|getByRole|getByText|getByLabel|getByPlaceholder|getByTestId|getByAltText|getByTitle)`;

const PATTERNS: Array<{ action: ActionType; regex: RegExp; extract: (m: RegExpMatchArray) => Partial<WorkflowStep> }> = [
  {
    // page.goto('url')
    action: 'navigate',
    regex: /page\.goto\(['"`](.+?)['"`]\)/,
    extract: (m) => ({ url: m[1] }),
  },
  {
    // page.getByRole(...).click() | page.locator(...).click()
    action: 'click',
    regex: new RegExp(`page\\.${LOCATOR}\\((.+?)\\)\\.click\\(\\)`),
    extract: (m) => ({ selector: m[1] }),
  },
  {
    // page.getByLabel(...).fill('value') | page.locator(...).fill('value')
    action: 'fill',
    regex: new RegExp(`page\\.${LOCATOR}\\((.+?)\\)\\.fill\\(['"\`](.+?)['"\`]\\)`),
    extract: (m) => ({ selector: m[1], value: m[2] }),
  },
  {
    // page.getByLabel(...).selectOption('value')
    action: 'select',
    regex: new RegExp(`page\\.${LOCATOR}\\((.+?)\\)\\.selectOption\\(['"\`](.+?)['"\`]\\)`),
    extract: (m) => ({ selector: m[1], value: m[2] }),
  },
  {
    // expect(page).toHaveURL('url')
    action: 'expect',
    regex: /expect\(page\)\.toHaveURL\(['"`](.+?)['"`]\)/,
    extract: (m) => ({ url: m[1] }),
  },
  {
    // expect(page.getByRole(...)).toBeVisible() 등 엘리먼트 단위 assertion
    action: 'expect',
    regex: new RegExp(`expect\\(page\\.${LOCATOR}\\((.+?)\\)\\)\\.to\\w+\\(.*?\\)`),
    extract: (m) => ({ selector: m[1] }),
  },
  {
    // page.waitForSelector('selector')
    action: 'wait',
    regex: /page\.waitForSelector\(['"`](.+?)['"`]\)/,
    extract: (m) => ({ selector: m[1] }),
  },
];
```

> 패턴 미매칭 라인은 skip. 파싱 실패 시 빈 배열 반환 후 `codegen:error` 전송.

---

## 8. 데이터 저장 구조

### 8-1. 저장 경로

```
Windows: %APPDATA%\RecordFlow\workflows.json
```

### 8-2. workflows.json 스키마

```json
{
  "version": "1.0",
  "folders": [
    { "id": "f1", "name": "E2E Tests", "createdAt": "2026-02-26T07:00:00Z" }
  ],
  "workflows": [
    {
      "id": "w1",
      "name": "Login Test",
      "folderId": "f1",
      "createdAt": "2026-02-26T07:00:00Z",
      "updatedAt": "2026-02-26T07:00:00Z",
      "steps": [
        { "id": "s1", "order": 0, "action": "navigate", "url": "https://app.co/login" },
        { "id": "s2", "order": 1, "action": "fill", "selector": "#email", "value": "user@test.com" },
        { "id": "s3", "order": 2, "action": "click", "selector": "button[type=submit]" }
      ]
    }
  ]
}
```

---

## 9. 컴포넌트 책임 정의

| 컴포넌트 | Props | 책임 |
|----------|-------|------|
| `AppLayout` | - | Toolbar + 좌우 패널 배치 (CSS Grid) |
| `Toolbar` | - | [Record] [Run] [Settings] 버튼, uiStore에서 runningWorkflowId 구독 |
| `WorkflowPanel` | - | FolderTree 렌더, 패널 하단 [+ New Folder] [+ New Workflow] |
| `FolderTree` | folders, workflows | 폴더별 WorkflowItem 목록 렌더 |
| `FolderItem` | folder, isExpanded | 펼치기/접기 toggle, 우클릭 → ContextMenu |
| `WorkflowItem` | workflow, isSelected | 클릭 → selectWorkflow, 우클릭 → ContextMenu |
| `ContextMenu` | items, position | 절대 위치 메뉴 (포털 렌더) |
| `StepPanel` | - | 선택된 workflow의 이름 + 삭제 + StepList |
| `StepList` | steps | StepRow 목록 + [+ Add Step] [▶ Run] |
| `StepRow` | step, onMoveUp, onMoveDown, onDelete | ActionBadge + 셀렉터/값 + 편집 버튼 |
| `ActionBadge` | action | 액션별 컬러 배지 (tailwind variant) |
| `NewWorkflowDialog` | folderId, onConfirm | 이름 + URL 입력 form |
| `NewFolderDialog` | onConfirm | 이름 입력 form |
| `MoveWorkflowDialog` | workflowId, folders, onConfirm | 폴더 선택 radio |

---

## 10. 구현 순서 (마일스톤 → 파일)

| 마일스톤 | 주요 작업 파일 |
|---------|--------------|
| M0 POC | `electron/services/codegen.service.ts`, `electron/services/parser.service.ts` (단독 Node.js 스크립트로 먼저 검증) |
| M1 레이아웃 | `electron/main.ts`, `electron/preload.ts`, `src/App.tsx`, `AppLayout`, `Toolbar`, `WorkflowPanel`, `StepPanel` |
| M2 CRUD | `electron/services/storage.service.ts`, `src/stores/workflowStore.ts`, `src/stores/uiStore.ts`, `FolderTree`, `FolderItem`, `WorkflowItem`, `ContextMenu`, Dialogs |
| M3 codegen 연동 | `src/services/ipc.service.ts`, `src/hooks/useIpc.ts`, `NewWorkflowDialog` 연동, `workflowStore.createWorkflow` |
| M4 step 편집 | `StepList`, `StepRow`, `ActionBadge` |
| M5 실행 | `electron/services/runner.service.ts`, `runner:*` IPC, `uiStore.setRunning`, `StepRow` 하이라이트 |
| M6 드래그&드롭 | `FolderTree` dnd-kit 또는 react-beautiful-dnd 적용 |

---

## 11. 패키지 목록

```json
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "zustand": "^4",
    "nanoid": "^5",
    "@playwright/test": "^1.40"
  },
  "devDependencies": {
    "electron": "^28",
    "electron-vite": "^1",
    "electron-builder": "^24",
    "typescript": "^5",
    "@types/react": "^18",
    "tailwindcss": "^3",
    "autoprefixer": "^10",
    "postcss": "^8"
  }
}
```

---

## 12. 미결 사항 (Open Questions)

| # | 질문 | 상태 | 결정 |
|---|------|------|------|
| ~~OQ-01~~ | ~~`npx playwright codegen` vs 로컬 설치 playwright 경로?~~ | ✅ 해소 | `npx playwright codegen` 사용. `PWDEBUG: '0'` env로 Inspector 숨김 |
| OQ-02 | Step 추가 다이얼로그 — 수동 입력 vs 제한된 폼 선택? | 미결 | M4 시작 전 결정 |
| OQ-03 | 실행(runner) 시 headless vs headed 모드? | 미결 | M5 시작 전 결정 |

> **OQ-01 참고**: `PWDEBUG=0` 으로 Inspector를 숨기는 방식은 Playwright 버전에 따라 동작이 다를 수 있음. M0 POC에서 실제 동작 검증 필요.
