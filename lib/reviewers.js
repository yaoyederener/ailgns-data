// ⭐ 产品优化员名单（站长 2026-11-08 定）：这些地址发的工单是体验产品后的专业反馈，站长要亲自挨个审查。
// 规矩：不走 AI 分诊的「无效 / 自动答复」，不让巡检机器人处理或写草稿，后台置顶打星，来一条就推站内信给站长。
export const REVIEWERS = {
  "0x54a5f81a97def228f2df92596e7a8d43e4f4d674": "产品优化员",
};
export const reviewerOf = (a) => REVIEWERS[String(a || "").toLowerCase()] || "";
