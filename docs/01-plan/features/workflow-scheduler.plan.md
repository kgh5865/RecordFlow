# Plan: Workflow Scheduler

**Feature ID**: workflow-scheduler
**Created**: 2026-02-27
**Status**: Planning
**Priority**: High
**Parent Feature**: playwright-codegen-gui

---

## 1. 개요 (Overview)

RecordFlow에 워크플로우 예약 실행(스케줄러) 기능을 추가한다.
사용자가 기록한 워크플로우를 cron 표현식 기반으로 주기적으로 실행하거나,
특정 시각에 1회 예약 실행할 수 있도록 한다.
Electron 메인 프로세스에서 스케줄러가 동작하며, 앱이 시스템 트레이에서 상주하여 백그라운드 실행을 지원한다.

---

## 2. 문제 정의 (Problem Statement)

- 현재 워크플로우 실행은 사용자가 직접 Run 버튼을 눌러야만 가능하다
- 정기 점검, 반복 로그인, 주기적 데이터 수집 등 자동화 시나리오에 수동 실행은 비효율적이다
- 앱을 닫으면 예약 실행이 불가능하다 (백그라운드 상주 필요)

---

## 3. 목표 (Goals)

- [ ] 워크플로우에 cron 표현식 기반 반복 스케줄 설정
- [ ] 특정 시각 1회 예약 실행 지원
- [ ] 스케줄 활성/비활성 토글
- [ ] 시스템 트레이 상주 (앱 닫아도 백그라운드 실행)
- [ ] 실행 이력(로그) 기록 및 조회
- [ ] 스케줄 목록 UI (좌측 패널 또는 별도 탭)

---

## 4. 비목표 (Non-Goals)

- Windows 서비스 등록 (OS 레벨 데몬화) — Electron 트레이 상주로 대체
- 원격/클라우드 스케줄링
- 여러 워크플로우 체이닝 (A 완료 후 B 실행) — 1차에서는 단일 워크플로우만
- 이메일/슬랙 알림 — 앱 내 토스트 알림만

---

## 5. 사용자 시나리오 (User Stories)

### US-01: 반복 스케줄 등록
> 사용자는 워크플로우를 선택하고 "매일 09:00" 또는 "30분마다" 같은 반복 일정을 설정하여 자동 실행되게 한다.

**수락 조건**:
- 워크플로우 선택 후 스케줄 설정 다이얼로그 오픈
- cron 표현식 직접 입력 또는 프리셋(매 N분, 매시간, 매일 HH:MM) 선택
- 저장 후 스케줄 목록에 표시
- 지정 시각에 자동으로 runner 실행

### US-02: 1회 예약 실행
> 사용자는 특정 날짜+시간에 워크플로우가 1회 실행되도록 예약한다.

**수락 조건**:
- 날짜/시간 선택 (datetime picker)
- 실행 완료 후 스케줄 상태가 "완료"로 변경
- 완료된 예약은 이력에 기록

### US-03: 스케줄 관리
> 사용자는 등록된 스케줄을 활성/비활성 토글하거나 삭제한다.

**수락 조건**:
- 스케줄 목록에서 on/off 토글
- 비활성 스케줄은 실행되지 않음
- 삭제 시 확인 다이얼로그

### US-04: 실행 이력 조회
> 사용자는 스케줄에 의해 자동 실행된 결과(성공/실패, 시각, 완료 step 수)를 확인한다.

**수락 조건**:
- 최근 N건 실행 이력 표시
- 성공/실패 상태, 실행 시각, 소요 시간
- 실패 시 에러 메시지 표시

### US-05: 백그라운드 실행 (설정 선택)
> 사용자는 설정에서 "백그라운드 실행" 옵션을 켜거나 끌 수 있다.

**수락 조건**:
- 설정 화면에 "백그라운드 실행" 토글 존재 (기본값: OFF)
- ON: 창 닫기(X) 시 시스템 트레이로 최소화, 스케줄 계속 동작
  - 트레이 아이콘 클릭 시 창 복원
  - 트레이 우클릭 메뉴: 열기 / 종료
- OFF: 창 닫기(X) 시 앱 완전 종료, 스케줄도 중단
  - 활성 스케줄이 있으면 "스케줄이 중단됩니다" 경고 표시

