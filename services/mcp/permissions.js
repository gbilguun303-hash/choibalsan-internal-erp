"use strict";
const { denied } = require("./errors");

const ROLE_ALIASES = {
  warehouse: "storekeeper",
  viewer: "viewer",
  worker: "viewer",
  electric: "engineer",
  chief_engineer: "engineer",
};

const TOOL_ROLES = {
  get_dashboard_summary: ["director", "engineer", "hr", "storekeeper", "viewer"],
  get_lighting_summary: ["director", "engineer"],
  get_lighting_objects: ["director", "engineer"],
  get_fault_summary: ["director", "engineer"],
  search_work_orders: ["director", "engineer"],
  get_inventory_status: ["director", "engineer", "storekeeper"],
  get_attendance_summary: ["director", "hr"],
  get_electricity_cost_summary: ["director", "engineer"],
  draft_dev_request: ["director", "engineer", "hr", "storekeeper", "viewer"],
};

function normalizedRole(role) {
  const value = String(role || "").toLowerCase();
  return ROLE_ALIASES[value] || value;
}

function assertToolPermission(user, toolName) {
  const role = normalizedRole(user?.role);
  const allowed = TOOL_ROLES[toolName] || [];
  if (!user || !allowed.includes(role)) denied();
  return role;
}

module.exports = { TOOL_ROLES, normalizedRole, assertToolPermission };
