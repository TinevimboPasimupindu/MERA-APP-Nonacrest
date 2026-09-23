import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiCall, ENDPOINTS } from '../../services/api';
import logo from '../../assets/mera-logo.png';
import { requestPosition } from '../../utils/geolocation';

// Public, unauthenticated route "/nfc/:token" — the page a bystander's
// phone opens when they tap a physical MERA emergency tag. Reuses the
// existing SOS/incident pipeline entirely on the backend (see
// PROJECT_CONTEXT.md's NFC tags section) — this page is just a new front
// door to the same trigger_sos()/confirm_sos() flow the mobile app's own
// SOS button uses, via GET/POST /nfc/<token>/[trigger/].
//
// Hold-to-confirm mirrors the mobile app's SOS button interaction
// (patient-dashboard.tsx: press-and-hold, not a single tap) — deliberately
// not a plain button, so a tag brushed against a pocket or bag doesn't
// fire a real alert. Same 1.5s hold duration as mobile.
const HOLD_DURATION_MS = 1500;

// Location is REQUIRED before the emergency button is ever shown: MERA can't
// send help to the right place without it, and the backend now rejects a
// trigger with no coordinates (emergencies/serializers.py
// _RequiredLocationFields). It's requested once the tag is known to be
// paired (not for an invalid/unpaired/already-alerted tag, where prompting
// would be pointless), and — if it's denied, unavailable or times out — the
// page shows a blocking "we need your location" state with a retry button
// instead of the button. These are the bystander's device coordinates,
// used as a proxy for where the patient is (the tag is on/next to them).
const LOCATION_HELP = {
  denied: {
    what: 'Location access was blocked for this page.',
    how: [
      "Tap the lock / site-settings icon in your browser's address bar and set Location to \"Allow\" for this site.",
      'On iPhone: Settings > Privacy & Security > Location Services must be on, and your browser set to "While Using".',
      'On Android: turn on Location in quick settings and allow it for your browser.',
    ],
  },
  unavailable: {
    what: "We couldn't work out where you are — location may be switched off on this device.",
    how: [
      "Turn on Location / GPS in your phone's settings.",
      'Make sure your browser is allowed to use location.',
    ],
  },
  timeout: {
    what: 'Getting your location took too long.',
    how: [
      'Check that Location / GPS is on and you have a signal.',
      "If you're indoors, moving closer to a window can help.",
    ],
  },
};

// Self-contained dark palette — same emergency-red / success-green language
// the mobile app's own SOS/emergency-active screens use (constants/theme.ts:
// Colors.emergency '#991717', Colors.success '#2ECC70'), not the lighter
// --mera-accent blue the login/admin pages use, since this page is meant to
// read as "the SOS screen," not "a MERA form."
const COLORS = {
  bg: '#0F0F1A',
  panel: '#1B1B2A',
  border: '#33334A',
  ink: '#FFFFFF',
  inkMuted: '#A0A0B0',
  emergency: '#991717',
  emergencyBright: '#CC1111',
  success: '#2ECC70',
  warning: '#FFB21A',
};

