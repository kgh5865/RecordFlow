/**
 * 민감 정보(비밀번호 등) 감지 유틸리티
 * main/renderer 양쪽에서 사용
 */

export interface SensitiveRule {
  pattern: RegExp
  type: string
  placeholder: string
}

export const SENSITIVE_RULES: SensitiveRule[] = [
  { pattern: /password|passwd|pwd|비밀번호|패스워드/i, type: 'password', placeholder: '{{password}}' },
  { pattern: /username|userid|user_id|loginid|login.id|아이디|사용자명|사용자.?이름/i, type: 'username', placeholder: '{{username}}' },
  { pattern: /\bemail\b|이메일/i, type: 'email', placeholder: '{{email}}' },
  { pattern: /\botp\b|\btotp\b|\bmfa\b|\b2fa\b|일회용|인증번호/i, type: 'otp', placeholder: '{{otp}}' },
  { pattern: /(?:^|[\s[#"'=])(id)(?:[\s\]"'=]|$)/i, type: 'id', placeholder: '{{id}}' },
]

const OTP_TOKEN_PATTERN = /^\{\{otp:\s*.+?\s*\}\}$/

/** selector 또는 value 기반으로 민감 필드 여부를 판단 */
export function isSensitiveStep(selector?: string, value?: string): boolean {
  if (value && OTP_TOKEN_PATTERN.test(value)) return true
  if (!selector) return false
  return SENSITIVE_RULES.some((rule) => rule.pattern.test(selector))
}

/** detectSensitive: 매칭된 규칙 반환 (export 마스킹용) */
export function detectSensitive(selector?: string, value?: string): SensitiveRule | null {
  if (value && OTP_TOKEN_PATTERN.test(value)) {
    return { pattern: OTP_TOKEN_PATTERN, type: 'otp', placeholder: '{{otp}}' }
  }
  if (!selector) return null
  for (const rule of SENSITIVE_RULES) {
    if (rule.pattern.test(selector)) return rule
  }
  return null
}
