import { FetchedSite } from '../fetcher.js';
import { CheckResult } from '../types.js';

function isBotBlocked(robotsTxt: string | null, botName: string): boolean {
  if (!robotsTxt) return false;

  const botLower = botName.toLowerCase();
  const lines = robotsTxt.split(/\r?\n/);
  
  let isWildcardDisallowed = false;
  let isBotDisallowed = false;
  let isBotExplicitlyAllowed = false;
  
  let currentAgents: string[] = [];
  let inRules = false;
  
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    
    const key = line.slice(0, colonIndex).trim().toLowerCase();
    const val = line.slice(colonIndex + 1).trim().toLowerCase();
    
    if (key === 'user-agent') {
      if (inRules) {
        currentAgents = [];
        inRules = false;
      }
      currentAgents.push(val);
    } else if (key === 'disallow' || key === 'allow') {
      inRules = true;
      const isDisallow = key === 'disallow';
      const path = val;
      
      for (const agent of currentAgents) {
        const agentClean = agent.replace('*', '').trim();
        if (agent === '*') {
          if (isDisallow && (path === '/' || path === '/*')) {
            isWildcardDisallowed = true;
          }
        } else if (agentClean && botLower.includes(agentClean)) {
          if (isDisallow && (path === '/' || path === '/*')) {
            isBotDisallowed = true;
          } else if (!isDisallow && (path === '/' || path === '/*')) {
            isBotExplicitlyAllowed = true;
          }
        }
      }
    }
  }
  
  if (isBotExplicitlyAllowed) return false;
  if (isBotDisallowed) return true;
  return isWildcardDisallowed;
}

export function check(site: FetchedSite): CheckResult {
  const dimension = 'AI Crawlability & Agent Access';
  const weight = 20;
  const maxScore = 100;

  if (site.fetchError) {
    return {
      dimension,
      score: 0,
      maxScore,
      weight,
      issues: [`Fetch failed: ${site.fetchError}`],
      wins: [],
    };
  }

  let score = 0;
  const issues: string[] = [];
  const wins: string[] = [];

  // 1. llms.txt present
  if (site.llmsTxt !== null) {
    score += 35;
    wins.push('/llms.txt is present and accessible (HTTP 200) — crucial for LLM model reading.');
  } else {
    issues.push('/llms.txt is missing. Create an /llms.txt file to guide AI models searching your site.');
  }

  // Robots.txt checks
  const robotsTxt = site.robotsTxt;
  if (robotsTxt === null) {
    wins.push('No /robots.txt found (defaulting to allow all agents).');
  }

  // 2. GPTBot
  const gptBlocked = isBotBlocked(robotsTxt, 'GPTBot');
  if (gptBlocked) {
    issues.push('robots.txt explicitly blocks OpenAI\'s GPTBot.');
  } else {
    score += 20;
    wins.push('robots.txt allows OpenAI\'s GPTBot.');
  }

  // 3. ClaudeBot
  const claudeBlocked = isBotBlocked(robotsTxt, 'ClaudeBot');
  if (claudeBlocked) {
    issues.push('robots.txt explicitly blocks Anthropic\'s ClaudeBot.');
  } else {
    score += 20;
    wins.push('robots.txt allows Anthropic\'s ClaudeBot.');
  }

  // 4. PerplexityBot
  const perplexityBlocked = isBotBlocked(robotsTxt, 'PerplexityBot');
  if (perplexityBlocked) {
    issues.push('robots.txt explicitly blocks Perplexity\'s PerplexityBot.');
  } else {
    score += 15;
    wins.push('robots.txt allows Perplexity\'s PerplexityBot.');
  }

  // 5. sitemap.xml present
  if (site.sitemapXml !== null) {
    score += 10;
    wins.push('/sitemap.xml is present and accessible (HTTP 200) — assists LLM content indexes.');
  } else {
    issues.push('/sitemap.xml is missing. Sitemaps are required for crawling discovery.');
  }

  const finalScore = Math.min(maxScore, score);

  return {
    dimension,
    score: finalScore,
    maxScore,
    weight,
    issues,
    wins,
  };
}
