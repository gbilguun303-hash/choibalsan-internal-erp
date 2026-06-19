export const WORK_ORDER_STATUS = Object.freeze({
  STARTED: "Эхэлсэн",
  IN_PROGRESS: "Явцтай",
  DONE: "Дууссан",
  SUBMITTED_DONE: "Дууссан гэж илгээсэн",
  HSE_CHECKED: "ХАБЭА шалгасан",
  ENGINEER_APPROVED_LEGACY: "Инженер баталсан",
  CLOSED: "Хаагдсан",
  REJECTED: "Буцаагдсан",
  WAITING: "Хүлээгдэж байгаа",
  CANCELLED: "Цуцалсан",
});

export const WORK_ORDER_FLOW = Object.freeze({
  ACTIVE: Object.freeze([WORK_ORDER_STATUS.STARTED, WORK_ORDER_STATUS.IN_PROGRESS]),
  CLOSED: Object.freeze([WORK_ORDER_STATUS.CLOSED]),
  DONE_OR_CLOSED: Object.freeze([WORK_ORDER_STATUS.DONE, WORK_ORDER_STATUS.CLOSED]),
  SUBMIT_DONE_BLOCKED: Object.freeze([
    WORK_ORDER_STATUS.SUBMITTED_DONE,
    WORK_ORDER_STATUS.HSE_CHECKED,
    WORK_ORDER_STATUS.ENGINEER_APPROVED_LEGACY,
    WORK_ORDER_STATUS.CLOSED,
  ]),
  HSE_POST_ALLOWED: Object.freeze([
    WORK_ORDER_STATUS.SUBMITTED_DONE,
    WORK_ORDER_STATUS.DONE,
    WORK_ORDER_STATUS.ENGINEER_APPROVED_LEGACY,
  ]),
  FINAL_CONFIRM_ALLOWED: Object.freeze([WORK_ORDER_STATUS.HSE_CHECKED]),
});

export const WORK_ORDER_STATUS_COLORS = Object.freeze({
  [WORK_ORDER_STATUS.IN_PROGRESS]: ["#dbeafe", "#2563eb"],
  [WORK_ORDER_STATUS.STARTED]: ["#dcfce7", "#16a34a"],
  [WORK_ORDER_STATUS.REJECTED]: ["#fee2e2", "#dc2626"],
  [WORK_ORDER_STATUS.SUBMITTED_DONE]: ["#fef9c3", "#ca8a04"],
  [WORK_ORDER_STATUS.HSE_CHECKED]: ["#e0f2fe", "#0369a1"],
  [WORK_ORDER_STATUS.ENGINEER_APPROVED_LEGACY]: ["#ede9fe", "#7c3aed"],
  [WORK_ORDER_STATUS.CLOSED]: ["#f0fdf4", "#15803d"],
  [WORK_ORDER_STATUS.DONE]: ["#dcfce7", "#16a34a"],
  [WORK_ORDER_STATUS.WAITING]: ["#f1f5f9", "#94a3b8"],
});

export function isClosedWorkOrder(status) {
  return WORK_ORDER_FLOW.CLOSED.includes(status);
}

export function isDoneOrClosedWorkOrder(status) {
  return WORK_ORDER_FLOW.DONE_OR_CLOSED.includes(status);
}
