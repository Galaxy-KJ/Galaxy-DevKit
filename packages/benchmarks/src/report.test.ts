import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareReports, type BenchReport } from './report.ts';

function report(rows: BenchReport['rows']): BenchReport {
  return { generatedAt: 'test', machine: 'test', rows };
}

describe('compareReports', () => {
  it('passes when p95 is within 20%', () => {
    const baseline = report([{ name: 'cache hit', hz: 1000, meanMs: 1, p95Ms: 2, samples: 10 }]);
    const observed = report([{ name: 'cache hit', hz: 950, meanMs: 1.1, p95Ms: 2.3, samples: 10 }]);
    assert.equal(compareReports(baseline, observed).length, 0);
  });

  it('fails a deliberate p95 regression of 25%', () => {
    const baseline = report([{ name: 'cache hit', hz: 1000, meanMs: 1, p95Ms: 2, samples: 10 }]);
    const observed = report([{ name: 'cache hit', hz: 1000, meanMs: 1, p95Ms: 2.5, samples: 10 }]);
    const failures = compareReports(baseline, observed);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].metric, 'p95');
  });

  it('fails a throughput drop of 25%', () => {
    const baseline = report([{ name: 'cache hit', hz: 1000, meanMs: 1, p95Ms: 2, samples: 10 }]);
    const observed = report([{ name: 'cache hit', hz: 700, meanMs: 1, p95Ms: 2, samples: 10 }]);
    const failures = compareReports(baseline, observed);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].metric, 'hz');
  });
});
