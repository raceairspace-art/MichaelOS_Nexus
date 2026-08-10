from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class OliverParams:
    fast_sma: int = 20
    slow_sma: int = 200
    atr_len: int = 14
    slope_lookback: int = 5
    narrow_sep_atr: float = 0.50
    wide_sep_atr: float = 2.00
    trend_slope_atr: float = 0.08
    location_atr: float = 0.60
    elephant_lookback: int = 20
    elephant_range_mult: float = 1.50
    elephant_body_ratio: float = 0.70
    elephant_strong_close: float = 0.75
    elephant_max_opposite_wick: float = 0.20
    opening_window_minutes: int = 90
    premarket_start_hour: int = 4
    structure_lookback: int = 12
    min_space_r: float = 1.50


def normalize_ohlcv(df: pd.DataFrame) -> pd.DataFrame:
    x = df.copy()
    if isinstance(x.columns, pd.MultiIndex):
        fields = {"Open", "High", "Low", "Close", "Volume"}
        if set(x.columns.get_level_values(0)) & fields:
            x.columns = x.columns.get_level_values(0)
        elif set(x.columns.get_level_values(1)) & fields:
            x.columns = x.columns.get_level_values(1)
    x.columns = [str(c).strip().title() for c in x.columns]
    required = ["Open", "High", "Low", "Close"]
    missing = [c for c in required if c not in x.columns]
    if missing:
        raise ValueError(f"Missing OHLC columns: {missing}")
    if "Volume" not in x.columns:
        x["Volume"] = np.nan
    x = x[["Open", "High", "Low", "Close", "Volume"]]
    for col in x.columns:
        x[col] = pd.to_numeric(x[col], errors="coerce")
    return x.dropna(subset=required).sort_index()


def _nearest_obstacle(row: pd.Series, bull: bool) -> float:
    price = float(row.Close)
    levels = [
        row.get("PrevClose"), row.get("PrevHigh"), row.get("PrevLow"),
        row.get("PrevLateHigh"), row.get("PrevLateLow"),
        row.get("PremarketHigh"), row.get("PremarketLow"),
        row.get("SMA20"), row.get("SMA200"),
        row.get("BoxHigh"), row.get("BoxLow"),
    ]
    clean = [float(v) for v in levels if pd.notna(v)]
    if bull:
        ahead = [v for v in clean if v > price]
        return min(ahead) if ahead else np.nan
    ahead = [v for v in clean if v < price]
    return max(ahead) if ahead else np.nan


