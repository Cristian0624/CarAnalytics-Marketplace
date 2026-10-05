import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getListingOptions } from "../api/listings";

function useOptions(brand, model, enabled) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }

    let ok = true;
    setData(null);

    getListingOptions({ brand, model })
      .then((d) => ok && setData(d ?? {}))
      .catch(() => ok && setData({ failed: true }));

    return () => {
      ok = false;
    };
  }, [brand, model, enabled]);

  return data;
}

const modelToBrand = {};
const genToModel = {};
const brandModels = {};
const modelGens = {};

function Row({
  checked,
  inherited,
  partial,
  open,
  expandable,
  disabled,
  label,
  onCheck,
  onToggle,
  level
}) {
  const isChecked = Boolean(checked || inherited);

  return (
    <li className={`vt-row vt-level-${level}`}>
      <input
        type="checkbox"
        checked={isChecked}
        disabled={disabled}
        className={`${inherited && !checked ? "inherited" : ""} ${
          partial ? "partial" : ""
        }`}
        onChange={onCheck}
        aria-label={label}
      />

      <button
        type="button"
        className={`vt-text ${isChecked ? "is-on" : ""}`}
        onClick={expandable ? onToggle : onCheck}
        disabled={disabled && !expandable}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        {label}

        {expandable && (
          <span
            className={`vt-chevron ${open ? "open" : ""}`}
            aria-hidden="true"
          >
            ›
          </span>
        )}
      </button>
    </li>
  );
}

function Status({ data, children, t }) {
  if (!data) {
    return (
      <li className="vt-status">
        {t("vehicleTree.loading")}
      </li>
    );
  }

  if (data.failed) {
    return (
      <li className="vt-status">
        {t("vehicleTree.loadError")}
      </li>
    );
  }

  return children;
}

