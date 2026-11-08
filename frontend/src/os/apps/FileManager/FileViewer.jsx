import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, File, Loader2, X } from 'lucide-react'
import { readBlob, isTextMime, formatBytes } from '../../../lib/opfsDrive'

const FILE_ICON_CLASS = 'shrink-0 text-[#3d5a80]'

// Preview of one file. Shown beside the folder list (Explorer's preview pane),
// so the listing stays visible.
export default function FileViewer({ file, onClose }) {
  // Two kinds of file:
  //   - inline text files created in-app (have `content`, no `blobId`)
  //   - imported files backed by an OPFS blob (have `blobId`)
  const isBlob = Boolean(file.blobId)
  const [state, setState] = useState(() =>
    isBlob ? { status: 'loading' } : { status: 'text', text: file.content || '' },
  )
  // Track object URLs so we can revoke them and avoid leaks.
  const urlRef = useRef(null)

  // FileViewer is remounted per file (keyed on path by the parent), so the
  // useState initializer above already seeds 'loading' for blob files — no
  // synchronous setState reset needed here.
  useEffect(() => {
    if (!isBlob) return
    let cancelled = false
    readBlob(file.blobId)
      .then(async (blob) => {
        if (cancelled) return
        if (!blob) {
          setState({ status: 'missing' })
          return
        }
        if (isTextMime(file.mime) && blob.size < 512 * 1024) {
          const text = await blob.text()
          if (!cancelled) setState({ status: 'text', text })
        } else {
          const url = URL.createObjectURL(blob)
          urlRef.current = url
          setState({ status: 'binary', url })
        }
      })
      // A failed read shows the same message as missing data, not an endless spinner.
      .catch(() => {
        if (!cancelled) setState({ status: 'missing' })
      })
    return () => {
      cancelled = true
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [isBlob, file.blobId, file.mime])

  const download = useCallback(() => {
    readBlob(file.blobId).then((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      a.click()
      URL.revokeObjectURL(url)
    })
  }, [file.blobId, file.name])

  const isImage = (file.mime || '').startsWith('image/')

  return (
    <div className="flex h-full flex-col bg-white text-[12px] text-foreground">
      <div className="w7-commandbar justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <File size={16} className={FILE_ICON_CLASS} />
          <span className="truncate font-semibold">{file.name}</span>
          {file.size != null && (
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {formatBytes(file.size)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {isBlob && (
            <button
              type="button"
              onClick={download}
              className="w7-toolbtn pointer-coarse:min-h-11"
              aria-label="Download file"
              title="Download"
            >
              <Download size={14} />
              <span>Download</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close file viewer"
            title="Close"
            className="w7-toolbtn pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {state.status === 'loading' && (
        <div
          role="status"
          className="flex flex-1 items-center justify-center gap-2 text-muted-foreground"
        >
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
          <span>Loading…</span>
        </div>
      )}

      {state.status === 'missing' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <File size={32} className={FILE_ICON_CLASS} />
          <p className="w7-error">This file can't be opened.</p>
          <p className="text-muted-foreground">
            Its stored data is missing, or the browser's storage was cleared.
          </p>
        </div>
      )}

      {state.status === 'text' && (
        <pre className="w7-sunken m-2 flex-1 overflow-auto p-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-foreground">
          {state.text || '(empty file)'}
        </pre>
      )}

      {state.status === 'binary' &&
        (isImage ? (
          <div className="flex flex-1 items-center justify-center overflow-auto bg-muted p-4">
            <img src={state.url} alt={file.name} className="max-h-full max-w-full object-contain" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
            <File size={32} className={FILE_ICON_CLASS} />
            <p className="text-muted-foreground">No preview is available for this file type.</p>
            <button type="button" onClick={download} className="w7-btn">
              <Download size={14} /> Download {file.name}
            </button>
          </div>
        ))}
    </div>
  )
}
