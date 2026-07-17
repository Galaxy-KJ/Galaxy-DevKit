import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const filePath = '/Users/kevinbrenes/.gemini/antigravity-ide/brain/0c2a77cb-cd20-4b9b-ae64-790a8b789e21/scratch/new_roadmap_issues.md';
  const content = fs.readFileSync(filePath, 'utf-8');

  // Split by "### Issue " to isolate blocks completely bypassing internal code block collisions
  const blocks = content.split(/^### Issue \d+\n+/m);
  let count = 0;

  for (let i = 1; i < blocks.length; i++) {
    let block = blocks[i].trim();
    count++;

    // Remove the enclosing markdown block backticks that wrap the entire issue
    if (block.startsWith('```markdown')) {
      block = block.substring('```markdown'.length).trim();
    }
    if (block.endsWith('```')) {
      block = block.substring(0, block.length - 3).trim();
    }

    // Now block is the raw YAML frontmatter + body
    const fmEndIndex = block.indexOf('---', 4);
    if (fmEndIndex === -1) continue;

    const frontmatter = block.substring(0, fmEndIndex + 3);
    const body = block.substring(fmEndIndex + 3).trim();

    const titleMatch = frontmatter.match(/title:\s*'(.*?)'/);
    const labelsMatch = frontmatter.match(/labels:\s*(.*?)\n/);

    const title = titleMatch ? titleMatch[1] : `[FEATURE] Issue ${count}`;
    const labelsStr = labelsMatch ? labelsMatch[1] : 'enhancement';
    
    // Split on comma and create multiple --label args
    const labelArgs = labelsStr.split(',').map(l => `--label "${l.trim()}"`).join(' ');

    console.log(`\n[${count}/10] Creando Issue: ${title}`);
    
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

    if (i < blocks.length - 1) {
      console.log('Esperando 5 segundos para el rate-limit de GitHub...');
      await sleep(5000);
    }
  }

  console.log('\n🎉 ¡Proceso finalizado! Todos los issues han sido procesados.');
}

main().catch(console.error);
