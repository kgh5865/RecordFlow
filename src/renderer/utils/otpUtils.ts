/** OTP QR 파싱 유틸리티 */

export function parseOtpAuthUri(uri: string): { name: string; secret: string } | null {
  // otpauth://totp/LABEL?secret=SECRET&issuer=ISSUER
  const match = uri.trim().match(/^otpauth:\/\/(totp|hotp)\/([^?]*)\??(.*)$/i)
  if (!match) return null
  const label = decodeURIComponent(match[2].replace(/\+/g, ' '))
  const params = new URLSearchParams(match[3])
  const secret = params.get('secret')?.replace(/\s/g, '').toUpperCase()
  if (!secret) return null
  const issuer = params.get('issuer') ?? ''
  const name = issuer || (label.includes(':') ? label.split(':')[0] : label) || 'OTP'
  return { name: name.trim(), secret }
}

export function base32Encode(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let result = ''
  let bits = 0
  let value = 0
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) result += alphabet[(value << (5 - bits)) & 31]
  return result
}

function readVarint(data: Uint8Array, offset: number): [number, number] {
  let result = 0
  let shift = 0
  while (offset < data.length) {
    const byte = data[offset++]
    result |= (byte & 0x7f) << shift
    shift += 7
    if ((byte & 0x80) === 0) break
  }
  return [result, offset]
}

function parseProtoFields(data: Uint8Array): Map<number, (number | Uint8Array)[]> {
  const fields = new Map<number, (number | Uint8Array)[]>()
  let offset = 0
  while (offset < data.length) {
    let tag: number
    ;[tag, offset] = readVarint(data, offset)
    const fieldNum = tag >> 3
    const wireType = tag & 0x7
    if (wireType === 0) {
      let value: number
      ;[value, offset] = readVarint(data, offset)
      if (!fields.has(fieldNum)) fields.set(fieldNum, [])
      fields.get(fieldNum)!.push(value)
    } else if (wireType === 2) {
      let len: number
      ;[len, offset] = readVarint(data, offset)
      const bytes = data.slice(offset, offset + len)
      offset += len
      if (!fields.has(fieldNum)) fields.set(fieldNum, [])
      fields.get(fieldNum)!.push(bytes)
    } else {
      break
    }
  }
  return fields
}

export function parseMigrationQr(raw: string): Array<{ name: string; secret: string }> | null {
  const match = raw.match(/[?&]data=([^&]+)/)
  if (!match) return null
  try {
    const binaryStr = atob(decodeURIComponent(match[1]))
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

    const payload = parseProtoFields(bytes)
    const otpParams = payload.get(1) ?? []
    const entries: Array<{ name: string; secret: string }> = []

    for (const blob of otpParams) {
      if (!(blob instanceof Uint8Array)) continue
      const params = parseProtoFields(blob)
      const secretBytes = params.get(1)?.[0]
      const nameBytes = params.get(2)?.[0]
      const issuerBytes = params.get(3)?.[0]
      if (!(secretBytes instanceof Uint8Array)) continue
      const secret = base32Encode(secretBytes)
      const name = nameBytes instanceof Uint8Array ? new TextDecoder().decode(nameBytes) : ''
      const issuer = issuerBytes instanceof Uint8Array ? new TextDecoder().decode(issuerBytes) : ''
      const displayName = (issuer || name || 'OTP').trim()
      entries.push({ name: displayName, secret })
    }
    return entries.length > 0 ? entries : null
  } catch {
    return null
  }
}
