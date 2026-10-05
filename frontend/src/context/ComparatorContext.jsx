import { createContext, useState, useEffect, useContext } from "react";

export const ComparatorContext = createContext(null);

export function ComparatorProvider({ children }) {
  const [comparedCars, setComparedCars] = useState(() => {
    const saved = localStorage.getItem("comparedCars");
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem("comparedCars", JSON.stringify(comparedCars));
  }, [comparedCars]);

  const addCar = (car) => {
    if (comparedCars.length >= 3) {
      alert("Poți compara maxim 3 mașini simultan!");
      return;
    }
    if (!comparedCars.some((c) => c.id === car.id)) {
      setComparedCars([...comparedCars, car]);
    }
  };

  const removeCar = (id) => {
    setComparedCars(comparedCars.filter((c) => c.id !== id));
  };

  const clearComparator = () => {
    setComparedCars([]);
  };

  const loadComparator = (cars) => {
    setComparedCars(cars);
  };

  return (
    <ComparatorContext.Provider value={{ comparedCars, addCar, removeCar, clearComparator, loadComparator }}>
      {children}
    </ComparatorContext.Provider>
  );
}

export function useComparator() {
  return useContext(ComparatorContext);
}
