import { sleep, group } from 'k6';
import { fetchProviderJobs, updateBookingStatus } from './api_helpers.js';

export const options = {
    scenarios: {
        provider_jobs_lifecycle_sim: {
            executor: 'constant-arrival-rate',
            rate: 100, // 100 job lifecycles per second
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
    const bookingId = '69bbc75f1902feb6f6e2c4d5'; // Placeholder

    group('Provider Job Lifecycle', function () {
        // 1. Fetch available/assigned jobs
        fetchProviderJobs(providerToken);
        sleep(0.5);

        // 2. Accept a job
        updateBookingStatus(providerToken, bookingId, 'accepted');
        sleep(0.2);

        // 3. Move to in-progress
        updateBookingStatus(providerToken, bookingId, 'in-progress');
        sleep(0.2);

        // 4. Complete job
        updateBookingStatus(providerToken, bookingId, 'completed');
    });

    sleep(1);
}
