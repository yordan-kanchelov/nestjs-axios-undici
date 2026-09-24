// k6 benchmark for the Node.js 26 stack (ports 3031-3037).
// Shared scenarios, checks and summary output live in ./lib/benchmark.js.
import { createBenchmark } from './lib/benchmark.js';

const benchmark = createBenchmark({ nodeVersion: 26, portBase: 3030 });

export const options = benchmark.options;
export const handleSummary = benchmark.handleSummary;

export const testExpressAxios = benchmark.tests.testExpressAxios;
export const testFastifyAxios = benchmark.tests.testFastifyAxios;
export const testFastifyUndici = benchmark.tests.testFastifyUndici;
export const testExpressAxiosInterceptor = benchmark.tests.testExpressAxiosInterceptor;
export const testFastifyAxiosInterceptor = benchmark.tests.testFastifyAxiosInterceptor;
export const testFastifyUndiciInterceptor = benchmark.tests.testFastifyUndiciInterceptor;
