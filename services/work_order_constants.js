"use strict";

const WORK_ORDER_STATUS = Object.freeze({
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

const WORK_ORDER_FLOW = Object.freeze({
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

function isClosedWorkOrder(status) {
  return WORK_ORDER_FLOW.CLOSED.includes(status);
}

function isDoneOrClosedWorkOrder(status) {
  return WORK_ORDER_FLOW.DONE_OR_CLOSED.includes(status);
}

module.exports = {
  WORK_ORDER_STATUS,
  WORK_ORDER_FLOW,
  isClosedWorkOrder,
  isDoneOrClosedWorkOrder,
};
