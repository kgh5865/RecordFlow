import { useState, useEffect, useCallback } from 'react'

type UpdateState = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error'

interface UpdateInfo {
  version: string
  releaseNotes?: string
  releaseDate?: string
}

interface DownloadProgress {
  percent: number
  transferred: number
  total: number
}

export function UpdateNotification() {
  const [state, setState] = useState<UpdateState>('idle')
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    window.electronAPI.onUpdateAvailable((updateInfo) => {
      setInfo(updateInfo)
      setState('available')
      setDismissed(false)
    })

    window.electronAPI.onUpdateNotAvailable(() => {
      setState('idle')
    })

    window.electronAPI.onDownloadProgress((p) => {
      setProgress(p)
    })

    window.electronAPI.onUpdateDownloaded(() => {
      setState('downloaded')
    })

    window.electronAPI.onUpdateError((err) => {
      setError(err)
      setState('error')
    })

    return () => {
      window.electronAPI.removeAllListeners('updater:update-available')
      window.electronAPI.removeAllListeners('updater:update-not-available')
      window.electronAPI.removeAllListeners('updater:download-progress')
      window.electronAPI.removeAllListeners('updater:update-downloaded')
      window.electronAPI.removeAllListeners('updater:error')
    }
  }, [])

  const handleDownload = useCallback(() => {
    setState('downloading')
    setProgress({ percent: 0, transferred: 0, total: 0 })
    window.electronAPI.downloadUpdate()
  }, [])

  const handleInstall = useCallback(() => {
    window.electronAPI.installUpdate()
  }, [])

  // 표시할 상태가 없거나 닫힌 상태
  if (state === 'idle' || (state === 'available' && dismissed)) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[340px] bg-[#252526] border border-[#3c3c3c] rounded-xl shadow-2xl overflow-hidden">
      {/* 상단 강조선 */}
      <div className={`h-[3px] ${
        state === 'error' ? 'bg-red-500' :
        state === 'downloaded' ? 'bg-[#4caf50]' : 'bg-[#0078d4]'
      }`} />

      <div className="px-4 py-3">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-[#0078d4]">
              <path d="M8 1L8 11M8 11L4 7M8 11L12 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 13H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span className="text-[13px] font-semibold text-[#cccccc]">
              {state === 'available' && '업데이트 가능'}
              {state === 'downloading' && '다운로드 중...'}
              {state === 'downloaded' && '업데이트 준비 완료'}
              {state === 'error' && '업데이트 오류'}
            </span>
          </div>
          {(state === 'available' || state === 'error') && (
            <button
              onClick={() => {
                setDismissed(true)
                if (state === 'error') setState('idle')
              }}
              className="text-[#555] hover:text-[#ccc] transition-colors text-lg leading-none"
            >
              ×
            </button>
          )}
        </div>

        {/* 본문 */}
        {state === 'available' && info && (
          <div className="mb-3">
            <p className="text-[12px] text-[#999] mb-1">
              새 버전 <span className="text-[#0078d4] font-semibold">v{info.version}</span>이 출시되었습니다.
            </p>
            <p className="text-[11px] text-[#666]">
              업데이트 후에도 모든 데이터가 유지됩니다.
            </p>
          </div>
        )}

        {state === 'downloading' && progress && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-[#999]">다운로드 진행 중</span>
              <span className="text-[11px] text-[#888]">{progress.percent}%</span>
            </div>
            <div className="w-full h-1.5 bg-[#3c3c3c] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-[#0078d4] transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {state === 'downloaded' && (
          <div className="mb-3">
            <p className="text-[12px] text-[#999]">
              업데이트 다운로드가 완료되었습니다. 지금 재시작하시겠습니까?
            </p>
            <p className="text-[11px] text-[#666] mt-1">
              모든 워크플로우, 스케줄, OTP 데이터가 그대로 유지됩니다.
            </p>
          </div>
        )}

        {state === 'error' && (
          <div className="mb-3">
            <p className="text-[12px] text-red-400">
              {error || '업데이트 중 오류가 발생했습니다.'}
            </p>
          </div>
        )}

        {/* 액션 버튼 */}
        <div className="flex justify-end gap-2">
          {state === 'available' && (
            <>
              <button
                onClick={() => setDismissed(true)}
                className="px-3 py-1.5 text-[11px] rounded-lg bg-[#3c3c3c] hover:bg-[#4a4a4a] text-[#999] transition-colors"
              >
                나중에
              </button>
              <button
                onClick={handleDownload}
                className="px-3 py-1.5 text-[11px] rounded-lg bg-[#0078d4] hover:bg-[#1a8ae8] text-white transition-colors font-medium"
              >
                업데이트
              </button>
            </>
          )}

          {state === 'downloaded' && (
            <>
              <button
                onClick={() => setDismissed(true)}
                className="px-3 py-1.5 text-[11px] rounded-lg bg-[#3c3c3c] hover:bg-[#4a4a4a] text-[#999] transition-colors"
              >
                나중에
              </button>
              <button
                onClick={handleInstall}
                className="px-3 py-1.5 text-[11px] rounded-lg bg-[#4caf50] hover:bg-[#5cbf60] text-white transition-colors font-medium"
              >
                재시작 및 설치
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
