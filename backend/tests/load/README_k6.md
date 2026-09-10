# k6 Load Testing for Karaya Bandhu Backend

This directory contains scripts to verify backend performance under high concurrency (1,000 to 1,000,000 users).

## 🚀 Prerequisites

1. **Install k6**:
   - Windows: `winget install gnu.k6` or download from [k6.io](https://k6.io).
   - Mac/Linux: `brew install k6`.

2. **Start the Backend**:
   Ensure your local server is running on `http://localhost:5000`.

## 🏃 Runs

### 1. Test with 1,000 Concurrent Users (VUs)
This simulates a heavy load to ensure basic stability.
```bash
k6 run --scenario load_1k tests/load/load_test.js
```

### 2. Stress Test with 10,000 VUs
This pushes the server to its limits to identify bottlenecks.
```bash
k6 run --scenario stress_10k tests/load/load_test.js
```

### 3. High Throughput (Simulating 1M Users)
Since 1M concurrent users cannot run on a single PC, this test targets high requests-per-second (RPS) to simulate massive total volume.
```bash
k6 run --scenario throughput_1m tests/load/load_test.js
```

## 📊 Thresholds (SLA)
The tests will fail if:
- **95%** of requests take longer than **500ms**.
- More than **1%** of requests fail.

## ⚠️ Important Note
To run more than 500-1000 VUs on a single machine, you may need to:
- Increase file descriptor limits (`ulimit -n 65535`).
- Ensure enough RAM is available (k6 uses ~1-5MB per VU).
- For true 1M user simulation, use [k6 Cloud](https://k6.io/cloud) or a distributed cluster.
