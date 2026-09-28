export function savedError(error) {
  if (error.status === 401) return "Sesiunea a expirat. Autentifică-te pentru a continua.";
  if (error.status === 404) return "Elementul nu mai este disponibil.";
  if (error.status === 409) return "Anunțul este deja în favorite.";
  if (error.status === 422) return "Verifică valorile introduse și intervalele selectate.";
  if (error.status === 503) return "Serviciul nu este disponibil momentan. Încearcă din nou.";
  return "Nu am putut finaliza operația. Verifică conexiunea și încearcă din nou.";
}

export function findFavourite(items, car) {
  return items.find((item) => item.listing_url && car.url
    ? item.listing_url === car.url
    : !item.listing_url && String(item.listing_id) === String(car.id));
}

export const savedDate = (value) => new Intl.DateTimeFormat("ro-RO", {
  dateStyle: "medium", timeStyle: "short",
}).format(new Date(value));