def add_features(df: pd.DataFrame, p: OliverParams) -> pd.DataFrame:
    x = normalize_ohlcv(df)
    idx = x.index.tz_convert("America/New_York") if x.index.tz is not None else x.index
    x["LocalDate"] = idx.date
    x["LocalMinute"] = idx.hour * 60 + idx.minute
    x["Regular"] = (x.LocalMinute >= 570) & (x.LocalMinute < 960)
    x["Premarket"] = (x.LocalMinute >= p.premarket_start_hour * 60) & (x.LocalMinute < 570)

    x["Range"] = x.High - x.Low
    x["Body"] = (x.Close - x.Open).abs()
    x["BodyRatio"] = np.where(x.Range > 0, x.Body / x.Range, np.nan)
    x["ClosePos"] = np.where(x.Range > 0, (x.Close - x.Low) / x.Range, np.nan)
    x["UpperWick"] = x.High - x[["Open", "Close"]].max(axis=1)
    x["LowerWick"] = x[["Open", "Close"]].min(axis=1) - x.Low
    x["UpperWickRatio"] = np.where(x.Range > 0, x.UpperWick / x.Range, np.nan)
    x["LowerWickRatio"] = np.where(x.Range > 0, x.LowerWick / x.Range, np.nan)

    prev_close = x.Close.shift(1)
    tr = pd.concat([x.Range, (x.High - prev_close).abs(), (x.Low - prev_close).abs()], axis=1).max(axis=1)
    x["ATR"] = tr.rolling(p.atr_len, min_periods=p.atr_len).mean()
    x["SMA20"] = x.Close.rolling(p.fast_sma, min_periods=p.fast_sma).mean()
    x["SMA200"] = x.Close.rolling(p.slow_sma, min_periods=p.slow_sma).mean()
    x["SepATR"] = (x.SMA20 - x.SMA200).abs() / x.ATR.replace(0, np.nan)
    x["Slope20ATR"] = (x.SMA20 - x.SMA20.shift(p.slope_lookback)) / (x.ATR.replace(0, np.nan) * p.slope_lookback)

    x["State"] = "Transitional"
    x.loc[(x.SepATR <= p.narrow_sep_atr) & (x.Slope20ATR.abs() < p.trend_slope_atr), "State"] = "Narrow"
    x.loc[(x.SepATR >= p.wide_sep_atr) & (x.SMA20 > x.SMA200), "State"] = "Wide Up"
    x.loc[(x.SepATR >= p.wide_sep_atr) & (x.SMA20 < x.SMA200), "State"] = "Wide Down"
    middle = (x.SepATR > p.narrow_sep_atr) & (x.SepATR < p.wide_sep_atr)
    x.loc[middle & (x.SMA20 > x.SMA200) & (x.Slope20ATR >= p.trend_slope_atr), "State"] = "Trending Up"
    x.loc[middle & (x.SMA20 < x.SMA200) & (x.Slope20ATR <= -p.trend_slope_atr), "State"] = "Trending Down"

    x["Dist20ATR"] = (x.Close - x.SMA20).abs() / x.ATR.replace(0, np.nan)
    x["Dist200ATR"] = (x.Close - x.SMA200).abs() / x.ATR.replace(0, np.nan)
    x["NearestMADistATR"] = pd.concat([x.Dist20ATR, x.Dist200ATR], axis=1).min(axis=1)

    median_range = x.Range.shift(1).rolling(p.elephant_lookback, min_periods=max(5, p.elephant_lookback // 2)).median()
    x["RangeMultiple"] = x.Range / median_range.replace(0, np.nan)
    x["BullElephant"] = (
        (x.Close > x.Open)
        & (x.RangeMultiple >= p.elephant_range_mult)
        & (x.BodyRatio >= p.elephant_body_ratio)
        & (x.ClosePos >= p.elephant_strong_close)
        & (x.UpperWickRatio <= p.elephant_max_opposite_wick)
    )
    x["BearElephant"] = (
        (x.Close < x.Open)
        & (x.RangeMultiple >= p.elephant_range_mult)
        & (x.BodyRatio >= p.elephant_body_ratio)
        & (x.ClosePos <= 1 - p.elephant_strong_close)
        & (x.LowerWickRatio <= p.elephant_max_opposite_wick)
    )

    for col in ("PrevClose", "PrevHigh", "PrevLow", "PrevLateHigh", "PrevLateLow", "PremarketHigh", "PremarketLow"):
        x[col] = np.nan

    dates = sorted(set(x.LocalDate))
    for i, current in enumerate(dates):
        current_mask = x.LocalDate == current
        pm = x[current_mask & x.Premarket]
        if not pm.empty:
            x.loc[current_mask, "PremarketHigh"] = pm.High.max()
            x.loc[current_mask, "PremarketLow"] = pm.Low.min()
        if i == 0:
            continue
        previous = dates[i - 1]
        prev = x[(x.LocalDate == previous) & x.Regular]
        if prev.empty:
            continue
        x.loc[current_mask, "PrevClose"] = prev.Close.iloc[-1]
        x.loc[current_mask, "PrevHigh"] = prev.High.max()
        x.loc[current_mask, "PrevLow"] = prev.Low.min()
        late = prev[prev.LocalMinute >= 900]
        if not late.empty:
            x.loc[current_mask, "PrevLateHigh"] = late.High.max()
            x.loc[current_mask, "PrevLateLow"] = late.Low.min()

    x["BoxHigh"] = x.High.shift(1).rolling(p.structure_lookback, min_periods=max(4, p.structure_lookback // 2)).max()
    x["BoxLow"] = x.Low.shift(1).rolling(p.structure_lookback, min_periods=max(4, p.structure_lookback // 2)).min()
    x["InsideBox"] = (x.Close <= x.BoxHigh) & (x.Close >= x.BoxLow)
    x["BreakAboveBox"] = x.Close > x.BoxHigh
    x["BreakBelowBox"] = x.Close < x.BoxLow
    x["BoxWidthATR"] = (x.BoxHigh - x.BoxLow) / x.ATR.replace(0, np.nan)

    x["NearMA"] = x.NearestMADistATR <= p.location_atr
    x["BullLocationOK"] = x.NearMA | ((x.Low <= x.SMA20) & (x.Close > x.SMA20))
    x["BearLocationOK"] = x.NearMA | ((x.High >= x.SMA20) & (x.Close < x.SMA20))
    x["BullStateOK"] = x.State.isin(["Narrow", "Trending Up", "Transitional"])
    x["BearStateOK"] = x.State.isin(["Narrow", "Trending Down", "Transitional"])

    x["BullRisk"] = x.Close - x.Low
    x["BearRisk"] = x.High - x.Close
    x["BullObstacle"] = x.apply(lambda r: _nearest_obstacle(r, True), axis=1)
    x["BearObstacle"] = x.apply(lambda r: _nearest_obstacle(r, False), axis=1)
    x["BullSpace"] = x.BullObstacle - x.Close
    x["BearSpace"] = x.Close - x.BearObstacle
    x["BullSpaceR"] = x.BullSpace / x.BullRisk.replace(0, np.nan)
    x["BearSpaceR"] = x.BearSpace / x.BearRisk.replace(0, np.nan)
    x["BullSpaceOK"] = x.BullSpaceR.isna() | (x.BullSpaceR >= p.min_space_r)
    x["BearSpaceOK"] = x.BearSpaceR.isna() | (x.BearSpaceR >= p.min_space_r)

    x["BullScore"] = _score(x, True, p)
    x["BearScore"] = _score(x, False, p)
    x["EventDirection"] = np.where(x.BullElephant, "Bull", np.where(x.BearElephant, "Bear", ""))
    x["EventScore"] = np.where(x.BullElephant, x.BullScore, np.where(x.BearElephant, x.BearScore, np.nan))
    return x


def _score(x: pd.DataFrame, bull: bool, p: OliverParams) -> pd.Series:
    state_ok = x.BullStateOK if bull else x.BearStateOK
    location_ok = x.BullLocationOK if bull else x.BearLocationOK
    elephant = x.BullElephant if bull else x.BearElephant
    box_clear = x.BreakAboveBox if bull else x.BreakBelowBox
    space_r = x.BullSpaceR if bull else x.BearSpaceR

    state = state_ok.astype(float) * 20
    location_cont = (1 - x.NearestMADistATR / max(p.location_atr * 2, 1e-9)).clip(0, 1)
    location = np.maximum(location_ok.astype(float) * 13, location_cont * 20)
    structure = box_clear.astype(float) * 15
    space = (space_r / max(p.min_space_r, 1e-9) * 10).clip(0, 10).fillna(10)
    range_strength = ((x.RangeMultiple - 1) / max(p.elephant_range_mult - 1, 1e-9)).clip(0, 1)
    power_cont = (0.60 * range_strength + 0.40 * x.BodyRatio.clip(0, 1)) * 25
    power = np.where(elephant, np.maximum(power_cont, 20), power_cont)
    if bull:
        aligned = (x.State == "Trending Up") | ((x.State == "Narrow") & (x.Close >= x.SMA20))
    else:
        aligned = (x.State == "Trending Down") | ((x.State == "Narrow") & (x.Close <= x.SMA20))
    direction = aligned.astype(float) * 10
    return pd.Series(np.clip(state + location + structure + space + power + direction, 0, 100), index=x.index)


def day_slice(x: pd.DataFrame, session_date) -> pd.DataFrame:
    return x[x.LocalDate == session_date].copy()


def visible_slice(x: pd.DataFrame, session_date, p: OliverParams) -> pd.DataFrame:
    day = day_slice(x, session_date)
    return day[(day.LocalMinute >= p.premarket_start_hour * 60) & (day.LocalMinute < 960)]


def opening_slice(x: pd.DataFrame, session_date, p: OliverParams) -> pd.DataFrame:
    day = day_slice(x, session_date)
    return day[(day.LocalMinute >= 570) & (day.LocalMinute < 570 + p.opening_window_minutes)]


def best_case(x: pd.DataFrame, session_date, p: OliverParams) -> dict:
    opening = opening_slice(x, session_date, p)
    if opening.empty:
        return {"has_data": False, "score": np.nan, "direction": "", "event_time": None, "reason": "No opening data."}
    events = opening[opening.BullElephant | opening.BearElephant]
    if not events.empty:
        event_time = events.EventScore.idxmax()
        row = events.loc[event_time]
        direction = row.EventDirection
        score = float(row.EventScore)
        has_elephant = True
    else:
        bull_time = opening.BullScore.idxmax()
        bear_time = opening.BearScore.idxmax()
        if opening.loc[bull_time, "BullScore"] >= opening.loc[bear_time, "BearScore"]:
            event_time, row, direction, score = bull_time, opening.loc[bull_time], "Bull", float(opening.loc[bull_time, "BullScore"])
        else:
            event_time, row, direction, score = bear_time, opening.loc[bear_time], "Bear", float(opening.loc[bear_time, "BearScore"])
        has_elephant = False

    bull = direction == "Bull"
    location_ok = bool(row.BullLocationOK if bull else row.BearLocationOK)
    box_clear = bool(row.BreakAboveBox if bull else row.BreakBelowBox)
    space_r = row.BullSpaceR if bull else row.BearSpaceR
    obstacle = row.BullObstacle if bull else row.BearObstacle
    reason = [
        f"{direction} {'Elephant' if has_elephant else 'near-candidate'}",
        f"state={row.State}",
        "location aligns" if location_ok else "location weak",
        "box cleared" if box_clear else "still inside/near structure box",
    ]
    if pd.notna(space_r):
        reason.append(f"space={space_r:.2f}R")
    else:
        reason.append("space=open/unknown")
    if pd.notna(row.RangeMultiple):
        reason.append(f"range={row.RangeMultiple:.2f}x")
    if pd.notna(row.BodyRatio):
        reason.append(f"body={row.BodyRatio:.0%}")

    return {
        "has_data": True,
        "has_elephant": has_elephant,
        "score": round(score, 2),
        "direction": direction,
        "event_time": event_time,
        "state": row.State,
        "location_ok": location_ok,
        "box_high": None if pd.isna(row.BoxHigh) else float(row.BoxHigh),
        "box_low": None if pd.isna(row.BoxLow) else float(row.BoxLow),
        "box_cleared": box_clear,
        "inside_box": bool(row.InsideBox),
        "space_r": None if pd.isna(space_r) else round(float(space_r), 3),
        "next_obstacle": None if pd.isna(obstacle) else float(obstacle),
        "entry": float(row.Close),
        "event_low": float(row.Low),
        "event_high": float(row.High),
        "prev_close": None if pd.isna(row.PrevClose) else float(row.PrevClose),
        "prev_high": None if pd.isna(row.PrevHigh) else float(row.PrevHigh),
        "prev_low": None if pd.isna(row.PrevLow) else float(row.PrevLow),
        "prev_late_high": None if pd.isna(row.PrevLateHigh) else float(row.PrevLateHigh),
        "prev_late_low": None if pd.isna(row.PrevLateLow) else float(row.PrevLateLow),
        "premarket_high": None if pd.isna(row.PremarketHigh) else float(row.PremarketHigh),
        "premarket_low": None if pd.isna(row.PremarketLow) else float(row.PremarketLow),
        "reason": "; ".join(reason),
    }


def outcome_for_case(x: pd.DataFrame, session_date, case: dict) -> dict:
    if not case.get("has_data") or case.get("event_time") is None:
        return {}
    day = day_slice(x, session_date)
    regular = day[(day.LocalMinute >= 570) & (day.LocalMinute < 960)]
    future = regular.loc[regular.index > case["event_time"]]
    if future.empty:
        return {}
    entry = float(case["entry"])
    if case["direction"] == "Bull":
        stop = float(case["event_low"])
        risk = entry - stop
        if risk <= 0:
            return {}
        mfe = (future.High.max() - entry) / risk
        mae = (entry - future.Low.min()) / risk
    else:
        stop = float(case["event_high"])
        risk = stop - entry
        if risk <= 0:
            return {}
        mfe = (entry - future.Low.min()) / risk
        mae = (future.High.max() - entry) / risk
    return {
        "entry": round(entry, 4), "stop": round(stop, 4), "initial_risk": round(risk, 4),
        "mfe_r": round(float(mfe), 3), "mae_r": round(float(mae), 3),
        "hit_1r": bool(mfe >= 1), "hit_2r": bool(mfe >= 2), "hit_3r": bool(mfe >= 3),
        "stopped_intraday": bool(mae >= 1),
    }
