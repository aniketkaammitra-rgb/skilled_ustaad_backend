import { sleep, group } from 'k6';
import { getProviderDashboard, toggleProviderAvailability } from './api_helpers.js';

export const options = {
    scenarios: {
        provider_dashboard_sim: {
            executor: 'constant-arrival-rate',
            rate: 100, // 100 dashboard views/toggles per second
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

    group('Provider Dashboard Operations', function () {
        // 1. View dashboard metrics
        getProviderDashboard(providerToken);
        sleep(0.5);

        // 2. Toggle availability (PATCH)
        toggleProviderAvailability(providerToken, true);
    });

    sleep(1);
}
