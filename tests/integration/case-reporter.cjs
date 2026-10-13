class CaseReporter {
  onRunComplete(_contexts, results) {
    for (const suite of results.testResults) {
      for (const test of suite.testResults) {
        const marker = test.status === "passed" ? "✓" : "✗";
        process.stdout.write(`  ${marker} ${test.fullName}\n`);
      }
    }
  }
}

module.exports = CaseReporter;
