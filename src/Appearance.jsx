import React, { useEffect, useState } from 'react'
import { supabase } from './supabase'
import Modal from './Modal'
export const DEFAULT_APPEARANCE = { theme_mode: 'light', colour_theme: 'blue', font_size: 'default' }
const themes = [['blue', 'PostX Blue', '#3157d5'], ['teal', 'Teal', '#087e83'], ['purple', 'Purple', '#7950b7'], ['green', 'Green', '#257b45'], ['amber', 'Amber', '#936000']]
function apply(preferences) {
  const root = document.documentElement
  root.dataset.mode = preferences.theme_mode
  root.dataset.theme = preferences.colour_theme
  root.dataset.font = preferences.font_size
}
export default function Appearance({ user }) {
  const [saved, setSaved] = useState(DEFAULT_APPEARANCE)
  const [draft, setDraft] = useState(DEFAULT_APPEARANCE)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    apply(DEFAULT_APPEARANCE)
    supabase.from('user_preferences').select('theme_mode,colour_theme,font_size').eq('user_id', user.id).maybeSingle().then(({ data, error }) => {
      if (cancelled) return
      if (error) setError(`Unable to load preferences: ${error.message}`)
      const preferences = data || DEFAULT_APPEARANCE
      setSaved(preferences); setDraft(preferences); apply(preferences); setLoading(false)
    })
    return () => { cancelled = true; apply(DEFAULT_APPEARANCE) }
  }, [user.id])
  useEffect(() => { apply(open ? draft : saved) }, [open, draft, saved])
  function cancel() { setDraft(saved); setOpen(false); apply(saved) }
  async function save() {
    setSaving(true); setError('')
    try {
      const { error } = await supabase.from('user_preferences').upsert({ user_id: user.id, ...draft }, { onConflict: 'user_id' })
      if (error) throw error
      setSaved(draft); setOpen(false)
    } catch (error) { setError(`Unable to save preferences: ${error.message}`) }
    finally { setSaving(false) }
  }
  return <><button className="settings-button" aria-label="Appearance Settings" title="Appearance Settings" disabled={loading} onClick={() => { setDraft(saved); setOpen(true) }}>⚙</button>
    {open && <Modal title="Appearance Settings" onClose={cancel} busy={saving}>
      <label>Mode<select aria-label="Mode" value={draft.theme_mode} onChange={e => setDraft({ ...draft, theme_mode: e.target.value })}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System Default</option></select></label>
      <fieldset className="theme-picker"><legend>Colour theme</legend>{themes.map(([value, name, colour]) => <label key={value}><input type="radio" name="colour-theme" value={value} checked={draft.colour_theme === value} onChange={() => setDraft({ ...draft, colour_theme: value })} /><span className="swatch" style={{ background: colour }} />{name}</label>)}</fieldset>
      <label>Font size<select aria-label="Font size" value={draft.font_size} onChange={e => setDraft({ ...draft, font_size: e.target.value })}>{[['small', 'Small'], ['default', 'Default'], ['large', 'Large'], ['extra-large', 'Extra Large']].map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
      <div className="appearance-preview"><h3>Live preview</h3><p>Your appearance applies across Amper Besig.</p><button type="button">Primary button</button><span className="category-badge">Category: Onboarding</span></div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions"><button disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Preferences'}</button><button className="secondary" disabled={saving} onClick={cancel}>Cancel</button><button className="secondary" disabled={saving} onClick={() => setDraft(DEFAULT_APPEARANCE)}>Reset to Default</button></div>
    </Modal>}
  </>
}