export default function NFCTrigger() {
  const { token } = useParams();

  // 'loading' | 'invalid' | 'unpaired' | 'locating' | 'location_blocked' |
  // 'paired' (location acquired — shows the hold button) | 'active_incident' | 'success' | 'error'
  const [view, setView] = useState('loading');
  const [locationReason, setLocationReason] = useState('unavailable');
  const coordsRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [pressed, setPressed] = useState(false);

  const holdTimer = useRef(null);
  const cancelledRef = useRef(false);

  const acquireLocation = () => {
    coordsRef.current = null;
    setView('locating');
    requestPosition(navigator.geolocation).then((result) => {
      if (cancelledRef.current) return;
      if (result.ok) {
        coordsRef.current = result;
        setView('paired');
      } else {
        setLocationReason(result.reason);
        setView('location_blocked');
      }
    });
  };

  const loadStatus = () => {
    setView('loading');
    apiCall(ENDPOINTS.nfcTagStatus(token), 'GET', null, false)
      .then((data) => {
        const status = data.status || 'invalid';
        // "paired" = ready to alert, but only once we also have a location.
        if (status === 'paired') acquireLocation();
        else setView(status);
      })
      .catch(() => setView('error'));
  };

  useEffect(() => {
    cancelledRef.current = false;
    loadStatus();
    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const doTrigger = async () => {
    const coords = coordsRef.current;
    if (!coords) {
      // Shouldn't be reachable (the button only renders once we have a
      // fix) — but never send a location-less trigger.
      acquireLocation();
      return;
    }
    setTriggering(true);
    try {
      await apiCall(
        ENDPOINTS.nfcTagTrigger(token),
        'POST',
        {
          latitude: coords.latitude,
          longitude: coords.longitude,
          location_accuracy_metres: coords.accuracy,
        },
        false
      );
      if (!cancelledRef.current) setView('success');
    } catch (err) {
      if (cancelledRef.current) return;
      if (err.status === 409) {
        // Someone else already confirmed (or this same tag was tapped
        // twice) between this page loading and the hold completing —
        // same duplicate-incident-prevention the mobile SOS button relies
        // on. Not an error from the bystander's point of view: help is
        // already on the way.
        setView('active_incident');
      } else if (err.status === 400 && (err.latitude || err.longitude)) {
        // The server rejected the coordinates themselves — treat like any
        // other location failure rather than "not activated".
        setLocationReason('unavailable');
        setView('location_blocked');
      } else if (err.status === 400) {
        setView('unpaired');
      } else if (err.status === 429) {
        setErrorMessage('This tag has been used too many times in a short period. Please wait a few minutes and try again, or call your local emergency number directly.');
        setView('error');
      } else {
        setErrorMessage('Could not send the alert. Please try again, or call your local emergency number directly.');
        setView('error');
      }
    } finally {
      if (!cancelledRef.current) setTriggering(false);
    }
  };

  const startHold = () => {
    if (triggering) return;
    setPressed(true);
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      doTrigger();
    }, HOLD_DURATION_MS);
  };

  const endHold = () => {
    setPressed(false);
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <img src={logo} alt="MERA" style={{ height: 40, width: 40, objectFit: 'contain' }} />
        <span style={{ color: COLORS.ink, fontWeight: 800, letterSpacing: 1, fontSize: 18 }}>MERA</span>
      </div>

      <div style={cardStyle}>
        {view === 'loading' && (
          <p style={mutedText}>Checking tag…</p>
        )}

        {view === 'locating' && (
          <>
            <p style={titleText}>Getting your location…</p>
            <p style={mutedText}>
              MERA needs your location so help is sent to the right place. If your browser asks,
              please choose "Allow".
            </p>
          </>
        )}

        {view === 'location_blocked' && (
          <>
            <p style={titleText}>We need your location to send help</p>
            <p style={mutedText}>{LOCATION_HELP[locationReason].what}</p>
            <p style={{ ...mutedText, marginTop: 10 }}>
              MERA can only send an ambulance if it knows where to go. To continue:
            </p>
            <ul style={helpList}>
              {LOCATION_HELP[locationReason].how.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button type="button" onClick={acquireLocation} style={retryBtnStyle}>
              Try again
            </button>
            <p style={{ ...hintText, marginTop: 16 }}>
              If someone needs urgent help right now, please call your local emergency number.
            </p>
          </>
        )}

        {view === 'invalid' && (
          <>
            <p style={titleText}>Tag not recognized</p>
            <p style={mutedText}>
              This link doesn't match a known MERA emergency tag. If you scanned a physical
              sticker, please try again — if it keeps failing, call your local emergency number
              directly.
            </p>
          </>
        )}

        {view === 'unpaired' && (
          <>
            <p style={titleText}>This tag hasn't been activated yet</p>
            <p style={mutedText}>
              This MERA emergency tag exists but hasn't been assigned to a patient yet, so it
              can't send an alert. If you believe someone nearby needs help, please call your
              local emergency number directly.
            </p>
          </>
        )}

        {view === 'active_incident' && (
          <>
            <div style={{ ...statusPill, background: 'rgba(46,204,112,0.15)', color: COLORS.success }}>
              ● Help already alerted
            </div>
            <p style={titleText}>Help has already been alerted for this tag</p>
            <p style={mutedText}>
              An emergency alert is already active for this tag — responders have been notified.
              There's nothing more to do here.
            </p>
          </>
        )}

        {view === 'paired' && (
          <>
            <p style={contextText}>
              This may be a medical emergency — hold the button below if the person needs help.
            </p>

            <div style={holdWrapStyle}>
              <button
                type="button"
                disabled={triggering}
                onMouseDown={startHold}
                onMouseUp={endHold}
                onMouseLeave={endHold}
                onTouchStart={startHold}
                onTouchEnd={endHold}
                onTouchCancel={endHold}
                style={{
                  ...holdBtnStyle,
                  transform: pressed ? 'scale(0.93)' : 'scale(1)',
                  opacity: triggering ? 0.75 : 1,
                }}
              >
                <span style={holdBtnLabel}>{triggering ? 'SENDING…' : 'EMERGENCY'}</span>
                <span style={holdBtnSubLabel}>{triggering ? 'Please wait' : 'Hold to alert'}</span>
              </button>
            </div>

            <p style={hintText}>Press and hold for {Math.round(HOLD_DURATION_MS / 1000)} seconds to confirm</p>
          </>
        )}

        {view === 'success' && (
          <>
            <div style={{ ...statusPill, background: 'rgba(46,204,112,0.15)', color: COLORS.success }}>
              ● Alert sent
            </div>
            <p style={titleText}>Help has been alerted</p>
            <p style={mutedText}>
              Emergency responders have been notified. If you're with the person, stay with them
              if it's safe to do so until help arrives.
            </p>
          </>
        )}

        {view === 'error' && (
          <>
            <p style={titleText}>Something went wrong</p>
            <p style={mutedText}>{errorMessage || 'Please try again.'}</p>
            <button type="button" onClick={loadStatus} style={retryBtnStyle}>Try again</button>
          </>
        )}
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: '100vh',
  background: COLORS.bg,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '32px 20px',
  boxSizing: 'border-box',
};
const headerStyle = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 };
const cardStyle = {
  width: '100%',
  maxWidth: 420,
  background: COLORS.panel,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 16,
  padding: '32px 24px',
  textAlign: 'center',
  boxSizing: 'border-box',
};
const titleText = { color: COLORS.ink, fontSize: 19, fontWeight: 700, margin: '0 0 10px' };
const contextText = { color: COLORS.ink, fontSize: 15, lineHeight: 1.5, margin: '0 0 28px' };
const mutedText = { color: COLORS.inkMuted, fontSize: 13.5, lineHeight: 1.6, margin: 0 };
const hintText = { color: COLORS.inkMuted, fontSize: 12, marginTop: 18, marginBottom: 0 };
const statusPill = {
  display: 'inline-block',
  padding: '5px 14px',
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
  marginBottom: 16,
};
const helpList = { color: COLORS.inkMuted, fontSize: 12.5, lineHeight: 1.6, textAlign: 'left', margin: '8px 0 0', paddingLeft: 18 };
const holdWrapStyle = { display: 'flex', justifyContent: 'center', padding: '8px 0' };
const holdBtnStyle = {
  width: 150,
  height: 150,
  borderRadius: 75,
  background: COLORS.emergencyBright,
  border: 'none',
  color: '#fff',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  userSelect: 'none',
  touchAction: 'none',
  transition: 'transform 120ms ease',
  boxShadow: '0 0 0 8px rgba(153,23,23,0.18)',
};
const holdBtnLabel = { fontSize: 17, fontWeight: 800, letterSpacing: 0.5 };
const holdBtnSubLabel = { fontSize: 11, marginTop: 4, opacity: 0.85 };
const retryBtnStyle = {
  marginTop: 18,
  padding: '10px 20px',
  borderRadius: 8,
  border: 'none',
  background: COLORS.emergency,
  color: '#fff',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
};
