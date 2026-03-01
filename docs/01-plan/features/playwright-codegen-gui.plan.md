# Plan: Playwright Codegen GUI

**Feature ID**: playwright-codegen-gui
**Created**: 2026-02-26
**Status**: Planning
**Priority**: High

---

## 1. 개요 (Overview)

Playwright Codegen 기능을 Windows 데스크톱 GUI에서 사용할 수 있도록 하는 애플리케이션을 개발한다.
브라우저 조작을 코드로 자동 기록하는 Playwright의 codegen 기능을 GUI 기반으로 제공하며,
생성된 workflow들을 디렉터리 구조로 관리하고 시각적으로 확인할 수 있다.

---

## 2. 문제 정의 (Problem Statement)

- Playwright codegen은 CLI 기반으로만 사용 가능하여 진입장벽이 높다
- 생성된 스크립트들을 체계적으로 관리하는 도구가 없다
- 기록된 workflow의 흐름을 시각적으로 파악하기 어렵다
- 비개발자도 쉽게 자동화 스크립트를 생성·관리할 수 있는 GUI 도구가 필요하다

---

## 3. 목표 (Goals)

- [ ] Windows 데스크톱 앱으로 Playwright codegen 실행 및 제어
- [ ] Workflow들을 디렉터리(폴더) 형태로 생성·관리·정렬
- [ ] 좌측 패널: 디렉터리 트리 형태의 workflow 목록
- [ ] 우측 패널: 선택한 workflow의 내부 흐름(step) 시각화
- [ ] Workflow 실행(Play) 기능

---

## 4. 비목표 (Non-Goals)

- 크로스플랫폼 지원 (macOS/Linux) — 1차 버전은 Windows 전용
- 클라우드 동기화 기능
- 팀 협업 기능 (공유, 권한 관리 등)
- 중첩 폴더 (폴더 안의 폴더) — 1단계 폴더 구조만 지원 (폴더 → workflow)

---

## 5. 사용자 시나리오 (User Stories)

### US-01: Workflow 생성
> 사용자는 새 workflow를 생성하고, Playwright codegen으로 브라우저 동작을 기록한다.

**수락 조건**:
- 폴더/그룹 선택 후 "New Workflow" 실행
- workflow 이름 및 시작 URL 입력 다이얼로그 표시 (URL은 `playwright codegen --output=<file>.ts <url>` 에 전달)
- 확인 후 codegen 브라우저 창이 열리고 동작 기록 시작
- 기록 종료(브라우저 닫기) 시 출력 파일을 파싱하여 step 목록이 저장됨

### US-02: Workflow 디렉터리 관리
> 사용자는 workflow를 폴더로 분류하여 관리한다.

**수락 조건**:
- 좌측 패널에서 폴더 생성/삭제/이름변경 가능
- 우클릭 컨텍스트 메뉴로 workflow를 다른 폴더로 이동 가능 (기본 이동 방식)
- 폴더 펼치기/접기 지원

> 드래그&드롭 이동은 M6(UX 개선)에서 추가 구현 (US-02 기본 이동은 컨텍스트 메뉴로 충족)

### US-03: Workflow 흐름 확인
> 사용자는 우측 패널에서 선택한 workflow의 각 step을 순서대로 확인한다.

**수락 조건**:
- 각 step에 액션 타입(click, fill, navigate 등) 표시
- 각 step의 셀렉터 및 입력값 표시
- step 순서 변경, 삭제 가능

### US-04: Workflow 실행
> 사용자는 저장된 workflow를 실행하여 자동화를 수행한다.

**수락 조건**:
- 실행 중 현재 step 하이라이트
- 실행 성공/실패 결과 표시

---

## 6. 기술 스택 후보 (Tech Stack Candidates)

| 항목 | 옵션 A | 옵션 B | 결정 |
|------|--------|--------|------|
| 프레임워크 | Electron | Tauri | **Electron** (Node.js 기반, Playwright 연동 용이) |
| UI | React + TypeScript | Vue | **React + TypeScript** |
| 스타일 | Tailwind CSS | CSS Modules | **Tailwind CSS** |
| 상태관리 | Zustand | Redux | **Zustand** (경량) |
| 데이터 저장 | 로컬 JSON 파일 | SQLite | **로컬 JSON 파일** (MVP 단계) |
| Playwright 연동 | Node.js child_process | IPC | **Electron IPC + child_process** |
| 빌드 도구 | electron-vite | webpack | **electron-vite** (Vite 기반, HMR 지원, 설정 단순) |
| 패키징 | electron-builder | electron-forge | **electron-builder** (Windows .exe 인스톨러 생성) |

