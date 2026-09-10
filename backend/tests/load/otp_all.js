import { sleep, group } from 'k6';
import { generateBookingOTP, generateCompletionOTP, validateBookingOtp, validateCompletionOtp } from './api_helpers.js';

export const options = {
    scenarios: {
        otp_load_sim: {
            executor: 'constant-arrival-rate',
            rate: 200, // 200 OTP operations per second
            timeUnit: '1s',
            duration: '1m', 
            preAllocatedVUs: 400,
            maxVUs: 5000,
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<500'], // Crypto ops should be fast
        http_req_failed: ['rate<0.01'],
    },
};

export default function () {
    const userToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Placeholder
    const bookingId = '69bbc75f1902feb6f6e2c4d5'; // Placeholder
    const otp = '123456';

    group('OTP Flow', function () {
        // 1. Generate OTPs
        generateBookingOTP(userToken, bookingId);
        generateCompletionOTP(userToken, bookingId);
        
        sleep(0.5);

        // 2. Validate OTPs
        validateBookingOtp(userToken, bookingId, otp);
        validateCompletionOtp(userToken, bookingId, otp);
    });

    sleep(1);
}
