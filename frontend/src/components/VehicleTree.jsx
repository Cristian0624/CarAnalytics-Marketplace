import { useEffect, useState } from "react";
import { getListingOptions } from "../api/listings";

function useOptions(brand, model, enabled) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!enabled) { setData(null); return; }
    let ok = true;
    setData(null);
    getListingOptions({ brand, model })
      .then((d) => ok && setData(d ?? {}))
      .catch(() => ok && setData({ failed: true }));
    return () => { ok = false; };
  }, [brand, model, enabled]);
  return data;
}

function Row({ checked, inherited, partial, open, expandable, disabled, label, onCheck, onToggle, level }) {
  return (
    <li className={`vt-row vt-level-${level}`}>
      <input type="checkbox" checked={checked || inherited} disabled={disabled}
        className={`${inherited && !checked ? "inherited" : ""} ${partial ? "partial" : ""}`}
        onChange={onCheck} aria-label={label} />
      <button type="button" className={`vt-text ${checked ? "is-on" : ""}`}
        onClick={expandable ? onToggle : onCheck} disabled={disabled && !expandable}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {label}
        {expandable && (
          <span className={`vt-chevron ${open ? "open" : ""}`} aria-hidden="true">›</span>
        )}
      </button>
    </li>
  );
}

function Status({ data, children }) {
  if (!data) return <li className="vt-status">Se încarcă…</li>;
  if (data.failed) return <li className="vt-status">Nu s-a putut încărca lista.</li>;
  return children;
}

export default function VehicleTree({ filters, update, lockModels }) {
  const [openBrand, setOpenBrand] = useState(filters.brandText || null);
  const [openModel, setOpenModel] = useState(filters.modelText || null);
  const [q, setQ] = useState("");

  const brandData = useOptions(undefined, undefined, true);
  const modelData = useOptions(openBrand, undefined, Boolean(openBrand));
  const genData = useOptions(openBrand, openModel, Boolean(openBrand && openModel));

  function pick(brand, model = "", generation = "") {
    update("brandText", brand);
    update("modelText", model);
    update("generationText", generation);
  }

  const brands = (brandData?.brand ?? []).filter((b) =>
    b.toLowerCase().includes(q.trim().toLowerCase())
  );

  return (
    <div className="vt">
      <input className="vt-search" type="search" value={q}
        onChange={(e) => setQ(e.target.value)} placeholder="Caută marca" />
      <ul className="vt-list">
        <Status data={brandData}>
          {brands.map((b) => {
            const isOpen = openBrand === b;
            const brandOn = filters.brandText === b && !filters.modelText;
            const brandPartial = filters.brandText === b && Boolean(filters.modelText);
            return (
              <li key={b} className="vt-branch">
                <ul>
                  <Row level={0} label={b} open={isOpen} expandable
                    checked={brandOn} partial={brandPartial}
                    onCheck={() => (brandOn ? pick("") : pick(b))}
                    onToggle={() => { setOpenBrand(isOpen ? null : b); setOpenModel(null); }} />
                  {isOpen && (
                    <Status data={modelData}>
                      {(modelData?.model ?? []).map((m) => {
                        const mOpen = openModel === m;
                        const mOn = filters.brandText === b && filters.modelText === m && !filters.generationText;
                        const mPartial = filters.brandText === b && filters.modelText === m && Boolean(filters.generationText);
                        return (
                          <li key={m} className="vt-branch">
                            <ul>
                              <Row level={1} label={m} open={mOpen} expandable disabled={lockModels}
                                checked={mOn} inherited={brandOn} partial={mPartial}
                                onCheck={() => (mOn ? pick(b) : pick(b, m))}
                                onToggle={() => !lockModels && setOpenModel(mOpen ? null : m)} />
                              {mOpen && (
                                <Status data={genData}>
                                  {(genData?.generation ?? []).map((g) => (
                                    <Row key={g} level={2} label={g}
                                      checked={filters.modelText === m && filters.generationText === g}
                                      inherited={brandOn || mOn}
                                      onCheck={() =>
                                        filters.generationText === g ? pick(b, m) : pick(b, m, g)} />
                                  ))}
                                </Status>
                              )}
                            </ul>
                          </li>
                        );
                      })}
                    </Status>
                  )}
                </ul>
              </li>
            );
          })}
        </Status>
      </ul>
      {lockModels && (
        <small className="filter-disabled-hint">
          Eliminați clasele pentru a alege un model.
        </small>
      )}
    </div>
  );
}