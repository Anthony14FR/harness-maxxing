"""Enterprise policy: organizational requests (who decides what), grants, spending / key / domain envelopes,
who may write to whom, trust along the chain. See docs/dev/API.md#enterprises and INTERNALS.md.

Requests live in `<state>/enterprises/<slug>/requests.json` (`{"items": [...]}`, written under the enterprises lock).
Nothing here grants anything: an allowed request only says yes, a key, a domain or a folder still needs the owner's
agent card. Every lookup (`decider`, `can_send`, `over_ceiling`, `cap`) never raises and does nothing while the
Enterprises feature is off."""
from __future__ import annotations

import contextlib
import datetime as dt
import json
import logging
import os
import re
import secrets
import threading
import time
import unicodedata
from typing import Any, Callable

from . import agents, config, enterprises
from .enterprises import EnterpriseError

log = logging.getLogger("maxxing.enterprise_policy")

PROFILES = ("careful", "balanced", "autonomous")
UNBUDGETED_RUN_USD = 0.5                           # the most one run of an agent without a budget may spend (and hold) under a ceiling
GRANT_MAX_S = 30 * 86400 + 3600                     # a grant lasts 30 days at most (an hour of slack)
RENEW_MAX = 3                                       # renewals of a request stopped at the top before the owner gets its card
KEEP = 500                                          # requests kept per enterprise (the oldest answered go first)


def _row(label: str, careful: str, balanced: str, autonomous: str, enforced: str = "server") -> dict:
    return {"label": label, "careful": careful, "balanced": balanced, "autonomous": autonomous, "enforced": enforced}


# The rows of the matrix (spec 7.1): who decides per autonomy profile; "free" = allowed and logged, "lead" = the
# requester's lead (or a grantee), "owner" = the owner. A row that is "owner" in autonomous is never delegable.
CATEGORIES: dict[str, dict] = {
    "assign_own": _row("Assign to a direct report, read the profile, write in one's department", "free", "free", "free"),
    "deliver_cross": _row("Deliver into another department's folder", "owner", "lead", "lead"),
    "edit_job": _row("Edit a report's job description", "owner", "lead", "lead"),
    "worker": _row("Create a worker from an approved template", "owner", "lead", "lead"),
    "profile_edit": _row("Edit the company profile (not prices or terms)", "owner", "lead", "lead"),
    "spending": _row("Declared spending up to the department's threshold", "owner", "lead", "lead", "declared"),
    "raise_budget": _row("Raise a report's daily budget inside the envelope", "owner", "owner", "lead"),
    "reseat": _row("Re-seat an agent on a vacant position of one's team", "owner", "owner", "lead"),
    "profile_terms": _row("Edit prices or terms in the profile", "owner", "owner", "owner"),
    "desk_live": _row("Put the front desk live", "owner", "owner", "owner"),
    "hire_remove": _row("Hire or remove a permanent agent, change keys, domains, sandbox, folders", "owner", "owner", "owner"),
    "hire": _row("Create a position and hire its agent", "owner", "owner", "owner"),
    "spending_high": _row("Declared spending above the threshold", "owner", "owner", "owner", "declared"),
    "recurring": _row("Any new recurring cost", "owner", "owner", "owner", "declared"),
    "publish": _row("Publish publicly, write to a customer, anything irreversible", "owner", "owner", "owner", "role"),
}
NEEDS_GRANT = ("deliver_cross", "hire_remove", "worker", "reseat")          # categories that usually need a grant
GRANT_NOTE = ("Allowing a request grants nothing: a key, a domain or a folder it needs still comes from the "
              "owner's card of the agent.")
_NEEDS_RE = re.compile(r"\b(keys?|domains?|folders?|sandbox|secret|token|password)\b", re.I)
TOP_NEVER = ("hire", "hire_remove", "profile_terms", "desk_live")        # stay with the owner even when the top decides

LEGACY_LABELS = {"assign_cross": ("Assign across departments", "Confier une tâche à un autre département")}   # nothing creates it any more: old stored requests keep a name

