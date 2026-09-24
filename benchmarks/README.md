# NestJS HTTP Performance Comparison: Fastify vs Express vs Undici

A performance benchmark comparing HTTP client/server configurations in NestJS applications, with and without interceptors. See [Architecture](#-architecture) section for detailed configuration descriptions.

> This directory lives inside the [nestjs-undici-interceptors](../README.md) repository (it was previously the standalone `nestjs-undici-performance` repository). The **Fastify + Undici + Interceptor** app runs against the library built from this checkout, so every change to `src/` can be benchmarked before it is published. The other apps use published packages (`@nestjs/axios`, upstream `nestjs-undici`) as fixed reference points. Results are also published on the [documentation site](https://yordan-kanchelov.github.io/nestjs-undici/#/docs/benchmarks).

## 🏆 Performance Results Summary

<!-- perf-summary:start -->
> **TL;DR: Undici is 71-74% faster than Axios across Node.js 20, 22, 24, 26**

### Latest Benchmark Results

| Configuration | Avg Response Time | vs Baseline | Throughput |
|--------------|-------------------|-------------|------------|
| **Express + Axios** | 79-112ms | baseline | 100% |
| **Fastify + Axios** | 79-97ms | 0-15% faster | 100-118% |
| **Fastify + Undici** | **20-28ms** | **74-75% faster** | **375-402%** |

*Results from Node.js 20, 22, 24, 26. [View detailed results](#-latest-performance-results) | [View full report](results/PERFORMANCE-COMPARISON-REPORT.md)*
<!-- perf-summary:end -->

## 🎯 What This Repository Tests

### Core Performance Comparison
This repository benchmarks the performance difference between Axios-based and Undici-based HTTP clients in a real-world NestJS application scenario. Each test application:

1. **Receives incoming HTTP requests** at its `/api` endpoint
2. **Makes 5 parallel outbound HTTP requests** to a mock service
3. **Aggregates the responses** using `Promise.all()`
4. **Returns the combined data** with timing information

### Key Differences Being Tested

#### Implementation Differences
- **Axios-based modules**: Uses observables with `firstValueFrom()`, direct `.get()` method, automatic JSON parsing
- **Undici-based module**: Uses observables with `lastValueFrom()`, `.request()` method, manual JSON parsing with `res.body.json()`

#### Performance Metrics Measured
- **Response Time**: Average, median, P95, P99, min, and max latencies
- **Throughput**: Requests per second (RPS) under various load conditions
- **Concurrent User Handling**: Performance with 50 and 100 concurrent users
- **Error Rates**: Reliability under load
- **Cross-Node.js Version Performance**: Tests on Node.js 20, 22, 24, and 26

### Test Scenario Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│   k6 Test   │────►│ NestJS Fastify   │────►│              │
│             │     │ Fastify + Axios  │     │              │
└─────────────┘     │    Port 3002     │     │              │
                    └──────────────────┘     │              │
                                             │              │
┌─────────────┐     ┌──────────────────┐     │ Mock Service │
│   k6 Test   │────►│ NestJS Express   │────►│              │
│             │     │ Express + Axios  │     │  Port 3001   │
└─────────────┘     │    Port 3004     │     │              │
                    └──────────────────┘     │              │
                                             │              │
┌─────────────┐     ┌──────────────────┐     │              │
│   k6 Test   │────►│  NestJS Undici   │────►│              │
│             │     │ Fastify + Undici │     │              │
└─────────────┘     │    Port 3003     │     └──────────────┘
                    └──────────────────┘

Each service makes 5 parallel requests to the mock service.
Port mappings for different Node versions:
- Node 20: Ports 3001-3007
- Node 22: Ports 3011-3017
- Node 24: Ports 3021-3027
- Node 26: Ports 3031-3037
```

### Why This Matters
The test simulates a common microservices pattern where a gateway service needs to aggregate data from multiple upstream services. The 5 parallel requests represent typical API orchestration scenarios like:
- Fetching user profile, permissions, preferences, notifications, and activity in parallel
- Aggregating data from multiple microservices for a dashboard
- Parallel validation checks against different services

## 🚀 Quick Start

### Prerequisites
- Node.js 20+ (tests support Node.js 20, 22, 24, and 26)
- Docker and Docker Compose
- k6 load testing tool (`brew install k6` on macOS)
- jq for JSON parsing (optional, `brew install jq` on macOS)

### Running the Tests

#### Option 1: Test All Node.js Versions (Recommended)

1. **Clone, build the library and install dependencies:**
   ```bash
   git clone https://github.com/yordan-kanchelov/nestjs-undici.git
   cd nestjs-undici/benchmarks
   ./scripts/pack-lib.sh          # build + pack the library from this checkout into .lib/
   npm ci && npm run install-lib  # benchmark deps, then the packed library
   ```
   Re-run `./scripts/pack-lib.sh && npm run install-lib` after changing `src/`. The Docker images install the same `.lib/` tarball.

2. **Run comprehensive tests across Node.js 20, 22, 24, and 26:**
   ```bash
   ./test-all-node-versions.sh
   ```
   
   This automatically:
   - Tests each Node version sequentially
   - Generates separate results for each version
   - Creates a comprehensive analysis
   - Takes approximately 8-10 minutes total

3. **View results:**
   ```bash
   # View comprehensive analysis
   cat results/PERFORMANCE-COMPARISON-REPORT.md
   
   # View specific version results
   cat results/node20-performance-comparison.csv
   cat results/node22-performance-comparison.csv
   cat results/node24-performance-comparison.csv
   cat results/node26-performance-comparison.csv
   ```

#### Option 2: Test Individual Node Version

1. **Start services for specific Node version:**
   ```bash
   # For Node.js 20 (default)
   docker-compose up --build
   
   # For Node.js 22
   docker-compose -f docker-compose-node22.yml up --build
   
   # For Node.js 24
   docker-compose -f docker-compose-node24.yml up --build

   # For Node.js 26
   docker-compose -f docker-compose-node26.yml up --build
   ```

2. **Run the corresponding k6 test:**
   ```bash
   # For Node.js 20
   k6 run k6-scripts/test-node20.js
   
   # For Node.js 22
   k6 run k6-scripts/test-node22.js
   
   # For Node.js 24
   k6 run k6-scripts/test-node24.js

   # For Node.js 26
   k6 run k6-scripts/test-node26.js
   ```

## 📊 Latest Performance Results

### Load Testing Methodology

The performance tests use k6 to simulate realistic load patterns:

1. **Load Pattern** (70 seconds total):
   - 0→50 users: Ramp up over 10 seconds
   - 50 users: Maintain for 20 seconds
   - 50→100 users: Ramp up over 10 seconds
   - 100 users: Maintain for 20 seconds
   - 100→0 users: Ramp down over 10 seconds

2. **Test Execution**:
   - Tests run sequentially (not concurrently) to avoid interference
   - The six configurations run one after another, 75 seconds apart
   - Each user continuously makes requests with minimal think time
   - Total duration: ~7.5 minutes per Node.js version

3. **What Each Request Tests**:
   - Client → NestJS Service: Initial request to `/api`
   - NestJS Service → Mock Service: 5 parallel HTTP GET requests
   - Mock Service: Returns JSON with random data
   - NestJS Service → Client: Aggregated response with timing data

### Performance Results

<!-- perf-details:start -->
With 5 parallel HTTP requests per endpoint call, tested across Node.js 20, 22, 24, 26:

| Node Version | Configuration | Avg Response (ms) | P95 (ms) | P99 (ms) | vs Express+Axios |
|--------------|---------------|-------------------|----------|----------|------------------|
| **Node 20** | Express + Axios | 112.35 | 229.43 | 343.81 | baseline |
| **Node 20** | Fastify + Axios | 97.14 | 200.34 | 296.68 | 13.5% faster |
| **Node 20** | Fastify + Undici | 28.29 | 51.67 | 64.58 | **74.8% faster** |
| **Node 22** | Express + Axios | 98.87 | 202.82 | 306.80 | baseline |
| **Node 22** | Fastify + Axios | 83.81 | 175.80 | 263.82 | 15.2% faster |
| **Node 22** | Fastify + Undici | 24.49 | 45.17 | 56.53 | **75.2% faster** |
| **Node 24** | Express + Axios | 82.50 | 177.39 | 243.64 | baseline |
| **Node 24** | Fastify + Axios | 79.92 | 168.42 | 223.76 | 3.1% faster |
| **Node 24** | Fastify + Undici | 21.86 | 39.07 | 49.04 | **73.5% faster** |
| **Node 26** | Express + Axios | 79.21 | 169.73 | 227.46 | baseline |
| **Node 26** | Fastify + Axios | 79.27 | 171.09 | 228.45 | 0.1% slower |
| **Node 26** | Fastify + Undici | 20.47 | 37.68 | 47.25 | **74.2% faster** |

#### With Interceptors

| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici |
|--------------|-----------------|-----------------|------------------|
| **Node 20** | 129.88ms (+15.6%) | 108.70ms (+11.9%) | 48.35ms (+70.9%) |
| **Node 22** | 124.11ms (+25.5%) | 103.02ms (+22.9%) | 45.83ms (+87.2%) |
| **Node 24** | 95.21ms (+15.4%) | 90.84ms (+13.7%) | 39.03ms (+78.5%) |
| **Node 26** | 98.06ms (+23.8%) | 94.09ms (+18.7%) | 40.24ms (+96.6%) |

### Key Findings

- **Undici is 71-74% faster than Axios** on the same framework (Fastify) across all tested Node.js versions
- **Framework impact is smaller**: Fastify is -0.1 to 15.2% faster than Express with Axios
- **Best configuration**: Fastify + Undici at 20-28ms average, fastest on Node.js 26 (20.47ms)
- **Throughput**: Fastify + Undici delivers 275-302% more requests/s than Express + Axios
- **Interceptors**: Fastify + Undici with interceptors averages 39-48ms, still well ahead of every Axios configuration
<!-- perf-details:end -->

**Conclusion:** For maximum performance in NestJS applications, use the Undici HTTP client. The choice of HTTP client (Undici vs Axios) has a much larger impact on performance than the choice of server framework (Fastify vs Express); see the findings above for the measured ranges.

## 🏗️ Architecture

### Configurations Being Compared

#### 1. Express + Axios (Default NestJS Setup)
- Uses the default **Express** server adapter
- HTTP client: **@nestjs/axios** (Axios-based)
- Most common NestJS configuration
- Feature-rich but with performance overhead

#### 2. Fastify + Axios (Performance-Oriented)
- Uses **Fastify** server adapter for better performance
- HTTP client: **@nestjs/axios** (Axios-based)
- Same HTTP client as Express setup for fair comparison
- Demonstrates server adapter impact on performance

#### 3. Fastify + Undici (Maximum Performance)
- Uses **Fastify** server adapter
- HTTP client: **nestjs-undici** (Undici-based)
- Undici is a modern HTTP/1.1 client written from scratch for Node.js
- Developed by the Node.js team for optimal performance
- Combines the fastest server adapter with the fastest HTTP client

Each NestJS service:
1. Receives a GET request at `/api`
2. Makes 5 parallel HTTP requests to the mock service
3. Waits for all requests to complete using `Promise.all()`
4. Returns aggregated data with timing information

### Mock Service Response Format
```json
{
  "id": 12345,
  "name": "Mock Service Response",
  "timestamp": "2025-06-15T10:30:00.000Z",
  "data": {
    "status": "success",
    "message": "Response from mock service",
    "value": 0.123456789
  }
}
```

## 🧪 Alternative Test Methods

### HttpService Micro-benchmark (regression check)

`micro/compare.js` measures `HttpService` throughput of two library builds against a local keep-alive server, alternating rounds so machine noise hits both sides equally. CI runs it on every pull request that touches `src/` (base branch vs PR) and fails on a drop of more than 10%:

```bash
# from the repository root; both directories need a built lib/ and resolvable node_modules
node benchmarks/micro/compare.js --base ../base-checkout --head . --rounds 5 --duration 5 --threshold 10
```

### Continuous Integration

`.github/workflows/benchmarks.yml` in the repository root:
- **Pull requests**: typechecks the apps on Node.js 20-26 and runs the micro-benchmark regression check.
- **Pushes to main** (touching `src/` or `benchmarks/`) and manual runs: the full Docker + k6 benchmark on Node.js 20, 22, 24 and 26. When every version succeeds, the results, this README's tables and `docs/benchmarks.md` are regenerated and committed.

### Local Development (without Docker)

1. **Start services individually:**
   ```bash
   # Terminal 1 - Mock service
   npx nx serve mock-service

   # Terminal 2 - Fastify+Axios service
   npx nx serve nestjs-fastify-axios

   # Terminal 3 - Fastify+Undici service
   npx nx serve nestjs-fastify-undici
   
   # Terminal 4 - Express+Axios service
   npx nx serve nestjs-express-axios
   ```

2. **Run simple test:**
   ```bash
   ./simple-test.sh
   ```

### Manual Testing

Test individual endpoints:
```bash
# Fastify+Axios
curl http://localhost:3002/api | jq

# Fastify+Undici
curl http://localhost:3003/api | jq

# Express+Axios
curl http://localhost:3004/api | jq
```

## 📁 Project Structure

```
nestjs-undici/
├── apps/
│   ├── mock-service/      # Simple Fastify server
│   │   └── Dockerfile     # Multi-version Docker config
│   ├── nestjs-fastify-axios/  # NestJS with Fastify + @nestjs/axios
│   │   └── Dockerfile         # Multi-version Docker config
│   ├── nestjs-express-axios/  # NestJS with Express + @nestjs/axios
│   │   └── Dockerfile         # Multi-version Docker config
│   ├── nestjs-fastify-undici/ # NestJS with Fastify + nestjs-undici
│   │   └── Dockerfile     # Multi-version Docker config
│   ├── nestjs-express-axios-interceptor/  # Express + @nestjs/axios + interceptors
│   ├── nestjs-fastify-axios-interceptor/  # Fastify + @nestjs/axios + interceptors
│   └── nestjs-fastify-undici-interceptor/ # Fastify + nestjs-undici-interceptors
├── k6-scripts/
│   ├── lib/benchmark.js   # Shared scenarios, checks and summary output
│   ├── test-node20.js     # Node.js 20 test (~7.5 min)
│   ├── test-node22.js     # Node.js 22 test (~7.5 min)
│   ├── test-node24.js     # Node.js 24 test (~7.5 min)
│   └── test-node26.js     # Node.js 26 test (~7.5 min)
├── results/               # Test results (CSV, JSON, MD)
├── generate-comparison-report.js # Builds the report (and README tables with --update-readme)
├── docker-compose.yml       # Node.js 20 configuration
├── docker-compose-node22.yml # Node.js 22 configuration
├── docker-compose-node24.yml # Node.js 24 configuration
├── docker-compose-node26.yml # Node.js 26 configuration
├── test-all-node-versions.sh # Run all tests sequentially
└── README.md
```

## 🔧 Configuration

### Docker Configuration

All services use a unified Dockerfile approach with build arguments:
- Base image: `node:${NODE_VERSION}-slim` (defaults to Node 20)
- Build argument: `NODE_VERSION` (20, 22, 24, or 26)
- TypeScript execution via `ts-node` with proper project configuration

Example Docker build with specific Node version:
```bash
docker build --build-arg NODE_VERSION=22 -f apps/mock-service/Dockerfile .
```

### Adjusting Parallel Requests

To change the number of parallel requests (currently 5), edit:

1. `apps/nestjs-fastify-axios/src/app/app.service.ts`
2. `apps/nestjs-express-axios/src/app/app.service.ts`
3. `apps/nestjs-fastify-undici/src/app/app.service.ts`
4. Update k6 test validation: `'has data': (r) => JSON.parse(r.body).data?.length === 5`

### K6 Test Configuration

The load test uses the following pattern:
- Ramp up to 50 users over 10s
- Maintain 50 users for 20s
- Ramp up to 100 users over 10s
- Maintain 100 users for 20s
- Ramp down to 0 users over 10s

## 📈 Understanding the Results

### Key Metrics

- **Throughput (req/s)**: Higher is better - more requests handled per second
- **Response Time**: Lower is better - faster responses
- **P95/P99**: 95th/99th percentile - consistency of performance
- **Error Rate**: Should be 0% - reliability check

### Expected k6 Output

```
✓ status is 200
✓ has data

checks.........................: 100.00% ✓ 804170      ✗ 0
http_req_duration..............: avg=22.3ms  min=402µs  med=20.87ms max=188.05ms
http_req_failed................: 0.00%   ✓ 0           ✗ 402085
http_reqs......................: 402085  2772.974087/s
standard_http_duration.........: avg=30.08ms min=623µs  med=27.23ms max=144.59ms
undici_http_duration...........: avg=17.72ms min=402µs  med=15.28ms max=188.05ms
```

## 🛠️ Troubleshooting

### Docker Issues
```bash
# Clean rebuild
docker-compose down
docker-compose up --build
```

### Port Conflicts
Ensure ports 3001-3004 are available:
```bash
lsof -i :3001-3004
```

### k6 Command Not Found
Install k6: https://k6.io/docs/getting-started/installation/

### Undici Module Issues
If you see "Cannot find module 'undici'":
```bash
npm install undici
```

## 🏃 Available Scripts

- `./test-all-node-versions.sh` - Run performance tests across Node.js 20, 22, 24, and 26
- `node generate-comparison-report.js` - Build `results/PERFORMANCE-COMPARISON-REPORT.md` from the per-version results
- `node generate-comparison-report.js --update-readme` - Refresh the result tables in this README
- `./simple-test.sh` - Quick manual testing with curl for all services

### Docker Compose Files

- `docker-compose.yml` - Node.js 20 services (ports 3001-3007)
- `docker-compose-node22.yml` - Node.js 22 services (ports 3011-3017)
- `docker-compose-node24.yml` - Node.js 24 services (ports 3021-3027)
- `docker-compose-node26.yml` - Node.js 26 services (ports 3031-3037)

## 📝 Notes

- Tests are configured for 5 parallel requests per endpoint
- Six configurations tested: Express+Axios, Fastify+Axios, Fastify+Undici, each with and without interceptors
- Mock service simulates a simple external API
- Results are saved in CSV and JSON formats with version-specific filenames
- Each Node version uses different ports to allow parallel testing if needed
- Comprehensive analysis available in `results/PERFORMANCE-COMPARISON-REPORT.md`
- Docker images use Node.js slim variants for smaller image size

## 📄 License

MIT