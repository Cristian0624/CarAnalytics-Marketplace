import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import BackgroundTriangles from "../components/BackgroundTriangles";
import { COPILOT_SCENARIOS } from "../data/copilotScenarios";
import "./BuySafeCopilotPage.css";

const COPY = {
  en: {
    badge: "CLICKABLE PROTOTYPE · RISKIEST UNBUILT FEATURE",
    title: "Buy-Safe Copilot",
    subtitle:
      "What happens after you spot a car on 999.md? Test our end-to-end VIN history, live inspection calculator, negotiation playbook, and 3-year Moldova ownership cost — before you hand over cash.",
    inputPlaceholder: "Paste any 999.md listing URL or 17-character VIN...",
    scanBtn: "Run Buy-Safe Scan",
    scanningSteps: [
      "Checking EU / US auction & VIN records...",
      "Validating odometer progression curve...",
      "Generating Moldova repair & negotiation playbook...",
    ],
    demoLabel: "Or click a real-world Moldova scenario:",
    verdictStrong: "Strong Buy",
    verdictNegotiate: "Negotiate Hard",
    verdictWalk: "High Risk — Walk Away",
    asking: "Seller Asking",
    fairOffer: "Dynamic Fair Offer",
    deductions: "Detected Deductions",
    potentialSave: "Target Savings",
    vinSectionTitle: "1. VIN & Odometer History Check",
    vinSubtitle: "Detects rollbacks and EU/US salvage auctions before you drive to inspect the car.",
    rollbackBadge: "Rollback Detected",
    cleanCurveBadge: "Linear Verified Curve",
    listedKm: "Listed km",
    trueKm: "Est. real km",
    owners: "Owners",
    checklistTitle: "2. Live On-Site Inspection Calculator",
    checklistSubtitle:
      "Tap items as you inspect the car — every issue found instantly recalculates your Fair Offer and seller message.",
    statusUnchecked: "Not checked",
    statusOk: "Verified OK",
    statusIssue: "Issue Found",
    negotiationTitle: "3. Negotiation Playbook & Ready-to-Send Message",
    negotiationSubtitle:
      "Backed by objective market data, history flags, and your live inspection findings.",
    openingOffer: "Opening Offer",
    targetFair: "Target Fair Price",
    walkAway: "Walk-Away Max",
    copyMessage: "Copy Message for 999.md / Viber",
    copied: "Copied to clipboard!",
    tcoTitle: "4. 3-Year True Cost of Ownership (Moldova)",
    tcoSubtitle: "Move the slider to match your yearly driving and see the real monthly cost.",
    annualKmLabel: "Your annual driving",
    fuel3y: "Fuel (3 years)",
    insurance3y: "RCA, Tax & Transfer",
    maintenance3y: "Maintenance & Wear",
    depreciation3y: "Est. 3-Yr Depreciation",
    total3y: "Total 3-Year Cost",
    monthlyCost: "Real Monthly Cost",
    validationBadge: "PROTOTYPE VALIDATION · CH.15",
    validationTitle: "Would you use Buy-Safe Copilot before buying a car?",
    validationSub:
      "This prototype tests our riskiest product assumption: whether buyers value an actionable verification + negotiation copilot enough to use or pay for it.",
    votes: [
      { id: "free", label: "Yes — if free" },
      { id: "pay5", label: "Yes — I'd pay €5 / report" },
      { id: "pay9", label: "Yes — €9 with VIN photos" },
      { id: "no", label: "I prefer checking myself" },
    ],
    voteThanks: "Response recorded for this prototype session. Thank you!",
    exploreMarket: "Back to Marketplace",
    tryRisk: "Open Live Risk Analysis",
    historyAdjLabel: "VIN / History adjustment",
  },
  ro: {
    badge: "PROTOTIP INTERACTIV · CEA MAI RISCANTĂ FUNCȚIE NECONSTRUITĂ",
    title: "Buy-Safe Copilot",
    subtitle:
      "Ce faci după ce găsești o mașină pe 999.md? Testează verificarea VIN, calculatorul live de inspecție, strategia de negociere și costul real pe 3 ani în Moldova — înainte să dai banii.",
    inputPlaceholder: "Lipește un link 999.md sau un cod VIN (17 caractere)...",
    scanBtn: "Scanează Buy-Safe",
    scanningSteps: [
      "Verificăm istoricul VIN și licitațiile UE / SUA...",
      "Analizăm curba reală a kilometrajului...",
      "Calculăm costurile de reparație și oferta corectă...",
    ],
    demoLabel: "Sau alege un scenariu real din Moldova:",
    verdictStrong: "Merită cumpărată",
    verdictNegotiate: "Negociază ferm",
    verdictWalk: "Risc ridicat — Evită",
    asking: "Preț cerut",
    fairOffer: "Ofertă corectă live",
    deductions: "Deduceri detectate",
    potentialSave: "Economie țintă",
    vinSectionTitle: "1. Istoric VIN & Curba Kilometrajului",
    vinSubtitle: "Detectează kilometrajul dat înapoi și daunele de la licitațiile UE/SUA înainte de vizionare.",
    rollbackBadge: "Kilometraj dat înapoi",
    cleanCurveBadge: "Istoric liniar verificat",
    listedKm: "Km afișați",
    trueKm: "Km reali est.",
    owners: "Proprietari",
    checklistTitle: "2. Checklist Live de Inspecție la Fața Locului",
    checklistSubtitle:
      "Bifează verificările lângă mașină — fiecare problemă găsită recalculează automat Oferta Corectă și mesajul pentru vânzător.",
    statusUnchecked: "Neverificat",
    statusOk: "Verificat OK",
    statusIssue: "Problemă",
    negotiationTitle: "3. Ghid de Negociere & Mesaj Gata de Trimis",
    negotiationSubtitle:
      "Bazat pe datele de piață, istoricul VIN și defectele bifate la inspecție.",
    openingOffer: "Ofertă de start",
    targetFair: "Preț corect țintă",
    walkAway: "Limită maximă",
    copyMessage: "Copiază mesajul pentru 999.md / Viber",
    copied: "Copiat în clipboard!",
    tcoTitle: "4. Costul Real de Deținere pe 3 Ani (Moldova)",
    tcoSubtitle: "Ajustează rulajul anual pentru a vedea costul lunar real al mașinii.",
    annualKmLabel: "Rulajul tău anual",
    fuel3y: "Combustibil (3 ani)",
    insurance3y: "RCA, Taxe & Înmatriculare",
    maintenance3y: "Mentenanță & Uzură",
    depreciation3y: "Depreciere est. (3 ani)",
    total3y: "Cost total pe 3 ani",
    monthlyCost: "Cost lunar real",
    validationBadge: "VALIDARE PROTOTIP · CAP. 15",
    validationTitle: "Ai folosi Buy-Safe Copilot înainte să cumperi o mașină?",
    validationSub:
      "Acest prototip testează cea mai riscantă ipoteză: dacă cumpărătorii au nevoie de un copilot complet de verificare și negociere.",
    votes: [
      { id: "free", label: "Da — dacă e gratuit" },
      { id: "pay5", label: "Da — aș plăti 5 € / raport" },
      { id: "pay9", label: "Da — 9 € cu poze VIN" },
      { id: "no", label: "Prefer să verific singur" },
    ],
    voteThanks: "Răspunsul tău a fost înregistrat în sesiunea de prototip. Mulțumim!",
    exploreMarket: "Înapoi la Piață",
    tryRisk: "Deschide Analiza de Risc live",
    historyAdjLabel: "Ajustare istoric VIN",
  },
  ru: {
    badge: "ИНТЕРАКТИВНЫЙ ПРОТОТИП · САМАЯ РИСКОВАННАЯ ФУНКЦИЯ",
    title: "Buy-Safe Copilot",
    subtitle:
      "Что делать после того, как вы нашли авто на 999.md? Протестируйте проверку VIN, калькулятор осмотра на месте, стратегию торга и реальную стоимость владения за 3 года в Молдове.",
    inputPlaceholder: "Вставьте ссылку 999.md или 17-значный VIN...",
    scanBtn: "Запустить проверку",
    scanningSteps: [
      "Проверяем VIN и аукционы ЕС / США...",
      "Анализируем график реального пробега...",
      "Рассчитываем ремонт и стратегию торга...",
    ],
    demoLabel: "Или выберите реальный сценарий для Молдовы:",
    verdictStrong: "Отличный вариант",
    verdictNegotiate: "Жёсткий торг",
    verdictWalk: "Высокий риск — Пропустить",
    asking: "Цена продавца",
    fairOffer: "Справедливая цена",
    deductions: "Выявленные минусы",
    potentialSave: "Цель торга",
    vinSectionTitle: "1. Проверка VIN и график пробега",
    vinSubtitle: "Выявляет скрутку пробега и битые авто с аукционов ЕС/США ещё до поездки на осмотр.",
    rollbackBadge: "Скрутка пробега",
    cleanCurveBadge: "Ровная история пробега",
    listedKm: "Указано км",
    trueKm: "Реальный пробег",
    owners: "Владельцев",
    checklistTitle: "2. Интерактивный чек-лист осмотра",
    checklistSubtitle:
      "Отмечайте пункты прямо у машины — каждая найденная проблема мгновенно пересчитывает справедливую цену и текст для торга.",
    statusUnchecked: "Не проверено",
    statusOk: "Всё ок",
    statusIssue: "Проблема",
    negotiationTitle: "3. План торга и готовое сообщение продавцу",
    negotiationSubtitle:
      "Аргументы на основе рынка, истории VIN и найденных при осмотре нюансов.",
    openingOffer: "Стартовое предложение",
    targetFair: "Целевая цена",
    walkAway: "Максимум (стоп)",
    copyMessage: "Скопировать сообщение для 999.md / Viber",
    copied: "Скопировано!",
    tcoTitle: "4. Реальная стоимость владения за 3 года (Молдова)",
    tcoSubtitle: "Двигайте ползунок годового пробега, чтобы увидеть реальные расходы в месяц.",
    annualKmLabel: "Ваш годовой пробег",
    fuel3y: "Топливо (3 года)",
    insurance3y: "ОСАГО, налоги и оформление",
    maintenance3y: "Обслуживание и ремонт",
    depreciation3y: "Потеря стоимости (3 г.)",
    total3y: "Итого за 3 года",
    monthlyCost: "Реальная цена в месяц",
    validationBadge: "ВАЛИДАЦИЯ ПРОТОТИПА · ГЛ. 15",
    validationTitle: "Вы бы использовали Buy-Safe Copilot перед покупкой авто?",
    validationSub:
      "Этот прототип проверяет нашу самую рискованную гипотезу: готовы ли покупатели пользоваться таким помощником для проверки и торга.",
    votes: [
      { id: "free", label: "Да — бесплатно" },
      { id: "pay5", label: "Да — заплачу 5 € / отчёт" },
      { id: "pay9", label: "Да — 9 € с фото аукциона" },
      { id: "no", label: "Проверю сам" },
    ],
    voteThanks: "Ответ сохранён для тестирования прототипа. Спасибо!",
    exploreMarket: "Вернуться на рынок",
    tryRisk: "Открыть живой Анализ риска",
    historyAdjLabel: "Коррекция по VIN / истории",
  },
};

