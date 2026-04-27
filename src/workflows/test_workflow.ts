/**
 * ---
 * name: 测试
 * description: "测试页面链接生成"
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

// Main workflow entry point
export async function execute(context: WorkflowContext) {
  const agent = new Agent(context.agentOptions || {});

  console.log("Task:", context.task);
  console.log("Params:", context.params);
  console.log("Executing workflow...");

  try {
    // 生成页面链接
    const pageLink = agent.getPageLink('index', {
      query: context.task || 'test'
    });

    console.log("Generated page link:", pageLink);

    // 通过 sendText 把链接返回给用户
    await agent.sendText(
      context.chatId || 'test-chat',
      '页面链接',
      `点击以下链接打开页面：\n${pageLink}`,
      'user'
    );

    return {
      success: true,
      message: "Page link generated and sent successfully",
      pageLink: pageLink
    };
  } catch (error) {
    console.error("Workflow error:", error);
    return {
      success: false,
      message: "Workflow failed",
      error: error,
    };
  }
}
// @ts-ignore
globalThis.execute = execute;
