# NestJS HTTP Module Performance Comparison Report

## 🎯 Executive Summary

Node.js versions tested: **Node 22, Node 24, Node 26**

**Best Performer:** Fastify + Undici averages **32.26ms** across all tested Node.js versions, **67-72% faster** than the Express + Axios baseline.

### 🏆 Key Findings

1. **HTTP client matters most** - Undici is 66-71% faster than Axios on the same framework (Fastify)
2. **Framework matters less** - Fastify is -0.7 to 4.2% faster than Express with the same client (Axios)
3. **Fastest runtime for Undici:** Node.js 26 (15.74ms average)
4. **Interceptors keep Undici ahead** - Fastify + Undici with interceptors is 39-48% faster than the best Axios configuration without interceptors
5. **Error rate:** 0% across all configurations

---

## 📊 Performance at a Glance

### Best Configuration by Node.js Version
| Node Version | Best Config | Avg Response Time | Undici vs Baseline |
|---|---|---|---|
| Node 22 | Fastify + Undici | 43.20ms | 67.4% 🟢 |
| Node 24 | Fastify + Undici | 37.84ms | 67.2% 🟢 |
| Node 26 | Fastify + Undici | 15.74ms | 71.7% 🟢 |

### Rankings (average across Node.js versions)
| Rank | Configuration | Avg Response | P95 | Throughput (req/s) |
|---|---|---|---|---|
| 1 | Fastify + Undici | 32.26ms | 56.12ms | 2398 |
| 2 | Fastify + Undici + Interceptor | 58.42ms | 92.97ms | 1336 |
| 3 | Fastify + Axios | 99.09ms | 169.18ms | 745 |
| 4 | Express + Axios | 101.07ms | 173.17ms | 732 |
| 5 | Fastify + Axios + Interceptor | 118.50ms | 208.48ms | 605 |
| 6 | Express + Axios + Interceptor | 127.38ms | 223.40ms | 563 |

---

## 🔍 Key Performance Metrics

### Fastify + Undici vs Express + Axios
- **Average Response Time:** 67-72% faster
- **P95 Response Time:** 66-72% faster
- **Throughput:** 202-250% higher

### Improvements by Node.js Version (average response time)
| Comparison | Node 22 | Node 24 | Node 26 |
|---|---|---|---|
| Fastify+Axios vs Express+Axios | 4.2% | -0.7% | 2.0% |
| Fastify+Undici vs Express+Axios | 67.4% | 67.2% | 71.7% |
| Fastify+Undici vs Fastify+Axios | 66.0% | 67.4% | 71.1% |

---

## 🔄 Interceptor Performance Impact

Overhead = how much slower the average response gets when interceptors are added.

| Configuration | Node 22 | Node 24 | Node 26 | Average |
|---|---|---|---|---|
| Express + Axios | 24.6% | 22.7% | 36.2% | 27.9% |
| Fastify + Axios | 17.5% | 17.5% | 28.9% | 21.3% |
| Fastify + Undici | 78.4% | 85.1% | 78.8% | 80.8% |

> **Note:** the Undici interceptor app uses the `nestjs-axios-undici` fork, which returns axios-compatible responses (body read and parsed for you), while the plain Undici app uses `nestjs-undici` and parses `body.json()` itself. The Undici "overhead" therefore includes the fork's response adaptation, not only the interceptor.

---

## 📋 Detailed Results

### Average Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 22 | 132.43ms | 126.86ms | 43.20ms | 165.08ms | 149.03ms | 77.08ms |
| Node 24 | 115.17ms | 115.93ms | 37.84ms | 141.34ms | 136.24ms | 70.03ms |
| Node 26 | 55.59ms | 54.48ms | 15.74ms | 75.73ms | 70.24ms | 28.15ms |

### Median Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 22 | 116.05ms | 110.59ms | 33.99ms | 146.68ms | 134.43ms | 65.59ms |
| Node 24 | 102.61ms | 102.46ms | 30.29ms | 127.24ms | 122.63ms | 60.41ms |
| Node 26 | 49.67ms | 47.84ms | 13.77ms | 65.95ms | 62.26ms | 23.85ms |

### P95 Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 22 | 225.03ms | 212.55ms | 75.44ms | 282.83ms | 260.79ms | 120.67ms |
| Node 24 | 199.33ms | 201.55ms | 66.02ms | 250.40ms | 240.68ms | 111.54ms |
| Node 26 | 95.15ms | 93.44ms | 26.89ms | 136.97ms | 123.98ms | 46.71ms |

### P99 Response Time
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
| Node 22 | 264.85ms | 360.28ms | 80.34ms | 418.23ms | 277.61ms | 126.30ms |
| Node 24 | 213.93ms | 215.86ms | 70.98ms | 265.57ms | 256.06ms | 117.19ms |
| Node 26 | 105.68ms | 104.76ms | 32.67ms | 148.97ms | 133.40ms | 51.71ms |

### Throughput (req/s)
| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici | Express + Axios + Interceptor | Fastify + Axios + Interceptor | Fastify + Undici + Interceptor |
|---|---|---|---|---|---|---|
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
- **Packages**: nestjs-undici 0.2.60, nestjs-axios-undici 0.6.0, undici 7.29.1, @nestjs/axios 4.0.1, axios 1.20.0, @nestjs/core 11.2.6
- **Test Runs**: 2026-09-25
