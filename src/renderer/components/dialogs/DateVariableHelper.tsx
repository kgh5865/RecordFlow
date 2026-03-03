import { useState, useMemo } from 'react'

interface Props {
  onInsert: (template: string) => void
}

const FORMAT_PRESETS = [
  { label: 'YYYY-MM-DD', value: 'YYYY-MM-DD' },
  { label: 'M/D', value: 'M/D' },
  { label: 'YYYY.MM.DD', value: 'YYYY.MM.DD' },
  { label: 'MM/DD', value: 'MM/DD' },
  { label: 'MM-DD', value: 'MM-DD' },
  { label: 'M (월만)', value: 'M' },
  { label: 'D (일만)', value: 'D' }
]

function formatDatePreview(offset: number, format: string): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return format
    .replace('YYYY', String(y))
    .replace('MM', String(m).padStart(2, '0'))
    .replace('DD', String(day).padStart(2, '0'))
    .replace('M', String(m))
    .replace('D', String(day))
}

export function DateVariableHelper({ onInsert }: Props) {
  const [offset, setOffset] = useState(0)
  const [formatIdx, setFormatIdx] = useState(0)
  const [customFormat, setCustomFormat] = useState('')
  const [useCustom, setUseCustom] = useState(false)

  const format = useCustom ? customFormat : FORMAT_PRESETS[formatIdx].value
  const offsetStr = offset === 0 ? '0' : offset > 0 ? `+${offset}` : String(offset)

  const template =
    format === 'YYYY-MM-DD' ? `{{date:${offsetStr}}}` : `{{date:${offsetStr}:${format}}}`

  const preview = useMemo(() => {
    if (!format) return '...'
    return formatDatePreview(offset, format)
  }, [offset, format])

  const offsetLabel = offset === 0 ? '오늘' : offset > 0 ? `${offset}일 후` : `${Math.abs(offset)}일 전`

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold text-[#4ec9b0] uppercase tracking-wider flex items-center gap-1">
        <span>날짜 변수 삽입</span>
      </div>

      {/* Offset */}
      <div className="flex items-center gap-1.5">
        <label className="text-[10px] text-[#888] w-10 shrink-0">오프셋</label>
        <button
          onClick={() => setOffset((o) => o - 1)}
          className="w-5 h-5 flex items-center justify-center rounded text-[11px] text-[#cccccc] bg-[#3c3c3c] hover:bg-[#505050] transition-colors"
        >
          -
        </button>
        <span className="text-[11px] text-[#cccccc] w-8 text-center font-mono">{offsetStr}</span>
        <button
          onClick={() => setOffset((o) => o + 1)}
          className="w-5 h-5 flex items-center justify-center rounded text-[11px] text-[#cccccc] bg-[#3c3c3c] hover:bg-[#505050] transition-colors"
        >
          +
        </button>
        <span className="text-[10px] text-[#555] ml-1">{offsetLabel}</span>
      </div>

      {/* Format presets */}
      <div className="flex items-center gap-1.5">
        <label className="text-[10px] text-[#888] w-10 shrink-0">포맷</label>
        <div className="flex flex-wrap gap-1">
          {FORMAT_PRESETS.map((p, i) => (
            <button
              key={p.value}
              onClick={() => {
                setFormatIdx(i)
                setUseCustom(false)
              }}
              className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                !useCustom && formatIdx === i
                  ? 'border-[#4ec9b0] text-[#4ec9b0] bg-[#4ec9b0]/10'
                  : 'border-[#3c3c3c] text-[#888] hover:border-[#555] hover:text-[#aaa]'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setUseCustom(true)}
            className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
              useCustom
                ? 'border-[#4ec9b0] text-[#4ec9b0] bg-[#4ec9b0]/10'
                : 'border-[#3c3c3c] text-[#888] hover:border-[#555] hover:text-[#aaa]'
            }`}
          >
            직접 입력
          </button>
        </div>
      </div>

      {/* Custom format input */}
      {useCustom && (
        <div className="flex items-center gap-1.5 ml-[46px]">
          <input
            value={customFormat}
            onChange={(e) => setCustomFormat(e.target.value)}
            className="flex-1 px-1.5 py-0.5 text-[11px] font-mono bg-[#1e1e1e] text-[#cccccc] border border-[#3c3c3c] rounded outline-none focus:border-[#4ec9b0] caret-white"
            placeholder="YYYY, MM, DD, M, D 조합"
          />
        </div>
      )}

      {/* Preview + Insert */}
      <div className="flex items-center justify-between ml-[46px]">
        <div className="text-[10px] text-[#888] flex items-center gap-1 min-w-0">
          <span className="font-mono text-[#ce9178] truncate">{template}</span>
          <span className="text-[#555] shrink-0">&rarr;</span>
          <span className="font-mono text-[#4ec9b0] shrink-0">{preview}</span>
        </div>
        <button
          onClick={() => onInsert(template)}
          disabled={!format}
          className="px-2 py-0.5 text-[10px] rounded bg-[#0e639c] hover:bg-[#1177bb] text-white disabled:opacity-40 transition-colors shrink-0 ml-2"
        >
          삽입
        </button>
      </div>
    </div>
  )
}
