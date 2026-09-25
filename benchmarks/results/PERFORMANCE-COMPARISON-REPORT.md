# NestJS HTTP Module Performance Comparison Report

## 🎯 Executive Summary

Node.js versions tested: **Node 20, Node 22, Node 24, Node 26**

**Best Performer:** Fastify + Undici averages **34.58ms** across all tested Node.js versions, **67-72% faster** than the Express + Axios baseline.

### 🏆 Key Findings

1. **HTTP client matters most** - Undici is 66-71% faster than Axios on the same framework (Fastify)
2. **Framework matters less** - Fastify is -0.7 to 7.1% faster than Express with the same client (Axios)
3. **Fastest runtime for Undici:** Node.js 26 (15.74ms average)
4. **Interceptors keep Undici ahead** - Fastify + Undici with interceptors is 35-48% faster than the best Axios configuration without interceptors
5. **Error rate:** 0% across all configurations

---

## 📊 Performance at a Glance

### Best Configuration by Node.js Version
| Node Version | Best Config | Avg Response Time | Undici vs Baseline |
|---|---|---|---|
| Node 20 | Fastify + Undici | 41.53ms | 70.0% 🟢 |
| Node 22 | Fastify + Undici | 43.20ms | 67.4% 🟢 |
| Node 24 | Fastify + Undici | 37.84ms | 67.2% 🟢 |
| Node 26 | Fastify + Undici | 15.74ms | 71.7% 🟢 |

### Rankings (average across Node.js versions)
| Rank | Configuration | Avg Response | P95 | Throughput (req/s) |
|---|---|---|---|---|
| 1 | Fastify + Undici | 34.58ms | 60.31ms | 2183 |
| 2 | Fastify + Undici + Interceptor | 64.59ms | 102.33ms | 1194 |
| 3 | Fastify + Axios | 106.44ms | 181.70ms | 684 |
| 4 | Express + Axios | 110.36ms | 189.45ms | 665 |
| 5 | Fastify + Axios + Interceptor | 126.97ms | 223.60ms | 559 |
| 6 | Express + Axios + Interceptor | 138.13ms | 239.90ms | 517 |

---

## 🔍 Key Performance Metrics

### Fastify + Undici vs Express + Axios
- **Average Response Time:** 67-72% faster
- **P95 Response Time:** 66-72% faster
- **Throughput:** 202-250% higher

### Improvements by Node.js Version (average response time)
| Comparison | Node 20 | Node 22 | Node 24 | Node 26 |
|---|---|---|---|---|
| Fastify+Axios vs Express+Axios | 7.1% | 4.2% | -0.7% | 2.0% |
| Fastify+Undici vs Express+Axios | 70.0% | 67.4% | 67.2% | 71.7% |
| Fastify+Undici vs Fastify+Axios | 67.7% | 66.0% | 67.4% | 71.1% |

---

## 🔄 Interceptor Performance Impact

Overhead = how much slower the average response gets when interceptors are added.

| Configuration | Node 20 | Node 22 | Node 24 | Node 26 | Average |
|---|---|---|---|---|---|
| Express + Axios | 23.2% | 24.6% | 22.7% | 36.2% | 26.7% |
| Fastify + Axios | 18.6% | 17.5% | 17.5% | 28.9% | 20.6% |
| Fastify + Undici | 100.1% | 78.4% | 85.1% | 78.8% | 85.6% |

> **Note:** the Undici interceptor app uses the `nestjs-axios-undici` fork, which returns axios-compatible responses (body read and parsed for you), while the plain Undici app uses `nestjs-undici` and parses `body.json()` itself. The Undici "overhead" therefore includes the fork's response adaptation, not only the interceptor.

---

## 📋 Detailed Results

### Average Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 20 | 138.26ms | 128.50ms | 41.53ms | 170.36ms | 152.40ms | 83.09ms |
| Node 22 | 132.43ms | 126.86ms | 43.20ms | 165.08ms | 149.03ms | 77.08ms |
| Node 24 | 115.17ms | 115.93ms | 37.84ms | 141.34ms | 136.24ms | 70.03ms |
| Node 26 | 55.59ms | 54.48ms | 15.74ms | 75.73ms | 70.24ms | 28.15ms |

### Median Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 20 | 122.84ms | 112.37ms | 32.15ms | 148.89ms | 136.57ms | 73.03ms |
| Node 22 | 116.05ms | 110.59ms | 33.99ms | 146.68ms | 134.43ms | 65.59ms |
| Node 24 | 102.61ms | 102.46ms | 30.29ms | 127.24ms | 122.63ms | 60.41ms |
| Node 26 | 49.67ms | 47.84ms | 13.77ms | 65.95ms | 62.26ms | 23.85ms |

### P95 Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 20 | 238.29ms | 219.26ms | 72.89ms | 289.42ms | 268.95ms | 130.38ms |
| Node 22 | 225.03ms | 212.55ms | 75.44ms | 282.83ms | 260.79ms | 120.67ms |
| Node 24 | 199.33ms | 201.55ms | 66.02ms | 250.40ms | 240.68ms | 111.54ms |
| Node 26 | 95.15ms | 93.44ms | 26.89ms | 136.97ms | 123.98ms | 46.71ms |

### P99 Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 20 | 256.07ms | 314.24ms | 78.55ms | 528.90ms | 286.92ms | 139.15ms |
| Node 22 | 264.85ms | 360.28ms | 80.34ms | 418.23ms | 277.61ms | 126.30ms |
| Node 24 | 213.93ms | 215.86ms | 70.98ms | 265.57ms | 256.06ms | 117.19ms |
| Node 26 | 105.68ms | 104.76ms | 32.67ms | 148.97ms | 133.40ms | 51.71ms |

### Throughput (req/s)
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 20 | 464 | 500 | 1536 | 377 | 421 | 770 |
| Node 22 | 485 | 506 | 1478 | 389 | 431 | 830 |
| Node 24 | 557 | 554 | 1685 | 454 | 471 | 913 |
| Node 26 | 1153 | 1176 | 4031 | 847 | 912 | 2264 |

---

## 🛠️ Test Configuration

- **Load Pattern**: 0 → 50 → 100 virtual users over 70 seconds per configuration
- **Workload**: each request triggers 5 parallel HTTP calls to a mock service
- **Environment**: GitHub Actions ubuntu-latest runner, Docker Compose (one container per app), k6 on the same runner
- **Library build**: nestjs-axios-undici@0.6.0 (0ec2451)
- **Test Tool**: k6
- **Packages**: nestjs-undici ^0.2.60, nestjs-axios-undici N/A, undici ^7.29.1, @nestjs/axios ^4.0.1, axios ^1.20.0, @nestjs/core ^11.2.6
- **Test Runs**: 2026-09-25
