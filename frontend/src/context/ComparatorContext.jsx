import { createContext, useState, useEffect, useContext, useCallback } from "react";
import { addComparisonCar, comparisonKey, uniqueComparisonCars } from "../utils/comparator";

export const ComparatorContext = createContext(null);

export function ComparatorProvider({ children }) {
  const [comparedCars, setComparedCars] = useState(() => {
    try {
      const saved = localStorage.getItem("comparedCars");
      const parsed = saved ? JSON.parse(saved) : [];
      return uniqueComparisonCars(parsed);
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("comparedCars", JSON.stringify(comparedCars));
    } catch {
      // The comparison remains usable when browser storage is unavailable/full.
    }
  }, [comparedCars]);

  const addCar = (car) => {
    setComparedCars(current => addComparisonCar(current, car));
  };

  const removeCar = (id) => {
    setComparedCars(current => current.filter(car => comparisonKey(car) !== String(id)));
  };

  const clearComparator = () => {
    setComparedCars([]);
  };

  const loadComparator = useCallback((cars) => {
    setComparedCars(uniqueComparisonCars(cars));
  }, []);

  return (
    <ComparatorContext.Provider value={{ comparedCars, addCar, removeCar, clearComparator, loadComparator }}>
      {children}
    </ComparatorContext.Provider>
  );
}

export function useComparator() {
  return useContext(ComparatorContext);
}
