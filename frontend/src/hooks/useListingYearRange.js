import { useEffect, useState } from "react";
import { getListingYearRange } from "../api/listings";

const FALLBACK_RANGE = {
  year_min: 1886, year_max: new Date().getFullYear(), present: true,
};

export default function useListingYearRange(filters) {
  const brand = filters.brandText || "";
  const model = filters.modelText || "";
  const generation = filters.generationText || "";
  const key = JSON.stringify([brand, model, generation]);
  const [state, setState] = useState(null);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      const selections = { brand, model, generation };
      const params = {};
      for (const [name, text] of Object.entries(selections)) {
        const values = text.split(",").map(value => value.trim()).filter(Boolean);
        if (values.length) params[name] = values;
      }
      getListingYearRange(params)
        .then(range => { if (current) setState({ key, range }); })
        .catch(() => { if (current) setState({ key, range: null }); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [brand, model, generation, key]);

  return state?.key === key && state.range ? state.range : FALLBACK_RANGE;
}
