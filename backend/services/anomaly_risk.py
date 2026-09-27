"""Database comparisons using the existing anomaly scoring curves."""
import json
import os
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

Q_NAMES = ["p10", "p25", "p50", "p75", "p90"]
MILEAGE_NAMES = ["p05", "p10", "p25", "p50", "p75", "p90", "p95"]
SPEC_FIELDS = ["year", "engine", "fuel_type", "gearbox", "drivetrain", "body_type"]
FEATURES = ["brand", "model", "generation", "year", "mileage", "engine",
            "fuel_type", "gearbox", "drivetrain", "body_type"]
DEFAULT_ARTIFACT_DIR = Path(__file__).resolve().parents[1] / "ML_models/anomaly_risk/artifacts"
SCORING_POLICY_VERSION = "anomaly-risk-v2.5-db-comparisons"
SCORING_POLICY = {
    "weights": {"price": 0.75, "mileage": 0.10, "specification": 0.15},
    "mileage_min_samples": 20,
    "spec_min_samples": 25,
    "mileage_curve": "p50=0,p25/p75=10,p10/p90=20,p05/p95=40,exponential_tail_to_100",
    "support_thresholds": {"very_rare_max": 4, "rare_max": 14, "limited_max": 29},
    "rarity_penalties": {"rare_max": 8.0, "limited_max": 4.0},
}


class ModelUnavailableError(RuntimeError):
    """Missing, incompatible or unreadable deployment artifacts."""


