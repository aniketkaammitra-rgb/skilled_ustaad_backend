import { sleep, group } from 'k6';
import { providerBookingAction } from './api_helpers.js';

export const options = {
    scenarios: {
        provider_action_sim: {
            executor: 'constant-arrival-rate',
            rate: 100, // 100 actions (accept/decline) per second
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

    group('Provider Job Actions', function () {
        // 1. Accept job action
        providerBookingAction(providerToken, bookingId, 'accepted');
        sleep(0.5);

        // 2. Decline job action (on a different bookingId ideally)
        providerBookingAction(providerToken, bookingId, 'declined');
    });

    sleep(1);
}