LABELS_FR = {
    "assign_own": "Confier à un subordonné direct, lire le profil, écrire dans son département",
    "deliver_cross": "Livrer dans le dossier d'un autre département",
    "edit_job": "Modifier la fiche de poste d'un subordonné",
    "worker": "Créer un intervenant à partir d'un modèle approuvé",
    "profile_edit": "Modifier le profil de l'entreprise (hors prix et conditions)",
    "spending": "Dépense déclarée jusqu'au seuil du département",
    "raise_budget": "Augmenter le budget quotidien d'un subordonné dans l'enveloppe",
    "reseat": "Réaffecter un agent à un poste vacant de son équipe",
    "profile_terms": "Modifier les prix ou conditions du profil",
    "desk_live": "Mettre l'accueil en ligne",
    "hire_remove": "Embaucher ou retirer un agent permanent, changer clés, domaines, bac à sable, dossiers",
    "hire": "Créer un poste et embaucher son agent",
    "spending_high": "Dépense déclarée au-dessus du seuil",
    "recurring": "Tout nouveau coût récurrent",
    "publish": "Publier publiquement, écrire à un client, tout ce qui est irréversible",
}
# Server-written texts by language (config `language`); English is the fallback.
TEXTS = {
    "asks": {"en": "{name} asks: {label}", "fr": "{name} demande : {label}"},
    "amount_line": {"en": "\nAmount: {x:g} USD", "fr": "\nMontant : {x:g} USD"},
    "allow": {"en": "Allow", "fr": "Autoriser"},
    "deny": {"en": "Deny", "fr": "Refuser"},
    "open": {"en": "Open", "fr": "Ouvrir"},
    "outside_tag": {"en": " [from outside text]", "fr": " [issu d'un texte extérieur]"},
    "req_to_lead": {"en": "Request {id} from {who} ({cat}){out}: {text}",
                    "fr": "Demande {id} de {who} ({cat}){out} : {text}"},
    "req_amount": {"en": " Amount: {x:g} USD.", "fr": " Montant : {x:g} USD."},
    "req_decide": {"en": " Decide with: maxxing enterprise decide {id} allow|deny \"<reason>\"",
                   "fr": " Décidez avec : maxxing enterprise decide {id} allow|deny \"<motif>\""},
    "decision": {"en": "Your request {id} ({cat}) was {word} by {who}.",
                 "fr": "Votre demande {id} ({cat}) a été {word} par {who}."},
    "allowed": {"en": "allowed", "fr": "acceptée"},
    "denied": {"en": "denied", "fr": "refusée"},
    "the_owner": {"en": "the owner", "fr": "le propriétaire"},
    "grant_note": {"en": GRANT_NOTE,
                   "fr": "Accepter une demande n'accorde rien : une clé, un domaine ou un dossier qu'elle suppose "
                         "vient toujours de la fiche de l'agent, côté propriétaire."},
    "owner_applies": {"en": "Allowed: the owner applies it.", "fr": "Acceptée : le propriétaire l'applique."},
    "applies_title": {"en": "{label}: allowed, you apply it", "fr": "{label} : acceptée, à vous de l'appliquer"},
    "applies_body": {"en": "{who} allowed {pos}: {text} Nothing changed yet: you apply it.",
                     "fr": "{who} a accepté pour {pos} : {text} Rien n'a encore changé : c'est à vous de l'appliquer."},
    "job_done": {"en": "Done: the job description of {pos} was updated.",
                 "fr": "Fait : la fiche de poste de {pos} est mise à jour."},
    "seat_done": {"en": "Done: {pos} is now held by {agent}.", "fr": "Fait : {pos} est maintenant tenu par {agent}."},
    "hire_done": {"en": "Done: the position {pos} was created and {name} is hired.",
                  "fr": "Fait : le poste {pos} est créé et {name} est embauché."},
    "hire_failed": {"en": "Not done: the position could not be created ({reason}).",
                    "fr": "Non fait : le poste n'a pas pu être créé ({reason})."},
    "hire_card": {"en": "\nPosition: {title}\nDepartment: {department}\nReports to: {reports_to}\nTopic: {topic}\nAgent: {name}"
                        "\nJob: {job}\nModel: {model}\nEffort: {effort}\nRole: {role}{out}",
                  "fr": "\nPoste : {title}\nDépartement : {department}\nRattaché à : {reports_to}\nSujet : {topic}\nAgent : {name}"
                        "\nMission : {job}\nModèle : {model}\nEffort : {effort}\nRôle : {role}{out}"},
    "hire_failed_title": {"en": "Hire not done: {title}", "fr": "Embauche non faite : {title}"},
    "hire_failed_body": {"en": "You allowed the hire of {title} but it could not be carried out: {reason}",
                         "fr": "Vous avez accepté l'embauche de {title} mais elle n'a pas pu être faite : {reason}"},
    "resolved_allow": {"en": "Allowed", "fr": "Autorisée"},
    "resolved_deny": {"en": "Denied", "fr": "Refusée"},
    "on_telegram": {"en": " on Telegram", "fr": " sur Telegram"},
    "returned": {"en": "Returned to the owner: the top position no longer decides.",
                 "fr": "Rendue au propriétaire : le poste du haut ne décide plus."},
    "env_dept": {"en": "The department {name}", "fr": "Le département {name}"},
    "env_ent": {"en": "The enterprise {name}", "fr": "L'entreprise {name}"},
    "env_title": {"en": "{label} reached its daily budget", "fr": "{label} a atteint son budget quotidien"},
    "env_body": {"en": "{usd:g} USD spent today: its agents wait until tomorrow.",
                 "fr": "{usd:g} USD dépensés aujourd'hui : ses agents attendent demain."},
    "env_refusal": {"en": "{label} reached its daily budget ({usd:g} USD): runs resume tomorrow.",
                    "fr": "{label} a atteint son budget quotidien ({usd:g} USD) : les exécutions reprennent demain."},
}


def _lang() -> str:
    try:
        return "fr" if str(config.load_config().get("language") or "en") == "fr" else "en"
    except Exception:  # noqa: BLE001 - a text never fails a request
        return "en"


def _t(key: str, **kw: Any) -> str:
    row = TEXTS[key]
    text = row.get(_lang()) or row["en"]
    return text.format(**kw) if kw else text


def _label(category: str) -> str:
    en = CATEGORIES.get(category, {}).get("label") or LEGACY_LABELS.get(category, (category, category))[0]
    fr = LABELS_FR.get(category) or LEGACY_LABELS.get(category, (en, en))[1]
    return fr if _lang() == "fr" else en


def _now(now: float | None = None) -> float:
    return time.time() if now is None else float(now)


def _owner_by(by: Any) -> bool:
    return by is None or by == ""                       # the string "owner" is a position id like any other (reserved)


# ---- requests: storage -------------------------------------------------------------------------------------
def _file(slug: str):
    return enterprises.state(slug) / "requests.json"


