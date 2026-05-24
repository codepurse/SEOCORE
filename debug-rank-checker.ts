#!/usr/bin/env node

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test values
const keyword = "emr crm behavioral health software";
const targetUrl = "https://www.netsmarttech.com";

// Import our rank checker function
const rankCheckerPath = path.join(__dirname, 'packages', 'cli', 'src', 'rank-checker.js');

async function debug() {
  console.log('=== GOOGLE RANK CHECK DEBUGGER ===\n');

  // 1. First, use our actual rank-checker
  console.log('1. Testing our rank-checker function...');
  try {
    const { checkGoogleRank } = await import('./packages/cli/src/rank-checker.js');
    const result = await checkGoogleRank(keyword, targetUrl);

    console.log(`- Target URL found: ${result.found}`);
    if (result.found) {
      console.log(`- Position: ${result.position}`);
    }
    console.log(`- Total results found: ${result.topResults.length}`);
    console.log('\nResults found:');
    result.topResults.forEach(item => {
      console.log(`  #${item.position}: ${item.title}`);
      console.log(`      ${item.url}`);
    });
  } catch (err) {
    console.error('ERROR with rank-checker:', err);
  }

  // 2. Now fetch and save the raw HTML so we can inspect it
  console.log('\n2. Fetching raw Google HTML...');
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&hl=en`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  };

  const response = await fetch(searchUrl, { headers });
  const html = await response.text();
  const htmlPath = path.join(__dirname, 'debug-google-results.html');
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`- Saved raw HTML to: ${htmlPath}`);
  console.log(`- Open this file in a browser to see what Google returned!`);

  // 3. Let's manually parse EVERYTHING to see what's there
  console.log('\n3. Manually parsing all possible links...');
  const $ = cheerio.load(html);
  
  // Find all anchor tags
  const allLinks: Array<{ title: string; url: string }> = [];
  $('a').each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    const parentText = $(el).parent().text().trim();
    
    if (href) {
      allLinks.push({ 
        title: text || parentText.substring(0, 100), 
        url: href 
      });
    }
  });

  console.log(`- Found ${allLinks.length} total links`);
  console.log('\nFirst 20 links:');
  allLinks.slice(0, 20).forEach((link, i) => {
    console.log(`  ${i + 1}. ${link.title.substring(0, 60)}...`);
    console.log(`     ${link.url}`);
  });
}

debug().catch(console.error);
