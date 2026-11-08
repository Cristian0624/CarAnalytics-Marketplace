# Software Requirements Specification & Traceability Matrix

> **Coursework**: Software Engineering (UTM / Allied Testing)  
> **Topic**: Chapter 11 — Requirements Traceability & The Traceability Seed  
> **Project**: CarAnalytics-Marketplace  
> **Repository**: [Cristian0624/CarAnalytics-Marketplace](https://github.com/Cristian0624/CarAnalytics-Marketplace)  
> **Author**: Dan Rotari (Team: Dan Rotari, Gluhu Cristian, Stamati Mihai, el1xcs)  

---

## 1. Overview & Traceability Seed Policy

In accordance with **Chapter 11 (Agile Requirements & Traceability)**, this document establishes the *Traceability Seed* connecting high-level software requirements and user stories to implementation commits, architectural components, and automated verification suites.

### Traceability Convention
- Each requirement is assigned a unique identifier formatted as: `REQ-<CATEGORY>-<ID>`.
- Every commit that implements, enhances, or verifies a requirement includes the requirement ID in its commit subject or message body (e.g. `[REQ-FLT-02] ...` or `feat(REQ-FLT-02): ...`).
- Bidirectional traceability is maintained:
  - **Forward Traceability**: Requirement Document &rarr; Source Code Modules &rarr; Automated Test Suites &rarr; Commit Log.
  - **Backward Traceability**: Commit Hashes &rarr; Code Changes &rarr; Requirements Document.

---

## 2. Traceability Matrix

| Requirement ID | Requirement Title | Category | Priority | Status | Traced Commit | Verification Suite |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-FLT-02** | **Touch-Optimized Mobile Filter Drawer with Balanced Presets & Sticky Dock** | UI / Mobile UX | High | **Shipped** | *Current Commit* | `tests/listingFilters.test.js` (2 tests) |
| **REQ-SCR-01** | Deal Evaluation Score Calibration (15%–18% Plateau, Max 80 Score) | Algorithm / Eval | High | **Shipped** | `98b9fc7` | Backend `eval.py` & DB calibration |
| **REQ-REC-01** | Vehicle Recommendations with Image Previews & Back Navigation | Feature / UX | Medium | **Shipped** | `63b7c27` | Component tests & navigation history |
| **REQ-AST-01** | Responsive Car Hero Presentation & Transparent Assets (Audi R8 & Lada) | UI / Asset | Medium | **Shipped** | `9e2174b`, `985bb15` | Cross-device breakpoint styles |
| **REQ-SRH-01** | Multi-Parameter Search & Faceted Filter API Parameter Serialization | Backend / API | High | **Shipped** | `14980b2`, `027182a` | `tests/listingFilters.test.js` (14 tests) |
| **REQ-EVL-01** | Anomaly Risk & Market Price Estimation Engine | Backend / ML | High | **Shipped** | `25024c2`, `24dcef5` | `tests/anomalyRisk.test.js`, `tests/priceEstimate.test.js` |

---

## 3. Shipped Requirement Specification: REQ-FLT-02

### 3.1 Metadata
- **Requirement ID**: `REQ-FLT-02`
- **Feature Name**: Mobile-Responsive Filter Modal, 2-Column Preset Chips & Sticky Actions Dock
- **Component**: `frontend/src/components/ListingFilters.jsx`, `ListingFilters.css`, `frontend/src/utils/listingFilters.js`
- **Traced Commit**: `[REQ-FLT-02] Ship mobile-optimized filter drawer requirement with traceability matrix and unit tests`

### 3.2 User Story
> **As a** mobile car buyer browsing listings on a smartphone,  
> **I want** a well-structured advanced filter drawer with tap-friendly 2-column preset chips and a permanently visible bottom action bar,  
> **So that** I can easily inspect, tweak, and apply vehicle search parameters without encountering awkward chip wrapping, scroll traps, or obscured action buttons.

### 3.3 INVEST Criteria Verification
1. **Independent**: Can be designed, tested, and shipped without dependency on scraping or external APIs.
2. **Negotiable**: Chip boundaries (10k, 25k, 50k €; 2015+, 2020+; 50k, 100k, 150k km) are modularly configured in `FILTER_PRESETS`.
3. **Valuable**: Eliminates the critical mobile usability issue where 3 chips wrapped awkwardly leaving a lonely 4th chip on the next line, and allows immediate filter submission via sticky buttons.
4. **Estimable**: Sized and delivered in under 45 minutes of targeted styling and state refactoring.
5. **Small**: Focused exclusively on mobile modal viewport mechanics, quick chip grid layouts, and preset state helpers.
6. **Testable**: Validated by automated unit tests asserting preset range definitions, active state detection, and API serialization.

### 3.4 Acceptance Criteria (Gherkin BDD)

#### Scenario 1: Balanced 2-column preset grid on mobile viewports
- **Given** a user opens the Advanced Filters modal on a mobile screen (&le; 640px)
- **When** the range sliders for Price, Year, and Mileage render their quick preset options
- **Then** the preset chips must display in a balanced 2-column grid (`grid-template-columns: repeat(2, 1fr)`) with equal touch targets, eliminating irregular 3+1 line wraps.

#### Scenario 2: Sticky footer persistence across long filter scrolls
- **Given** the filter modal contains extensive options (brands, models, price, year, fuel, gearbox) exceeding the mobile screen height
- **When** the user scrolls down the filter body
- **Then** the bottom actions dock containing *"Resetează filtrele"* and *"Aplică filtrele"* remains pinned to the bottom of the viewport (`position: sticky; bottom: 0; z-index: 10`) with backdrop blur and high touch contrast.

#### Scenario 3: Independent scroll container without scroll traps
- **Given** the user interacts with the brand/model tree or the filter parameter sections
- **When** scrolling inside the modal
- **Then** the header and footer remain stationary while only the modal body scrolls smoothly with `-webkit-overflow-scrolling: touch` and proper padding for the sticky dock.

#### Scenario 4: Non-destructive preset application and API serialization
- **Given** an existing filter draft with selected vehicle brand, model, and fuel type
- **When** a user taps a quick preset chip (e.g. Price `< 10.000 €` or Year `2020+`)
- **Then** the respective min/max filter bounds update immediately while preserving all other filter criteria, and serialize into clean numeric API query parameters.

### 3.5 Automated Verification Evidence
Automated test suite: `frontend/tests/listingFilters.test.js`
- `✔ [REQ-FLT-02] mobile filter presets define valid bounds and match active filter selections`
- `✔ [REQ-FLT-02] applyFilterPreset updates target range without mutating unrelated filter criteria`
- Run command: `npm test --prefix frontend -- --run` &rarr; **52/52 tests passing (100% pass rate)**.
