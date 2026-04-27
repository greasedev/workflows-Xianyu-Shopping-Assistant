/**
 * ---
 * name: 测试
 * description: "测试"
 *
 * use when:
 * - 测试
 *
 * input:
 *
 * output:
 *   - success: 是否成功
 *   - message: 结果消息
 * ---
 */

import { Agent, type WorkflowContext } from "@greaseclaw/workflow-sdk";
import { buildPriceExtractPrompt } from "./libs/claude-prompts";
import { parsePriceDecision } from "./libs/claude-parser";

// Main workflow entry point
export async function execute(context: WorkflowContext) {
  const agent = new Agent(context.agentOptions || {});

  console.log("Task:", context.task);
  console.log("Params:", context.params);
  console.log("Executing workflow...");

  try {
    const byAgentRaw = await agent.complete(buildPriceExtractPrompt("11.4"));
    const byAgent = parsePriceDecision(byAgentRaw.text);
    console.log("byAgentRaw:", byAgentRaw);
    console.log("byAgent:", byAgent);
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
