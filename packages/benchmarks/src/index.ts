import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Bench } from 'tinybench';
import {
  compareReports,
  formatFailures,
  ratioFailures,
  type BenchReport,
  type BenchRow,
} from './report.ts';
import { encryptionBench } from './suites/encryption.bench.ts';
import { cacheBench } from './suites/cache.bench.ts';
import { stellarXdrBench } from './suites/stellar-xdr.bench.ts';
import { smartRouterBench } from './suites/smart-router.bench.ts';
import { oracleTwapBench } from './suites/oracle-twap.bench.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'results');
const outFile = path.join(outDir, 'micro-latest.json');

function baselinePath(): string {
  const override = process.env.BENCH_BASELINE;
  if (override) return path.isAbsolute(override) ? override : path.join(root, override);
  const file = process.env.CI === 'true' ? 'micro.ci.json' : 'micro.json';
  return path.join(root, 'baselines', file);
}

function rowFromTask(task: {
  name: string;
  result?: {
    hz?: number;
    mean?: number;
    p99?: number;
    samples?: number[];
  } | null;
}): BenchRow {
  const r = task.result ?? {};
  const meanMs = r.mean ?? 0;
  const p95Ms = r.p99 ?? meanMs;
  return {
    name: task.name,
    hz: r.hz ?? 0,
    meanMs,
    p95Ms,
    samples: r.samples?.length ?? 0,
  };
}

async function runSuite(name: string, factory: () => Promise<Bench>): Promise<BenchRow[]> {
  const bench = await factory();
  await bench.run();
  const table = bench.table();
  if (table) {
    console.log(`\n== ${name} ==`);
    console.table(table);
  }
  return bench.tasks.map(rowFromTask);
}

async function compare(report: BenchReport): Promise<void> {
  const baseline = JSON.parse(await readFile(baselinePath(), 'utf8')) as BenchReport;
  const failures = [...compareReports(baseline, report), ...ratioFailures(report)];
  if (failures.length > 0) {
    console.error('benchmark regression:\n' + formatFailures(failures));
    process.exit(1);
  }
  console.log(`baseline comparison: ok (${path.basename(baselinePath())})`);
}

async function main(): Promise<void> {
  const compareOnly =
    process.argv.includes('--compare-only') || process.env.BENCH_COMPARE_ONLY === '1';
  const compareAfterRun =
    process.argv.includes('--compare') || process.env.BENCH_COMPARE === '1';

  if (compareOnly) {
    let report: BenchReport;
    try {
      report = JSON.parse(await readFile(outFile, 'utf8')) as BenchReport;
    } catch {
      console.error(`missing ${outFile}: run npm run bench first`);
      process.exit(1);
      return;
    }
    await compare(report);
    return;
  }

  const rows: BenchRow[] = [];
  rows.push(...(await runSuite('encryption', encryptionBench)));
  rows.push(...(await runSuite('cache', cacheBench)));
  rows.push(...(await runSuite('stellar-xdr', stellarXdrBench)));
  rows.push(...(await runSuite('smart-router', smartRouterBench)));
  rows.push(...(await runSuite('oracle-twap', oracleTwapBench)));

  const report: BenchReport = {
    generatedAt: new Date().toISOString(),
    machine: hostname(),
    rows,
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(`\nwrote ${outFile}`);

  if (compareAfterRun) {
    await compare(report);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
