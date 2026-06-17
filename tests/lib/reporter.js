const config = require('../config');
const fs = require('fs');

// Colors for console output
const C = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

class Reporter {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
    this.currentSuite = '';
  }

  setSuite(name) {
    this.currentSuite = name;
    console.log(`\n${C.bold}${C.cyan}━━━ ${name} ━━━${C.reset}`);
  }

  pass(testName, duration = 0, details = '') {
    this.results.push({
      suite: this.currentSuite,
      name: testName,
      status: 'pass',
      duration,
      details
    });
    const time = duration ? ` ${C.dim}(${duration}ms)${C.reset}` : '';
    console.log(`  ${C.green}✅${C.reset} ${testName}${time}`);
  }

  fail(testName, error, duration = 0) {
    this.results.push({
      suite: this.currentSuite,
      name: testName,
      status: 'fail',
      duration,
      error: error.message || String(error)
    });
    console.log(`  ${C.red}❌ ${testName}${C.reset}`);
    console.log(`     ${C.red}${error.message || error}${C.reset}`);
  }

  warn(testName, message) {
    this.results.push({
      suite: this.currentSuite,
      name: testName,
      status: 'warn',
      message
    });
    console.log(`  ${C.yellow}⚠️  ${testName}: ${message}${C.reset}`);
  }

  skip(testName, reason = '') {
    this.results.push({
      suite: this.currentSuite,
      name: testName,
      status: 'skip',
      reason
    });
    console.log(`  ${C.yellow}⏭️  ${testName}${C.dim} (skipped: ${reason})${C.reset}`);
  }

  info(message) {
    console.log(`  ${C.dim}ℹ️  ${message}${C.reset}`);
  }

  summary() {
    const total = this.results.length;
    const passed = this.results.filter(r => r.status === 'pass').length;
    const failed = this.results.filter(r => r.status === 'fail').length;
    const warnings = this.results.filter(r => r.status === 'warn').length;
    const skipped = this.results.filter(r => r.status === 'skip').length;
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const pct = total > 0 ? Math.round((passed / total) * 100) : 0;

    console.log('\n' + '═'.repeat(60));
    const status = failed > 0 ? `${C.red}FAILED${C.reset}` : `${C.green}PASSED${C.reset}`;
    console.log(`${C.bold}E2E Results: ${status}${C.reset}`);
    console.log('═'.repeat(60));
    console.log(`  Total:     ${total}`);
    console.log(`  ${C.green}Passed:    ${passed}${C.reset}`);
    console.log(`  ${C.red}Failed:    ${failed}${C.reset}`);
    if (warnings) console.log(`  ${C.yellow}Warnings:  ${warnings}${C.reset}`);
    if (skipped) console.log(`  ${C.yellow}Skipped:   ${skipped}${C.reset}`);
    console.log(`  Success:   ${pct}%`);
    console.log(`  Duration:  ${duration}s`);
    console.log('═'.repeat(60) + '\n');

    return { total, passed, failed, warnings, skipped, pct, duration };
  }

  async writeReport() {
    const stats = this.summary();
    const report = {
      timestamp: new Date().toISOString(),
      stats,
      results: this.results
    };

    // JSON report
    fs.writeFileSync(config.reportFile, JSON.stringify(report, null, 2));

    // Markdown report
    let md = `# E2E Test Report\n\n`;
    md += `**Date:** ${report.timestamp}\n`;
    md += `**Status:** ${stats.failed > 0 ? '❌ FAILED' : '✅ PASSED'}\n`;
    md += `**Duration:** ${stats.duration}s\n\n`;
    md += `| Metric | Value |\n|---|---|\n`;
    md += `| Total | ${stats.total} |\n`;
    md += `| Passed | ${stats.passed} |\n`;
    md += `| Failed | ${stats.failed} |\n`;
    md += `| Warnings | ${stats.warnings} |\n`;
    md += `| Success Rate | ${stats.pct}% |\n\n`;

    // Group by suite
    const suites = {};
    for (const r of this.results) {
      if (!suites[r.suite]) suites[r.suite] = [];
      suites[r.suite].push(r);
    }

    for (const [suite, tests] of Object.entries(suites)) {
      md += `## ${suite}\n\n`;
      md += `| Test | Status | Duration | Details |\n|---|---|---|---|\n`;
      for (const t of tests) {
        const icon = t.status === 'pass' ? '✅' : t.status === 'fail' ? '❌' : t.status === 'warn' ? '⚠️' : '⏭️';
        const dur = t.duration ? `${t.duration}ms` : '-';
        const detail = t.error || t.message || t.reason || '';
        md += `| ${t.name} | ${icon} ${t.status} | ${dur} | ${detail} |\n`;
      }
      md += '\n';
    }

    fs.writeFileSync(config.reportMd, md);
  }

  getExitCode() {
    return this.results.some(r => r.status === 'fail') ? 1 : 0;
  }
}

module.exports = new Reporter();