> **codegen IPC 패턴**: `playwright codegen --output=<file>.ts <url>` 실행 후 프로세스 `close` 이벤트로 완료 감지 → 파일 읽기. 실시간 스트리밍이 아닌 **파일 기반 완료 감지** 방식 사용.
>
> **스크립트 파싱**: codegen 출력(`.ts`)을 `WorkflowStep[]`으로 변환하는 파서 필요. `@typescript-eslint/typescript-estree` 또는 정규식 기반 파서 사용.

---

## 7. UI 구조 (Layout)

```
┌─────────────────────────────────────────────────────────────┐
│  [RecordFlow]                    [Record] [Run] [Settings]  │  ← 상단 툴바
├──────────────────────┬──────────────────────────────────────┤
│  WORKFLOWS           │  workflow: Login Test    [🗑 Delete] │
│  ─────────────────   │  ──────────────────────────────────  │
│  📁 E2E Tests        │  Step 1  navigate  https://app.co  [↑][↓][🗑] │
│    📄 Login Test ←   │  Step 2  fill      #email          [↑][↓][🗑] │
│    📄 Signup Test    │  Step 3  fill      #password       [↑][↓][🗑] │
│  📁 Smoke Tests      │  Step 4  click     button[Login]   [↑][↓][🗑] │
│    📄 Home Check     │  Step 5  expect    url contains /. [↑][↓][🗑] │
│  📁 Regression       │                                      │
│  ─────────────────   │  [+ Add Step]  [▶ Run]              │
│  [+ New Folder]      │                                      │
│  [+ New Workflow]    │                                      │
└──────────────────────┴──────────────────────────────────────┘
   좌측 패널 (30%)          우측 패널 (70%)

※ [🗑 Delete]: workflow 전체 삭제 (우측 패널 상단)
※ [↑][↓][🗑]: step 개별 순서 변경 및 삭제 (각 step 행 우측)
```

---

## 8. 데이터 모델 (Data Model)

```typescript
// Workflow 폴더 (1단계 평면 구조, 중첩 폴더 미지원)
interface WorkflowFolder {
  id: string;
  name: string;
  createdAt: string;
}

// Workflow
interface Workflow {
  id: string;
  name: string;
  folderId: string;
  createdAt: string;
  updatedAt: string;
  steps: WorkflowStep[];
}

// Workflow Step (Playwright action)
interface WorkflowStep {
  id: string;
  order: number;
  action: 'navigate' | 'click' | 'fill' | 'select' | 'expect' | 'wait';
  selector?: string;
  value?: string;
  url?: string;
}
```

---

## 9. 마일스톤 (Milestones)

| 단계 | 내용 | 우선순위 |
|------|------|---------|
| M0 | **[사전 검증] Playwright child_process spawn 단독 POC** — codegen 시작/종료 + 파일 출력 파싱 가능 여부 확인 | Critical |
| M1 | Electron 앱 기본 구조 + 좌우 패널 레이아웃 | Critical |
| M2 | 로컬 JSON 기반 Workflow CRUD | Critical |
| M3 | Playwright codegen 연동 (기록 기능, M0 결과 적용) | Critical |
| M4 | 우측 패널 step 시각화 및 편집 | High |
| M5 | Workflow 실행 기능 | High |
| M6 | 드래그&드롭으로 workflow 이동, UX 개선 | High |

> **M0을 먼저 하는 이유**: Playwright IPC 연동이 실패하면 전체 아키텍처가 흔들린다. M0에서 핵심 리스크를 조기 제거한 후 UI 개발을 진행한다.

---

## 10. 리스크 (Risks)

| 리스크 | 가능성 | 영향도 | 대응 방안 |
|--------|--------|--------|----------|
| Playwright IPC 연동 복잡도 | 중 | 높음 | M0 POC로 사전 검증, child_process spawn으로 단계적 구현 |
| **codegen 출력 형식의 버전 간 변경** | **중** | **높음** | **`@playwright/test` 버전 고정 + 스크립트 파서 단위 테스트 필수 작성** |
| Electron 번들 크기 | 낮 | 중간 | electron-builder로 최적화 |
| Windows 전용 코드 의존 | 낮 | 낮음 | path 처리 시 path 모듈 사용 |

---

## 11. 참고 자료

- [Playwright Codegen 공식 문서](https://playwright.dev/docs/codegen)
- [Electron 공식 문서](https://www.electronjs.org/docs)
- [RecordFlow README](../../README.md)
