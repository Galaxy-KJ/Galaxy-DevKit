import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const filePath = '/Users/kevinbrenes/.gemini/antigravity/brain/38ef4280-a10a-461a-ad70-e8ef21d14968/roadmap_analysis_and_issues.md';
  const content = fs.readFileSync(filePath, 'utf-8');

  const issueRegex = /### Issue \d+\n\n```markdown\n---([\s\S]*?)---\n\n([\s\S]*?)```/g;
  let match;
  let count = 0;

  while ((match = issueRegex.exec(content)) !== null) {
    count++;
    if (count < 15) {
      continue;
    }

    const frontmatter = match[1];
    const body = match[2].trim();

    const titleMatch = frontmatter.match(/title:\s*'(.*?)'/);
    const labelsMatch = frontmatter.match(/labels:\s*(.*?)\n/);

    const title = titleMatch ? titleMatch[1] : `[FEATURE] Issue ${count}`;
    const labelsStr = labelsMatch ? labelsMatch[1] : 'enhancement';
    
    // Split on comma and create multiple --label args
    const labelArgs = labelsStr.split(',').map(l => `--label "${l.trim()}"`).join(' ');

    console.log(`\nCreando Issue #${count}: ${title}`);
    
    fs.writeFileSync('/tmp/issue_temp.md', body);

    try {
      const args = [
        'gh issue create',
        `--title "${title.replace(/"/g, '\\"')}"`,
        labelArgs,
        `--body-file /tmp/issue_temp.md`
      ].join(' ');

      const { stdout, stderr } = await execAsync(args, { cwd: '/Users/kevinbrenes/Galaxy-DevKit-1' });
      console.log(`✅ Creado exitosamente: ${stdout.trim()}`);
    } catch (e) {
      console.error(`❌ Falló al crear el issue #${count}:\n${e.message}`);
    }

    // 5 seconds to be safe from GitHub anti-abuse mechanisms
    console.log('Esperando 5 segundos para el rate-limit...');
    await sleep(5000);
  }
}

main().catch(console.error);
