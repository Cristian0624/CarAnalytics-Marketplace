import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import i18next from "i18next";
import { addComparisonCar, comparisonColumnWidths, translateComparisonValue, uniqueComparisonCars } from "../src/utils/comparator.js";

test("comparison retains more than three cars and survives a saved-state round trip", () => {
  let cars = [];
  for (let id = 1; id <= 12; id++) cars = addComparisonCar(cars, { id, model: `Car ${id}` });
  assert.equal(cars.length, 12);
  assert.deepEqual(uniqueComparisonCars(JSON.parse(JSON.stringify(cars))), cars);
});

test("adding the same listing with a string ID does not create a second column", () => {
  const original = [{ id: 7, model: "Original" }];
  const result = addComparisonCar(original, { id: "7", model: "Duplicate" });
  assert.equal(result.length, 1);
  assert.equal(result[0].model, "Original");
  assert.equal(original.length, 1);
});

test("corrupt or duplicate saved selections are normalised without truncating valid cars", () => {
  assert.deepEqual(uniqueComparisonCars(null), []);
  assert.deepEqual(uniqueComparisonCars([null, {}, { id: 1 }, { id: "1" }, { id: 2 }]), [{ id: 1 }, { id: 2 }]);
});

test("comparison columns fit the available area and only overflow beyond its capacity", () => {
  for (const width of [296, 351, 480, 650, 850, 1010, 1188, 1268]) {
    const minimumCarWidth = width <= 480 ? 180 : 220;
    const labelWidth = width <= 480 ? 140 : 200;
    const capacity = Math.max(1, Math.floor((width - labelWidth - 2) / minimumCarWidth));
    for (let count = 1; count <= 8; count++) {
      const columns = comparisonColumnWidths(width, count);
      const tableWidth = columns.labelWidth + count * columns.carWidth;
      assert.equal(tableWidth > width - 2, count > capacity, `${width}px, ${count} cars`);
      assert.ok(columns.carWidth <= 280);
    }
  }
});

test("one or two cars keep compact columns on wide screens", () => {
  assert.equal(comparisonColumnWidths(1188, 1).carWidth, 280);
  assert.equal(comparisonColumnWidths(1188, 2).carWidth, 280);
  assert.equal(comparisonColumnWidths(1188, 4).carWidth, 246);
  assert.equal(comparisonColumnWidths(650, 2).carWidth, 224);
});

test("comparison translates specification values in all three languages without changing stored values", async () => {
  const resources = Object.fromEntries(["ro", "en", "ru"].map(language => [language, {
    translation: JSON.parse(fs.readFileSync(new URL(`../src/languages/locales/${language}.json`, import.meta.url))),
  }]));
  const instance = i18next.createInstance();
  await instance.init({ resources, lng: "en", fallbackLng: "ro" });
  const values = ["Benzină", "Automată", "Din față", "Universal", "D-segment (Mid-size)", "Republica Moldova"];
  const fields = ["fuel_type", "gearbox", "drivetrain", "body_type", "class", "registration_country"];
  const expected = {
    en: ["Petrol", "Automatic", "Front-wheel drive", "Station Wagon", "D (Mid-size)", "Republic of Moldova"],
    ru: ["Бензин", "Автоматическая", "Передний", "Универсал", "D (Средний класс)", "Республика Молдова"],
    ro: ["Benzină", "Automată", "Din față", "Universal", "D (Clasă medie)", "Republica Moldova"],
  };
  for (const language of ["en", "ru", "ro"]) {
    await instance.changeLanguage(language);
    const t = instance.t.bind(instance);
    assert.deepEqual(fields.map((field, index) => translateComparisonValue(t, field, values[index])), expected[language]);
    assert.equal(translateComparisonValue(t, "generation", "I (2018 - prezent)"), `I (2018 - ${resources[language].translation.comparatorPage.present})`);
    assert.equal(translateComparisonValue(t, "gearbox", null), "—");
    assert.equal(translateComparisonValue(t, "body_type", "Unknown body"), "Unknown body");
  }
  assert.equal(values[0], "Benzină");
});
