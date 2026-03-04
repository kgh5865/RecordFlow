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

## OTP 등록 방법 (Google Authenticator 기준)

워크플로우에서 2FA 인증 코드를 자동 입력하려면 먼저 OTP 프로필을 등록해야 합니다.

### 방법 1: QR 코드 이미지로 등록 (권장)

1. 2FA를 설정하려는 서비스(Google, GitHub 등)에서 **QR 코드를 이미지 파일로 저장**합니다.
   - 2FA 설정 화면에서 QR 코드가 표시될 때 스크린샷 또는 이미지 저장
2. RecordFlow 좌측 하단 **설정(톱니바퀴)** → **OTP 프로필** 섹션에서 **+ 추가** 클릭
3. **QR 버튼** 클릭 → 저장해둔 QR 코드 이미지 파일 선택
4. 이름과 Secret Key가 자동으로 입력되면 **저장** 클릭

### 방법 2: Google Authenticator 내보내기 QR로 일괄 등록

1. Google Authenticator 앱 → **계정 내보내기** → QR 코드 표시
2. 표시된 QR 코드를 스크린샷으로 저장
3. RecordFlow **OTP 프로필** → **+ 추가** → **QR 버튼** → 스크린샷 선택
4. 내보내기 QR에서 감지된 계정 목록이 표시됩니다
5. 등록할 계정을 체크한 후 **선택 추가** 클릭

### 방법 3: Secret Key 수동 입력

1. 2FA 설정 화면에서 **"QR 코드를 스캔할 수 없나요?"** 등의 링크를 클릭하면 Secret Key(Base32 문자열)가 표시됩니다.
2. RecordFlow **OTP 프로필** → **+ 추가**
3. **이름**(참조용, 예: `Gmail`)과 **Secret Key**(예: `JBSWY3DPEHPK3PXP`)를 입력 후 **저장**

### 워크플로우에서 사용

등록 후 fill 스텝의 값 편집 시 OTP 배지를 선택하면 `{{otp:프로필명}}` 템플릿이 삽입되고, 실행 시점에 6자리 인증 코드가 자동 생성됩니다.

> **주의**: OTP Secret Key는 앱 내부에 저장됩니다. 워크플로우를 `.rfworkflow`로 내보낼 때는 OTP 값이 자동으로 마스킹 처리됩니다.

## 민감 정보 보안

### 저장 방식

모든 데이터는 **로컬 파일**로만 저장되며 외부 서버로 전송되지 않습니다.

| 데이터 | 저장 위치 | 보호 방식 |
|--------|-----------|-----------|
| 워크플로우 (아이디, 비밀번호 등) | `%APPDATA%/recordflow/workflows.json` | Electron safeStorage 암호화 (Windows DPAPI) |
| OTP Secret Key | `%APPDATA%/recordflow/settings.json` | Electron safeStorage 암호화 (Windows DPAPI) |

- 파일은 바이너리 형태로 저장되며, 동일 OS 사용자 계정에서만 복호화 가능합니다.
- 기존 평문 파일은 앱 실행 시 자동으로 암호화된 형태로 마이그레이션됩니다.
- 암호화를 사용할 수 없는 환경에서는 평문으로 폴백됩니다.

### 워크플로우 내보내기 시 자동 마스킹

`.rfworkflow` 파일로 내보낼 때 민감한 `fill` 스텝의 값이 자동으로 플레이스홀더로 치환됩니다.

| 감지 대상 (selector 기준) | 마스킹 결과 |
|---------------------------|-------------|
| `password`, `passwd`, `pwd`, `비밀번호` | `{{password}}` |
| `username`, `userid`, `아이디`, `사용자명` | `{{username}}` |
| `email`, `이메일` | `{{email}}` |
| `otp`, `totp`, `mfa`, `2fa`, `인증번호` | `{{otp}}` |
| `id` (단독) | `{{id}}` |

- `{{otp:프로필명}}` 값은 selector와 무관하게 **항상 마스킹** 처리됩니다.
- 마스킹된 스텝에는 `rawLine`(원본 실행 코드)도 함께 제거됩니다.
- 가져온 워크플로우의 마스킹된 스텝은 사용자가 직접 값을 입력해야 실행할 수 있습니다.

## 설치

[GitHub Releases](https://github.com/kgh5865/RecordFlow/releases) 페이지에서 최신 버전의 `RecordFlow Setup x.x.x.exe`를 다운로드하여 실행하세요.

> 첫 실행 시 Playwright Chromium이 자동으로 설치됩니다 (~170 MB).

## 기술 스택

- **프레임워크**: Electron + electron-vite
- **프론트엔드**: React 18, TypeScript, Tailwind CSS
- **상태 관리**: Zustand
- **브라우저 자동화**: Playwright
- **스케줄링**: node-cron, cron-parser
- **OTP**: otplib (TOTP), jsQR (QR 코드 파싱)
- **빌드**: electron-builder (Windows NSIS)

## 개발

### 필수 조건

- Node.js 18+
- npm

### 로컬 실행

```bash
npm install
npm run dev
```

### 배포 패키지 생성

```bash
npm run dist
```

`release/RecordFlow Setup x.x.x.exe` 파일이 생성됩니다.

### 릴리스 배포

```bash
# 1. package.json version 업데이트 후 빌드
npm run dist

# 2. tag 생성 및 push
git tag v0.1.0
git push origin v0.1.0
```

3. [GitHub Releases](https://github.com/kgh5865/RecordFlow/releases) → **Draft a new release** → 태그 선택 → `release/RecordFlow Setup x.x.x.exe` 파일 첨부 → **Publish**

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
