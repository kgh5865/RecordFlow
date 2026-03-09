import { app } from 'electron'
import { join } from 'path'
import type { AppSettings, OtpProfile } from '../../types/workflow.types'
import { loadSecureSync, saveSecureAsync, saveRecoveryBackup, loadRecoveryBackup, hasRecoveryBackup } from '../utils/secure-storage'

const SETTINGS_FILE = join(app.getPath('userData'), 'settings.json')
const RECOVERY_FILE = join(app.getPath('userData'), 'settings.recovery')

const DEFAULT_SETTINGS: AppSettings = {
  backgroundMode: false,
  otpProfiles: []
}

export function loadSettings(): AppSettings {
  return loadSecureSync<AppSettings>(SETTINGS_FILE, DEFAULT_SETTINGS)
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await saveSecureAsync(SETTINGS_FILE, settings)

  // OTP 프로필이 있으면 복구 백업도 갱신
  if (settings.otpProfiles.length > 0) {
    try {
      await saveRecoveryBackup(RECOVERY_FILE, settings.otpProfiles)
    } catch {
      // 복구 백업 실패는 메인 저장에 영향 주지 않음
    }
  }
}

export function hasSettingsRecovery(): boolean {
  return hasRecoveryBackup(RECOVERY_FILE)
}

export function recoverOtpProfiles(): { success: boolean; profiles: OtpProfile[]; error?: string } {
  try {
    const profiles = loadRecoveryBackup<OtpProfile[]>(RECOVERY_FILE)
    if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
      return { success: false, profiles: [], error: '복구 파일에서 OTP 프로필을 찾을 수 없습니다.' }
    }
    // 기본 유효성 검증
    const valid = profiles.every((p) => p.id && p.name && p.secret)
    if (!valid) {
      return { success: false, profiles: [], error: '복구 데이터가 손상되었습니다.' }
    }
    return { success: true, profiles }
  } catch {
    return { success: false, profiles: [], error: '복구 파일 복호화에 실패했습니다.' }
  }
}
