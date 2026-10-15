import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, ChevronRight, FolderOpen, LoaderCircle, Monitor, Radio, SlidersHorizontal, Usb, Wifi, X } from 'lucide-react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { api, desktop } from './api';
import { errorText } from './i18n';
import type { Translate } from './i18n';
import { applyPreset, asError, defaultOptions } from './types';
import type { AppError, AppSnapshot, DetectedDevice, DeviceProfile, MirrorOptions, Preset } from './types';

export function Modal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const element = root.current;
    element?.focus();
    return () => { before?.focus(); };
  }, []);
  return <div className="overlay"><div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabIndex={-1} ref={root} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key === 'Tab') {
      const focusable = root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea, a[href], [tabindex="0"]');
      const first = focusable?.[0], last = focusable?.[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <div className="modal-heading"><div><h2 id="dialog-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="Close / Cerrar" onClick={onClose}><X size={20}/></button></div>{children}
  </div></div>;
}
export function ErrorNotice({ error, t, onDismiss }: { error: AppError; t: Translate; onDismiss?: () => void }) {
  return <div className="notice error-notice" role="alert"><div><strong>{errorText(error.code, t)}</strong><details><summary>{t('details')}</summary><pre>{error.message}</pre></details></div>{onDismiss && <button className="icon-button" aria-label={t('dismiss')} onClick={onDismiss}><X size={17}/></button>}</div>;
}
export function Toggle({ label, hint, checked, disabled, onChange }: { label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <label className={`toggle-row ${disabled ? 'disabled' : ''}`}><span><span className="toggle-label">{label}</span>{hint && <small>{hint}</small>}</span><input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)}/><span className="switch" aria-hidden="true"/></label>;
}
export function OptionsEditor({ value, onChange, t, sdk }: { value: MirrorOptions; onChange: (value: MirrorOptions) => void; t: Translate; sdk?: number }) {
  const set = <K extends keyof MirrorOptions>(key: K, next: MirrorOptions[K]) => onChange({ ...value, [key]: next });
  const [preset, setPreset] = useState<Preset | ''>('');
  const number = (key: 'maxSize' | 'maxFps' | 'bitRate' | 'windowWidth' | 'windowHeight', label: string, max: number, hint?: string) => <label className="field"><span>{label}</span><input type="number" min={key === 'maxFps' || key === 'bitRate' ? 1 : 0} max={max} value={value[key]} onChange={e => set(key, Number(e.target.value))}/>{hint && <small>{hint}</small>}</label>;
  return <div className="options-editor">
    <label className="field"><span>{t('preset')}</span><div className="preset-list">{(['light', 'balanced', 'quality', 'personal'] as Preset[]).map(key => <button key={key} type="button" className={`preset ${preset === key ? 'selected' : ''}`} onClick={() => { setPreset(key); onChange(applyPreset(value, key)); }}>{t(key)}</button>)}</div></label>
    <section className="option-section"><h3><Monitor size={17}/>{t('display')}</h3>
      <Toggle label={t('control')} checked={value.control} onChange={control => onChange({ ...value, control, ...(control ? {} : { turnScreenOff: false, stayAwake: false }) })}/>
      <Toggle label={t('turnScreenOff')} hint={t('screenOffHint')} disabled={!value.control} checked={value.turnScreenOff} onChange={v => set('turnScreenOff', v)}/>
      <Toggle label={t('stayAwake')} disabled={!value.control} checked={value.stayAwake} onChange={v => set('stayAwake', v)}/>
      <Toggle label={t('audio')} hint={sdk !== undefined && sdk < 30 ? t('androidAudio') : t('audioHint')} disabled={sdk !== undefined && sdk < 30} checked={value.audio} onChange={v => set('audio', v)}/>
      <Toggle label={t('clipboard')} checked={value.clipboard} disabled={!value.control} onChange={v => set('clipboard', v)}/>
    </section>
    <details className="advanced"><summary><SlidersHorizontal size={17}/>{t('advanced')}<ChevronRight size={16}/></summary><div className="field-grid">
      {number('maxSize', t('maxSize'), 8192, t('original'))}{number('maxFps', t('maxFps'), 240)}{number('bitRate', t('bitrate'), 200)}
      <label className="field"><span>{t('codec')}</span><select value={value.codec} onChange={e => set('codec', e.target.value)}><option value="h264">H.264</option><option value="h265">H.265</option><option value="av1">AV1</option></select></label>
      {number('windowWidth', t('width'), 7680, t('automatic'))}{number('windowHeight', t('height'), 7680, t('automatic'))}
    </div><Toggle label={t('fullscreen')} checked={value.fullscreen} onChange={v => set('fullscreen', v)}/><Toggle label={t('alwaysOnTop')} checked={value.alwaysOnTop} onChange={v => set('alwaysOnTop', v)}/></details>
    <section className="option-section"><h3><Radio size={17}/>{t('recording')}</h3><Toggle label={t('record')} hint={t('recordHint')} checked={value.record} onChange={v => set('record', v)}/>
      {value.record && <label className="field"><span>{t('recordingFolder')}</span><div className="input-action"><input required value={value.recordingDirectory} onChange={e => set('recordingDirectory', e.target.value)} placeholder="C:\Videos"/><button type="button" className="secondary" onClick={async () => { if (!desktop) return; const directory = await openDialog({ directory: true, multiple: false }); if (typeof directory === 'string') set('recordingDirectory', directory); }}><FolderOpen size={17}/>{t('browse')}</button></div></label>}
    </section>
  </div>;
}

