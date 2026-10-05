import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getListingOptions } from "../api/listings";
import { resolveVehicleOption } from "../utils/anomalyRisk";
import Autocomplete from "./Autocomplete";

const EMPTY_OPTIONS = [];

function useVehicleOptions(brand, model, enabled = true) {
  const key = JSON.stringify([brand, model]);
  const [state, setState] = useState({
    key: null,
    data: null,
    error: false
  });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    let current = true;

    setState({
      key,
      data: null,
      error: false
    });

    getListingOptions({ brand, model })
      .then((data) => {
        if (current) {
          setState({
            key,
            data,
            error: false
          });
        }
      })
      .catch(() => {
        if (current) {
          setState({
            key,
            data: null,
            error: true
          });
        }
      });

    return () => {
      current = false;
    };
  }, [brand, model, enabled, key, retry]);

  const active = enabled && state.key === key;

  return {
    data: active ? state.data : null,
    error: active && state.error,
    loading:
      enabled &&
      (!active || (!state.data && !state.error)),
    retry: () => setRetry((value) => value + 1)
  };
}

export function FilterHint({ children }) {
  return (
    <small className="filter-disabled-hint">
      {children}
    </small>
  );
}

export default function MarketplaceVehicleFields({
  filters,
  update
}) {
  const { t } = useTranslation();

  // Fetch all brands on mount, then complete child lists for the resolved selection.
  const brandOptions = useVehicleOptions();

  const brands =
    brandOptions.data?.brand ?? EMPTY_OPTIONS;

  const brand = resolveVehicleOption(
    brands,
    filters.brandText ?? ""
  );

  const modelOptions = useVehicleOptions(
    brand,
    undefined,
    Boolean(brand)
  );

  const models =
    modelOptions.data?.model ?? EMPTY_OPTIONS;

  const model = resolveVehicleOption(
    models,
    filters.modelText ?? ""
  );

  const generationOptions = useVehicleOptions(
    brand,
    model,
    Boolean(brand && model)
  );

  const hasClasses = Boolean(filters.class?.length);

  // Conflicting historical saves remain editable so either selection can be cleared.
  const modelDisabled =
    !brand ||
    (hasClasses && !filters.modelText?.trim());

  const fields = [
    {
      field: "brandText",
      label: t("marketplaceVehicleFields.brand"),
      options: brands,
      request: brandOptions
    },
    {
      field: "modelText",
      label: t("marketplaceVehicleFields.model"),
      options: models,
      request: modelOptions,
      disabled: modelDisabled,
      hint: hasClasses
        ? t("marketplaceVehicleFields.modelNeedsClassesRemoved")
        : t("marketplaceVehicleFields.modelNeedsBrand")
    },
    {
      field: "generationText",
      label: t("marketplaceVehicleFields.generation"),
      options:
        generationOptions.data?.generation ??
        EMPTY_OPTIONS,
      request: generationOptions,
      disabled:
        !brand ||
        !model ||
        hasClasses,
      hint: hasClasses
        ? t(
            "marketplaceVehicleFields.generationNeedsClassesRemoved"
          )
        : t(
            "marketplaceVehicleFields.generationNeedsBrandModel"
          )
    }
  ];

  return fields.map(
    ({
      field,
      label,
      options,
      request,
      disabled,
      hint
    }) => (
      <div
        className="filter-group"
        key={field}
      >
        <label>{label}</label>

        <Autocomplete
          key={
            field === "brandText"
              ? field
              : `${field}/${brand}/${
                  field === "generationText"
                    ? model
                    : ""
                }`
          }
          label={label}
          value={filters[field] ?? ""}
          options={options}
          loading={request.loading}
          error={request.error}
          disabled={disabled}
          placeholder={t(
            "marketplaceVehicleFields.choose",
            {
              label: label.toLowerCase()
            }
          )}
          onChange={(value) =>
            update(field, value)
          }
          onSelect={(value) =>
            update(field, value)
          }
        />

        {disabled && (
          <FilterHint>{hint}</FilterHint>
        )}

        {request.error && !disabled && (
          <button
            type="button"
            onClick={request.retry}
          >
            {t("marketplaceVehicleFields.retry")}
          </button>
        )}
      </div>
    )
  );
}