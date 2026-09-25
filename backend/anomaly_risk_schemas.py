"""Public contract for asking-price anomaly assessments in EUR."""
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Category = Annotated[str, Field(min_length=1, max_length=200)]
Score = Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]
Level = Literal["low", "medium", "high"]
AssessmentStatus = Literal["full", "limited_support", "very_rare"]
SupportLevel = Literal["normal", "limited", "rare", "very_rare"]


class AnomalyRiskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)

    brand: Category
    model: Category
    generation: Category | None = None
    year: int | None = Field(default=None, ge=1886)
    mileage: int | None = Field(default=None, ge=0, le=10_000_000)
    engine: float | None = Field(default=None, ge=0, le=20)
    fuel_type: Category | None = None
    gearbox: Category | None = None
    drivetrain: Category | None = None
    body_type: Category | None = None
    price: float = Field(gt=0, description="Asking price in EUR; never an input to the price model.")

    @model_validator(mode="after")
    def validate_year(self):
        if self.year is not None and self.year > date.today().year + 1:
            raise ValueError("year cannot exceed next calendar year")
        return self


class Confidence(BaseModel):
    market_confidence: Level
    confidence_score: Score
    reasons: list[str]
    model_observations: int
    generation_observations: int
    p10_p90_width: float
    relative_interval_width: float
    observed_relative_price_iqr: float | None


class PriceAnomaly(BaseModel):
    actual_price: float
    p10: float
    p25: float
    p50: float
    p75: float
    p90: float
    deviation_from_p50_pct: float
    direction: Literal["unusually_cheap", "unusually_expensive", "normal"]
    price_anomaly_score: Score
    score: Score
    reason: str


class MileageAnomaly(BaseModel):
    actual_mileage: float | None
    expected_median_mileage: float | None
    p05: float | None
    p10: float | None
    p25: float | None
    p50: float | None
    p75: float | None
    p90: float | None
    p95: float | None
    mileage_anomaly_score: Score | None
    score: Score | None
    direction: Literal["unknown", "unusually_low", "unusually_high", "normal"]
    sample_size: int
    comparison_level: Literal["unsupported", "exact_year", "nearby_years", "model_generation", "model"]
    reason: str


class SpecificationSignal(BaseModel):
    field: str
    value: str | float | None
    frequency: float | None
    sample_size: int
    severity: str
    score: Score | None
    reason: str


class SpecificationAnomaly(BaseModel):
    specification_anomaly_score: Score | None
    score: Score | None
    sample_size: int
    supported_fields: int
    signals: list[SpecificationSignal]


class Components(BaseModel):
    price_anomaly: PriceAnomaly
    mileage_anomaly: MileageAnomaly
    specification_anomaly: SpecificationAnomaly


class MarketSupport(BaseModel):
    model_generation_observations: int = Field(ge=0)
    support_level: SupportLevel
    rarity_penalty: float = Field(ge=0, le=10)


class AnomalyRiskResponse(BaseModel):
    currency: Literal["EUR"] = "EUR"
    model_version: str
    scoring_policy_version: str
    assessment_status: AssessmentStatus
    market_support: MarketSupport
    message: str | None
    interpretation: str = "Anomaly scores identify unusual listings; they are not fraud probabilities."
    anomaly_score: Score | None
    risk_level: Level | None
    market_confidence: Level
    confidence_score: Score
    confidence: Confidence
    components: Components
    effective_weights: dict[str, float]
    reasons: list[str]