---

## 6. 기술 스택 (Tech Stack)

| 항목 | 선택 | 비고 |
|------|------|------|
| Scheduler | `node-cron` | cron 표현식 기반, Node.js 네이티브 |
| Cron 파싱 | `cron-parser` | nextRun 계산, cron 유효성 검증 |
| 시스템 트레이 | Electron `Tray` + `Menu` | 빌트인 API |
| 실행 이력 저장 | JSON 파일 | `%APPDATA%/RecordFlow/schedule-logs.json` |

---

## 7. 데이터 모델 (Data Model)

```typescript
type ScheduleType = 'cron' | 'once'

interface Schedule {
  id: string
  workflowId: string          // 대상 워크플로우
  type: ScheduleType
  cronExpression?: string     // type='cron': "0 9 * * *" (매일 09:00)
  scheduledAt?: string        // type='once': ISO 날짜시간
  enabled: boolean
  lastRunAt?: string
  nextRunAt?: string
  createdAt: string
}

interface AppSettings {
  backgroundMode: boolean     // 백그라운드 실행 (기본값: false)
}

interface ScheduleLog {
  id: string
  scheduleId: string
  workflowId: string
  workflowName: string
  startedAt: string
  finishedAt: string
  success: boolean
  completedSteps: number
  totalSteps: number
  error?: string
}
```

---

## 8. UI 레이아웃 (UI Layout)

```
┌─ Toolbar ──────────────────────────────────────────────┐
│ RecordFlow                        ● Record    ⏰ 1 active │
├──────────┬─────────────────────────────────────────────┤
│ 📁 Left  │ 📋 Right Panel                              │
│          │                                             │
│ [Folders]│ workflow name     ▶ Run  🗑                 │
│          │ ─────────────────────────────────────────── │
│ [탭전환] │  step 1: navigate ...                       │
│ 📂 Tree  │  step 2: click ...                          │
│ ⏰ Sched │  step 3: fill ...                            │
│          │ ─────────────────────────────────────────── │
│ ──────── │ 3 steps                                     │
│ (스케줄  │                                             │
│  목록)   │                                             │
│ ◉ 매일.. │                                             │
│ ○ 30분.. │                                             │
└──────────┴─────────────────────────────────────────────┘
```

**좌측 패널**: 탭 전환 (📂 Workflows / ⏰ Schedules)
- Workflows 탭: 기존 폴더+워크플로우 트리
- Schedules 탭: 등록된 스케줄 목록 (활성/비활성 토글, 다음 실행 시각)

**우측 패널**: 스케줄 선택 시 해당 워크플로우 step 표시 + 실행 이력

---

## 9. 리스크 (Risks)

| 리스크 | 영향도 | 대응 |
|--------|--------|------|
| 앱 완전 종료 시 스케줄 미실행 | High | 백그라운드 모드 OFF 시 경고 표시 + 설정 유도 |
| cron 표현식 초보 사용자 어려움 | Medium | 프리셋 제공 (매 N분, 매일 HH:MM 등) |
| 동시 다중 스케줄 실행 시 충돌 | Medium | 큐 기반 순차 실행 |
| 장시간 미사용 후 밀린 스케줄 | Low | 누적 실행 안 함, 다음 주기만 실행 |

---

## 10. 마일스톤 (Milestones)

| ID | 마일스톤 | 내용 | 우선순위 |
|----|----------|------|----------|
| M0 | 스케줄러 코어 | `node-cron` 기반 scheduler.service + Schedule 타입 | High |
| M1 | 스케줄 CRUD | 생성/수정/삭제/토글 IPC + storage 확장 | High |
| M2 | 스케줄 UI | 좌측 패널 탭 전환 + 스케줄 목록 + 설정 다이얼로그 | High |
| M3 | 설정 + 백그라운드 | 설정 화면 + backgroundMode 토글 + Tray 조건부 상주 | High |
| M4 | 실행 이력 | ScheduleLog 저장 + 이력 조회 UI | Medium |
| M5 | 프리셋 & UX | cron 프리셋, 다음 실행 시각 표시, 토스트 알림 | Medium |