def _read(slug: str) -> list[dict]:
    try:
        raw = json.loads((enterprises._peek(slug) / "requests.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    items = raw.get("items") if isinstance(raw, dict) else None
    return [x for x in items if isinstance(x, dict) and x.get("id")] if isinstance(items, list) else []


def _write(slug: str, items: list[dict]) -> None:
    if len(items) > KEEP:
        done = [x for x in items if x.get("status") != "pending"]
        drop = {x["id"] for x in done[: len(items) - KEEP]}
        items = [x for x in items if x["id"] not in drop]
    config.write_json(_file(slug), {"items": items})


def _public(r: dict) -> dict:
    keys = ("id", "category", "position", "text", "amount", "status", "decider", "at", "outside", "deadline",
            "decided_by", "decided_at", "reason", "level")
    out = {k: r.get(k) for k in keys}
    if r.get("category") == "hire" and isinstance(r.get("payload"), dict):
        p = r["payload"]
        out["hire"] = {**{k: str(p.get(k) or "") for k in ("title", "department", "reports_to", "job", "topic", "name",
                                                          "model", "effort")}, "role": str(p.get("role") or "")[:600]}
    return out


def requests(slug: str, pending_only: bool = False) -> list[dict]:
    """The enterprise's organizational requests, newest first (pending_only: those waiting for a decision)."""
    enterprises.load(slug)
    items = _read(slug)
    if pending_only:
        items = [x for x in items if x.get("status") == "pending"]
    return [_public(x) for x in sorted(items, key=lambda x: -float(x.get("at") or 0))]


# ---- who decides ----------------------------------------------------------------------------------------------
def _data(slug: str) -> dict:
    return enterprises._index()["by"].get(slug) or {}


def _until(v: Any) -> float | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str) and v.strip():
        try:
            d = dt.datetime.fromisoformat(v.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
        if len(v.strip()) <= 10:
            d = d + dt.timedelta(days=1)                # a bare date lasts to the end of that day
        if d.tzinfo is None:
            d = d.replace(tzinfo=dt.timezone.utc)
        return d.timestamp()
    return None


def threshold(slug: str, pos: str) -> float | None:
    """The declared-spending limit a lead may decide: the setting `spending_threshold` when there is one, else the
    department envelope's usd per day, else the enterprise envelope's (None: no limit known, the owner decides)."""
    v = enterprises.setting(slug, "spending_threshold", pos)
    if isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0:
        return float(v)
    d = _data(slug)
    dept = (d.get("departments") or {}).get(enterprises.department_of(slug, pos)) or {}
    for env in ((dept.get("envelope") or {}), (d.get("envelope") or {})):
        if (env.get("usd_per_day") or 0) > 0:
            return float(env["usd_per_day"])
    return None


def _grant(slug: str, pos: str, category: str, amount: float | None, now: float) -> str | None:
    """The position that may decide this request through a grant (owner-made, 30 days at most, only rows a lead
    decides in autonomous, within its ceiling, over its own subtree), nearest lead first."""
    row = CATEGORIES.get(category)
    if not row or row["autonomous"] != "lead":
        return None
    chain = enterprises.ancestors(slug, pos)
    best: tuple[int, str] | None = None
    for g in _data(slug).get("grants") or []:
        who = g.get("position")
        if g.get("category") != category or who not in chain:
            continue
        end = _until(g.get("until"))
        if end is None or end <= now or end > now + GRANT_MAX_S:
            continue
        if category == "spending":
            cap = g.get("ceiling") if isinstance(g.get("ceiling"), (int, float)) else threshold(slug, pos)
            if amount is None or cap is None or amount > cap:
                continue
        elif isinstance(g.get("ceiling"), (int, float)) and amount is not None and amount > g["ceiling"]:
            continue
        rank = chain.index(who)
        if best is None or rank < best[0]:
            best = (rank, who)
    return best[1] if best else None


def zero(slug: str) -> bool:
    """Total autonomy is on: the requester's lead decides, the top has the last word (never raises)."""
    try:
        return bool(enterprises.setting(slug, "zero_intervention"))
    except Exception:  # noqa: BLE001
        return False


def _top_decides(slug: str) -> bool:
    return bool(enterprises.setting(slug, "top_decides"))


def _owner_or_top(slug: str, category: str, use_top: bool = True) -> tuple[str, str]:
    """What would go to the owner goes to the top position when the setting is on (never the invariants)."""
    if category in TOP_NEVER or not use_top or not _top_decides(slug):
        return "owner", ""
    top = _data(slug).get("top")
    if isinstance(top, str) and top != "owner" and enterprises.position(slug, top):
        return "lead", top
    return "owner", ""


def _route(slug: str, pos: str, category: str, amount: float | None, outside: bool,
           now: float | None = None, use_top: bool = True, zero_on: bool = True) -> tuple[str, str]:
    """(kind, who): free | lead | owner, and the deciding position for a lead. Structure only: it does not look at
    whether the lead is running (request() skips the ones that are not). zero_on False: as if total autonomy were off."""
    if outside or category not in CATEGORIES:
        return "owner", ""                                   # invariant 1; an unknown category is never delegated
    if category == "spending" and amount is None:
        return _owner_or_top(slug, category, use_top)        # undeclared spending
    if zero_on and zero(slug) and category not in TOP_NEVER:
        if CATEGORIES[category].get("autonomous") == "free":
            return "free", ""                                # what is free stays free: no request for routine work
        top = _data(slug).get("top")
        lead = enterprises.lead_of(slug, pos)
        who = lead or (top if isinstance(top, str) and enterprises.position(slug, top) else "")
        return ("lead", who) if who else ("owner", "")       # N+1 decides; the top decides its own request
    granted = _grant(slug, pos, category, amount, _now(now))
    if granted:
        return "lead", granted
    if category == "spending":
        limit = threshold(slug, pos)
        if limit is None or amount > limit:
            category = "spending_high"
    profile = enterprises.setting(slug, "autonomy", pos)
    row = CATEGORIES[category][profile if profile in PROFILES else "balanced"]
    if row == "lead":
        lead = enterprises.lead_of(slug, pos)
        return ("lead", lead) if lead else _owner_or_top(slug, category, use_top)     # the top of the chart reports to the owner
    return (row, "") if row != "owner" else _owner_or_top(slug, category, use_top)


def decider(slug: str, pos: str, category: str, *, amount: float | None = None, outside: bool = False) -> str:
    """Who decides a request of this category from this position: "free", "lead" or "owner"."""
    return _route(slug, pos, category, amount, outside)[0]


def _ready(slug: str, pos: str) -> bool:
    """The position's occupant exists and is switched on (a lead that cannot decide is skipped)."""
    p = enterprises.position(slug, pos)
    path = p["agent"] if p else None
    if not path or not agents.exists(path):
        return False
    try:
        return bool(agents.load(path)["enabled"])
    except Exception:  # noqa: BLE001
        return False


def _pick(slug: str, pos: str, after: str | None = None) -> str:
    """The next lead above `pos` (past `after`) that can decide, else "owner"."""
    chain = enterprises.ancestors(slug, pos)
    if after in chain:
        chain = chain[chain.index(after) + 1:]
    elif after and after != "owner":
        chain = []
    top = _data(slug).get("top")
    if zero(slug) and isinstance(top, str) and top != "owner" and enterprises.position(slug, top):
        if after == top:
            chain = [top]                                    # the climb stops at the top: it keeps the request
        elif top not in chain and after != "owner":
            chain = [*chain, top]
    for p in chain:
        if _ready(slug, p):
            return p
        enterprises.log(slug, "request_skipped", f"{p} cannot decide (vacant or switched off): skipped", position=pos)
    return "owner"


# ---- delivery and owner notification (the other modules by their contract names) -----------------------------
def _title(slug: str, pos: str) -> str:
    p = enterprises.position(slug, pos)
    return p["title"] if p else pos


def _deliver(slug: str, pos: str, kind: str, text: str, *, sender: str = "", outside: bool = False,
             session: str = "", ref: str = "") -> None:
    try:
        from . import enterprise_flow
        fn = enterprise_flow.deliver
    except (ImportError, AttributeError):
        fn = None
    try:
        if fn is not None:
            fn(slug, pos, kind, text, sender=sender, outside=outside, session=session, ref=ref)
            return
        d = enterprises.state(slug) / "inbox"
        d.mkdir(parents=True, exist_ok=True)
        line = {"id": secrets.token_hex(4), "kind": kind, "from": sender, "text": text, "task": "", "at": time.time(),
                "outside": bool(outside)}
        with enterprises._lock:
            fd = os.open(d / f"{pos}.jsonl", os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
            with os.fdopen(fd, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(line, ensure_ascii=False) + "\n")
    except Exception:  # noqa: BLE001 - a delivery that failed must not undo the decision
        log.exception("enterprise %s: delivery to %s failed", slug, pos)


def _notify(slug: str, r: dict) -> None:
    """The Allow / Deny / Open card of a request that waits for the owner."""
    ref = f"enterprise:{slug}:{r['id']}"
    name = _title(slug, r["position"])
    title = _t("asks", name=name, label=_label(r["category"]))
    body = r["text"] + (_t("amount_line", x=r["amount"]) if isinstance(r.get("amount"), (int, float)) else "")
    if r["category"] == "hire" and isinstance(r.get("payload"), dict):
        p = r["payload"]
        body += _t("hire_card", title=p.get("title") or "", department=p.get("department") or "-",
                   reports_to=p.get("reports_to") or r["position"], topic=p.get("topic") or "",
                   name=p.get("name") or p.get("title") or "", job=p.get("job") or "-", model=p.get("model") or "-",
                   effort=p.get("effort") or "-", role=str(p.get("role") or "-")[:600],
                   out=_t("outside_tag") if r.get("outside") else "")
    actions = [{"id": "allow", "label": _t("allow"), "style": "primary"},
               {"id": "deny", "label": _t("deny"), "style": "danger"}, {"id": "open", "label": _t("open"), "style": "link"}]
    url = f"/enterprises/{slug}"
    try:
        from . import enterprise_reports
        enterprise_reports.notify_owner(slug, title, body, level="warning", url=url, ref=ref, actions=actions,
                                        dedupe=ref)
        return
    except (ImportError, AttributeError):
        pass
    except Exception:  # noqa: BLE001
        log.exception("enterprise %s: owner notification failed", slug)
    try:
        from . import feed
        feed.post(title, body, "warning", "enterprises", url, dedupe=ref, ref=ref, actions=actions)
    except Exception:  # noqa: BLE001
        log.exception("enterprise %s: feed post failed", slug)


def _hand_to(slug: str, r: dict, who: str) -> None:
    """Hand a pending request to its decider: the lead's inbox, or the owner's card."""
    if who == "owner":
        _notify(slug, r)
        return
    out = _t("outside_tag") if r.get("outside") else ""
    _deliver(slug, who, "request",
             _t("req_to_lead", id=r["id"], who=_title(slug, r["position"]), cat=r["category"], out=out, text=r["text"])
             + (_t("req_amount", x=r["amount"]) if isinstance(r.get("amount"), (int, float)) else "")
             + _t("req_decide", id=r["id"]),
             sender=r["position"], outside=bool(r.get("outside")), session=r.get("session") or "", ref=f"req:{r['id']}")


# ---- request / decide ------------------------------------------------------------------------------------------
def request(slug: str, pos: str, category: str, text: str, *, amount: float | None = None, session: str = "",
            outside: bool = False, payload: dict | None = None) -> dict:
    """An occupant asks for something the matrix governs. free: allowed and logged; lead: delivered to the lead's
    inbox with a deadline; owner: an Allow / Deny card. -> the request."""
    if not enterprises.feature_on():
        raise EnterpriseError(404, "feature_off", "Enterprises are off (Settings -> Features, needs Agents)")
    enterprises.load(slug)
    if not enterprises.position(slug, pos):
        raise EnterpriseError(400, "bad_position", f"Position {pos!r} not found")
    if category not in CATEGORIES:
        raise EnterpriseError(400, "bad_category", "Category: " + ", ".join(CATEGORIES))
    text = " ".join(str(text or "").split())[:enterprises.TEXT_MAX]
    if not text:
        raise EnterpriseError(400, "invalid", "Say what is asked")
    if amount is not None:
        if isinstance(amount, bool) or not isinstance(amount, (int, float)) or amount != amount or not 0 <= amount <= 1e9:
            raise EnterpriseError(400, "invalid", "amount: a number of USD")
        amount = round(float(amount), 2)
    if category == "hire":
        payload = _check_hire(slug, pos, payload)
    now = time.time()
    kind, who = _route(slug, pos, category, amount, outside, now)
    if kind == "lead" and not _ready(slug, who):
        enterprises.log(slug, "request_skipped", f"{who} cannot decide (vacant or switched off): skipped", position=pos)
        who = _pick(slug, pos, after=who)
        kind = "owner" if who == "owner" else "lead"
    r: dict[str, Any] = {"id": secrets.token_hex(4), "category": category, "position": pos, "text": text,
                         "amount": amount, "status": "pending", "decider": who or kind, "at": now,
                         "outside": bool(outside), "session": str(session or "")[:64], "deadline": None,
                         "decided_by": "", "decided_at": None, "reason": "", "level": 0,
                         "payload": payload if isinstance(payload, dict) else None}
    if kind == "lead" and (_top_decides(slug) or zero(slug)) and _route(slug, pos, category, amount, outside, now,
                                                                       use_top=False, zero_on=False)[0] == "owner":
        r["for_owner"] = True                                # a lead or the top decides in the owner's place: taken back when that stops
    if kind == "free":
        r.update(status="allowed", decider="free", decided_by="policy", decided_at=now)
    elif kind == "lead":
        r["deadline"] = now + int(enterprises.setting(slug, "escalation_timeout_h", pos) or 4) * 3600
    with enterprises._lock:
        items = _read(slug)
        items.append(r)
        _write(slug, items)
    if kind == "free":
        enterprises.log(slug, "request_allowed", f"{category}: {text}", by="policy", position=pos, session=r["session"])
    else:
        enterprises.log(slug, "request", f"{category} -> {r['decider']}: {text}", by=pos, position=pos,
                        session=r["session"])
        _hand_to(slug, r, r["decider"])
    enterprises.invalidate(slug)
    return _public(r)


HIRE_MAX = 20000


def _check_hire(slug: str, pos: str, payload: Any) -> dict:
    """The payload of a hire request, checked at once so the requester hears what is wrong."""
    if not (isinstance(payload, dict) and str(payload.get("title") or "").strip() and str(payload.get("topic") or "").strip()):
        raise EnterpriseError(400, "invalid", "A hire request needs a title and a topic")
    if len(json.dumps(payload, default=str)) >= HIRE_MAX:
        raise EnterpriseError(400, "invalid", f"The hire request is too long: keep the role and the job under {HIRE_MAX // 2} characters")
    out = dict(payload)
    lead = str(out.get("reports_to") or "") or pos
    if not enterprises.position(slug, lead):
        raise EnterpriseError(400, "bad_position", f"reports-to: the position {lead!r} does not exist")
    out["reports_to"] = lead
    lead_dept = enterprises.department_of(slug, lead) or ""
    dept = str(out.get("department") or "") or lead_dept
    if dept and dept not in (_data(slug).get("departments") or {}):
        raise EnterpriseError(400, "invalid", f"department: {dept!r} is not a department of this enterprise")
    if lead_dept and dept != lead_dept:
        raise EnterpriseError(400, "invalid", f"department: a position under {lead!r} stays in {lead_dept!r}")
    out["department"] = dept
    return out


def _still_held(slug: str, r: dict, top: Any) -> bool:
    """A pending owner-level request may stay with its decider: the top while it decides for the owner, any lead of the
    requester (or the top) while total autonomy is on."""
    who = r.get("decider")
    if zero(slug):
        return who == top or who in enterprises.ancestors(slug, r["position"])
    return _top_decides(slug) and who == top


def release_top(slug: str) -> None:
    """Pending requests a lead or the top held in the owner's place go back to the owner once that stops holding."""
    back: list[dict] = []
    with enterprises._lock:
        items = _read(slug)
        top = _data(slug).get("top")
        for r in items:
            if r.get("status") == "pending" and r.get("for_owner") and not _still_held(slug, r, top):
                r.update(decider="owner", for_owner=False, deadline=None)
                back.append(dict(r))
        if back:
            _write(slug, items)
    for r in back:
        enterprises.log(slug, "request", f"{r['category']} -> owner: {_t('returned')}", by="server", position=r["position"],
                        session=r.get("session") or "")
        _hand_to(slug, r, "owner")
    if back:
        enterprises.invalidate(slug)


def _needs_note(r: dict) -> str:
    return _t("grant_note") if r["category"] in NEEDS_GRANT or _NEEDS_RE.search(r["text"]) else ""


def decide(slug: str, req_id: str, decision: str, *, reason: str = "", by: str | None = None, via: str = "",
           outside: bool = False) -> dict:
    """Allow or deny a pending request. by None = the owner; else the position that decides it (the request's
    current decider, never the requester, only for a request of its own subtree). via: where the owner clicked.
    outside: the deciding run was started by outside text (the decision is then delivered as outside data)."""
    if decision not in ("allow", "deny"):
        raise EnterpriseError(400, "invalid", "decision: allow or deny")
    reason = " ".join(str(reason or "").split())[:300]
    enterprises.load(slug)
    owner = _owner_by(by)
    with enterprises._lock:
        items = _read(slug)
        r = next((x for x in items if x["id"] == req_id), None)
        if r is None:
            raise EnterpriseError(404, "not_found", f"Request {req_id!r} not found")
        if r["status"] != "pending":
            raise EnterpriseError(409, "not_pending", "This request is already decided")
        top_ok = (not owner and r["decider"] == by and by == _data(slug).get("top") and _top_decides(slug)
                  and r["category"] not in TOP_NEVER and not r.get("outside"))
        if not owner and not top_ok:
            if r.get("for_owner") and not (zero(slug) and by == r["decider"] and not r.get("outside")):
                raise EnterpriseError(403, "not_decider", "This request waits for the owner")
            if by == r["position"]:
                raise EnterpriseError(403, "self_decision", "Nobody decides their own request")
            if by not in enterprises.ancestors(slug, r["position"]):
                raise EnterpriseError(403, "not_in_subtree", "A lead decides only for its own subtree")
            if r["decider"] != by:
                raise EnterpriseError(403, "not_decider", f"This request is waiting for {r['decider']}")
        now = time.time()
        r.update(status="allowed" if decision == "allow" else "denied", decided_by="owner" if owner else by,
                 decided_at=now, reason=reason)
        _write(slug, items)
    who = _t("the_owner") if owner else _title(slug, by)
    word = "allowed" if decision == "allow" else "denied"
    note = _needs_note(r) if decision == "allow" else ""
    applied = _run_payload(slug, r) if decision == "allow" else ""
    shown = _t("owner_applies") if applied == OWNER_APPLIES else applied
    _deliver(slug, r["position"], "decision",
             _t("decision", id=r["id"], cat=r["category"], word=_t(word), who=who) + (f" {reason}" if reason else "")
             + (f" {shown}" if shown else "") + (f" {note}" if note else ""), sender="" if owner else by,
             outside=bool(r.get("outside")) or bool(outside), session=r.get("session") or "")
    if applied == OWNER_APPLIES and not owner:
        _tell_owner_applies(slug, r, who)
    enterprises.log(slug, f"request_{word}", f"{r['category']}: {r['text']}" + (f" ({reason})" if reason else "")
                    + (" (the top position decided its own request)" if top_ok and by == r["position"] else ""),
                    by="owner" if owner else by, position=r["position"], session=r.get("session") or "")
    with contextlib.suppress(Exception):
        from . import feed
        how = _t("resolved_allow" if decision == "allow" else "resolved_deny") + (_t("on_telegram") if via == "telegram" else "")
        feed.resolve(f"enterprise:{slug}:{r['id']}", how, read=True, level="info" if decision == "allow" else "warning")
    enterprises.invalidate(slug)
    return _public(r)


OWNER_APPLIES = "Allowed: the owner applies it."
APPLIED_BY_OWNER = ("raise_budget", "profile_edit", "deliver_cross", "edit_job", "reseat")   # a yes the owner still carries out


def _tell_owner_applies(slug: str, r: dict, who: str) -> None:
    """A lead allowed something only the owner can carry out: the owner hears it (no button, nothing to decide)."""
    label = _label(r["category"])
    body = _t("applies_body", who=who, pos=_title(slug, r["position"]), text=r["text"])
    try:
        from . import enterprise_reports
        enterprise_reports.notify_owner(slug, _t("applies_title", label=label), body, level="info",
                                        url=f"/enterprises/{slug}", dedupe=f"enterprise:{slug}:{r['id']}:applies",
                                        always=True)
    except Exception:  # noqa: BLE001
        log.exception("enterprise %s: owner notification failed", slug)


def _position_id(slug: str, title: str) -> str:
    """A free position id made from a title (lowercase letters, digits, dashes)."""
    ascii_ = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode().lower()
    base = re.sub(r"[^a-z0-9]+", "-", ascii_).strip("-")[:40] or "position"
    taken = {p["id"] for p in (_data(slug).get("positions") or [])} | set(getattr(enterprises, "RESERVED_POS", ()))
    pid, n = base, 2
    while pid in taken:
        pid, n = f"{base}-{n}", n + 1
    return pid


def _requester_boxed(slug: str, pos: str) -> bool:
    """The requester's occupant is protected (sandboxed): the agent it hires is too."""
    try:
        path = (enterprises.position(slug, pos) or {}).get("agent")
        return bool(path and agents.exists(path) and agents.load(path)["sandbox"])
    except Exception:  # noqa: BLE001 - when unsure, protect
        return True


def _hire_failed(slug: str, r: dict, title: str, reason: str) -> str:
    """A hire the owner allowed that could not be carried out: logged, the owner hears it, the requester gets the sentence."""
    enterprises.log(slug, "request_failed", f"The allowed request {r['id']} could not be carried out: {reason}", by="policy",
                    position=r["position"])
    try:
        from . import enterprise_reports
        enterprise_reports.notify_owner(slug, _t("hire_failed_title", title=title),
                                        _t("hire_failed_body", title=title, reason=reason), level="warning",
                                        url=f"/enterprises/{slug}", dedupe=f"enterprise:{slug}:{r['id']}:hire_failed",
                                        always=True)
    except Exception:  # noqa: BLE001
        log.exception("enterprise %s: owner notification failed", slug)
    return _t("hire_failed", reason=reason)


def _hire(slug: str, r: dict) -> str:
    """An allowed hire request: create the position under its lead, then the agent that holds it. A failure leaves
    nothing behind (the position is removed again). -> a sentence for the requester."""
    p = r["payload"] if isinstance(r.get("payload"), dict) else {}
    title = " ".join(str(p.get("title") or "").split())[:80]
    topic = str(p.get("topic") or "").strip()
    lead = p.get("reports_to") if enterprises.position(slug, p.get("reports_to") or "") else r["position"]
    pid = _position_id(slug, title)
    try:
        enterprises.add_position(slug, {"id": pid, "title": title, "reports_to": lead,
                                        "department": str(p.get("department") or ""), "job": str(p.get("job") or "")})
    except Exception as e:  # noqa: BLE001 - the decision stands; nothing was created
        log.exception("enterprise %s: position for a hire not added", slug)
        return _hire_failed(slug, r, title, getattr(e, "message", None) or str(e)[:200])
    name = str(p.get("name") or "").strip() or title
    kw = {k: p[k] for k in ("model", "effort") if p.get(k)}
    if p.get("role"):
        kw["role"] = str(p["role"])
    kw["sandbox"] = _requester_boxed(slug, r["position"])
    try:
        enterprises.hire_custom(slug, pid, topic, name=name, **kw)
    except Exception as e:  # noqa: BLE001 - the decision stands; the half-made position goes
        log.exception("enterprise %s: hire failed", slug)
        with contextlib.suppress(Exception):
            enterprises.remove_position(slug, pid)
        return _hire_failed(slug, r, title, getattr(e, "message", None) or str(e)[:200])
    enterprises.log(slug, "hire", f"{title} hired ({pid})", by="policy", position=pid)
    return _t("hire_done", pos=title, name=name)


def _run_payload(slug: str, r: dict) -> str:
    """Carries out what an allowed request can be carried out as: a job description
    or a re-seat of a position under the requester. -> a sentence for the requester ("" when nothing is left to do),
    OWNER_APPLIES when the owner still has to apply it."""
    p = r.get("payload") if isinstance(r.get("payload"), dict) else {}
    cat, pos = r.get("category"), r["position"]
    if cat == "hire":
        return _hire(slug, r)
    try:
        target = p.get("position")
        if cat in ("edit_job", "reseat") and target in enterprises.subtree(slug, pos) and (
                (cat == "edit_job" and isinstance(p.get("job"), str)) or (cat == "reseat" and p.get("agent"))):
            rev = enterprises.load(slug)["rev"]
            if cat == "edit_job":
                enterprises.update_position(slug, target, {"job": p["job"]})
                return _t("job_done", pos=_title(slug, target))
            if (enterprises.position(slug, target) or {}).get("agent"):
                return OWNER_APPLIES
            enterprises.update_position(slug, target, {"agent": p["agent"]}, rev=rev)
            return _t("seat_done", pos=_title(slug, target), agent=p["agent"])
    except Exception:  # noqa: BLE001 - the decision stands; the log says why nothing was done
        log.exception("enterprise %s: allowed request failed", slug)
        enterprises.log(slug, "request_failed", f"The allowed request {r['id']} could not be carried out", by="policy",
                        position=pos)
        return OWNER_APPLIES if cat in APPLIED_BY_OWNER else ""
    return OWNER_APPLIES if cat in APPLIED_BY_OWNER else ""


def feed_action(rid: str, action: str, by: str, ev: dict) -> None:
    """A button of the request's feed event (web or Telegram); the value is `<slug>:<request id>`."""
    from . import feed
    slug, _, req = rid.partition(":")
    if action in ("allow", "deny"):
        try:
            if slug != "esc" and any(x["id"] == req for x in _read(slug)):
                decide(slug, req, action, by=None, via=by)
                return
        except EnterpriseError as e:
            raise feed.FeedError(e.status, e.code, e.message) from None
        try:                                            # not a request: another card of the enterprise (escalation)
            from . import enterprise_flow
            fn = getattr(enterprise_flow, "feed_action", None)
        except ImportError:
            fn = None
        if fn:
            fn(rid, action, by, ev)
            return
        raise feed.FeedError(404, "not_found", "This request no longer exists")


# ---- tick: deadlines climb, expired grants go -------------------------------------------------------------------
def _climb(slug: str, now: float) -> None:
    moved: list[tuple[dict, str]] = []
    with enterprises._lock:
        items = _read(slug)
        for r in items:
            if r.get("status") != "pending" or r.get("decider") in ("owner", "free") or not r.get("deadline"):
                continue
            if r["deadline"] > now:
                continue
            nxt = _pick(slug, r["position"], after=r["decider"])
            step = int(enterprises.setting(slug, "escalation_timeout_h", r["position"]) or 4) * 3600
            if nxt == r["decider"]:                          # stopped at the top: renewed with a back-off, then the owner
                n = int(r.get("renewals") or 0) + 1
                r["renewals"] = n
                if n <= RENEW_MAX:
                    r["deadline"] = now + step * 2 ** n
                    enterprises.log(slug, "request_climbed", f"{r['category']}: no answer from {r['decider']}, still with it",
                                    by="policy", position=r["position"])
                    moved.append((dict(r), nxt))             # one copy at a time: kept as is while it waits in the inbox
                    continue
                nxt = "owner"
            enterprises.log(slug, "request_climbed", f"{r['category']}: no answer from {r['decider']}, to {nxt}",
                            by="policy", position=r["position"])
            r["decider"], r["level"] = nxt, int(r.get("level") or 0) + 1
            r["deadline"] = None if nxt == "owner" else now + step
            if nxt == "owner":
                r["for_owner"] = False
            moved.append((dict(r), nxt))
        if moved:
            _write(slug, items)
    for r, who in moved:
        _hand_to(slug, r, who)
    if moved:
        enterprises.invalidate(slug)


def _drop_grants(slug: str, now: float) -> None:
    gone = [g for g in _data(slug).get("grants") or [] if (_until(g.get("until")) or 0) <= now]
    if not gone:
        return
    ids = {g["id"] for g in gone}

    def edit(d: dict) -> list[str]:
        d["grants"] = [g for g in d["grants"] if g["id"] not in ids]
        return sorted(ids)
    enterprises._apply(slug, edit)
    for g in gone:
        enterprises.log(slug, "grant_expired", f"The grant {g['id']} ({g['category']} for {g['position']}) ended",
                        by="policy", position=str(g.get("position") or ""))


def tick(now: float | None = None) -> None:
    """Called every minute by the enterprise loop: requests past their deadline climb, ended grants are dropped."""
    if not enterprises.feature_on():
        return
    t = _now(now)
    for slug in enterprises.names():
        for fn in (_climb, _drop_grants):
            try:
                fn(slug, t)
            except Exception:  # noqa: BLE001 - one enterprise must not stop the others
                log.exception("enterprise %s: policy tick (%s)", slug, fn.__name__)


# ---- envelopes: budget -------------------------------------------------------------------------------------------
def _seat(path: str) -> tuple[str, str] | None:
    """The position an agent acts for: the one it holds, or the one a live (or ended today) worker was started for."""
    seat = enterprises.seat_of(path)
    if seat or "-w" not in path.rsplit("/", 1)[-1]:
        return seat
    try:
        from . import enterprise_workers
        fn = getattr(enterprise_workers, "seat_of_worker", None)
        return fn(path) if fn else None
    except Exception:  # noqa: BLE001 - a lookup never raises
        log.exception("worker seat of %s", path)
        return None


def _workers_cost(slug: str, positions: list[str] | None) -> float:
    """USD the workers (live or ended today) of the positions spent today (None: the whole enterprise)."""
    try:
        from . import enterprise_workers
        fn = getattr(enterprise_workers, "cost_today", None)
        if fn is None:
            return 0.0
        return float(fn(slug) if positions is None else sum(fn(slug, x) for x in positions))
    except Exception:  # noqa: BLE001
        log.exception("worker cost of %s", slug)
        return 0.0


def _levels(path: str) -> tuple[str, list[tuple[str, str, float, list[str], Callable[[], float]]]]:
    """(slug, [(id, label, usd per day, member agent paths, cost of the members' workers)]) of the envelopes with a
    budget that apply to the agent (an occupant or one of its workers)."""
    seat = _seat(path)
    d = _data(seat[0]) if seat else {}
    if not seat or not d:
        return "", []
    slug, pos = seat
    out = []
    dept = enterprises.department_of(slug, pos)
    env = ((d.get("departments") or {}).get(dept) or {}).get("envelope") or {}
    if dept and (env.get("usd_per_day") or 0) > 0:
        in_dept = [p for p in d["positions"] if p["department"] == dept]
        out.append((f"department:{dept}", _t("env_dept", name=d["departments"][dept].get("name") or dept),
                    float(env["usd_per_day"]), [p["agent"] for p in in_dept if p["agent"]],
                    lambda ids=[p["id"] for p in in_dept]: _workers_cost(slug, ids)))
    top = d.get("envelope") or {}
    if (top.get("usd_per_day") or 0) > 0:
        out.append(("enterprise", _t("env_ent", name=d.get("name") or slug), float(top["usd_per_day"]),
                    [p["agent"] for p in d["positions"] if p["agent"]], lambda: _workers_cost(slug, None)))
    return slug, out


def _usage(members: list[str], session: str | None = None, workers: Callable[[], float] | None = None) -> tuple[float, float]:
    """(spent today, held by runs in progress) over the distinct existing agents, plus what their workers spent."""
    spent = held = 0.0
    for m in dict.fromkeys(members):
        if not agents.exists(m):
            continue
        spent += agents.day_cost(m)
        held += agents._held(agents._read_state(m), but=session)
    return spent + (workers() if workers else 0.0), held


def has_ceiling(path: str) -> bool:
    try:
        return enterprises.feature_on() and bool(_seat(path)) and bool(_levels(path)[1])
    except Exception:  # noqa: BLE001
        return False


_told: set[tuple] = set()


def _tell(slug: str, key: str, label: str, usd: float) -> None:
    """One owner notification per envelope per day, sent from a thread: a slow Telegram call never holds a lock."""
    from .sessions import store
    day = store.day_of(time.time())
    if (slug, key, day) in _told:
        return
    _told.add((slug, key, day))
    if len(_told) > 500:
        _told.clear()
    threading.Thread(target=_send_tell, args=(slug, f"envelope:{slug}:{key}:{day}", label, usd), daemon=True,
                     name="enterprise-envelope-alert").start()


def _send_tell(slug: str, ref: str, label: str, usd: float) -> None:
    title, body = _t("env_title", label=label), _t("env_body", usd=usd)
    try:
        from . import enterprise_reports
        enterprise_reports.notify_owner(slug, title, body, level="warning", url=f"/enterprises/{slug}", dedupe=ref,
                                        always=True)
        return
    except (ImportError, AttributeError):
        pass
    except Exception:  # noqa: BLE001
        log.exception("enterprise %s: envelope notification failed", slug)
    with contextlib.suppress(Exception):
        from . import feed
        feed.post(title, body, "warning", "enterprises", f"/enterprises/{slug}", dedupe=ref)


def over_ceiling(path: str) -> str | None:
    """The refusal text once the agent's department or enterprise has spent its daily envelope (None: room left)."""
    try:
        if not enterprises.feature_on() or not _seat(path):
            return None
        slug, levels = _levels(path)
        for key, label, usd, members, workers in levels:
            if _usage(members, workers=workers)[0] >= usd:
                _tell(slug, key, label, usd)
                return _t("env_refusal", label=label, usd=usd)
    except Exception:  # noqa: BLE001
        log.exception("envelope check failed (%s)", path)
    return None


def ceiling_held(path: str) -> bool:
    """True when what is left of an envelope is all held by runs in progress (the delivery waits: busy)."""
    try:
        if not enterprises.feature_on() or not _seat(path):
            return False
        for _key, _label, usd, members, workers in _levels(path)[1]:
            spent, held = _usage(members, workers=workers)
            if held and spent + held >= usd - 0.01:
                return True
    except Exception:  # noqa: BLE001
        log.exception("envelope check failed (%s)", path)
    return False


def cap(path: str, left: float, session: str | None = None) -> float:
    """The per-run budget `left` lowered to what its department and enterprise envelopes still have. An agent without
    a budget of its own (`left` infinite) gets a bounded share, so its siblings run side by side."""
    try:
        if not enterprises.feature_on() or not _seat(path):
            return left
        for _key, _label, usd, members, workers in _levels(path)[1]:
            spent, held = _usage(members, session, workers)
            room = max(usd - spent - held, 0.01)
            if left == float("inf"):
                room = min(room, UNBUDGETED_RUN_USD, usd / max(len(set(members)), 1))
            left = min(left, max(room, 0.01))
    except Exception:  # noqa: BLE001
        log.exception("envelope cap failed (%s)", path)
    return left


# ---- envelopes: keys and domains -------------------------------------------------------------------------------
def _lists(slug: str, pos: str, field: str) -> list[tuple[str, list[str]]]:
    """The keys / domains lists (not null) that bind the position: its department's, then the enterprise's."""
    d = _data(slug)
    dept = enterprises.department_of(slug, pos)
    out = []
    de = (d.get("departments") or {}).get(dept) or {}
    if dept and isinstance(de.get("envelope", {}).get(field), list):
        out.append((f"department {de.get('name') or dept}", de["envelope"][field]))
    if isinstance((d.get("envelope") or {}).get(field), list):
        out.append((f"enterprise {d.get('name') or slug}", d["envelope"][field]))
    return out


def _within(field: str, item: str, allowed: list[str]) -> bool:
    if field == "keys":
        return item in allowed
    d = item.lower()
    for e in (str(x).lower().removeprefix("https://").removeprefix("http://").rstrip("/") for x in allowed):
        if d == e or (e.startswith("*.") and not d.startswith("*.") and (d == e[2:] or d.endswith(e[1:]))):
            return True
        if e.startswith("*.") and d.startswith("*.") and (d == e or d[2:].endswith(e[1:])):
            return True
    return False


def _outside(field: str, items: list[str], allowed: list[str]) -> list[str]:
    return [x for x in items if not _within(field, x, allowed)]


def check_envelope(path: str, fields: dict) -> None:
    """Refuses widening an agent's keys or domains beyond its department's / enterprise's lists: 400 exceeds_envelope.
    Only what is added counts (an agent already over its envelope is flagged by over_envelope, never edited)."""
    seat = enterprises.seat_of(path) if enterprises.feature_on() else None
    if not seat:
        return
    cur = None
    for field, clean in (("keys", agents._clean_keys), ("domains", agents._clean_domains)):
        if not isinstance(fields.get(field), list):
            continue
        lists = _lists(seat[0], seat[1], field)
        if not lists:
            continue
        if cur is None:
            cur = agents.load(path)
        added = [x for x in clean(fields[field]) if x not in cur[field]]
        for scope, allowed in lists:
            bad = _outside(field, added, allowed)
            if bad:
                raise agents.AgentError(400, "exceeds_envelope",
                                        f"The {field} {', '.join(bad)} are outside the {scope} envelope "
                                        f"({', '.join(allowed) or 'none'}): widen the envelope first.")


def over_envelope(slug: str) -> list[dict]:
    """The occupants whose keys or domains exceed their envelope: [{position, what}] (flags for the chart)."""
    out: list[dict] = []
    for p in _data(slug).get("positions") or []:
        path = p.get("agent")
        if not path or not agents.exists(path):
            continue
        try:
            a = agents.load(path)
        except Exception:  # noqa: BLE001
            continue
        for field in ("keys", "domains"):
            bad: list[str] = []
            for _scope, allowed in _lists(slug, p["id"], field):
                bad += [x for x in _outside(field, a.get(field) or [], allowed) if x not in bad]
            if bad:
                out.append({"position": p["id"], "what": f"{field}: {', '.join(bad)}"})
    return out


# ---- communication and trust --------------------------------------------------------------------------------------
def can_send(from_path: str, to_path: str) -> str | None:
    """None when `maxxing agents send` may go through; else the refusal text (who to go through). Only when both
    agents sit in the same enterprise and the feature is on."""
    try:
        a, b = enterprises.seat_of(from_path), enterprises.seat_of(to_path)
        if not a or not b or a[0] != b[0] or a[1] == b[1] or not enterprises.feature_on():
            return None
        slug, src, dst = a[0], a[1], b[1]
        mode = enterprises.setting(slug, "communication", src) or "leads"
        up = enterprises.lead_of(slug, src)
        if dst == up or dst in enterprises.reports_of(slug, src):
            return None
        if mode in ("leads", "open") and enterprises.reports_of(slug, src) and enterprises.reports_of(slug, dst):
            return None
        if mode == "open" and any({src, dst} == set(p) for p in enterprises.setting(slug, "allow", src) or []):
            return None
        via = (f"your lead, {_title(slug, up)}" if up else "one of your reports" if enterprises.reports_of(slug, src)
               else "the owner")
        return (f"The enterprise's communication is {mode}: {_title(slug, src)} cannot write directly to "
                f"{_title(slug, dst)}. Go through {via}.")
    except Exception:  # noqa: BLE001 - a lookup never stops a send
        log.exception("can_send failed")
        return None


def trusted_delivery(slug: str, outside: bool) -> bool:
    """A delivery along the chain is given as a task from the lead (not as outside text) when Trust along the chain
    is on and nothing in its chain came from outside."""
    return bool(enterprises.setting(slug, "trust_chain")) and not outside
