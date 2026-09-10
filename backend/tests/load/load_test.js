import { sleep, group } from 'k6';
import { requestUserOTP, fetchServices, fetchProviderJobs, fetchProviderEarnings, createBooking } from './api_helpers.js';

/* =====================================================
   LOAD TEST CONFIGURATION (SCENARIOS)
===================================================== */
export const options = {
    scenarios: {
        // 1st: 1000 Virtual Users (Load Test)
        load_1k: {
            executor: 'constant-vus',
            vus: 1000,
            duration: '1m',
            startTime: '0s',
        },
        // 2nd: 10,000 Virtual Users (Stress Test)
        // NOTE: Running 10k+ local VUs requires high RAM/CPU and OS tuning (ulimit).
        stress_10k: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '1m', target: 5000 },
                { duration: '2m', target: 10000 },
                { duration: '1m', target: 0 },
            ],
            startTime: '1m',
        },
        // 1 Million Simulated Users (Total Throughput / Soak Test)
        // Simulating 1M concurrent VUs locally is impossible. 
        // We simulate high throughput over time instead.
        throughput_1m: {
          executor: 'constant-arrival-rate',
          rate: 1000, // 1000 requests per second
          timeUnit: '1s',
          duration: '5m',
          preAllocatedVUs: 1000,
          maxVUs: 5000,
          startTime: '5m',
        }
    },
    thresholds: {
        http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
        http_req_failed: ['rate<0.01'],    // Less than 1% errors
    },
};

/* =====================================================
   TEST LOGIC
===================================================== */
export default function () {
    // 1. User browsing services
    group('User Flow', function () {
        fetchServices();
        sleep(1);
        
        requestUserOTP('6239695774');
        sleep(2);
        
        const dummyToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; 
        createBooking(dummyToken);
        sleep(2);
    });

    // 2. Provider checking work
    group('Provider Flow', function () {
        // In a real test, you'd login to get a real token. 
        // Here we simulate a token for endpoint performance check.
        const dummyToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; 
        
        fetchProviderJobs(dummyToken);
        sleep(1);
        
        fetchProviderEarnings(dummyToken);
        sleep(2);
    });
}
