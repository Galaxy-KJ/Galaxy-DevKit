import fs from 'fs';
import { execSync } from 'child_process';
import { promisify } from 'util';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log("Fetching open issues from GitHub...");
  const issuesJson = execSync(`gh issue list --state open --author "@me" --limit 100 --json number,title`).toString();
  const githubIssues = JSON.parse(issuesJson);

  const filePath = '/Users/kevinbrenes/.gemini/antigravity/brain/38ef4280-a10a-461a-ad70-e8ef21d14968/roadmap_analysis_and_issues.md';
  const content = fs.readFileSync(filePath, 'utf-8');

  // Split by "### Issue " to isolate blocks completely bypassing internal code block collisions
  const blocks = content.split(/^### Issue \d+\n+/m);
  
  let updatedCount = 0;

  for (let i = 1; i < blocks.length; i++) {
    let block = blocks[i].trim();
    
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
    if (!titleMatch) continue;

    const title = titleMatch[1];
    const matchedIssue = githubIssues.find(iss => iss.title === title || iss.title.includes(title) || title.includes(iss.title));

    if (matchedIssue) {
      console.log(`Matching Issue found: Github #${matchedIssue.number} <=> Local Title: ${title}`);
      
      const tmpPath = `/tmp/edit_issue_${matchedIssue.number}.md`;
      fs.writeFileSync(tmpPath, body);

      try {
        execSync(`gh issue edit ${matchedIssue.number} --body-file ${tmpPath}`);
        updatedCount++;
      } catch (e) {
        console.error(`Failed to update #${matchedIssue.number}: ${e.message}`);
      }
      
      await sleep(1500); 
    }
  }

  console.log(`\nSuccessfully updated ${updatedCount} issues!`);
}

main().catch(console.error);
