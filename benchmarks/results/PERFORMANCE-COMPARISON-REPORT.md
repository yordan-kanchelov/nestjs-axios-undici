# NestJS HTTP Module Performance Comparison Report

## 🎯 Executive Summary

Node.js versions tested: **Node 22, Node 24, Node 26**

**Best Performer:** Fastify + Undici averages **25.68ms** across all tested Node.js versions, **68-71% faster** than the Express + Axios baseline.

### 🏆 Key Findings

1. **HTTP client matters most** - Undici is 67-70% faster than Axios on the same framework (Fastify)
2. **Framework matters less** - Fastify is -5.5 to 14.7% faster than Express with the same client (Axios)
3. **Fastest runtime for Undici:** Node.js 22 (16.64ms average)
4. **Interceptors keep Undici ahead** - Fastify + Undici with interceptors is 21-46% faster than the best Axios configuration without interceptors
5. **Error rate:** 0% across all configurations

---

## 📊 Performance at a Glance

### Best Configuration by Node.js Version
| Node Version | Best Config | Avg Response Time | Undici vs Baseline |
|---|---|---|---|
| Node 22 | Fastify + Undici | 16.64ms | 71.5% 🟢 |
| Node 24 | Fastify + Undici | 25.24ms | 68.0% 🟢 |
| Node 26 | Fastify + Undici | 35.17ms | 69.0% 🟢 |

### Rankings (average across Node.js versions)
| Rank | Configuration | Avg Response | P95 | Throughput (req/s) |
|---|---|---|---|---|
| 1 | Fastify + Undici | 25.68ms | 44.23ms | 2720 |
| 2 | Fastify + Undici + Interceptor | 50.92ms | 83.54ms | 1474 |
| 3 | Fastify + Axios | 82.27ms | 150.15ms | 874 |
| 4 | Express + Axios | 83.59ms | 156.87ms | 826 |
| 5 | Express + Axios + Interceptor | 107.07ms | 219.38ms | 650 |
| 6 | Fastify + Axios + Interceptor | 108.51ms | 191.71ms | 677 |

---

## 🔍 Key Performance Metrics

### Fastify + Undici vs Express + Axios
- **Average Response Time:** 68-71% faster
- **P95 Response Time:** 69-79% faster
- **Throughput:** 211-248% higher

### Improvements by Node.js Version (average response time)
| Comparison | Node 22 | Node 24 | Node 26 |
|---|---|---|---|
| Fastify+Axios vs Express+Axios | 14.7% | -5.5% | -0.2% |
| Fastify+Undici vs Express+Axios | 71.5% | 68.0% | 69.0% |
| Fastify+Undici vs Fastify+Axios | 66.6% | 69.7% | 69.1% |

---

## 🔄 Interceptor Performance Impact

Overhead = how much slower the average response gets when interceptors are added.

| Configuration | Node 22 | Node 24 | Node 26 | Average |
|---|---|---|---|---|
| Express + Axios | 22.1% | 34.7% | 26.5% | 27.8% |
| Fastify + Axios | 21.5% | 53.3% | 20.8% | 31.8% |
| Fastify + Undici | 60.2% | 148.0% | 80.6% | 96.2% |

> **Note:** the Undici interceptor app uses the `nestjs-axios-undici` fork, which returns axios-compatible responses (body read and parsed for you), while the plain Undici app uses `nestjs-undici` and parses `body.json()` itself. The Undici "overhead" therefore includes the fork's response adaptation, not only the interceptor.

---

## 📋 Detailed Results

### Average Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 22 | 58.35ms | 49.78ms | 16.64ms | 71.27ms | 60.47ms | 26.65ms |
| Node 24 | 78.98ms | 83.32ms | 25.24ms | 106.40ms | 127.72ms | 62.60ms |
| Node 26 | 113.45ms | 113.72ms | 35.17ms | 143.54ms | 137.32ms | 63.50ms |

### Median Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 22 | 44.45ms | 41.65ms | 13.89ms | 61.07ms | 52.88ms | 20.56ms |
| Node 24 | 67.82ms | 68.40ms | 21.50ms | 86.67ms | 118.00ms | 54.39ms |
| Node 26 | 102.20ms | 101.67ms | 29.06ms | 120.90ms | 121.21ms | 53.55ms |

### P95 Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 22 | 135.24ms | 89.34ms | 28.90ms | 132.46ms | 110.25ms | 46.96ms |
| Node 24 | 141.91ms | 166.21ms | 43.46ms | 214.10ms | 222.73ms | 102.09ms |
| Node 26 | 193.45ms | 194.89ms | 60.32ms | 311.57ms | 242.16ms | 101.58ms |

### P99 Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 22 | 201.33ms | 102.82ms | 35.97ms | 143.31ms | 120.36ms | 56.48ms |
| Node 24 | 151.16ms | 240.28ms | 47.82ms | 238.24ms | 238.12ms | 109.05ms |
| Node 26 | 204.47ms | 205.27ms | 65.85ms | 412.90ms | 383.40ms | 105.99ms |

### Throughput (req/s)
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 22 | 1100 | 1288 | 3826 | 900 | 1060 | 2395 |
| Node 24 | 812 | 770 | 2523 | 603 | 502 | 1020 |
| Node 26 | 566 | 564 | 1811 | 447 | 467 | 1006 |

---

## 🛠️ Test Configuration

- **Load Pattern**: 0 → 50 → 100 virtual users over 70 seconds per configuration
- **Workload**: each request triggers 5 parallel HTTP calls to a mock service
- **Environment**: GitHub Actions ubuntu-latest runner, Docker Compose (one container per app), k6 on the same runner
- **Library build**: nestjs-axios-undici@0.6.1 (3c9fcf1)
- **Test Tool**: k6
- **Packages**: nestjs-undici ^0.2.60, nestjs-axios-undici N/A, undici ^7.29.1, @nestjs/axios ^4.0.1, axios ^1.20.0, @nestjs/core ^11.2.6
- **Test Runs**: 2026-09-25
