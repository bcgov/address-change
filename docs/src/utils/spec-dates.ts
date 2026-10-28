import dates from "../data/spec-dates.json";

const format = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "America/Vancouver",
      })
    : "Not yet published";

export const lastUpdated = { test: format(dates.test), prod: format(dates.prod) };
