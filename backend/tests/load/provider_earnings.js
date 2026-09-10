import { sleep, group } from 'k6';
import { fetchProviderEarnings, fetchProviderTransactionHistory, requestWithdrawal } from './api_helpers.js';

export const options = {
    scenarios: {
        provider_earnings_sim: {
            executor: 'constant-arrival-rate',
            rate: 100, // 100 financial cycles per second
            timeUnit: '1s',
            duration: '1m', 
            preAllocatedVUs: 200,
            maxVUs: 2000,
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<1000'],
        http_req_failed: ['rate<0.05'],
    },
};

export default function () {
    const providerToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Placeholder

    group('Provider Financial Operations', function () {
        // 1. View earnings dashboard
        fetchProviderEarnings(providerToken);
        sleep(0.5);

        // 2. View transaction history
        fetchProviderTransactionHistory(providerToken);
        sleep(0.5);

        // 3. Request withdrawal (simulated)
        requestWithdrawal(providerToken, 100, '69bbc75f1902feb6f6e2c4d7');
    });

    sleep(1);
}
