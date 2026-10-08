import { useEffect, useState } from "react";
import { getListingOptions } from "../api/listings";

export default function useVehicleOptions(brand, model, enabled = true) {
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([brand, model, retry]);
  const [state, setState] = useState({
    key: null,
    data: null,
    error: false
  });

  useEffect(() => {
    if (!enabled) return;

    let current = true;

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
  }, [brand, model, enabled, key]);

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
