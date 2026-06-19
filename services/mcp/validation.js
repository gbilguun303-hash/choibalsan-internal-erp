"use strict";
const { invalid } = require("./errors");

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

function dateOnly(value, field = "date") {
  if (value == null || value === "") return null;
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    invalid(`${field} must use YYYY-MM-DD format.`);
  }
  return text;
}

function boundedInt(value, fallback, min, max, field) {
  const n = value == null ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    invalid(`${field} must be between ${min} and ${max}.`);
  }
  return n;
}

function validateDateRange(dateFrom, dateTo, options = {}) {
  const fieldFrom = options.fieldFrom || "date_from";
  const fieldTo = options.fieldTo || "date_to";
  const from = dateOnly(dateFrom, fieldFrom);
  const to = dateOnly(dateTo, fieldTo);
  if (from && to && from > to) invalid(`${fieldFrom} must not be after ${fieldTo}.`);
  if (from && to && options.maxDays != null) {
    const days = (Date.parse(to) - Date.parse(from)) / 86400000;
    if (days > options.maxDays) {
      invalid(`Date range cannot exceed ${options.maxDays} days.`);
    }
  }
  return { from, to };
}

module.exports = {
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  dateOnly,
  boundedInt,
  validateDateRange,
};
