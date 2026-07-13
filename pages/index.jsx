import { useState, useEffect, useCallback, useRef } from 'react'
import Head from 'next/head'

const AIRTABLE_API_KEY = process.env.NEXT_PUBLIC_AIRTABLE_API_KEY
const AIRTABLE_BASE_ID = process.env.NEXT_PUBLIC_AIRTABLE_BASE_ID
const AIRTABLE_TABLE_ID = process.env.NEXT_PUBLIC_AIRTABLE_TABLE_ID
const MAKE_WEBHOOK_URL = process.env.NEXT_PUBLIC_MAKE_WEBHOOK_URL

const FIT_COLORS = {
  high: { bg: '#E8F5E9', text: '#2E7D32', border: '#A5D6A7' },
  mid: { bg: '#FFF8E1', text: '#F57F17', border: '#FFE082' },
  low: { bg: '#FFF3E0', text: '#E65100', border: '#FFCC80' },
  stretch: { bg: '#FCE4EC', text: '#880E4F', border: '#F48FB1' },
}

const STATUS_OPTIONS = [
  { value: 'new', label: 'new' },
  { value: 'saved', label: 'saved' },
  { value: 'applied', label: 'applied' },
  { value: 'duplicate', label: 'duplicate' },
  { value: 'not interested', label: 'not interested' },
  { value: "didn't apply", label: "didn't apply" },
]

const STATUS_VALUES = STATUS_OPTIONS.map(o => o.value)

const REASON_FIELD_CANDIDATES = [
  'not_interested_reason',
  'not interested reason',
  'Not Interested Reason',
]

const PENDING_REASONS_KEY = 'job_dashboard_pending_reasons'

const NOT_INTERESTED_REASONS = [
  'too junior',
  'too senior',
  'wrong function',
  'not remote',
  'comp / stage',
  'industry mismatch',
  'revenue-primary',
  'other',
]

function normalizeReason(reason) {
  if (!reason || typeof reason !== 'string') return reason
  const lower = reason.trim().toLowerCase()
  const match = NOT_INTERESTED_REASONS.find(r => r === lower)
  return match || lower
}

function normalizeReasons(reasons) {
  return [...new Set((reasons || []).map(normalizeReason).filter(Boolean))]
}

const STATUS_COLORS = {
  new: '#6366F1',
  saved: '#059669',
  applied: '#0EA5E9',
  duplicate: '#9CA3AF',
  'not interested': '#DC2626',
  "didn't apply": '#64748B',
  // legacy title-case values still in older records
  New: '#6366F1',
  Saved: '#059669',
  Applied: '#0EA5E9',
  Duplicate: '#9CA3AF',
  'Not Interested': '#DC2626',
  maybe: '#D97706',
  hidden: '#9CA3AF',
}

function getStatus(fields) {
  return fields?.Status ?? fields?.status ?? 'new'
}

function findReasonFieldName(records, metaSchema) {
  if (metaSchema?.reasonField) return metaSchema.reasonField
  for (const r of records) {
    for (const k of Object.keys(r.fields)) {
      if (/not[_ ]?interested[_ ]?reason/i.test(k)) return k
    }
  }
  for (const name of REASON_FIELD_CANDIDATES) {
    if (records.some(rec => Object.prototype.hasOwnProperty.call(rec.fields, name))) return name
  }
  // Prefer snake_case — matches other dashboard field names (apply_url, fit_score, status)
  return 'not_interested_reason'
}

function readReasonsFromFields(fields, reasonField) {
  if (!fields) return null
  if (reasonField && fields[reasonField] != null) {
    const raw = fields[reasonField]
    return normalizeReasons(Array.isArray(raw) ? raw : [raw])
  }
  for (const name of REASON_FIELD_CANDIDATES) {
    if (fields[name] != null) {
      const raw = fields[name]
      return normalizeReasons(Array.isArray(raw) ? raw : [raw])
    }
  }
  for (const k of Object.keys(fields)) {
    if (/not[_ ]?interested[_ ]?reason/i.test(k) && fields[k] != null) {
      const raw = fields[k]
      return normalizeReasons(Array.isArray(raw) ? raw : [raw])
    }
  }
  return null
}

function getNotInterestedReasons(fields, recordId, reasonField) {
  const fromAirtable = readReasonsFromFields(fields, reasonField)
  if (fromAirtable != null) return fromAirtable
  return getPendingReasons(recordId)
}

