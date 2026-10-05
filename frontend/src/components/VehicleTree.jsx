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


const modelToBrand = {};
const genToModel = {};
const brandModels = {};
const modelGens = {};

function Row({ checked, inherited, partial, open, expandable, disabled, label, onCheck, onToggle, level }) {
  const isChecked = Boolean(checked || inherited);
  return (
    <li className={`vt-row vt-level-${level}`}>
      <input type="checkbox" checked={isChecked} disabled={disabled}
        className={`${inherited && !checked ? "inherited" : ""} ${partial ? "partial" : ""}`}
        onChange={onCheck} aria-label={label} />
      <button type="button" className={`vt-text ${isChecked ? "is-on" : ""}`}
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
  const [openBrand, setOpenBrand] = useState(null);
  const [openModel, setOpenModel] = useState(null);
  const [q, setQ] = useState("");

  const brandData = useOptions(undefined, undefined, true);
  const modelData = useOptions(openBrand, undefined, Boolean(openBrand));
  const genData = useOptions(openBrand, openModel, Boolean(openBrand && openModel));

  useEffect(() => {
    if (openBrand && modelData?.model) {
      brandModels[openBrand] = modelData.model;
      modelData.model.forEach(m => { modelToBrand[m] = openBrand; });
    }
  }, [openBrand, modelData]);

  useEffect(() => {
    if (openModel && genData?.generation) {
      modelGens[openModel] = genData.generation;
      genData.generation.forEach(g => { genToModel[g] = openModel; });
    }
  }, [openModel, genData]);

  const list = (v) => (v || "").split(",").map((x) => x.trim()).filter(Boolean);
  const selBrands = list(filters.brandText);
  const selModels = list(filters.modelText);
  const selGens = list(filters.generationText);

  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const withItem = (arr, v) => (arr.includes(v) ? arr : [...arr, v]);
  
  function commit(brands, models, gens) {
    update("brandText", brands.join(", "));
    update("modelText", models.join(", "));
    update("generationText", gens.join(", "));
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
            const brandInList = selBrands.includes(b);
            
            const bModelsKnown = brandModels[b] || (isOpen ? modelData?.model : null) || [];
            const bSelModels = selModels.filter(m => bModelsKnown.includes(m) || modelToBrand[m] === b);
            
            const brandOn = brandInList && bSelModels.length === 0;
            const brandPartial = brandInList && bSelModels.length > 0;

            return (
              <li key={b} className="vt-branch">
                <ul>
                  <Row level={0} label={b} open={isOpen} expandable
                    checked={brandOn} partial={brandPartial}
                    onCheck={() => {
                      if (brandOn) {
                        const newBrands = selBrands.filter(x => x !== b);
                        const newModels = selModels.filter(mx => modelToBrand[mx] !== b && !bModelsKnown.includes(mx));
                        const newGens = selGens.filter(gx => {
                          const mx = genToModel[gx];
                          return mx ? (modelToBrand[mx] !== b && !bModelsKnown.includes(mx)) : true;
                        });
                        commit(newBrands, newModels, newGens);
                      } else {
                        const newModels = selModels.filter(mx => modelToBrand[mx] !== b && !bModelsKnown.includes(mx));
                        const newGens = selGens.filter(gx => {
                          const mx = genToModel[gx];
                          return mx ? (modelToBrand[mx] !== b && !bModelsKnown.includes(mx)) : true;
                        });
                        commit(withItem(selBrands, b), newModels, newGens);
                      }
                    }}
                    onToggle={() => { setOpenBrand(isOpen ? null : b); setOpenModel(null); }} />
                  {isOpen && (
                    <Status data={modelData}>
                      {(modelData?.model ?? []).map((m) => {
                        const mOpen = openModel === m;
                        const mExplicitlyChecked = selModels.includes(m);
                        const mOn = brandOn || mExplicitlyChecked;
                        
                        const mGensKnown = modelGens[m] || (mOpen ? genData?.generation : null) || [];
                        const mSelGens = selGens.filter(g => mGensKnown.includes(g) || genToModel[g] === m);
                        
                        // A model is partial if it is explicitly checked AND has specific generations selected.
                        // Wait, if it's explicitly checked and no gens, it's FULL.
                        const mPartial = mExplicitlyChecked && mSelGens.length > 0;
                        const isVisuallyOn = mOn && !mPartial;

                        return (
                          <li key={m} className="vt-branch">
                            <ul>
                              <Row level={1} label={m} open={mOpen} expandable disabled={lockModels}
                                checked={isVisuallyOn} partial={mPartial}
                                onCheck={() => {
                                  if (isVisuallyOn || brandOn) {
                                    let newBrands = [...selBrands];
                                    let newModels = selModels.filter(x => x !== m);
                                    let newGens = selGens.filter(gx => !(mGensKnown.includes(gx) || genToModel[gx] === m));
                                    
                                    if (brandOn) {
                                      newBrands = newBrands.filter(x => x !== b);
                                      newModels = newModels.filter(x => modelToBrand[x] !== b && !bModelsKnown.includes(x));
                                      newGens = newGens.filter(gx => {
                                        const mx = genToModel[gx];
                                        return mx ? (modelToBrand[mx] !== b && !bModelsKnown.includes(mx)) : true;
                                      });
                                    } else {
                                      if (bSelModels.length === 1) {
                                        newBrands = newBrands.filter(x => x !== b);
                                      }
                                    }
                                    commit(newBrands, newModels, newGens);
                                  } else {
                                    // Make model fully checked. Make brand partial (i.e. added to selBrands).
                                    // We also clear any specific generations for this model, because it becomes fully checked.
                                    let newGens = selGens.filter(gx => !(mGensKnown.includes(gx) || genToModel[gx] === m));
                                    commit(withItem(selBrands, b), withItem(selModels, m), newGens);
                                  }
                                }}
                                onToggle={() => !lockModels && setOpenModel(mOpen ? null : m)} />
                              {mOpen && (
                                <Status data={genData}>
                                  {(genData?.generation ?? []).map((g) => {
                                    const gExplicitlyChecked = selGens.includes(g);
                                    const gOn = isVisuallyOn || gExplicitlyChecked;
                                    
                                    return (
                                    <Row key={g} level={2} label={g}
                                      checked={gOn}
                                      onCheck={() => {
                                        if (gOn) {
                                          let newBrands = [...selBrands];
                                          let newModels = [...selModels];
                                          let newGens = selGens.filter(x => x !== g);

                                          if (brandOn) {
                                            newBrands = newBrands.filter(x => x !== b);
                                            newModels = newModels.filter(x => modelToBrand[x] !== b && !bModelsKnown.includes(x));
                                            newGens = newGens.filter(gx => {
                                              const mx = genToModel[gx];
                                              return mx ? (modelToBrand[mx] !== b && !bModelsKnown.includes(mx)) : true;
                                            });
                                          } else if (isVisuallyOn) {
                                            newModels = newModels.filter(x => x !== m);
                                            newGens = newGens.filter(gx => !(mGensKnown.includes(gx) || genToModel[gx] === m));
                                          } else {
                                            if (mSelGens.length === 1) {
                                              newModels = newModels.filter(x => x !== m);
                                              if (bSelModels.length === 1) {
                                                newBrands = newBrands.filter(x => x !== b);
                                              }
                                            }
                                          }
                                          commit(newBrands, newModels, newGens);
                                        } else {
                                          // Check generation explicitly. Add model and brand to parents so they become partial.
                                          commit(withItem(selBrands, b), withItem(selModels, m), withItem(selGens, g));
                                        }
                                      }} />
                                    );
                                  })}
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