# NestJS HTTP Module Performance Comparison Report

## 🎯 Executive Summary

Node.js versions tested: **Node 22, Node 24, Node 26**

**Best Performer:** Fastify + Undici averages **26.79ms** across all tested Node.js versions, **68-71% faster** than the Express + Axios baseline.

### 🏆 Key Findings

1. **HTTP client matters most** - Undici is 67-70% faster than Axios on the same framework (Fastify)
2. **Framework matters less** - Fastify is -5.8 to 13.8% faster than Express with the same client (Axios)
3. **Fastest runtime for Undici:** Node.js 22 (16.30ms average)
4. **Interceptors keep Undici ahead** - Fastify + Undici with interceptors is 39-45% faster than the best Axios configuration without interceptors
5. **Error rate:** 0% across all configurations

---

## 📊 Performance at a Glance

### Best Configuration by Node.js Version
| Node Version | Best Config | Avg Response Time | Undici vs Baseline |
|---|---|---|---|
| Node 22 | Fastify + Undici | 16.30ms | 71.5% 🟢 |
| Node 24 | Fastify + Undici | 31.15ms | 67.6% 🟢 |
| Node 26 | Fastify + Undici | 32.91ms | 69.1% 🟢 |

### Rankings (average across Node.js versions)
| Rank | Configuration | Avg Response | P95 | Throughput (req/s) |
|---|---|---|---|---|
| 1 | Fastify + Undici | 26.79ms | 47.01ms | 2628 |
| 2 | Fastify + Undici + Interceptor | 50.44ms | 82.13ms | 1475 |
| 3 | Fastify + Axios | 86.39ms | 152.28ms | 842 |
| 4 | Express + Axios | 86.62ms | 155.18ms | 797 |
| 5 | Fastify + Axios + Interceptor | 105.28ms | 189.79ms | 693 |
| 6 | Express + Axios + Interceptor | 113.16ms | 215.83ms | 624 |

---

## 🔍 Key Performance Metrics

### Fastify + Undici vs Express + Axios
- **Average Response Time:** 68-71% faster
- **P95 Response Time:** 68-74% faster
- **Throughput:** 207-248% higher

### Improvements by Node.js Version (average response time)
| Comparison | Node 22 | Node 24 | Node 26 |
|---|---|---|---|
| Fastify+Axios vs Express+Axios | 13.8% | -5.8% | -1.5% |
| Fastify+Undici vs Express+Axios | 71.5% | 67.6% | 69.1% |
| Fastify+Undici vs Fastify+Axios | 66.9% | 69.4% | 69.5% |

---

## 🔄 Interceptor Performance Impact

Overhead = how much slower the average response gets when interceptors are added.

| Configuration | Node 22 | Node 24 | Node 26 | Average |
|---|---|---|---|---|
| Express + Axios | 22.0% | 35.6% | 30.8% | 29.5% |
| Fastify + Axios | 21.0% | 22.6% | 21.5% | 21.7% |
| Fastify + Undici | 65.4% | 89.3% | 98.7% | 84.5% |

> **Note:** the Undici interceptor app uses the `nestjs-axios-undici` fork, which returns axios-compatible responses (body read and parsed for you), while the plain Undici app uses `nestjs-undici` and parses `body.json()` itself. The Undici "overhead" therefore includes the fork's response adaptation, not only the interceptor.

---

## 📋 Detailed Results

### Average Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 22 | 57.13ms | 49.25ms | 16.30ms | 69.72ms | 59.60ms | 26.97ms |
| Node 24 | 96.28ms | 101.91ms | 31.15ms | 130.52ms | 124.96ms | 58.97ms |
| Node 26 | 106.46ms | 108.02ms | 32.91ms | 139.25ms | 131.27ms | 65.38ms |

### Median Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 22 | 45.61ms | 41.64ms | 13.41ms | 60.07ms | 51.42ms | 21.78ms |
| Node 24 | 82.93ms | 86.28ms | 25.00ms | 118.75ms | 109.37ms | 49.73ms |
| Node 26 | 93.56ms | 94.28ms | 26.01ms | 120.39ms | 118.20ms | 54.69ms |

### P95 Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 22 | 110.40ms | 87.91ms | 28.80ms | 127.03ms | 109.03ms | 47.27ms |
| Node 24 | 170.13ms | 180.75ms | 54.00ms | 233.62ms | 227.69ms | 95.06ms |
| Node 26 | 185.01ms | 188.17ms | 58.22ms | 286.83ms | 232.64ms | 104.06ms |

### P99 Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 22 | 134.81ms | 108.58ms | 34.74ms | 143.61ms | 119.69ms | 52.74ms |
| Node 24 | 180.24ms | 281.28ms | 59.37ms | 247.64ms | 344.20ms | 99.31ms |
| Node 26 | 197.08ms | 199.15ms | 63.06ms | 400.75ms | 247.02ms | 108.87ms |

### Throughput (req/s)
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 22 | 1122 | 1302 | 3905 | 920 | 1076 | 2366 |
| Node 24 | 666 | 630 | 2044 | 492 | 513 | 1083 |
| Node 26 | 603 | 594 | 1935 | 461 | 489 | 978 |

---

## 🛠️ Test Configuration

- **Load Pattern**: 0 → 50 → 100 virtual users over 70 seconds per configuration
- **Workload**: each request triggers 5 parallel HTTP calls to a mock service
- **Environment**: GitHub Actions ubuntu-latest runner, Docker Compose (one container per app), k6 on the same runner
- **Library build**: nestjs-axios-undici@0.6.0 (046f981)
- **Test Tool**: k6
- **Packages**: nestjs-undici 0.2.60, nestjs-axios-undici 0.6.0, undici 7.29.1, @nestjs/axios 4.0.1, axios 1.20.0, @nestjs/core 11.2.6
- **Test Runs**: 2026-09-24