export default function VehicleTree({
  filters,
  update,
  lockModels
}) {
  const { t } = useTranslation();

  const [openBrand, setOpenBrand] = useState(null);
  const [openModel, setOpenModel] = useState(null);
  const [q, setQ] = useState("");

  const brandData = useOptions(
    undefined,
    undefined,
    true
  );

  const modelData = useOptions(
    openBrand,
    undefined,
    Boolean(openBrand)
  );

  const genData = useOptions(
    openBrand,
    openModel,
    Boolean(openBrand && openModel)
  );

  useEffect(() => {
    if (openBrand && modelData?.model) {
      brandModels[openBrand] = modelData.model;

      modelData.model.forEach((m) => {
        modelToBrand[m] = openBrand;
      });
    }
  }, [openBrand, modelData]);

  useEffect(() => {
    if (openModel && genData?.generation) {
      modelGens[openModel] = genData.generation;

      genData.generation.forEach((g) => {
        genToModel[g] = openModel;
      });
    }
  }, [openModel, genData]);

  const list = (v) =>
    (v || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  const selBrands = list(filters.brandText);
  const selModels = list(filters.modelText);
  const selGens = list(filters.generationText);

  const toggle = (arr, v) =>
    arr.includes(v)
      ? arr.filter((x) => x !== v)
      : [...arr, v];

  const withItem = (arr, v) =>
    arr.includes(v) ? arr : [...arr, v];

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
      <input
        className="vt-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("vehicleTree.searchBrand")}
      />

      <ul className="vt-list">
        <Status data={brandData} t={t}>
          {brands.map((b) => {
            const isOpen = openBrand === b;
            const brandInList = selBrands.includes(b);

            const bModelsKnown =
              brandModels[b] ||
              (isOpen ? modelData?.model : null) ||
              [];

            const bSelModels = selModels.filter(
              (m) =>
                bModelsKnown.includes(m) ||
                modelToBrand[m] === b
            );

            const brandOn =
              brandInList && bSelModels.length === 0;

            const brandPartial =
              brandInList && bSelModels.length > 0;

            return (
              <li key={b} className="vt-branch">
                <ul>
                  <Row
                    level={0}
                    label={b}
                    open={isOpen}
                    expandable
                    checked={brandOn}
                    partial={brandPartial}
                    onCheck={() => {
                      if (brandOn) {
                        const newBrands =
                          selBrands.filter(
                            (x) => x !== b
                          );

                        const newModels =
                          selModels.filter(
                            (m) =>
                              modelToBrand[m] !== b
                          );

                        const newGens =
                          selGens.filter((g) => {
                            const mx =
                              genToModel[g];

                            return mx
                              ? modelToBrand[mx] !== b
                              : true;
                          });

                        commit(
                          newBrands,
                          newModels,
                          newGens
                        );
                      } else {
                        const newModels =
                          selModels.filter(
                            (m) =>
                              modelToBrand[m] !== b
                          );

                        const newGens =
                          selGens.filter((g) => {
                            const mx =
                              genToModel[g];

                            return mx
                              ? modelToBrand[mx] !== b
                              : true;
                          });

                        commit(
                          withItem(selBrands, b),
                          newModels,
                          newGens
                        );
                      }
                    }}
                    onToggle={() => {
                      setOpenBrand(
                        isOpen ? null : b
                      );
                      setOpenModel(null);
                    }}
                  />

                  {isOpen && (
                    <Status data={modelData} t={t}>
                      {(modelData?.model ?? []).map(
                        (m) => {
                          const mOpen =
                            openModel === m;

                          const mExplicitlyChecked =
                            selModels.includes(m);

                          const mOn =
                            brandOn ||
                            mExplicitlyChecked;

                          const mGensKnown =
                            modelGens[m] ||
                            (mOpen
                              ? genData?.generation
                              : null) ||
                            [];

                          const mSelGens =
                            selGens.filter(
                              (g) =>
                                mGensKnown.includes(g) ||
                                genToModel[g] === m
                            );

                          const mPartial =
                            mExplicitlyChecked &&
                            mSelGens.length > 0;

                          const isVisuallyOn =
                            mOn && !mPartial;

                          return (
                            <li
                              key={m}
                              className="vt-branch"
                            >
                              <ul>
                                <Row
                                  level={1}
                                  label={m}
                                  open={mOpen}
                                  expandable
                                  disabled={lockModels}
                                  checked={isVisuallyOn}
                                  partial={mPartial}
                                  onCheck={() => {
                                    if (
                                      isVisuallyOn ||
                                      brandOn
                                    ) {
                                      const newBrands =
                                        selBrands.filter(
                                          (x) => x !== b
                                        );

                                      let newModels =
                                        selModels.filter(
                                          (x) =>
                                            modelToBrand[
                                              x
                                            ] !== b
                                        );

                                      newModels =
                                        newModels.filter(
                                          (x) => x !== m
                                        );

                                      let newGens =
                                        selGens.filter(
                                          (g) => {
                                            const mx =
                                              genToModel[
                                                g
                                              ];

                                            return mx
                                              ? modelToBrand[
                                                  mx
                                                ] !== b
                                              : true;
                                          }
                                        );

                                      newGens =
                                        newGens.filter(
                                          (g) =>
                                            genToModel[g] !==
                                            m
                                        );

                                      commit(
                                        newBrands,
                                        newModels,
                                        newGens
                                      );
                                    } else {
                                      let newGens =
                                        selGens.filter(
                                          (g) =>
                                            genToModel[g] !==
                                            m
                                        );

                                      commit(
                                        withItem(
                                          selBrands,
                                          b
                                        ),
                                        withItem(
                                          selModels,
                                          m
                                        ),
                                        newGens
                                      );
                                    }
                                  }}
                                  onToggle={() =>
                                    !lockModels &&
                                    setOpenModel(
                                      mOpen ? null : m
                                    )
                                  }
                                />

                                {mOpen && (
                                  <Status
                                    data={genData}
                                    t={t}
                                  >
                                    {(
                                      genData?.generation ??
                                      []
                                    ).map((g) => {
                                      const gExplicitlyChecked =
                                        selGens.includes(g);

                                      const gOn =
                                        isVisuallyOn ||
                                        gExplicitlyChecked;

                                      return (
                                        <Row
                                          key={g}
                                          level={2}
                                          label={g}
                                          checked={gOn}
                                          onCheck={() => {
                                            if (gOn) {
                                              const newBrands =
                                                brandOn
                                                  ? selBrands.filter(
                                                      (x) =>
                                                        x !== b
                                                    )
                                                  : selBrands;

                                              let newModels =
                                                brandOn
                                                  ? selModels.filter(
                                                      (x) =>
                                                        modelToBrand[
                                                          x
                                                        ] !== b
                                                    )
                                                  : selModels;

                                              if (
                                                isVisuallyOn
                                              ) {
                                                newModels =
                                                  newModels.filter(
                                                    (x) =>
                                                      x !== m
                                                  );
                                              }

                                              let newGens =
                                                selGens.filter(
                                                  (x) =>
                                                    x !== g
                                                );

                                              if (brandOn) {
                                                newGens =
                                                  newGens.filter(
                                                    (gx) => {
                                                      const mx =
                                                        genToModel[
                                                          gx
                                                        ];

                                                      return mx
                                                        ? modelToBrand[
                                                            mx
                                                          ] !== b
                                                        : true;
                                                    }
                                                  );
                                              }

                                              if (
                                                isVisuallyOn
                                              ) {
                                                newGens =
                                                  newGens.filter(
                                                    (gx) =>
                                                      genToModel[
                                                        gx
                                                      ] !== m
                                                  );
                                              }

                                              commit(
                                                newBrands,
                                                newModels,
                                                newGens
                                              );
                                            } else {
                                              commit(
                                                withItem(
                                                  selBrands,
                                                  b
                                                ),
                                                withItem(
                                                  selModels,
                                                  m
                                                ),
                                                withItem(
                                                  selGens,
                                                  g
                                                )
                                              );
                                            }
                                          }}
                                        />
                                      );
                                    })}
                                  </Status>
                                )}
                              </ul>
                            </li>
                          );
                        }
                      )}
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
          {t("vehicleTree.classesHint")}
        </small>
      )}
    </div>
  );
}