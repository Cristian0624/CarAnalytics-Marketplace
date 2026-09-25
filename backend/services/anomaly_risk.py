"""Inference only for the validated V2 anomaly model; no training or database access."""
import gzip
import json
import os
import pickle
from pathlib import Path
from threading import Lock

import numpy as np
import pandas as pd

Q_NAMES = ["p10", "p25", "p50", "p75", "p90"]
MILEAGE_NAMES = ["p05", "p10", "p25", "p50", "p75", "p90", "p95"]
SPEC_FIELDS = ["year", "engine", "fuel_type", "gearbox", "drivetrain", "body_type"]
FEATURES = ["brand", "model", "generation", "year", "mileage", "engine",
            "fuel_type", "gearbox", "drivetrain", "body_type"]
DEFAULT_ARTIFACT_DIR = Path(__file__).resolve().parents[1] / "ML_models/anomaly_risk/artifacts"
SCORING_POLICY_VERSION = "anomaly-risk-v2.3"
SCORING_POLICY = {
    "weights": {"price": 0.75, "mileage": 0.10, "specification": 0.15},
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
                    or metadata["chosen_model_type"] != "multiquantile"
                    or metadata["input_feature_names"] != FEATURES
                    or metadata["feature_names"] != FEATURES
                    or metadata["derived_features"]
                    or metadata["quantiles"] != [.1, .25, .5, .75, .9]
                    or metadata["model_files"] != ["price_quantile_model.cbm"]
                    or metadata.get("scoring_policy_version") != SCORING_POLICY_VERSION):
                raise ValueError("Unsupported model contract")
            from catboost import CatBoostRegressor
            self.model = CatBoostRegressor()
            self.model.load_model(str(directory / "price_quantile_model.cbm"))
            if list(self.model.feature_names_) != FEATURES:
                raise ValueError("Model feature order differs from metadata")
            # These are trusted deployment files, never user-supplied uploads.
            for name in ("mileage_stats", "spec_stats", "market_stats"):
                with gzip.open(directory / (name + ".pkl.gz"), "rb") as handle:
                    setattr(self, name, pickle.load(handle))
            self.metadata = metadata
            self.SCORING = {**metadata["anomaly_scoring_constants"], **SCORING_POLICY}
            self.FEATURES = FEATURES
            self.CATEGORICAL = metadata["categorical_feature_names"]
            self.NUMERIC = metadata["numeric_feature_names"]
            self.MISSING = metadata["missing_category"]
            self.calibration = metadata["calibration_parameters"]
            self._prediction_lock = Lock()
            # Fail during load, rather than midway through the first assessment.
            self.assess_listing_risk({"brand": "Unknown", "model": "Unknown", "price": 10000})
        except Exception as exc:
            raise ModelUnavailableError("Anomaly model could not be loaded") from exc

    def predict_quantiles(self, vehicle_features):
        frame = self.prepare_features(pd.DataFrame([vehicle_features]))
        with self._prediction_lock:
            raw = np.asarray(self.model.predict(frame, thread_count=1), dtype=float)
        if raw.shape != (1, 5) or not np.isfinite(raw).all():
            raise ValueError("Invalid model prediction")
        q = np.maximum(np.sort(raw[0]), self.SCORING["spread_floor"])
        width = max(q[4] - q[0], self.SCORING["spread_floor"])
        q[0] = np.clip(q[0] + self.calibration["p10_delta"] * width,
                       self.SCORING["spread_floor"], q[1])
        q[4] = max(q[4] + self.calibration["p90_delta"] * width, q[3])
        return q

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

    def analyze_price_anomaly(self, vehicle_features, actual_price):
        actual_price = float(actual_price)
        if not np.isfinite(actual_price) or actual_price <= 0:
            raise ValueError("price must be a finite positive asking price in EUR")
        q = self.predict_quantiles(vehicle_features)
        direction = "unusually_cheap" if actual_price < q[0] else "unusually_expensive" if actual_price > q[4] else "normal"
        reason = ("Asking price is below the predicted P10 price." if direction == "unusually_cheap" else
                  "Asking price is above the predicted P90 price." if direction == "unusually_expensive" else
                  "Asking price is close to the expected market median." if q[1] <= actual_price <= q[3] else
                  "Asking price lies within P10-P90, outside the central P25-P75 band.")
        return {"actual_price": actual_price, **dict(zip(Q_NAMES, map(float, q))),
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

    def analyze_mileage_anomaly(self, vehicle):
        v = self.normalized_vehicle(vehicle)
        unknown = {"actual_mileage": None if pd.isna(v["mileage"]) else float(v["mileage"]),
                   "expected_median_mileage": None, **{name: None for name in MILEAGE_NAMES},
                   "mileage_anomaly_score": None, "direction": "unknown", "sample_size": 0,
                   "comparison_level": "unsupported", "reason": "Insufficient mileage comparison data."}
        if pd.isna(v["mileage"]):
            return {**unknown, "reason": "Mileage is missing or invalid; no mileage score is available."}
        key = (v["brand"], v["model"], v["generation"])
        candidates = []
        if v["generation"] != self.MISSING:
            if pd.notna(v["year"]):
                candidates += [(name, key + (int(v["year"]),)) for name in ["exact_year", "nearby_years"]]
            candidates.append(("model_generation", key))
        candidates.append(("model", key[:2]))
        for level, group_key in candidates:
            stats = self.mileage_stats[level].get(group_key)
            if not stats or stats["sample_size"] < self.SCORING["mileage_min_samples"]:
                continue
            actual = float(v["mileage"])
            direction = "unusually_low" if actual < stats["p10"] else "unusually_high" if actual > stats["p90"] else "normal"
            reason = ("Mileage is unusually low relative to observed listings for similar vehicles." if direction == "unusually_low" else
                      "Mileage is unusually high relative to observed listings for similar vehicles." if direction == "unusually_high" else
                      "Mileage is within the observed P10-P90 range for similar vehicles.")
            if level in {"model_generation", "model"}:
                reason += " The fallback group mixes production years."
            return {"actual_mileage": actual, "expected_median_mileage": stats["p50"], **stats,
                    "mileage_anomaly_score": self.mileage_anomaly_score(actual, stats),
                    "direction": direction, "comparison_level": level, "reason": reason}
        return unknown

    def analyze_specification(self, vehicle):
        v = self.normalized_vehicle(vehicle)
        group = self.spec_stats.get((v["brand"], v["model"], v["generation"]), {})
        signals, scores, supports = [], [], []
        for field in SPEC_FIELDS:
            value = v[field]
            data = group.get(field, {"sample_size": 0, "counts": {}})
            n, counts = int(data["sample_size"]), data["counts"]
            signal = {"field": field, "value": None if pd.isna(value) or value == self.MISSING else value,
                      "frequency": None, "sample_size": n, "severity": "unsupported", "score": None,
                      "reason": "Insufficient observations for this model and generation."}
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
                    reason = f"Year is outside the observed generation-year range {int(min(counts))}-{int(max(counts))}; verify the entry."
                elif matches == 0:
                    severity = "unobserved"
                    reason = "This value is unsupported by the observed values for this model and generation."
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

    def assess_market_support(self, vehicle):
        """Describe evidence for the exact brand, model and generation group."""
        v = self.normalized_vehicle(vehicle)
        key = (v["brand"], v["model"], v["generation"])
        generation = self.market_stats["generation"].get(key, {}) if v["generation"] != self.MISSING else {}
        observations = int(generation.get("sample_size", 0))
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

    def assess_market_confidence(self, vehicle, price_anomaly=None, mileage_anomaly=None,
                                 specification=None, market_support=None):
        v = self.normalized_vehicle(vehicle)
        if price_anomaly is None:
            price_anomaly = dict(zip(Q_NAMES, map(float, self.predict_quantiles(v))))
        if mileage_anomaly is None:
            mileage_anomaly = self.analyze_mileage_anomaly(v)
        if specification is None:
            specification = self.analyze_specification(v)
        if market_support is None:
            market_support = self.assess_market_support(v)
        key = (v["brand"], v["model"], v["generation"])
        model_support = self.market_stats["model"].get(key[:2], {}).get("sample_size", 0)
        gen_stats = self.market_stats["generation"].get(key, {}) if v["generation"] != self.MISSING else {}
        gen_support = gen_stats.get("sample_size", 0)
        width = float(price_anomaly["p90"] - price_anomaly["p10"])
        relative_width = width / max(price_anomaly["p50"], self.SCORING["spread_floor"])
        supports = [model_support, gen_support, mileage_anomaly["sample_size"], specification["sample_size"]]
        limits = [self.SCORING[f"confidence_{name}_support"] for name in ["model", "generation", "mileage", "spec"]]
        evidence = [min(n / limit, 1.0) for n, limit in zip(supports, limits)]
        evidence[3] *= specification["supported_fields"] / len(SPEC_FIELDS)
        precision = 1 / (1 + relative_width / self.SCORING["confidence_relative_width_scale"])
        score = 100 * (0.15 * evidence[0] + 0.25 * evidence[1] + 0.15 * evidence[2] + 0.15 * evidence[3] + 0.30 * precision)
        reasons = [f"{model_support} model observations; {gen_support} model and generation observations.",
                   f"Predicted P10-P90 width is {width:.0f} EUR ({relative_width:.0%} of P50)."]
        unknown = [col for col in self.CATEGORICAL if v[col] != self.MISSING and v[col] not in self.market_stats["known_categories"][col]]
        missing = [col for col in self.FEATURES if pd.isna(v[col]) or v[col] == self.MISSING]
        if market_support["support_level"] == "very_rare":
            score = min(score, self.SCORING["confidence_medium"] - 1)
            reasons.append("Very limited market data is available for this model and generation.")
        elif market_support["support_level"] == "rare":
            score = min(score, self.SCORING["confidence_medium"] - 1)
            reasons.append("Market confidence is low because this model and generation have rare training support.")
        elif market_support["support_level"] == "limited":
            score = min(score, self.SCORING["confidence_high"] - 1)
            reasons.append("Market confidence is capped at medium because this model and generation have limited training support.")
        elif unknown:
            score = min(score, self.SCORING["confidence_medium"] - 1)
            reasons.append("Market confidence is low because one or more categorical inputs are outside training support.")
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
                "observed_relative_price_iqr": gen_stats.get("relative_price_iqr")}

    def assess_listing_risk(self, vehicle):
        if "price" not in vehicle:
            raise ValueError("Supply price as the asking price in EUR")
        price = self.analyze_price_anomaly(vehicle, vehicle["price"])
        mileage = self.analyze_mileage_anomaly(vehicle)
        specification = self.analyze_specification(vehicle)
        market_support = self.assess_market_support(vehicle)
        confidence = self.assess_market_confidence(vehicle, price, mileage, specification, market_support)
        support_level = market_support["support_level"]
        assessment_status = "very_rare" if support_level == "very_rare" else (
            "limited_support" if support_level in {"rare", "limited"} else "full")
        message = None
        if support_level == "very_rare":
            message = ("Very limited market data is available for this model/generation, so a reliable overall "
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
        total = min(100.0, float(sum(effective_weights[name] * score for name, score in available.items()) +
                                 market_support["rarity_penalty"]))
        level = "high" if total >= self.SCORING["risk_high"] else "medium" if total >= self.SCORING["risk_medium"] else "low"
        reasons = [price["reason"], mileage["reason"]]
        reasons += [f"{s['field']}: {s['reason']}" for s in specification["signals"] if s["severity"] != "normal"]
        reasons += confidence["reasons"]
        if market_support["rarity_penalty"]:
            reasons.append(f"A {market_support['rarity_penalty']:.2f}-point rarity adjustment was applied to the overall score.")
        return {"scoring_policy_version": SCORING_POLICY_VERSION, "assessment_status": assessment_status,
                "market_support": market_support, "message": message,
                "anomaly_score": total, "risk_level": level, "market_confidence": confidence["market_confidence"],
                "confidence_score": confidence["confidence_score"], "confidence": confidence,
                "components": {"price_anomaly": {**price, "score": price["price_anomaly_score"]},
                               "mileage_anomaly": {**mileage, "score": mileage["mileage_anomaly_score"]},
                               "specification_anomaly": {**specification, "score": specification["specification_anomaly_score"]}},
                "effective_weights": effective_weights, "reasons": reasons}

