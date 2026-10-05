"""Database comparisons using the existing anomaly scoring curves."""
import json
import os
from collections import Counter
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

Q_NAMES = ["p10", "p25", "p50", "p75", "p90"]
MILEAGE_NAMES = ["p05", "p10", "p25", "p50", "p75", "p90", "p95"]
SPEC_FIELDS = ["year", "engine", "fuel_type", "gearbox", "drivetrain", "body_type"]
FEATURES = ["brand", "model", "generation", "year", "mileage", "engine",
            "fuel_type", "gearbox", "drivetrain", "body_type"]
DEFAULT_ARTIFACT_DIR = Path(__file__).resolve().parents[1] / "ML_models/anomaly_risk/artifacts"
DEFAULT_RUNTIME_CONFIG_PATH = Path(__file__).with_name("anomaly_risk_config.json")
SCORING_POLICY_VERSION = "anomaly-risk-v2.18-young-mileage"
SCORING_POLICY = {
    "weights": {"price": 0.60, "mileage": 0.25, "specification": 0.15},
    "risk_medium": 30.0,
    "risk_medium_high": 50.0,
    "risk_high": 66.0,
    "extreme_min_samples": 25,
    "extreme_overall_floor": 80.0,
    "extreme_min_median_deviation": 0.45,
    "mileage_extreme_min_deviation": 0.65,
    "mileage_extreme_floor": 60.0,
    "price_extreme_transition": 0.10,
    "mileage_extreme_transition": 0.15,
    "young_mileage_score_factor": 0.35,
    "young_mileage_full_leniency_age": 3.0,
    "young_mileage_normal_age": 5.0,
    "extreme_support_start": 15,
    "joint_min_deviation": 0.15,
    "joint_strong_deviation": 0.25,
    "joint_balance_tolerance": 0.30,
    "joint_penalty_max": 6.0,
    "joint_reduction_max": 20.0,
    "joint_reduction_fraction": 0.25,
    "mileage_min_samples": 20,
    "spec_min_samples": 25,
    "mileage_curve": "p50=0,p25/p75=10,p10/p90=20,p05/p95=40,broader_exponential_tail_to_100",
    "support_thresholds": {"very_rare_max": 4, "rare_max": 14, "limited_max": 29},
    "rarity_penalties": {"rare_max": 8.0, "limited_max": 4.0},
}


class ModelUnavailableError(RuntimeError):
    """Missing, incompatible or unreadable deployment artifacts."""