function getPendingReasons(recordId) {
  if (typeof window === 'undefined') return []
  try {
    const all = JSON.parse(localStorage.getItem(PENDING_REASONS_KEY) || '{}')
    return all[recordId] || []
  } catch {
    return []
  }
}

function setPendingReasons(recordId, reasons) {
  if (typeof window === 'undefined') return
  try {
    const all = JSON.parse(localStorage.getItem(PENDING_REASONS_KEY) || '{}')
    if (reasons.length === 0) delete all[recordId]
    else all[recordId] = reasons
    localStorage.setItem(PENDING_REASONS_KEY, JSON.stringify(all))
  } catch { /* ignore */ }
}

function clearPendingReasons(recordId) {
  setPendingReasons(recordId, [])
}

function statusesEqual(a, b) {
  if (!a || !b) return false
  return a === b || a.toLowerCase() === b.toLowerCase()
}

function statusLabel(value) {
  const opt = STATUS_OPTIONS.find(o => statusesEqual(o.value, value))
  if (opt) return opt.label
  return (value || 'new').toLowerCase()
}

function detectReasonFieldFromRecords(records) {
  return findReasonFieldName(records, null)
}

async function fetchAirtableMetaSchema() {
  try {
    const res = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    const table = data.tables?.find(t => t.id === AIRTABLE_TABLE_ID)
    if (!table) return null
    const statusField = table.fields.find(f => f.name === 'Status' || f.name === 'status')?.name ?? 'status'
    const reasonField = table.fields.find(f => /not[_ ]?interested[_ ]?reason/i.test(f.name))?.name ?? null
    return { statusField, reasonField, fields: table.fields }
  } catch {
    return null
  }
}

function detectAirtableSchema(records, metaSchema) {
  const statusField = metaSchema?.statusField
    ?? (records.some(r => Object.prototype.hasOwnProperty.call(r.fields, 'Status')) ? 'Status' : 'status')
  const reasonField = findReasonFieldName(records, metaSchema)
  const knownStatuses = [...new Set(records.map(r => getStatus(r.fields)).filter(Boolean))]
  return { statusField, reasonField, knownStatuses }
}

function isNotInterested(status) {
  return statusesEqual(status, 'not interested')
}

function isDimmedStatus(status) {
  const s = (status || '').toLowerCase()
  return s === 'duplicate' || s === 'hidden'
}

function toAirtableStatus(uiStatus, knownStatuses) {
  const match = knownStatuses.find(s => statusesEqual(s, uiStatus))
  if (match) return match
  return uiStatus
}

function buildAirtableFields(status, reasons, schema, reasonFieldOverride) {
  const airtableStatus = toAirtableStatus(status, schema.knownStatuses)
  const fields = { [schema.statusField]: airtableStatus }
  const reasonField = reasonFieldOverride ?? schema.reasonField
  if (reasonField) {
    fields[reasonField] = isNotInterested(status) ? normalizeReasons(reasons) : []
  }
  return fields
}

async function airtablePatch(recordId, fields) {
  const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${recordId}`)
  url.searchParams.set('typecast', 'true')
  const res = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err.error?.message || err.error?.type || `HTTP ${res.status}`
    throw new Error(msg)
  }
}

async function airtablePatchBatch(records) {
  const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`)
  url.searchParams.set('typecast', 'true')
  const res = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ records }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err.error?.message || err.error?.type || `HTTP ${res.status}`
    throw new Error(msg)
  }
}

function getFitColor(score) {
  if (score >= 75) return FIT_COLORS.high
  if (score >= 55) return FIT_COLORS.mid
  if (score >= 40) return FIT_COLORS.low
  return FIT_COLORS.stretch
}

function FitBadge({ score, label }) {
  const colors = getFitColor(score)
  return (
    <span style={{
      background: colors.bg,
      color: colors.text,
      border: `1px solid ${colors.border}`,
      borderRadius: '20px',
      padding: '3px 10px',
      fontSize: '12px',
      fontWeight: '700',
      whiteSpace: 'nowrap',
    }}>
      {score}% · {label}
    </span>
  )
}

