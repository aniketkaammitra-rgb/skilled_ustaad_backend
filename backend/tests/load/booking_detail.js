import { sleep } from 'k6';
import { getBookingDetail } from './api_helpers.js';

export const options = {
    scenarios: {
        booking_detail_sim: {
            executor: 'constant-arrival-rate',
            rate: 200, // 200 detail-page views per second
            timeUnit: '1s',
            duration: '1m', 
            preAllocatedVUs: 400,
            maxVUs: 5000,
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<1000'],
        http_req_failed: ['rate<0.01'],
    },
};

export default function () {
    const userToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Placeholder
    const bookingId = '69bbc75f1902feb6f6e2c4d5'; // Placeholder

    getBookingDetail(userToken, bookingId);
    sleep(1);
}
