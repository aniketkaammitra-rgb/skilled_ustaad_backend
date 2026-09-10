import { sleep } from 'k6';
import { submitFeedback } from './api_helpers.js';

export const options = {
    scenarios: {
        feedback_load_sim: {
            executor: 'constant-arrival-rate',
            rate: 100, // 100 feedback submissions per second
            timeUnit: '1s',
            duration: '1m', 
            preAllocatedVUs: 200,
            maxVUs: 2000,
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<800'], // Aggregations can be slightly slower
        http_req_failed: ['rate<0.01'],
    },
};

export default function () {
    const userToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Placeholder
    const bookingId = '69bbc75f1902feb6f6e2c4d5'; // Placeholder

    submitFeedback(userToken, bookingId, 5, 'Great service!', 'Cleaning');
    sleep(1);
}