function fmtEur(n) {
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(Math.round(n))} €`;
}

function fmtKm(n) {
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(Math.round(n))} km`;
}

function OdometerSvgChart({ points, hasRollback }) {
  const width = 560;
  const height = 175;
  const padX = 46;
  const padTop = 24;
  const padBottom = 36;
  const maxKm = Math.max(...points.map((p) => p.km), 100000) * 1.12;
  const usableW = width - padX * 2;
  const usableH = height - padTop - padBottom;

  const coords = points.map((pt, idx) => {
    const x = padX + (points.length === 1 ? usableW / 2 : (idx / (points.length - 1)) * usableW);
    const y = padTop + usableH - (pt.km / maxKm) * usableH;
    return { ...pt, x, y };
  });

  const normalPath = coords
    .slice(0, hasRollback ? coords.length - 1 : coords.length)
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");

  const rollbackStart = hasRollback ? coords[coords.length - 2] : null;
  const rollbackEnd = hasRollback ? coords[coords.length - 1] : null;

  return (
    <div className="copilot-odo-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="copilot-odo-svg" role="img" aria-label="Odometer history chart">
        {[0.25, 0.5, 0.75, 1].map((frac) => {
          const y = padTop + usableH * (1 - frac);
          return (
            <line
              key={frac}
              x1={padX}
              y1={y}
              x2={width - padX}
              y2={y}
              className="copilot-odo-grid"
            />
          );
        })}

        <path d={normalPath} className="copilot-odo-line" fill="none" />

        {rollbackStart && rollbackEnd && (
          <line
            x1={rollbackStart.x}
            y1={rollbackStart.y}
            x2={rollbackEnd.x}
            y2={rollbackEnd.y}
            className="copilot-odo-rollback-line"
          />
        )}

        {coords.map((c, idx) => (
          <g key={idx}>
            <circle
              cx={c.x}
              cy={c.y}
              r={c.rollback || c.alert ? 6.5 : 5}
              className={
                c.rollback
                  ? "copilot-odo-dot is-danger"
                  : c.alert
                    ? "copilot-odo-dot is-warning"
                    : "copilot-odo-dot"
              }
            />
            <text x={c.x} y={c.y - 11} textAnchor="middle" className="copilot-odo-val">
              {Math.round(c.km / 1000)}k
            </text>
            <text x={c.x} y={height - 14} textAnchor="middle" className="copilot-odo-year">
              {c.year}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function BuySafeCopilotPage() {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || i18n.language || "en").slice(0, 2);
  const copy = COPY[lang] || COPY.en;

  const [selectedId, setSelectedId] = useState(COPILOT_SCENARIOS[0].id);
  const [urlOrVin, setUrlOrVin] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanStepIdx, setScanStepIdx] = useState(0);
  const [annualKm, setAnnualKm] = useState(15000);
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState(() => {
    try {
      return window.localStorage.getItem("faceauto_copilot_vote") || "";
    } catch {
      return "";
    }
  });

  const scenario = useMemo(
    () => COPILOT_SCENARIOS.find((s) => s.id === selectedId) || COPILOT_SCENARIOS[0],
    [selectedId]
  );

  const [checkStates, setCheckStates] = useState(() =>
    Object.fromEntries(COPILOT_SCENARIOS[0].checklist.map((item) => [item.id, item.defaultStatus]))
  );

  useEffect(() => {
    setCheckStates(
      Object.fromEntries(scenario.checklist.map((item) => [item.id, item.defaultStatus]))
    );
    setCopied(false);
  }, [scenario]);

  function runSimulatedScan(targetScenarioId) {
    setScanning(true);
    setScanStepIdx(0);
    setTimeout(() => setScanStepIdx(1), 420);
    setTimeout(() => setScanStepIdx(2), 840);
    setTimeout(() => {
      setSelectedId(targetScenarioId);
      setScanning(false);
    }, 1250);
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    const raw = urlOrVin.trim();
    if (!raw) {
      runSimulatedScan(selectedId);
      return;
    }
    const lower = raw.toLowerCase();
    let nextId = COPILOT_SCENARIOS[0].id;
    if (lower.includes("toyota") || lower.includes("rav") || lower.includes("jtm")) {
      nextId = "toyota-rav4";
    } else if (lower.includes("audi") || lower.includes("q5") || lower.includes("wa1")) {
      nextId = "audi-q5";
    } else {
      const hash = Array.from(raw).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      nextId = COPILOT_SCENARIOS[hash % COPILOT_SCENARIOS.length].id;
    }
    runSimulatedScan(nextId);
  }

  function cycleCheckStatus(itemId) {
    setCheckStates((prev) => {
      const curr = prev[itemId] || "unchecked";
      const next = curr === "unchecked" ? "ok" : curr === "ok" ? "issue" : "unchecked";
      return { ...prev, [itemId]: next };
    });
  }

  const inspectionIssues = scenario.checklist.filter((item) => checkStates[item.id] === "issue");
  const inspectionDeduction = inspectionIssues.reduce((sum, item) => sum + item.costEur, 0);
  const totalDeductions = scenario.historyPenaltyEur + inspectionDeduction;
  const dynamicFairPrice = Math.max(2500, scenario.marketFairBase - totalDeductions);
  const openingOffer = Math.round((dynamicFairPrice * 0.94) / 50) * 50;
  const walkAwayMax = Math.round((dynamicFairPrice * 1.03) / 50) * 50;
  const potentialSavings = Math.max(0, scenario.askingPrice - dynamicFairPrice);

  const hasRollback = scenario.odometerPoints.some((p) => p.rollback);

  const verdict = useMemo(() => {
    const gapPct = ((scenario.askingPrice - dynamicFairPrice) / scenario.askingPrice) * 100;
    if (hasRollback && inspectionIssues.length >= 2) {
      return { tone: "danger", label: copy.verdictWalk };
    }
    if (gapPct >= 14 || totalDeductions >= 2200) {
      return { tone: "danger", label: copy.verdictWalk };
    }
    if (gapPct >= 4 || totalDeductions >= 600) {
      return { tone: "warning", label: copy.verdictNegotiate };
    }
    return { tone: "positive", label: copy.verdictStrong };
  }, [scenario.askingPrice, dynamicFairPrice, hasRollback, inspectionIssues.length, totalDeductions, copy]);

  // Negotiation message builder in active language
  const negotiationMessage = useMemo(() => {
    const issueNames = inspectionIssues.map((i) => i.title[lang] || i.title.en);
    if (lang === "ro") {
      const reasons = [];
      if (hasRollback) reasons.push(`diferența de kilometraj din istoricul VIN (~${fmtKm(scenario.estimatedTrueMileage)})`);
      else if (scenario.historyPenaltyEur > 0) reasons.push("istoricul de licitație / reparație din SUA");
      if (issueNames.length > 0) reasons.push(`investițiile identificate la verificare (${issueNames.join(", ")})`);
      const reasonText = reasons.length > 0 ? ` Ținând cont de ${reasons.join(" și ")},` : " Analizând piața actuală,";
      return `Bună ziua! Sunt interesat real de ${scenario.title} (${fmtEur(scenario.askingPrice)}).${reasonText} pot oferi ${fmtEur(openingOffer)} și sunt gata să mergem azi la verificare la service. Cum vi se pare?`;
    }
    if (lang === "ru") {
      const reasons = [];
      if (hasRollback) reasons.push(`расхождение пробега по VIN (~${fmtKm(scenario.estimatedTrueMileage)})`);
      else if (scenario.historyPenaltyEur > 0) reasons.push("историю аукциона США");
      if (issueNames.length > 0) reasons.push(`выявленные при осмотре работы (${issueNames.join(", ")})`);
      const reasonText = reasons.length > 0 ? ` С учётом ${reasons.join(" и ")},` : " С учётом текущей ситуации на рынке,";
      return `Здравствуйте! Реально интересует ваш ${scenario.title} (${fmtEur(scenario.askingPrice)}).${reasonText} готов предложить ${fmtEur(openingOffer)} и сегодня заехать на СТО для проверки. Обсудим?`;
    }
    const reasons = [];
    if (hasRollback) reasons.push(`the VIN mileage discrepancy (~${fmtKm(scenario.estimatedTrueMileage)})`);
    else if (scenario.historyPenaltyEur > 0) reasons.push("the US auction repair history");
    if (issueNames.length > 0) reasons.push(`the inspection items needed (${issueNames.join(", ")})`);
    const reasonText = reasons.length > 0 ? ` Considering ${reasons.join(" and ")},` : " Based on current market comparables,";
    return `Hi! I'm genuinely interested in your ${scenario.title} (${fmtEur(scenario.askingPrice)}).${reasonText} I can offer ${fmtEur(openingOffer)} and meet today for a service check. Does that work for you?`;
  }, [lang, scenario, inspectionIssues, hasRollback, openingOffer]);

  function handleCopyMessage() {
    navigator.clipboard?.writeText(negotiationMessage).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleVote(optionId) {
    setVote(optionId);
    try {
      window.localStorage.setItem("faceauto_copilot_vote", optionId);
    } catch {
      // ignore storage errors
    }
  }

  // 3-Year TCO Calculations
  const fuel3y = Math.round(((annualKm * 3) / 100) * scenario.fuelLPer100 * scenario.fuelPriceEur);
  const insurance3y = Math.round(scenario.annualInsuranceTaxEur * 3 + 180);
  const maintenance3y = Math.round(scenario.annualMaintenanceEur * 3 + inspectionDeduction);
  const depreciation3y = Math.round(dynamicFairPrice * scenario.threeYearDepreciationPct);
  const total3y = fuel3y + insurance3y + maintenance3y + depreciation3y;
  const monthlyCost = Math.round(total3y / 36);

  return (
    <div className="copilot-page">
      <BackgroundTriangles />

      <div className="copilot-container">
        {/* HERO */}
        <header className="copilot-hero">
          <span className="copilot-proto-badge">
            <span className="copilot-pulse-dot" />
            {copy.badge}
          </span>
          <h1>{copy.title}</h1>
          <p className="copilot-subtitle">{copy.subtitle}</p>

          <form className="copilot-scan-bar" onSubmit={handleFormSubmit}>
            <input
              type="text"
              value={urlOrVin}
              onChange={(e) => setUrlOrVin(e.target.value)}
              placeholder={copy.inputPlaceholder}
              aria-label={copy.inputPlaceholder}
            />
            <button type="submit" disabled={scanning}>
              {scanning ? copy.scanningSteps[scanStepIdx] : copy.scanBtn}
            </button>
          </form>

          <div className="copilot-demo-row">
            <span className="copilot-demo-label">{copy.demoLabel}</span>
            <div className="copilot-demo-cards">
              {COPILOT_SCENARIOS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`copilot-demo-card ${selectedId === item.id ? "is-active" : ""}`}
                  onClick={() => runSimulatedScan(item.id)}
                  disabled={scanning}
                >
                  <span className={`copilot-demo-tag tone-${item.tagTone}`}>
                    {item.tag[lang] || item.tag.en}
                  </span>
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                  <span className="copilot-demo-price">{fmtEur(item.askingPrice)}</span>
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* SCANNING OVERLAY / LOADING BAR */}
        {scanning ? (
          <div className="copilot-scanning-card" role="status" aria-live="polite">
            <div className="copilot-scan-spinner" />
            <h3>{copy.scanningSteps[scanStepIdx]}</h3>
            <div className="copilot-scan-steps">
              {copy.scanningSteps.map((step, idx) => (
                <span key={idx} className={idx <= scanStepIdx ? "is-done" : ""}>
                  {idx < scanStepIdx ? "✓" : idx === scanStepIdx ? "●" : "○"} {step}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* LIVE VERDICT BANNER */}
            <div className="copilot-verdict-banner">
              <div className="copilot-verdict-left">
                <div className="copilot-verdict-car">
                  <span className={`copilot-verdict-pill tone-${verdict.tone}`}>
                    {verdict.label}
                  </span>
                  <h2>{scenario.title}</h2>
                  <p>
                    {scenario.subtitle} · <code>VIN: {scenario.vin}</code>
                  </p>
                  <small>{scenario.origin[lang] || scenario.origin.en}</small>
                </div>
              </div>

              <div className="copilot-verdict-metrics">
                <div className="copilot-metric-box">
                  <span>{copy.asking}</span>
                  <strong>{fmtEur(scenario.askingPrice)}</strong>
                </div>
                <div className="copilot-metric-box is-teal">
                  <span>{copy.fairOffer}</span>
                  <strong>{fmtEur(dynamicFairPrice)}</strong>
                </div>
                <div className="copilot-metric-box is-danger">
                  <span>{copy.deductions}</span>
                  <strong>{totalDeductions > 0 ? `−${fmtEur(totalDeductions)}` : "0 €"}</strong>
                </div>
                <div className="copilot-metric-box">
                  <span>{copy.potentialSave}</span>
                  <strong>{potentialSavings > 0 ? fmtEur(potentialSavings) : "0 €"}</strong>
                </div>
              </div>
            </div>

            {/* 2-COLUMN MAIN GRID: VIN TIMELINE + LIVE INSPECTION */}
            <div className="copilot-grid">
              {/* SECTION 1: VIN & ODOMETER */}
              <article className="copilot-card">
                <div className="copilot-card-head">
                  <div>
                    <h3>{copy.vinSectionTitle}</h3>
                    <p>{copy.vinSubtitle}</p>
                  </div>
                  <span className={`copilot-status-pill tone-${hasRollback ? "danger" : "positive"}`}>
                    {hasRollback ? copy.rollbackBadge : copy.cleanCurveBadge}
                  </span>
                </div>

                <div className="copilot-card-body">
                  <div className="copilot-odo-stats">
                    <div>
                      <span>{copy.listedKm}</span>
                      <strong>{fmtKm(scenario.listedMileage)}</strong>
                    </div>
                    <div>
                      <span>{copy.trueKm}</span>
                      <strong className={hasRollback ? "text-danger" : "text-teal"}>
                        {fmtKm(scenario.estimatedTrueMileage)}
                      </strong>
                    </div>
                    <div>
                      <span>{copy.owners}</span>
                      <strong>{scenario.ownersCount}</strong>
                    </div>
                  </div>

                  <OdometerSvgChart points={scenario.odometerPoints} hasRollback={hasRollback} />

                  <ol className="copilot-timeline">
                    {scenario.timeline.map((ev, idx) => (
                      <li key={idx} className={`copilot-timeline-item status-${ev.status}`}>
                        <span className="copilot-timeline-dot" />
                        <div className="copilot-timeline-content">
                          <div className="copilot-timeline-top">
                            <strong>{ev.title[lang] || ev.title.en}</strong>
                            <time>{ev.date}</time>
                          </div>
                          <p>{ev.detail[lang] || ev.detail.en}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </article>

              {/* SECTION 2: LIVE ON-SITE INSPECTION CHECKLIST */}
              <article className="copilot-card">
                <div className="copilot-card-head">
                  <div>
                    <h3>{copy.checklistTitle}</h3>
                    <p>{copy.checklistSubtitle}</p>
                  </div>
                  <span className="copilot-status-pill tone-teal">
                    {inspectionIssues.length} / {scenario.checklist.length}
                  </span>
                </div>

                <div className="copilot-card-body">
                  <div className="copilot-checklist">
                    {scenario.checklist.map((item) => {
                      const st = checkStates[item.id] || "unchecked";
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`copilot-check-item is-${st}`}
                          onClick={() => cycleCheckStatus(item.id)}
                        >
                          <span className="copilot-check-indicator" aria-hidden="true">
                            {st === "ok" ? "✓" : st === "issue" ? "!" : ""}
                          </span>
                          <div className="copilot-check-text">
                            <strong>{item.title[lang] || item.title.en}</strong>
                            <small>{item.hint[lang] || item.hint.en}</small>
                          </div>
                          <div className="copilot-check-right">
                            <span className={`copilot-check-badge is-${st}`}>
                              {st === "ok"
                                ? copy.statusOk
                                : st === "issue"
                                  ? `−${fmtEur(item.costEur)}`
                                  : copy.statusUnchecked}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {scenario.historyPenaltyEur > 0 && (
                    <div className="copilot-history-deduction-row">
                      <span>{copy.historyAdjLabel}</span>
                      <strong>−{fmtEur(scenario.historyPenaltyEur)}</strong>
                    </div>
                  )}
                </div>
              </article>
            </div>

            {/* SECTION 3: NEGOTIATION PLAYBOOK */}
            <article className="copilot-card copilot-card-wide">
              <div className="copilot-card-head">
                <div>
                  <h3>{copy.negotiationTitle}</h3>
                  <p>{copy.negotiationSubtitle}</p>
                </div>
              </div>

              <div className="copilot-card-body">
                <div className="copilot-price-ladder">
                  <div className="copilot-ladder-step is-opening">
                    <span>{copy.openingOffer}</span>
                    <strong>{fmtEur(openingOffer)}</strong>
                  </div>
                  <div className="copilot-ladder-step is-target">
                    <span>{copy.targetFair}</span>
                    <strong>{fmtEur(dynamicFairPrice)}</strong>
                  </div>
                  <div className="copilot-ladder-step is-max">
                    <span>{copy.walkAway}</span>
                    <strong>{fmtEur(walkAwayMax)}</strong>
                  </div>
                  <div className="copilot-ladder-step is-asking">
                    <span>{copy.asking}</span>
                    <strong>{fmtEur(scenario.askingPrice)}</strong>
                  </div>
                </div>

                <div className="copilot-message-box">
                  <p>{negotiationMessage}</p>
                  <button
                    type="button"
                    className={`copilot-copy-btn ${copied ? "is-copied" : ""}`}
                    onClick={handleCopyMessage}
                  >
                    {copied ? copy.copied : copy.copyMessage}
                  </button>
                </div>
              </div>
            </article>

            {/* SECTION 4: 3-YEAR TRUE COST OF OWNERSHIP */}
            <article className="copilot-card copilot-card-wide">
              <div className="copilot-card-head">
                <div>
                  <h3>{copy.tcoTitle}</h3>
                  <p>{copy.tcoSubtitle}</p>
                </div>
                <div className="copilot-monthly-pill">
                  <span>{copy.monthlyCost}</span>
                  <strong>{fmtEur(monthlyCost)} / mo</strong>
                </div>
              </div>

              <div className="copilot-card-body">
                <div className="copilot-tco-slider-row">
                  <label htmlFor="copilot-annual-km">
                    {copy.annualKmLabel}: <strong>{fmtKm(annualKm)} / yr</strong>
                  </label>
                  <input
                    id="copilot-annual-km"
                    type="range"
                    min="5000"
                    max="35000"
                    step="1000"
                    value={annualKm}
                    onChange={(e) => setAnnualKm(Number(e.target.value))}
                  />
                </div>

                <div className="copilot-tco-grid">
                  <div className="copilot-tco-item">
                    <span>{copy.fuel3y}</span>
                    <strong>{fmtEur(fuel3y)}</strong>
                  </div>
                  <div className="copilot-tco-item">
                    <span>{copy.insurance3y}</span>
                    <strong>{fmtEur(insurance3y)}</strong>
                  </div>
                  <div className="copilot-tco-item">
                    <span>{copy.maintenance3y}</span>
                    <strong>{fmtEur(maintenance3y)}</strong>
                  </div>
                  <div className="copilot-tco-item">
                    <span>{copy.depreciation3y}</span>
                    <strong>{fmtEur(depreciation3y)}</strong>
                  </div>
                  <div className="copilot-tco-item is-total">
                    <span>{copy.total3y}</span>
                    <strong>{fmtEur(total3y)}</strong>
                  </div>
                </div>
              </div>
            </article>

            {/* SECTION 5: PROTOTYPE VALIDATION (CH.15 RISKIEST ASSUMPTION TEST) */}
            <div className="copilot-validation-card">
              <span className="copilot-validation-badge">{copy.validationBadge}</span>
              <h3>{copy.validationTitle}</h3>
              <p>{copy.validationSub}</p>
              <div className="copilot-vote-row">
                {copy.votes.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`copilot-vote-btn ${vote === opt.id ? "is-selected" : ""}`}
                    onClick={() => handleVote(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {vote && <p className="copilot-vote-thanks">✓ {copy.voteThanks}</p>}
            </div>

            <div className="copilot-footer-links">
              <Link to="/listings" className="copilot-link-secondary">
                {copy.exploreMarket}
              </Link>
              <Link to="/anomaly-risk" className="copilot-link-primary">
                {copy.tryRisk}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
