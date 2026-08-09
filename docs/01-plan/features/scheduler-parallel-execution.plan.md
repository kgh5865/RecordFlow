# Plan: Scheduler Parallel Execution

**Feature ID**: scheduler-parallel-execution
**Created**: 2026-03-06
**Status**: Planning
**Priority**: Medium
**Target Version**: v0.3.0
**Parent Feature**: workflow-scheduler

---

## 1. 개요 (Overview)

RecordFlow 스케줄러에 병렬 실행 제어 기능을 추가한다.
현재 서로 다른 스케줄이 동시에 트리거되면 각각 독립 브라우저를 열어 무제한 병렬 실행되며,
이로 인한 리소스 과다 사용, storage 쓰기 경합 문제를 해결한다.
최대 동시 실행 수를 설정하고, 초과 시 큐에 대기하여 순차 실행되도록 한다.

---

## 2. 문제 정의 (Problem Statement)

- 스케줄이 겹치면 Chromium 인스턴스가 무제한으로 동시 실행됨 (인스턴스당 ~200-300MB)
- 동시 실행 수 제한이 없어 PC 리소스(CPU/RAM)가 급격히 소모됨
- `loadStorage()`/`saveStorage()`가 동시 호출 시 마지막 write가 이전 결과를 덮어쓰는 경합(race condition) 발생
- 같은 스케줄 중복 실행만 `runningSet`으로 방지하고, 서로 다른 스케줄 간 동시성 제어는 없음

---

## 3. 목표 (Goals)

- [ ] 최대 동시 실행 수(concurrency limit) 설정 기능 (기본값: 2)
- [ ] 실행 큐(execution queue) 구현 — 초과 스케줄은 대기 후 순차 실행
- [ ] storage 쓰기 경합 방지 (lock 또는 순차 쓰기)
- [ ] 설정 UI에 동시 실행 수 조절 옵션 추가
- [ ] 큐 대기 상태를 스케줄 로그/UI에 표시

---

## 4. 비목표 (Non-Goals)

- 워크플로우 간 우선순위 지정 — 큐는 FIFO 순서만 지원
- 다중 PC/원격 분산 실행
- 브라우저 인스턴스 풀링(재사용) — 각 실행은 독립 브라우저 유지
- 워크플로우 체이닝 (A 완료 후 B 실행)

---

## 5. 사용자 시나리오 (User Stories)

### US-01: 동시 실행 수 제한
> 사용자는 설정에서 최대 동시 실행 수를 지정하여, 동시에 실행되는 브라우저 수를 제한한다.

**수락 조건**:
- 설정 화면에 "최대 동시 실행 수" 옵션 존재 (기본값: 2, 범위: 1~5)
- 제한을 초과하는 스케줄은 큐에 대기
- 실행 중인 워크플로우 완료 시 대기 중인 다음 스케줄 자동 실행

### US-02: 큐 대기 상태 확인
> 사용자는 현재 실행 중인 스케줄과 대기 중인 스케줄을 UI에서 확인할 수 있다.

**수락 조건**:
- 스케줄 목록에 실행 상태 표시: 실행 중(running) / 대기 중(queued) / 대기(idle)
- 실행 이력 로그에 큐 대기 시간 기록
- 대기 중인 스케줄 수를 toolbar 또는 트레이 아이콘에 표시

### US-03: storage 경합 없는 안정적 실행
> 여러 스케줄이 동시에 완료되어도 실행 결과가 누락되지 않는다.

**수락 조건**:
- 동시 완료된 스케줄의 `lastRunAt`, `nextRunAt` 업데이트가 모두 정상 반영
- 실행 로그가 누락 없이 저장됨

---

## 6. 기술 설계 (Technical Approach)

### 6-1. Concurrency Limiter

```typescript
// scheduler.service.ts에 추가
class ExecutionQueue {
  private maxConcurrency: number
  private running: number = 0
  private queue: Array<() => Promise<void>> = []

  constructor(maxConcurrency = 2) {
    this.maxConcurrency = maxConcurrency
  }

  async enqueue(task: () => Promise<void>): Promise<void> {
    if (this.running < this.maxConcurrency) {
      this.running++
      try { await task() }
      finally { this.running--; this.dequeue() }
    } else {
      return new Promise((resolve) => {
        this.queue.push(async () => {
          this.running++
          try { await task() }
          finally { this.running--; this.dequeue() }
          resolve()
        })
      })
    }
  }

  private dequeue(): void {
    const next = this.queue.shift()
    if (next) next()
  }
}
```

### 6-2. Storage Write Lock

```typescript
// storage 쓰기를 순차화하는 mutex
let writeLock: Promise<void> = Promise.resolve()

export async function safeWriteStorage(updater: (storage: Storage) => Storage): Promise<void> {
  writeLock = writeLock.then(async () => {
    const current = loadStorage()
    const updated = updater(current)
    await saveStorage(updated)
  })
  await writeLock
}
```

### 6-3. 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `src/main/services/scheduler.service.ts` | ExecutionQueue 적용, safeWriteStorage 사용 |
| `src/main/services/storage.service.ts` | write lock 추가 |
| `src/main/services/settings.service.ts` | maxConcurrency 설정 추가 |
| `src/types/workflow.types.ts` | AppSettings에 maxConcurrency 필드 추가 |
| `src/renderer/` (스케줄 UI) | 실행/대기 상태 표시, 설정 UI 항목 추가 |

---

## 7. 데이터 모델 변경 (Data Model Changes)

```typescript
// AppSettings 확장
interface AppSettings {
  backgroundMode: boolean
  maxConcurrency: number       // 최대 동시 실행 수 (기본값: 2, 범위: 1~5)
}

// ScheduleLog 확장
interface ScheduleLog {
  // ... 기존 필드
  queuedAt?: string            // 큐 대기 시작 시각 (대기 없으면 생략)
}
```

---

## 8. 리스크 (Risks)

| 리스크 | 영향도 | 대응 |
|--------|--------|------|
| 큐 적체 시 스케줄 밀림 | Medium | 큐 최대 대기 수 제한 (예: 10), 초과 시 skip + 로그 기록 |
| 앱 종료 시 큐 대기 중인 작업 소실 | Low | 큐는 메모리 기반이므로 앱 재시작 시 다음 주기에 재실행 |
| storage lock이 교착 상태에 빠짐 | Low | Promise 체인 기반 순차 lock으로 deadlock 불가 |
| maxConcurrency 변경 시 실행 중인 작업 처리 | Low | 실행 중인 작업은 유지, 새 작업부터 적용 |

---

## 9. 마일스톤 (Milestones)

| ID | 마일스톤 | 내용 | 우선순위 |
|----|----------|------|----------|
| M0 | ExecutionQueue 구현 | concurrency limiter + 큐 로직 | High |
| M1 | Storage Write Lock | safeWriteStorage mutex 적용 | High |
| M2 | 설정 연동 | AppSettings.maxConcurrency + 설정 UI | Medium |
| M3 | 상태 표시 UI | 스케줄 목록에 running/queued 상태 표시 | Medium |
| M4 | 큐 대기 로그 | ScheduleLog.queuedAt 기록 + 이력 UI 반영 | Low |

---

## 10. 참고 (References)

- 현재 구현: [scheduler.service.ts](../../src/main/services/scheduler.service.ts) — `runningSet`으로 같은 스케줄 중복만 방지
- 현재 구현: [runner.service.ts](../../src/main/services/runner.service.ts) — 실행마다 `chromium.launch()` 독립 인스턴스
- Parent plan: [workflow-scheduler.plan.md](./workflow-scheduler.plan.md)
