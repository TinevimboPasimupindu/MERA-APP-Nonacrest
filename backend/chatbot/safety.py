# Fixed reply texts and crisis detection for the MERA Assistant.
#
# Every reply that isn't a normal answer comes from a constant here, never
# from the model's own wording, so a refusal can't echo unsafe content back
# and the emergency numbers are always present and correct.
#
# Numbers verified 2026-10-06: 10177 (national ambulance/fire), 112 (any
# mobile phone, free, works without airtime) and the SADAG Suicide Crisis
# Helpline 0800 567 567 (24 hours, toll-free, listed on sadag.org).

import re

EMERGENCY = "emergency"
SELF_HARM = "self_harm"

REFUSAL_REPLY = (
    "I can't help with that. I can help with health questions and guide you "
    "through using MERA in an emergency."
)

OUT_OF_SCOPE_REPLY = (
    "That's outside what I can help with. I'm here for health questions, like "
    "symptoms, medication, first aid and staying well, and for help using MERA, "
    "including the SOS button in an emergency. What health question can I help with?"
)

EMERGENCY_GUIDANCE = (
    "If this is happening now, use the SOS button on your MERA home screen to call "
    "for an ambulance, or call 10177 (ambulance) or 112 from any mobile phone."
)

SELF_HARM_GUIDANCE = (
    "You don't have to go through this alone. If you might act on these thoughts or "
    "you're in danger now, use the SOS button on your MERA home screen, or call 10177 "
    "(ambulance) or 112 from any mobile phone. You can also call the SADAG Suicide "
    "Crisis Helpline on 0800 567 567, free and open 24 hours."
)

CRISIS_GUIDANCE = {EMERGENCY: EMERGENCY_GUIDANCE, SELF_HARM: SELF_HARM_GUIDANCE}

# Used on its own when there's no model answer to attach the guidance to
# (provider failure, safety refusal, or a message also flagged unsafe).
CRISIS_REPLY = {
    EMERGENCY: "This sounds like it could be an emergency. " + EMERGENCY_GUIDANCE,
    SELF_HARM: "I'm really sorry you're feeling this way. " + SELF_HARM_GUIDANCE,
}

# Deliberately broad: a false positive only adds the emergency numbers to an
# otherwise normal answer, while a miss could hide them from someone in
# danger. The model's own category is a second signal for paraphrases.
_SELF_HARM_PATTERNS = [
    r"\bsuicid",
    r"\bkill(ing)? my ?self\b",
    r"\bend(ing)? (my|it all|my own) li(fe|ves)\b",
    r"\bend it all\b",
    r"\btake my (own )?life\b",
    r"\bwant(ed)? to die\b",
    r"\bdon'?t want to (live|be alive)\b",
    r"\bno reason to live\b",
    r"\bbetter off dead\b",
    r"\bself[- ]?harm",
    r"\b(hurt|harm|cut)(t?ing)? my ?self\b",
    r"\boverdos",
]

_EMERGENCY_PATTERNS = [
    r"\b(can'?t|cannot|can not|unable to|struggling to) breathe?\b",
    r"\bnot breathing\b",
    r"\bstopped breathing\b",
    r"\bunconscious\b",
    r"\bunresponsive\b",
    r"\bpassed out\b",
    r"\bcollapsed\b",
    r"\b(having|had|has|is having) a (heart attack|stroke|seizure)\b",
    r"\bseizing\b",
    r"\bchoking\b",
    r"\bchest (pain|hurts|is hurting|tightness)\b",
    r"\b(severe|heavy|heavily|lots of|won'?t stop) bleed",
    r"\bbleeding (heavily|a lot|badly|won'?t stop)\b",
    r"\b(been|was|got|being) (stabbed|shot|attacked|assaulted|raped)\b",
    r"\b(i'?m|i am) dying\b",
    r"\bcall (an|the) ambulance\b",
]

_SELF_HARM_RE = re.compile("|".join(_SELF_HARM_PATTERNS), re.IGNORECASE)
_EMERGENCY_RE = re.compile("|".join(_EMERGENCY_PATTERNS), re.IGNORECASE)


def detect_crisis(text):
    # Returns SELF_HARM, EMERGENCY or None. Self-harm wins when both match,
    # since its guidance also includes the crisis helpline.
    normalised = text.replace("’", "'")
    if _SELF_HARM_RE.search(normalised):
        return SELF_HARM
    if _EMERGENCY_RE.search(normalised):
        return EMERGENCY
    return None


def with_crisis_guidance(reply, crisis):
    # Appends the guidance unless the model's answer already contains every
    # number it carries, so the user never gets the same block twice.
    guidance = CRISIS_GUIDANCE[crisis]
    required = ["SOS", "10177", "112"] + (["0800 567 567"] if crisis == SELF_HARM else [])
    if all(token in reply for token in required):
        return reply
    return f"{reply.rstrip()}\n\n{guidance}"
