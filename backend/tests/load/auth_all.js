import { sleep, group } from 'k6';
import { requestUserOTP, verifyUserOTP, refreshUserToken, logoutUser } from './api_helpers.js';

export const options = {
    scenarios: {
        million_user_sim: {
            executor: 'constant-arrival-rate',
            rate: 100, // 100 new user flows per second (Still 6,000 users/min)
            timeUnit: '1s',
            duration: '1m', // Total 6,000 flows 
            preAllocatedVUs: 200,
            maxVUs: 2000,
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
        http_req_failed: ['rate<0.01'],    // Less than 1% failure rate
    },
};

export default function () {
    // Unique phone number per VU/Iteration to avoid collisions at 1M scale
    const phoneNumber = `+91${9000000000 + (__VU * 1000) + (__ITER % 1000)}`;
    const mockOTP = '1234'; 

    group('Auth Full Flow', function () {
        // 1. Request OTP
        requestUserOTP(phoneNumber);
        sleep(1);

        // 2. Verify OTP 
        // Note: In tests, verify might fail if OTP logic isn't bypassed or mocked.
        // For pure load testing, we check the request throughput.
        const verifyRes = verifyUserOTP(phoneNumber, mockOTP);
        sleep(1);

        if (verifyRes.status === 200) {
            const cookies = verifyRes.cookies;
            const refreshToken = cookies.refreshToken ? cookies.refreshToken[0].value : null;

            if (refreshToken) {
                // 3. Refresh Token
                refreshUserToken(refreshToken);
                sleep(2);
            }
        }

        // 4. Logout
        logoutUser();
        sleep(1);
    });
}
