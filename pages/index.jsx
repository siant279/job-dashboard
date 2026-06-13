import { useState, useEffect, useCallback } from 'react'
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

const STATUS_OPTIONS = ['new', 'saved', 'applied', 'maybe', "didn't apply", 'hidden']

const STATUS_COLORS = {
  new: '#6366F1',
  saved: '#059669',
  applied: '#0EA5E9',
  maybe: '#D97706',
  "didn't apply": '#64748B',
  hidden: '#9CA3AF',
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

function StatusBadge({ status, onChange, jobId }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button
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
          textTransform: 'capitalize',
        }}
      >
        {status} ▾
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
          minWidth: '120px',
          overflow: 'hidden',
        }}>
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => { onChange(jobId, s); setOpen(false) }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 14px',
                background: s === status ? '#F3F4F6' : '#fff',
                border: 'none',
                textAlign: 'left',
                fontSize: '12px',
                cursor: 'pointer',
                color: STATUS_COLORS[s] || '#374151',
                fontWeight: s === status ? '700' : '400',
                textTransform: 'capitalize',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function JobCard({ job, onStatusChange, selected, onToggleSelect }) {
  const [expanded, setExpanded] = useState(false)
  const score = job.fields.fit_score || 0

  return (
    <div style={{
      background: selected ? '#EEF2FF' : '#fff',
      border: selected ? '1px solid #A5B4FC' : '1px solid #E5E7EB',
      borderRadius: '12px',
      padding: '16px 20px',
      marginBottom: '8px',
      borderLeft: `4px solid ${getFitColor(score).border}`,
      opacity: job.fields.status === 'hidden' ? 0.4 : 1,
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
            <a
              href={job.fields.apply_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '15px',
                fontWeight: '700',
                color: '#111827',
                textDecoration: 'none',
              }}
              onMouseEnter={e => e.target.style.color = '#6366F1'}
              onMouseLeave={e => e.target.style.color = '#111827'}
            >
              {job.fields.title}
            </a>
            {job.fields.remote && (
              <span style={{
                background: '#E0F2FE',
                color: '#0369A1',
                border: '1px solid #BAE6FD',
                borderRadius: '20px',
                padding: '2px 8px',
                fontSize: '11px',
                fontWeight: '600',
              }}>Remote</span>
            )}
          </div>

          <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '6px' }}>
            <strong style={{ color: '#374151' }}>{job.fields.company}</strong>
            {job.fields.salary && job.fields.salary !== 'Unknown' && (
              <span style={{ marginLeft: '10px', color: '#059669', fontWeight: '600' }}>
                {job.fields.salary}
              </span>
            )}
            <span style={{ marginLeft: '10px' }}>{job.fields.location}</span>
          </div>

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
        </div>

        {/* Right side: status + fit label */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
          <FitBadge score={score} label={job.fields.fit_label || ''} />
          <StatusBadge status={job.fields.status || 'new'} onChange={onStatusChange} jobId={job.id} />
          <div style={{ fontSize: '10px', color: '#D1D5DB' }}>
            {job.fields.source}
            {job.fields.posted_days != null && ` · ${job.fields.posted_days}d`}
          </div>
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
    minScore: 0,
    search: '',
  })
  const [lastRun, setLastRun] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkUpdating, setBulkUpdating] = useState(false)

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

  const updateStatus = useCallback(async (recordId, newStatus) => {
    setJobs(prev => prev.map(j => j.id === recordId
      ? { ...j, fields: { ...j.fields, status: newStatus } }
      : j
    ))
    try {
      const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${recordId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: { status: newStatus } })
      })
      if (!res.ok) throw new Error(`Airtable error: ${res.status}`)
    } catch (e) {
      console.error('Failed to update status', e)
      fetchJobs()
    }
  }, [fetchJobs])

  const updateStatusBulk = useCallback(async (recordIds, newStatus) => {
    if (!recordIds.length) return
    setBulkUpdating(true)
    setJobs(prev => prev.map(j => recordIds.includes(j.id)
      ? { ...j, fields: { ...j.fields, status: newStatus } }
      : j
    ))
    try {
      for (let i = 0; i < recordIds.length; i += 10) {
        const chunk = recordIds.slice(i, i + 10)
        const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            records: chunk.map(id => ({ id, fields: { status: newStatus } }))
          })
        })
        if (!res.ok) throw new Error(`Airtable error: ${res.status}`)
      }
      setSelectedIds([])
      setBulkStatus('')
    } catch (e) {
      console.error('Failed to bulk update status', e)
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

  const filtered = jobs.filter(j => {
    const f = j.fields
    if (filters.status !== 'all' && f.status !== filters.status) return false
    if (filters.remote === 'yes' && !f.remote) return false
    if (filters.remote === 'no' && f.remote) return false
    if (filters.industry !== 'all' && f.industry !== filters.industry) return false
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

  const counts = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s] = jobs.filter(j => j.fields.status === s).length
    return acc
  }, {})

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

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {[
            { label: 'Total', value: jobs.length, color: '#374151' },
            { label: 'New', value: counts.new || 0, color: STATUS_COLORS.new },
            { label: 'Saved', value: counts.saved || 0, color: STATUS_COLORS.saved },
            { label: 'Applied', value: counts.applied || 0, color: STATUS_COLORS.applied },
            { label: 'Maybe', value: counts.maybe || 0, color: STATUS_COLORS.maybe },
            { label: "Didn't apply", value: counts["didn't apply"] || 0, color: STATUS_COLORS["didn't apply"] },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: '10px',
              padding: '10px 16px',
              minWidth: '80px',
            }}>
              <div style={{ fontSize: '22px', fontWeight: '800', color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px' }}>{label}</div>
            </div>
          ))}
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
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
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
          {(filters.status !== 'all' || filters.remote !== 'all' || filters.industry !== 'all' || filters.minScore > 0 || filters.search) && (
            <button
              onClick={() => setFilters({ status: 'all', remote: 'all', industry: 'all', minScore: 0, search: '' })}
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
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
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
            onStatusChange={updateStatus}
            selected={selectedIds.includes(job.id)}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>
    </>
  )
}
