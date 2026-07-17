import { execSync } from 'child_process';

const numbersText = execSync(`gh issue list --state open --author "@me" --json number -q '.[].number'`).toString();
const numbers = numbersText.split('\n').filter(n => n.trim() !== '');

for (const num of numbers) {
  // Only close issues greater than 200 to be safe
  if (parseInt(num) > 205) {
    console.log(`Closing issue #${num}...`);
    try {
      execSync(`gh issue close ${num} -r "not planned"`);
    } catch(e) {}
  }
}
console.log("Done closing old test issues.");
