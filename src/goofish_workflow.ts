/**
 * ---
 * name: 闲鱼比价下单
 * description: "闲鱼商品比价、代购、下单工作流"
 *
 * use when:
 * - 用户需要在闲鱼上比价购买商品
 * - 用户需要代购闲鱼商品
 *
 * input:
 *   - name: city
 *     description: 目标城市
 *     required: true
 *   - name: area
 *     description: 目标区域（商圈、商场等）
 *     required: true
 *   - name: shop
 *     description: 目标店铺名称，只包含商品品牌信息，例如霸王茶姬，喜茶，奈雪的茶等
 *     required: true
 *   - name: product
 *     description: 要购买的商品名称
 *     required: true
 *   - name: specification
 *     description: 商品规格
 *     required: true
 *   - name: quantity
 *     description: 购买数量
 *     required: true
 *
 * output:
 *   - success: 是否成功
 *   - message: 结果消息
 *   - data: 订单信息（成功时返回） 
 * ---
 */

import { Agent, type WorkflowContext } from "@greaseclaw/workflow-sdk";
import { createWorkflowApis } from "./api";
import { createShoppingFlow } from "./libs/shopping-flow";
import { createLogger } from "./libs/logger";

// Main workflow entry point
export async function execute(context: WorkflowContext) {
  const agent = new Agent(context.agentOptions || {});
  const apis = createWorkflowApis(agent);
  const logger = createLogger({ level: "debug" });
  const shoppingFlow = createShoppingFlow({ logger, agent, goofish: apis });

  console.log("Task:", context.task);
  console.log("Params:", context.params);
  console.log("Executing workflow...");

  try {
    await shoppingFlow.handleIncoming({
      chatId: context.chatId ?? "",
      userText: context.task,
      params: context.params,
    });
  } catch (error) {
    console.error("Workflow  error:", error);
    return {
      success: false,
      message: "Workflow failed",
      error: error,
    };
  }

  return {
    success: true,
    message: "Workflow completed successfully",
  };
}
// @ts-ignore
globalThis.execute = execute;
