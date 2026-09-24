// k6 benchmark for the Node.js 24 stack (ports 3021-3027).
// Shared scenarios, checks and summary output live in ./lib/benchmark.js.
import { createBenchmark } from './lib/benchmark.js';

const benchmark = createBenchmark({ nodeVersion: 24, portBase: 3020 });

export const options = benchmark.options;
export const handleSummary = benchmark.handleSummary;

export const testExpressAxios = benchmark.tests.testExpressAxios;
export const testFastifyAxios = benchmark.tests.testFastifyAxios;
export const testFastifyUndici = benchmark.tests.testFastifyUndici;
export const testExpressAxiosInterceptor = benchmark.tests.testExpressAxiosInterceptor;
export const testFastifyAxiosInterceptor = benchmark.tests.testFastifyAxiosInterceptor;
export const testFastifyUndiciInterceptor = benchmark.tests.testFastifyUndiciInterceptor;
