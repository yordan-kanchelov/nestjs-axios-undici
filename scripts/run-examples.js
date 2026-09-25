#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const examples = [
  { name: 'OpenTelemetry Integration', file: 'examples/opentelemetry-integration.ts' },
  { name: 'Axios Compatibility Features', file: 'examples/axios-compatibility-features.ts' },
  { name: 'Axios Headers Example', file: 'examples/axios-headers-example.ts' },
  { name: 'Interceptors', file: 'examples/interceptors.ts' },
  { name: 'Axios to Undici Migration', file: 'examples/axios-to-undici-migration.ts' },
];

// Local stand-in for the example APIs, so the run doesn't depend on external hosts.
// Echoes the request back as JSON, like jsonplaceholder/httpbin.
function startEchoServer() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      const id = Number((req.url.match(/\/posts\/(\d+)/) || [])[1]) || 101;
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          id,
          title: 'example post',
          method: req.method,
          url: req.url,
          headers: req.headers,
          body,
        }),
      );
    });
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

let passed = 0;
let failed = 0;
const results = [];

console.log('🧪 Running examples as tests...\n');

async function runExample(example, baseUrl) {
  return new Promise(resolve => {
    console.log(`📋 Running: ${example.name}`);

    const startTime = Date.now();
    let output = '';
    let errorOutput = '';

    const command = 'npx';
    const args = ['ts-node', '--project', 'examples/tsconfig.json', example.file];
    const options = { cwd: path.resolve(__dirname, '..') };

    const child = spawn(command, args, {
      ...options,
      env: { ...process.env, NODE_ENV: 'test', EXAMPLES_BASE_URL: baseUrl },
      // Own process group, so a timeout can stop npx and the example it runs
      detached: true,
    });

    // Record each example once: killing a timed-out child also fires 'close'
    let settled = false;

    child.stdout.on('data', data => {
      output += data.toString();
    });

    child.stderr.on('data', data => {
      errorOutput += data.toString();
    });

    // Set a timeout for long-running examples
    const timeout = setTimeout(() => {
      settled = true;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
      console.log(`⏱️  Timeout: ${example.name} (30s)`);
      failed++;
      results.push({
        name: example.name,
        status: 'timeout',
        duration: 30000,
        error: 'Example timed out after 30 seconds',
      });
      resolve();
    }, 30000);

    child.on('close', code => {
      clearTimeout(timeout);
      if (settled) {
        return;
      }
      settled = true;
      const duration = Date.now() - startTime;

      if (code === 0) {
        console.log(`✅ Passed: ${example.name} (${duration}ms)`);
        passed++;
        results.push({
          name: example.name,
          status: 'passed',
          duration,
          output: output.substring(0, 200), // Keep first 200 chars
        });
      } else {
        console.log(`❌ Failed: ${example.name} (${duration}ms)`);
        console.log(`   Error: ${errorOutput || output}`);
        failed++;
        results.push({
          name: example.name,
          status: 'failed',
          duration,
          error: errorOutput || output || `Process exited with code ${code}`,
        });
      }

      console.log(''); // Empty line for readability
      resolve();
    });
  });
}

async function runAllExamples() {
  const server = await startEchoServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Run examples sequentially
  for (const example of examples) {
    await runExample(example, baseUrl);
  }
  server.close();

  // Print summary
  console.log('📊 Test Summary');
  console.log('================');
  console.log(`Total: ${examples.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('');

  // Print detailed results
  console.log('📋 Detailed Results');
  console.log('===================');
  results.forEach(result => {
    const icon = result.status === 'passed' ? '✅' : '❌';
    console.log(`${icon} ${result.name} (${result.duration}ms)`);
    if (result.status === 'failed' || result.status === 'timeout') {
      console.log(`   ${result.error.split('\n')[0]}`);
    }
  });

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Test run interrupted');
  process.exit(1);
});

runAllExamples().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