export function RegisterDialog({ snapshot, t, onClose, onSaved, initialDevice }: { snapshot: AppSnapshot; t: Translate; onClose: () => void; onSaved: () => void; initialDevice?: DetectedDevice }) {
  const [mode, setMode] = useState<'usb' | 'wifi' | 'prepare'>(initialDevice?.transport === 'wifi' ? 'wifi' : 'usb');
  const [step, setStep] = useState(initialDevice?.state === 'device' ? 2 : 1);
  const [selected, setSelected] = useState<DetectedDevice | undefined>(initialDevice);
  const [name, setName] = useState(initialDevice?.model ?? '');
  const [options, setOptions] = useState({ ...defaultOptions });
  const [pairAddress, setPairAddress] = useState(''), [code, setCode] = useState(''), [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState<AppError | null>(null), [paired, setPaired] = useState(false);
  const [confirmed, setConfirmed] = useState(false), [associate, setAssociate] = useState('');
  const choose = (device: DetectedDevice) => { setSelected(device); setName(device.model); setConfirmed(false); };
  const perform = async (action: () => Promise<void>) => { setBusy(true); setError(null); try { await action(); } catch (e) { setError(asError(e)); } finally { setBusy(false); } };
  const ready = selected?.state === 'device' && (mode !== 'prepare' || selected.transport === 'wifi');
  const devices = snapshot.discovery.devices.filter(d => mode === 'wifi' ? d.transport === 'wifi' : d.transport === 'usb' || d.serial === selected?.serial);
  const finish = (event: React.FormEvent) => { event.preventDefault(); if (!selected) return; void perform(async () => { await api.register(selected.serial, name, options, associate || null); onSaved(); }); };
  return <Modal wide title={step === 1 ? t('first') : t('devicePreferences')} subtitle={step === 1 ? t('firstDesc') : t('preferencesDesc')} onClose={() => { if (!busy) onClose(); }}>
    <div className="steps"><span className={step === 1 ? 'current' : 'complete'}><b>{step === 2 ? <Check size={13}/> : '1'}</b>{t('stepConnection')}</span><i/><span className={step === 2 ? 'current' : ''}><b>2</b>{t('stepPreferences')}</span></div>
    {error && <ErrorNotice error={error} t={t}/>}
    {step === 1 ? <div className="wizard-body"><div className="connection-tabs">{(['usb', 'wifi', 'prepare'] as const).map(key => <button key={key} className={mode === key ? 'selected' : ''} disabled={busy} onClick={() => { setMode(key); setSelected(undefined); }}>{key === 'usb' ? <Usb size={19}/> : <Wifi size={19}/>}{t(key)}</button>)}</div>
      <p className="guide-note">{t(mode === 'usb' ? 'usbGuide' : mode === 'wifi' ? 'wifiGuide' : 'prepareGuide')}</p>
      {mode === 'wifi' && <><form className="connection-form" onSubmit={e => { e.preventDefault(); void perform(async () => { try { await api.pair(pairAddress, code); setPaired(true); } finally { setCode(''); } }); }}>
        <label className="field"><span>{t('pairAddress')}</span><input required placeholder="192.168.1.20:37123" value={pairAddress} disabled={busy} onChange={e => setPairAddress(e.target.value)}/></label>
        <label className="field code-field"><span>{t('code')}</span><input required inputMode="numeric" autoComplete="off" type="password" pattern="[0-9]{6}" maxLength={6} value={code} disabled={busy} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}/></label><button className="secondary" disabled={busy}>{t('pair')}</button>
      </form>{paired && <div role="status" className="notice success">{t('paired')}</div>}
      <form className="manual-connect" onSubmit={e => { e.preventDefault(); void perform(async () => choose(await api.connect(address))); }}><label className="field"><span>{t('connectAddress')}</span><input aria-label={t('connectAddress')} required placeholder="192.168.1.20:40999" disabled={busy} value={address} onChange={e => setAddress(e.target.value)}/><small>{t('addressHint')}</small></label><button className="secondary" disabled={busy}>{t('connect')}</button></form>
      {!!snapshot.discovery.services.length && <div className="service-list"><h4>{t('services')}</h4>{snapshot.discovery.services.map(s => <button key={`${s.kind}-${s.endpoint}`} disabled={busy} onClick={() => { if (s.kind.includes('pairing')) { setPairAddress(s.endpoint); } else { setAddress(s.endpoint); void perform(async () => choose(await api.connect(s.endpoint))); } }}><Wifi size={15}/><span>{s.name}<small>{s.endpoint}</small></span><b>{t(s.kind.includes('pairing') ? 'pair' : 'connect')}</b></button>)}</div>}</>}
      <div className="detected-heading"><h3>{t('chooseDevice')}</h3><button className="text-button" disabled={busy} onClick={() => void perform(async () => { await api.discover(); })}>{busy ? t('searching') : t('refresh')}</button></div>
      <div className="detected-list">{devices.length ? devices.map(device => <button key={device.serial} disabled={busy || device.state !== 'device'} className={selected?.serial === device.serial ? 'selected' : ''} onClick={() => choose(device)}>{device.transport === 'usb' ? <Usb size={20}/> : <Wifi size={20}/>}<span><strong>{device.model || device.serial}</strong><small>{device.state === 'unauthorized' ? t('unauthorized') : device.state === 'offline' ? t('offline') : device.serial}</small></span>{selected?.serial === device.serial && <Check size={18}/>}</button>) : <p className="muted">{t('noDetected')}</p>}</div>
      {selected && !devices.some(d => d.serial === selected.serial) && <div className="notice success"><Check size={16}/>{selected.model} · {selected.serial}</div>}
      {mode === 'prepare' && selected?.transport === 'usb' && <button className="secondary prepare-button" disabled={busy} onClick={() => void perform(async () => choose(await api.prepare(selected.serial)))}><Wifi size={17}/>{t('prepareButton')}</button>}
      <div className="modal-actions"><button className="secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="primary" disabled={busy || !ready} onClick={() => setStep(2)}>{busy && <LoaderCircle className="spin" size={17}/>} {t('next')}<ChevronRight size={17}/></button></div>
    </div> : <form onSubmit={finish}><div className="wizard-body"><label className="field"><span>{t('name')}</span><input required maxLength={80} value={name} onChange={e => setName(e.target.value)}/></label>
      {!selected?.identity && <div className="notice warning"><div><p>{t('unknownIdentity')}</p><label className="check-label"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>{t('identityConfirm')}</label></div></div>}
      {snapshot.settings.profiles.length > 0 && <label className="field association"><span>{t('association')}</span><select value={associate} onChange={e => setAssociate(e.target.value)}><option value="">{t('newDevice')}</option>{snapshot.settings.profiles.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select><small>{t('associationHint')}</small></label>}
      <OptionsEditor t={t} value={options} onChange={setOptions} sdk={selected?.sdk}/></div>
      <div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setStep(1)}>{t('back')}</button><button className="primary" disabled={busy || !name.trim() || (!selected?.identity && !confirmed)}>{busy ? <LoaderCircle className="spin" size={17}/> : <Check size={17}/>} {t('done')}</button></div>
    </form>}
  </Modal>;
}
export function EditDialog({ profile, t, onClose, onSaved }: { profile: DeviceProfile; t: Translate; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(profile.name), [options, setOptions] = useState({ ...profile.options });
  const [busy, setBusy] = useState(false), [error, setError] = useState<AppError | null>(null);
  return <Modal wide title={t('configure')} subtitle={`${profile.model} · ${t('restartHint')}`} onClose={() => { if (!busy) onClose(); }}><form onSubmit={event => { event.preventDefault(); setBusy(true); setError(null); void api.edit(profile.id, name, options).then(onSaved).catch(e => setError(asError(e))).finally(() => setBusy(false)); }}>
    <div className="wizard-body">{error && <ErrorNotice error={error} t={t}/>}<label className="field"><span>{t('name')}</span><input required maxLength={80} value={name} onChange={e => setName(e.target.value)}/></label><OptionsEditor value={options} onChange={setOptions} t={t} sdk={profile.sdk}/></div><div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="primary" disabled={busy || !name.trim()}>{busy && <LoaderCircle className="spin" size={17}/>} {t('save')}</button></div>
  </form></Modal>;
}
