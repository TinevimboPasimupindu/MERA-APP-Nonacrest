import { useState } from 'react';

const COPY = {
  approve: {
    title: 'Approve this patient profile',
    body: 'The patient will be marked verified and can trigger SOS with a visible medical profile.',
    confirmLabel: 'Approve profile',
    confirmClass: 'btn-primary',
    noteRequired: false,
  },
  flag: {
    title: 'Flag for an in-person visit',
    body: "Explain what needs to be confirmed in person. The patient will see this note.",
    confirmLabel: 'Flag profile',
    confirmClass: 'btn-danger',
    noteRequired: true,
  },
  request_info: {
    title: 'Request more information',
    body: 'Tell the patient what to add or correct before you can review again.',
    confirmLabel: 'Send request',
    confirmClass: 'btn-secondary',
    noteRequired: true,
  },
};

export default function VerificationActionModal({ action, onCancel, onConfirm, submitting }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const copy = COPY[action];
  if (!copy) return null;

  const handleConfirm = () => {
    if (copy.noteRequired && !note.trim()) {
      setError('A note is required so the patient knows what to do next.');
      return;
    }
    onConfirm(note.trim());
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-panel card" onClick={(e) => e.stopPropagation()}>
        <h2>{copy.title}</h2>
        <p className="modal-body">{copy.body}</p>

        {(copy.noteRequired || action === 'approve') && (
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="ver-note">
              Note to patient {copy.noteRequired ? '' : '(optional)'}
            </label>
            <textarea
              id="ver-note"
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                if (error) setError('');
              }}
              placeholder={
                action === 'flag'
                  ? 'e.g. Please visit the ER admin desk to verify your ID in person.'
                  : action === 'request_info'
                  ? 'e.g. Please add your current medications before we can approve.'
                  : 'Anything you want the patient to know.'
              }
              rows={4}
            />
            {error && <span className="field-error">{error}</span>}
          </div>
        )}

        <div className="row gap-sm" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${copy.confirmClass}`}
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? <span className="spinner" /> : copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
