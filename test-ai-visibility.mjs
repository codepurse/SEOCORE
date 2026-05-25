
import { runAiVisibility } from './packages/cli/src/ai-visibility/index.js';

async function test() {
  console.log('Testing AI Visibility on navixhealth.com...');
  const result = await runAiVisibility('https://navixhealth.com', { silent: false });
  console.log('\nFinal Result:', JSON.stringify(result, null, 2));
}

test().catch(console.error);