function ReasonPicker({ reasons, onChange, autoFocus }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (autoFocus && containerRef.current) containerRef.current.focus()
  }, [autoFocus])

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        marginTop: '8px',
        outline: 'none',
      }}
    >
      {NOT_INTERESTED_REASONS.map(reason => {
        const selected = reasons.some(r => normalizeReason(r) === reason)
        return (
          <button
            key={reason}
            type="button"
            onClick={() => {
              const normalized = normalizeReasons(reasons)
              const next = selected
                ? normalized.filter(r => r !== reason)
                : [...normalized, reason]
              onChange(next)
            }}
            style={{
              background: selected ? '#FEE2E2' : '#F9FAFB',
              color: selected ? '#991B1B' : '#374151',
              border: selected ? '1px solid #FCA5A5' : '1px solid #E5E7EB',
              borderRadius: '6px',
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: selected ? '600' : '500',
              cursor: 'pointer',
            }}
          >
            {reason}
          </button>
        )
      })}
    </div>
  )
}

function ReasonTags({ reasons, style = {} }) {
  if (!reasons.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', ...style }}>
      {reasons.map(r => (
        <span key={r} style={{
          background: '#FEE2E2',
          color: '#991B1B',
          border: '1px solid #FCA5A5',
          borderRadius: '4px',
          padding: '2px 8px',
          fontSize: '11px',
          fontWeight: '600',
        }}>
          {r}
        </span>
      ))}
    </div>
  )
}

function JobStatusControl({ jobId, status, reasons, onStatusChange, onReasonsChange }) {
  const [open, setOpen] = useState(false)
  const [awaitingReasons, setAwaitingReasons] = useState(false)
  const [draftReasons, setDraftReasons] = useState([])

  const needsReasons = isNotInterested(status) && reasons.length === 0
  const showReasonPrompt = awaitingReasons || needsReasons

  useEffect(() => {
    if (needsReasons) setAwaitingReasons(true)
  }, [needsReasons])

  const handleStatusSelect = (newStatus) => {
    setOpen(false)
    if (isNotInterested(newStatus)) {
      if (reasons.length > 0) {
        setAwaitingReasons(false)
        onStatusChange(jobId, newStatus, reasons)
      } else {
        setAwaitingReasons(true)
        setDraftReasons([])
      }
    } else {
      setAwaitingReasons(false)
      setDraftReasons([])
      onStatusChange(jobId, newStatus, [])
    }
  }

  const confirmNotInterested = () => {
    if (draftReasons.length === 0) return
    setAwaitingReasons(false)
    onStatusChange(jobId, 'not interested', normalizeReasons(draftReasons))
  }

  const cancelReasonPrompt = () => {
    setAwaitingReasons(false)
    setDraftReasons([])
  }

  const activeDraft = awaitingReasons ? draftReasons : reasons

  return (
    <div style={{ width: '100%', maxWidth: '480px' }}>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{
            background: STATUS_COLORS[status] || '#9CA3AF',
            color: '#fff',
            border: 'none',
            borderRadius: '20px',
            padding: '3px 10px',
            fontSize: '11px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          {statusLabel(status)} ▾
        </button>
        {open && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            background: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            zIndex: 100,
            minWidth: '160px',
            overflow: 'hidden',
          }}>
            {STATUS_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => handleStatusSelect(value)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 14px',
                  background: statusesEqual(value, status) ? '#F3F4F6' : '#fff',
                  border: 'none',
                  textAlign: 'left',
                  fontSize: '12px',
                  cursor: 'pointer',
                  color: STATUS_COLORS[value] || '#374151',
                  fontWeight: statusesEqual(value, status) ? '700' : '400',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {showReasonPrompt && (
        <div style={{
          marginTop: '10px',
          background: '#FEF2F2',
          border: '2px solid #FCA5A5',
          borderRadius: '10px',
          padding: '12px',
        }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#991B1B', marginBottom: '4px' }}>
            Select at least one reason
          </p>
          <p style={{ fontSize: '12px', color: '#B91C1C', marginBottom: '10px' }}>
            Required before saving &quot;not interested&quot; — this feeds the learning loop.
          </p>
          <ReasonPicker
            reasons={activeDraft}
            onChange={next => {
              if (awaitingReasons) setDraftReasons(next)
              else onReasonsChange(jobId, status, next)
            }}
            autoFocus
          />
          {awaitingReasons && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={confirmNotInterested}
                disabled={draftReasons.length === 0}
                style={{
                  background: draftReasons.length === 0 ? '#E5E7EB' : '#DC2626',
                  color: draftReasons.length === 0 ? '#9CA3AF' : '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: draftReasons.length === 0 ? 'default' : 'pointer',
                }}
              >
                Save not interested
              </button>
              <button
                type="button"
                onClick={cancelReasonPrompt}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6B7280',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {isNotInterested(status) && reasons.length > 0 && !showReasonPrompt && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '4px' }}>Update reasons:</div>
          <ReasonPicker
            reasons={reasons}
            onChange={next => onReasonsChange(jobId, status, next)}
          />
        </div>
      )}
    </div>
  )
}

function MetaChip({ label, value, accent }) {
  if (!value && value !== 0) return null
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      background: '#F9FAFB',
      border: '1px solid #E5E7EB',
      borderRadius: '6px',
      padding: '4px 8px',
      fontSize: '12px',
      color: '#374151',
      lineHeight: 1.2,
    }}>
      <span style={{ fontSize: '10px', fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      <span style={{ fontWeight: '600', color: accent || '#374151' }}>{value}</span>
    </span>
  )
}

function formatRemote(value) {
  if (value === true || value === 'true' || value === 'yes' || value === 'Yes') return 'Remote'
  if (value === false || value === 'false' || value === 'no' || value === 'No') return 'Onsite'
  if (typeof value === 'string' && value.trim()) return value
  return null
}

function formatSalary(value) {
  if (!value || value === 'Unknown') return '—'
  return value
}

function getApplyUrl(fields) {
  const raw = fields?.apply_url ?? fields?.['Apply URL'] ?? fields?.applyUrl
  if (!raw) return null
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    if (trimmed.startsWith('//')) return `https:${trimmed}`
    return `https://${trimmed}`
  }
  if (typeof raw === 'object' && raw.url) {
    return getApplyUrl({ apply_url: raw.url })
  }
  return null
}

const linkStyle = {
  color: '#6366F1',
  textDecoration: 'none',
  fontWeight: '600',
}

function ApplyLink({ url, children, style = {} }) {
  if (!url) return <span style={style}>{children}</span>
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ ...linkStyle, ...style }}
      onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline' }}
      onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none' }}
    >
      {children}
    </a>
  )
}

