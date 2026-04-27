import { Agent, AgentOptions } from '@greaseclaw/workflow-sdk';
import { createWorkflowApis } from '../api';

// 扩展 Window 类型以包含 agentOptions
declare global {
  interface Window {
    agentOptions?: AgentOptions;
  }
}

interface SearchRequest {
  query: string;
  location?: string;
}

class XianyuAgentUI {
  private searchInput: HTMLInputElement;
  private startBtn: HTMLButtonElement;
  private statusDiv: HTMLElement;
  private agent: Agent | null = null;
  private apis: ReturnType<typeof createWorkflowApis> | null = null;

  constructor() {
    this.searchInput = document.getElementById('searchInput') as HTMLInputElement;
    this.startBtn = document.getElementById('startBtn') as HTMLButtonElement;
    this.statusDiv = document.getElementById('status') as HTMLElement;

    this.init();
  }

  private init(): void {
    this.startBtn.addEventListener('click', this.handleSearch.bind(this));
    this.searchInput.addEventListener('keypress', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        this.handleSearch();
      }
    });
  }

  private async initAgent(): Promise<void> {
    if (this.agent) return;

    this.agent = new Agent(window.agentOptions || {});
    this.apis = createWorkflowApis(this.agent);

    // 测试数据库
    await this.testDatabase();
  }

  private async testDatabase(): Promise<void> {
    if (!this.agent) return;

    const db = this.agent.getDb();

    // 定义数据库 schema
    db.version(1).stores({
      searches: '++id, query, timestamp'
    });

    // 添加一条测试记录
    await db.table('searches').add({
      query: 'test query',
      timestamp: Date.now()
    });

    // 读取所有记录
    const allRecords = await db.table('searches').toArray();
    console.log('Database test - all records:', allRecords);
  }

  private showStatus(message: string, type: 'success' | 'error' | 'loading'): void {
    this.statusDiv.textContent = message;
    this.statusDiv.className = `status ${type}`;
    this.statusDiv.style.display = 'block';
  }

  private parseQuery(query: string): SearchRequest {
    const parts = query.split(/\s+/);
    const locationMatch = parts.find(p =>
      ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '南京', '苏州', '天津'].includes(p)
    );

    return {
      query: query,
      location: locationMatch
    };
  }

  private async handleSearch(): Promise<void> {
    const query = this.searchInput.value.trim();

    if (!query) {
      this.showStatus('请输入搜索内容', 'error');
      return;
    }

    this.showStatus('正在初始化...', 'loading');
    this.startBtn.disabled = true;

    try {
      await this.initAgent();

      const request = this.parseQuery(query);
      this.showStatus('正在搜索中...', 'loading');

      // 调用实际的 search API
      const result = await this.apis!.search(request.query);

      if (result.success && result.task?.extract_data) {
        // 解析 extract_data: [{"waited":0},{"links":[...]}]
        const data = JSON.parse(result.task.extract_data);
        const linksItem = data.find((item: any) => item.links);
        const links = linksItem?.links || [];
        this.showStatus(`搜索完成！找到 ${links.length} 个商品`, 'success');
        console.log('Search results:', links);
      } else {
        this.showStatus(result.error || '搜索失败', 'error');
      }
    } catch (error) {
      this.showStatus(`网络错误，请稍后重试 ${error}`, 'error');
    } finally {
      this.startBtn.disabled = false;
    }
  }
}

// 初始化 UI
document.addEventListener('DOMContentLoaded', () => {
  new XianyuAgentUI();
});