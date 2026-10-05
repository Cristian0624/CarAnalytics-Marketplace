export function savedError(error, t) {
  if (error.status === 401) {
    return t("savedItemsJS.errors.sessionExpired");
  }

  if (error.status === 404) {
    return t("savedItemsJS.errors.notAvailable");
  }

  if (error.status === 409) {
    return t("savedItemsJS.errors.alreadyFavourite");
  }

  if (error.status === 422) {
    return t("savedItemsJS.errors.invalidValues");
  }

  if (error.status === 503) {
    return t("savedItemsJS.errors.serviceUnavailable");
  }

  return t("savedItemsJS.errors.generic");
}

export function findFavourite(items, car) {
  return items.find(
    (item) =>
      item.listing_url && car.url
        ? item.listing_url === car.url
        : !item.listing_url &&
          String(item.listing_id) === String(car.id)
  );
}

export const savedDate = (value, language = "ro") =>
  new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));