from __future__ import annotations


def _quality_from_score(score: float | None) -> int:
    if score is None:
        return 1
    if score >= 85: return 5
    if score >= 70: return 4
    if score >= 55: return 3
    if score >= 40: return 2
    return 1


def decision_review(candidate: dict, min_space_r: float = 1.5) -> dict:
    if not candidate.get("has_data"):
        return {
            "stateClassification": "Unclear", "locationClassification": "Neutral / unclear", "boxStatus": "Box unclear",
            "stateQuality": 1, "locationQuality": 1, "premarketContextQuality": 1, "spaceQuality": 1, "riskQuality": 1,
            "overallQuality": 1, "structureBoxRelevant": False, "boxCleared": False, "trendAlignment": False,
            "volumeConfirmation": False, "powerTypes": ["No meaningful power"], "oliverInterest": "No", "wouldTrade": "No",
            "direction": "None / unclear", "setupType": "No valid setup", "overallGrade": "Reject", "confidence": 5,
            "strongestReason": "No valid opening-window candidate was available.", "biggestConcern": "Insufficient decision evidence.",
            "score": 0.0, "reason": candidate.get("reason", "No opening data."),
        }

    score = float(candidate.get("score") or 0)
    direction = candidate.get("direction", "")
    state = candidate.get("state") or "Unclear"
    location_ok = bool(candidate.get("location_ok"))
    box_cleared = bool(candidate.get("box_cleared"))
    inside_box = bool(candidate.get("inside_box"))
    has_elephant = bool(candidate.get("has_elephant"))
    space_r = candidate.get("space_r")
    space_ok = space_r is None or float(space_r) >= min_space_r

    state_quality = 5 if state in ("Trending Up", "Trending Down") else 4 if state in ("Narrow", "Wide Up", "Wide Down") else 3 if state == "Transitional" else 2
    location_quality = 4 if location_ok else 2
    structure_quality = 5 if box_cleared else 2 if inside_box else 3
    space_quality = 4 if space_r is None else 5 if float(space_r) >= min_space_r * 1.5 else 4 if space_ok else 2
    power_quality = 5 if has_elephant else 3
    risk_quality = 4 if space_ok and location_ok else 3 if space_ok else 2
    overall_quality = _quality_from_score(score)

    aligned = (direction == "Bull" and state in ("Trending Up", "Wide Up", "Narrow", "Transitional")) or (direction == "Bear" and state in ("Trending Down", "Wide Down", "Narrow", "Transitional"))
    trade = score >= 72 and location_ok and space_ok and (box_cleared or has_elephant)
    maybe = not trade and score >= 55 and space_ok
    interest = "Yes" if trade else "Maybe" if maybe else "No"
    would_trade = "Yes" if trade else "Maybe" if maybe else "No"
    grade = "A+" if score >= 90 and trade else "A" if score >= 80 and trade else "B" if score >= 65 else "C" if score >= 50 else "Reject"
    confidence = 5 if score >= 85 or score < 40 else 4 if score >= 70 or score < 50 else 3

    location_label = "Favorable" if location_ok else "Unfavorable"
    box_status = "Broke above" if box_cleared and direction == "Bull" else "Broke below" if box_cleared else "Inside box" if inside_box else "Testing structure"
    power_types = [f"{direction} Elephant"] if has_elephant else ["No meaningful power"]
    direction_label = "Long" if direction == "Bull" else "Short" if direction == "Bear" else "None / unclear"
    setup = "Elephant Bar" if has_elephant else "Location/State only"

    reasons = []
    if aligned: reasons.append("state aligns with direction")
    if location_ok: reasons.append("location is acceptable")
    if box_cleared: reasons.append("structure box is cleared")
    if has_elephant: reasons.append("opening power is present")
    if space_ok: reasons.append("space is adequate")
    strongest = "; ".join(reasons[:3]) or "No single factor is strong enough to dominate."
    concerns = []
    if not location_ok: concerns.append("weak location")
    if not box_cleared: concerns.append("structure is not cleanly cleared")
    if not has_elephant: concerns.append("no qualifying Elephant power")
    if not space_ok: concerns.append(f"space is below {min_space_r:.1f}R")
    concern = "; ".join(concerns) or "No major encoded concern."

    return {
        "stateClassification": state,
        "locationClassification": location_label,
        "boxStatus": box_status,
        "stateQuality": state_quality,
        "locationQuality": location_quality,
        "premarketContextQuality": 3,
        "spaceQuality": space_quality,
        "riskQuality": risk_quality,
        "overallQuality": overall_quality,
        "structureQuality": structure_quality,
        "powerQuality": power_quality,
        "structureBoxRelevant": candidate.get("box_high") is not None and candidate.get("box_low") is not None,
        "boxCleared": box_cleared,
        "trendAlignment": aligned,
        "volumeConfirmation": has_elephant,
        "powerTypes": power_types,
        "oliverInterest": interest,
        "wouldTrade": would_trade,
        "direction": direction_label,
        "setupType": setup,
        "overallGrade": grade,
        "confidence": confidence,
        "strongestReason": strongest,
        "biggestConcern": concern,
        "score": round(score, 2),
        "spaceR": space_r,
        "reason": candidate.get("reason", ""),
    }