class AnomalyRiskService:
    def __init__(self, artifact_dir=None):
        configured_dir = artifact_dir or os.getenv("ANOMALY_RISK_ARTIFACT_DIR")
        metadata_path = (Path(configured_dir) / "model_metadata.json"
                         if configured_dir else DEFAULT_RUNTIME_CONFIG_PATH)
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            if (metadata["model_version"] != "anomaly-risk-v2"
                    or metadata["input_feature_names"] != FEATURES
                    or metadata["feature_names"] != FEATURES
                    or metadata["derived_features"]
                    or metadata.get("scoring_policy_version") != "anomaly-risk-v2.3"):
                raise ValueError("Unsupported scoring configuration contract")
            self.metadata = {"model_version": metadata["model_version"]}
            self.SCORING = {**metadata["anomaly_scoring_constants"], **SCORING_POLICY}
            self.FEATURES = FEATURES
            self.CATEGORICAL = metadata["categorical_feature_names"]
            self.NUMERIC = metadata["numeric_feature_names"]
            self.MISSING = metadata["missing_category"]
        except Exception as exc:
            raise ModelUnavailableError("Anomaly scoring configuration could not be loaded") from exc

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
        smoothly using a broader tail and a median-relative minimum. This preserves
        a high score for truly extreme mileage while keeping modest P95 exceedance
        in the supporting-signal range.
        """
        p05, p10, p25, p50, p75, p90, p95 = (float(stats[name]) for name in MILEAGE_NAMES)
        if actual >= p50:
            points = ((p50, 0.0), (p75, 10.0), (p90, 20.0), (p95, 40.0))
        else:
            points = ((p50, 0.0), (p25, 10.0), (p10, 20.0), (p05, 40.0))
        # A nearly identical reference group must not make a few extra km unusual.
        side = 1 if actual >= p50 else -1
        minimum_distances = (0.05, 0.10, 0.20)
        points = [(p50, 0.0)] + [
            (p50 + side * max(abs(point - p50), p50 * minimum, self.SCORING["spread_floor"]), score)
            for (point, score), minimum in zip(points[1:], minimum_distances)
        ]
        value = float(actual)
        for (near, near_score), (far, far_score) in zip(points, points[1:]):
            if min(near, far) <= value <= max(near, far):
                span = max(abs(far - near), self.SCORING["spread_floor"])
                return float(near_score + (far_score - near_score) * abs(value - near) / span)
        boundary, boundary_score = points[-1]
        tail_span = max(2 * (abs(p95 - p90) if value >= p50 else abs(p10 - p05)),
                        p50 * 0.40, (p95 - p05) * 0.50,
                        self.SCORING["spread_floor"])
        return float(boundary_score + (100 - boundary_score) *
                     (1 - np.exp(-abs(value - boundary) / tail_span)))

    def normalized_vehicle(self, vehicle):
        return self.prepare_features(pd.DataFrame([vehicle])).iloc[0].to_dict()

    def low_mileage_age_adjustment(self, year):
        """Retain 35% of low-mileage severity through age three, then fade to five.

        Production year gives an approximate age. Missing years keep the existing
        policy; next-year vehicles allowed by the request schema count as age zero.
        This adjusts severity only, never the selected comparison pool or median.
        """
        if year is None or pd.isna(year):
            return None, 1.0
        age = max(0, date.today().year - int(year))
        start = self.SCORING["young_mileage_full_leniency_age"]
        end = self.SCORING["young_mileage_normal_age"]
        progress = float(np.clip((age - start) / (end - start), 0, 1))
        minimum = self.SCORING["young_mileage_score_factor"]
        return age, minimum + (1 - minimum) * progress

    def analyze_mileage_anomaly(self, vehicle, comparison_rows):
        v = self.normalized_vehicle(vehicle)
        unknown = {"actual_mileage": None if pd.isna(v["mileage"]) else float(v["mileage"]),
                   "expected_median_mileage": None, **{name: None for name in MILEAGE_NAMES},
                   "mileage_anomaly_score": None, "direction": "unknown", "sample_size": 0,
                   "comparison_level": "unsupported", "reason": "Insufficient mileage comparison data."}
        if pd.isna(v["mileage"]):
            return {**unknown, "reason": "Mileage is missing or invalid; no mileage score is available."}
        reference = self.prepare_features(pd.DataFrame(comparison_rows))
        # The repository already selects the complete model/generation group.
        # Do not shrink that group again based on the supplied production year.
        comparison_level = "model_generation" if v["generation"] != self.MISSING else "model"
        candidates = [(comparison_level, reference["mileage"])]

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
            age, age_factor = self.low_mileage_age_adjustment(v["year"])
            if actual >= stats["p50"]:
                age_factor = 1.0
            if age_factor < 1:
                reason += f" Low-mileage severity is reduced for this approximately {age}-year-old vehicle."
            return {"actual_mileage": actual, "expected_median_mileage": stats["p50"], **stats,
                    "mileage_anomaly_score": self.mileage_anomaly_score(actual, stats) * age_factor,
                    "vehicle_age_years": age, "age_adjustment_factor": age_factor,
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

    def assess_market_confidence(self, vehicle, price_anomaly, model_observations, mileage_anomaly,
                                 specification, market_support):
        v = self.normalized_vehicle(vehicle)
        gen_support = market_support["model_generation_observations"]
        # Both evidence terms refer to the selected group, never other generations.
        model_support = gen_support
        price_available = price_anomaly["price_anomaly_score"] is not None
        width = None
        relative_width = None
        precision = 0.0
        if price_available:
            width = float(price_anomaly["p90"] - price_anomaly["p10"])
            relative_width = width / max(price_anomaly["p50"], self.SCORING["spread_floor"])
            precision = 1 / (1 + relative_width / self.SCORING["confidence_relative_width_scale"])
        # Price percentiles now come directly from the selected database group.
        # Scale confidence to that group's size instead of the old 100-200 row
        # support targets, which made a useful 29-listing group appear weak.
        if gen_support <= 15:
            support_score = 2.8 * gen_support
            ceiling = self.SCORING["confidence_medium"] - 1
        elif gen_support <= 40:
            support_score = self.SCORING["confidence_medium"] + 27 * (gen_support - 16) / 24
            ceiling = self.SCORING["confidence_high"] - 1
        else:
            support_score = self.SCORING["confidence_high"] + 20 * (1 - np.exp(-(gen_support - 40) / 40))
            ceiling = 100

        # Spread and available component evidence refine the score, but cannot
        # promote a small group into a higher confidence band on their own.
        quality_bonus = 4 * precision
        if mileage_anomaly["mileage_anomaly_score"] is not None:
            quality_bonus += 1.5
        quality_bonus += 1.5 * specification["supported_fields"] / len(SPEC_FIELDS)
        score = round(min(support_score + quality_bonus, ceiling), 1)
        group_name = "model and generation" if v["generation"] != self.MISSING else "model"
        reasons = [f"{gen_support} current database listings in the selected {group_name} comparison group."]
        if price_available:
            reasons.append(f"Observed database P10-P90 width is {width:.0f} EUR ({relative_width:.0%} of P50).")
        if price_anomaly["support_level"] == "insufficient":
            reasons.append("Fewer than 10 exact database comparisons; price assessment is unavailable.")
        elif price_anomaly["support_level"] == "limited":
            reasons.append("Price confidence is limited by fewer than 20 exact database comparisons.")
        missing = [col for col in self.FEATURES if pd.isna(v[col]) or v[col] == self.MISSING]
        if market_support["support_level"] == "very_rare":
            reasons.append(f"Very limited market data is available for this {group_name} group.")
        elif market_support["support_level"] == "rare":
            reasons.append(f"Market confidence is low because this {group_name} group has few current listings.")
        elif market_support["support_level"] == "limited":
            reasons.append(f"The selected {group_name} group has limited current listings.")
        if missing:
            reasons.append("Missing or invalid vehicle fields: " + ", ".join(missing) + ".")
        if any(s["severity"] in {"unobserved", "outside_observed_range"} for s in specification["signals"]):
            score = min(score, self.SCORING["confidence_high"] - 1)
            reasons.append("Some specifications fall outside observed support.")
        if mileage_anomaly["mileage_anomaly_score"] is None:
            reasons.append("Mileage scoring is unavailable for the supplied input and selected group.")
        level = "high" if score >= self.SCORING["confidence_high"] else "medium" if score >= self.SCORING["confidence_medium"] else "low"
        return {"market_confidence": level, "confidence_score": float(score), "reasons": reasons,
                "model_observations": int(model_support), "generation_observations": int(gen_support),
                "p10_p90_width": width, "relative_interval_width": relative_width,
                "observed_relative_price_iqr": (
                    (price_anomaly["p75"] - price_anomaly["p25"]) / price_anomaly["p50"]
                    if price_available else None
                )}

    def extreme_anomaly_flag(self, component, actual, median, score, count):
        """Flag a supported median deviation independently of the percentile score.

        The relative-distance guard avoids alerts for tiny differences when
        observed percentile bands are nearly identical. Qualifying flags allow
        the overall assessment to bypass the weighted average.
        """
        if (score is None
                or count < self.SCORING["extreme_min_samples"]
                or actual is None or median is None or median <= 0):
            return None
        threshold = (self.SCORING["mileage_extreme_min_deviation"] if component == "mileage"
                     else self.SCORING["extreme_min_median_deviation"])
        if abs(actual - median) / median <= threshold:
            return None
        direction = "low" if actual < median else "high"
        return f"extreme_{component}_{direction}"

    def extreme_override_score(self, actual, median, component="price"):
        """Price retains its curve; mileage starts lower and rises more slowly."""
        deviation = abs(actual - median) / median
        threshold = self.SCORING["extreme_min_median_deviation"]
        floor = self.SCORING["extreme_overall_floor"]
        end = 1.0
        if component == "mileage":
            threshold = self.SCORING["mileage_extreme_min_deviation"]
            floor = self.SCORING["mileage_extreme_floor"]
            # Near-zero mileage remains extreme; high mileage gets more latitude.
            end = 1.0 if actual < median else 2.0
        progress = min(1.0, max(0.0, (deviation - threshold) / (end - threshold)))
        return float(floor + (100.0 - floor) * progress)

    def extreme_support_strength(self, count):
        """Fade support in below 25 instead of discarding an available score."""
        start = self.SCORING["extreme_support_start"]
        end = self.SCORING["extreme_min_samples"]
        return float(np.clip((count - start) / (end - start), 0, 1))

    def extreme_transition_strength(self, component, actual, median, score, count):
        if score is None or actual is None or median is None or median <= 0:
            return 0.0
        threshold = (self.SCORING["mileage_extreme_min_deviation"] if component == "mileage"
                     else self.SCORING["extreme_min_median_deviation"])
        deviation = abs(actual - median) / median
        width = self.SCORING[f"{component}_extreme_transition"]
        distance_strength = float(np.clip((deviation - threshold) / width, 0, 1))
        return distance_strength * self.extreme_support_strength(count)

    def price_mileage_context(self, price, mileage):
        """A bounded inverse-price/mileage heuristic, never a fitted price model.

        Multiply each value divided by its median: reciprocal changes give one.
        Only moderate, supported changes can soften an override. Extreme values
        cannot cancel each other simply because their product happens to be one.
        """
        context = {"relation": "unavailable", "price_ratio": None, "mileage_ratio": None,
                   "balance_deviation": None, "coherence_strength": 0.0,
                   "joint_penalty": 0.0, "joint_reduction": 0.0}
        if (price["price_anomaly_score"] is None or mileage["mileage_anomaly_score"] is None
                or price["count"] < self.SCORING["mileage_min_samples"]
                or mileage["sample_size"] < self.SCORING["mileage_min_samples"]
                or not price["p50"] or not mileage["expected_median_mileage"]):
            return context
        price_ratio = price["actual_price"] / price["p50"]
        mileage_ratio = mileage["actual_mileage"] / mileage["expected_median_mileage"]
        balance = abs(price_ratio * mileage_ratio - 1.0)
        context.update(price_ratio=float(price_ratio), mileage_ratio=float(mileage_ratio),
                       balance_deviation=float(balance), relation="not_applicable")
        deviations = (price_ratio - 1.0, mileage_ratio - 1.0)
        smaller_deviation = min(map(abs, deviations))
        larger_deviation = max(map(abs, deviations))
        # One clear deviation can bring a smaller, meaningful counterpart into
        # the joint check. Two small changes still use the ordinary calculation.
        if (smaller_deviation < self.SCORING["joint_min_deviation"]
                or larger_deviation < self.SCORING["joint_strong_deviation"]):
            return context
        opposite = deviations[0] * deviations[1] < 0
        moderate = 0.40 <= price_ratio <= 2.50 and 0.35 <= mileage_ratio <= 2.50
        if opposite and moderate and balance <= self.SCORING["joint_balance_tolerance"]:
            context["relation"] = "consistent_opposite"
            context["coherence_strength"] = self.price_mileage_coherence_strength(
                price_ratio, mileage_ratio, balance, smaller_deviation, larger_deviation,
            )
            context["joint_penalty"] = round(self.SCORING["joint_penalty_max"] *
                                             min(1.0, min(map(abs, deviations))) *
                                             self.extreme_support_strength(min(price["count"], mileage["sample_size"])) *
                                             context["coherence_strength"], 2)
        else:
            context["relation"] = "inconsistent"
        return context

    def price_mileage_coherence_strength(self, price_ratio, mileage_ratio, balance,
                                        smaller_deviation, larger_deviation):
        """Keep clear pairs intact, but fade compensation at each existing guard."""
        activation_strength = min(
            (smaller_deviation - self.SCORING["joint_min_deviation"]) / 0.05,
            (larger_deviation - self.SCORING["joint_strong_deviation"]) / 0.10,
        )
        balance_strength = (self.SCORING["joint_balance_tolerance"] - balance) / 0.10
        boundary_strength = min(
            price_ratio - 0.40, 2.50 - price_ratio,
            mileage_ratio - 0.35, 2.50 - mileage_ratio,
        ) / 0.10
        strength = float(np.clip(min(activation_strength, balance_strength, boundary_strength), 0, 1))
        return round(strength, 12)

    def price_mileage_reduction(self, context, price, mileage, weighted_contribution):
        """Credit a balanced cheaper/high-mileage pair without erasing anomalies."""
        if (context["relation"] != "consistent_opposite"
                or context["price_ratio"] >= 1 or context["mileage_ratio"] <= 1
                or price["flag"] or mileage["flag"]):
            return 0.0
        deviations = (1 - context["price_ratio"], context["mileage_ratio"] - 1)
        # Fade in beyond the activation thresholds instead of subtracting a
        # fixed amount as soon as a pair barely qualifies.
        smaller_strength = min(1.0, max(0.0,
            (min(deviations) - self.SCORING["joint_min_deviation"]) / 0.05))
        larger_strength = min(1.0, max(0.0,
            (max(deviations) - self.SCORING["joint_strong_deviation"]) / 0.10))
        balance_strength = max(0.0, 1 - context["balance_deviation"] /
                               self.SCORING["joint_balance_tolerance"])
        reduction = (self.SCORING["joint_reduction_max"] * balance_strength
                     * smaller_strength * larger_strength)
        # Withdraw the credit gradually near an extreme boundary, so setting
        # the flag cannot suddenly remove the entire discount.
        extreme_margin = min(
            self.SCORING["extreme_min_median_deviation"] - deviations[0],
            self.SCORING["mileage_extreme_min_deviation"] - deviations[1],
        )
        boundary_strength = float(np.clip(extreme_margin / 0.05, 0, 1))
        support_strength = self.extreme_support_strength(min(price["count"], mileage["sample_size"]))
        bounded_reduction = min(reduction, weighted_contribution * self.SCORING["joint_reduction_fraction"])
        return float(bounded_reduction * boundary_strength * support_strength * context["coherence_strength"])

    def combine_component_scores(self, scores, price, mileage, rarity_penalty):
        available = {name: score for name, score in scores.items() if score is not None}
        weight_sum = sum(self.SCORING["weights"][name] for name in available)
        weights = {name: self.SCORING["weights"][name] / weight_sum for name in available}
        context = self.price_mileage_context(price, mileage)
        context.update(mode="weighted", weighted_score=None, override_scores={}, extreme_score=None,
                       extreme_strength=0.0, applied_rarity_penalty=float(rarity_penalty))
        if not available:
            return None, weights, context
        extremes = {}
        strengths = {}
        for name, item, actual, median in (
            ("price", price, price["actual_price"], price["p50"]),
            ("mileage", mileage, mileage["actual_mileage"], mileage["expected_median_mileage"]),
        ):
            count = item["count"] if name == "price" else item["sample_size"]
            age_factor = item.get("age_adjustment_factor", 1.0) if name == "mileage" else 1.0
            strength = self.extreme_transition_strength(name, actual, median, available.get(name), count)
            strength *= age_factor
            strength *= 1 - context["coherence_strength"]
            if strength > 0:
                target = max(available[name], self.extreme_override_score(actual, median, name) * age_factor)
                # Keep a single displayed score, with no downward jump when the
                # empirical score is already higher than the deviation curve.
                available[name] += strength * (target - available[name])
                item[f"{name}_anomaly_score"] = available[name]
                extremes[name] = available[name]
                strengths[name] = strength
        weighted = float(sum(weights[name] * score for name, score in available.items()))
        context["weighted_score"] = weighted
        if context["relation"] == "consistent_opposite":
            context["mode"] = "contextual_weighted"
            pair_contribution = sum(weights[name] * available[name] for name in ("price", "mileage"))
            context["joint_reduction"] = self.price_mileage_reduction(
                context, price, mileage, pair_contribution,
            )
        joint_penalty = context["joint_penalty"]
        joint_reduction = context["joint_reduction"]
        total = min(100.0, max(0.0, weighted + rarity_penalty + joint_penalty - joint_reduction))
        if extremes:
            context["override_scores"] = extremes
            if any(strength < 1 for strength in strengths.values()):
                context.update(mode="blended", extreme_strength=max(strengths.values()))
            # Evaluate both possible anchors. Choosing the strongest blended
            # result avoids a jump when the dominant component changes.
            best_total = total
            best_weights = weights
            for primary in extremes:
                extreme_weights = dict.fromkeys(available, 0.0)
                extreme_weights[primary] = 1.0
                secondary = "mileage" if primary == "price" else "price"
                if available.get(secondary, 0) > 0:
                    extreme_weights[secondary] = 0.05
                severity = min(100.0, sum(extreme_weights[name] * available[name] for name in available))
                context["extreme_score"] = max(context["extreme_score"] or 0, severity)
                strength = strengths[primary]
                candidate_weights = {name: (1 - strength) * weights[name] + strength * extreme_weights[name]
                                     for name in available}
                applied_penalty = (1 - strength) * rarity_penalty
                candidate = (sum(candidate_weights[name] * available[name] for name in available) + applied_penalty
                             + (1 - strength) * (joint_penalty - joint_reduction))
                candidate = min(100.0, max(0.0, float(candidate)))
                if candidate > best_total or (strength == 1 and candidate == best_total):
                    best_total, best_weights = candidate, candidate_weights
                    context.update(mode="extreme" if strength == 1 else "blended",
                                   extreme_strength=strength, applied_rarity_penalty=applied_penalty,
                                   extreme_score=severity, joint_penalty=(1 - strength) * joint_penalty,
                                   joint_reduction=(1 - strength) * joint_reduction)
            total, weights = best_total, best_weights
        return total, weights, context

    def assess_listing_risk(self, vehicle, prices, model_observations, comparison_rows):
        if "price" not in vehicle:
            raise ValueError("Supply price as the asking price in EUR")
        comparison_level = "model_generation" if vehicle.get("generation") else "model"
        price = self.analyze_price_anomaly(vehicle["price"], prices, comparison_level)
        mileage = self.analyze_mileage_anomaly(vehicle, comparison_rows)
        specification = self.analyze_specification(vehicle, comparison_rows)
        price["flag"] = self.extreme_anomaly_flag(
            "price", price["actual_price"], price["p50"], price["price_anomaly_score"], price["count"]
        )
        mileage["flag"] = self.extreme_anomaly_flag(
            "mileage", mileage["actual_mileage"], mileage["expected_median_mileage"],
            mileage["mileage_anomaly_score"], mileage["sample_size"]
        )
        if mileage.get("age_adjustment_factor", 1.0) < 1:
            # A young car's low mileage alone must not carry an extreme alert.
            mileage["flag"] = None
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
        partial = (vehicle.get("mileage") is not None and mileage["mileage_anomaly_score"] is None
                   and price["price_anomaly_score"] is not None)
        if partial:
            assessment_status = "partial"
            total, effective_weights, context = None, {}, None
            message = "Price was evaluated, but the supplied mileage lacks 20 comparisons; no overall verdict is available."
        else:
            total, effective_weights, context = self.combine_component_scores(
                scores, price, mileage, market_support["rarity_penalty"]
            )
        level = None
        if total is not None:
            market_support["rarity_penalty"] = context.get("applied_rarity_penalty", market_support["rarity_penalty"])
            if context["mode"] == "extreme":
                market_support["rarity_penalty"] = 0.0
                contributors = [name for name, weight in effective_weights.items() if weight > 0]
                message = "Supported anomaly signals determine the overall score: " + ", ".join(contributors)
            elif context["mode"] == "blended":
                message = "Extreme contributions strengthen gradually with deviation and comparison support."
            elif context["mode"] == "contextual_weighted":
                message = ("Balanced lower price/higher mileage applies a bounded reduction to the weighted score."
                           if context["joint_reduction"] > 0 else
                           "Opposite moderate price/mileage deviations retain normal weights with a small joint adjustment.")
            elif context["override_scores"]:
                message = "Supported anomalies are evaluated together; the weighted result is retained because it is higher."
            if total >= self.SCORING["risk_high"]:
                level = "high"
            elif total >= self.SCORING["risk_medium_high"]:
                level = "medium_high"
            elif total >= self.SCORING["risk_medium"]:
                level = "medium"
            else:
                level = "low"
        elif not partial:
            message = "Insufficient evidence for any component; no overall anomaly score is available."
        reasons = [price["reason"], mileage["reason"]]
        reasons += [f"{s['field']}: {s['reason']}" for s in specification["signals"] if s["severity"] != "normal"]
        reasons += confidence["reasons"]
        if message and total is not None:
            reasons.append(message)
        if total is not None and market_support["rarity_penalty"]:
            reasons.append(f"A {market_support['rarity_penalty']:.2f}-point rarity adjustment was applied to the overall score.")
        return {"scoring_policy_version": SCORING_POLICY_VERSION, "assessment_status": assessment_status,
                "market_support": market_support, "message": message,
                "anomaly_score": total, "risk_level": level, "market_confidence": confidence["market_confidence"],
                "confidence_score": confidence["confidence_score"], "confidence": confidence,
                "scoring_context": context,
                "components": {"price_anomaly": {**price, "score": price["price_anomaly_score"]},
                               "mileage_anomaly": {**mileage, "score": mileage["mileage_anomaly_score"]},
                               "specification_anomaly": {**specification, "score": specification["specification_anomaly_score"]}},
                "effective_weights": effective_weights, "reasons": reasons}

