# NestJS HTTP Module Performance Comparison Report

## 🎯 Executive Summary

Node.js versions tested: **Node 20, Node 22, Node 24, Node 26**

**Best Performer:** Fastify + Undici averages **23.78ms** across all tested Node.js versions, **74-75% faster** than the Express + Axios baseline.

### 🏆 Key Findings

1. **HTTP client matters most** - Undici is 71-74% faster than Axios on the same framework (Fastify)
2. **Framework matters less** - Fastify is -0.1 to 15.2% faster than Express with the same client (Axios)
3. **Fastest runtime for Undici:** Node.js 26 (20.47ms average)
4. **Interceptors keep Undici ahead** - Fastify + Undici with interceptors is 45-51% faster than the best Axios configuration without interceptors
5. **Error rate:** 0% across all configurations

---

## 📊 Performance at a Glance

### Best Configuration by Node.js Version
| Node Version | Best Config | Avg Response Time | Undici vs Baseline |
|---|---|---|---|
| Node 20 | Fastify + Undici | 28.29ms | 74.8% 🟢 |
| Node 22 | Fastify + Undici | 24.49ms | 75.2% 🟢 |
| Node 24 | Fastify + Undici | 21.86ms | 73.5% 🟢 |
| Node 26 | Fastify + Undici | 20.47ms | 74.2% 🟢 |

### Rankings (average across Node.js versions)
| Rank | Configuration | Avg Response | P95 | Throughput (req/s) |
|---|---|---|---|---|
| 1 | Fastify + Undici | 23.78ms | 43.40ms | 2723 |
| 2 | Fastify + Undici + Interceptor | 43.36ms | 76.88ms | 1487 |
| 3 | Fastify + Axios | 85.04ms | 178.91ms | 759 |
| 4 | Express + Axios | 93.23ms | 194.84ms | 702 |
| 5 | Fastify + Axios + Interceptor | 99.16ms | 189.55ms | 650 |
| 6 | Express + Axios + Interceptor | 111.81ms | 222.10ms | 585 |

---

## 🔍 Key Performance Metrics

### Fastify + Undici vs Express + Axios
- **Average Response Time:** 74-75% faster
- **P95 Response Time:** 77-78% faster
- **Throughput:** 275-302% higher

### Improvements by Node.js Version (average response time)
| Comparison | Node 20 | Node 22 | Node 24 | Node 26 |
|---|---|---|---|---|
| Fastify+Axios vs Express+Axios | 13.5% | 15.2% | 3.1% | -0.1% |
| Fastify+Undici vs Express+Axios | 74.8% | 75.2% | 73.5% | 74.2% |
| Fastify+Undici vs Fastify+Axios | 70.9% | 70.8% | 72.6% | 74.2% |

---

## 🔄 Interceptor Performance Impact

Overhead = how much slower the average response gets when interceptors are added.

| Configuration | Node 20 | Node 22 | Node 24 | Node 26 | Average |
|---|---|---|---|---|---|
| Express + Axios | 15.6% | 25.5% | 15.4% | 23.8% | 20.1% |
| Fastify + Axios | 11.9% | 22.9% | 13.7% | 18.7% | 16.8% |
| Fastify + Undici | 70.9% | 87.2% | 78.5% | 96.6% | 83.3% |

> **Note:** the Undici interceptor app uses the `nestjs-undici-interceptors` fork, which returns axios-compatible responses (body read and parsed for you), while the plain Undici app uses `nestjs-undici` and parses `body.json()` itself. The Undici "overhead" therefore includes the fork's response adaptation, not only the interceptor.

---

## 📋 Detailed Results

### Average Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 20 | 112.35ms | 97.14ms | 28.29ms | 129.88ms | 108.70ms | 48.35ms |
| Node 22 | 98.87ms | 83.81ms | 24.49ms | 124.11ms | 103.02ms | 45.83ms |
| Node 24 | 82.50ms | 79.92ms | 21.86ms | 95.21ms | 90.84ms | 39.03ms |
| Node 26 | 79.21ms | 79.27ms | 20.47ms | 98.06ms | 94.09ms | 40.24ms |

### Median Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 20 | 96.56ms | 85.99ms | 24.86ms | 113.11ms | 105.39ms | 47.09ms |
| Node 22 | 81.76ms | 71.25ms | 21.14ms | 110.28ms | 89.24ms | 38.95ms |
| Node 24 | 68.12ms | 68.08ms | 20.13ms | 79.35ms | 74.24ms | 34.35ms |
| Node 26 | 66.04ms | 67.23ms | 18.16ms | 84.16ms | 81.88ms | 35.22ms |

### P95 Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 20 | 229.43ms | 200.34ms | 51.67ms | 257.38ms | 184.61ms | 81.80ms |
| Node 22 | 202.82ms | 175.80ms | 45.17ms | 243.93ms | 190.33ms | 81.97ms |
| Node 24 | 177.39ms | 168.42ms | 39.07ms | 185.34ms | 182.78ms | 70.33ms |
| Node 26 | 169.73ms | 171.09ms | 37.68ms | 201.76ms | 200.48ms | 73.42ms |

### P99 Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 20 | 343.81ms | 296.68ms | 64.58ms | 398.63ms | 290.33ms | 97.70ms |
| Node 22 | 306.80ms | 263.82ms | 56.53ms | 369.52ms | 305.15ms | 102.90ms |
| Node 24 | 243.64ms | 223.76ms | 49.04ms | 257.21ms | 260.17ms | 85.20ms |
| Node 26 | 227.46ms | 228.45ms | 47.25ms | 270.66ms | 268.53ms | 91.53ms |

### Throughput (req/s)
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 20 | 571 | 660 | 2257 | 494 | 590 | 1324 |
| Node 22 | 649 | 765 | 2606 | 517 | 623 | 1396 |
| Node 24 | 777 | 802 | 2915 | 674 | 706 | 1639 |
| Node 26 | 809 | 809 | 3113 | 654 | 682 | 1589 |

---

## 🛠️ Test Configuration

- **Load Pattern**: 0 → 50 → 100 virtual users over 70 seconds per configuration
- **Workload**: each request triggers 5 parallel HTTP calls to a mock service
- **Environment**: Docker containers with isolated networking, one stack per Node.js version
- **Test Tool**: k6
- **Packages**: nestjs-undici ^0.2.60, nestjs-undici-interceptors ^0.5.5, undici ^7.29.1, @nestjs/axios ^4.0.1, axios ^1.20.0, @nestjs/core ^11.2.6
- **Test Runs**: 2026-09-24


---
*Last updated: 2026-09-24 21:53:53 UTC*
