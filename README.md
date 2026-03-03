# RecordFlow

Playwright Codegen 기반의 웹 자동화 워크플로우 녹화/재생 데스크톱 앱입니다.
브라우저 조작을 녹화하여 워크플로우로 저장하고, 원클릭 재생 및 Cron 스케줄링을 지원합니다.

## 주요 기능

- **워크플로우 녹화** - Playwright Codegen으로 브라우저 조작을 자동 녹화
- **워크플로우 재생** - 저장된 스텝을 Chromium 브라우저에서 순차 실행
- **스케줄링** - Cron 표현식 또는 일회성 예약으로 워크플로우 자동 실행
- **폴더 관리** - 워크플로우를 폴더 트리 구조로 정리
- **날짜 변수** - `{{date:offset:format}}` 패턴으로 동적 날짜 값 자동 입력
- **OTP 지원** - TOTP 프로필을 등록하여 `{{otp:프로필명}}` 패턴으로 자동 입력
- **외부 명령어** - `{{cmd:명령어}}` 패턴으로 외부 스크립트 결과를 fill 값으로 사용
- **워크플로우 공유** - `.rfworkflow` 파일로 내보내기/가져오기 (민감정보 자동 마스킹)
- **백그라운드 모드** - 시스템 트레이로 최소화하여 스케줄 유지

## 지원 액션

| 액션 | 설명 |
|------|------|
| `navigate` | URL 이동 |
| `click` | 요소 클릭 |
| `fill` | 입력 필드 값 입력 |
| `select` | 드롭다운 선택 |
| `press` | 키 입력 |
| `expect` | URL 검증 |
| `wait` | 요소 대기 |

## 동적 값 템플릿

워크플로우 스텝의 `fill` 값에 아래 템플릿을 사용하면 실행 시 자동으로 치환됩니다.

| 템플릿 | 설명 | 예시 |
|--------|------|------|
| `{{date:offset:format}}` | 오늘 기준 날짜 | `{{date:0:YYYY-MM-DD}}` → `2026-03-03` |
| `{{date:offset}}` | 기본 포맷(YYYY-MM-DD) | `{{date:-1}}` → 어제 날짜 |
| `{{otp:프로필명}}` | TOTP 인증 코드 | `{{otp:Google}}` → `482917` |
| `{{cmd:명령어}}` | 외부 명령 실행 결과 | `{{cmd:echo hello}}` → `hello` |

**날짜 포맷 토큰**: `YYYY`(연), `MM`(월 2자리), `DD`(일 2자리), `M`(월), `D`(일)

## 기술 스택

- **프레임워크**: Electron + electron-vite
- **프론트엔드**: React 18, TypeScript, Tailwind CSS
- **상태 관리**: Zustand
- **브라우저 자동화**: Playwright
- **스케줄링**: node-cron, cron-parser
- **OTP**: otplib (TOTP), jsQR (QR 코드 파싱)
- **빌드**: electron-builder (Windows NSIS)

## 시작하기

### 필수 조건

- Node.js 18+
- npm

### 설치 및 실행

```bash
# 의존성 설치 (Playwright Chromium 자동 설치)
npm install

# 개발 모드
npm run dev

# 프로덕션 빌드
npm run build

# 배포 패키지 생성
npm run dist
```

> 첫 실행 시 Playwright Chromium이 자동으로 설치됩니다 (~170 MB).

## 프로젝트 구조

```
src/
├── main/                  # Electron 메인 프로세스
│   ├── index.ts           # 앱 진입점, 트레이 관리
│   ├── ipc-handlers.ts    # IPC 핸들러 등록
│   ├── services/
│   │   ├── codegen.service.ts       # Playwright codegen 녹화
│   │   ├── parser.service.ts        # codegen 출력 파싱
│   │   ├── runner.service.ts        # 워크플로우 재생 엔진
│   │   ├── scheduler.service.ts     # Cron/일회성 스케줄러
│   │   ├── storage.service.ts       # JSON 파일 저장소
│   │   ├── settings.service.ts      # 앱 설정 관리
│   │   ├── setup.service.ts         # Chromium 설치 관리
│   │   └── workflow-file.service.ts # 워크플로우 내보내기/가져오기
│   └── utils/
│       └── json-storage.ts          # JSON 파일 I/O
├── preload/
│   └── index.ts           # contextBridge API
├── renderer/              # React UI
│   ├── App.tsx
│   ├── components/
│   │   ├── layout/        # AppLayout, Toolbar, WorkflowPanel, StepPanel, RunResultToast
│   │   ├── workflow/      # FolderTree, FolderItem, WorkflowItem, ContextMenu
│   │   ├── steps/         # StepList, StepRow, ActionBadge
│   │   ├── schedule/      # SchedulePanel, ScheduleItem, ScheduleDetail, ScheduleDialog
│   │   ├── settings/      # SettingsPanel, OtpSection
│   │   ├── dialogs/       # EditValueDialog, DateVariableHelper, ImportWorkflowDialog 등
│   │   └── ui/            # Input
│   ├── stores/            # Zustand 스토어 (workflow, schedule, settings, ui)
│   ├── hooks/             # useIpc
│   ├── services/          # ipc.service
│   └── utils/             # otpUtils, selectorUtils
└── types/
    └── workflow.types.ts  # 공유 타입 정의
```

## 라이선스

MIT
