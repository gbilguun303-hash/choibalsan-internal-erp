"use strict";
const { z } = require("zod");
const { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT } = require("./validation");

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

const TOOL_SCHEMAS = {
  get_dashboard_summary: {
    title: "Get ERP dashboard summary",
    description: "Returns a read-only public operational summary for lighting, cameras, or traffic lights.",
    inputSchema: {
      scope: z.enum(["lighting", "camera", "traffic_light", "all"]).default("all"),
      date,
    },
  },
  get_lighting_summary: {
    title: "Get lighting summary",
    description: "Returns totals, faults, and lighting availability by lighting category.",
    inputSchema: {
      category: z.enum(["road", "ger_district", "tower", "traffic_light", "all"]).default("all"),
      date,
    },
  },
  get_lighting_objects: {
    title: "Get lighting objects",
    description: "Lists filtered road, ger district, and tower lighting objects with fault counts.",
    inputSchema: {
      category: z.enum(["road", "ger_district", "tower", "all"]).default("all"),
      search: z.string().max(100).optional(),
      limit: z.number().int().min(1).max(MAX_LIST_LIMIT).default(DEFAULT_LIST_LIMIT),
      offset: z.number().int().min(0).max(10000).default(0),
    },
  },
  get_fault_summary: {
    title: "Get fault summary",
    description: "Returns filtered lighting fault counts and the ten oldest matching faults.",
    inputSchema: {
      category: z.enum(["road", "ger_district", "tower", "traffic_light", "all"]).default("all"),
      status: z.enum(["open", "closed", "all"]).default("all"),
      age_bucket: z.enum(["0-3", "4-7", "8-30", "30+", "all"]).default("all"),
    },
  },
  search_work_orders: {
    title: "Search work orders",
    description: "Searches a bounded set of read-only ERP work orders.",
    inputSchema: {
      status: z.enum(["open", "in_progress", "done", "all"]).default("all"),
      category: z.enum(["lighting", "camera", "traffic_light", "all"]).default("all"),
      date_from: date,
      date_to: date,
      search: z.string().max(100).optional(),
      limit: z.number().int().min(1).max(MAX_LIST_LIMIT).default(DEFAULT_LIST_LIMIT),
    },
  },
  get_inventory_status: {
    title: "Get inventory status",
    description: "Returns current warehouse balances without prices, suppliers, or transaction details.",
    inputSchema: {
      category: z.enum(["LED", "cable", "breaker", "meter", "pole", "all"]).default("all"),
      low_stock_only: z.boolean().default(false),
      limit: z.number().int().min(1).max(MAX_LIST_LIMIT).default(DEFAULT_LIST_LIMIT),
      offset: z.number().int().min(0).max(100000).default(0),
    },
  },
  get_attendance_summary: {
    title: "Get attendance summary",
    description: "Returns HR attendance counts only. It never returns employee private fields.",
    inputSchema: {
      date_from: date,
      date_to: date,
    },
  },
  get_electricity_cost_summary: {
    title: "Calculate electricity cost",
    description: "Calculates annual electricity energy cost from supplied values; capacity charge is never guessed.",
    inputSchema: {
      lamp_power_w: z.number().nonnegative(),
      count: z.number().int().nonnegative(),
      annual_hours: z.number().nonnegative().max(8784),
      tariff_mnt_per_kwh: z.number().nonnegative().default(241),
      vat_percent: z.number().nonnegative().max(100).default(10),
      include_capacity_charge: z.boolean().default(false),
    },
  },
  draft_dev_request: {
    title: "Draft development request",
    description: "Creates a text draft only. It does not write a development request to ERP.",
    inputSchema: {
      title: z.string().max(120).optional(),
      module: z.string().max(80).optional(),
      description: z.string().min(8).max(2000),
    },
  },
};

module.exports = { TOOL_SCHEMAS };
