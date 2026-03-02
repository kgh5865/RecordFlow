# Plan: RecordFlow 리팩토링

> **Feature**: recordflow-refactoring
> **Phase**: Plan
> **Date**: 2026-03-02
> **Level**: Dynamic

---

## 1. 배경 및 목표

직전 코드 리뷰에서 발견된 28개 이슈 중 우선순위가 높은 **14개 항목**을 리팩토링한다.
전체 이슈를 2개 Phase로 묶어 순차 적용하며, 기능 동작에 영향 없는 내부 품질 개선에 집중한다.

### 목표
- 보안 취약점 제거 (Shell Injection, Code Injection)
- 에러 처리 강화로 운영 안정성 확보
- 동기 파일 I/O → 비동기 전환으로 메인 프로세스 블로킹 제거
- 대형 컴포넌트 분리로 유지보수성 향상

---

## 2. 범위

### Phase 1 — 보안 & 안정성 (8개 항목)

| # | 파일 | 이슈 | 작업 내용 |
|---|------|------|----------|
| P1-1 | `runner.service.ts:153` | `shell:true` + `{{cmd}}` Shell Injection | `{{cmd}}` 패턴 제거 또는 화이트리스트 검증 추가 |
| P1-2 | `runner.service.ts:128` | `new Function(locatorExpr)` Code Injection | Locator 표현식 검증 로직 추가 (허용 패턴 allowlist) |
| P1-3 | `codegen.service.ts:20`, `setup.service.ts:25` | 불필요한 `shell:true` | `shell: false`로 변경 |
| P1-4 | `main/index.ts` IPC 핸들러 전체 | try/catch 없음 | 모든 `ipcMain.handle` 에 try/catch 추가 |
| P1-5 | 렌더러 전체 | Error Boundary 없음 | `ErrorBoundary` 컴포넌트 추가 (`App.tsx` 최상위 적용) |
| P1-6 | 각 서비스 파일 | `readFileSync`/`writeFileSync` | `fs/promises` 비동기 API로 전환 |
| P1-7 | 컴포넌트 10곳+ | `alert()` / `confirm()` 블로킹 UI | 인라인 확인 UI (간단한 토스트/인라인 메시지)로 교체 |
| P1-8 | `package.json` | `"playwright": "*"` 와일드카드 버전 | `"^1.49.0"` 으로 고정 |

### Phase 2 — 코드 구조 개선 (6개 항목)

| # | 파일 | 이슈 | 작업 내용 |
|---|------|------|----------|
| P2-1 | `storage.service.ts`, `settings.service.ts`, `scheduler.service.ts` | 파일 I/O 패턴 중복 6회 | `loadJSON<T>()` / `saveJSON<T>()` 유틸 추출 |
| P2-2 | `SettingsPanel.tsx` (457줄) | 컴포넌트 과대 | `OtpSection`, `BackgroundModeSection` 으로 분리 |
| P2-3 | `StepRow.tsx` (255줄) | 컴포넌트 과대 | `SelectorEditor`, `ValueEditor` 내부 컴포넌트로 분리 |
| P2-4 | `main/index.ts` (327줄) | 진입점 과대 (5개 책임) | IPC 핸들러 → `ipc-handlers.ts` 별도 모듈 |
| P2-5 | `StepList.tsx` | 유틸 함수가 컴포넌트 파일에 혼재 | `utils/selectorUtils.ts` 로 `normalizeSelector`, `rebuildRawLine` 이동 |
| P2-6 | 다이얼로그 4개 | 동일 input className 15회+ 중복 | 공통 `<Input>` 컴포넌트 추출 (`components/ui/Input.tsx`) |

---

## 3. 제외 항목 (추후 별도 검토)

- Phase 3: React.memo / useMemo 최적화
- Phase 4: 스토리지 인메모리 캐시, 타입 강화
- Phase 5: ESLint/Prettier 도입, tsconfig 개선, 네이밍 컨벤션

---

## 4. 구현 순서

```
P1-8 (package.json 버전 고정)
  → P1-3 (shell:false)
  → P1-1 (cmd injection 제거)
  → P1-2 (locator allowlist)
  → P1-4 (IPC try/catch)
  → P1-5 (Error Boundary)
  → P1-6 (async 파일 I/O)
  → P1-7 (alert/confirm 제거)
  → P2-5 (selectorUtils 추출)
  → P2-1 (loadJSON/saveJSON 유틸)
  → P2-6 (공통 Input 컴포넌트)
  → P2-4 (ipc-handlers 분리)
  → P2-3 (StepRow 분리)
  → P2-2 (SettingsPanel 분리)
```

---

## 5. 위험 & 완화

| 위험 | 완화 |
|------|------|
| async I/O 전환 시 기존 동기 코드와 인터페이스 불일치 | Phase 1 완료 후 TypeScript 컴파일 오류 전수 확인 |
| IPC 반환값 형식 변경 → 렌더러 호환성 깨짐 | IPC 핸들러 에러 처리만 추가, 반환값 형식 유지 |
| 컴포넌트 분리 시 state 이관 오류 | 분리 후 props 경계 명확히 정의, 렌더 테스트 |
| `shell:false` 변경 시 Playwright 실행 실패 | npx 대신 node_modules 직접 경로 사용으로 대체 |

---

## 6. 성공 기준

- [ ] TypeScript 컴파일 에러 0
- [ ] `shell:true` 사용 코드 0개
- [ ] IPC 핸들러 전체 try/catch 적용
- [ ] `readFileSync` / `writeFileSync` 메인 프로세스에서 0개
- [ ] 단일 파일 300줄 초과 컴포넌트 0개
- [ ] 중복 파일 I/O 패턴 유틸로 통합 완료
