# NestJS HTTP Module Performance Comparison Report

## 🎯 Executive Summary

Node.js versions tested: **Node 20, Node 22, Node 24, Node 26**

**Best Performer:** Fastify + Undici averages **35.88ms** across all tested Node.js versions, **69-70% faster** than the Express + Axios baseline.

### 🏆 Key Findings

1. **HTTP client matters most** - Undici is 66-71% faster than Axios on the same framework (Fastify)
2. **Framework matters less** - Fastify is -1.4 to 7.6% faster than Express with the same client (Axios)
3. **Fastest runtime for Undici:** Node.js 26 (28.28ms average)
4. **Interceptors keep Undici ahead** - Fastify + Undici with interceptors is 29-36% faster than the best Axios configuration without interceptors
5. **Error rate:** 0% across all configurations

---

## 📊 Performance at a Glance

### Best Configuration by Node.js Version
| Node Version | Best Config | Avg Response Time | Undici vs Baseline |
|---|---|---|---|
| Node 20 | Fastify + Undici | 41.10ms | 69.0% 🟢 |
| Node 22 | Fastify + Undici | 42.88ms | 68.9% 🟢 |
| Node 24 | Fastify + Undici | 31.26ms | 68.9% 🟢 |
| Node 26 | Fastify + Undici | 28.28ms | 70.5% 🟢 |

### Rankings (average across Node.js versions)
| Rank | Configuration | Avg Response | P95 | Throughput (req/s) |
|---|---|---|---|---|
| 1 | Fastify + Undici | 35.88ms | 63.29ms | 1832 |
| 2 | Fastify + Undici + Interceptor | 75.51ms | 120.39ms | 868 |
| 3 | Fastify + Axios | 112.76ms | 194.96ms | 578 |
| 4 | Express + Axios | 116.67ms | 200.87ms | 564 |
| 5 | Fastify + Axios + Interceptor | 135.40ms | 239.55ms | 481 |
| 6 | Express + Axios + Interceptor | 145.31ms | 263.62ms | 450 |

---

## 🔍 Key Performance Metrics

### Fastify + Undici vs Express + Axios
- **Average Response Time:** 69-70% faster
- **P95 Response Time:** 67-71% faster
- **Throughput:** 219-236% higher

### Improvements by Node.js Version (average response time)
| Comparison | Node 20 | Node 22 | Node 24 | Node 26 |
|---|---|---|---|---|
| Fastify+Axios vs Express+Axios | 5.4% | 7.6% | -1.4% | -0.7% |
| Fastify+Undici vs Express+Axios | 69.0% | 68.9% | 68.9% | 70.5% |
| Fastify+Undici vs Fastify+Axios | 67.2% | 66.3% | 69.3% | 70.7% |

---

## 🔄 Interceptor Performance Impact

Overhead = how much slower the average response gets when interceptors are added.

| Configuration | Node 20 | Node 22 | Node 24 | Node 26 | Average |
|---|---|---|---|---|---|
| Express + Axios | 25.0% | 19.2% | 23.7% | 32.5% | 25.1% |
| Fastify + Axios | 20.4% | 19.3% | 20.6% | 20.2% | 20.1% |
| Fastify + Undici | 115.4% | 98.7% | 115.3% | 115.8% | 111.3% |

> **Note:** the Undici interceptor app uses the `nestjs-undici-interceptors` fork, which returns axios-compatible responses (body read and parsed for you), while the plain Undici app uses `nestjs-undici` and parses `body.json()` itself. The Undici "overhead" therefore includes the fork's response adaptation, not only the interceptor.

---

## 📋 Detailed Results

### Average Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 20 | 132.42ms | 125.28ms | 41.10ms | 165.48ms | 150.78ms | 88.56ms |
| Node 22 | 137.90ms | 127.37ms | 42.88ms | 164.39ms | 152.01ms | 85.18ms |
| Node 24 | 100.55ms | 101.92ms | 31.26ms | 124.40ms | 122.89ms | 67.29ms |
| Node 26 | 95.81ms | 96.45ms | 28.28ms | 126.98ms | 115.90ms | 61.03ms |

### Median Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 20 | 118.02ms | 111.47ms | 32.16ms | 145.12ms | 134.55ms | 75.33ms |
| Node 22 | 119.77ms | 110.22ms | 33.92ms | 147.58ms | 136.52ms | 72.98ms |
| Node 24 | 88.44ms | 89.88ms | 24.84ms | 111.93ms | 111.46ms | 59.90ms |
| Node 26 | 83.45ms | 81.05ms | 23.04ms | 110.08ms | 107.09ms | 50.75ms |

### P95 Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 20 | 228.51ms | 216.17ms | 73.54ms | 280.78ms | 267.27ms | 139.81ms |
| Node 22 | 230.40ms | 215.98ms | 75.54ms | 291.19ms | 266.46ms | 133.50ms |
| Node 24 | 176.76ms | 177.46ms | 54.98ms | 221.85ms | 219.84ms | 107.12ms |
| Node 26 | 167.82ms | 170.22ms | 49.10ms | 260.66ms | 204.64ms | 101.15ms |

### P99 Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 20 | 245.87ms | 232.61ms | 78.51ms | 512.05ms | 286.48ms | 148.98ms |
| Node 22 | 400.83ms | 330.54ms | 80.63ms | 310.31ms | 285.15ms | 141.98ms |
| Node 24 | 189.40ms | 188.19ms | 60.74ms | 244.60ms | 232.44ms | 114.26ms |
| Node 26 | 178.15ms | 250.25ms | 55.19ms | 341.50ms | 216.48ms | 106.00ms |

### Throughput (req/s)
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 20 | 485 | 512 | 1552 | 388 | 426 | 723 |
| Node 22 | 466 | 504 | 1489 | 391 | 422 | 751 |
| Node 24 | 638 | 629 | 2038 | 516 | 522 | 950 |
| Node 26 | 669 | 665 | 2250 | 505 | 554 | 1047 |

---

## 🛠️ Test Configuration

- **Load Pattern**: 0 → 50 → 100 virtual users over 70 seconds per configuration
- **Workload**: each request triggers 5 parallel HTTP calls to a mock service
- **Environment**: GitHub Actions ubuntu-latest runner, Docker Compose (one container per app), k6 on the same runner
- **Library build**: nestjs-undici-interceptors@0.5.5 (edcb85f)
- **Test Tool**: k6
- **Packages**: nestjs-undici ^0.2.60, nestjs-undici-interceptors N/A, undici ^7.29.1, @nestjs/axios ^4.0.1, axios ^1.20.0, @nestjs/core ^11.2.6
- **Test Runs**: 2026-09-24
