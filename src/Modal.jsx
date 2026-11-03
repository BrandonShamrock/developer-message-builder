import React, { useEffect, useRef, useId } from 'react'
import { createPortal } from 'react-dom'
// Native dialog provides focus containment, Escape and background inertness.
export default function Modal({ title, onClose, busy = false, children, wide = false }) {
  const dialog = useRef(null)
  const heading = useId()
  useEffect(() => {
    const previous = document.activeElement
    dialog.current.showModal()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])
  return createPortal(<dialog ref={dialog} className={`app-dialog ${wide ? 'wide-dialog' : ''}`} aria-labelledby={heading} onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <div className="dialog-heading"><h2 id={heading}>{title}</h2><button type="button" className="secondary" aria-label={`Close ${title}`} disabled={busy} onClick={onClose}>×</button></div>{children}
  </dialog>, document.body)
}
