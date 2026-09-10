import { sleep, group } from 'k6';
import { getProviderBookingPaymentDetail, markWorkAsCompleted, confirmPaymentReceived } from './api_helpers.js';

export const options = {
    scenarios: {
        provider_finish_flow_sim: {
            executor: 'constant-arrival-rate',
            rate: 100, // 100 finish flows per second
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

    group('Provider Job Finishing Flow', function () {
        // 1. Get payment and booking details
        getProviderBookingPaymentDetail(providerToken, bookingId);
        sleep(0.5);

        // 2. Mark work as complete
        markWorkAsCompleted(providerToken, bookingId);
        sleep(0.5);

        // 3. Confirm payment receipt
        confirmPaymentReceived(providerToken, bookingId);
    });

    sleep(1);
}