function JobCard({ job, schema, onStatusChange, onReasonsChange, selected, onToggleSelect }) {
  const [expanded, setExpanded] = useState(false)
  const score = job.fields.fit_score || 0
  const remoteLabel = formatRemote(job.fields.remote)
  const applyUrl = getApplyUrl(job.fields)
  const status = getStatus(job.fields)
  const reasons = getNotInterestedReasons(job.fields, job.id, schema.reasonField)

  return (
    <div style={{
      background: selected ? '#EEF2FF' : '#fff',
      border: selected ? '1px solid #A5B4FC' : '1px solid #E5E7EB',
      borderRadius: '12px',
      padding: '16px 20px',
      marginBottom: '8px',
      borderLeft: `4px solid ${getFitColor(score).border}`,
      opacity: isDimmedStatus(status) ? 0.55 : 1,
      transition: 'opacity 0.2s, background 0.15s, border-color 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <label style={{ flexShrink: 0, display: 'flex', alignItems: 'center', paddingTop: '4px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(job.id)}
            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#6366F1' }}
          />
        </label>

        {/* Score */}
        <div style={{ flexShrink: 0, width: '44px', textAlign: 'center' }}>
          <div style={{
            fontSize: '20px',
            fontWeight: '800',
            color: getFitColor(score).text,
            lineHeight: 1,
          }}>{score}</div>
          <div style={{ fontSize: '9px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>fit</div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <ApplyLink
              url={applyUrl}
              style={{
                fontSize: '15px',
                fontWeight: '700',
                color: applyUrl ? '#111827' : '#374151',
              }}
            >
              {job.fields.title}
            </ApplyLink>
            {applyUrl && (
              <ApplyLink
                url={applyUrl}
                style={{
                  fontSize: '12px',
                  background: '#EEF2FF',
                  border: '1px solid #C7D2FE',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  whiteSpace: 'nowrap',
                }}
              >
                Apply →
              </ApplyLink>
            )}
          </div>

          <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '8px' }}>
            <strong style={{ color: '#374151' }}>{job.fields.company}</strong>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
            <MetaChip label="Source" value={job.fields.source || '—'} />
            <MetaChip label="Salary" value={formatSalary(job.fields.salary)} accent="#059669" />
            <MetaChip
              label="Remote"
              value={remoteLabel || '—'}
              accent={remoteLabel === 'Remote' ? '#0369A1' : '#374151'}
            />
            <MetaChip label="Location" value={job.fields.location || '—'} />
          </div>

          {reasons.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '10px', fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
                not interested reason
              </div>
              <ReasonTags reasons={reasons} />
            </div>
          )}

          {/* Tags */}
          {job.fields.tags && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
              {(Array.isArray(job.fields.tags) ? job.fields.tags : job.fields.tags.split(', ')).slice(0, 4).map(tag => (
                <span key={tag} style={{
                  background: '#F3F4F6',
                  color: '#374151',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '11px',
                }}>{tag}</span>
              ))}
            </div>
          )}

          {/* Why — expandable */}
          {job.fields.why && (
            <div>
              <button
                onClick={() => setExpanded(!expanded)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#9CA3AF',
                  fontSize: '11px',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {expanded ? '▲ Hide' : '▼ Why this role'}
              </button>
              {expanded && (
                <p style={{
                  fontSize: '12px',
                  color: '#6B7280',
                  fontStyle: 'italic',
                  margin: '4px 0 0',
                  lineHeight: '1.5',
                }}>
                  {job.fields.why}
                </p>
              )}
            </div>
          )}

          <div style={{ marginTop: '10px' }}>
            <JobStatusControl
              jobId={job.id}
              status={status}
              reasons={reasons}
              onStatusChange={onStatusChange}
              onReasonsChange={onReasonsChange}
            />
          </div>
        </div>

        {/* Right side: fit label */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
          <FitBadge score={score} label={job.fields.fit_label || ''} />
          {job.fields.posted_days != null && (
            <div style={{ fontSize: '10px', color: '#D1D5DB' }}>
              Posted {job.fields.posted_days}d ago
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(false)
  const [filters, setFilters] = useState({
    status: 'all',
    remote: 'all',
    industry: 'all',
    source: 'all',
    reason: 'all',
    minScore: 0,
    search: '',
  })
  const [lastRun, setLastRun] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [airtableSchema, setAirtableSchema] = useState({ statusField: 'status', reasonField: 'not_interested_reason', knownStatuses: [] })
  const reasonDebounceRef = useRef({})
  const schemaRef = useRef({ statusField: 'status', reasonField: 'not_interested_reason', knownStatuses: [] })

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let allRecords = []
      let offset = null
      do {
        const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`)
        url.searchParams.set('pageSize', '100')
        url.searchParams.set('sort[0][field]', 'fit_score')
        url.searchParams.set('sort[0][direction]', 'desc')
        if (offset) url.searchParams.set('offset', offset)

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
        })
        if (!res.ok) throw new Error(`Airtable error: ${res.status}`)
        const data = await res.json()
        allRecords = [...allRecords, ...data.records]
        offset = data.offset
      } while (offset)

      setJobs(allRecords)
      const metaSchema = await fetchAirtableMetaSchema()
      const schema = detectAirtableSchema(allRecords, metaSchema)
      schemaRef.current = schema
      setAirtableSchema(schema)

      // Get last run date from most recent first_seen
      if (allRecords.length > 0) {
        const dates = allRecords
          .map(r => r.fields.first_seen)
          .filter(Boolean)
          .sort()
          .reverse()
        if (dates[0]) setLastRun(dates[0])
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  const applyLocalJobUpdate = useCallback((recordId, status, reasons) => {
    const { statusField, reasonField } = schemaRef.current
    setJobs(prev => prev.map(j => {
      if (j.id !== recordId) return j
      const fields = { ...j.fields, [statusField]: status }
      if (statusField === 'Status') fields.status = status
      if (statusField === 'status') fields.Status = status
      if (reasonField) {
        fields[reasonField] = isNotInterested(status) ? reasons : []
      }
      return { ...j, fields }
    }))
  }, [])

  const patchJobToAirtable = useCallback(async (recordId, status, reasons) => {
    const schema = schemaRef.current
    const namesToTry = [
      schema.reasonField,
      ...REASON_FIELD_CANDIDATES.filter(n => n !== schema.reasonField),
    ].filter(Boolean)

    let lastError = null
    for (let i = 0; i < namesToTry.length; i++) {
      const reasonField = namesToTry[i]
      try {
        await airtablePatch(recordId, buildAirtableFields(status, reasons, schema, reasonField))
        if (reasonField !== schema.reasonField) {
          schemaRef.current = { ...schema, reasonField }
          setAirtableSchema(prev => ({ ...prev, reasonField }))
        }
        return
      } catch (e) {
        lastError = e
        const unknownReason = /unknown field name/i.test(e.message) && /not.?interested.?reason/i.test(e.message)
        if (!unknownReason) throw e
      }
    }

    // Last resort: save status only so status changes aren't blocked
    try {
      await airtablePatch(recordId, { [schema.statusField]: toAirtableStatus(status, schema.knownStatuses) })
      if (isNotInterested(status) && reasons.length) setPendingReasons(recordId, reasons)
      setSaveError(`Status saved, but could not find the reason field in Airtable (tried: ${namesToTry.join(', ')}). Check the exact field name.`)
    } catch (e) {
      throw lastError || e
    }
  }, [])

  const updateJobStatus = useCallback(async (recordId, newStatus, reasons = []) => {
    const nextReasons = isNotInterested(newStatus) ? normalizeReasons(reasons) : []
    if (isNotInterested(newStatus) && nextReasons.length === 0) return

    if (!isNotInterested(newStatus)) clearPendingReasons(recordId)
    applyLocalJobUpdate(recordId, newStatus, nextReasons)
    setSaveError(null)
    try {
      await patchJobToAirtable(recordId, newStatus, nextReasons)
      clearPendingReasons(recordId)
    } catch (e) {
      console.error('Failed to update status', e)
      setSaveError(`Could not save status: ${e.message}`)
      fetchJobs()
    }
  }, [applyLocalJobUpdate, patchJobToAirtable, fetchJobs])

  const updateJobReasons = useCallback((recordId, status, reasons) => {
    if (!isNotInterested(status)) return
    const nextReasons = normalizeReasons(reasons)
    if (nextReasons.length === 0) return
    applyLocalJobUpdate(recordId, status, nextReasons)
    setSaveError(null)
    clearPendingReasons(recordId)

    clearTimeout(reasonDebounceRef.current[recordId])
    reasonDebounceRef.current[recordId] = setTimeout(async () => {
      try {
        await patchJobToAirtable(recordId, status, nextReasons)
      } catch (e) {
        console.error('Failed to update reasons', e)
        setSaveError(`Could not save reasons: ${e.message}`)
        fetchJobs()
      }
    }, 400)
  }, [applyLocalJobUpdate, patchJobToAirtable, fetchJobs])

  const updateStatusBulk = useCallback(async (recordIds, newStatus) => {
    if (!recordIds.length) return
    if (isNotInterested(newStatus)) {
      setSaveError('Use the job card to set "not interested" — a reason is required for each job.')
      return
    }
    setBulkUpdating(true)
    setSaveError(null)
    const nextReasons = isNotInterested(newStatus) ? [] : []
    setJobs(prev => prev.map(j => {
      if (!recordIds.includes(j.id)) return j
      const { statusField, reasonField } = schemaRef.current
      const fields = { ...j.fields, [statusField]: newStatus }
      if (reasonField) fields[reasonField] = nextReasons
      return { ...j, fields }
    }))
    try {
      for (let i = 0; i < recordIds.length; i += 10) {
        const chunk = recordIds.slice(i, i + 10)
        await airtablePatchBatch(chunk.map(id => ({
          id,
          fields: buildAirtableFields(newStatus, nextReasons, schemaRef.current),
        })))
      }
      setSelectedIds([])
      setBulkStatus('')
    } catch (e) {
      console.error('Failed to bulk update status', e)
      setSaveError(`Bulk update failed: ${e.message}`)
      fetchJobs()
    } finally {
      setBulkUpdating(false)
    }
  }, [fetchJobs])

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }, [])

  const triggerRun = useCallback(async () => {
    if (!MAKE_WEBHOOK_URL) return
    setRunning(true)
    try {
      await fetch(MAKE_WEBHOOK_URL, { method: 'POST' })
      setTimeout(() => { setRunning(false); fetchJobs() }, 5000)
    } catch (e) {
      setRunning(false)
    }
  }, [fetchJobs])

  // Filter + derived data
  const industries = [...new Set(jobs.map(j => j.fields.industry).filter(Boolean))].sort()
  const sources = [...new Set(jobs.map(j => j.fields.source).filter(Boolean))].sort()
  const reasonOptions = [...new Set([
    ...NOT_INTERESTED_REASONS,
    ...jobs.flatMap(j => getNotInterestedReasons(j.fields, j.id, airtableSchema.reasonField)),
  ])].sort()

  const filtered = jobs.filter(j => {
    const f = j.fields
    if (filters.status !== 'all' && !statusesEqual(getStatus(f), filters.status)) return false
    if (filters.remote === 'yes' && !f.remote) return false
    if (filters.remote === 'no' && f.remote) return false
    if (filters.industry !== 'all' && f.industry !== filters.industry) return false
    if (filters.source !== 'all' && f.source !== filters.source) return false
    if (filters.reason !== 'all') {
      const reasons = getNotInterestedReasons(f, j.id, airtableSchema.reasonField)
      if (!reasons.some(r => normalizeReason(r) === normalizeReason(filters.reason))) return false
    }
    if ((f.fit_score || 0) < filters.minScore) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      if (
        !f.title?.toLowerCase().includes(q) &&
        !f.company?.toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  const counts = STATUS_VALUES.reduce((acc, s) => {
    acc[s] = jobs.filter(j => statusesEqual(getStatus(j.fields), s)).length
    return acc
  }, {})

  const STAT_TILES = [
    { label: 'Total', value: jobs.length, color: '#374151', status: 'all' },
    ...STATUS_OPTIONS.map(({ value, label }) => ({
      label,
      value: counts[value] || 0,
      color: STATUS_COLORS[value],
      status: value,
    })),
  ]

  const filteredIds = filtered.map(j => j.id)
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.includes(id))
  const someFilteredSelected = filteredIds.some(id => selectedIds.includes(id))

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds(prev => prev.filter(id => !filteredIds.includes(id)))
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...filteredIds])])
    }
  }

  const toggleStatusFilter = (status) => {
    setFilters(f => ({ ...f, status: f.status === status ? 'all' : status }))
  }

  return (
    <>
      <Head>
        <title>Job Search — Sian</title>
        <meta name="robots" content="noindex" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F9FAFB; color: #111827; }
          button:focus-visible { outline: 2px solid #6366F1; outline-offset: 2px; }
          a:focus-visible { outline: 2px solid #6366F1; }
          @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
        `}</style>
      </Head>

      {/* Header */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid #E5E7EB',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '16px', height: '56px' }}>
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#111827', letterSpacing: '-0.02em' }}>
            Job Search
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
            {lastRun && `Last run ${lastRun}`}
          </div>
          <button
            onClick={triggerRun}
            disabled={running || !MAKE_WEBHOOK_URL}
            style={{
              background: running ? '#E5E7EB' : '#6366F1',
              color: running ? '#9CA3AF' : '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '7px 14px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: running ? 'default' : 'pointer',
            }}
          >
            {running ? 'Running…' : 'Run Now'}
          </button>
          <button
            onClick={fetchJobs}
            style={{
              background: '#F3F4F6',
              color: '#374151',
              border: 'none',
              borderRadius: '8px',
              padding: '7px 14px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px' }}>

        {saveError && (
          <div style={{
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
            color: '#991B1B',
            fontSize: '13px',
          }}>
            {saveError}
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {STAT_TILES.map(({ label, value, color, status }) => {
            const active = filters.status === status
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggleStatusFilter(status)}
                style={{
                  background: active ? '#EEF2FF' : '#fff',
                  border: active ? '2px solid #6366F1' : '1px solid #E5E7EB',
                  borderRadius: '10px',
                  padding: '10px 16px',
                  minWidth: '80px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
              >
                <div style={{ fontSize: '22px', fontWeight: '800', color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: '11px', color: active ? '#4338CA' : '#9CA3AF', marginTop: '2px', fontWeight: active ? '600' : '400' }}>
                  {label}
                </div>
              </button>
            )
          })}
        </div>

        {/* Filters */}
        <div style={{
          background: '#fff',
          border: '1px solid #E5E7EB',
          borderRadius: '12px',
          padding: '14px 16px',
          marginBottom: '16px',
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          <input
            type="text"
            placeholder="Search title or company…"
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            style={{
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              padding: '7px 12px',
              fontSize: '13px',
              width: '200px',
              outline: 'none',
            }}
          />
          <select
            value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '7px 10px', fontSize: '13px' }}
          >
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select
            value={filters.remote}
            onChange={e => setFilters(f => ({ ...f, remote: e.target.value }))}
            style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '7px 10px', fontSize: '13px' }}
          >
            <option value="all">All locations</option>
            <option value="yes">Remote only</option>
            <option value="no">Onsite only</option>
          </select>
          <select
            value={filters.industry}
            onChange={e => setFilters(f => ({ ...f, industry: e.target.value }))}
            style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '7px 10px', fontSize: '13px' }}
          >
            <option value="all">All industries</option>
            {industries.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
          <select
            value={filters.source}
            onChange={e => setFilters(f => ({ ...f, source: e.target.value }))}
            style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '7px 10px', fontSize: '13px' }}
          >
            <option value="all">All sources</option>
            {sources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filters.reason}
            onChange={e => setFilters(f => ({ ...f, reason: e.target.value }))}
            style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '7px 10px', fontSize: '13px' }}
          >
            <option value="all">All reasons</option>
            {reasonOptions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#6B7280' }}>
            <span>Min score</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={filters.minScore}
              onChange={e => setFilters(f => ({ ...f, minScore: Number(e.target.value) }))}
              style={{ width: '80px' }}
            />
            <span style={{ minWidth: '28px', fontWeight: '600', color: '#374151' }}>{filters.minScore}</span>
          </div>
          {(filters.status !== 'all' || filters.remote !== 'all' || filters.industry !== 'all' || filters.source !== 'all' || filters.reason !== 'all' || filters.minScore > 0 || filters.search) && (
            <button
              onClick={() => setFilters({ status: 'all', remote: 'all', industry: 'all', source: 'all', reason: 'all', minScore: 0, search: '' })}
              style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: '12px', cursor: 'pointer' }}
            >
              Clear filters
            </button>
          )}
          <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#9CA3AF' }}>
            {filtered.length} of {jobs.length} jobs
          </div>
        </div>

        {/* Bulk actions */}
        {!loading && !error && filtered.length > 0 && (
          <div style={{
            background: selectedIds.length > 0 ? '#EEF2FF' : '#fff',
            border: `1px solid ${selectedIds.length > 0 ? '#C7D2FE' : '#E5E7EB'}`,
            borderRadius: '12px',
            padding: '10px 16px',
            marginBottom: '12px',
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={allFilteredSelected}
                ref={el => { if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected }}
                onChange={toggleSelectAllFiltered}
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#6366F1' }}
              />
              Select all shown
            </label>
            {selectedIds.length > 0 && (
              <>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#4338CA' }}>
                  {selectedIds.length} selected
                </span>
                <select
                  value={bulkStatus}
                  onChange={e => setBulkStatus(e.target.value)}
                  style={{ border: '1px solid #C7D2FE', borderRadius: '8px', padding: '7px 10px', fontSize: '13px', background: '#fff' }}
                >
                  <option value="">Change status to…</option>
                  {STATUS_OPTIONS.filter(o => !isNotInterested(o.value)).map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <button
                  onClick={() => updateStatusBulk(selectedIds, bulkStatus)}
                  disabled={!bulkStatus || bulkUpdating}
                  style={{
                    background: !bulkStatus || bulkUpdating ? '#E5E7EB' : '#6366F1',
                    color: !bulkStatus || bulkUpdating ? '#9CA3AF' : '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '7px 14px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: !bulkStatus || bulkUpdating ? 'default' : 'pointer',
                  }}
                >
                  {bulkUpdating ? 'Updating…' : 'Apply'}
                </button>
                <button
                  onClick={() => { setSelectedIds([]); setBulkStatus('') }}
                  style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: '12px', cursor: 'pointer' }}
                >
                  Clear selection
                </button>
              </>
            )}
          </div>
        )}

        {/* Job list */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px', color: '#9CA3AF' }}>
            Loading jobs…
          </div>
        )}
        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '16px', color: '#991B1B', fontSize: '13px' }}>
            {error}
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px', color: '#9CA3AF' }}>
            No jobs match your filters.
          </div>
        )}
        {!loading && filtered.map(job => (
          <JobCard
            key={job.id}
            job={job}
            schema={airtableSchema}
            onStatusChange={updateJobStatus}
            onReasonsChange={updateJobReasons}
            selected={selectedIds.includes(job.id)}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>
    </>
  )
}