class AnomalyRiskService:
    def __init__(self, artifact_dir=None):
        directory = Path(artifact_dir or os.getenv("ANOMALY_RISK_ARTIFACT_DIR") or DEFAULT_ARTIFACT_DIR)
        try:
            metadata = json.loads((directory / "model_metadata.json").read_text(encoding="utf-8"))
            if (metadata["model_version"] != "anomaly-risk-v2"
                    or metadata["input_feature_names"] != FEATURES
                    or metadata["feature_names"] != FEATURES
                    or metadata["derived_features"]
                    or metadata.get("scoring_policy_version") != "anomaly-risk-v2.3"):
                raise ValueError("Unsupported reference statistics contract")
            self.metadata = {"model_version": metadata["model_version"]}
            self.SCORING = {**metadata["anomaly_scoring_constants"], **SCORING_POLICY}
            self.FEATURES = FEATURES
            self.CATEGORICAL = metadata["categorical_feature_names"]
            self.NUMERIC = metadata["numeric_feature_names"]
            self.MISSING = metadata["missing_category"]
        except Exception as exc:
            raise ModelUnavailableError("Anomaly reference statistics could not be loaded") from exc

    def prepare_features(self, frame):
        result = frame.reindex(columns=self.FEATURES).copy()
        for column in self.CATEGORICAL:
            result[column] = result[column].astype("string").str.strip().replace("", pd.NA).fillna(self.MISSING).astype(str)
        for column in self.NUMERIC:
            values = pd.to_numeric(result[column], errors="coerce").astype(float)
            values = values.where(np.isfinite(values) & (values >= 0))
            if column == "year":
                values = values.where((values > 0) & (values % 1 == 0))
            result[column] = values
        return result


    def spread_anomaly_score(self, value, quantiles):
        lo, inner_lo, median, inner_hi, hi = map(float, quantiles)
        lower_side = value < median
        distance = abs(float(value) - median)
        floor = self.SCORING["spread_floor"]
        # Expand collapsed bands minimally so the score remains continuous, including at P50.
        inner_distance = max(median - inner_lo if lower_side else inner_hi - median, floor)
        outer_distance = max(median - lo if lower_side else hi - median, inner_distance + floor)
        if distance == 0:
            return 0.0
        if distance <= inner_distance:
            return float(self.SCORING["inner_score"] * distance / max(inner_distance, floor))
        if distance <= outer_distance:
            return float(self.SCORING["inner_score"] + (self.SCORING["outer_score"] - self.SCORING["inner_score"]) *
                         (distance - inner_distance) / max(outer_distance - inner_distance, floor))
        tail_spread = max(outer_distance - inner_distance, (hi - lo) * self.SCORING["tail_width_fraction"], floor)
        return float(self.SCORING["outer_score"] + (100 - self.SCORING["outer_score"]) *
                     (1 - np.exp(-(distance - outer_distance) / tail_spread)))

    def analyze_price_anomaly(self, actual_price, prices, comparison_level="model_generation"):
        """Score against database prices for the selected model or generation."""
        actual_price = float(actual_price)
        if not np.isfinite(actual_price) or actual_price <= 0:
            raise ValueError("price must be a finite positive asking price in EUR")
        count = len(prices)
        if count < 10:
            support = "insufficient"
        elif count < 20:
            support = "limited"
        else:
            support = "normal"
        result = {
            "actual_price": actual_price,
            "count": count,
            "support_level": support,
            "source": "database",
            "comparison_level": comparison_level,
        }
        if count < 10:
            return {
                **result,
                **dict.fromkeys(Q_NAMES),
                "deviation_from_p50_pct": None,
                "direction": "unknown",
                "price_anomaly_score": None,
                "reason": "insufficient_market_support",
            }

        q = np.percentile(np.asarray(prices, dtype=float), [10, 25, 50, 75, 90])
        direction = "unusually_cheap" if actual_price < q[0] else "unusually_expensive" if actual_price > q[4] else "normal"
        reason = ("Asking price is below the observed P10 price." if direction == "unusually_cheap" else
                  "Asking price is above the observed P90 price." if direction == "unusually_expensive" else
                  "Asking price is close to the observed market median." if q[1] <= actual_price <= q[3] else
                  "Asking price lies within P10-P90, outside the central P25-P75 band.")
        return {**result, **dict(zip(Q_NAMES, map(float, q))),
                "deviation_from_p50_pct": float(100 * (actual_price - q[2]) / q[2]),
                "direction": direction, "price_anomaly_score": self.spread_anomaly_score(actual_price, q), "reason": reason}

    def mileage_anomaly_score(self, actual, stats):
        """Score mileage more gently than price because driving patterns vary widely.

        The observed P05-P95 band reaches 40, not 60. Beyond it, the score rises
        smoothly using the observed P90-P95 or P05-P10 tail width. This preserves
        a high score for truly extreme mileage while keeping modest P95 exceedance
        in the supporting-signal range.
        """
        p05, p10, p25, p50, p75, p90, p95 = (float(stats[name]) for name in MILEAGE_NAMES)
        if actual >= p50:
            points = ((p50, 0.0), (p75, 10.0), (p90, 20.0), (p95, 40.0))
        else:
            points = ((p50, 0.0), (p25, 10.0), (p10, 20.0), (p05, 40.0))
        value = float(actual)
        for (near, near_score), (far, far_score) in zip(points, points[1:]):
            if min(near, far) <= value <= max(near, far):
                span = max(abs(far - near), self.SCORING["spread_floor"])
                return float(near_score + (far_score - near_score) * abs(value - near) / span)
        boundary, boundary_score = points[-1]
        tail_span = max(abs(p95 - p90) if value >= p50 else abs(p10 - p05),
                        self.SCORING["spread_floor"])
        return float(boundary_score + (100 - boundary_score) *
                     (1 - np.exp(-abs(value - boundary) / tail_span)))

    def normalized_vehicle(self, vehicle):
        return self.prepare_features(pd.DataFrame([vehicle])).iloc[0].to_dict()

    def analyze_mileage_anomaly(self, vehicle, comparison_rows):
        v = self.normalized_vehicle(vehicle)
        unknown = {"actual_mileage": None if pd.isna(v["mileage"]) else float(v["mileage"]),
                   "expected_median_mileage": None, **{name: None for name in MILEAGE_NAMES},
                   "mileage_anomaly_score": None, "direction": "unknown", "sample_size": 0,
                   "comparison_level": "unsupported", "reason": "Insufficient mileage comparison data."}
        if pd.isna(v["mileage"]):
            return {**unknown, "reason": "Mileage is missing or invalid; no mileage score is available."}
        reference = self.prepare_features(pd.DataFrame(comparison_rows))
        candidates = []
        if v["generation"] != self.MISSING:
            if pd.notna(v["year"]):
                year = int(v["year"])
                radius = self.SCORING["nearby_year_radius"]
                candidates.append(("exact_year", reference.loc[reference["year"] == year, "mileage"]))
                candidates.append(("nearby_years", reference.loc[reference["year"].between(
                    year - radius, year + radius), "mileage"]))
            candidates.append(("model_generation", reference["mileage"]))
        else:
            candidates.append(("model", reference["mileage"]))

        available_count = int(reference["mileage"].notna().sum())
        unknown["sample_size"] = available_count
        unknown["reason"] = (
            f"Only {available_count} mileage observations are available in the selected group; "
            f"at least {self.SCORING['mileage_min_samples']} are required."
        )
        for level, mileage_values in candidates:
            values = mileage_values.dropna().to_numpy(dtype=float)
            if len(values) < self.SCORING["mileage_min_samples"]:
                continue
            quantiles = np.percentile(values, [5, 10, 25, 50, 75, 90, 95])
            stats = {"sample_size": len(values), **dict(zip(MILEAGE_NAMES, map(float, quantiles)))}
            actual = float(v["mileage"])
            direction = "unusually_low" if actual < stats["p10"] else "unusually_high" if actual > stats["p90"] else "normal"
            reason = ("Mileage is unusually low relative to observed listings for similar vehicles." if direction == "unusually_low" else
                      "Mileage is unusually high relative to observed listings for similar vehicles." if direction == "unusually_high" else
                      "Mileage is within the observed P10-P90 range for similar vehicles.")
            if level in {"model_generation", "model"}:
                reason += " The comparison group includes different production years."
            return {"actual_mileage": actual, "expected_median_mileage": stats["p50"], **stats,
                    "mileage_anomaly_score": self.mileage_anomaly_score(actual, stats),
                    "direction": direction, "comparison_level": level, "reason": reason}
        if available_count >= 10:
            median = float(np.median(reference["mileage"].dropna().to_numpy(dtype=float)))
            unknown.update({
                "expected_median_mileage": median,
                "p50": median,
                "comparison_level": "model_generation" if v["generation"] != self.MISSING else "model",
                "reason": (
                    f"The median is based on {available_count} mileage observations in the selected group. "
                    f"At least {self.SCORING['mileage_min_samples']} are required for a mileage anomaly score."
                ),
            })
        return unknown

    def analyze_specification(self, vehicle, comparison_rows):
        v = self.normalized_vehicle(vehicle)
        reference = self.prepare_features(pd.DataFrame(comparison_rows))
        group_description = "this model and generation" if v["generation"] != self.MISSING else "this model"
        signals, scores, supports = [], [], []
        for field in SPEC_FIELDS:
            value = v[field]
            valid = reference[field].dropna()
            if field in self.CATEGORICAL:
                valid = valid[valid != self.MISSING]
            counts = Counter(valid.tolist())
            n = len(valid)
            signal = {"field": field, "value": None if pd.isna(value) or value == self.MISSING else value,
                      "frequency": None, "sample_size": n, "severity": "unsupported", "score": None,
                      "reason": f"Insufficient observations for {group_description}."}
            if signal["value"] is None:
                signal["reason"] = "The supplied field is missing or invalid."
            elif n >= self.SCORING["spec_min_samples"]:
                matches = (sum(count for observed, count in counts.items()
                               if abs(float(observed) - value) <= self.SCORING["engine_tolerance"])
                           if field == "engine" else counts.get(value, 0))
                frequency = float(matches / n)
                score = float(self.SCORING["spec_max_rarity_score"] * max(0, 1 - frequency / self.SCORING["spec_rare_frequency"]))
                severity, reason = "normal", "This value is observed regularly in the available listing data."
                if field == "year" and (value < min(counts) or value > max(counts)):
                    severity, score = "outside_observed_range", self.SCORING["spec_outside_year_score"]
                    reason = f"Year is outside the observed year range {int(min(counts))}-{int(max(counts))}; verify the entry."
                elif matches == 0:
                    severity = "unobserved"
                    reason = f"This value is unsupported by the observed values for {group_description}."
                elif frequency < self.SCORING["spec_rare_frequency"]:
                    severity = "very_rare" if frequency < self.SCORING["spec_very_rare_frequency"] else "uncommon"
                    reason = "This configuration is rarely observed in the available listing data."
                signal.update(frequency=frequency, severity=severity, score=score, reason=reason)
                scores.append(score)
                supports.append(n)
            signals.append(signal)
        return {"specification_anomaly_score": max(scores) if scores else None,
                "sample_size": min(supports) if supports else 0,
                "supported_fields": len(scores), "signals": signals}

    def assess_market_support(self, observations):
        """Apply the existing rarity thresholds to current database observations."""
        thresholds = self.SCORING["support_thresholds"]
        penalties = self.SCORING["rarity_penalties"]
        if observations <= thresholds["very_rare_max"]:
            return {"model_generation_observations": observations, "support_level": "very_rare",
                    "rarity_penalty": 0.0}
        if observations <= thresholds["rare_max"]:
            # Join the limited-support curve without raising the penalty at 15.
            penalty = penalties["rare_max"] - (
                penalties["rare_max"] - penalties["limited_max"]
            ) * (observations - thresholds["very_rare_max"] - 1) / (
                thresholds["rare_max"] - thresholds["very_rare_max"] - 1
            )
            return {"model_generation_observations": observations, "support_level": "rare",
                    "rarity_penalty": round(penalty, 2)}
        if observations <= thresholds["limited_max"]:
            # 15 observations receives 4 points; 29 observations receives about 0.27.
            penalty = penalties["limited_max"] * (thresholds["limited_max"] + 1 - observations) / 15
            return {"model_generation_observations": observations, "support_level": "limited",
                    "rarity_penalty": round(penalty, 2)}
        return {"model_generation_observations": observations, "support_level": "normal",
                "rarity_penalty": 0.0}

    def assess_market_confidence(self, vehicle, price_anomaly, model_observations, mileage_anomaly=None,
                                 specification=None, market_support=None):
        v = self.normalized_vehicle(vehicle)
        if mileage_anomaly is None:
            mileage_anomaly = self.analyze_mileage_anomaly(v)
        if specification is None:
            specification = self.analyze_specification(v)
        if market_support is None:
            market_support = self.assess_market_support(price_anomaly["count"])
        model_support = model_observations
        gen_support = market_support["model_generation_observations"]
        price_available = price_anomaly["price_anomaly_score"] is not None
        width = None
        relative_width = None
        precision = 0.0
        if price_available:
            width = float(price_anomaly["p90"] - price_anomaly["p10"])
            relative_width = width / max(price_anomaly["p50"], self.SCORING["spread_floor"])
            precision = 1 / (1 + relative_width / self.SCORING["confidence_relative_width_scale"])
        mileage_support = mileage_anomaly["sample_size"] if mileage_anomaly["mileage_anomaly_score"] is not None else 0
        supports = [model_support, gen_support, mileage_support, specification["sample_size"]]
        limits = [self.SCORING[f"confidence_{name}_support"] for name in ["model", "generation", "mileage", "spec"]]
        evidence = [min(n / limit, 1.0) for n, limit in zip(supports, limits)]
        evidence[3] *= specification["supported_fields"] / len(SPEC_FIELDS)
        score = 100 * (0.15 * evidence[0] + 0.25 * evidence[1] + 0.15 * evidence[2] + 0.15 * evidence[3] + 0.30 * precision)
        group_name = "model and generation" if v["generation"] != self.MISSING else "model"
        reasons = [f"{model_support} model observations; {gen_support} {group_name} observations in the selected comparison group."]
        if price_available:
            reasons.append(f"Observed database P10-P90 width is {width:.0f} EUR ({relative_width:.0%} of P50).")
        if price_anomaly["support_level"] == "insufficient":
            score = min(score, self.SCORING["confidence_medium"] - 1)
            reasons.append("Fewer than 10 exact database comparisons; price assessment is unavailable.")
        elif price_anomaly["support_level"] == "limited":
            score = min(score, self.SCORING["confidence_high"] - 1)
            reasons.append("Price confidence is limited by fewer than 20 exact database comparisons.")
        missing = [col for col in self.FEATURES if pd.isna(v[col]) or v[col] == self.MISSING]
        if market_support["support_level"] == "very_rare":
            score = min(score, self.SCORING["confidence_medium"] - 1)
            reasons.append(f"Very limited market data is available for this {group_name} group.")
        elif market_support["support_level"] == "rare":
            score = min(score, self.SCORING["confidence_medium"] - 1)
            reasons.append(f"Market confidence is low because this {group_name} group has few current listings.")
        elif market_support["support_level"] == "limited":
            score = min(score, self.SCORING["confidence_high"] - 1)
            reasons.append(f"Market confidence is capped at medium because this {group_name} group has limited current listings.")
        if missing:
            score = min(score, self.SCORING["confidence_high"] - 1)
            reasons.append("Missing or invalid vehicle fields: " + ", ".join(missing) + ".")
        if any(s["severity"] in {"unobserved", "outside_observed_range"} for s in specification["signals"]):
            score = min(score, self.SCORING["confidence_high"] - 1)
            reasons.append("Some specifications fall outside observed support.")
        if mileage_anomaly["comparison_level"] in {"model_generation", "model", "unsupported"}:
            reasons.append("Mileage comparisons are broad or unavailable.")
        level = "high" if score >= self.SCORING["confidence_high"] else "medium" if score >= self.SCORING["confidence_medium"] else "low"
        return {"market_confidence": level, "confidence_score": float(score), "reasons": reasons,
                "model_observations": int(model_support), "generation_observations": int(gen_support),
                "p10_p90_width": width, "relative_interval_width": relative_width,
                "observed_relative_price_iqr": (
                    (price_anomaly["p75"] - price_anomaly["p25"]) / price_anomaly["p50"]
                    if price_available else None
                )}

    def assess_listing_risk(self, vehicle, prices, model_observations, comparison_rows):
        if "price" not in vehicle:
            raise ValueError("Supply price as the asking price in EUR")
        comparison_level = "model_generation" if vehicle.get("generation") else "model"
        price = self.analyze_price_anomaly(vehicle["price"], prices, comparison_level)
        mileage = self.analyze_mileage_anomaly(vehicle, comparison_rows)
        specification = self.analyze_specification(vehicle, comparison_rows)
        market_support = self.assess_market_support(len(prices))
        confidence = self.assess_market_confidence(vehicle, price, model_observations,
                                                   mileage, specification, market_support)
        support_level = market_support["support_level"]
        assessment_status = "very_rare" if support_level == "very_rare" else (
            "limited_support" if support_level in {"rare", "limited"} else "full")
        if assessment_status == "full" and price["support_level"] != "normal":
            assessment_status = "limited_support"
        message = None
        if support_level == "very_rare":
            group_name = "model/generation" if comparison_level == "model_generation" else "model"
            message = (f"Very limited market data is available for this {group_name}, so a reliable overall "
                       "anomaly assessment cannot be produced.")
            reasons = [message, price["reason"], mileage["reason"]]
            reasons += [f"{s['field']}: {s['reason']}" for s in specification["signals"] if s["severity"] != "normal"]
            reasons += confidence["reasons"]
            return {"scoring_policy_version": SCORING_POLICY_VERSION, "assessment_status": assessment_status,
                    "market_support": market_support, "message": message, "anomaly_score": None, "risk_level": None,
                    "market_confidence": confidence["market_confidence"], "confidence_score": confidence["confidence_score"],
                    "confidence": confidence,
                    "components": {"price_anomaly": {**price, "score": price["price_anomaly_score"]},
                                   "mileage_anomaly": {**mileage, "score": mileage["mileage_anomaly_score"]},
                                   "specification_anomaly": {**specification, "score": specification["specification_anomaly_score"]}},
                    "effective_weights": {}, "reasons": reasons}
        scores = {"price": price["price_anomaly_score"], "mileage": mileage["mileage_anomaly_score"],
                  "specification": specification["specification_anomaly_score"]}
        available = {name: score for name, score in scores.items() if score is not None}
        weight_sum = sum(self.SCORING["weights"][name] for name in available)
        effective_weights = {name: self.SCORING["weights"][name] / weight_sum for name in available}
        total = None
        level = None
        if available:
            total = min(100.0, float(sum(effective_weights[name] * score for name, score in available.items()) +
                                     market_support["rarity_penalty"]))
            level = "high" if total >= self.SCORING["risk_high"] else "medium" if total >= self.SCORING["risk_medium"] else "low"
        else:
            message = "Insufficient evidence for any component; no overall anomaly score is available."
        reasons = [price["reason"], mileage["reason"]]
        reasons += [f"{s['field']}: {s['reason']}" for s in specification["signals"] if s["severity"] != "normal"]
        reasons += confidence["reasons"]
        if available and market_support["rarity_penalty"]:
            reasons.append(f"A {market_support['rarity_penalty']:.2f}-point rarity adjustment was applied to the overall score.")
        return {"scoring_policy_version": SCORING_POLICY_VERSION, "assessment_status": assessment_status,
                "market_support": market_support, "message": message,
                "anomaly_score": total, "risk_level": level, "market_confidence": confidence["market_confidence"],
                "confidence_score": confidence["confidence_score"], "confidence": confidence,
                "components": {"price_anomaly": {**price, "score": price["price_anomaly_score"]},
                               "mileage_anomaly": {**mileage, "score": mileage["mileage_anomaly_score"]},
                               "specification_anomaly": {**specification, "score": specification["specification_anomaly_score"]}},
                "effective_weights": effective_weights, "reasons": reasons}

