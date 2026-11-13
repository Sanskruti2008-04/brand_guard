import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, ClipboardCheck, Clock3, FileClock, MessageSquare, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import '../styles/history-settings.css';

const label = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const date = value => value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const statusFilters = [
  ['all', 'All reviews'],
  ['in_review', 'In review'],
  ['approved', 'Approved'],
  ['changes_requested', 'Changes requested'],
  ['superseded', 'Superseded']
];

export default function ReviewHistoryPage({ role = 'employee' }) {
  const [reviews, setReviews] = useState([]);
  const [summary, setSummary] = useState({ total: 0, in_review: 0, approved: 0, changes_requested: 0, superseded: 0 });
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const prefix = role === 'admin' ? '/admin' : '/workspace';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/reviews/history?q=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}&page=${page}&limit=10`);
      setReviews(data.reviews || []);
      setSummary(data.summary || { total: 0, in_review: 0, approved: 0, changes_requested: 0, superseded: 0 });
      setPages(data.pagination?.pages || 1);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [query, status, page]);

  useEffect(() => {
    const timer = setTimeout(load, 220);
    return () => clearTimeout(timer);
  }, [load]);

  const tiles = statusFilters.map(([key, title]) => ({
    key,
    title,
    count: key === 'all' ? summary.total : summary[key] || 0,
    icon: key === 'approved' ? CheckCircle2 : key === 'in_review' ? Clock3 : key === 'changes_requested' ? MessageSquare : key === 'superseded' ? RefreshCw : ClipboardCheck
  }));

  return (
    <div className="history-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">{role === 'admin' ? 'GOVERNANCE / ORGANISATION RECORD' : 'CREATOR WORKSPACE / REVIEW RECORD'}</span>
          <h1>Review history</h1>
          <p>Every submission, decision and reviewer comment is retained against the document version it belongs to. This is an auditable record, not a live queue.</p>
        </div>
        <span className="admin-access-pill"><ShieldCheck size={15}/> VERSION-BOUND RECORDS</span>
      </div>

      <div className="history-metrics">
        {tiles.map(({ key, title, count, icon: Icon }) => (
          <button key={key} type="button" className={`history-metric ${status === key ? 'active' : ''}`} onClick={() => { setStatus(key); setPage(1); }}>
            <span className="history-metric-icon"><Icon size={16}/></span>
            <strong>{count}</strong>
            <small>{title}</small>
          </button>
        ))}
      </div>

      <div className="library-toolbar">
        <label className="search-field">
          <Search size={16}/>
          <input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder={role === 'admin' ? 'Search document or creator…' : 'Search your submitted documents…'}/>
        </label>
        <label className="filter-field">
          Status
          <select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
            {statusFilters.map(([key, title]) => <option key={key} value={key}>{title}</option>)}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="panel history-empty"><FileClock size={24}/><b>Loading review history…</b><span>Retrieving recorded submissions and decisions.</span></div>
      ) : reviews.length === 0 ? (
        <div className="panel history-empty">
          <FileClock size={26}/>
          <b>No review records found</b>
          <span>{query || status !== 'all' ? 'No submissions match this search or filter.' : 'Submit an analysed document for review and its full history will appear here.'}</span>
          {role === 'employee' && status === 'all' && !query && <Link className="text-link" to="/workspace/review">Open document review <ArrowUpRight size={14}/></Link>}
        </div>
      ) : reviews.map(review => {
        const document = review.documentId;
        const latestDecision = (review.decisions || [])[review.decisions.length - 1];
        const latestComment = (review.comments || [])[review.comments.length - 1];
        const score = review.analysisId?.overallScore;
        return (
          <article className="history-card panel" key={review._id}>
            <div className="history-card-head">
              <div>
                <span className="eyebrow">SUBMITTED {date(review.submittedAt)}</span>
                <h2>{document ? <Link to={`${prefix}/review/${document._id}`}>{document.title}</Link> : 'Document removed'}</h2>
                <p>
                  Version {review.versionNo}
                  {document?.format ? ` · ${document.format.toUpperCase()}` : ''}
                  {role === 'admin' ? ` · ${review.creatorId?.name || 'Unknown creator'}` : ''}
                </p>
              </div>
              <span className={`review-status ${review.status}`}>{label(review.status)}</span>
            </div>

            <div className="history-meta">
              <div><span>Reviewer</span><b>{review.reviewerId?.name || 'Awaiting decision'}</b><small>{latestDecision ? date(latestDecision.createdAt) : 'No decision recorded'}</small></div>
              <div><span>Decision</span><b>{latestDecision ? label(latestDecision.decision) : 'Pending'}</b><small>{latestDecision?.versionNo ? `Version ${latestDecision.versionNo}` : '—'}</small></div>
              <div><span>Brand score</span><b>{score === null || score === undefined ? 'Not scored' : `${score}/100`}</b><small>{review.analysisId?.complianceStatus || 'No report attached'}</small></div>
              <div><span>Discussion</span><b>{(review.comments || []).length} comment{(review.comments || []).length === 1 ? '' : 's'}</b><small>{document?.status ? `Document: ${label(document.status)}` : 'Document unavailable'}</small></div>
            </div>

            {latestDecision?.reason && <blockquote className="history-reason"><b>Decision reason</b>{latestDecision.reason}</blockquote>}

            {latestComment && (
              <div className="history-comment">
                <MessageSquare size={14}/>
                <div><b>{latestComment.authorId?.name || 'Reviewer'}</b><p>{latestComment.text}</p></div>
              </div>
            )}

            <div className="history-actions">
              <span><FileClock size={13}/> {review.updatedAt ? `Last updated ${date(review.updatedAt)}` : 'Recorded submission'}</span>
              {document && <Link className="text-link" to={`${prefix}/review/${document._id}`}>Open review workspace <ArrowUpRight size={14}/></Link>}
            </div>
          </article>
        );
      })}

      {!loading && reviews.length > 0 && (
        <div className="pagination-bar">
          <span>Page {page} of {Math.max(1, pages)}</span>
          <div>
            <button disabled={page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}>Previous</button>
            <button disabled={page >= pages} onClick={() => setPage(current => Math.min(pages, current + 1))}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
