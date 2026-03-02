# Plan: workflow-file-sharing

## 기능 개요

RecordFlow에서 워크플로우를 `.rfworkflow` 파일로 내보내고(Export) 가져오는(Import) 기능을 구현한다.
사용자는 워크플로우를 파일로 저장해 다른 사람과 공유할 수 있으며,
**민감한 정보(비밀번호, 아이디, OTP 등)는 실제 값 대신 플레이스홀더로 대체**해 보안을 보장한다.

---

## 배경 및 목적

- 현재 워크플로우는 앱 내부 JSON 스토리지(`userData/storage.json`)에만 저장됨
- 팀원 간 워크플로우 공유, 백업/복원, 재사용 템플릿 배포가 불가능
- `fill` 액션의 value에는 비밀번호·아이디 등 민감 정보가 포함될 수 있어 그대로 공유하면 보안 위협

---

## 요구사항

### FR-01: 워크플로우 내보내기 (Export)

- 워크플로우 컨텍스트 메뉴에 "Export" 항목 추가
- 클릭 시 Electron `dialog.showSaveDialog`로 저장 경로 선택
- 확장자: `.rfworkflow` (내부 포맷: JSON)
- 내보낸 파일에는 `name`, `steps[]`, `exportedAt`, `rfworkflowVersion` 포함
- `id`, `folderId` 등 내부 식별자는 제외 (가져올 때 새로 발급)

### FR-02: 민감 정보 마스킹 (Security)

내보내기 시 `fill` 액션의 `value`를 다음 규칙으로 검사하여 민감 여부 판단:

| 조건 | 마스킹 값 |
|------|-----------|
| selector에 `password`, `passwd`, `pwd` 포함 | `{{password}}` |
| selector에 `username`, `userid`, `loginid` 포함 | `{{username}}` |
| selector에 `email` 포함 | `{{email}}` |
| selector에 `otp`, `totp`, `mfa`, `2fa` 포함 | `{{otp}}` |
| value가 `{{otp:*}}` 패턴 (OTP 토큰) | `{{otp}}` |
| selector에 `id`가 독립 단어로 포함 (e.g. `#id`, `[name="id"]`) | `{{id}}` |

- `rawLine`도 동일하게 민감 정보 마스킹 적용
- 마스킹된 스텝에는 `_masked: true` 플래그 포함 (가져올 때 사용자 인식용)

### FR-03: 워크플로우 가져오기 (Import)

- 툴바 또는 폴더 컨텍스트 메뉴에 "Import Workflow" 버튼/항목 추가
- 클릭 시 `dialog.showOpenDialog`로 `.rfworkflow` 파일 선택
- 가져올 폴더 선택 다이얼로그 표시 (기존 FolderTree 재활용)
- 가져온 워크플로우는 새 `id`로 등록, 이름 중복 시 자동으로 `(2)`, `(3)` 붙임
- 마스킹된 스텝이 있는 경우, 가져오기 후 안내 메시지 표시:
  _"일부 값이 마스킹되었습니다. 해당 스텝의 값을 직접 입력해 주세요."_

### FR-04: 파일 포맷 명세

```json
{
  "rfworkflowVersion": "1.0",
  "exportedAt": "2026-03-02T00:00:00.000Z",
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
        "action": "fill",
        "selector": "locator('#id')",
        "value": "{{id}}",
        "rawLine": "await page.locator('#id').fill('...')",
        "_masked": true,
        "_sensitiveType": "id"
      },
      {
        "order": 2,
        "action": "fill",
        "selector": "locator('#pw')",
        "value": "{{password}}",
        "rawLine": "await page.locator('#pw').fill('...')",
        "_masked": true,
        "_sensitiveType": "password"
      }
    ]
  }
}
```

---

## 비기능 요구사항

- **보안**: 민감 정보 감지는 selector 패턴 기반(대소문자 무관)으로 수행
- **호환성**: `rfworkflowVersion` 필드로 향후 포맷 변경 대비
- **UX**: 내보내기/가져오기 성공·실패 시 토스트 메시지 표시
- **무결성**: 잘못된 `.rfworkflow` 파일 가져오기 시 오류 메시지 표시

---

## 구현 범위

### In Scope

- 단일 워크플로우 Export
- 단일 워크플로우 Import (폴더 지정)
- 민감 정보 마스킹 (selector 패턴 기반)
- 가져오기 후 마스킹 안내

### Out of Scope

- 폴더 단위 일괄 내보내기
- 워크플로우 마켓플레이스/온라인 공유
- 가져오기 시 자동 값 채우기

---

## 영향 범위

| 레이어 | 파일 / 모듈 | 변경 유형 |
|--------|-------------|-----------|
| Main | `ipc-handlers.ts` | IPC 핸들러 추가 |
| Main | `services/workflow-file.service.ts` (신규) | Export/Import 로직 |
| Preload | `preload/index.ts` | API 노출 추가 |
| Types | `types/workflow.types.ts` | `WorkflowFile` 타입 추가 |
| Renderer | `components/workflow/WorkflowItem.tsx` | 컨텍스트 메뉴 Export 추가 |
| Renderer | `components/layout/Toolbar.tsx` | Import 버튼 추가 |
| Renderer | `components/dialogs/ImportWorkflowDialog.tsx` (신규) | 폴더 선택 다이얼로그 |

---

## 구현 우선순위

1. `workflow-file.service.ts` - Export/Import + 마스킹 로직 (핵심)
2. IPC 핸들러 등록
3. Preload API 노출
4. `WorkflowItem` 컨텍스트 메뉴 Export
5. Toolbar Import 버튼
6. `ImportWorkflowDialog` (폴더 선택 + 마스킹 안내)

---

## 완료 기준

- [ ] 워크플로우 선택 후 컨텍스트 메뉴 → Export → `.rfworkflow` 파일 저장 성공
- [ ] 민감 필드(password, id, otp 등) value가 플레이스홀더로 대체됨
- [ ] 다른 사용자가 Import → 원하는 폴더에 워크플로우 추가 성공
- [ ] 마스킹된 스텝 존재 시 안내 메시지 표시
- [ ] 유효하지 않은 파일 Import 시 오류 처리

---

*작성일: 2026-03-02*
